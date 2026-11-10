// The Q2/Q3 matrix: tasks × conditions × repeats, spread over one or more prepared checkouts that run in parallel.
//
//   node tools/agent-runner/batch.mjs --matrix MATRIX.json [--dry-run]
//
// MATRIX.json: { out, tasks: [PULL...], conditions: [...], repeats, seed?,
//                inputs: { "PULL": { base?, edit?, intent? } },
//                workers: [{ pilotDir, pilotPrivate? }...], skipPrepare? (each worker already prepared its one task),
//                ...any run.mjs setting shared by every run (model, effort, maxMinutes, maxToolCalls, maxCostUsd, ...) }
// Each worker takes whole tasks (preparing a task reinstalls the checkout, so a task's runs stay on one worker) and runs
// that task's condition × repeat runs in a seeded random order, so no condition is always first or last. Runs that
// already have a run.json are skipped (errored runs are redone), so a stopped batch resumes where it left off. Writes
// OUT/summary.jsonl and OUT/summary.csv at the end.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { resolveCondition } from './conditions.mjs';
import { DEFAULTS, isDone, python, runDirOf, runOne } from './run.mjs';

/** Deterministic shuffle (mulberry32), so a batch's order can be reproduced from its seed. */
export function shuffle(items, seed) {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Every run in the matrix, grouped by worker, in the order each worker will run them. */
export function plan(matrix) {
  const seed = matrix.seed ?? 329;
  const workers = matrix.workers.map(w => ({ ...w, tasks: [] }));
  matrix.tasks.forEach((task, i) => workers[i % workers.length].tasks.push(task));
  for (const task of matrix.tasks) {
    for (const c of matrix.conditions) resolveCondition(c, matrix.inputs?.[task]); // fail before anything runs
  }
  return workers.map(w => ({
    ...w,
    tasks: w.tasks.map(task => ({
      task,
      runs: shuffle(matrix.conditions.flatMap(condition =>
        Array.from({ length: matrix.repeats }, (_, r) => ({ condition, repeat: r + 1 }))), seed + Number(task)),
    })),
  }));
}

const SUMMARY_FIELDS = ['task', 'condition', 'repeat', 'status', 'stop_reason', 'resolved', 'f2p_passed', 'f2p_total',
  'file_recall', 'file_precision', 'regressions', 'tool_calls', 'graph_tool_calls', 'bash_commands', 'search_commands',
  'responses', 'duration_ms', 'audit_flagged'];

export function summarize(out) {
  const rows = [];
  for (const task of existsSync(out) ? readdirSync(out, { withFileTypes: true }).filter(d => d.isDirectory()) : []) {
    // CONDITION-rN only: failed attempts set aside as CONDITION-rN.error-M are not results.
    for (const run of readdirSync(join(out, task.name), { withFileTypes: true }).filter(d => d.isDirectory() && /-r\d+$/.test(d.name))) {
      const file = join(out, task.name, run.name, 'run.json');
      if (!existsSync(file)) continue;
      const r = JSON.parse(readFileSync(file, 'utf8'));
      rows.push({ ...Object.fromEntries(SUMMARY_FIELDS.map(f => [f, r[f] ?? null])),
        input_tokens: r.usage?.input ?? null, output_tokens: r.usage?.output ?? null, cost_usd: r.usage?.cost ?? null });
    }
  }
  rows.sort((a, b) => a.task - b.task || a.condition.localeCompare(b.condition) || a.repeat - b.repeat);
  writeFileSync(join(out, 'summary.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
  const cols = rows.length ? Object.keys(rows[0]) : SUMMARY_FIELDS;
  const cell = v => (v === null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  writeFileSync(join(out, 'summary.csv'), [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n') + '\n');
  return rows;
}

/** deps: { prepare(worker, task), runOne(config) } for tests. */
export async function runBatch(matrix, { log = console.log, deps = {} } = {}) {
  const out = resolve(matrix.out);
  const { workers: _w, tasks: _t, conditions: _c, repeats: _r, inputs, seed: _s, ...settings } = matrix;
  const shared = { ...DEFAULTS, ...settings };
  const prepare = deps.prepare ?? ((w, task) => python({ ...shared, ...w }, 'harness.py', ['prepare', String(task)]));
  const one = deps.runOne ?? runOne;
  await Promise.all(plan(matrix).map(async (worker, wi) => {
    for (const { task, runs } of worker.tasks) {
      const configs = runs.map(r => ({ ...shared, ...worker, tasks: undefined, out, task, inputs: inputs?.[task] ?? {}, ...r }));
      const todo = configs.filter(c => !isDone(runDirOf(c)));
      if (!todo.length) { log(`[worker ${wi}] ${task}: all ${configs.length} runs done`); continue; }
      if (matrix.skipPrepare) log(`[worker ${wi}] ${task}: ${todo.length} of ${configs.length} runs to do (already prepared)`);
      else {
        log(`[worker ${wi}] ${task}: preparing (${todo.length} of ${configs.length} runs to do)`);
        prepare(worker, task);
      }
      for (const c of todo) {
        log(`[worker ${wi}] ${task} ${c.condition} r${c.repeat}: start`);
        try {
          const r = await one(c);
          log(`[worker ${wi}] ${task} ${c.condition} r${c.repeat}: ${r.status}, resolved=${r.resolved}, f2p=${r.f2p_passed}/${r.f2p_total}, $${(r.usage?.cost ?? 0).toFixed(2)}`);
        } catch (error) {
          // No run.json is written, so the run is retried when the batch is resumed.
          log(`[worker ${wi}] ${task} ${c.condition} r${c.repeat}: FAILED ${error.message.split('\n')[0]}`);
        }
      }
    }
  }));
  return summarize(out);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { matrix: { type: 'string' }, 'dry-run': { type: 'boolean' } } });
  if (!values.matrix) { console.error('Usage: node batch.mjs --matrix MATRIX.json [--dry-run]'); process.exit(2); }
  const matrix = JSON.parse(readFileSync(values.matrix, 'utf8'));
  if (values['dry-run']) {
    for (const [i, w] of plan(matrix).entries()) {
      console.log(`worker ${i} (${w.pilotDir}):`);
      for (const t of w.tasks) console.log(`  ${t.task}: ${t.runs.map(r => `${r.condition}-r${r.repeat}`).join(' ')}`);
    }
  } else {
    runBatch(matrix).then(rows => console.log(`${rows.length} runs in ${resolve(matrix.out, 'summary.csv')}`))
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}
