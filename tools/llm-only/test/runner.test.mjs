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
import { changedFiles, fetchCommit, seedDraft } from '../seed.mjs';
import { runExperiment, TEAM_ROOT, verifyRun } from '../runner.mjs';
import { createGraphTools, definitionsFor } from '../source-server.mjs';
import { assertOutsideRepository, fetchHistory, git, History, prepareCheckout, Source } from '../source.mjs';

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
  assert.deepEqual(result.edges[0]['x-source-evidence'][0], { path: 'src/page.ts', start_line: 3, end_line: 3 });
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
  const frozen = join(completed.runDir, 'graph.yaml');
  const original = readFileSync(frozen, 'utf8');
  for (const [from, to] of [['Page calls book.', 'Page calls nothing.'], ['start_line: 2', 'start_line: 1']]) {
    const tampered = original.replace(from, to);
    assert.notEqual(tampered, original);
    writeFileSync(frozen, tampered);
    assert.throws(() => verifyRun(completed.runDir), /differ|checksum mismatch/);
  }
  writeFileSync(frozen, original);
  verifyRun(completed.runDir);
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

test('evidence in the wrong shape is rejected on update, naming the entry and the expected keys', () => {
  const { source } = fixture();
  const graph = new DraftGraph(source, schema, target.repo);
  assert.throws(() => graph.update(yaml({ nodes: [{ id: 'page', 'x-source-evidence': [{ file: 'src/page.ts', line: 2 }] }] })), /page: x-source-evidence entries are \{path, start_line, end_line\}/);
  assert.throws(() => graph.update(yaml({ edges: [{ id: 'e', 'x-source-evidence': { path: 'src/page.ts' } }] })), /e: x-source-evidence must be an array/);
  assert.equal(graph.document.nodes.length, 0);
});

test('finalization reports every evidence error with its entry', () => {
  const { source } = fixture();
  const graph = new DraftGraph(source, schema, target.repo);
  const node = (id, path) => ({ id, label: id, kind: 'service', group: 'g', summary: 's', description: 'd', files: [path], 'x-source-evidence': [{ path, start_line: 1, end_line: 1 }] });
  graph.update(yaml({ title: 't', description: 'd', 'x-scope': { included: ['a'], excluded: ['b'] }, groups: [{ id: 'g', label: 'G' }], nodes: [node('page', 'src/page.ts'), node('service', 'src/service.ts')], edges: [{ id: 'e', from: 'page', to: 'service', kind: 'calls', label: 'c', description: 'd', 'x-source-evidence': [{ path: 'src/page.ts', start_line: 3, end_line: 3 }] }] }));
  assert.throws(() => graph.validate(), error => /3 evidence error/.test(error.message) && /page: Evidence was not read/.test(error.message) && /service: Evidence was not read/.test(error.message));
});

test('the wide scope and commit options select their own prompt, group rule and checkout', async () => {
  const outputRoot = mkdtempSync(join(root, 'wide-'));
  const { runDir } = await runExperiment({ outputRoot, prepareOnly: true, scope: 'wide', commit }, { target: { ...target, commit: '0'.repeat(40) } });
  const config = JSON.parse(readFileSync(join(runDir, 'server.json'), 'utf8'));
  assert.equal(config.commit, commit);
  assert.equal(config.groups.min_groups, 6);
  assert.match(readFileSync(join(runDir, 'instructions.md'), 'utf8'), /Cal\.com web product/);
  await assert.rejects(runExperiment({ outputRoot, prepareOnly: true, scope: 'nope' }, { target }), /Unknown scope/);
});

