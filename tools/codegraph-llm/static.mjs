import { readFileSync } from 'node:fs';
import { sha256 } from './source.mjs';

const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
export const EDGE_MAP = Object.freeze({ calls: 'calls', navigates: 'navigates', imports: 'uses',
  references: 'uses', instantiates: 'uses', extends: 'uses', implements: 'uses', decorates: 'uses' });
const sort = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const canonical = value => `${JSON.stringify(value, null, 2)}\n`;

// Strip previous component assignments, names, rules and timestamps. The only seed
// supplied to the model is the selected structural subgraph and its source scope.
export function prepareStatic(inputPath, source, repo) {
  const rawBytes = readFileSync(inputPath);
  const raw = JSON.parse(rawBytes);
  requireValue(raw.format === 'codegraph-structural-export-v1', 'Expected the raw CodeGraph structural export, not a component graph');
  requireValue(raw.commit === source.commit && raw.repo === repo, 'Static graph repository/commit differs from the target');
  requireValue(Array.isArray(raw.nodes) && raw.nodes.length && Array.isArray(raw.edges), 'Empty or malformed static graph');
  const nodes = raw.nodes.map(n => Object.fromEntries([
    'id', 'kind', 'name', 'qualified_name', 'file_path', 'start_line', 'end_line', 'signature', 'docstring',
  ].filter(k => n[k] !== undefined).map(k => [k, n[k]]))).sort((a, b) => sort(a.id, b.id));
  const ids = new Set();
  const lines = new Map();
  for (const n of nodes) {
    requireValue(typeof n.id === 'string' && !ids.has(n.id), `Duplicate static node: ${n.id}`);
    ids.add(n.id);
    requireValue(source.allowed.has(n.file_path), `Static node outside tracked source: ${n.file_path}`);
    if (!lines.has(n.file_path)) lines.set(n.file_path, source.contents(n.file_path));
    // CodeGraph file containers count the empty segment after a terminal newline.
    // Keep that raw value for audit, but expose actual inclusive source lines.
    const content = lines.get(n.file_path);
    if (n.kind === 'file' && n.end_line === content.lines.length + 1 && content.bytes.at(-1) === 10) {
      n.raw_end_line = n.end_line;
      n.end_line = content.lines.length;
    }
    requireValue(Number.isInteger(n.start_line) && Number.isInteger(n.end_line) && n.start_line >= 1 &&
      n.end_line >= n.start_line && n.end_line <= lines.get(n.file_path).lines.length, `Invalid static node range: ${n.id}`);
  }
  const edgeIds = new Set();
  const edges = raw.edges.map(e => {
    requireValue(Number.isInteger(e.id) && !edgeIds.has(e.id), `Duplicate/invalid static edge id: ${e.id}`);
    edgeIds.add(e.id);
    requireValue(ids.has(e.source) && ids.has(e.target), `Dangling static edge: ${e.id}`);
    requireValue(e.kind === 'contains' || EDGE_MAP[e.kind], `Unknown static relationship: ${e.kind}`);
    let metadata = typeof e.metadata === 'string' ? JSON.parse(e.metadata) : (e.metadata ?? {});
    requireValue(metadata && typeof metadata === 'object' && !Array.isArray(metadata), `Invalid edge metadata: ${e.id}`);
    const confidence = metadata.confidence;
    requireValue(confidence === undefined || (typeof confidence === 'number' && confidence >= 0 && confidence <= 1), `Invalid edge confidence: ${e.id}`);
    return { id: e.id, source: e.source, target: e.target, kind: e.kind, line: e.line ?? null,
      confidence: confidence ?? null, resolvedBy: metadata.resolvedBy ?? null };
  }).sort((a, b) => a.id - b.id);
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  for (const e of edges) {
    requireValue(e.line === null || (Number.isInteger(e.line) && e.line >= 1 &&
      e.line <= lines.get(nodeMap.get(e.source).file_path).lines.length), `Invalid static edge line: ${e.id}`);
  }
  const files = [...lines.keys()].sort(sort).map((path, i) => ({ id: `F${String(i + 1).padStart(4, '0')}`,
    path, sha256: sha256(lines.get(path).bytes) }));
  return { format: 'codegraph-llm-input-v1', repo, commit: raw.commit, codegraph_version: raw.codegraph_version,
    scope: raw.scope, input_export_sha256: sha256(rawBytes), files, nodes, edges };
}

