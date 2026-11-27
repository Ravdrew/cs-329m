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
const EVIDENCE_SHAPE = 'x-source-evidence entries are {path, start_line, end_line}, with a path string and integer lines (the schema field "evidence" with file/line is filled in by the host; do not write it)';
// Checked on every update, so a wrong shape is reported with its entry's ID before the whole draft is written.
function checkEvidenceShape(item) {
  const list = item['x-source-evidence'];
  if (list === undefined) return;
  if (!Array.isArray(list)) throw new Error(`${item.id}: x-source-evidence must be an array; ${EVIDENCE_SHAPE}`);
  for (const entry of list) {
    if (typeof entry?.path !== 'string' || !Number.isInteger(entry.start_line) || !Number.isInteger(entry.end_line)) {
      throw new Error(`${item.id}: ${EVIDENCE_SHAPE}; got ${JSON.stringify(entry)?.slice(0, 160)}`);
    }
    delete entry.excerpt; // the graph stores locations, not code
  }
}
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

// Full membership (scope wide-full): a component lists every source file it owns, and may name a directory (trailing
// slash) for all its non-test source files. Membership is then a claim about ownership, checked for existence; the
// evidence shows the component's responsibility in at least one member file, not one range per file.
export const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|prisma)$/;
export const TEST_FILE = /(^|\/)(__tests__|__mocks__|__snapshots__|test|tests|e2e|playwright)\/|\.(test|spec|e2e|stories)\.[cm]?[jt]sx?$/;
export const MAX_DIRECTORY_FILES = 300;
/** A node's files with directory entries expanded to their tracked non-test source files; throws on bad entries. */
export function expandMemberFiles(node, source) {
  const out = [];
  const seen = new Set();
  const add = entry => { const path = typeof entry === 'string' ? entry : entry.path; if (!seen.has(path)) { seen.add(path); out.push(entry); } };
  for (const entry of node.files ?? []) {
    const path = typeof entry === 'string' ? entry : entry?.path;
    requireValue(typeof path === 'string' && path.trim(), `${node.id}: each files entry needs a path`);
    if (path.endsWith('/')) {
      const files = source.files.filter(p => p.startsWith(path) && SOURCE_FILE.test(p) && !TEST_FILE.test(p));
      requireValue(files.length, `${node.id}: directory ${path} has no tracked non-test source files at this commit`);
      requireValue(files.length <= MAX_DIRECTORY_FILES, `${node.id}: directory ${path} has ${files.length} source files (more than ${MAX_DIRECTORY_FILES}); name its subdirectories or files instead`);
      files.forEach(add);
    } else {
      requireValue(source.allowed.has(path), `${node.id}: ${path} is not a tracked file at this commit`);
      add(entry);
    }
  }
  return out;
}

export class DraftGraph {
  // options.groups ({ min_nodes, min_groups }, recorded per run in server.json): above min_nodes components every
  // component needs a group and at least min_groups groups are used. Runs recorded before it existed have none.
  constructor(source, schema, repo, options = {}) {
    this.source = source;
    this.groupRule = options.groups ?? null;
    this.membership = options.membership ?? 'evidence'; // 'evidence': every member file cited; 'full': see expandMemberFiles
    this.validateSchema = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    this.document = { version: 1, repo, commit: source.commit, groups: [], nodes: [], edges: [], 'x-variant': 'llm-only' };
    this.frozen = false;
    // The update step: start from the previous graph; entries citing changed code must be resubmitted or removed.
    this.pending = new Set();
    // Full-membership updates: new files that need a decision, and the decisions recorded with record_review.
    this.reviewFiles = new Set(options.seed?.reviewFiles ?? []);
    this.review = { unchanged: [], out_of_scope: [] };
    if (options.seed) {
      this.document = structuredClone(options.seed.document);
      this.pending = new Set(options.seed.pending.keys());
      for (const [path, ranges] of options.seed.carried) source.reads.set(path, [...(source.reads.get(path) ?? []), ...ranges]);
    }
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
          if (key !== 'groups') checkEvidenceShape(item);
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
    for (const key of ['nodes', 'edges']) for (const item of patch[key] ?? []) this.pending.delete(item.id);
    for (const id of remove) this.pending.delete(id);
    return this.inspect();
  }

  /** Record review decisions: components still right as they are, and new files left out of the graph. */
  record({ unchanged = [], out_of_scope = [] }, looked = () => true) {
    requireValue(!this.frozen, 'The graph is frozen');
    for (const { id, reason } of unchanged) {
      requireValue(this.pending.has(id), `${id} is not a component waiting for review`);
      requireValue(typeof reason === 'string' && reason.trim(), `${id}: give a reason`);
      requireValue(looked(id), `${id}: read (read_source) or diff (git_diff, git_show) one of its changed files first`);
    }
    for (const { path, reason } of out_of_scope) {
      requireValue(typeof reason === 'string' && reason.trim(), `${path}: give a reason`);
      const files = path.endsWith('/') ? [...this.reviewFiles].filter(p => p.startsWith(path)) : this.reviewFiles.has(path) ? [path] : [];
      requireValue(files.length, `${path} is not, and holds no, new file waiting for a decision`);
    }
    for (const { id, reason } of unchanged) { this.pending.delete(id); this.review.unchanged.push({ id, reason: reason.trim() }); }
    for (const { path, reason } of out_of_scope) {
      const files = path.endsWith('/') ? [...this.reviewFiles].filter(p => p.startsWith(path)) : [path];
      for (const f of files) this.reviewFiles.delete(f);
      this.review.out_of_scope.push({ path, reason: reason.trim(), files });
    }
    return { components_to_review: [...this.pending], new_files_to_decide: this.undecided().length };
  }

