import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const sha256 = data => createHash('sha256').update(data).digest('hex');
const gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' };
export function git(root, args, options = {}) {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', ...args], {
    cwd: root, env: gitEnv, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'], ...options,
  });
}

export function safePath(path, allowEmpty = false) {
  if (typeof path !== 'string' || (!path && !allowEmpty) || isAbsolute(path) ||
      path.includes('\\') || /[\x00-\x1f]/u.test(path) ||
      path.split('/').some(p => p === '..' || p === '.' || p === '.git')) {
    throw new Error('Use a relative tracked source path without dot segments');
  }
  return path;
}

export function assertOutsideRepository(directory, teamRoot) {
  const root = realpathSync(directory);
  const inside = relative(realpathSync(teamRoot), root);
  if (!inside || (!inside.startsWith(`..${sep}`) && inside !== '..' && !isAbsolute(inside))) {
    throw new Error('Run directories must be outside the team repository');
  }
  let enclosing;
  try { enclosing = git(root, ['rev-parse', '--show-toplevel']).trim(); } catch { /* not a repository */ }
  if (enclosing) throw new Error('Run directories must not be inside any existing Git checkout');
}

export function prepareCheckout({ directory, commit, remote, source = remote }) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('The target must be a full lowercase commit SHA');
  if (!source || source.startsWith('-')) throw new Error('Invalid checkout source');
  mkdirSync(directory); // Deliberately refuse an existing checkout, even an empty one.
  git(directory, ['init', '--quiet', '--template=']);
  git(directory, ['remote', 'add', 'origin', remote]);
  git(directory, ['fetch', '--quiet', '--depth=1', '--no-tags', '--no-recurse-submodules', source, commit], { timeout: 300_000 });
  git(directory, ['checkout', '--quiet', '--detach', commit]);
  return new Source(directory, commit);
}

export class Source {
  constructor(root, commit) {
    this.root = realpathSync(root);
    this.commit = commit;
    this.reads = new Map();
    this.assertClean();
    // Only regular files: no symbolic links, submodules, untracked files or .git internals.
    this.files = git(root, ['ls-tree', '-rz', '--full-tree', commit]).split('\0').filter(Boolean)
      .flatMap(entry => {
        const split = entry.indexOf('\t');
        return /^100(644|755) blob /.test(entry.slice(0, split)) ? [entry.slice(split + 1)] : [];
      }).sort();
    this.allowed = new Set(this.files);
  }

  assertClean() {
    if (git(this.root, ['rev-parse', 'HEAD']).trim() !== this.commit) throw new Error('Checkout commit differs from the pin');
    if (git(this.root, ['status', '--porcelain', '--untracked-files=all']).trim()) {
      throw new Error('Source checkout must contain only unchanged tracked files');
    }
  }

  contents(path) {
    safePath(path);
    if (!this.allowed.has(path)) throw new Error(`Not an allowed tracked regular file: ${path}`);
    let current = this.root;
    for (const segment of path.split('/')) {
      current = join(current, segment);
      if (lstatSync(current).isSymbolicLink()) throw new Error('Symbolic links are not readable');
    }
    const stat = lstatSync(current);
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error('Source file is not regular text under 2 MiB');
    const bytes = readFileSync(current);
    if (bytes.includes(0)) throw new Error('Binary source files are not readable');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const lines = text.split(/\r?\n/u);
    if (lines.at(-1) === '') lines.pop();
    return { bytes, lines };
  }

  list({ contains = '', offset = 0, limit = 100 } = {}) {
    const files = this.files.filter(path => path.includes(contains));
    return { files: files.slice(offset, offset + limit), total: files.length, next_offset: offset + limit < files.length ? offset + limit : null };
  }

  read({ path, start_line = 1, end_line = start_line + 99 }) {
    const { lines } = this.contents(path);
    const end = Math.min(end_line, lines.length);
    if (!Number.isInteger(start_line) || !Number.isInteger(end_line) || start_line < 1 || end < start_line || end_line - start_line >= 200) {
      throw new Error('Read a valid inclusive range of at most 200 lines');
    }
    const excerpt = lines.slice(start_line - 1, end).join('\n');
    if (excerpt.length > 24_000) throw new Error('Requested text exceeds 24,000 characters; read fewer lines');
    this.reads.set(path, [...(this.reads.get(path) ?? []), [start_line, end]]);
    return { path, start_line, end_line: end, total_lines: lines.length, excerpt };
  }

  search({ query, prefix = '', offset = 0, limit = 40 }) {
    safePath(prefix, true);
    if (!query || query.length > 200 || /[\r\n\0]/u.test(query)) throw new Error('Search needs a single literal string of 1–200 characters');
    let output;
    try {
      output = git(this.root, ['grep', '-z', '-n', '-I', '-i', '-F', '-e', query, this.commit, '--', ...(prefix ? [`:(top,literal)${prefix}`] : [])], { timeout: 30_000 });
    } catch (error) {
      if (error.status === 1) return { matches: [], total: 0, next_offset: null };
      throw new Error('Search exceeded its bounds or failed; narrow the directory prefix');
    }
    const matches = [];
    // git grep -z emits name NUL line-number NUL text LF.
    const records = /([^\0]+)\0(\d+)\0([^\n]*)(?:\n|$)/gu;
    for (const match of output.matchAll(records)) {
      const path = match[1].slice(this.commit.length + 1);
      if (this.allowed.has(path)) matches.push({ path, line: Number(match[2]), text: match[3].slice(0, 600) });
    }
    return { matches: matches.slice(offset, offset + limit), total: matches.length, next_offset: offset + limit < matches.length ? offset + limit : null };
  }

  evidence({ path, start_line, end_line, excerpt }) {
    const { lines } = this.contents(path);
    if (!Number.isInteger(start_line) || !Number.isInteger(end_line) || start_line < 1 || end_line < start_line || end_line > lines.length || end_line - start_line >= 200) {
      throw new Error(`Invalid evidence range: ${path}:${start_line}-${end_line}`);
    }
    const covered = this.reads.get(path) ?? [];
    for (let line = start_line; line <= end_line; line++) {
      if (!covered.some(([a, b]) => a <= line && line <= b)) throw new Error(`Evidence was not read: ${path}:${line}; use read_source first`);
    }
    const exact = lines.slice(start_line - 1, end_line).join('\n');
    if (excerpt !== undefined && excerpt !== exact) throw new Error(`Evidence excerpt differs from source: ${path}:${start_line}`);
    return { path, start_line, end_line, excerpt: exact };
  }
}
