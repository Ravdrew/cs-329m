// Fresh wide-full graphs for the benchmark PRs: one independent build per PR at its base commit.
//
//   node tools/llm-only/batch-fresh.mjs --out DIR --budget USD [--parallel N] [--pulls 19997,20646] [--attempts 2]
//          [--spent USD]
//
// Each PR gets up to --attempts builds (default 2). A build is accepted when quality.mjs (PR-blind) says ok; after the
// last attempt the better one is kept and its problems recorded. PR coverage (pr-coverage.mjs) is computed for the
// record only and never affects the choice. No build starts unless the estimated spend so far plus a reserve for every
// build in flight stays under --budget (--spent counts earlier builds, e.g. a test build). Restartable: PRs with a
// result in DIR/results.json are skipped. Accepted graphs are copied to graphs/fresh/PULL.yaml in this checkout.
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { prCoverage } from './pr-coverage.mjs';
import { quality } from './quality.mjs';
import { parseYaml } from './graph.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const TEAM_ROOT = resolve(HERE, '../..');
const RESERVE_USD = 3.5; // per build in flight: the most a build is expected to cost (the 600-call limit bounds it)

const { values } = parseArgs({ options: {
  out: { type: 'string' }, budget: { type: 'string' }, parallel: { type: 'string', default: '3' }, pulls: { type: 'string' },
  attempts: { type: 'string', default: '2' }, spent: { type: 'string', default: '0' },
} });
if (!values.out || !values.budget) { console.error('Usage: node batch-fresh.mjs --out DIR --budget USD [--parallel N] [--pulls A,B] [--attempts N] [--spent USD]'); process.exit(2); }
const out = resolve(values.out);
mkdirSync(join(out, 'runs'), { recursive: true });
const budget = Number(values.budget), attempts = Number(values.attempts), parallel = Number(values.parallel);
const resultsFile = join(out, 'results.json');
const results = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')) : {};
const save = () => writeFileSync(resultsFile, `${JSON.stringify(results, null, 2)}\n`);
const log = msg => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

const labelled = Object.keys(JSON.parse(readFileSync(join(TEAM_ROOT, 'q2q3-tools/test_fairness.json'), 'utf8'))).map(Number);
const tasks = JSON.parse(readFileSync(join(TEAM_ROOT, 'benchmark/tasks.json'), 'utf8'));
const pulls = values.pulls ? values.pulls.split(',').map(Number) : labelled;
const baseOf = pull => tasks.find(t => t.pull_number === pull).base_commit;

// Spend so far: every build recorded in results, plus --spent.
const spent = () => Number(values.spent) + Object.values(results).flatMap(r => r.attempts ?? []).reduce((s, a) => s + (a.cost_usd ?? 0), 0);
let inFlight = 0;

function build(pull, attempt) {
  const logFile = join(out, `build-${pull}-${attempt}.log`);
  // Its own output root, so builds running side by side never mistake each other's run directories.
  const root = join(out, 'runs', `${pull}-${attempt}`);
  mkdirSync(root, { recursive: true });
  return new Promise(res => {
    const child = spawn(process.execPath, [join(HERE, 'cli.mjs'), '--scope', 'wide-full', '--commit', baseOf(pull),
      '--provider', 'anthropic', '--model', 'claude-sonnet-5-5', '--effort', 'medium', '--max-tools', '600', '--max-minutes', '45',
      '--output-root', root], { cwd: TEAM_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    child.stdout.on('data', d => { text += d; });
    child.stderr.on('data', d => { text += d; });
    child.on('close', code => {
      writeFileSync(logFile, text);
      const runDir = readdirSync(root).map(d => join(root, d))[0] ?? null;
      const run = runDir && existsSync(join(runDir, 'run.json')) ? JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8')) : null;
      const record = { attempt, exit: code, run_dir: runDir, status: run?.status ?? 'no-run', cost_usd: run?.estimated_cost_usd ?? 0,
        elapsed_s: run?.elapsed_seconds ?? null, error: run?.error ?? null };
      if (runDir && existsSync(join(runDir, 'graph.yaml'))) {
        try { record.quality = quality(runDir); } catch (error) { record.quality = { verdict: 'rebuild', reasons: [`quality check failed: ${error.message}`] }; }
      } else {
        record.quality = { verdict: 'rebuild', reasons: [`no graph (${record.status}${code ? `, exit ${code}` : ''})`] };
      }
      res(record);
    });
  });
}

// Better of two attempts: an ok verdict, then a graph at all, then scope coverage, then less weak evidence.
const score = a => [a.quality.verdict === 'ok' ? 1 : 0, a.quality.nodes ? 1 : 0, a.quality.scope_coverage ?? 0, -(a.quality.weak_evidence ?? 1)];
const better = (a, b) => { const x = score(a), y = score(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i] ? a : b; return a; };

async function onePull(pull) {
  const r = results[pull] ??= { pull, base_commit: baseOf(pull), attempts: [] };
  while (r.attempts.length < attempts && !r.attempts.some(a => a.quality.verdict === 'ok')) {
    const n = r.attempts.length + 1;
    if (spent() + (inFlight + 1) * RESERVE_USD > budget) { log(`${pull}: budget reached ($${spent().toFixed(2)} spent of $${budget}); not starting attempt ${n}`); r.stopped = 'budget'; break; }
    inFlight++;
    log(`${pull}: attempt ${n} started`);
    const a = await build(pull, n);
    inFlight--;
    r.attempts.push(a);
    save();
    log(`${pull}: attempt ${n} ${a.status}, $${a.cost_usd.toFixed(2)}, ${a.quality.verdict}${a.quality.reasons?.length ? ` (${a.quality.reasons.join('; ')})` : ''}; total $${spent().toFixed(2)}`);
  }
  const withGraph = r.attempts.filter(a => a.quality.nodes);
  if (withGraph.length) {
    const best = withGraph.reduce(better);
    r.accepted = best.attempt;
    r.problems = best.quality.verdict === 'ok' ? [] : best.quality.reasons;
    const dest = join(TEAM_ROOT, 'graphs/fresh');
    mkdirSync(dest, { recursive: true });
    copyFileSync(join(best.run_dir, 'graph.yaml'), join(dest, `${pull}.yaml`));
    writeFileSync(join(dest, `${pull}.quality.json`), `${JSON.stringify({ ...best.quality, run_dir: best.run_dir, attempts: r.attempts.length }, null, 2)}\n`);
    // For the write-up only; never used above.
    try { r.pr_coverage = prCoverage(parseYaml(readFileSync(join(dest, `${pull}.yaml`), 'utf8')), pull); } catch (error) { r.pr_coverage = { error: error.message }; }
  } else {
    r.accepted = null;
  }
  save();
}

const queue = pulls.filter(p => !(results[p]?.accepted !== undefined && results[p]?.attempts?.length));
log(`${queue.length} PRs to build (${pulls.length - queue.length} done); budget $${budget}, spent $${spent().toFixed(2)}, ${parallel} at a time`);
await Promise.all(Array.from({ length: parallel }, async () => { while (queue.length) await onePull(queue.shift()); }));
log(`done: spent $${spent().toFixed(2)}; accepted ${Object.values(results).filter(r => r.accepted).length}/${pulls.length}`);
