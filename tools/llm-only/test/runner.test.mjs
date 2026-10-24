import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { after, test } from 'node:test';
import { createAssistantMessageEventStream, getCurrentTools, InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { checkPi, DEFAULT_MODEL, executePi, runPiSession, toolNames } from '../pi.mjs';
import { DraftGraph, parseYaml, yaml } from '../graph.mjs';
import { runExperiment, TEAM_ROOT, verifyRun } from '../runner.mjs';
import { createGraphTools } from '../source-server.mjs';
import { assertOutsideRepository, git, prepareCheckout, Source } from '../source.mjs';

const root = mkdtempSync(join(tmpdir(), 'llm-only-test-'));
after(() => rmSync(root, { recursive: true, force: true }));
const origin = join(root, 'upstream');
mkdirSync(origin);
git(origin, ['init', '--quiet', '--template=']);
mkdirSync(join(origin, 'src'));
writeFileSync(join(origin, 'src/page.ts'), 'import { book } from "./service";\nexport function Page() {\n  return book();\n}\n');
writeFileSync(join(origin, 'src/service.ts'), 'export function book() {\n  return "booked";\n}\n');
writeFileSync(join(origin, 'binary.dat'), Buffer.from([0, 1, 2]));
symlinkSync('/etc/hosts', join(origin, 'outside-link'));
writeFileSync(join(origin, 'AGENTS.md'), 'Fixture instructions: never edit source.');
mkdirSync(join(origin, '.pi/extensions'), { recursive: true });
writeFileSync(join(origin, '.pi/settings.json'), JSON.stringify({ defaultModel: 'bad', customInstructions: 'CONTAMINATION_CANARY' }));
writeFileSync(join(origin, '.pi/extensions/canary.js'), 'throw new Error("UNSAFE_EXTENSION_WAS_LOADED")');
git(origin, ['add', '.']);
git(origin, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
const commit = git(origin, ['rev-parse', 'HEAD']).trim();
const target = { commit, remote: origin, repo: 'fixture/source' };
// A cache can contain prior output. Fetching only committed objects must never copy it.
writeFileSync(join(origin, 'prior-graph.yaml'), 'contamination canary');
const schema = JSON.parse(readFileSync(join(TEAM_ROOT, 'schema/graph.schema.json'), 'utf8'));
function fixture() {
  const runDir = mkdtempSync(join(root, 'run-'));
  const checkout = join(runDir, 'calcom');
  const source = prepareCheckout({ directory: checkout, ...target });
  writeFileSync(join(runDir, 'schema.json'), JSON.stringify(schema));
  const config = { ...target, runDir, checkout, maxTools: 100, maxMinutes: 1, deadline: Date.now() + 60_000, provider: 'openai', model: DEFAULT_MODEL, effort: 'low' };
  writeFileSync(join(runDir, 'server.json'), JSON.stringify(config));
  writeFileSync(join(runDir, 'instructions.md'), 'Construct a graph using only supplied source tools.');
  return { source, config };
}
const prediction = () => ({
  title: 'Fixture graph', description: 'Source-derived test graph.',
  'x-scope': { included: ['Page and booking service'], excluded: ['Binary files'] },
  groups: [{ id: 'booking', label: 'Booking' }],
  nodes: [
    { id: 'page', label: 'Page', kind: 'page', group: 'booking', summary: 'Invokes booking.', description: 'Page invokes the service.', files: ['src/page.ts'], 'x-source-evidence': [{ path: 'src/page.ts', start_line: 2, end_line: 4 }] },
    { id: 'service', label: 'Booking', kind: 'service', group: 'booking', summary: 'Books.', description: 'Returns the booking result.', files: [{ path: 'src/service.ts', lines: [1, 3] }], 'x-source-evidence': [{ path: 'src/service.ts', start_line: 1, end_line: 3 }] },
  ],
  edges: [{ id: 'page-books', from: 'page', to: 'service', kind: 'calls', description: 'Page calls book.', 'x-source-evidence': [{ path: 'src/page.ts', start_line: 3, end_line: 3 }] }],
});
function readBoth(source) {
  source.read({ path: 'src/page.ts', start_line: 1, end_line: 4 });
  source.read({ path: 'src/service.ts', start_line: 1, end_line: 3 });
}
function validDraft() {
  const { source, config } = fixture();
  readBoth(source);
  const graph = new DraftGraph(source, schema, target.repo);
  graph.update(yaml(prediction()));
  return { source, config, graph };
}

test('fresh checkout excludes cache artifacts, symlinks and Git internals', () => {
  const { source, config } = fixture();
  assert(!existsSync(join(config.checkout, 'prior-graph.yaml')));
  assert(!source.files.includes('outside-link'));
  for (const path of ['../upstream/prior-graph.yaml', '/etc/hosts', '.git/config', 'outside-link', 'prior-graph.yaml', 'src/../AGENTS.md']) {
    assert.throws(() => source.read({ path }));
  }
  assert.throws(() => source.read({ path: 'binary.dat' }), /Binary/);
  assert.throws(() => prepareCheckout({ directory: config.checkout, ...target }), /exist/i);
});
test('rejects placing experimental runs inside any team checkout', () => {
  assert.throws(() => assertOutsideRepository(TEAM_ROOT, TEAM_ROOT), /outside/);
  assert.throws(() => assertOutsideRepository(origin, TEAM_ROOT), /existing Git/);
});
test('source search is literal and paginated, including directory prefixes', () => {
  const { source } = fixture();
  assert.equal(source.search({ query: 'book', prefix: 'src', limit: 1 }).matches.length, 1);
  assert(source.search({ query: 'book', limit: 1 }).next_offset);
  assert.equal(source.search({ query: 'book()', prefix: 'src/service.ts' }).matches[0].path, 'src/service.ts');
  assert.equal(source.search({ query: '.*' }).total, 0);
  assert.throws(() => source.search({ query: 'book', prefix: '../' }));
  assert.equal(source.list({ contains: 'service' }).total, 1);
});
test('read ranges, gaps, modified paths and the pin are enforced', () => {
  const { source, config } = fixture();
  assert.throws(() => new Source(config.checkout, 'a'.repeat(40)), /pin/);
  assert.throws(() => source.read({ path: 'src/page.ts', start_line: 1, end_line: 201 }), /200/);
  source.read({ path: 'src/page.ts', start_line: 1, end_line: 1 });
  source.read({ path: 'src/page.ts', start_line: 3, end_line: 4 });
  assert.throws(() => source.evidence({ path: 'src/page.ts', start_line: 1, end_line: 4 }), /not read/);
  source.read({ path: 'src/page.ts', start_line: 2, end_line: 2 });
  assert.equal(source.evidence({ path: 'src/page.ts', start_line: 1, end_line: 4 }).end_line, 4);
  rmSync(join(config.checkout, 'src/page.ts'));
  symlinkSync('/etc/hosts', join(config.checkout, 'src/page.ts'));
  assert.throws(() => source.contents('src/page.ts'), /Symbolic/);
  assert.throws(() => source.assertClean(), /unchanged/);
});
test('incremental graph validation adds exact evidence and hashes without changing topology', () => {
  const { graph } = validDraft();
  const result = graph.finalize();
  assert.equal(result.nodes.length, 2);
  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0]['x-source-evidence'][0].excerpt, '  return book();');
  assert.equal(result.edges[0].evidence[0].line, 3);
  assert.equal(result.nodes[0].provenance, 'inferred');
  assert.equal(result['x-source-files'].length, 2);
  assert.equal(result['x-source-files'][0].sha256.length, 64);
  assert.deepEqual(parseYaml(yaml(result)), result);
  assert.throws(() => graph.update('title: changed'), /frozen/);
});
test('schema, graph consistency and source errors remain repairable', async t => {
  const mutations = [
    ['unknown field', g => { g.nodes[0].invented = true; }, /additionalProperties/],
    ['bad kind', g => { g.nodes[0].kind = 'ui_component'; }, /enum/],
    ['missing endpoint', g => { g.edges[0].to = 'missing'; }, /dangling/],
    ['global duplicate ID', g => { g.groups[0].id = 'page'; }, /Duplicate/],
    ['parent cycle', g => { g.groups[0].parent = 'booking'; }, /cycle/],
    ['missing parent', g => { g.groups[0].parent = 'missing'; }, /Unknown parent/],
    ['missing member evidence', g => { g.nodes[0].files.push('AGENTS.md'); }, /membership evidence/],
    ['false excerpt', g => { g.edges[0]['x-source-evidence'][0].excerpt = 'invented'; }, /differs/],
    ['source range', g => { g.edges[0]['x-source-evidence'][0].end_line = 999; }, /range/],
    ['source provenance', g => { g.nodes[0].provenance = 'manual'; }, /inferred/],
    ['standard citation mismatch', g => { g.edges[0].evidence = [{ file: 'src/service.ts', line: 1 }]; }, /standard evidence/],
    ['unknown group', g => { g.nodes[0].group = 'missing'; }, /unknown group/],
    ['duplicate edge', g => { g.edges.push({ ...g.edges[0], id: 'repeat' }); }, /duplicate relationship/],
  ];
  for (const [name, mutate, expected] of mutations) await t.test(name, () => {
    const { source } = fixture();
    readBoth(source);
    const graph = new DraftGraph(source, schema, target.repo);
    const bad = prediction();
    mutate(bad);
    graph.update(yaml(bad));
    assert.throws(() => graph.finalize(), expected);
    assert.equal(graph.frozen, false);
  });
});
test('citations require actual reads, not searches, and validation can be repaired', () => {
  const { source } = fixture();
  const graph = new DraftGraph(source, schema, target.repo);
  graph.update(yaml(prediction()));
  source.search({ query: 'book' });
  assert.throws(() => graph.finalize(), /not read/);
  readBoth(source);
  graph.update('title: Repaired');
  assert.equal(graph.finalize().title, 'Repaired');
});
test('malformed YAML, aliases, duplicate batch IDs and pin changes are rejected atomically', () => {
  const { graph } = validDraft();
  for (const input of ['title: one\ntitle: two', 'title: &x hello\ndescription: *x', 'commit: bad', 'nodes: [{id: page}, {id: page}]', 'layout: {}']) {
    assert.throws(() => graph.update(input));
  }
  assert.equal(graph.document.title, 'Fixture graph');
});
test('MCP tools freeze output and enforce the tool-call budget', () => {
  const { config } = fixture();
  const tools = createGraphTools(config);
  const call = (name, args) => tools.call(name, args);
  assert(call('read_source', { path: '../prior-graph.yaml' }).isError);
  call('read_source', { path: 'src/page.ts' });
  call('read_source', { path: 'src/service.ts' });
  assert.equal(call('update_graph', { yaml: yaml(prediction()) }).isError, false);
  assert.equal(call('finalize_graph').isError, false);
  assert.equal(verifyRun(config.runDir).nodes, 2);
  assert(call('update_graph', { yaml: 'title: changed' }).isError);
  const limited = fixture();
  const oneCall = createGraphTools({ ...limited.config, maxTools: 1 });
  assert.equal(oneCall.call('list_source').isError, false);
  assert(oneCall.call('list_source').isError);
  assert(existsSync(join(limited.config.runDir, 'limit.json')));
  const timedOut = createGraphTools({ ...fixture().config, deadline: 0 });
  assert(timedOut.call('list_source').isError);
});
test('stdio MCP initializes and returns only the six allowlisted tools', async () => {
  const { config } = fixture();
  const child = spawn(process.execPath, [resolve('source-server.mjs'), join(config.runDir, 'server.json')], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'read_source', arguments: { path: 'src/page.ts', start_line: 2, end_line: 3 } } },
  ].map(message => JSON.stringify(message)).join('\n') + '\n');
  const responses = [];
  for await (const line of createInterface({ input: child.stdout })) responses.push(JSON.parse(line));
  assert.equal(responses.length, 3);
  assert.equal(responses[1].result.tools.length, 6);
  assert.equal(responses[2].result.isError, false);
});
test('orchestration: fresh prepare, full mock generation, repeat isolation and tamper detection', async () => {
  const outputRoot = join(root, 'experiments');
  const prepared = await runExperiment({ outputRoot, source: origin, prepareOnly: true }, { target });
  assert.equal(prepared.metadata.status, 'prepared');
  assert(!existsSync(join(prepared.runDir, 'graph.yaml')));
  const execute = async config => {
    const tools = createGraphTools(config);
    assert.equal(tools.graph.document.nodes.length, 0);
    tools.call('read_source', { path: 'src/page.ts' });
    tools.call('read_source', { path: 'src/service.ts' });
    tools.call('update_graph', { yaml: yaml(prediction()) });
    assert.equal(tools.call('finalize_graph').isError, false);
    return { code: 0, stopReason: null, usage: { input_tokens: 10, output_tokens: 20 } };
  };
  const completed = await runExperiment({ outputRoot, source: origin, model: 'test-model' }, { target, checkPi: () => 'mock', execute });
  assert.equal(completed.metadata.status, 'completed');
  assert.equal(completed.metadata.usage.output_tokens, 20);
  assert.equal(completed.metadata.cost_usd, null);
  const second = await runExperiment({ outputRoot, source: origin, model: 'test-model' }, { target, checkPi: () => 'mock', execute });
  assert.notEqual(second.runDir, completed.runDir);
  assert.equal(second.metadata.graph_sha256, completed.metadata.graph_sha256);
  const reportPath = join(second.runDir, 'validation.json');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  writeFileSync(reportPath, JSON.stringify({ ...report, nodes: 500 }));
  assert.throws(() => verifyRun(second.runDir), /report differs/);
  writeFileSync(join(completed.runDir, 'graph.yaml'), readFileSync(join(completed.runDir, 'graph.yaml'), 'utf8').replace('return book();', 'return fake();'));
  assert.throws(() => verifyRun(completed.runDir), /differs/);
});
test('failed runs preserve metadata and drafts but never claim a prediction', async () => {
  let failure;
  try {
    await runExperiment({ outputRoot: join(root, 'failed'), source: origin, model: 'test' }, {
      target, checkPi: () => 'mock', execute: async config => {
        createGraphTools(config).call('update_graph', { yaml: 'title: Incomplete' });
        return { code: 1, lastError: 'Authentication unavailable', usage: null };
      },
    });
  } catch (error) { failure = error; }
  assert.match(failure.message, /Authentication unavailable/);
  const record = JSON.parse(readFileSync(join(failure.runDir, 'run.json'), 'utf8'));
  assert.equal(record.status, 'failed');
  assert.equal(record.graph_sha256, null);
  assert(existsSync(join(failure.runDir, 'draft.partial.yaml')));
  assert(!existsSync(join(failure.runDir, 'graph.yaml')));
});
test('Pi subprocess records events/usage and enforces host timeout', async () => {
  const { config } = fixture();
  const fake = join(root, 'fake-pi.mjs');
  writeFileSync(fake, `console.log(JSON.stringify({type:'usage',usage:{input:12,output:4},responses:1}));\n`);
  const result = await executePi(config, undefined, fake);
  assert.equal(result.code, 0);
  assert.equal(result.usage.output, 4);
  const hang = join(root, 'hang-pi.mjs');
  writeFileSync(hang, `process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);\n`);
  const timeout = await executePi({ ...fixture().config, deadline: Date.now() + 100 }, undefined, hang);
  assert.equal(timeout.stopReason, 'Time limit reached');
  assert.equal(timeout.signal, 'SIGKILL');
  const finishing = fixture();
  const slowExit = join(root, 'finished-pi.mjs');
  writeFileSync(slowExit, `import {writeFileSync} from 'node:fs'; writeFileSync('..' + '/validation.json', '{}'); setTimeout(() => process.exit(0), 800);\n`);
  const finished = await executePi({ ...finishing.config, deadline: Date.now() + 300 }, undefined, slowExit);
  assert.equal(finished.code, 0);
  assert.equal(finished.stopReason, null, 'a frozen graph gets time to flush logs after the generation deadline');
});
test('truncated tool logs do not mask the original run failure', async () => {
  let failure;
  try {
    await runExperiment({ outputRoot: join(root, 'truncated'), source: origin, model: 'test' }, {
      target, checkPi: () => 'mock', execute: async config => {
        writeFileSync(join(config.runDir, 'tools.jsonl'), '{"event":');
        throw new Error('Process interrupted');
      },
    });
  } catch (error) { failure = error; }
  assert.match(failure.message, /Process interrupted/);
  const record = JSON.parse(readFileSync(join(failure.runDir, 'run.json'), 'utf8'));
  assert.equal(record.status, 'failed');
  assert.equal(record.incomplete_tool_transcript, true);
});

