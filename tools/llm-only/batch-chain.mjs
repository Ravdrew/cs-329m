// One graph rolled forward through the benchmark PRs: each PR's graph is the previous PR's graph updated to this PR's
// base commit (wide-full update step: the host carries files and citations, the model reviews what changed, with
// read-only git history up to the base commit).
//
//   node tools/llm-only/batch-chain.mjs --out DIR --budget USD --start GRAPH --pulls 19626,20646,22024 [--attempts 2]
//          [--spent USD]
//
// --pulls is the chain in base-commit order; GRAPH is the first PR's graph (e.g. graphs/fresh/19626.yaml) and is
// copied unchanged. An update is accepted when quality.mjs (PR-blind) says ok. If every attempt fails the chain stops
// there, so no later graph is built on a rejected one. PR coverage is recorded for the write-up only. No update starts
// unless the spend so far plus RESERVE_USD stays under --budget. Restartable: accepted PRs in DIR/results.json are
// skipped. Graphs go to graphs/chain/PULL.yaml in this checkout.
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { prCoverage } from './pr-coverage.mjs';
import { quality } from './quality.mjs';
import { parseYaml } from './graph.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const TEAM_ROOT = resolve(HERE, '../..');
const RESERVE_USD = 4; // the most one update is expected to cost (the 600-call limit bounds it)

const { values } = parseArgs({ options: {
  out: { type: 'string' }, budget: { type: 'string' }, start: { type: 'string' }, pulls: { type: 'string' },
  attempts: { type: 'string', default: '2' }, spent: { type: 'string', default: '0' },
} });
if (!values.out || !values.budget || !values.start || !values.pulls) {
  console.error('Usage: node batch-chain.mjs --out DIR --budget USD --start GRAPH --pulls A,B,C [--attempts N] [--spent USD]'); process.exit(2);
}
const out = resolve(values.out);
mkdirSync(join(out, 'runs'), { recursive: true });
const budget = Number(values.budget), attempts = Number(values.attempts);
const resultsFile = join(out, 'results.json');
const results = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')) : {};
const save = () => writeFileSync(resultsFile, `${JSON.stringify(results, null, 2)}\n`);
const log = msg => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
const DATA = resolve(process.env.TASK_DATA_ROOT ?? TEAM_ROOT);
const tasks = JSON.parse(readFileSync(join(DATA, 'benchmark/tasks.json'), 'utf8'));
const baseOf = pull => tasks.find(t => t.pull_number === pull).base_commit;
const pulls = values.pulls.split(',').map(Number);
const spent = () => Number(values.spent) + Object.values(results).flatMap(r => r.attempts ?? []).reduce((s, a) => s + (a.cost_usd ?? 0), 0);
const dest = join(TEAM_ROOT, 'graphs/chain');
mkdirSync(dest, { recursive: true });
const coverage = pull => { try { return prCoverage(parseYaml(readFileSync(join(dest, `${pull}.yaml`), 'utf8')), pull); } catch (error) { return { error: error.message }; } };

function update(pull, seed, attempt) {
  const root = join(out, 'runs', `${pull}-${attempt}`);
  mkdirSync(root, { recursive: true });
  return new Promise(res => {
    const child = spawn(process.execPath, [join(HERE, 'cli.mjs'), '--scope', 'wide-full', '--commit', baseOf(pull), '--seed', seed,
      '--provider', 'anthropic', '--model', 'claude-sonnet-5-5', '--effort', 'medium', '--max-tools', '600', '--max-minutes', '45',
      '--output-root', root], { cwd: TEAM_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    child.stdout.on('data', d => { text += d; });
    child.stderr.on('data', d => { text += d; });
    child.on('close', code => {
      writeFileSync(join(out, `update-${pull}-${attempt}.log`), text);
      const runDir = readdirSync(root).map(d => join(root, d))[0] ?? null;
      const run = runDir && existsSync(join(runDir, 'run.json')) ? JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8')) : null;
      const record = { attempt, exit: code, run_dir: runDir, status: run?.status ?? 'no-run', cost_usd: run?.estimated_cost_usd ?? 0,
        elapsed_s: run?.elapsed_seconds ?? null, error: run?.error ?? null, seed: run?.seed ?? null };
      if (runDir && existsSync(join(runDir, 'graph.yaml'))) {
        try { record.quality = quality(runDir); } catch (error) { record.quality = { verdict: 'rebuild', reasons: [`quality check failed: ${error.message}`] }; }
      } else {
        record.quality = { verdict: 'rebuild', reasons: [`no graph (${record.status}${code ? `, exit ${code}` : ''})`] };
      }
      res(record);
    });
  });
}

const [first, ...rest] = pulls;
if (!results[first]) {
  copyFileSync(resolve(values.start), join(dest, `${first}.yaml`));
  results[first] = { pull: first, base_commit: baseOf(first), start: resolve(values.start), attempts: [], accepted: 'start', pr_coverage: coverage(first) };
  save();
}
if (parseYaml(readFileSync(join(dest, `${first}.yaml`), 'utf8')).commit !== baseOf(first)) throw new Error(`--start is not a graph of #${first}'s base commit`);
let previous = first;
for (const pull of rest) {
  const r = results[pull] ??= { pull, base_commit: baseOf(pull), previous, attempts: [] };
  if (!r.accepted) {
    while (r.attempts.length < attempts && !r.attempts.some(a => a.quality.verdict === 'ok')) {
      if (spent() + RESERVE_USD > budget) { log(`${pull}: budget reached ($${spent().toFixed(2)} of $${budget}); chain stops`); r.stopped = 'budget'; save(); process.exit(0); }
      const n = r.attempts.length + 1;
      log(`${pull}: update from #${previous}, attempt ${n} started`);
      const a = await update(pull, join(dest, `${previous}.yaml`), n);
      r.attempts.push(a);
      save();
      log(`${pull}: attempt ${n} ${a.status}, $${a.cost_usd.toFixed(2)}, ${a.quality.verdict}${a.quality.reasons?.length ? ` (${a.quality.reasons.join('; ')})` : ''}; total $${spent().toFixed(2)}`);
    }
    const ok = r.attempts.find(a => a.quality.verdict === 'ok');
    if (!ok) { r.stopped = 'quality'; save(); log(`${pull}: no update passed the quality check; chain stops`); process.exit(1); }
    r.accepted = ok.attempt;
    copyFileSync(join(ok.run_dir, 'graph.yaml'), join(dest, `${pull}.yaml`));
    writeFileSync(join(dest, `${pull}.quality.json`), `${JSON.stringify({ ...ok.quality, run_dir: ok.run_dir, attempts: r.attempts.length, previous }, null, 2)}\n`);
    r.pr_coverage = coverage(pull); // for the write-up only; never used above
    save();
  }
  previous = pull;
}
log(`done: spent $${spent().toFixed(2)}; chain ${pulls.filter(p => results[p]?.accepted).length}/${pulls.length}`);
