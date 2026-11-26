// The graph tools as plain functions. server.mjs exposes them over MCP; any harness can also register them directly.
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Ajv from 'ajv';
import { parse } from 'yaml';
import {
  UNGROUPED, changeOf, edgeId, filePath, groupMembers, indexGraph, normalizePath, rootGroups, validateGraph,
} from './graph.mjs';
import {
  MARK, clean, edgeDetail, edgeLabel, edgePhrase, evidenceRefs, fileLine, graphHeader, groupPath, kindRank, name,
  nodeLine, requestedChange, summariseFiles, verb,
} from './render.mjs';

const str = { type: 'string' };
const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const tool = (name, description, properties = {}, required = []) => ({
  name, description, inputSchema: { type: 'object', properties, required, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
});
const EDGE_KINDS = ['renders', 'navigates', 'calls', 'reads', 'writes', 'emits', 'uses'];

export const toolDefinitions = [
  tool('get_requested_change', 'Start here. Lists the components and dependencies the developer marked as new, changed or removed in the component graph, with their notes. This is the change you are asked to implement.'),
  tool('graph_overview', 'The component graph at its highest level: what it covers and its groups of components (or, if it has no groups, every component in one line each). Use get_group or get_node to zoom in.',
    { offset: integer(0, 100_000), limit: integer(1, 200) }),
  tool('get_group', 'One group of components: its summary, subgroups, member components, and how many dependencies link it to each other group. Use the id "(ungrouped)" for components outside any group.',
    { id: str, nested: { type: 'boolean', description: 'Include components of nested subgroups (default true).' }, offset: integer(0, 100_000), limit: integer(1, 200) }, ['id']),
  tool('get_node', 'One component: summary, routes, the source files it owns, what it depends on and what depends on it, with code locations. Pass files_offset to page through its full file list.',
    { id: str, files_offset: integer(0, 100_000) }, ['id']),
  tool('get_edge', 'The dependencies from one component to another (optionally one kind), with every code location that justifies them. Pass id instead of from/to to look up one edge.',
    { from: str, to: str, kind: { enum: EDGE_KINDS }, id: str, offset: integer(0, 100_000), limit: integer(1, 500) }),
  tool('find_components', 'Find components by words in their name, summary, routes or file paths, or find which component owns a file or directory (file).',
    { query: str, file: str, kind: { enum: ['page', 'component', 'endpoint', 'service', 'model', 'store', 'job', 'external', 'other'] }, limit: integer(1, 100) }),
  tool('neighbors', 'Components connected to one component, up to two steps away, and the dependencies between them. Filter by direction and dependency kinds.',
    { id: str, depth: integer(1, 2), direction: { enum: ['out', 'in', 'both'] }, kinds: { type: 'array', items: { enum: EDGE_KINDS }, maxItems: 7 }, limit: integer(1, 200) }, ['id']),
];

class ToolError extends Error {}

function page(items, offset = 0, limit = 50) {
  const slice = items.slice(offset, offset + limit);
  const footer = offset + slice.length < items.length
    ? [`Showing ${offset + 1}-${offset + slice.length} of ${items.length}. Pass offset ${offset + slice.length} for more.`]
    : [];
  return { slice, footer };
}

function nodeOrThrow(index, id) {
  const n = index.nodes.get(id);
  if (!n) throw new ToolError(`No component with id "${id}". Use find_components to search by name.`);
  return n;
}

const countBy = items => {
  const m = new Map();
  for (const x of items) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || kindRank(a[0]) - kindRank(b[0]));
};
const PLURALS = { dependency: 'dependencies', 'component or dependency': 'components or dependencies' };
const plural = (n, word) => `${n} ${n === 1 ? word : PLURALS[word] ?? `${word}s`}`;
const changedCount = index => index.graph.nodes.filter(changeOf).length + index.graph.edges.filter(changeOf).length;

// ------------------------------------------------------------------ tools

function getRequestedChange(index, config) {
  const out = requestedChange(index, config.maxFiles);
  if (changedCount(index)) out.push('', 'Use get_node with any id above for its files and dependencies.');
  return out;
}

