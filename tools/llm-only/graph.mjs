import Ajv2020 from 'ajv/dist/2020.js';
import { parseDocument, stringify } from 'yaml';
import { sha256 } from './source.mjs';

export const yaml = document => stringify(document, { lineWidth: 0, indent: 2, aliasDuplicateObjects: false });
export function parseYaml(text) {
  if (typeof text !== 'string' || text.length > 2_000_000) throw new Error('YAML input must be text under 2 MB');
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length) throw new Error(document.errors.map(e => e.message).join('\n'));
  return document.toJS({ maxAliasCount: 0 });
}
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

export class DraftGraph {
  constructor(source, schema, repo) {
    this.source = source;
    this.validateSchema = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    this.document = { version: 1, repo, commit: source.commit, groups: [], nodes: [], edges: [], 'x-variant': 'llm-only' };
    this.frozen = false;
  }

  update(text, remove = []) {
    requireValue(!this.frozen, 'The graph is frozen');
    const patch = parseYaml(text);
    requireValue(patch && typeof patch === 'object' && !Array.isArray(patch), 'Supply a YAML mapping');
    const next = structuredClone(this.document);
    for (const [key, value] of Object.entries(patch)) {
      if (['version', 'repo', 'commit', 'x-variant'].includes(key)) {
        requireValue(value === next[key], `Cannot change ${key}`);
      } else if (['groups', 'nodes', 'edges'].includes(key)) {
        requireValue(Array.isArray(value), `${key} must be an array`);
        const batch = new Set();
        for (const item of value) {
          requireValue(item && typeof item.id === 'string', `${key} entries need explicit IDs for incremental updates`);
          requireValue(!batch.has(item.id), `Duplicate ID in update: ${item.id}`);
          batch.add(item.id);
          const index = next[key].findIndex(previous => previous.id === item.id);
          if (index < 0) next[key].push(item); else next[key][index] = item;
        }
      } else {
        requireValue(['title', 'description', 'x-scope'].includes(key), `Unsupported header field: ${key}`);
        next[key] = value;
      }
    }
    for (const key of ['groups', 'nodes', 'edges']) next[key] = next[key].filter(item => !remove.includes(item.id));
    requireValue(JSON.stringify(next).length < 4_000_000, 'Draft exceeds 4 MB');
    this.document = next;
    return this.inspect();
  }

  inspect(id) {
    if (id) return this.document.nodes.find(n => n.id === id) ?? this.document.edges.find(e => e.id === id) ?? this.document.groups.find(g => g.id === id) ?? { error: 'ID not found' };
    return { frozen: this.frozen, title: this.document.title, scope: this.document['x-scope'], groups: this.document.groups.map(g => g.id), nodes: this.document.nodes.map(n => ({ id: n.id, label: n.label })), edges: this.document.edges.map(e => ({ id: e.id, from: e.from, to: e.to, kind: e.kind })) };
  }

  validate() {
    this.source.assertClean();
    const graph = structuredClone(this.document);
    for (const item of [...graph.nodes, ...graph.edges]) {
      item.provenance ??= 'inferred';
      item.status ??= 'existing';
    }
    requireValue(this.validateSchema(graph), JSON.stringify(this.validateSchema.errors?.slice(0, 12)));
    requireValue(graph.nodes.length > 0 && graph.edges.length > 0, 'Graph needs components and relationships');
    requireValue(graph.title?.trim() && graph.description?.trim(), 'Supply title and description');
    const scope = graph['x-scope'];
    requireValue(scope && Array.isArray(scope.included) && scope.included.length && Array.isArray(scope.excluded) && [...scope.included, ...scope.excluded].every(v => typeof v === 'string' && v.trim()), 'x-scope needs included and excluded arrays describing actual coverage');
    const ids = new Set();
    for (const item of [...graph.groups, ...graph.nodes, ...graph.edges]) {
      requireValue(item.id && !ids.has(item.id), `Duplicate or missing ID: ${item.id}`);
      ids.add(item.id);
    }
    const groups = new Map(graph.groups.map(g => [g.id, g]));
    const nodes = new Set(graph.nodes.map(n => n.id));
    for (const group of graph.groups) {
      const seen = new Set([group.id]);
      let parent = group.parent;
      while (parent) {
        requireValue(groups.has(parent), `Unknown parent group: ${parent}`);
        requireValue(!seen.has(parent), `Group parent cycle: ${parent}`);
        seen.add(parent);
        parent = groups.get(parent).parent;
      }
    }
    const paths = new Set();
    const triples = new Set();
    for (const item of [...graph.nodes, ...graph.edges]) {
      requireValue(item.provenance === 'inferred' && item.status === 'existing', `${item.id}: use inferred/existing`);
      requireValue(item['x-source-evidence']?.length, `${item.id}: source evidence is required`);
      requireValue(Array.isArray(item['x-source-evidence']), `${item.id}: x-source-evidence must be an array`);
      item['x-source-evidence'] = item['x-source-evidence'].map(e => this.source.evidence(e));
      for (const evidence of item['x-source-evidence']) paths.add(evidence.path);
    }
    for (const node of graph.nodes) {
      requireValue(!node.group || groups.has(node.group), `${node.id}: unknown group`);
      requireValue(node.summary?.trim() && node.description?.trim(), `${node.id}: summary and description required`);
      requireValue(node.files.length > 0, `${node.id}: member files required`);
      for (const file of node.files) {
        const path = typeof file === 'string' ? file : file.path;
        const evidence = node['x-source-evidence'].filter(e => e.path === path);
        requireValue(evidence.length, `${node.id}: no membership evidence for ${path}`);
        if (typeof file === 'object' && file.lines) this.source.evidence({ path, start_line: file.lines[0], end_line: file.lines[1] });
        paths.add(path);
      }
    }
    for (const edge of graph.edges) {
      requireValue(nodes.has(edge.from) && nodes.has(edge.to), `${edge.id}: dangling endpoint`);
      requireValue(edge.description?.trim(), `${edge.id}: relationship explanation required`);
      const triple = JSON.stringify([edge.from, edge.to, edge.kind]);
      requireValue(!triples.has(triple), `${edge.id}: duplicate relationship`);
      triples.add(triple);
      const evidence = edge['x-source-evidence'];
      if (edge.evidence) for (const entry of edge.evidence) {
        requireValue(evidence.some(e => e.path === entry.file && e.start_line === entry.line), `${edge.id}: standard evidence must point to the first line of an exact source range`);
      }
      edge.evidence = evidence.map(e => ({ file: e.path, line: e.start_line, note: `Lines ${e.start_line}–${e.end_line} (inclusive).` }));
    }
    graph['x-source-files'] = [...paths].sort().map(path => ({ path, sha256: sha256(this.source.contents(path).bytes) }));
    for (const key of ['groups', 'nodes', 'edges']) graph[key].sort((a, b) => a.id.localeCompare(b.id, 'en'));
    requireValue(this.validateSchema(graph), 'Final graph does not conform to shared schema');
    return graph;
  }

  finalize() {
    requireValue(!this.frozen, 'The graph is already frozen');
    const graph = this.validate();
    this.frozen = true;
    this.document = graph;
    return graph;
  }
}
