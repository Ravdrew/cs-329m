// The update step: start a draft from the previous commit's graph instead of an empty one.
import { git, sha256 } from './source.mjs';
import { parseYaml, yaml } from './graph.mjs';

const fileOf = f => (typeof f === 'string' ? f : f.path);

/**
 * The previous graph as a draft for `source`. A citation is kept, and counts as read, if its file is byte-identical at the
 * new commit or the text of its lines at the previous commit still appears there exactly once (its lines are then updated). Every other citation is
 * dropped and its entry is listed in `pending`. The previous commit must be in the checkout (fetchCommit).
 */
export function seedDraft(text, source) {
  const previous = parseYaml(text);
  const before = new Map(previous['x-source-files'].map(f => [f.path, f.sha256]));
  const unchanged = path => source.allowed.has(path) && sha256(source.contents(path).bytes) === before.get(path);
  const old = new Map();
  const linesBefore = path => {
    if (!old.has(path)) old.set(path, git(source.root, ['show', `${previous.commit}:${path}`]).split(/\r?\n/u));
    return old.get(path);
  };
  const locate = ({ path, start_line, end_line }) => {
    if (unchanged(path)) return { path, start_line, end_line };
    if (!source.allowed.has(path)) return null;
    const { lines } = source.contents(path);
    const want = linesBefore(path).slice(start_line - 1, end_line);
    if (!want.join('').trim()) return null;
    const starts = [];
    for (let i = 0; i + want.length <= lines.length && starts.length < 2; i++) if (want.every((l, j) => lines[i + j] === l)) starts.push(i + 1);
    return starts.length === 1 ? { path, start_line: starts[0], end_line: starts[0] + want.length - 1 } : null;
  };
  const pending = new Map();
  const carried = new Map();
  const carry = item => {
    const { evidence: _host, 'x-source-evidence': list, ...rest } = item;
    const kept = [];
    const dropped = new Set();
    for (const entry of list) {
      const now = locate(entry);
      if (now) { kept.push(now); carried.set(now.path, [...(carried.get(now.path) ?? []), [now.start_line, now.end_line]]); }
      else dropped.add(entry.path);
    }
    for (const f of rest.files ?? []) if (!source.allowed.has(fileOf(f)) || (f.lines && !unchanged(fileOf(f)))) dropped.add(fileOf(f));
    if (dropped.size) pending.set(item.id, [...dropped].map(path => `${path}${source.allowed.has(path) ? '' : ' (deleted or moved)'}`));
    return { ...rest, 'x-source-evidence': kept };
  };
  const document = {
    version: previous.version, repo: previous.repo, commit: source.commit, title: previous.title, description: previous.description,
    groups: previous.groups, nodes: previous.nodes.map(carry), edges: previous.edges.map(carry), 'x-variant': 'llm-only-chained', 'x-scope': previous['x-scope'],
  };
  return { previous, document, pending, carried };
}

/** Add one earlier commit to a checkout that holds only the pinned one. */
export function fetchCommit(checkout, remote, commit) {
  git(checkout, ['fetch', '--quiet', '--depth=1', '--no-tags', '--no-recurse-submodules', remote, commit], { timeout: 300_000 });
}

/** Product source files that changed between the two commits. */
export function changedFiles(checkout, from, to) {
  const fields = git(checkout, ['diff', '--name-status', '-z', '-M', '-l5000', from, to], { timeout: 120_000 }).split('\0').filter(Boolean);
  const changes = [];
  for (let i = 0; i < fields.length;) {
    const status = fields[i++][0];
    changes.push(status === 'R' || status === 'C' ? { status, from: fields[i++], path: fields[i++] } : { status, path: fields[i++] });
  }
  const product = p => /\.(ts|tsx|mts|js|mjs|prisma)$/.test(p) && !/(\.(test|spec|e2e|d)\.|__tests__|__mocks__|\/(playwright|test|tests|fixtures|migrations)\/|^(apps\/api|packages\/platform|docs)\/)/.test(p);
  return changes.filter(c => product(c.path) || (c.from && product(c.from)));
}

/** The part of the instructions that shows the previous graph, what must be reviewed, and what changed. */
export function seedInstructions({ previous, document, pending }, changes) {
  const one = s => changes.filter(c => c.status === s);
  const modified = new Map();
  for (const { path } of [...one('M'), ...one('T')]) {
    const dir = path.slice(0, path.lastIndexOf('/') + 1);
    modified.set(dir, [...(modified.get(dir) ?? []), path.slice(dir.length)]);
  }
  return [
    `## Previous graph (commit ${previous.commit})`, '', yaml({ groups: document.groups, nodes: document.nodes, edges: document.edges }),
    `## Must be reviewed (${pending.size} entries)`, '', ...[...pending].map(([id, files]) => `- ${id}: ${files.join(', ')}`), '',
    `## Files changed since the previous graph (${changes.length}; tests, API v1/v2 and the platform SDK left out)`, '',
    'Added:', ...one('A').map(c => `- ${c.path}`), '', 'Deleted:', ...one('D').map(c => `- ${c.path}`), '',
    'Renamed or copied:', ...[...one('R'), ...one('C')].map(c => `- ${c.from} -> ${c.path}`), '',
    'Modified:', ...[...modified].map(([dir, names]) => `- ${dir}: ${names.join(', ')}`), '',
  ].join('\n');
}