function graphOverview(index, config, { offset = 0, limit = 100 }) {
  const out = graphHeader(index);
  const changed = changedCount(index);
  out.push('', changed
    ? `${plural(changed, 'component or dependency')} ${changed === 1 ? 'is' : 'are'} marked as changed: call get_requested_change.`
    : 'Nothing is marked as changed.');
  if (!index.groups.size) {
    const nodes = [...index.graph.nodes].sort((a, b) => a.kind.localeCompare(b.kind) || clean(a.label).localeCompare(clean(b.label)));
    const { slice, footer } = page(nodes, offset, limit);
    out.push('', '## Components', '', 'This graph has no groups. Every component:', ...slice.map(n => nodeLine(index, n)), ...footer);
    return out;
  }
  out.push('', '## Groups', '');
  const walk = (g, depth) => {
    const total = groupMembers(index, g.id).length;
    const summary = clean(g.summary);
    out.push(`${'  '.repeat(depth)}- ${clean(g.label)} [${g.id}]: ${plural(total, 'component')}` + (summary ? `. ${summary}` : ''));
    for (const child of index.childGroups.get(g.id) ?? []) walk(child, depth + 1);
  };
  for (const g of rootGroups(index)) walk(g, 0);
  const ungrouped = index.members.get(UNGROUPED)?.length ?? 0;
  if (ungrouped) out.push(`- Ungrouped [${UNGROUPED}]: ${plural(ungrouped, 'component')} outside any group.`);
  out.push('', 'Call get_group with an id in square brackets to list its components.');
  return out;
}

function getGroup(index, config, { id, nested = true, offset = 0, limit = 60 }) {
  const ungrouped = id === UNGROUPED;
  if (!ungrouped && !index.groups.has(id)) {
    if (!index.groups.size) throw new ToolError('This graph has no groups. Use graph_overview to list every component.');
    throw new ToolError(`No group with id "${id}". Groups: ${[...index.groups.keys(), UNGROUPED].join(', ')}.`);
  }
  const g = index.groups.get(id);
  const members = groupMembers(index, id, nested);
  const inside = new Set(members.map(n => n.id));
  const out = ungrouped
    ? [`# Components outside any group [${UNGROUPED}]`]
    : [`# Group: ${groupPath(index, id)} [${id}]`];
  if (g && clean(g.summary)) out.push(clean(g.summary));
  if (g?.parent && index.groups.has(g.parent)) out.push(`Part of: ${clean(index.groups.get(g.parent).label)} [${g.parent}].`);
  const children = ungrouped ? [] : index.childGroups.get(id) ?? [];
  if (children.length) {
    out.push('', 'Subgroups:');
    for (const c of children) out.push(`- ${clean(c.label)} [${c.id}]: ${plural(groupMembers(index, c.id).length, 'component')}`);
  }

  const { slice, footer } = page(members, offset, limit);
  out.push('', `Components (${members.length}):`);
  for (const n of slice) {
    const sub = nested && n.group !== id && n.group ? ` (in ${clean(index.groups.get(n.group).label)})` : '';
    out.push(nodeLine(index, n) + sub);
  }
  out.push(...footer);

  // Dependencies that cross the group boundary, rolled up by the other end's group.
  const links = new Map();
  let within = 0;
  for (const e of index.graph.edges) {
    const fromIn = inside.has(e.from), toIn = inside.has(e.to);
    if (fromIn && toIn) { within++; continue; }
    if (!fromIn && !toIn) continue;
    const other = index.nodes.get(fromIn ? e.to : e.from);
    const key = `${fromIn ? 'out' : 'in'} ${other.group ?? UNGROUPED}`;
    if (!links.has(key)) links.set(key, { dir: fromIn ? 'out' : 'in', gid: other.group ?? UNGROUPED, kinds: [], changed: 0 });
    links.get(key).kinds.push(e.kind);
    if (changeOf(e)) links.get(key).changed++;
  }
  out.push('', `Dependencies inside this group: ${within}.`);
  if (links.size) {
    out.push('Dependencies with other groups (→ this group depends on it, ← it depends on this group):');
    const sorted = [...links.values()].sort((a, b) => b.kinds.length - a.kinds.length || a.dir.localeCompare(b.dir));
    for (const l of sorted) {
      const label = l.gid === UNGROUPED ? `Ungrouped [${UNGROUPED}]` : `${groupPath(index, l.gid)} [${l.gid}]`;
      const kinds = countBy(l.kinds).map(([k, n]) => `${k} ${n}`).join(', ');
      const changed = l.changed ? `; ${l.changed} marked as changed` : '';
      out.push(`- ${l.dir === 'out' ? '→' : '←'} ${label}: ${plural(l.kinds.length, 'dependency')} (${kinds}${changed})`);
    }
  }
  return out;
}