  /** New files still without a decision: not listed by any component (directory entries count) nor recorded out of scope. */
  undecided() {
    if (!this.reviewFiles.size) return [];
    const listed = new Set();
    for (const n of this.document.nodes) for (const f of n.files ?? []) {
      const p = typeof f === 'string' ? f : f?.path;
      if (typeof p !== 'string') continue;
      if (p.endsWith('/')) { for (const r of this.reviewFiles) if (r.startsWith(p)) listed.add(r); } else listed.add(p);
    }
    return [...this.reviewFiles].filter(p => !listed.has(p));
  }

  inspect(id) {
    if (id) return this.document.nodes.find(n => n.id === id) ?? this.document.edges.find(e => e.id === id) ?? this.document.groups.find(g => g.id === id) ?? { error: 'ID not found' };
    const undecided = this.undecided();
    return { frozen: this.frozen, ...(this.pending.size ? { must_be_reviewed: [...this.pending] } : {}), ...(undecided.length ? { new_files_to_decide: undecided.length } : {}), title: this.document.title, scope: this.document['x-scope'], groups: this.document.groups.map(g => g.id), nodes: this.document.nodes.map(n => ({ id: n.id, label: n.label })), edges: this.document.edges.map(e => ({ id: e.id, from: e.from, to: e.to, kind: e.kind })) };
  }

  validate() {
    this.source.assertClean();
    if (this.membership === 'full') {
      requireValue(!this.pending.size, `${this.pending.size} components changed substantially and have no decision: resubmit them with update_graph, or record them as still right with record_review: ${[...this.pending].slice(0, 60).join(', ')}`);
      const undecided = this.undecided();
      requireValue(!undecided.length, `${undecided.length} new files have no decision: add them to a component, or record them as out of scope with record_review: ${undecided.slice(0, 60).join(', ')}`);
    }
    requireValue(!this.pending.size, `${this.pending.size} entries cite changed code and have not been resubmitted or removed: ${[...this.pending].slice(0, 60).join(', ')}`);
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
    if (this.groupRule && graph.nodes.length > this.groupRule.min_nodes) {
      const ungrouped = graph.nodes.filter(n => !n.group).map(n => n.id);
      requireValue(!ungrouped.length, `With more than ${this.groupRule.min_nodes} components every component needs a group; missing: ${ungrouped.slice(0, 10).join(', ')}`);
      const used = new Set(graph.nodes.map(n => n.group));
      requireValue(used.size >= this.groupRule.min_groups, `With more than ${this.groupRule.min_nodes} components use at least ${this.groupRule.min_groups} groups (${used.size} used)`);
    }
    const paths = new Set();
    const triples = new Set();
    const evidenceErrors = [];
    for (const item of [...graph.nodes, ...graph.edges]) {
      requireValue(item.provenance === 'inferred' && item.status === 'existing', `${item.id}: use inferred/existing`);
      requireValue(item['x-source-evidence']?.length, `${item.id}: source evidence is required`);
      requireValue(Array.isArray(item['x-source-evidence']), `${item.id}: x-source-evidence must be an array`);
      item['x-source-evidence'] = item['x-source-evidence'].map(e => {
        try { return this.source.evidence(e); } catch (error) { evidenceErrors.push(`${item.id}: ${error.message}`); return e; }
      });
      for (const evidence of item['x-source-evidence']) paths.add(evidence.path);
    }
    requireValue(!evidenceErrors.length, `${evidenceErrors.length} evidence error(s):\n${evidenceErrors.slice(0, 40).join('\n')}`);
    for (const node of graph.nodes) {
      requireValue(!node.group || groups.has(node.group), `${node.id}: unknown group`);
      requireValue(node.summary?.trim() && node.description?.trim(), `${node.id}: summary and description required`);
      requireValue(node.files?.length > 0, `${node.id}: member files required`);
      if (this.membership === 'full') {
        node.files = expandMemberFiles(node, this.source);
        const members = new Set(node.files.map(f => (typeof f === 'string' ? f : f.path)));
        requireValue(node['x-source-evidence'].some(e => members.has(e.path)), `${node.id}: cite the component's responsibility in at least one of its member files`);
      }
      for (const file of node.files) {
        const path = typeof file === 'string' ? file : file.path;
        if (this.membership !== 'full') {
          const evidence = node['x-source-evidence'].filter(e => e.path === path);
          requireValue(evidence.length, `${node.id}: no membership evidence for ${path}`);
        }
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
