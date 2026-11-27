// REPORTING ONLY: how much of a benchmark PR's source change a graph covers. Uses the PR's real file list (the
// answer), so it must never decide whether a graph is accepted or rebuilt (quality.mjs does that, PR-blind); it
// describes the graphs in the write-up.
//
//   node tools/llm-only/pr-coverage.mjs GRAPH.yaml PULL [EDIT.yaml] [--json]
//
//   in_graph         PR files that some component lists
//   existing_*       the same, counting only PR files that exist at the base commit (modified, deleted or renamed);
//                    files the PR adds cannot be in a graph of the code before it
//   in_changed       (with EDIT) PR files listed by a component the edit marks, or by an endpoint of a marked edge
//   within_one_step  (with EDIT) ... or by a direct neighbour of one
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseYaml } from './graph.mjs';

// Task data (benchmark/tasks.json, q2q3-tools/task_overrides.json) from TASK_DATA_ROOT, e.g. the master checkout when
// this branch predates them; default this checkout.
const TEAM_ROOT = resolve(process.env.TASK_DATA_ROOT ?? resolve(new URL('.', import.meta.url).pathname, '../..'));
const CHANGED = new Set(['new', 'modify', 'delete']);

/** The PR's source files as harness.py counts them: renames by new path, hidden support files left out. */
export function prFiles(pull, root = TEAM_ROOT, { existingOnly = false } = {}) {
  const task = JSON.parse(readFileSync(join(root, 'benchmark/tasks.json'), 'utf8')).find(t => t.pull_number === Number(pull));
  if (!task) throw new Error(`No task ${pull}`);
  const overridesFile = join(root, 'q2q3-tools/task_overrides.json');
  const support = new Set(existsSync(overridesFile) ? JSON.parse(readFileSync(overridesFile, 'utf8'))[String(pull)]?.hidden_support_files ?? [] : []);
  // Entries are STATUS:path (renames STATUS:old<TAB>new); A is a file the PR adds.
  const entries = task.source_files.filter(e => !existingOnly || !e.startsWith('A'));
  return [...new Set(entries.map(e => e.slice(e.indexOf(':') + 1).split('\t').at(-1)))].filter(p => !support.has(p)).sort();
}

export function prCoverage(graph, pull, edit) {
  const gold = prFiles(pull);
  const filesOf = n => (n?.files ?? []).map(f => (typeof f === 'string' ? f : f.path));
  const owned = new Set(graph.nodes.flatMap(filesOf));
  const existing = new Set(prFiles(pull, TEAM_ROOT, { existingOnly: true }));
  const ex = list => list.filter(p => existing.has(p)).length;
  const out = { pull: Number(pull), pr_files: gold.length, in_graph: gold.filter(p => owned.has(p)).length,
    existing_pr_files: existing.size, existing_in_graph: ex(gold.filter(p => owned.has(p))) };
  if (edit) {
    const nodes = new Map(edit.nodes.map(n => [n.id, n]));
    const changed = new Set(edit.nodes.filter(n => CHANGED.has(n.status)).map(n => n.id));
    for (const e of edit.edges.filter(e => CHANGED.has(e.status))) { changed.add(e.from); changed.add(e.to); }
    const near = new Set(changed);
    for (const e of edit.edges) { if (changed.has(e.from)) near.add(e.to); if (changed.has(e.to)) near.add(e.from); }
    const inSet = ids => new Set([...ids].flatMap(id => filesOf(nodes.get(id))));
    const c = inSet(changed), n = inSet(near);
    Object.assign(out, { changed_components: changed.size, in_changed: gold.filter(p => c.has(p)).length, within_one_step: gold.filter(p => n.has(p)).length,
      existing_in_changed: ex(gold.filter(p => c.has(p))), existing_within_one_step: ex(gold.filter(p => n.has(p))) });
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [graphFile, pull, editFile] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (!graphFile || !pull) { console.error('Usage: node pr-coverage.mjs GRAPH.yaml PULL [EDIT.yaml] [--json]'); process.exit(2); }
  const r = prCoverage(parseYaml(readFileSync(graphFile, 'utf8')), pull, editFile ? parseYaml(readFileSync(editFile, 'utf8')) : undefined);
  console.log(process.argv.includes('--json') ? JSON.stringify(r) : Object.entries(r).map(([k, v]) => `${k}: ${v}`).join('\n'));
}