function getNode(index, config, { id, files_offset }) {
  const n = nodeOrThrow(index, id);
  const out = [`## ${name(index, id)}${MARK[changeOf(n)] ?? ''}`, `Kind: ${n.kind}.`];
  if (n.group) out.push(`Group: ${groupPath(index, n.group)} [${n.group}].`);
  const summary = clean(n.summary), desc = clean(n.description);
  if (summary) out.push(summary);
  if (desc && desc !== summary) out.push(desc);
  if (n.routes?.length) out.push('Routes: ' + n.routes.map(r => `\`${r}\``).join(', ') + '.');
  if (clean(n.note)) out.push(`Developer note: ${clean(n.note)}`);

  const files = n.files ?? [];
  if (!files.length) out.push('Files: none yet.');
  else if (files_offset !== undefined) {
    const { slice, footer } = page(files, files_offset, 100);
    out.push(`Files (${files.length}):`, ...slice.map(f => `- ${fileLine(f)}`), ...footer);
  } else {
    const lines = summariseFiles(files, config.maxFiles);
    out.push(`Files (${files.length}):`, ...lines.map(l => `- ${l}`));
    if (lines.length < files.length) out.push('Pass files_offset 0 to list every file.');
  }

  const byKind = (a, b, end) => kindRank(a.kind) - kindRank(b.kind) || a[end].localeCompare(b[end]);
  const outs = [...index.outgoing.get(id)].sort((a, b) => byKind(a, b, 'to'));
  const ins = [...index.incoming.get(id)].sort((a, b) => byKind(a, b, 'from'));
  if (outs.length) {
    out.push('This component:');
    for (const e of outs) {
      out.push(`- ${verb(e.kind)} **${name(index, e.to)}**${MARK[changeOf(e)] ?? ''}.${edgeDetail(e, config.evidencePerEdge)}`);
      if (changeOf(e) && clean(e.note)) out.push(`  - Developer note: ${clean(e.note)}`);
    }
  }
  if (ins.length) {
    out.push(`Used by ${plural(ins.length, 'dependency')}:`);
    for (const e of ins) {
      out.push(`- **${name(index, e.from)}** ${verb(e.kind)} this component${MARK[changeOf(e)] ?? ''}.${edgeDetail(e, config.evidencePerEdge)}`);
      if (changeOf(e) && clean(e.note)) out.push(`  - Developer note: ${clean(e.note)}`);
    }
  } else out.push('Used by 0 other components.');
  out.push('Use get_edge for every code location of a dependency.');
  return out;
}

function getEdge(index, config, { id, from, to, kind, offset = 0, limit = 100 }) {
  let edges;
  if (id) {
    const e = index.edges.get(id);
    if (!e) throw new ToolError(`No dependency with id "${id}".`);
    edges = [e];
  } else {
    if (!from || !to) throw new ToolError('Pass from and to (component ids), or id.');
    nodeOrThrow(index, from);
    nodeOrThrow(index, to);
    edges = index.outgoing.get(from).filter(e => e.to === to && (!kind || e.kind === kind));
    if (!edges.length) {
      const reverse = index.outgoing.get(to).filter(e => e.to === from).length;
      throw new ToolError(`${name(index, from)} has no${kind ? ` ${kind}` : ''} dependency on ${name(index, to)}.` +
        (reverse ? ` There ${reverse === 1 ? 'is one' : `are ${reverse}`} in the other direction.` : ''));
    }
  }
  const out = [];
  for (const e of edges.sort((a, b) => kindRank(a.kind) - kindRank(b.kind))) {
    if (out.length) out.push('');
    out.push(`## ${edgePhrase(index, e)}${MARK[changeOf(e)] ?? ''}`, `Kind: ${e.kind}. Id: ${edgeId(e)}.`);
    const label = edgeLabel(e), desc = clean(e.description);
    if (label) out.push(label);
    if (desc) out.push(desc);
    if (clean(e.note)) out.push(`Developer note: ${clean(e.note)}`);
    const refs = evidenceRefs(e);
    if (!refs.length) { out.push('Code locations: none recorded.'); continue; }
    const { slice, footer } = page(refs, offset, limit);
    out.push(`Code locations (${refs.length}):`, ...slice.map(r => `- \`${r}\``), ...footer);
  }
  return out;
}

