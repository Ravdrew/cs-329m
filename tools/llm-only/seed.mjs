// The update step: start a draft from the previous commit's graph instead of an empty one.
import { git, sha256 } from './source.mjs';
import { inScope } from './quality.mjs';
import { MAX_DIRECTORY_FILES, parseYaml, SOURCE_FILE, TEST_FILE, yaml } from './graph.mjs';

const fileOf = f => (typeof f === 'string' ? f : f.path);

/**
 * The previous graph as a draft for `source`. A citation is kept, and counts as read, if its file is byte-identical at the
 * new commit or the text of its lines at the previous commit still appears there exactly once (its lines are then updated). Every other citation is
 * dropped and its entry is listed in `pending`. The previous commit must be in the checkout (fetchCommit).
 */
export function seedDraft(text, source, { membership = 'evidence' } = {}) {
  if (membership === 'full') return seedFull(text, source);
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

const memberSource = p => SOURCE_FILE.test(p) && !TEST_FILE.test(p);
const dirsOf = path => { const out = []; for (let i = path.indexOf('/'); i >= 0; i = path.indexOf('/', i + 1)) out.push(path.slice(0, i + 1)); return out; };
/** Directories (trailing slash) all of whose member-source files, at least two and at most MAX_DIRECTORY_FILES, are in `owned`. */
export function completeDirectories(owned, files) {
  const total = new Map();
  const mine = new Map();
  for (const p of files) if (memberSource(p)) for (const d of dirsOf(p)) { total.set(d, (total.get(d) ?? 0) + 1); if (owned.has(p)) mine.set(d, (mine.get(d) ?? 0) + 1); }
  return new Set([...mine].filter(([d, n]) => n === total.get(d) && n >= 2 && n <= MAX_DIRECTORY_FILES).map(([d]) => d));
}

/**
 * The update step for full membership (scope wide-full). The host applies what needs no judgement, and the model
 * reviews the rest:
 * - member files that were deleted are dropped, and renamed ones follow their new path;
 * - a new source file joins every component that owned all the source files of a directory it is added to (the
 *   graph stores directory entries expanded, so this re-expands them);
 * - a citation is kept if its file is unchanged or its lines still appear exactly once in the (possibly renamed) file.
 * Nothing has to be resubmitted: finalization still rejects an entry left without evidence or files, and the
 * instructions list what changed so the model can decide what is now wrong.
 */
function seedFull(text, source) {
  const previous = parseYaml(text);
  const old = previous.commit;
  const before = new Map(previous['x-source-files'].map(f => [f.path, f.sha256]));
  const oldFiles = git(source.root, ['ls-tree', '-r', '-z', '--name-only', '--full-tree', old], { maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
  const oldSet = new Set(oldFiles);
  const renamed = new Map();
  const fields = git(source.root, ['diff', '--name-status', '-z', '-M', '-l20000', old, source.commit], { maxBuffer: 64 * 1024 * 1024, timeout: 300_000 }).split('\0').filter(Boolean);
  for (let i = 0; i < fields.length;) {
    const status = fields[i++][0];
    if (status === 'R' || status === 'C') { const from = fields[i++], to = fields[i++]; if (status === 'R') renamed.set(from, to); } else i++;
  }
  const now = path => (source.allowed.has(path) ? path : renamed.has(path) && source.allowed.has(renamed.get(path)) ? renamed.get(path) : null);
  const contentSha = new Map();
  const shaNow = path => { if (!contentSha.has(path)) contentSha.set(path, sha256(source.contents(path).bytes)); return contentSha.get(path); };
  const unchanged = (oldPath, newPath) => newPath !== null && before.has(oldPath) && shaNow(newPath) === before.get(oldPath);
  const oldLines = new Map();
  const linesBefore = path => { if (!oldLines.has(path)) oldLines.set(path, git(source.root, ['show', `${old}:${path}`], { maxBuffer: 64 * 1024 * 1024 }).split(/\r?\n/u)); return oldLines.get(path); };
  const locate = ({ path, start_line, end_line }) => {
    const target = now(path);
    if (!target) return null;
    if (unchanged(path, target)) return { path: target, start_line, end_line };
    const { lines } = source.contents(target);
    const want = linesBefore(path).slice(start_line - 1, end_line);
    if (!want.join('').trim()) return null;
    const starts = [];
    for (let i = 0; i + want.length <= lines.length && starts.length < 2; i++) if (want.every((l, j) => lines[i + j] === l)) starts.push(i + 1);
    return starts.length === 1 ? { path: target, start_line: starts[0], end_line: starts[0] + want.length - 1 } : null;
  };
  const renameTargets = new Set(renamed.values());
  const added = source.files.filter(p => !oldSet.has(p) && memberSource(p) && !renameTargets.has(p));
  const addedSet = new Set(added);
  const taken = new Set();
  const carried = new Map();
  const report = new Map();
  const carry = (item, isNode) => {
    const { evidence: _host, 'x-source-evidence': list, ...rest } = item;
    const r = { gone: [], moved: 0, dropped: [], renamed: [], added: [], changed: [] };
    const kept = [];
    for (const entry of list ?? []) {
      const at = locate(entry);
      if (at) { kept.push(at); carried.set(at.path, [...(carried.get(at.path) ?? []), [at.start_line, at.end_line]]); if (at.start_line !== entry.start_line || at.path !== entry.path) r.moved++; }
      else r.gone.push(`${entry.path}:${entry.start_line}-${entry.end_line}`);
    }
    if (isNode) {
      const owned = new Set((rest.files ?? []).map(fileOf));
      const files = [];
      const seen = new Set();
      for (const f of rest.files ?? []) {
        const p = fileOf(f), q = now(p);
        if (!q) { r.dropped.push(p); continue; }
        if (q !== p) r.renamed.push(`${p} -> ${q}`);
        if (!unchanged(p, q)) r.changed.push(q);
        if (seen.has(q)) continue;
        seen.add(q);
        if (typeof f === 'string') files.push(q);
        else { const { lines, ...entry } = f; files.push({ ...entry, path: q, ...(lines && unchanged(p, q) ? { lines } : {}) }); }
      }
      const complete = completeDirectories(owned, oldFiles);
      for (const p of added) if (!seen.has(p) && dirsOf(p).some(d => complete.has(d))) { files.push(p); seen.add(p); r.added.push(p); taken.add(p); }
      rest.files = files;
    }
    if (r.gone.length || r.dropped.length || r.renamed.length || r.added.length || r.changed.length || r.moved) report.set(item.id, r);
    return { ...rest, 'x-source-evidence': kept };
  };
  const document = {
    version: previous.version, repo: previous.repo, commit: source.commit, title: previous.title, description: previous.description,
    groups: previous.groups, nodes: previous.nodes.map(n => carry(n, true)), edges: previous.edges.map(e => carry(e, false)), 'x-variant': 'llm-only-chained', 'x-scope': previous['x-scope'],
  };
  // Only files in the scope are worth the model's attention; the rest stay out of the graph, as in a fresh build.
  const unassigned = added.filter(p => !taken.has(p) && inScope(p));
  return { previous, document, pending: new Map(), carried, report, added: addedSet, unassigned, renamed };
}

/** Files of a node for the prompt: whole directories as `dir/ (n files)`, the rest one by one. */
export function compactFiles(files, allFiles) {
  const owned = new Set(files.map(fileOf));
  const complete = completeDirectories(owned, allFiles);
  const top = [...complete].filter(d => !dirsOf(d.slice(0, -1)).some(a => complete.has(a))).sort();
  const count = new Map(top.map(d => [d, 0]));
  const singles = [];
  for (const p of [...owned].sort()) { const d = top.find(t => p.startsWith(t)); if (d && memberSource(p)) count.set(d, count.get(d) + 1); else singles.push(p); }
  return [...top.map(d => `${d} (${count.get(d)} files)`), ...singles];
}

/** The instructions for a full-membership update: the previous graph in brief, and what changed since. */
export function seedInstructionsFull(seed, source, numstat, commits) {
  const { previous, document, report, unassigned } = seed;
  const brief = {
    groups: document.groups,
    nodes: document.nodes.map(n => { const files = compactFiles(n.files ?? [], source.files); return { id: n.id, label: n.label, kind: n.kind, group: n.group, summary: n.summary, files: files.length > 25 ? [...files.slice(0, 25), `... ${files.length - 25} more (inspect_graph ${n.id})`] : files }; }),
    edges: document.edges.map(e => ({ id: e.id, from: e.from, to: e.to, kind: e.kind, label: e.label })),
  };
  const broken = [];
  for (const n of document.nodes) {
    const members = new Set((n.files ?? []).map(fileOf));
    if (!members.size) broken.push(`- ${n.id}: every member file was deleted`);
    else if (!n['x-source-evidence'].some(e => members.has(e.path))) broken.push(`- ${n.id}: no citation left in its member files`);
  }
  for (const e of document.edges) if (!e['x-source-evidence'].length) broken.push(`- ${e.id}: no citation left`);
  const churn = p => { const s = numstat.get(p); return s ? s[0] + s[1] : 0; };
  const gone = [...report].filter(([, r]) => r.gone.length).map(([id, r]) => `- ${id}: ${r.gone.join(', ')}`);
  const changed = [];
  for (const n of document.nodes) {
    const r = report.get(n.id);
    if (!r?.changed.length) continue;
    const list = [...r.changed].sort((a, b) => churn(b) - churn(a));
    const shown = list.slice(0, 12).map(p => `${p} (+${numstat.get(p)?.[0] ?? '?'} -${numstat.get(p)?.[1] ?? '?'})`);
    changed.push(`- ${n.id}: ${shown.join(', ')}${list.length > 12 ? `, and ${list.length - 12} more` : ''}`);
  }
  const host = [];
  for (const [id, r] of report) {
    const parts = [r.dropped.length && `${r.dropped.length} deleted files dropped`, r.renamed.length && `${r.renamed.length} renamed files followed`, r.added.length && `${r.added.length} new files added (${[...new Set(r.added.map(p => p.slice(0, p.lastIndexOf('/') + 1)))].slice(0, 4).join(', ')})`].filter(Boolean);
    if (parts.length) host.push(`- ${id}: ${parts.join('; ')}`);
  }
  const byDir = new Map();
  for (const p of unassigned) { const d = p.slice(0, p.lastIndexOf('/') + 1); byDir.set(d, [...(byDir.get(d) ?? []), p.slice(d.length)]); }
  const newFiles = [...byDir].sort().map(([d, names]) => `- ${d}: ${names.length > 8 ? `${names.slice(0, 8).join(', ')}, and ${names.length - 8} more` : names.join(', ')}`);
  return [
    `## Previous graph (commit ${previous.commit}), in brief`, '',
    'Whole directories are shown as `dir/ (n files)`. inspect_graph gives any entry in full, with every file and citation.', '',
    yaml(brief),
    `## History`, '', `${commits} commits lie between the previous graph's commit and the pinned one. git_log, git_show, git_diff and git_blame cover exactly that range.`, '',
    `## Must be fixed (${broken.length})`, '', ...(broken.length ? broken : ['None.']), '',
    `## Cited code is gone (${gone.length} entries)`, '', 'These citations no longer match the code. The entry keeps its other citations.', '', ...(gone.length ? gone : ['None.']), '',
    `## Member files that changed (${changed.length} components; most changed first, lines added and removed)`, '', ...(changed.length ? changed : ['None.']), '',
    `## Already applied by the host (${host.length} components)`, '', ...(host.length ? host : ['None.']), '',
    `## New source files no component lists (${unassigned.length})`, '', 'Files in the scope that the host could not place. Tests, API v1/v2, the platform SDK and other out-of-scope areas are left out.', '', ...(newFiles.length ? newFiles : ['None.']), '',
  ].join('\n');
}

/** Lines added and removed per file between two commits (by the new path). */
export function numstat(checkout, from, to) {
  const out = git(checkout, ['diff', '--numstat', '-z', '-M', '-l20000', from, to], { maxBuffer: 64 * 1024 * 1024, timeout: 300_000 }).split('\0');
  const map = new Map();
  for (let i = 0; i < out.length; i++) {
    const m = out[i].match(/^(\d+|-)\t(\d+|-)\t(.*)$/s);
    if (!m) continue;
    const [a, d] = [m[1], m[2]].map(x => (x === '-' ? 0 : Number(x)));
    if (m[3]) map.set(m[3], [a, d]); else { i += 2; map.set(out[i], [a, d]); }
  }
  return map;
}
