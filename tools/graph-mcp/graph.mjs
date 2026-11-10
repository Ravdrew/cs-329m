// Load, validate and index a component graph in the shared format (schema/graph.schema.json).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const TEAM_ROOT = join(HERE, '../..');
export const UNGROUPED = '(ungrouped)';
export const CHANGED = new Set(['new', 'modify', 'delete']);

let validator;
function schemaValidator() {
  validator ??= new Ajv({ allErrors: true, strict: false })
    .compile(JSON.parse(readFileSync(join(TEAM_ROOT, 'schema/graph.schema.json'), 'utf8')));
  return validator;
}

export const filePath = f => (typeof f === 'string' ? f : f.path);
export const edgeId = e => e.id ?? `${e.from}->${e.to}:${e.kind}`;
export const changeOf = x => (CHANGED.has(x.status) ? x.status : null);
export const normalizePath = p => String(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');

/** Schema plus the reference checks from viewer/src/graph/parse.ts. Throws with every problem found. */
export function validateGraph(raw) {
  const problems = [];
  const validate = schemaValidator();
  if (!validate(raw)) {
    for (const e of validate.errors) problems.push(`${e.instancePath || '/'} ${e.message}`);
    throw new Error(`Invalid graph:\n${problems.slice(0, 20).map(p => `  - ${p}`).join('\n')}`);
  }
  const groupIds = new Set();
  for (const g of raw.groups ?? []) {
    if (groupIds.has(g.id)) problems.push(`duplicate group id "${g.id}"`);
    groupIds.add(g.id);
  }
  for (const g of raw.groups ?? []) {
    if (g.parent && !groupIds.has(g.parent)) problems.push(`group "${g.id}" has unknown parent "${g.parent}"`);
  }
  const nodeIds = new Set();
  for (const n of raw.nodes) {
    if (nodeIds.has(n.id)) problems.push(`duplicate node id "${n.id}"`);
    nodeIds.add(n.id);
    if (n.group && !groupIds.has(n.group)) problems.push(`node "${n.id}" references unknown group "${n.group}"`);
  }
  const edgeIds = new Set();
  for (const e of raw.edges) {
    const id = edgeId(e);
    if (!nodeIds.has(e.from)) problems.push(`edge ${id}: unknown source "${e.from}"`);
    if (!nodeIds.has(e.to)) problems.push(`edge ${id}: unknown target "${e.to}"`);
    if (edgeIds.has(id)) problems.push(`duplicate edge ${id}`);
    edgeIds.add(id);
  }
  if (problems.length) throw new Error(`Invalid graph:\n${problems.slice(0, 20).map(p => `  - ${p}`).join('\n')}`);
  return raw;
}

/** Lookups every tool needs. The graph object is never mutated. */
export function indexGraph(graph) {
  const nodes = new Map(graph.nodes.map(n => [n.id, n]));
  const groups = new Map((graph.groups ?? []).map(g => [g.id, g]));
  const edges = new Map(graph.edges.map(e => [edgeId(e), e]));
  const outgoing = new Map(), incoming = new Map(), owners = new Map();
  const childGroups = new Map(), members = new Map();
  for (const n of graph.nodes) {
    outgoing.set(n.id, []);
    incoming.set(n.id, []);
    const gid = n.group ?? UNGROUPED;
    if (!members.has(gid)) members.set(gid, []);
    members.get(gid).push(n);
    for (const f of n.files ?? []) {
      const p = normalizePath(filePath(f));
      if (!owners.has(p)) owners.set(p, []);
      owners.get(p).push(n.id);
    }
  }
  for (const e of graph.edges) {
    outgoing.get(e.from).push(e);
    incoming.get(e.to).push(e);
  }
  for (const g of graph.groups ?? []) {
    if (!g.parent) continue;
    if (!childGroups.has(g.parent)) childGroups.set(g.parent, []);
    childGroups.get(g.parent).push(g);
  }
  return { graph, nodes, groups, edges, outgoing, incoming, owners, childGroups, members };
}

/** Group ids from the root down to gid. Cycle-safe. */
export function groupChain(index, gid) {
  const chain = [], seen = new Set();
  while (gid && index.groups.has(gid) && !seen.has(gid)) {
    seen.add(gid);
    chain.unshift(gid);
    gid = index.groups.get(gid).parent;
  }
  return chain;
}

/** gid and every group nested under it. */
export function groupSubtree(index, gid) {
  const out = new Set([gid]), queue = [gid];
  while (queue.length) {
    for (const child of index.childGroups.get(queue.shift()) ?? []) {
      if (!out.has(child.id)) { out.add(child.id); queue.push(child.id); }
    }
  }
  return out;
}

/** Nodes in gid, optionally including nested groups. */
export function groupMembers(index, gid, nested = true) {
  if (gid === UNGROUPED || !nested) return index.members.get(gid) ?? [];
  return [...groupSubtree(index, gid)].flatMap(id => index.members.get(id) ?? []);
}

export const rootGroups = index => [...index.groups.values()].filter(g => !g.parent || !index.groups.has(g.parent));
