// Writes the main run's batch matrix (tools/agent-runner/batch.mjs) from the inputs in this checkout.
//
//   node experiments/main/make-matrix.mjs --out RUNS_DIR [--conditions a,b] [--tasks 1,2] [--repeats 3]
//        [--max-total-usd 60] [--max-cost-usd 1] [--workers 3] [--model claude-sonnet-5-5] [--effort medium] > matrix.json
//
// Inputs per task (paths in this checkout, hashed into every run.json):
//   intent              q2q3-tools/prose-intents/PULL.md
//   brief               q2q3-tools/prose-briefs/PULL.md
//   sets.fresh.edit     graphs/edits-fresh/PULL/edit.yaml    sets.fresh.base  graphs/fresh/PULL.yaml
//   sets.chain.edit     graphs/edits-chain/PULL/edit.yaml    sets.chain.base  graphs/chain/PULL.yaml
// Default conditions: the plan in RUN-PLAN.md.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
export const DEFAULT_CONDITIONS = ['prose', 'prose-brief', 'prose-intent', 'text@fresh', 'text@chain', 'tool@fresh', 'tool@chain', 'codegraph-intent'];
export const TASKS = Object.keys(JSON.parse(readFileSync(join(ROOT, 'q2q3-tools/test_fairness.json'), 'utf8'))).map(Number);

export function inputsFor(pull) {
  const p = rel => join(ROOT, rel);
  const inputs = {
    intent: p(`q2q3-tools/prose-intents/${pull}.md`),
    brief: p(`q2q3-tools/prose-briefs/${pull}.md`),
    sets: {
      fresh: { edit: p(`graphs/edits-fresh/${pull}/edit.yaml`), base: p(`graphs/fresh/${pull}.yaml`) },
      chain: { edit: p(`graphs/edits-chain/${pull}/edit.yaml`), base: p(`graphs/chain/${pull}.yaml`) },
    },
  };
  const missing = [inputs.intent, inputs.brief, ...Object.values(inputs.sets).flatMap(s => Object.values(s))].filter(f => !existsSync(f));
  if (missing.length) throw new Error(`#${pull}: missing inputs ${missing.join(', ')}`);
  return inputs;
}

export function makeMatrix({ out, conditions = DEFAULT_CONDITIONS, tasks = TASKS, repeats = 3, maxTotalUsd = 60, maxCostUsd = 1,
  model = 'claude-sonnet-5-5', effort = 'medium', workers = 3 }) {
  const home = homedir();
  return {
    out, tasks, conditions, repeats, seed: 329,
    inputs: Object.fromEntries(tasks.map(t => [t, inputsFor(t)])),
    // Worker 0 is the original checkout; the others are APFS clones of it (setup-workers.sh).
    workers: Array.from({ length: workers }, (_, i) => ({ pilotDir: join(home, i ? `q2q3-pilot-w${i}` : 'q2q3-pilot'), pilotPrivate: join(home, `q2q3-main/private-w${i}`) })),
    python: join(home, 'q2q3-venv/bin/python'),
    provider: 'anthropic', model, effort, maxMinutes: 45, maxToolCalls: 300, maxCostUsd, maxTotalUsd, sandbox: true,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const { values: v } = parseArgs({ options: {
    out: { type: 'string' }, conditions: { type: 'string' }, tasks: { type: 'string' }, repeats: { type: 'string' },
    'max-total-usd': { type: 'string' }, workers: { type: 'string' }, 'max-cost-usd': { type: 'string' }, model: { type: 'string' }, effort: { type: 'string' } } });
  if (!v.out) { console.error('Usage: node make-matrix.mjs --out RUNS_DIR [--conditions ...] [--tasks ...] [--repeats N] [--max-total-usd X]'); process.exit(2); }
  const list = s => s?.split(',').map(x => x.trim()).filter(Boolean);
  console.log(JSON.stringify(makeMatrix({
    out: resolve(v.out), conditions: list(v.conditions), tasks: list(v.tasks)?.map(Number),
    repeats: v.repeats && Number(v.repeats), maxTotalUsd: v['max-total-usd'] && Number(v['max-total-usd']),
    maxCostUsd: v['max-cost-usd'] && Number(v['max-cost-usd']), model: v.model, effort: v.effort, workers: v.workers && Number(v.workers),
  }, (k, x) => x), null, 1));
}
