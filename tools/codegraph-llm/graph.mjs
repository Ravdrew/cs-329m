import Ajv2020 from 'ajv/dist/2020.js';
import { parseDocument, stringify } from 'yaml';
import { sha256 } from './source.mjs';
import { EDGE_MAP, canonical } from './static.mjs';

export const yaml = document => stringify(document, { lineWidth: 0, indent: 2, aliasDuplicateObjects: false });
export function parseYaml(text) {
  if (typeof text !== 'string' || text.length > 2_000_000) throw new Error('YAML must be text under 2 MB');
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length) throw new Error(document.errors.map(e => e.message).join('\n'));
  return document.toJS({ maxAliasCount: 0 });
}
const need = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = values => [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
const matches = (path, prefix) => path === prefix || path.startsWith(prefix.replace(/\/$/, '') + '/');

export class DraftGraph {
  constructor(source, schema, repo, staticGraph, inputHash) {
    this.source = source;
    this.static = staticGraph;
    this.inputHash = inputHash;
    this.validateSchema = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    this.document = { version: 1, repo, commit: source.commit, 'x-variant': 'codegraph-llm', groups: [], nodes: [] };
    this.frozen = false;
  }
  update(text, remove = []) {
    need(!this.frozen, 'The graph is frozen');
    const patch = parseYaml(text);
    need(patch && typeof patch === 'object' && !Array.isArray(patch), 'Supply a YAML mapping');
    const next = structuredClone(this.document);
    for (const [key, value] of Object.entries(patch)) {
      if (['groups', 'nodes'].includes(key)) {
        need(Array.isArray(value), `${key} must be an array`);
        const seen = new Set();
        for (const item of value) {
          need(item && typeof item.id === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(item.id) && !seen.has(item.id), 'Entries need unique valid IDs');
          seen.add(item.id);
          const allowed = key === 'nodes' ? ['id', 'label', 'kind', 'group', 'summary', 'description', 'file_ids', 'file_prefixes', 'node_ids', 'x-source-evidence'] : ['id', 'label', 'summary', 'parent'];
          need(Object.keys(item).every(k => allowed.includes(k)), `${item.id}: unsupported field; edges and files are derived by the host`);
          const index = next[key].findIndex(old => old.id === item.id);
          if (index < 0) next[key].push(item); else next[key][index] = item;
        }
      } else {
        need(['title', 'description', 'x-scope'].includes(key), `Unsupported field ${key}; the model cannot author edges or change the pin`);
        next[key] = value;
      }
    }
    for (const key of ['groups', 'nodes']) next[key] = next[key].filter(n => !remove.includes(n.id));
    need(JSON.stringify(next).length < 4_000_000, 'Draft exceeds 4 MB');
    this.ownership(next); // Invalid selectors or overlapping assignments do not mutate the draft.
    this.document = next;
    return this.inspect();
  }
  ownership(document = this.document) {
    const files = new Map(), explicit = new Map();
    for (const component of document.nodes) {
      for (const key of ['file_ids', 'file_prefixes', 'node_ids']) {
        need(component[key] === undefined || (Array.isArray(component[key]) && component[key].every(v => typeof v === 'string')), `${component.id}: ${key} must be a string array`);
      }
      const selected = new Set(component.file_ids ?? []);
      for (const prefix of component.file_prefixes ?? []) {
        need(prefix && !prefix.startsWith('/') && !prefix.split('/').includes('..'), 'Use a nonempty relative literal file prefix');
        const found = this.static.data.files.filter(f => matches(f.path, prefix));
        need(found.length, `Prefix matches no static input files: ${prefix}`);
        for (const f of found) selected.add(f.id);
      }
      for (const id of selected) {
        need(this.static.files.has(id), `Unknown file ID: ${id}`);
        need(!files.has(id), `File ${id} assigned to both ${files.get(id)} and ${component.id}`);
        files.set(id, component.id);
      }
      for (const id of new Set(component.node_ids ?? [])) {
        need(this.static.nodes.has(id), `Unknown static node ID: ${id}`);
        need(!explicit.has(id), `Static node ${id} has multiple explicit owners`);
        explicit.set(id, component.id);
      }
    }
    const ownership = new Map();
    for (const node of this.static.data.nodes) {
      const owner = explicit.get(node.id) ?? files.get(this.static.byPath.get(node.file_path).id);
      if (owner) ownership.set(node.id, owner);
    }
    return ownership;
  }
  inspect(id) {
    if (id) return this.document.nodes.find(n => n.id === id) ?? this.document.groups.find(g => g.id === id) ?? { error: 'Unknown component ID' };
    const ownership = this.ownership();
    const unassigned = this.static.data.nodes.filter(n => !ownership.has(n.id));
    const edges = this.aggregate(ownership).edges;
    return { frozen: this.frozen, title: this.document.title, groups: this.document.groups,
      nodes: this.document.nodes.map(n => ({ id: n.id, label: n.label,
        member_nodes: [...ownership.values()].filter(id => id === n.id).length })),
      assigned_nodes: ownership.size, total_nodes: this.static.nodes.size, unassigned_nodes: unassigned.length,
      unassigned_files: this.static.listFiles({ unassigned: true, limit: 20 }, ownership),
      component_edge_count: edges.length, omitted_preview_edges: Math.max(0, edges.length - 40),
      component_edges_preview: edges.slice(0, 40).map(e => ({ from: e.from, to: e.to, kind: e.kind, weight: e['x-codegraph'].raw_edge_count })) };
  }
  aggregate(ownership) {
    const buckets = new Map();
    const counts = { total: this.static.data.edges.length, containment: 0, unassigned: 0, internal: 0, aggregated: 0 };
    for (const edge of this.static.data.edges) {
      if (edge.kind === 'contains') { counts.containment++; continue; }
      const kind = EDGE_MAP[edge.kind];
      need(kind, `Unsupported static edge kind ${edge.kind}`);
      const from = ownership.get(edge.source), to = ownership.get(edge.target);
      if (!from || !to) { counts.unassigned++; continue; }
      if (from === to) { counts.internal++; continue; }
      counts.aggregated++;
      const key = JSON.stringify([from, to, kind]);
      const bucket = buckets.get(key) ?? { from, to, kind, raw: [], kinds: {}, pairs: new Set(), evidence: new Map(), low: 0, unknown: 0 };
      bucket.raw.push(edge.id); bucket.kinds[edge.kind] = (bucket.kinds[edge.kind] ?? 0) + 1;
      if (edge.confidence === null) bucket.unknown++; else if (edge.confidence < .8) bucket.low++;
      const s = this.static.nodes.get(edge.source), t = this.static.nodes.get(edge.target);
      bucket.pairs.add(JSON.stringify([s.file_path, t.file_path]));
      const evidence = { file: s.file_path, symbol: s.name, note: `CodeGraph ${edge.kind} to ${t.name} (${t.file_path}); static edge ${edge.id}` };
      if (edge.line !== null) evidence.line = edge.line;
      if (!bucket.evidence.has(s.file_path)) bucket.evidence.set(s.file_path, evidence);
      buckets.set(key, bucket);
    }
    const edges = [], edgeMembership = {};
    for (const key of sorted(buckets.keys())) {
      const b = buckets.get(key), id = `static-${sha256(key).slice(0, 20)}`;
      edgeMembership[id] = b.raw.sort((a, c) => a - c);
      edges.push({ id, from: b.from, to: b.to, kind: b.kind, provenance: 'extracted', status: 'existing',
        label: `${b.kind} (${b.raw.length})`, description: `${b.raw.length} static relationships across ${b.pairs.size} distinct file pairs.`,
        evidence: [...b.evidence.values()].slice(0, 3),
        'x-codegraph': { raw_edge_count: b.raw.length, file_pair_count: b.pairs.size,
          raw_kinds: Object.fromEntries(sorted(Object.keys(b.kinds)).map(k => [k, b.kinds[k]])),
          low_confidence_edges: b.low, unknown_confidence_edges: b.unknown } });
    }
    return { edges, edgeMembership, counts };
  }
  validate() {
    this.source.assertClean();
    for (const file of this.static.data.files) need(sha256(this.source.contents(file.path).bytes) === file.sha256, `Static input source changed: ${file.path}`);
    const draft = this.document, ownership = this.ownership();
    need(ownership.size === this.static.nodes.size, `${this.static.nodes.size - ownership.size} static nodes are unassigned; use list_graph_files with unassigned=true`);
    need(draft.nodes.length >= 2, 'Produce at least two components');
    need(draft.title?.trim() && draft.description?.trim(), 'Supply title and description');
    need(draft['x-scope'] && ['included', 'excluded'].every(k => Array.isArray(draft['x-scope'][k]) && draft['x-scope'][k].every(v => typeof v === 'string' && v.trim())), 'x-scope requires included/excluded string arrays');
    const ids = new Set();
    for (const item of [...draft.nodes, ...draft.groups]) { need(!ids.has(item.id), `Duplicate ID: ${item.id}`); ids.add(item.id); }
    const groups = new Map(draft.groups.map(g => [g.id, g]));
    for (const g of draft.groups) {
      const seen = new Set([g.id]); let parent = g.parent;
      while (parent) { need(groups.has(parent) && !seen.has(parent), 'Missing/cyclic group parent'); seen.add(parent); parent = groups.get(parent).parent; }
    }
    const nodes = [];
    for (const comp of draft.nodes) {
      need(comp.summary?.trim() && comp.description?.trim(), `${comp.id}: summary and description required`);
      need(!comp.group || groups.has(comp.group), `${comp.id}: unknown group`);
      const members = this.static.data.nodes.filter(n => ownership.get(n.id) === comp.id);
      need(members.length, `${comp.id}: empty component`);
      const files = sorted(new Set(members.map(n => n.file_path)));
      need(Array.isArray(comp['x-source-evidence']) && comp['x-source-evidence'].length, `${comp.id}: read and cite representative member source`);
      const evidence = comp['x-source-evidence'].map(e => {
        const exact = this.source.evidence(e);
        need(members.some(n => n.file_path === e.path && n.start_line <= e.end_line && n.end_line >= e.start_line), `${comp.id}: evidence must overlap a member node`);
        return exact;
      });
      const node = Object.fromEntries(['id', 'label', 'kind', 'group', 'summary', 'description'].filter(k => comp[k] !== undefined).map(k => [k, comp[k]]));
      nodes.push({ ...node, files: files.map(path => {
        const own = members.filter(n => n.file_path === path);
        return own.length === this.static.fileNodes.get(this.static.byPath.get(path).id).length ? path :
          { path, lines: [Math.min(...own.map(n => n.start_line)), Math.max(...own.map(n => n.end_line))] };
      }), provenance: 'inferred', status: 'existing', 'x-source-evidence': evidence,
      'x-codegraph': { member_nodes: members.length, member_files: files.length } });
    }
    const { edges, edgeMembership, counts } = this.aggregate(ownership);
    need(counts.unassigned === 0, 'Unassigned edge endpoints');
    this.membership = Object.fromEntries(sorted(ownership.keys()).map(id => [id, ownership.get(id)]));
    this.aggregation = { policy: 'All cross-component static dependencies; contains/internal removed; no confidence filtering or edge pruning.',
      kind_mapping: EDGE_MAP, counts, edges: edgeMembership };
    const graph = { version: 1, repo: draft.repo, commit: draft.commit, title: draft.title, description: draft.description,
      groups: [...draft.groups].sort((a, b) => a.id.localeCompare(b.id, 'en')), nodes: nodes.sort((a, b) => a.id.localeCompare(b.id, 'en')), edges,
      'x-variant': 'codegraph-llm', 'x-scope': draft['x-scope'],
      'x-codegraph': { static_input_sha256: this.inputHash, static_nodes: this.static.nodes.size, static_edges: this.static.data.edges.length,
        codegraph_version: this.static.data.codegraph_version, membership_sha256: sha256(canonical(this.membership)),
        aggregation_sha256: sha256(canonical(this.aggregation)), edge_policy: this.aggregation.policy },
      'x-source-files': this.static.data.files.map(f => ({ path: f.path, sha256: f.sha256 })) };
    need(this.validateSchema(graph), JSON.stringify(this.validateSchema.errors?.slice(0, 10)));
    return graph;
  }
  finalize() {
    need(!this.frozen, 'The graph is frozen');
    const graph = this.validate();
    this.frozen = true;
    return graph;
  }
}
