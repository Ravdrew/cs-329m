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
import { assertOutsideRepository, git, prepareCheckout, Source, sha256 } from '../source.mjs';

import { prepareStatic, StaticGraph, canonical } from '../static.mjs';

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
const raw = { format: 'codegraph-structural-export-v1', repo: target.repo, commit, codegraph_version: 'fixture', scope: 'Page and booking',
  file_components: { 'src/page.ts': 'OLD_COMPONENT_DO_NOT_SEED' },
  nodes: [
    {id:'file:page',kind:'file',name:'page.ts',file_path:'src/page.ts',start_line:1,end_line:5},
    {id:'fn:page',kind:'function',name:'Page',file_path:'src/page.ts',start_line:2,end_line:4},
    {id:'file:service',kind:'file',name:'service.ts',file_path:'src/service.ts',start_line:1,end_line:4},
    {id:'fn:book',kind:'function',name:'book',file_path:'src/service.ts',start_line:1,end_line:3},
  ], edges: [
    {id:1,source:'file:page',target:'fn:page',kind:'contains'},
    {id:2,source:'file:service',target:'fn:book',kind:'contains'},
    {id:3,source:'fn:page',target:'fn:book',kind:'calls',line:3,metadata:'{"confidence":0.2}'},
    {id:4,source:'file:page',target:'file:service',kind:'imports',line:1},
    {id:5,source:'fn:page',target:'fn:book',kind:'references',line:3},
    {id:6,source:'fn:book',target:'file:service',kind:'references',line:1},
  ] };
const staticGraph = join(root, 'raw.json');
writeFileSync(staticGraph, canonical(raw));
const schema = JSON.parse(readFileSync(join(TEAM_ROOT, 'schema/graph.schema.json'), 'utf8'));
function fixture() {
  const runDir = mkdtempSync(join(root, 'run-'));
  const checkout = join(runDir, 'calcom');
  const source = prepareCheckout({ directory: checkout, ...target });
  writeFileSync(join(runDir, 'schema.json'), JSON.stringify(schema));
  const input = canonical(prepareStatic(staticGraph, source, target.repo));
  writeFileSync(join(runDir, 'static-input.json'), input);
  const config = { staticInputHash: sha256(input), ...target, runDir, checkout, maxTools: 100, maxMinutes: 1, deadline: Date.now() + 60_000, provider: 'openai', model: DEFAULT_MODEL, effort: 'low' };
  writeFileSync(join(runDir, 'server.json'), JSON.stringify(config));
  writeFileSync(join(runDir, 'instructions.md'), 'Construct a graph using only supplied source tools.');
  return { source, config };
}
const prediction = () => ({
  title: 'Fixture graph', description: 'Source-derived test graph.',
  'x-scope': { included: ['Page and booking service'], excluded: ['Binary files'] },
  groups: [{ id: 'booking', label: 'Booking' }],
  nodes: [
    { id: 'page', label: 'Page', kind: 'page', group: 'booking', summary: 'Invokes booking.', description: 'Page invokes the service.', file_ids: ['F0001'], 'x-source-evidence': [{ path: 'src/page.ts', start_line: 2, end_line: 4 }] },
    { id: 'service', label: 'Booking', kind: 'service', group: 'booking', summary: 'Books.', description: 'Returns the booking result.', file_prefixes: ['src/service.ts'], 'x-source-evidence': [{ path: 'src/service.ts', start_line: 1, end_line: 3 }] },
  ],
});
function readBoth(source) {
  source.read({ path: 'src/page.ts', start_line: 1, end_line: 4 });
  source.read({ path: 'src/service.ts', start_line: 1, end_line: 3 });
}
function validDraft() {
  const { source, config } = fixture();
  readBoth(source);
  const graph = new DraftGraph(source, schema, target.repo, new StaticGraph(prepareStatic(staticGraph, source, target.repo)), sha256(canonical(prepareStatic(staticGraph, source, target.repo))));
  graph.update(yaml(prediction()));
  return { source, config, graph };
}