function findComponents(index, config, { query, file, kind, limit = 20 }) {
  if (!query && !file) throw new ToolError('Pass query (words to search for) or file (a path).');
  let nodes = [...index.nodes.values()].filter(n => !kind || n.kind === kind);
  const out = [];
  if (file) {
    const p = normalizePath(file);
    const hits = [];
    for (const n of nodes) {
      const paths = (n.files ?? []).map(f => normalizePath(filePath(f)));
      const exact = paths.filter(x => x === p);
      const matched = exact.length ? exact : paths.filter(x => x.startsWith(`${p}/`) || x.endsWith(`/${p}`));
      if (matched.length) hits.push({ n, matched, exact: exact.length > 0 });
    }
    hits.sort((a, b) => b.exact - a.exact || b.matched.length - a.matched.length);
    if (!hits.length) out.push(`No component owns \`${p}\` or files under it. The graph may not cover it; try find_components with a query.`);
    else {
      out.push(`Components owning \`${p}\`${hits.some(h => !h.exact) ? ' or files under it' : ''}:`);
      for (const h of hits.slice(0, limit)) {
        out.push(nodeLine(index, h.n));
        out.push(`  - ${h.matched.length} matching file${h.matched.length === 1 ? '' : 's'}: ` +
          h.matched.slice(0, 3).map(x => `\`${x}\``).join(', ') + (h.matched.length > 3 ? ', …' : ''));
      }
    }
  }
  if (query) {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const scored = [];
    for (const n of nodes) {
      const fields = [
        [`${n.id} ${n.label}`.toLowerCase(), 3, 'name'],
        [(n.routes ?? []).join(' ').toLowerCase(), 2, 'routes'],
        [`${n.summary ?? ''} ${n.description ?? ''}`.toLowerCase(), 1, 'description'],
        [(n.files ?? []).map(filePath).join(' ').toLowerCase(), 1, 'files'],
      ];
      let score = 0;
      const where = new Set();
      const allMatch = tokens.every(t => {
        let hit = false;
        for (const [text, weight, label] of fields) if (text.includes(t)) { score += weight; where.add(label); hit = true; }
        return hit;
      });
      if (allMatch) scored.push({ n, score, where });
    }
    scored.sort((a, b) => b.score - a.score || clean(a.n.label).localeCompare(clean(b.n.label)));
    if (out.length) out.push('');
    if (!scored.length) out.push(`No component matches "${query}". Try fewer or broader words, or graph_overview.`);
    else {
      out.push(`Components matching "${query}" (${scored.length}):`);
      for (const s of scored.slice(0, limit)) out.push(`${nodeLine(index, s.n)} (matched in ${[...s.where].join(', ')})`);
      if (scored.length > limit) out.push(`${scored.length - limit} more; narrow the query or raise limit.`);
    }
  }
  return out;
}

function neighbors(index, config, { id, depth = 1, direction = 'both', kinds, limit = 80 }) {
  nodeOrThrow(index, id);
  const ok = e => !kinds?.length || kinds.includes(e.kind);
  const dist = new Map([[id, 0]]);
  const used = new Map();
  let frontier = [id];
  for (let d = 1; d <= depth; d++) {
    const next = [];
    for (const cur of frontier) {
      const steps = [
        ...(direction !== 'in' ? index.outgoing.get(cur).filter(ok).map(e => [e, e.to]) : []),
        ...(direction !== 'out' ? index.incoming.get(cur).filter(ok).map(e => [e, e.from]) : []),
      ];
      for (const [e, other] of steps) {
        used.set(edgeId(e), e);
        if (!dist.has(other)) { dist.set(other, d); next.push(other); }
      }
    }
    frontier = next;
  }
  const out = [`Components within ${depth} step${depth === 1 ? '' : 's'} of ${name(index, id)}` +
    ` (${direction === 'both' ? 'either direction' : direction === 'out' ? 'its dependencies' : 'what depends on it'}` +
    `${kinds?.length ? `; ${kinds.join(', ')} only` : ''}):`];
  const found = [...dist].filter(([nid]) => nid !== id);
  if (!found.length) out.push('None.');
  for (let d = 1; d <= depth; d++) {
    const at = found.filter(([, x]) => x === d).map(([nid]) => index.nodes.get(nid));
    if (!at.length) continue;
    if (depth > 1) out.push(`Step ${d}:`);
    out.push(...at.slice(0, limit).map(n => nodeLine(index, n)));
    if (at.length > limit) out.push(`${at.length - limit} more not shown.`);
  }
  const edges = [...used.values()].sort((a, b) => a.from.localeCompare(b.from) || kindRank(a.kind) - kindRank(b.kind));
  if (edges.length) {
    out.push('', `Dependencies (${edges.length}):`);
    out.push(...edges.slice(0, limit).map(e => `- ${edgePhrase(index, e)}${MARK[changeOf(e)] ?? ''}.`));
    if (edges.length > limit) out.push(`${edges.length - limit} more not shown; filter by kinds or direction.`);
  }
  return out;
}