export class StaticGraph {
  constructor(data) {
    this.data = data;
    this.nodes = new Map(data.nodes.map(n => [n.id, n]));
    this.files = new Map(data.files.map(f => [f.id, f]));
    this.byPath = new Map(data.files.map(f => [f.path, f]));
    this.fileNodes = new Map(data.files.map(f => [f.id, data.nodes.filter(n => n.file_path === f.path)]));
  }
  overview() {
    const directories = new Map();
    for (const f of this.data.files) {
      const path = f.path.split('/').slice(0, -1).join('/');
      directories.set(path, (directories.get(path) ?? 0) + 1);
    }
    const kinds = {};
    for (const e of this.data.edges) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    return { repo: this.data.repo, commit: this.data.commit, scope: this.data.scope, nodes: this.nodes.size,
      files: this.files.size, edges: this.data.edges.length, edge_kinds: kinds,
      directories: [...directories].map(([path, files]) => ({ path, files })) };
  }
  listFiles({ contains = '', offset = 0, limit = 100, unassigned = false } = {}, ownership = new Map()) {
    const files = this.data.files.filter(f => f.path.includes(contains)).map(f => ({ ...f,
      sha256: undefined, nodes: this.fileNodes.get(f.id).length,
      unassigned_nodes: this.fileNodes.get(f.id).filter(n => !ownership.has(n.id)).length }))
      .filter(f => !unassigned || f.unassigned_nodes > 0);
    return { files: files.slice(offset, offset + limit), total: files.length, next_offset: offset + limit < files.length ? offset + limit : null };
  }
  inspectFile({ file_id, offset = 0, limit = 40 }) {
    const file = this.files.get(file_id);
    requireValue(file, `Unknown file ID: ${file_id}`);
    const nodes = this.fileNodes.get(file_id);
    const ids = new Set(nodes.map(n => n.id));
    const dependencies = new Map();
    for (const e of this.data.edges) {
      const outgoing = ids.has(e.source), incoming = ids.has(e.target);
      if (outgoing === incoming || e.kind === 'contains') continue;
      const other = this.nodes.get(outgoing ? e.target : e.source);
      const otherFile = this.byPath.get(other.file_path);
      const key = `${outgoing ? 'outgoing' : 'incoming'}:${otherFile.id}:${e.kind}`;
      const row = dependencies.get(key) ?? { direction: outgoing ? 'outgoing' : 'incoming', file_id: otherFile.id,
        path: otherFile.path, kind: e.kind, count: 0, examples: [] };
      row.count++;
      if (row.examples.length < 2) row.examples.push({ edge_id: e.id, symbol: other.name, line: e.line, confidence: e.confidence });
      dependencies.set(key, row);
    }
    const deps = [...dependencies.values()].sort((a, b) => b.count - a.count || sort(a.path, b.path));
    return { file_id, path: file.path, nodes: nodes.slice(offset, offset + limit), total_nodes: nodes.length,
      next_offset: offset + limit < nodes.length ? offset + limit : null,
      dependencies: deps.slice(0, 80), omitted_dependency_groups: Math.max(0, deps.length - 80) };
  }
  search({ query, file_id, offset = 0, limit = 40 }) {
    requireValue(!file_id || this.files.has(file_id), `Unknown file ID: ${file_id}`);
    const nodes = (file_id ? this.fileNodes.get(file_id) : this.data.nodes)
      .filter(n => `${n.name} ${n.qualified_name ?? ''}`.toLowerCase().includes(query.toLowerCase()));
    return { nodes: nodes.slice(offset, offset + limit), total: nodes.length, next_offset: offset + limit < nodes.length ? offset + limit : null };
  }
  neighbors({ node_id, offset = 0, limit = 50 }) {
    requireValue(this.nodes.has(node_id), `Unknown static node: ${node_id}`);
    const edges = this.data.edges.filter(e => e.source === node_id || e.target === node_id);
    return { node: this.nodes.get(node_id), total: edges.length, next_offset: offset + limit < edges.length ? offset + limit : null,
      edges: edges.slice(offset, offset + limit).map(e => ({ ...e,
        neighbor: this.nodes.get(e.source === node_id ? e.target : e.source) })) };
  }
}