test('a seeded draft carries unchanged evidence, and changed entries must be resubmitted or removed', () => {
  const repo = join(root, 'chain-upstream');
  git(root, ['clone', '--quiet', origin, repo]);
  writeFileSync(join(repo, 'src/page.ts'), '// moved down\nimport { book } from "./service";\nexport function Page(renamed) {\n  return book();\n}\n');
  git(repo, ['add', '.']);
  git(repo, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'next']);
  const next = git(repo, ['rev-parse', 'HEAD']).trim();
  const { source: before } = fixture();
  before.read({ path: 'src/page.ts' }); before.read({ path: 'src/service.ts' });
  const first = new DraftGraph(before, schema, target.repo);
  const node = (id, path) => ({ id, label: id, kind: 'service', group: 'g', summary: 's', description: 'd', files: [path], 'x-source-evidence': [{ path, start_line: 1, end_line: 3 }] });
  first.update(yaml({ title: 't', description: 'd', 'x-scope': { included: ['a'], excluded: ['b'] }, groups: [{ id: 'g', label: 'G' }], nodes: [node('page', 'src/page.ts'), node('service', 'src/service.ts')], edges: [{ id: 'e', from: 'page', to: 'service', kind: 'calls', label: 'c', description: 'd', 'x-source-evidence': [{ path: 'src/page.ts', start_line: 3, end_line: 3 }, { path: 'src/service.ts', start_line: 1, end_line: 1 }] }] }));
  const text = yaml(first.finalize());
  const source = prepareCheckout({ directory: join(mkdtempSync(join(root, 'chain-')), 'calcom'), remote: repo, commit: next });
  fetchCommit(source.root, repo, commit);
  const seed = seedDraft(text, source);
  assert.deepEqual([...seed.pending.keys()], ['page']);
  assert.deepEqual(seed.document.edges[0]['x-source-evidence'][0], { path: 'src/page.ts', start_line: 4, end_line: 4 });
  const graph = new DraftGraph(source, schema, target.repo, { seed });
  assert.throws(() => graph.validate(), /1 entries cite changed code.*page/);
  graph.update(yaml({ nodes: [node('page', 'src/page.ts')] }));
  assert.throws(() => graph.validate(), /page: Evidence was not read/);
  source.read({ path: 'src/page.ts' });
  const updated = graph.finalize();
  assert.equal(updated.commit, next);
  assert.equal(updated['x-variant'], 'llm-only-chained');
  assert.deepEqual(changedFiles(source.root, commit, next), [{ status: 'M', path: 'src/page.ts' }]);
});

test('graphs store locations only; a frozen graph that carries code still checks against the source', () => {
  const { source } = fixture();
  readBoth(source);
  const graph = new DraftGraph(source, schema, target.repo);
  const given = prediction();
  given.edges[0]['x-source-evidence'][0].excerpt = 'invented';
  graph.update(yaml(given));
  assert.doesNotMatch(yaml(graph.finalize()), /excerpt/);
  assert.equal(source.evidence({ path: 'src/page.ts', start_line: 3, end_line: 3, excerpt: '  return book();' }).excerpt, '  return book();');
  assert.throws(() => source.evidence({ path: 'src/page.ts', start_line: 3, end_line: 3, excerpt: 'invented' }), /differs/);
});

test('wide-full membership: directories expand to tracked non-test source files, one cited member file is enough', () => {
  const repo = join(root, 'full-members');
  mkdirSync(join(repo, 'pkg/form/utils'), { recursive: true });
  mkdirSync(join(repo, 'pkg/form/__tests__'), { recursive: true });
  for (const [p, text] of [['pkg/form/Builder.tsx', 'export const Builder = () => null;\n'], ['pkg/form/schema.ts', 'export const schema = 1;\n'],
    ['pkg/form/utils/id.ts', 'export const id = 1;\n'], ['pkg/form/Builder.test.tsx', 'test\n'], ['pkg/form/__tests__/x.ts', 'x\n'],
    ['pkg/form/README.md', 'docs\n'], ['pkg/other.ts', 'export const other = 1;\n']]) writeFileSync(join(repo, p), text);
  git(repo, ['init', '--quiet', '--template=']);
  git(repo, ['add', '.']);
  git(repo, ['-c', 'user.name=F', '-c', 'user.email=f@example.invalid', 'commit', '--quiet', '-m', 'f']);
  const commit = git(repo, ['rev-parse', 'HEAD']).trim();
  const source = new Source(repo, commit);
  source.read({ path: 'pkg/form/Builder.tsx', start_line: 1, end_line: 1 });
  source.read({ path: 'pkg/other.ts', start_line: 1, end_line: 1 });
  const node = (id, files, evidence) => ({ id, label: id, kind: 'component', group: 'g', summary: 's', description: 'd', files,
    'x-source-evidence': evidence.map(path => ({ path, start_line: 1, end_line: 1 })) });
  const draft = (nodes, membership = 'full') => {
    const graph = new DraftGraph(source, schema, target.repo, { membership });
    graph.update(yaml({ title: 'T', description: 'D', 'x-scope': { included: ['form'], excluded: ['none'] }, groups: [{ id: 'g', label: 'G' }], nodes,
      edges: [{ id: 'e', from: nodes[0].id, to: nodes.at(-1).id, kind: 'uses', label: 'uses', description: 'd', 'x-source-evidence': [{ path: 'pkg/other.ts', start_line: 1, end_line: 1 }] }] }));
    return graph;
  };
  const ok = draft([node('form', ['pkg/form/'], ['pkg/form/Builder.tsx']), node('other', ['pkg/other.ts'], ['pkg/other.ts'])]).finalize();
  assert.deepEqual(ok.nodes.find(n => n.id === 'form').files, ['pkg/form/Builder.tsx', 'pkg/form/schema.ts', 'pkg/form/utils/id.ts'], 'tests and docs left out');
  assert.ok(ok['x-source-files'].some(f => f.path === 'pkg/form/schema.ts'));
  // The default (evidence) membership still wants a citation per member file.
  assert.throws(() => draft([node('form', ['pkg/form/Builder.tsx', 'pkg/form/schema.ts'], ['pkg/form/Builder.tsx']), node('other', ['pkg/other.ts'], ['pkg/other.ts'])], 'evidence').finalize(), /membership evidence/);
  for (const [files, evidence, error] of [
    [['pkg/missing.ts'], ['pkg/form/Builder.tsx'], /not a tracked file/],
    [['pkg/nothing/'], ['pkg/form/Builder.tsx'], /no tracked non-test source files/],
    [['pkg/form/schema.ts'], ['pkg/form/Builder.tsx'], /at least one of its member files/],
  ]) assert.throws(() => draft([node('form', files, evidence), node('other', ['pkg/other.ts'], ['pkg/other.ts'])]).finalize(), error);
});