async function modelFixture(steps) {
  const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
  await runtime.setRuntimeApiKey('openai', 'test-credential-never-send');
  const requests = [];
  runtime.streamSimple = (model, context, options) => {
    const index = requests.length;
    requests.push(structuredClone(context));
    assert.equal(options.maxRetries, 0);
    assert.equal(options.reasoning, 'low');
    const stream = createAssistantMessageEventStream();
    queueMicrotask(() => {
      let content;
      try { content = typeof steps[index] === 'function' ? steps[index](context) : steps[index]; }
      catch (error) { content = [{ type: 'text', text: error.stack }]; }
      const message = {
        role: 'assistant', content: content ?? [{ type: 'text', text: 'Fixture stopped without finalizing.' }],
        api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(),
        usage: { input: 10, output: 5, cacheRead: 3, cacheWrite: 0, totalTokens: 18, reasoning: 2, cost: { input: 0.01, output: 0.02, cacheRead: 0.003, cacheWrite: 0, total: 0.033 } },
        stopReason: content?.some(item => item.type === 'toolCall') ? 'toolUse' : 'stop',
      };
      stream.push({ type: 'start', partial: message });
      stream.push({ type: 'done', reason: message.stopReason, message });
      stream.end();
    });
    return stream;
  };
  return { runtime, requests };
}
const call = (name, args = {}) => ({ type: 'toolCall', id: `${name}-${Math.random()}`, name, arguments: args });

