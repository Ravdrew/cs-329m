// Apply a developer edit (EDIT.json) to a base graph and write the edited graph the experiment uses (edit.yaml).
//
//   node tools/llm-only/apply-edit.mjs BASE.yaml EDIT.json OUT.yaml [--provenance TEXT]
//
// EDIT.json (what an edit author writes; see tools/llm-only/EDITS.md):
//   { "modify":    [{ "id": existing node or edge id, "note": what changes }],
//     "delete":    [{ "id": existing node or edge id, "note": why it goes }],
//     "add_nodes": [{ "id", "label", "kind", "group"?, "summary", "description"?, "files"?: [planned paths], "note" }],
//     "add_edges": [{ "id", "from", "to", "kind", "label", "note"? }] }
// Every marked entry needs a note; ids must exist (modify, delete) or be new (add); new edges must connect nodes that
// exist after the edit; kinds must be the schema's. The result passes the graph tools' own validation.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseYaml, yaml } from './graph.mjs';

const NODE_KINDS = ['page', 'component', 'endpoint', 'service', 'model', 'store', 'job', 'external', 'other'];
const EDGE_KINDS = ['renders', 'navigates', 'calls', 'reads', 'writes', 'emits', 'uses'];
const need = (ok, message) => { if (!ok) throw new Error(message); };
const text = v => typeof v === 'string' && v.trim().length > 0;

export function applyEdit(base, edit, provenance) {
  const g = structuredClone(base);
  const known = new Map([...g.nodes, ...g.edges].map(x => [x.id, x]));
  const groups = new Set(g.groups.map(x => x.id));
  const unknownKeys = Object.keys(edit).filter(k => !['modify', 'delete', 'add_nodes', 'add_edges'].includes(k));
  need(!unknownKeys.length, `Unknown edit keys: ${unknownKeys.join(', ')}`);
  const marked = new Set();
  const mark = (id, status, note, what) => {
    need(text(id), `${what}: id required`);
    need(!marked.has(id), `${id}: marked more than once`);
    need(text(note), `${id}: a note is required`);
    marked.add(id);
    if (status === 'new') return;
    need(known.has(id), `${id}: no such node or edge in the base graph (${what})`);
    Object.assign(known.get(id), { status, note: note.trim() });
  };
  for (const m of edit.modify ?? []) mark(m.id, 'modify', m.note, 'modify');
  for (const d of edit.delete ?? []) mark(d.id, 'delete', d.note, 'delete');
  for (const n of edit.add_nodes ?? []) {
    mark(n.id, 'new', n.note, 'add_nodes');
    need(!known.has(n.id), `${n.id}: already exists; use modify`);
    need(NODE_KINDS.includes(n.kind), `${n.id}: kind must be one of ${NODE_KINDS.join(', ')}`);
    need(text(n.label) && text(n.summary), `${n.id}: label and summary required`);
    need(!n.group || groups.has(n.group), `${n.id}: unknown group ${n.group}`);
    need(n.files === undefined || (Array.isArray(n.files) && n.files.every(text)), `${n.id}: files must be a list of paths`);
    const node = { id: n.id, label: n.label.trim(), kind: n.kind, ...(n.group ? { group: n.group } : {}), summary: n.summary.trim(),
      ...(text(n.description) ? { description: n.description.trim() } : {}), files: n.files ?? [], provenance: 'manual', status: 'new', note: n.note.trim() };
    g.nodes.push(node);
    known.set(n.id, node);
  }
  const nodeIds = new Set(g.nodes.map(n => n.id));
  for (const e of edit.add_edges ?? []) {
    need(text(e.id) && !known.has(e.id), `${e.id}: edge id must be new`);
    need(!marked.has(e.id), `${e.id}: marked more than once`);
    marked.add(e.id);
    need(nodeIds.has(e.from) && nodeIds.has(e.to), `${e.id}: from/to must be nodes of the graph (${e.from} -> ${e.to})`);
    need(EDGE_KINDS.includes(e.kind), `${e.id}: kind must be one of ${EDGE_KINDS.join(', ')}`);
    need(text(e.label), `${e.id}: label required`);
    const edge = { id: e.id, from: e.from, to: e.to, kind: e.kind, label: e.label.trim(), provenance: 'manual', status: 'new', ...(text(e.note) ? { note: e.note.trim() } : {}) };
    g.edges.push(edge);
    known.set(e.id, edge);
  }
  need(marked.size > 0, 'The edit marks nothing');
  // A deleted node's remaining edges would dangle in the developer's picture: they must be deleted too.
  const deleted = new Set((edit.delete ?? []).map(d => d.id));
  for (const e of g.edges) {
    if ((deleted.has(e.from) || deleted.has(e.to)) && !deleted.has(e.id) && e.status !== 'delete') {
      throw new Error(`${e.id}: connects a deleted node; delete it too or keep the node`);
    }
  }
  if (provenance) g['x-edit'] = provenance;
  return g;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const pi = args.indexOf('--provenance');
  const provenance = pi >= 0 ? args.splice(pi, 2)[1] : undefined;
  const [baseFile, editFile, outFile] = args;
  if (!baseFile || !editFile || !outFile) { console.error('Usage: node apply-edit.mjs BASE.yaml EDIT.json OUT.yaml [--provenance TEXT]'); process.exit(2); }
  const out = applyEdit(parseYaml(readFileSync(baseFile, 'utf8')), JSON.parse(readFileSync(editFile, 'utf8')), provenance);
  writeFileSync(outFile, yaml(out));
  const n = [...out.nodes, ...out.edges].filter(x => ['new', 'modify', 'delete'].includes(x.status));
  console.log(`${outFile}: ${n.length} marked (${['new', 'modify', 'delete'].map(s => `${n.filter(x => x.status === s).length} ${s}`).join(', ')})`);
}