test('raw preparation strips previous grouping, normalizes file EOF and rejects stale/dangling input', () => {
  const { source } = fixture();
  const input = prepareStatic(staticGraph, source, target.repo);
  assert(!canonical(input).includes('OLD_COMPONENT_DO_NOT_SEED'));
  assert(!('file_components' in input));
  const file = input.nodes.find(n => n.id === 'file:page');
  assert.equal(file.raw_end_line, 5);
  assert.equal(file.end_line, 4);
  for (const [change, expected] of [
    [r => r.commit = '0'.repeat(40), /commit/],
    [r => r.edges[0].target = 'missing', /Dangling/],
    [r => r.edges[0].kind = 'made-up', /Unknown/],
    [r => r.nodes[1].end_line = 900, /range/],
    [r => r.edges[2].metadata = '{"confidence":2}', /confidence/],
  ]) {
    const bad = structuredClone(raw); change(bad);
    const path = join(root, 'bad-input.json'); writeFileSync(path, canonical(bad));
    assert.throws(() => prepareStatic(path, source, target.repo), expected);
  }
});

test('component edges aggregate static relationships with exact conservation and no confidence pruning', () => {
  const { graph } = validDraft();
  const output = graph.finalize();
  assert.equal(output.nodes.length, 2);
  assert.equal(output.edges.length, 2);
  const uses = output.edges.find(e => e.kind === 'uses');
  const calls = output.edges.find(e => e.kind === 'calls');
  assert.deepEqual(uses['x-codegraph'].raw_kinds, { imports: 1, references: 1 });
  assert.equal(uses['x-codegraph'].raw_edge_count, 2);
  assert.equal(calls['x-codegraph'].low_confidence_edges, 1);
  assert.equal(calls.evidence[0].line, 3);
  assert.deepEqual(graph.aggregation.counts, { total: 6, containment: 2, unassigned: 0, internal: 1, aggregated: 3 });
  assert.deepEqual(Object.values(graph.aggregation.edges).flat().sort(), [3, 4, 5]);
  assert.equal(Object.keys(graph.membership).length, 4);
  assert(output.nodes.every(n => n.provenance === 'inferred'));
  assert(output.edges.every(e => e.provenance === 'extracted'));
  assert.deepEqual(parseYaml(yaml(output)), output);
  const again = validDraft().graph.finalize();
  assert.deepEqual(again, output);
});

test('Astra owns membership, may split a shared file, and cannot author or prune edges', () => {
  const { graph } = validDraft();
  const original = yaml(graph.document);
  for (const patch of ['edges: []', 'nodes: [{id: page, files: [src/page.ts]}]',
    'nodes: [{id: third, file_ids: [F0001]}]', 'nodes: [{id: third, file_ids: [unknown]}]',
    'nodes: [{id: third, node_ids: [unknown]}]', 'nodes: [{id: third, file_prefixes: [src/*]}]']) {
    assert.throws(() => graph.update(patch));
    assert.equal(yaml(graph.document), original);
  }
  const service = prediction().nodes[1];
  service.node_ids = ['fn:page'];
  service['x-source-evidence'].push({ path: 'src/page.ts', start_line: 2, end_line: 4 });
  graph.update(yaml({ nodes: [service] }));
  assert.equal(graph.ownership().get('fn:page'), 'service');
  assert.throws(() => graph.update(yaml({ nodes: [{ id: 'third', node_ids: ['fn:page'] }] })), /multiple explicit/);
  const output = graph.finalize();
  assert.equal(output.edges.length, 1);
  assert.equal(output.edges[0].kind, 'uses');
  assert.equal(graph.aggregation.counts.internal, 3);
  const member = output.nodes.find(n => n.id === 'service');
  assert.deepEqual(member.files[0], { path: 'src/page.ts', lines: [2, 4] });
});