test('real Pi session isolates resources, repairs rejected evidence and freezes a valid graph', async () => {
  const { config } = fixture();
  const { runtime, requests } = await modelFixture([
    [call('read_source', { path: '../prior-graph.yaml' })],
    [call('update_graph', { yaml: yaml(prediction()) }), call('finalize_graph')],
    [call('read_source', { path: 'src/page.ts' }), call('read_source', { path: 'src/service.ts' })],
    [call('finalize_graph')],
  ]);
  const events = [];
  const result = await runPiSession(config, event => events.push(structuredClone(event)), runtime);
  assert.equal(result.code, 0, JSON.stringify(result));
  assert.equal(result.stopReason, 'Graph frozen; stopped after finalization');
  assert.equal(requests.length, 4, 'finalization must not make another model request');
  assert.deepEqual(getCurrentTools(requests[0].messages).map(tool => tool.name).sort(), [...toolNames].sort());
  assert(!JSON.stringify(requests).includes('CONTAMINATION_CANARY'));
  assert(!JSON.stringify(requests).includes('Fixture instructions'));
  assert.equal(requests[0].messages.filter(message => message.role === 'user').length, 1);
  assert(requests[2].messages.some(message => message.role === 'toolResult' && message.toolName === 'finalize_graph' && message.isError));
  assert.equal(result.usage.input, 40);
  assert.equal(result.usage.reasoning, 8);
  assert.equal(result.usage.totalTokens, 72);
  assert.equal(result.usage.cost.total, 0.132);
  assert.equal(verifyRun(config.runDir).nodes, 2);
  assert(!readFileSync(join(config.runDir, 'pi-session.json'), 'utf8').includes('test-credential'));
  assert(events.some(event => event.type === 'run_completed'));
});

