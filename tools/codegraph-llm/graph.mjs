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
export const EDGE_KINDS = Object.freeze(['renders', 'navigates', 'calls', 'reads', 'writes', 'emits', 'uses']);
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export class DraftGraph {
  constructor(source, schema, repo, staticGraph, inputHash) {
    this.source = source;
    this.static = staticGraph;
    this.inputHash = inputHash;
    this.validateSchema = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    this.document = { version: 1, repo, commit: source.commit, 'x-variant': 'codegraph-llm', groups: [], nodes: [] };
    // Model edge operations over host-aggregated edges: retype one, or consolidate several
    // between the same endpoints into one. Keyed by the output edge ID they produce.
    this.edgeOps = [];
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
        need(key !== 'edges', 'Edges are derived by the host from static dependencies; retype or consolidate them with update_edges');
        need(['title', 'description', 'x-scope'].includes(key), `Unsupported field ${key}; the model cannot change the pin or store layout`);
        next[key] = value;
      }
    }
    for (const key of ['groups', 'nodes']) next[key] = next[key].filter(n => !remove.includes(n.id));
    need(JSON.stringify(next).length < 4_000_000, 'Draft exceeds 4 MB');
    const ownership = this.ownership(next); // Invalid selectors or overlapping assignments do not mutate the draft.
    this.document = next;
    // Membership changes can remove or re-key host edges. Edge operations that no longer
    // apply are dropped and reported rather than kept silently.
    const current = new Set(this.aggregate(ownership).edges.map(e => e.id));
    const dropped = this.edgeOps.filter(op => !op.replaces.every(id => current.has(id))).map(op => op.id);
    this.edgeOps = this.edgeOps.filter(op => !dropped.includes(op.id));
    return { ...this.inspect(), dropped_edge_ops: dropped };
  }
  updateEdges(text) {
    need(!this.frozen, 'The graph is frozen');
    const patch = parseYaml(text);
    need(patch && typeof patch === 'object' && !Array.isArray(patch), 'Supply a YAML mapping with retype, consolidate and/or reset_ids');
    need(Object.keys(patch).every(k => ['retype', 'consolidate', 'reset_ids'].includes(k)), 'update_edges accepts only retype, consolidate and reset_ids');
    const ownership = this.ownership();
    const hostEdges = new Map(this.aggregate(ownership).edges.map(e => [e.id, e]));
    let ops = [...this.edgeOps];
    const reset = patch.reset_ids ?? [];
    need(Array.isArray(reset) && reset.every(v => typeof v === 'string'), 'reset_ids must be a string array');
    ops = ops.filter(op => !reset.includes(op.id) && !op.replaces.some(id => reset.includes(id)));
    const entries = [], touched = new Set();
    for (const kind of ['retype', 'consolidate']) {
      need(patch[kind] === undefined || Array.isArray(patch[kind]), `${kind} must be an array`);
      for (const item of patch[kind] ?? []) entries.push({ op: kind, item });
    }
    for (const { op, item } of entries) {
      need(item && typeof item === 'object' && typeof item.id === 'string' && ID_PATTERN.test(item.id), `${op}: entries need a valid id`);
      const allowed = ['id', 'kind', 'label', 'description', 'x-source-evidence', ...(op === 'consolidate' ? ['replaces'] : [])];
      need(Object.keys(item).every(k => allowed.includes(k)), `${item.id}: unsupported field; endpoints, weights and raw edges are fixed by the host`);
      need(EDGE_KINDS.includes(item.kind), `${item.id}: kind must be one of ${EDGE_KINDS.join(', ')}`);
      const replaces = op === 'retype' ? [item.id] : item.replaces;
      need(Array.isArray(replaces) && replaces.length >= (op === 'retype' ? 1 : 2) && replaces.every(v => typeof v === 'string') && new Set(replaces).size === replaces.length,
        `${item.id}: consolidate needs at least two distinct host edge IDs in replaces`);
      for (const id of replaces) need(hostEdges.has(id), `${item.id}: unknown host edge ${id}; use inspect_edges`);
      const [first, ...rest] = replaces.map(id => hostEdges.get(id));
      need(rest.every(e => e.from === first.from && e.to === first.to), `${item.id}: consolidated edges must share the same from and to components`);
      need(op === 'retype' || !hostEdges.has(item.id), `${item.id}: a consolidated edge needs a new ID that is not a host edge ID`);
      need(item.description === undefined || (typeof item.description === 'string' && item.description.trim()), `${item.id}: description must be nonempty text`);
      need(op === 'retype' || item.description, `${item.id}: a consolidated edge needs a description of the relationship`);
      // Within one batch, conflicting operations are an error. Across batches, the later one supersedes.
      for (const id of replaces) { need(!touched.has(id), `Host edge ${id} is affected by two operations in this batch`); touched.add(id); }
      ops = ops.filter(prev => prev.id !== item.id && !prev.replaces.some(id => replaces.includes(id)));
      ops.push({ id: item.id, op, replaces: [...replaces].sort(), kind: item.kind, label: item.label, description: item.description, 'x-source-evidence': item['x-source-evidence'] });
    }
    const produced = new Set();
    for (const op of ops) { need(!produced.has(op.id), `Duplicate edge ID ${op.id}`); produced.add(op.id); }
    this.applyEdgeOps([...hostEdges.values()], ops, ownership, true); // Reads only accumulate, so evidence accepted here still holds at finalize.
    this.edgeOps = ops;
    return this.inspectEdges({});
  }
  // Apply model edge operations to host edges. Each raw static edge still ends in exactly one
  // output edge; kinds, labels and descriptions can change, endpoints and counts cannot.
  applyEdgeOps(hostEdges, ops = this.edgeOps, ownership = this.ownership(), checkEvidence = true) {
    const byId = new Map(hostEdges.map(e => [e.id, e]));
    const consumed = new Set();
    const output = [];
    for (const op of ops) {
      const sources = op.replaces.map(id => { need(byId.has(id), `Edge operation ${op.id} references a missing host edge ${id}`); return byId.get(id); });
      for (const id of op.replaces) { need(!consumed.has(id), `Host edge ${id} is affected by two operations`); consumed.add(id); }
      const first = sources[0];
      need(sources.every(e => e.from === first.from && e.to === first.to), `Edge operation ${op.id} spans different component pairs`);
      const hostKinds = {}, rawKinds = {};
      let raw = 0, low = 0, unknown = 0;
      const pairs = new Set(), evidence = [];
      for (const e of sources) {
        hostKinds[e.kind] = (hostKinds[e.kind] ?? 0) + e['x-codegraph'].raw_edge_count;
        for (const [k, v] of Object.entries(e['x-codegraph'].raw_kinds)) rawKinds[k] = (rawKinds[k] ?? 0) + v;
        raw += e['x-codegraph'].raw_edge_count; low += e['x-codegraph'].low_confidence_edges; unknown += e['x-codegraph'].unknown_confidence_edges;
        for (const p of e['x-codegraph'].file_pairs ?? []) pairs.add(p);
        evidence.push(...e.evidence);
      }
      // A kind the static analysis did not already report is a semantic claim: it needs source
      // the model read in this run, inside a member file of either endpoint.
      const semantic = !(op.kind in hostKinds);
      const cited = op['x-source-evidence'];
      need(cited === undefined || (Array.isArray(cited) && cited.length), `${op.id}: x-source-evidence must be a nonempty array`);
      need(!semantic || cited, `${op.id}: retyping to ${op.kind} needs x-source-evidence read in this run (host kinds: ${Object.keys(hostKinds).join(', ')})`);
      let sourceEvidence;
      if (cited && checkEvidence) {
        const memberFiles = new Set(this.static.data.nodes.filter(n => [first.from, first.to].includes(ownership.get(n.id))).map(n => n.file_path));
        sourceEvidence = cited.map(e => { need(memberFiles.has(e.path), `${op.id}: evidence ${e.path} is not a member file of ${first.from} or ${first.to}`); return this.source.evidence(e); });
      }
      const label = op.label ?? `${op.kind} (${raw})`;
      const edge = { id: op.id, from: first.from, to: first.to, kind: op.kind, provenance: 'inferred', status: 'existing', label,
        description: op.description ?? `${first.description} Retyped from ${Object.keys(hostKinds).join('/')} by the model.`,
        evidence: evidence.slice(0, 3) };
      if (sourceEvidence) edge['x-source-evidence'] = sourceEvidence;
      edge['x-codegraph'] = { raw_edge_count: raw, file_pair_count: pairs.size || first['x-codegraph'].file_pair_count, raw_kinds: Object.fromEntries(sorted(Object.keys(rawKinds)).map(k => [k, rawKinds[k]])),
        low_confidence_edges: low, unknown_confidence_edges: unknown, host_kinds: Object.fromEntries(sorted(Object.keys(hostKinds)).map(k => [k, hostKinds[k]])),
        edge_op: op.op, replaces: op.replaces };
      output.push(edge);
    }
    if (!ops.length) return hostEdges; // Byte-identical to the pre-edge-operation output.
    for (const e of hostEdges) if (!consumed.has(e.id)) output.push(e);
    // Same ordering as aggregate(): by (from, to, kind), then by edge ID.
    const key = e => JSON.stringify([e.from, e.to, e.kind, e.id]);
    return output.sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
  }
  inspectEdges({ from, to, kind, offset = 0, limit = 40 } = {}) {
    const ownership = this.ownership();
    const { edges: host } = this.aggregate(ownership);
    const edges = this.applyEdgeOps(host, this.edgeOps, ownership, false)
      .filter(e => (!from || e.from === from) && (!to || e.to === to) && (!kind || e.kind === kind));
    const pairs = new Set(edges.map(e => `${e.from}>${e.to}`));
    return { total_edges: edges.length, component_pairs: pairs.size, host_edges: host.length, edge_ops: this.edgeOps.length,
      next_offset: offset + limit < edges.length ? offset + limit : null,
      edges: edges.slice(offset, offset + limit).map(e => ({ id: e.id, from: e.from, to: e.to, kind: e.kind, provenance: e.provenance, label: e.label,
        raw_edge_count: e['x-codegraph'].raw_edge_count, file_pair_count: e['x-codegraph'].file_pair_count, raw_kinds: e['x-codegraph'].raw_kinds,
        host_kinds: e['x-codegraph'].host_kinds, replaces: e['x-codegraph'].replaces, evidence: e.evidence })) };
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
    const edges = this.applyEdgeOps(this.aggregate(ownership).edges, this.edgeOps, ownership, false);
    return { frozen: this.frozen, title: this.document.title, groups: this.document.groups, edge_ops: this.edgeOps.length,
      nodes: this.document.nodes.map(n => ({ id: n.id, label: n.label,
        member_nodes: [...ownership.values()].filter(id => id === n.id).length })),
      assigned_nodes: ownership.size, total_nodes: this.static.nodes.size, unassigned_nodes: unassigned.length,
      unassigned_files: this.static.listFiles({ unassigned: true, limit: 20 }, ownership),
      component_edge_count: edges.length, omitted_preview_edges: Math.max(0, edges.length - 40),
      component_edges_preview: edges.slice(0, 40).map(e => ({ id: e.id, from: e.from, to: e.to, kind: e.kind, provenance: e.provenance, weight: e['x-codegraph'].raw_edge_count })) };
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
          low_confidence_edges: b.low, unknown_confidence_edges: b.unknown, file_pairs: sorted(b.pairs) } });
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
    const { edges: hostEdges, edgeMembership: hostMembership, counts } = this.aggregate(ownership);
    need(counts.unassigned === 0, 'Unassigned edge endpoints');
    const edges = this.applyEdgeOps(hostEdges, this.edgeOps, ownership, true);
    const edgeMembership = {};
    for (const e of edges) {
      edgeMembership[e.id] = (e['x-codegraph'].replaces ?? [e.id]).flatMap(id => hostMembership[id]).sort((a, c) => a - c);
      delete e['x-codegraph'].file_pairs;
    }
    need(Object.values(edgeMembership).flat().length === counts.aggregated, 'Edge operations lost or duplicated raw edges');
    this.membership = Object.fromEntries(sorted(ownership.keys()).map(id => [id, ownership.get(id)]));
    this.aggregation = this.edgeOps.length
      ? { policy: 'All cross-component static dependencies; contains/internal removed; no confidence filtering or edge pruning. The model retyped or consolidated host edges between the same two components; every raw edge stays in exactly one output edge.',
        kind_mapping: EDGE_MAP, counts, host_edges: hostMembership, edge_ops: this.edgeOps, edges: edgeMembership }
      : { policy: 'All cross-component static dependencies; contains/internal removed; no confidence filtering or edge pruning.',
        kind_mapping: EDGE_MAP, counts, edges: edgeMembership };
    const graph = { version: 1, repo: draft.repo, commit: draft.commit, title: draft.title, description: draft.description,
      groups: [...draft.groups].sort((a, b) => a.id.localeCompare(b.id, 'en')), nodes: nodes.sort((a, b) => a.id.localeCompare(b.id, 'en')), edges,
      'x-variant': 'codegraph-llm', 'x-scope': draft['x-scope'],
      'x-codegraph': { static_input_sha256: this.inputHash, static_nodes: this.static.nodes.size, static_edges: this.static.data.edges.length,
        codegraph_version: this.static.data.codegraph_version,
        ...(this.edgeOps.length ? { host_edges: hostEdges.length, edge_ops: this.edgeOps.length } : {}),
        membership_sha256: sha256(canonical(this.membership)),
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
