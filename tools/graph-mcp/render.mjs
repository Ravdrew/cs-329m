// Text rendering shared by every tool. Ported from q2q3-tools/graph_to_text.py (the text channel) so both
// channels show the agent the same facts in the same words. Same exclusions: no x-* fields (never read here),
// no provenance, no evidence notes or symbols, fenced code replaced with "[code omitted]".
import { changeOf, filePath, groupChain } from './graph.mjs';

export const VERB = {
  renders: 'renders', navigates: 'navigates to', calls: 'calls', reads: 'reads from',
  writes: 'writes to', emits: 'emits events to', uses: 'uses',
};
export const KIND_ORDER = ['renders', 'navigates', 'calls', 'reads', 'writes', 'emits', 'uses'];
const FENCE = /```[\s\S]*?(```|$)/g;
const AUTO_EDGE_LABEL = /^(renders|navigates|calls|reads|writes|emits|uses) \(\d+\)$/;
export const MARK = { new: ' (NEW, requested)', modify: ' (TO CHANGE, requested)', delete: ' (TO REMOVE, requested)' };

/** Collapse whitespace and drop fenced code; '' for empty values. */
export function clean(text) {
  if (!text) return '';
  return String(text).replace(FENCE, '[code omitted]').split(/\s+/).filter(Boolean).join(' ');
}

export const name = (index, id) => {
  const n = index.nodes.get(id);
  return n ? `${clean(n.label)} [${id}]` : id;
};

export function fileLine(ref) {
  if (typeof ref === 'string') return `\`${ref}\``;
  const extra = [];
  if (ref.role) extra.push(ref.role);
  if (ref.lines) extra.push(`lines ${ref.lines[0]}-${ref.lines[1]}`);
  return `\`${ref.path}\`` + (extra.length ? ` (${extra.join(', ')})` : '');
}

/** Every file when there are few; otherwise the files with a role, then directories with counts. */
export function summariseFiles(files, limit) {
  if (limit === 0 || files.length <= limit) return files.map(fileLine);
  const lines = files.filter(f => typeof f === 'object' && f.role).map(f => `${fileLine(f)} (key file)`);
  let dirs = new Map();
  for (const f of files) {
    const p = filePath(f);
    const d = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.';
    dirs.set(d, (dirs.get(d) ?? 0) + 1);
  }
  // merge directories upward until the list fits
  let depth = Math.max(...[...dirs.keys()].map(d => d.split('/').length - 1)) + 1;
  while (dirs.size > limit && depth > 0) {
    depth--;
    const merged = new Map();
    for (const [d, n] of dirs) {
      const key = d.split('/').slice(0, depth + 1).join('/');
      merged.set(key, (merged.get(key) ?? 0) + n);
    }
    dirs = merged;
  }
  const sorted = [...dirs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return lines.concat(sorted.map(([d, n]) => `\`${d}/\` (${n} file${n !== 1 ? 's' : ''})`));
}

/** Unique `file:line` references, in file order. */
export function evidenceRefs(edge) {
  const refs = [];
  for (const ev of edge.evidence ?? []) {
    const ref = ev.file + (ev.line ? `:${ev.line}` : '');
    if (!refs.includes(ref)) refs.push(ref);
  }
  return refs;
}

export function evidenceText(edge, perEdge = 2) {
  const refs = evidenceRefs(edge);
  if (!refs.length) return '';
  const shown = refs.slice(0, perEdge).map(r => `\`${r}\``).join(', ');
  const more = refs.length > perEdge ? ` and ${refs.length - perEdge} more` : '';
  return ` Evidence: ${shown}${more}.`;
}

export const verb = kind => VERB[kind] ?? kind;
export const edgePhrase = (index, e) => `**${name(index, e.from)}** ${verb(e.kind)} **${name(index, e.to)}**`;

function sentence(text) {
  text = text.replace(/\.+$/, '');
  return text ? text[0].toUpperCase() + text.slice(1) + '.' : '';
}

/** The edge's own label (unless auto-generated, e.g. "uses (4)"). */
export function edgeLabel(e) {
  const label = clean(e.label);
  return label && !AUTO_EDGE_LABEL.test(label) ? label : '';
}

export function edgeDetail(e, perEdge = 2) {
  const parts = [];
  const label = edgeLabel(e);
  if (label) parts.push(sentence(label));
  const desc = clean(e.description);
  if (desc) parts.push(sentence(desc));
  const text = parts.join(' ');
  return (text ? ` ${text}` : '') + evidenceText(e, perEdge);
}

export const kindRank = kind => (KIND_ORDER.includes(kind) ? KIND_ORDER.indexOf(kind) : 99);

export function groupPath(index, gid) {
  return groupChain(index, gid).map(id => clean(index.groups.get(id).label)).join(' > ');
}

/** "This is a component-level map of ..." — the text channel's opening. */
export function graphHeader(index) {
  const { graph } = index;
  const out = [`# ${clean(graph.title) || 'Component graph'}`, ''];
  let head = `This is a component-level map of the \`${graph.repo ?? 'repository'}\` code`;
  if (graph.commit) head += ` at commit \`${String(graph.commit).slice(0, 12)}\``;
  head += `. It has ${graph.nodes.length} components and ${graph.edges.length} dependencies between them. ` +
    'Component names are followed by their id in square brackets. A sentence such as "A calls B" means code in A ' +
    'depends on B.';
  out.push(head);
  const desc = clean(graph.description);
  if (desc) out.push('', desc);
  return out;
}

/** The text channel's "## Requested change" section, byte for byte. */
export function requestedChange(index, maxFiles = 40) {
  const { graph } = index;
  const nodes = graph.nodes.filter(changeOf), edges = graph.edges.filter(changeOf);
  const out = ['## Requested change', ''];
  if (!nodes.length && !edges.length) {
    out.push('None. The graph describes the code as it is; no component or dependency is marked as changed.');
    return out;
  }
  out.push('The developer marked these parts of the graph as changed. Implement them; the rest of the graph ' +
    'below is the code as it is now.');
  const verbs = { new: 'Add component', modify: 'Change component', delete: 'Remove component' };
  for (const n of nodes) {
    const status = changeOf(n), summary = clean(n.summary);
    out.push(`- ${verbs[status]} ${name(index, n.id)} (${n.kind})` + (summary ? `: ${summary}` : '.'));
    if (status === 'new' && clean(n.description)) out.push(`  - Description: ${clean(n.description)}`);
    if (n.routes?.length) out.push('  - Routes: ' + n.routes.map(r => `\`${r}\``).join(', '));
    if (clean(n.note)) out.push(`  - Developer note: ${clean(n.note)}`);
    if (status === 'new' && n.files?.length) out.push('  - Files: ' + summariseFiles(n.files, maxFiles).join(', '));
  }
  const everbs = { new: 'Add dependency', modify: 'Change dependency', delete: 'Remove dependency' };
  for (const e of edges) {
    let line = `- ${everbs[changeOf(e)]}: ${edgePhrase(index, e)}.`;
    const label = edgeLabel(e);
    if (label) line += ` (${label})`;
    out.push(line);
    if (clean(e.note)) out.push(`  - Developer note: ${clean(e.note)}`);
  }
  return out;
}

/** One line per node, for lists: "- Name [id] (kind): summary". */
export function nodeLine(index, n) {
  const summary = clean(n.summary);
  return `- ${name(index, n.id)} (${n.kind})${MARK[changeOf(n)] ?? ''}` + (summary ? `: ${summary}` : '');
}