test('Pi checks the exact Astra model and effort without silently falling back', async () => {
  const { runtime } = await modelFixture([]);
  assert.equal((await checkPi({ model: DEFAULT_MODEL, effort: 'low' }, runtime)).api, 'openai-responses');
  await assert.rejects(checkPi({ model: 'not-a-model' }, runtime), /no fallback/);
  await assert.rejects(checkPi({ model: DEFAULT_MODEL, effort: 'off' }, runtime), /does not support/);
  runtime.getAuth = async () => undefined;
  await assert.rejects(checkPi({}, runtime), /credentials.*openai\/gpt-6-astra/);
});

test('real Pi session counts failed tool attempts and blocks unexpected tools', async () => {
  const limited = fixture();
  const fake = await modelFixture([[call('read_source', { path: '../bad' })], [call('list_source')]]);
  const result = await runPiSession({ ...limited.config, maxTools: 1 }, undefined, fake.runtime);
  assert.equal(result.code, 1);
  assert.equal(result.stopReason, 'Tool-call limit reached', JSON.stringify(result));
  assert(!existsSync(join(limited.config.runDir, 'graph.yaml')));
  const unexpected = await modelFixture([[call('bash', { command: 'touch contamination' })]]);
  const other = fixture();
  const blocked = await runPiSession(other.config, undefined, unexpected.runtime);
  assert.match(blocked.stopReason, /Unexpected tool request: bash/);
  assert(!existsSync(join(other.config.checkout, 'contamination')));
});

