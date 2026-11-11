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
import { codeKindHint, DraftGraph, parseYaml, yaml } from '../graph.mjs';
import { POLICIES, REQUIRED_POLICY, runExperiment, TEAM_ROOT, verifyRun } from '../runner.mjs';
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

test('Astra may retype a host edge, with source evidence when the kind is a new semantic claim', () => {
  const { graph } = validDraft();
  const host = graph.inspectEdges({});
  assert.equal(host.total_edges, 2);
  const uses = host.edges.find(e => e.kind === 'uses');
  const calls = host.edges.find(e => e.kind === 'calls');
  assert.throws(() => graph.updateEdges(yaml({ retype: [{ id: uses.id, kind: 'reads' }] })), /needs x-source-evidence/);
  assert.throws(() => graph.updateEdges(yaml({ retype: [{ id: uses.id, kind: 'reads', 'x-source-evidence': [{ path: 'AGENTS.md', start_line: 1, end_line: 1 }] }] })), /not a member file/);
  assert.throws(() => graph.updateEdges(yaml({ retype: [{ id: 'missing', kind: 'calls' }] })), /unknown host edge/);
  assert.throws(() => graph.updateEdges(yaml({ retype: [{ id: uses.id, kind: 'made-up' }] })), /kind must be one of/);
  assert.throws(() => graph.updateEdges(yaml({ retype: [{ id: uses.id, kind: 'calls', from: 'service' }] })), /unsupported field/);
  assert.throws(() => graph.updateEdges(yaml({ edges: [] })), /accepts only/);
  assert.throws(() => graph.update('edges: []'), /update_edges/);
  assert.equal(graph.edgeOps.length, 0);
  // Same-pair member file with a range read in this run.
  const result = graph.updateEdges(yaml({ retype: [{ id: uses.id, kind: 'renders', label: 'renders booking result', description: 'The page renders the booking.', 'x-source-evidence': [{ path: 'src/page.ts', start_line: 2, end_line: 4 }] }] }));
  assert.equal(result.edge_ops, 1);
  const output = graph.finalize();
  assert.equal(output.edges.length, 2);
  const retyped = output.edges.find(e => e.id === uses.id);
  assert.equal(retyped.kind, 'renders');
  assert.equal(retyped.provenance, 'inferred');
  assert.equal(retyped.label, 'renders booking result');
  assert.deepEqual(retyped['x-codegraph'].host_kinds, { uses: 2 });
  assert.deepEqual(retyped['x-codegraph'].raw_kinds, { imports: 1, references: 1 });
  assert.equal(retyped['x-codegraph'].edge_op, 'retype');
  assert.equal(retyped['x-source-evidence'][0].excerpt.includes('book()'), true);
  assert.equal(output.edges.find(e => e.id === calls.id).provenance, 'extracted');
  assert.deepEqual(Object.values(graph.aggregation.edges).flat().sort(), [3, 4, 5]);
  assert.equal(graph.aggregation.edge_ops.length, 1);
  assert.equal(output['x-codegraph'].host_edges, 2);
  assert.equal(output['x-codegraph'].edge_ops, 1);
  assert(!('file_pairs' in retyped['x-codegraph']));
});

