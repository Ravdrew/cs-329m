import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { after, test } from 'node:test';
import { parse } from 'yaml';
import { TEAM_ROOT, UNGROUPED, edgeId } from '../graph.mjs';
import { graphHeader } from '../render.mjs';
import { createGraphTools, toolDefinitions } from '../tools.mjs';

const GRAPHS = join(TEAM_ROOT, 'graphs');
const HANDMADE_EDIT = join(GRAPHS, 'booking-handmade-edit.yaml');
const HOTSTART_NO_GROUPS = join(GRAPHS, 'booking-hotstart-2026-10-29-run01.yaml');
const HOTSTART = join(GRAPHS, 'booking-hotstart-2026-10-29-run02.yaml');
// `python3 q2q3-tools/graph_to_text.py graphs/booking-handmade-edit.yaml` from the text-channel branch (e47db20).
// Regenerate it whenever the text channel's wording changes; the MCP tools must keep matching it.
const TEXT_CHANNEL = readFileSync(new URL('./fixtures/handmade-edit.text-channel.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const root = mkdtempSync(join(tmpdir(), 'graph-mcp-test-'));
after(() => rmSync(root, { recursive: true, force: true }));
const text = r => r.content[0].text;
const ok = (tools, name, args) => {
  const r = tools.call(name, args);
  assert.equal(r.isError, false, text(r));
  return text(r);
};

test('every graph the team has produced loads', () => {
  const files = readdirSync(GRAPHS).filter(f => /\.(ya?ml|json)$/.test(f));
  assert.ok(files.length >= 10);
  for (const f of files) createGraphTools({ graph: join(GRAPHS, f) });
});

test('get_requested_change and the graph header match the text channel byte for byte', () => {
  const tools = createGraphTools({ graph: HANDMADE_EDIT });
  const section = TEXT_CHANNEL.slice(TEXT_CHANNEL.indexOf('## Requested change'), TEXT_CHANNEL.indexOf('\n## Components')).trimEnd();
  assert.ok(ok(tools, 'get_requested_change').startsWith(`${section}\n\nUse get_node`));
  assert.ok(TEXT_CHANNEL.startsWith(graphHeader(tools.index).join('\n')));
});

test('an unedited graph reports no requested change', () => {
  const tools = createGraphTools({ graph: join(GRAPHS, 'booking-handmade.yaml') });
  assert.match(ok(tools, 'get_requested_change'), /^## Requested change\n\nNone\./);
});

test('no x-* field content or code reaches the agent', () => {
  const tools = createGraphTools({ graph: HOTSTART, maxChars: 1e9 });
  const graph = parse(readFileSync(HOTSTART, 'utf8'));
  const secrets = new Set();
  const collect = (v, inX) => {
    // Lines of prose or code only: x-source-files repeats node file paths, which are meant to be shown.
    if (typeof v === 'string' && inX) v.split('\n').map(s => s.trim()).filter(s => s.length >= 40 && s.includes(' ')).forEach(s => secrets.add(s));
    else if (Array.isArray(v)) v.forEach(x => collect(x, inX));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) collect(x, inX || k.startsWith('x-'));
  };
  collect(graph, false);
  assert.ok(secrets.size > 100, 'fixture should carry source excerpts in x-* fields');
  const outputs = [ok(tools, 'graph_overview'), ok(tools, 'get_requested_change')];
  for (const g of graph.groups) outputs.push(ok(tools, 'get_group', { id: g.id }));
  for (const n of graph.nodes) {
    outputs.push(ok(tools, 'get_node', { id: n.id }), ok(tools, 'get_node', { id: n.id, files_offset: 0 }));
    outputs.push(ok(tools, 'neighbors', { id: n.id, depth: 2 }));
  }
  for (const e of graph.edges) outputs.push(ok(tools, 'get_edge', { id: edgeId(e) }));
  const all = outputs.join('\n');
  for (const s of secrets) assert.ok(!all.includes(s), `leaked: ${s}`);
  assert.ok(!all.includes('```'));
  assert.ok(!/static edge \d+/.test(all), 'evidence notes must not appear');
});

test('get_group accounts for every dependency that touches the group', () => {
  const tools = createGraphTools({ graph: HANDMADE_EDIT });
  const out = ok(tools, 'get_group', { id: 'public-booking' });
  assert.match(out, /Subgroups:\n- Booker UI \[booker-ui\]: 6 components/);
  assert.match(out, /Components \(10\):/); // 4 direct + 6 in Booker UI
  assert.match(out, /Book event form \[book-event-form\] \(component\): .* \(in Booker UI\)/);
  const members = new Set(tools.index.graph.nodes.filter(n => ['public-booking', 'booker-ui'].includes(n.group)).map(n => n.id));
  const touching = tools.index.graph.edges.filter(e => members.has(e.from) || members.has(e.to)).length;
  const within = Number(out.match(/Dependencies inside this group: (\d+)/)[1]);
  const crossing = [...out.matchAll(/^- [→←] .*: (\d+) dependenc/gm)].reduce((s, m) => s + Number(m[1]), 0);
  assert.equal(within + crossing, touching);

  const direct = ok(tools, 'get_group', { id: 'public-booking', nested: false });
  assert.match(direct, /Components \(4\):/);
  assert.match(ok(tools, 'graph_overview'), /- Public booking flow \[public-booking\]: 10 components\.[^\n]*\n  - Booker UI \[booker-ui\]: 6 components/);
});

test('a graph without groups lists components in the overview and says so in get_group', () => {
  const tools = createGraphTools({ graph: HOTSTART_NO_GROUPS });
  const overview = ok(tools, 'graph_overview', { limit: 5 });
  assert.match(overview, /This graph has no groups/);
  assert.match(overview, /Showing 1-5 of 34\. Pass offset 5 for more\./);
  const r = tools.call('get_group', { id: UNGROUPED });
  assert.equal(r.isError, false);
  assert.match(text(r), /Components \(34\):/);
  assert.match(text(tools.call('get_group', { id: 'web' })), /This graph has no groups/);
});

test('find_components finds owners of files and directories, and searches by words', () => {
  const tools = createGraphTools({ graph: HANDMADE_EDIT });
  assert.match(ok(tools, 'find_components', { file: './packages/features/bookings/Booker/store.ts' }), /Booker store \[booker-store\]/);
  const dir = ok(tools, 'find_components', { file: 'packages/features/bookings/Booker/' });
  assert.match(dir, /or files under it/);
  assert.match(dir, /Booker \[booker\]/);
  assert.match(ok(tools, 'find_components', { file: 'no/such/file.ts' }), /No component owns/);
  const words = ok(tools, 'find_components', { query: 'booked appointments' });
  assert.match(words.split('\n')[1], /\[booked-appointments-page\]/);
  assert.match(ok(tools, 'find_components', { query: 'booking', kind: 'model' }), /\[booking-model\]/);
});

test('get_node and get_edge show developer notes, change marks and every code location', () => {
  const tools = createGraphTools({ graph: HANDMADE_EDIT });
  const node = ok(tools, 'get_node', { id: 'booking-success-page' });
  assert.match(node, /^## Booking success page \[booking-success-page\] \(TO CHANGE, requested\)/);
  assert.match(node, /Developer note: Add a "See all your bookings" link/);
  assert.match(node, /\*\*Book event form \[book-event-form\]\*\* navigates to this component \(TO REMOVE, requested\)/);
  const edge = ok(tools, 'get_edge', { from: 'book-event-form', to: 'booking-success-page' });
  assert.match(edge, /Developer note: Redirect to the booked-appointments page instead\./);
  assert.match(text(tools.call('get_edge', { from: 'booking-success-page', to: 'book-event-form' })), /one in the other direction/);

  const hot = createGraphTools({ graph: HOTSTART, maxChars: 1e9 });
  const many = hot.index.graph.edges.find(e => new Set(e.evidence?.map(ev => `${ev.file}:${ev.line}`)).size > 2);
  const refs = new Set(many.evidence.map(ev => `${ev.file}:${ev.line}`));
  const all = ok(hot, 'get_edge', { id: edgeId(many) });
  assert.match(all, new RegExp(`Code locations \\(${refs.size}\\):`));
  for (const r of refs) assert.ok(all.includes(`\`${r}\``));
  // get_node keeps the text channel's two locations per dependency
  assert.match(ok(hot, 'get_node', { id: many.from }), new RegExp(`and ${refs.size - 2} more\\.`));
});

test('neighbors follows direction, kinds and depth', () => {
  const tools = createGraphTools({ graph: HANDMADE_EDIT });
  const out = ok(tools, 'neighbors', { id: 'booked-appointments-page', direction: 'out', kinds: ['calls'] });
  assert.match(out, /Attendee bookings endpoint \[attendee-bookings-endpoint\]/);
  assert.ok(!out.includes('[booking-success-page]'));
  const two = ok(tools, 'neighbors', { id: 'booked-appointments-page', direction: 'out', kinds: ['calls', 'reads'], depth: 2 });
  assert.match(two, /Step 2:\n- Booking \[booking-model\]/);
});

test('arguments are validated, output is capped, and tool sets can be restricted', () => {
  const tools = createGraphTools({ graph: HOTSTART, maxChars: 500, tools: ['get_node', 'get_requested_change'] });
  assert.deepEqual(tools.definitions.map(d => d.name), ['get_requested_change', 'get_node']);
  assert.match(text(tools.call('graph_overview')), /Unknown tool/);
  assert.match(text(tools.call('get_node', { id: 3 })), /Invalid arguments/);
  assert.match(text(tools.call('get_node', { id: 'availability', extra: 1 })), /Invalid arguments/);
  const capped = ok(tools, 'get_node', { id: 'availability' });
  assert.ok(capped.length < 600);
  assert.match(capped, /\[Output cut at 500 characters/);
  assert.throws(() => createGraphTools({ graph: HOTSTART, tools: ['nope'] }), /Unknown tools: nope/);
  assert.equal(toolDefinitions.length, 7);
});

test('the stdio server speaks MCP and logs every call', async () => {
  const runDir = join(root, 'run');
  const server = spawn(process.execPath, [new URL('../server.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    '--graph', HANDMADE_EDIT, '--run-dir', runDir], { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = createInterface({ input: server.stdout })[Symbol.asyncIterator]();
  const rpc = async (id, method, params) => {
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return JSON.parse((await lines.next()).value);
  };
  const init = await rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  assert.equal(init.result.serverInfo.name, 'graph');
  assert.deepEqual(init.result.capabilities, { tools: {} });
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  const list = await rpc(2, 'tools/list', {});
  assert.equal(list.result.tools.length, 7);
  const call = await rpc(3, 'tools/call', { name: 'get_requested_change', arguments: {} });
  assert.match(call.result.content[0].text, /Add component Booked appointments page/);
  const bad = await rpc(4, 'bogus/method', {});
  assert.equal(bad.error.code, -32601);
  server.stdin.end();
  await new Promise(resolve => server.on('close', resolve));

  const log = readFileSync(join(runDir, 'tools.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.equal(log[0].event, 'server_started');
  assert.match(log[0].graph_sha256, /^[0-9a-f]{64}$/);
  assert.equal(log[0].changed, 9);
  assert.equal(log[1].name, 'get_requested_change');
  assert.ok(log[1].approx_tokens > 0);
});