test('incomplete memberships, empty components, bad groups and invented summaries remain repairable', async t => {
  for (const [name, change, expected] of [
    ['unassigned', d => delete d.nodes[0].file_ids, /unassigned/],
    ['empty', d => d.nodes.push({ id: 'empty', label: 'Empty', kind: 'other', summary: 'Empty', description: 'Empty' }), /empty component/],
    ['missing group', d => d.nodes[0].group = 'missing', /unknown group/],
    ['cycle', d => d.groups[0].parent = 'booking', /cyclic/],
    ['duplicate', d => d.groups[0].id = 'page', /Duplicate/],
    ['bad kind', d => d.nodes[0].kind = 'made-up', /enum/],
    ['no summary', d => delete d.nodes[0].summary, /summary/],
    ['wrong evidence', d => d.nodes[0]['x-source-evidence'] = d.nodes[1]['x-source-evidence'], /overlap/],
    ['fake excerpt', d => d.nodes[0]['x-source-evidence'][0].excerpt = 'invented', /differs/],
  ]) await t.test(name, () => {
    const { graph } = validDraft();
    const patch = prediction(); change(patch);
    graph.update(yaml(patch));
    assert.throws(() => graph.finalize(), expected);
    assert.equal(graph.frozen, false);
  });
});

test('audit replay detects sidecar and static input tampering; all tools close after freeze', () => {
  const { config } = fixture();
  const tools = createGraphTools(config);
  tools.call('read_source', { path: 'src/page.ts' });
  tools.call('read_source', { path: 'src/service.ts' });
  assert(!tools.call('update_graph', { yaml: yaml(prediction()) }).isError);
  assert(!tools.call('finalize_graph').isError);
  assert(tools.call('graph_overview').isError);
  assert.equal(verifyRun(config.runDir).nodes, 2);
  for (const name of ['membership.json', 'aggregation.json', 'components.yaml', 'graph.json', 'static-input.json']) {
    const path = join(config.runDir, name), before = readFileSync(path);
    writeFileSync(path, name === 'static-input.json' ? '{}' : 'changed');
    assert.throws(() => verifyRun(config.runDir), /differs|checksum/);
    writeFileSync(path, before);
  }
});

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
test('citations require actual reads, not searches, and validation can be repaired', () => {
  const { source } = fixture();
  const graph = new DraftGraph(source, schema, target.repo, new StaticGraph(prepareStatic(staticGraph, source, target.repo)), sha256(canonical(prepareStatic(staticGraph, source, target.repo))));
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
test('Component tools freeze output and enforce the tool-call budget', () => {
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
test('orchestration: fresh prepare, full mock generation, repeat isolation and tamper detection', async () => {
  const outputRoot = join(root, 'experiments');
  const prepared = await runExperiment({ staticGraph, outputRoot, source: origin, prepareOnly: true }, { target });
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
  const completed = await runExperiment({ staticGraph, outputRoot, source: origin, model: 'test-model' }, { target, checkPi: () => 'mock', execute });
  assert.equal(completed.metadata.status, 'completed');
  assert.equal(completed.metadata.usage.output_tokens, 20);
  assert.equal(completed.metadata.cost_usd, null);
  const second = await runExperiment({ staticGraph, outputRoot, source: origin, model: 'test-model' }, { target, checkPi: () => 'mock', execute });
  assert.notEqual(second.runDir, completed.runDir);
  assert.equal(second.metadata.graph_sha256, completed.metadata.graph_sha256);
  const reportPath = join(second.runDir, 'validation.json');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  writeFileSync(reportPath, JSON.stringify({ ...report, nodes: 500 }));
  assert.throws(() => verifyRun(second.runDir), /report differs/);
  writeFileSync(join(completed.runDir, 'graph.yaml'), readFileSync(join(completed.runDir, 'graph.yaml'), 'utf8').replace('return book();', 'return fake();'));
  assert.throws(() => verifyRun(completed.runDir), /differ/);
});
test('failed runs preserve metadata and drafts but never claim a prediction', async () => {
  let failure;
  try {
    await runExperiment({ staticGraph, outputRoot: join(root, 'failed'), source: origin, model: 'test' }, {
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
    await runExperiment({ staticGraph, outputRoot: join(root, 'truncated'), source: origin, model: 'test' }, {
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
  const result = await runExperiment({ staticGraph, outputRoot: join(root, 'pi-complete'), source: origin, effort: 'low' }, {
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