test('Astra may consolidate same-pair host edges; raw edges are conserved and endpoints are fixed', () => {
  const { graph } = validDraft();
  const [a, b] = graph.inspectEdges({}).edges.map(e => e.id);
  assert.throws(() => graph.updateEdges(yaml({ consolidate: [{ id: 'merged', replaces: [a], kind: 'calls', description: 'x' }] })), /at least two/);
  assert.throws(() => graph.updateEdges(yaml({ consolidate: [{ id: 'merged', replaces: [a, b], kind: 'calls' }] })), /needs a description/);
  assert.throws(() => graph.updateEdges(yaml({ consolidate: [{ id: a, replaces: [a, b], kind: 'calls', description: 'x' }] })), /new ID/);
  // A kind already reported by the static analysis for these edges needs no extra evidence.
  const result = graph.updateEdges(yaml({ consolidate: [{ id: 'page-books', replaces: [a, b], kind: 'calls', label: 'books via service', description: 'The page calls the booking service to create a booking.' }] }));
  assert.equal(result.total_edges, 1);
  assert.equal(result.host_edges, 2);
  const output = graph.finalize();
  assert.equal(output.edges.length, 1);
  const merged = output.edges[0];
  assert.equal(merged.id, 'page-books');
  assert.equal(merged.kind, 'calls');
  assert.equal(merged.from, 'page');
  assert.equal(merged.to, 'service');
  assert.equal(merged.provenance, 'inferred');
  assert.equal(merged['x-codegraph'].raw_edge_count, 3);
  assert.deepEqual(merged['x-codegraph'].host_kinds, { calls: 1, uses: 2 });
  assert.deepEqual(merged['x-codegraph'].raw_kinds, { calls: 1, imports: 1, references: 1 });
  assert.equal(merged['x-codegraph'].low_confidence_edges, 1);
  assert.deepEqual(merged['x-codegraph'].replaces.sort(), [a, b].sort());
  assert.deepEqual(graph.aggregation.edges, { 'page-books': [3, 4, 5] });
  assert.deepEqual(Object.keys(graph.aggregation.host_edges).sort(), [a, b].sort());
  assert.deepEqual(graph.aggregation.counts, { total: 6, containment: 2, unassigned: 0, internal: 1, aggregated: 3 });
  assert.deepEqual(parseYaml(yaml(output)), output);
});

test('edge operations are replaced per host edge, undone with reset_ids, and dropped when membership changes', () => {
  const { graph } = validDraft();
  const listed = graph.inspectEdges({}).edges;
  const a = listed.find(e => e.kind === 'uses').id, b = listed.find(e => e.kind === 'calls').id;
  graph.updateEdges(yaml({ retype: [{ id: a, kind: 'uses', description: 'first' }] }));
  graph.updateEdges(yaml({ consolidate: [{ id: 'merged', replaces: [a, b], kind: 'uses', description: 'second' }] }));
  assert.equal(graph.edgeOps.length, 1, 'consolidating supersedes the earlier retype of the same host edge');
  assert.equal(graph.edgeOps[0].id, 'merged');
  assert.throws(() => graph.updateEdges(yaml({ retype: [{ id: a, kind: 'uses' }], consolidate: [{ id: 'merged', replaces: [a, b], kind: 'uses', description: 'dup' }] })), /affected by two operations/);
  assert.equal(graph.edgeOps[0].id, 'merged', 'rejected batches do not mutate the operations');
  assert.equal(graph.updateEdges(yaml({ reset_ids: ['merged'] })).total_edges, 2);
  assert.equal(graph.edgeOps.length, 0);
  graph.updateEdges(yaml({ consolidate: [{ id: 'merged', replaces: [a, b], kind: 'uses', description: 'again' }] }));
  // Moving Page into the service component removes the calls edge; the consolidation no longer applies.
  const service = prediction().nodes[1];
  service.node_ids = ['fn:page'];
  service['x-source-evidence'].push({ path: 'src/page.ts', start_line: 2, end_line: 4 });
  const result = graph.update(yaml({ nodes: [service] }));
  assert.deepEqual(result.dropped_edge_ops, ['merged']);
  assert.equal(graph.edgeOps.length, 0);
  const output = graph.finalize();
  assert.equal(output.edges.length, 1);
  assert.equal(output.edges[0].provenance, 'extracted');
});

test('runs recorded before edge operations verify unchanged, byte for byte', () => {
  const { config } = fixture();
  const tools = createGraphTools(config);
  tools.call('read_source', { path: 'src/page.ts' });
  tools.call('read_source', { path: 'src/service.ts' });
  tools.call('update_graph', { yaml: yaml(prediction()) });
  assert(!tools.call('finalize_graph').isError);
  const graph = parseYaml(readFileSync(join(config.runDir, 'graph.yaml'), 'utf8'));
  assert(!('edge_ops' in graph['x-codegraph']), 'graphs without edge operations keep the October header');
  assert(!('edge_ops' in JSON.parse(readFileSync(join(config.runDir, 'aggregation.json'), 'utf8'))));
  // Simulate an October run directory: no edge-ops sidecar, no edge_ops/host_edges in the report.
  rmSync(join(config.runDir, 'edge-ops.yaml'));
  const reportPath = join(config.runDir, 'validation.json');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  delete report.edge_ops; delete report.host_edges;
  writeFileSync(reportPath, canonical(report));
  assert.equal(verifyRun(config.runDir).nodes, 2);
  writeFileSync(join(config.runDir, 'edge-ops.yaml'), '[]\n');
  assert.throws(() => verifyRun(config.runDir), /predates/);
});