const HANDLERS = {
  get_requested_change: getRequestedChange, graph_overview: graphOverview, get_group: getGroup, get_node: getNode,
  get_edge: getEdge, find_components: findComponents, neighbors,
};

// ------------------------------------------------------------------ host

export const DEFAULTS = { maxChars: 12_000, maxFiles: 40, evidencePerEdge: 2, maxCalls: Infinity };

/**
 * config: { graph: path, runDir?: where tools.jsonl goes, tools?: names to expose, maxChars?, maxFiles?,
 *           evidencePerEdge?: locations per dependency in get_node (text channel: 2), maxCalls? }
 */
export function createGraphTools(config) {
  config = { ...DEFAULTS, ...config };
  const text = readFileSync(config.graph, 'utf8');
  const index = indexGraph(validateGraph(parse(text)));
  const definitions = config.tools
    ? toolDefinitions.filter(t => config.tools.includes(t.name))
    : toolDefinitions;
  const unknown = (config.tools ?? []).filter(t => !HANDLERS[t]);
  if (unknown.length) throw new Error(`Unknown tools: ${unknown.join(', ')}`);
  const ajv = new Ajv({ allErrors: true });
  const validators = new Map(definitions.map(d => [d.name, ajv.compile(d.inputSchema)]));
  if (config.runDir) mkdirSync(config.runDir, { recursive: true });
  const audit = event => config.runDir &&
    appendFileSync(join(config.runDir, 'tools.jsonl'), `${JSON.stringify({ time: new Date().toISOString(), ...event })}\n`);
  audit({
    event: 'server_started', graph: resolve(config.graph), graph_sha256: createHash('sha256').update(text).digest('hex'),
    tools: definitions.map(d => d.name), max_chars: config.maxChars, max_files: config.maxFiles,
    evidence_per_edge: config.evidencePerEdge, changed: changedCount(index),
  });
  let calls = 0;
  return {
    index, definitions,
    call(name, args = {}) {
      calls++;
      const started = Date.now();
      try {
        if (calls > config.maxCalls) throw new ToolError('Graph tool-call limit reached.');
        const validate = validators.get(name);
        if (!validate) throw new ToolError(`Unknown tool: ${name}`);
        if (!validate(args)) throw new ToolError(`Invalid arguments for ${name}: ${ajv.errorsText(validate.errors)}`);
        let result = HANDLERS[name](index, config, args).join('\n');
        let truncated = false;
        if (result.length > config.maxChars) {
          const cut = result.lastIndexOf('\n', config.maxChars);
          result = result.slice(0, cut > 0 ? cut : config.maxChars) +
            `\n[Output cut at ${config.maxChars} characters. Use offset/limit or a narrower request.]`;
          truncated = true;
        }
        audit({ event: 'tool_result', name, args, chars: result.length, approx_tokens: Math.ceil(result.length / 4), truncated, elapsed_ms: Date.now() - started, result });
        return { content: [{ type: 'text', text: result }], isError: false };
      } catch (error) {
        if (!(error instanceof ToolError)) console.error(error);
        audit({ event: 'tool_error', name, args, error: error.message, elapsed_ms: Date.now() - started });
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    },
  };
}