test('wide-full update: the host drops deleted files, follows renames, re-expands directories, and git sees only the range', async () => {
  const repo = join(root, 'full-chain');
  const write = (p, text) => { mkdirSync(join(repo, p.slice(0, p.lastIndexOf('/'))), { recursive: true }); writeFileSync(join(repo, p), text); };
  const commitAll = message => { git(repo, ['add', '-A']); git(repo, ['-c', 'user.name=F', '-c', 'user.email=f@example.invalid', 'commit', '--quiet', '-m', message]); return git(repo, ['rev-parse', 'HEAD']).trim(); };
  mkdirSync(repo);
  git(repo, ['init', '--quiet', '--template=']);
  write('packages/a/x.ts', 'export function x() {\n  return 1;\n}\n');
  write('packages/a/y.ts', 'export const y = 2;\n');
  write('packages/b/z.ts', 'export const z = 3;\n');
  write('packages/b/w.ts', 'export const w = 4;\n');
  write('packages/c/old.ts', 'export function moved() {\n  return "same body";\n}\n');
  write('packages/d/gone.ts', 'export const gone = 5;\n');
  const before = commitAll('first');
  write('packages/a/x.ts', '// header\n// more\nexport function x() {\n  return 1;\n}\n');
  write('packages/a/n.ts', 'export const n = 6;\n');
  write('packages/b/m.ts', 'export const m = 7;\n');
  git(repo, ['mv', 'packages/c/old.ts', 'packages/c/new.ts']);
  rmSync(join(repo, 'packages/d/gone.ts'));
  const middle = commitAll('second: add n and m, rename old, delete gone');
  write('packages/b/z.ts', 'export const z = 33;\n');
  const after = commitAll('third');
  write('packages/b/z.ts', 'export const z = 333; // from the future\n');
  const future = commitAll('future');

  // The previous graph, full membership, at the first commit.
  const src0 = prepareCheckout({ directory: join(mkdtempSync(join(root, 'full-a-')), 'calcom'), remote: repo, commit: before });
  for (const p of ['packages/a/x.ts', 'packages/b/z.ts', 'packages/c/old.ts', 'packages/d/gone.ts']) src0.read({ path: p, start_line: 1 });
  const node = (id, files, evidence) => ({ id, label: id, kind: 'service', group: 'g', summary: 's', description: 'd', files, 'x-source-evidence': evidence });
  const first = new DraftGraph(src0, schema, target.repo, { membership: 'full' });
  first.update(yaml({ title: 't', description: 'd', 'x-scope': { included: ['a'], excluded: ['b'] }, groups: [{ id: 'g', label: 'G' }],
    nodes: [node('alpha', ['packages/a/', 'packages/d/gone.ts'], [{ path: 'packages/a/x.ts', start_line: 1, end_line: 3 }, { path: 'packages/d/gone.ts', start_line: 1, end_line: 1 }]),
      node('beta', ['packages/b/z.ts', 'packages/c/old.ts'], [{ path: 'packages/b/z.ts', start_line: 1, end_line: 1 }, { path: 'packages/c/old.ts', start_line: 1, end_line: 3 }])],
    edges: [{ id: 'e', from: 'alpha', to: 'beta', kind: 'uses', label: 'u', description: 'd', 'x-source-evidence': [{ path: 'packages/d/gone.ts', start_line: 1, end_line: 1 }] }] }));
  const text = yaml(first.finalize());

  const source = prepareCheckout({ directory: join(mkdtempSync(join(root, 'full-b-')), 'calcom'), remote: repo, commit: after });
  fetchHistory(source.root, repo, before, after);
  const seed = seedDraft(text, source, { membership: 'full' });
  const alpha = seed.document.nodes.find(n => n.id === 'alpha');
  const beta = seed.document.nodes.find(n => n.id === 'beta');
  assert.deepEqual(alpha.files, ['packages/a/x.ts', 'packages/a/y.ts', 'packages/a/n.ts'], 'deleted file dropped, new file in a whole directory added');
  assert.deepEqual(beta.files, ['packages/b/z.ts', 'packages/c/new.ts'], 'rename followed; packages/b/ was not wholly owned');
  assert.deepEqual(alpha['x-source-evidence'], [{ path: 'packages/a/x.ts', start_line: 3, end_line: 5 }], 'moved lines remapped, deleted citation gone');
  assert.deepEqual(beta['x-source-evidence'], [{ path: 'packages/c/new.ts', start_line: 1, end_line: 3 }], 'citation follows the rename; changed line gone');
  assert.deepEqual(seed.unassigned, ['packages/b/m.ts']);
  assert.equal(seed.pending.size, 0, 'nothing has to be resubmitted');

  // Finalization still refuses what the host could not repair: the edge lost its only citation.
  const graph = new DraftGraph(source, schema, target.repo, { membership: 'full', seed });
  assert.throws(() => graph.validate(), /e: source evidence is required/);
  source.read({ path: 'packages/a/n.ts', start_line: 1 });
  graph.update(yaml({ edges: [{ id: 'e', from: 'alpha', to: 'beta', kind: 'uses', label: 'u', description: 'd', 'x-source-evidence': [{ path: 'packages/a/n.ts', start_line: 1, end_line: 1 }] }] }));
  const updated = graph.finalize();
  assert.equal(updated.commit, after);

  // History covers before..after and nothing later.
  const history = new History(source.root, before, after);
  assert.deepEqual(history.log().commits.map(c => c.subject), ['third', 'second: add n and m, rename old, delete gone']);
  assert.deepEqual(history.log({ path: 'packages/b/z.ts' }).commits.map(c => c.subject), ['third']);
  assert.match(history.show({ commit: middle.slice(0, 10) }).text, /rename old/);
  assert.match(history.diff({ path: 'packages/b/z.ts' }).text, /\+export const z = 33;/);
  assert.throws(() => history.show({ commit: before }), /Only commits between/);
  assert.throws(() => history.show({ commit: future }), /Only commits between/);
  assert.throws(() => git(source.root, ['cat-file', '-e', future]), 'the future commit was never fetched');
  assert.match(history.blame({ path: 'packages/b/z.ts', start_line: 1, end_line: 1 }).text, /33/);

  // The runner wires it together: history tools, the full update prompt and its lists.
  const outputRoot = mkdtempSync(join(root, 'full-run-'));
  const seedFile = join(root, 'full-seed.yaml');
  writeFileSync(seedFile, text);
  const { runDir } = await runExperiment({ outputRoot, prepareOnly: true, scope: 'wide-full', commit: after, seed: seedFile }, { target: { ...target, remote: repo, commit: '0'.repeat(40) } });
  const config = JSON.parse(readFileSync(join(runDir, 'server.json'), 'utf8'));
  assert.equal(config.seed.history, true);
  assert.equal(config.seed.commits, 2);
  assert.deepEqual(definitionsFor(config).map(d => d.name).filter(n => n.startsWith('git_')), ['git_log', 'git_show', 'git_diff', 'git_blame']);
  assert.equal(definitionsFor({}).some(d => d.name.startsWith('git_')), false);
  const instructions = readFileSync(join(runDir, 'instructions.md'), 'utf8');
  assert.match(instructions, new RegExp(`describes commit ${before}`));
  assert.match(instructions, /## Must be fixed \(1\)\n\n- e: no citation left/);
  assert.match(instructions, /packages\/b\/: m\.ts/);
  assert.match(instructions, /alpha: 1 deleted files dropped; 1 new files added \(packages\/a\/\)/);
  const tools = createGraphTools({ ...config, deadline: Date.now() + 60_000 });
  assert.equal(JSON.parse(tools.call('git_log', {}).content[0].text).total, 2);
  assert.equal(tools.call('git_show', { commit: future }).isError, true);
});