test('edge operations replay through the tool transcript and sidecar tampering is detected', () => {
  const { config } = fixture();
  const tools = createGraphTools(config);
  tools.call('read_source', { path: 'src/page.ts' });
  tools.call('read_source', { path: 'src/service.ts' });
  assert(!tools.call('update_graph', { yaml: yaml(prediction()) }).isError);
  const listed = JSON.parse(tools.call('inspect_edges', { kind: 'uses' }).content[0].text);
  assert.equal(listed.total_edges, 1);
  assert(tools.call('update_edges', { yaml: yaml({ retype: [{ id: listed.edges[0].id, kind: 'writes' }] }) }).isError, 'semantic retype without evidence is rejected');
  assert(!tools.call('update_edges', { yaml: yaml({ retype: [{ id: listed.edges[0].id, kind: 'writes', 'x-source-evidence': [{ path: 'src/service.ts', start_line: 1, end_line: 3 }] }] }) }).isError);
  assert(existsSync(join(config.runDir, 'edge-ops.partial.yaml')));
  const final = JSON.parse(tools.call('finalize_graph').content[0].text);
  assert.equal(final.edge_ops, 1);
  assert.equal(final.host_edges, 2);
  assert.equal(verifyRun(config.runDir).edge_ops, 1);
  const document = parseYaml(readFileSync(join(config.runDir, 'graph.yaml'), 'utf8'));
  assert.deepEqual(document.edges.map(e => e.kind).sort(), ['calls', 'writes']);
  const ops = join(config.runDir, 'edge-ops.yaml'), before = readFileSync(ops);
  writeFileSync(ops, '[]\n');
  assert.throws(() => verifyRun(config.runDir), /edge-ops.yaml differs/);
  writeFileSync(ops, before);
  const graphPath = join(config.runDir, 'graph.yaml'), graphBefore = readFileSync(graphPath, 'utf8');
  writeFileSync(graphPath, graphBefore.replace('kind: writes', 'kind: reads'));
  assert.throws(() => verifyRun(config.runDir), /differ/);
  writeFileSync(graphPath, graphBefore);
  assert.equal(verifyRun(config.runDir).edges, 2);
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
  assert.deepEqual(prepared.metadata.graph_policy, REQUIRED_POLICY, 'new runs default to the required policy');
  assert.deepEqual(JSON.parse(readFileSync(join(prepared.runDir, 'server.json'), 'utf8')).policy, REQUIRED_POLICY);
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
  const completed = await runExperiment({ staticGraph, outputRoot, source: origin, model: 'test-model', policy: POLICIES.optional }, { target, checkPi: () => 'mock', execute });
  assert.equal(completed.metadata.status, 'completed');
  assert.equal(completed.metadata.usage.output_tokens, 20);
  assert.equal(completed.metadata.cost_usd, null);
  const second = await runExperiment({ staticGraph, outputRoot, source: origin, model: 'test-model', policy: POLICIES.optional }, { target, checkPi: () => 'mock', execute });
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
  const result = await runExperiment({ staticGraph, outputRoot: join(root, 'pi-complete'), source: origin, effort: 'low', policy: POLICIES.optional }, {
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

function reviewDraft(minFilePairs) {
  const { source } = fixture();
  readBoth(source);
  const input = prepareStatic(staticGraph, source, target.repo);
  const graph = new DraftGraph(source, schema, target.repo, new StaticGraph(input), sha256(canonical(input)), { edgeReview: { min_file_pairs: minFilePairs } });
  graph.update(yaml(prediction()));
  return graph;
}

test('a required edge review blocks finalization until every strong pair is one described edge', () => {
  const graph = reviewDraft(0); // The fixture's page>service pair spans one file pair, so it is required at 0.
  const listed = graph.inspectEdges({ pending: true });
  assert.deepEqual({ ...listed.edge_review, pending: undefined }, { min_file_pairs: 0, required_pairs: 1, pending_pairs: 1, dropped_edges: 0, pending: undefined });
  assert.equal(listed.edge_review.pending[0].file_pairs, 1);
  assert.equal(listed.total_edges, 2);
  assert(listed.edges.every(e => e.review_pending));
  assert.equal(graph.inspect().edge_review.pending_pairs, 1);
  assert.throws(() => graph.finalize(), /1 of 1 component pairs .*page>service/);
  const [a, b] = listed.edges.map(e => e.id);
  // Retyping one of the pair's two host edges still leaves two edges: not reviewed.
  graph.updateEdges(yaml({ retype: [{ id: a, kind: listed.edges[0].kind, description: 'Only half of the pair.' }] }));
  assert.throws(() => graph.finalize(), /still need an edge review/);
  graph.updateEdges(yaml({ consolidate: [{ id: 'page-books', replaces: [a, b], kind: 'calls', description: 'The page calls the booking service to create a booking.' }] }));
  assert.equal(graph.inspectEdges({ pending: true }).total_edges, 0);
  const output = graph.finalize();
  assert.equal(output.edges.length, 1);
  assert.deepEqual(output['x-codegraph'].edge_review, { min_file_pairs: 0, required_pairs: 1 });
});

test('pairs at or below the threshold need no review', () => {
  const weak = reviewDraft(1);
  assert.equal(weak.inspectEdges({}).edge_review.required_pairs, 0);
  assert(weak.inspectEdges({}).edges.every(e => !e.review_pending));
  assert.deepEqual(weak.finalize()['x-codegraph'].edge_review, { min_file_pairs: 1, required_pairs: 0 });
});

test('runs with a required edge review replay and verify with it, and not without it', () => {
  const { config } = fixture();
  config.edgeReview = { min_file_pairs: 0 };
  writeFileSync(join(config.runDir, 'server.json'), JSON.stringify(config));
  const tools = createGraphTools(config);
  tools.call('read_source', { path: 'src/page.ts' });
  tools.call('read_source', { path: 'src/service.ts' });
  tools.call('update_graph', { yaml: yaml(prediction()) });
  const refused = tools.call('finalize_graph');
  assert(refused.isError);
  assert.match(refused.content[0].text, /edge review/);
  const ids = JSON.parse(tools.call('inspect_edges', { pending: true }).content[0].text).edges.map(e => e.id);
  assert(!tools.call('update_edges', { yaml: yaml({ consolidate: [{ id: 'page-books', replaces: ids, kind: 'calls', description: 'The page calls the booking service.' }] }) }).isError);
  const done = tools.call('finalize_graph');
  assert(!done.isError, done.content[0].text);
  assert.deepEqual(JSON.parse(done.content[0].text).edge_review, { min_file_pairs: 0, required_pairs: 1 });
  const report = verifyRun(config.runDir);
  assert.equal(report.edge_ops, 1);
  assert.deepEqual(report.edge_review, { min_file_pairs: 0, required_pairs: 1 });
  // Dropping the requirement from server.json changes the replayed graph, so verification refuses.
  delete config.edgeReview;
  writeFileSync(join(config.runDir, 'server.json'), JSON.stringify(config));
  assert.throws(() => verifyRun(config.runDir), /differ/);
});

function policyDraft(policy) {
  const { source } = fixture();
  readBoth(source);
  const input = prepareStatic(staticGraph, source, target.repo);
  const graph = new DraftGraph(source, schema, target.repo, new StaticGraph(input), sha256(canonical(input)), { policy });
  graph.update(yaml(prediction()));
  return graph;
}

test('with pairEdges the host builds one edge per component pair, named by its strongest kind', () => {
  const graph = policyDraft({ pairEdges: true });
  const { edges } = graph.inspectEdges({});
  assert.equal(edges.length, 1);
  assert.equal(edges[0].kind, 'calls');
  assert.deepEqual(edges[0].host_kinds, { calls: 1, uses: 2 });
  assert.equal(edges[0].raw_edge_count, 3);
  // Any kind in the merged mix is one the static analysis reported, so it needs no extra evidence.
  graph.updateEdges(yaml({ retype: [{ id: edges[0].id, kind: 'uses', label: 'imports booking', description: 'The page imports the booking service.' }] }));
  const output = graph.finalize();
  assert.equal(output.edges.length, 1);
  assert.deepEqual(output.edges[0]['x-codegraph'].host_kinds, { calls: 1, uses: 2 });
  assert.deepEqual(Object.values(graph.aggregation.edges).flat().sort(), [3, 4, 5]);
  assert.deepEqual(output['x-codegraph'].policy, { pairEdges: true });
});

test('a dropped edge leaves the graph with its reason, and its raw edges stay accounted for', () => {
  const graph = policyDraft({ pairEdges: true, edgeDrop: true, edgeReview: { min_file_pairs: 0, labels: true } });
  const [edge] = graph.inspectEdges({ pending: true }).edges;
  assert.throws(() => graph.updateEdges(yaml({ drop: [{ id: edge.id }] })), /needs a reason/);
  assert.throws(() => graph.updateEdges(yaml({ retype: [{ id: edge.id, kind: 'calls', description: 'No label.' }] })), /short label/);
  assert.throws(() => graph.finalize(), /still need an edge review.*or drop it with a reason/);
  graph.updateEdges(yaml({ drop: [{ id: edge.id, reason: 'Fixture noise.' }] }));
  assert.equal(graph.inspectEdges({}).total_edges, 0);
  assert.equal(graph.inspectEdges({}).edge_review.pending_pairs, 0);
  assert.equal(graph.inspectEdges({ dropped: true }).edges[0].reason, 'Fixture noise.');
  assert.equal(graph.updateEdges(yaml({ reset_ids: [edge.id] })).total_edges, 1, 'reset_ids undoes a drop');
  graph.updateEdges(yaml({ drop: [{ id: edge.id, reason: 'Fixture noise.' }] }));
  const output = graph.finalize();
  assert.equal(output.edges.length, 0);
  assert.deepEqual(output['x-codegraph'].dropped_edges.map(e => [e.id, e.raw_edge_count, e.reason]), [[edge.id, 3, 'Fixture noise.']]);
  assert.deepEqual(graph.aggregation.dropped_edges, { [edge.id]: [3, 4, 5] });
  // Without the policy, drop is not an operation.
  const plain = policyDraft({});
  assert.throws(() => plain.updateEdges(yaml({ drop: [{ id: plain.inspectEdges({}).edges[0].id, reason: 'x' }] })), /accepts only/);
});

test('above the threshold every component needs a group, and enough groups are used', () => {
  const ungrouped = policyDraft({ groups: { min_nodes: 1, min_groups: 1 } });
  const page = prediction().nodes[0];
  delete page.group;
  ungrouped.update(yaml({ nodes: [page] }));
  assert.throws(() => ungrouped.finalize(), /every component needs a group; 1 have none: page/);
  ungrouped.update(yaml({ nodes: [prediction().nodes[0]] }));
  assert.equal(ungrouped.finalize().nodes.every(n => n.group === 'booking'), true);
  assert.throws(() => policyDraft({ groups: { min_nodes: 1, min_groups: 2 } }).finalize(), /at least 2 groups; 1 are used/);
  assert.doesNotThrow(() => policyDraft({ groups: { min_nodes: 2, min_groups: 3 } }).finalize(), 'at or below min_nodes, groups stay optional');
});

test('runs under the required policy replay and verify, and not without the policy', () => {
  const { config } = fixture();
  config.policy = REQUIRED_POLICY;
  writeFileSync(join(config.runDir, 'server.json'), JSON.stringify(config));
  const tools = createGraphTools(config);
  tools.call('read_source', { path: 'src/page.ts' });
  tools.call('read_source', { path: 'src/service.ts' });
  tools.call('update_graph', { yaml: yaml(prediction()) });
  assert.match(tools.call('finalize_graph').content[0].text, /edge review/);
  const [edge] = JSON.parse(tools.call('inspect_edges', { pending: true }).content[0].text).edges;
  assert.deepEqual(edge.host_kinds, { calls: 1, uses: 2 });
  const evidence = [{ path: 'src/page.ts', start_line: 2, end_line: 4 }];
  const update = tools.call('update_edges', { yaml: yaml({ retype: [{ id: edge.id, kind: 'renders', label: 'renders booking result', description: 'The page renders what the booking service returns.', 'x-source-evidence': evidence }] }) });
  assert(!update.isError, update.content[0].text);
  const done = tools.call('finalize_graph');
  assert(!done.isError, done.content[0].text);
  const result = JSON.parse(done.content[0].text);
  assert.equal(result.edges, 1);
  assert.equal(result.dropped_edges, 0);
  const report = verifyRun(config.runDir);
  assert.equal(report.edge_ops, 1);
  const graph = parseYaml(readFileSync(join(config.runDir, 'graph.yaml'), 'utf8'));
  assert.equal(graph.edges[0].kind, 'renders');
  assert.equal(graph.edges[0].label, 'renders booking result');
  assert.deepEqual(graph['x-codegraph'].policy, REQUIRED_POLICY);
  delete config.policy;
  writeFileSync(join(config.runDir, 'server.json'), JSON.stringify(config));
  assert.throws(() => verifyRun(config.runDir));
});

test('with staticSites an edge lists its code sites, and citing one is evidence for a new kind without a read', () => {
  const { source } = fixture(); // No read_source calls: only the code sites can justify a new kind.
  const input = prepareStatic(staticGraph, source, target.repo);
  const graph = new DraftGraph(source, schema, target.repo, new StaticGraph(input), sha256(canonical(input)),
    { policy: { pairEdges: true, staticSites: true } });
  const nodes = prediction().nodes.map(n => ({ ...n, 'x-source-evidence': undefined }));
  graph.document.nodes = nodes; graph.document.groups = prediction().groups; // Membership only; finalize is not called here.
  const [edge] = graph.inspectEdges({}).edges;
  assert.deepEqual(edge.code_sites, [{ path: 'src/page.ts', line: 1, code: 'import { book } from "./service";' }, { path: 'src/page.ts', line: 3, code: 'return book();' }]);
  const retype = evidence => yaml({ retype: [{ id: edge.id, kind: 'renders', label: 'renders result', description: 'Shows the booking result.', 'x-source-evidence': evidence }] });
  assert.throws(() => graph.updateEdges(retype([{ path: 'src/page.ts', line: 2 }])), /not one of this edge's code sites/);
  assert.throws(() => graph.updateEdges(retype([{ path: 'src/page.ts', start_line: 3, end_line: 3 }])), /was not read/);
  graph.updateEdges(retype([{ path: 'src/page.ts', line: 3 }]));
  const [retyped] = graph.applyEdgeOps(graph.aggregate(graph.ownership()).edges, graph.edgeOps, graph.ownership(), true);
  assert.equal(retyped.kind, 'renders');
  assert.deepEqual(retyped['x-source-evidence'], [{ path: 'src/page.ts', start_line: 3, end_line: 3, excerpt: '  return book();', basis: 'static-site' }]);
  // Without the policy, a code-site citation is not evidence.
  const plain = policyDraft({ pairEdges: true });
  const [host] = plain.inspectEdges({}).edges;
  assert.equal(host.code_sites, undefined);
  assert.throws(() => plain.updateEdges(yaml({ retype: [{ id: host.id, kind: 'renders', 'x-source-evidence': [{ path: 'src/page.ts', line: 3 }] }] })), /Invalid evidence range/);
});

test('a finalized graph keeps code-site evidence but not the site lists', () => {
  const graph = policyDraft({ pairEdges: true, staticSites: true });
  const [edge] = graph.inspectEdges({}).edges;
  graph.updateEdges(yaml({ retype: [{ id: edge.id, kind: 'reads', label: 'reads booking result', description: 'Reads what the booking service returns.', 'x-source-evidence': [{ path: 'src/page.ts', line: 3 }] }] }));
  const output = graph.finalize();
  assert.equal(output.edges[0].kind, 'reads');
  assert.equal(output.edges[0]['x-source-evidence'][0].basis, 'static-site');
  assert(output.edges.every(e => !('sites' in e['x-codegraph'])));
});

test('code-pattern kind hints read data access, sends and JSX, and skip declarations', () => {
  const sites = lines => lines.map((code, i) => ({ site: `src/a.ts:${i + 1}`, code }));
  assert.deepEqual(codeKindHint(sites(['import { BookingRepository } from "./repo";', 'await repo.findManyByUser(id);']), 'service', 'model', 'calls'),
    { kind: 'reads', sites: ['src/a.ts:2'] });
  assert.equal(codeKindHint(sites(['await repo.updateMany({', 'await repo.findFirst({', 'await prisma.$transaction([']), 'service', 'model', 'calls').kind, 'writes');
  assert.equal(codeKindHint(sites(['const s = useBookerStoreContext((state) => state.selectedDate);']), 'component', 'store', 'calls').kind, 'reads');
  assert.equal(codeKindHint(sites(['await sendScheduledEmailsAndSMS(evt);']), 'service', 'service', 'calls').kind, 'emits');
  assert.equal(codeKindHint(sites(['<BookerForm onSubmit={submit} />']), 'page', 'component', 'calls').kind, 'renders');
  assert.equal(codeKindHint(sites(['<BookerForm />']), 'service', 'component', 'calls'), null, 'renders needs UI on both ends');
  assert.equal(codeKindHint(sites(['export type Repo = { findMany(): void };', 'import { sendEmail } from "./x";']), 'service', 'model', 'uses'), null);
  assert.equal(codeKindHint(sites(['await repo.findMany()']), 'service', 'service', 'calls'), null, 'reads need a data component');
  assert.equal(codeKindHint(sites(['await sendX()']), 'page', 'page', 'navigates'), null, 'navigates is kept');
});

test('with kindHints the host pre-classifies an edge; keeping the hint needs no read and records its sites', () => {
  const graph = policyDraft({ pairEdges: true, staticSites: true, kindHints: true, edgeReview: { min_file_pairs: 0, labels: true } });
  const plainKind = graph.inspectEdges({}).edges[0].kind;
  assert.equal(plainKind, 'calls');
  graph.document.nodes[1].kind = 'store';
  graph.siteCode = site => site === 'src/page.ts:3' ? 'return useBookingStore();' : 'import { book } from "./service";';
  const [edge] = graph.inspectEdges({}).edges;
  assert.equal(edge.kind, 'reads');
  assert.equal(edge.suggested_kind, 'reads');
  assert.deepEqual(edge.code_sites[0], { path: 'src/page.ts', line: 3, code: 'return book();' });
  assert.throws(() => graph.updateEdges(yaml({ retype: [{ id: edge.id, kind: 'writes', label: 'writes', description: 'Writes.' }] })), /needs x-source-evidence/);
  graph.updateEdges(yaml({ retype: [{ id: edge.id, kind: 'reads', label: 'reads booking state', description: 'Reads the booking store.' }] }));
  const output = graph.finalize();
  assert.equal(output.edges[0].kind, 'reads');
  assert.deepEqual(output.edges[0]['x-source-evidence'], [{ path: 'src/page.ts', start_line: 3, end_line: 3, excerpt: 'return useBookingStore();', basis: 'code-pattern' }]);
  assert.deepEqual(output.edges[0]['x-codegraph'].kind_hint, { kind: 'reads', sites: ['src/page.ts:3'] });
});

test('with autoDrop the host drops weak uses-only edges unless the model classifies them', () => {
  const graph = policyDraft({ pairEdges: true, edgeDrop: true, autoDrop: { max_file_pairs: 2 }, edgeReview: { min_file_pairs: 0, labels: true } });
  // The fixture pair has calls, so nothing is dropped; make it a uses-only pair by forcing its kind.
  assert.equal(graph.inspectEdges({}).edges.length, 1);
  const aggregate = graph.aggregate.bind(graph);
  graph.aggregate = o => { const r = aggregate(o); r.edges = r.edges.map(e => ({ ...e, kind: 'uses' })); return r; };
  assert.equal(graph.inspectEdges({}).edges.length, 0);
  const [dropped] = graph.inspectEdges({ dropped: true }).edges;
  assert.match(dropped.reason, /^automatic: import or type reference only, across 1 file pair$/);
  assert.equal(graph.reviewStatus().pending_pairs, 0);
  const output = graph.finalize();
  assert.equal(output.edges.length, 0);
  assert.equal(output['x-codegraph'].dropped_edges.length, 1);
  // Retyping it keeps it.
  const kept = policyDraft({ pairEdges: true, edgeDrop: true, autoDrop: { max_file_pairs: 2 } });
  kept.aggregate = o => { const r = Object.getPrototypeOf(kept).aggregate.call(kept, o); r.edges = r.edges.map(e => ({ ...e, kind: 'uses' })); return r; };
  const id = kept.inspectEdges({ dropped: true }).edges[0].id;
  kept.updateEdges(yaml({ retype: [{ id, kind: 'uses', label: 'shares booking types', description: 'Kept on purpose.' }] }));
  assert.equal(kept.inspectEdges({}).edges.length, 1);
  assert.equal(kept.inspectEdges({ dropped: true }).edges.length, 0);
});