test('actual Pi worker reports missing auth without a model fallback', async () => {
  const { config } = fixture();
  // An explicit nonexistent credential path makes this deterministic even on authenticated machines.
  const invalid = { ...config, authFile: join(config.runDir, 'missing-auth.json') };
  writeFileSync(join(config.runDir, 'server.json'), JSON.stringify(invalid));
  const result = await executePi(invalid);
  assert.equal(result.code, 1);
  assert.match(result.lastError, /auth file does not exist/);
  assert(!existsSync(join(config.runDir, 'graph.yaml')));
});

test('Pi orchestration records Astra selection, actual SDK usage and estimated cost', async () => {
  const { runtime } = await modelFixture([[
    call('read_source', { path: 'src/page.ts' }),
    call('read_source', { path: 'src/service.ts' }),
    call('update_graph', { yaml: yaml(prediction()) }),
    call('finalize_graph'),
  ]]);
  const result = await runExperiment({ outputRoot: join(root, 'pi-complete'), source: origin, effort: 'low' }, {
    target, checkPi: config => checkPi(config, runtime),
    execute: config => runPiSession(config, undefined, runtime),
  });
  assert.equal(result.metadata.backend, 'pi-sdk');
  assert.equal(result.metadata.provider, 'openai');
  assert.equal(result.metadata.model, 'gpt-6-astra');
  assert.equal(result.metadata.status, 'completed');
  assert.equal(result.metadata.estimated_cost_usd, 0.033);
  assert.equal(result.metadata.cost_usd, null);
  assert.equal(result.metadata.execution.toolAttempts, 4);
  assert.equal(result.metadata.inspection.tool_calls, 4);
  assert.equal(verifyRun(result.runDir).nodes, 2);
});
