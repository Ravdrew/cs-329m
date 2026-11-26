// Integration test with the real q2q3-tools/harness.py and make_prompt.py (Linux or macOS, like the harness): the
// fixture repository (fixture-repo.mjs) stands in for Cal.com, and only the model is scripted. Covers prepare → reset
// → prompt → Pi edits → evaluate → restore, and two batch workers in parallel.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { modelFixture, toolCall } from '../../graph-mcp/test/model-fixture.mjs';
import { piToolName } from '../../graph-mcp/pi.mjs';
import { runAgent } from '../agent.mjs';
import { runBatch } from '../batch.mjs';
import { BOOKING, FEATURE, makeFixture, TASK } from '../fixture-repo.mjs';
import { runOne, TEAM_ROOT } from '../run.mjs';

// PYTHON: an interpreter with PyYAML (e.g. a virtual environment's python3 on macOS).
const PYTHON = process.env.PYTHON ?? 'python3';
const supported = ['linux', 'darwin'].includes(process.platform) && spawnSync(PYTHON, ['-c', 'import yaml']).status === 0;
const SKIP = !supported && 'needs Linux or macOS, and python3 with PyYAML (set PYTHON to choose the interpreter)';
const root = realpathSync(mkdtempSync(join(tmpdir(), 'harness-it-')));
after(() => rmSync(root, { recursive: true, force: true }));

const harness = (pilot, ...args) => spawnSync(PYTHON, [join(TEAM_ROOT, 'q2q3-tools/harness.py'), ...args],
  { encoding: 'utf8', env: { ...process.env, PILOT_DIR: pilot.pilotDir, PILOT_PRIVATE: pilot.pilotPrivate } });

/** The agent: Pi's real tools on a scripted model. `solve` writes the feature; every run also litters the checkout. */
function agentFor(solve, seen) {
  return async worker => {
    const steps = [
      [toolCall('read', { path: 'src/booking.mjs' })],
      ctx => { seen.push(ctx.messages.at(-1).content[0].text); // what the file looked like when the run started
        return [toolCall('write', { path: '.env', content: 'SECRET=1\n' }), toolCall('write', { path: 'notes.txt', content: 'scratch\n' }),
          ...(solve ? [toolCall('write', { path: 'src/booking.mjs', content: FEATURE })] : [])]; },
      ...(worker.condition.channel === 'mcp' ? [[toolCall(piToolName('get_requested_change'))]] : []),
    ];
    const { runtime } = await modelFixture(steps);
    const events = join(worker.runDir, 'events.jsonl');
    return runAgent({ ...worker, prompt: readFileSync(worker.promptFile, 'utf8') }, e => appendFileSync(events, `${JSON.stringify(e)}\n`), runtime);
  };
}

test('real harness: prepare, runs with reset between them, grading with the hidden test, restore', { skip: SKIP }, async () => {
  const dir = join(root, 'one');
  mkdirSync(dir);
  const { pilots, inputs } = makeFixture(dir, 1);
  const [pilot] = pilots;
  const prep = harness(pilot, 'prepare', String(TASK));
  assert.equal(prep.status, 0, prep.stdout + prep.stderr);
  assert.ok(existsSync(join(pilot.pilotPrivate, 'calcom.git-hidden')), 'real history hidden');
  assert.ok(existsSync(join(pilot.pilotPrivate, `${TASK}-ignored-at-base.txt`)));

  const seen = [];
  const common = { task: TASK, out: join(dir, 'runs'), ...pilot, maxMinutes: 2, python: PYTHON, inputs };
  const solved = await runOne({ ...common, condition: 'tool', repeat: 1 }, { agent: agentFor(true, seen) });
  assert.equal(solved.status, 'completed', solved.error);
  assert.equal(solved.resolved, true, JSON.stringify(solved));
  assert.equal(solved.f2p_passed, 1);
  assert.deepEqual(solved.agent_files.sort(), ['notes.txt', 'src/booking.mjs'], '.env is ignored, so not counted');
  assert.equal(solved.file_recall, 1);
  assert.equal(solved.graph_tool_calls, 1);
  const prompt = readFileSync(join(solved.runDir, 'prompt.md'), 'utf8');
  assert.match(prompt, /Attendees should be able to cancel a booking\./);
  assert.match(prompt, /exports `cancelBooking\(id\)`/);
  assert.match(prompt, /mcp__graph__/);
  assert.ok(prompt.includes(`checked out at ${join(pilot.pilotDir, 'calcom')}`));
  // The graph server answered from the fixture's edited graph.
  const graphLog = readFileSync(join(solved.runDir, 'tools.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.match(graphLog.find(e => e.name === 'get_requested_change').result, /Add component Cancel booking \[cancel-action\]/);

  // The next run starts from the base snapshot: no feature, no notes.txt, no .env, no hidden test.
  const unsolved = await runOne({ ...common, condition: 'prose-intent', repeat: 1 }, { agent: agentFor(false, seen) });
  assert.equal(unsolved.status, 'completed', unsolved.error);
  assert.equal(unsolved.resolved, false);
  assert.equal(unsolved.f2p_passed, 0);
  assert.equal(seen[1], BOOKING, 'reset removed the previous run\'s change');
  assert.match(readFileSync(join(unsolved.runDir, 'prompt.md'), 'utf8'), /Add cancelBooking next to book/);

  const reset = harness(pilot, 'reset', String(TASK));
  assert.equal(reset.status, 0, reset.stdout + reset.stderr);
  const report = JSON.parse(reset.stdout.trim().split('\n').at(-1));
  assert.deepEqual(report.removed_ignored, ['.env']);
  const calcom = join(pilot.pilotDir, 'calcom');
  for (const f of ['.env', 'notes.txt', 'src/booking.test.mjs']) assert.ok(!existsSync(join(calcom, f)), `${f} removed`);
  assert.equal(readFileSync(join(calcom, 'src/booking.mjs'), 'utf8'), BOOKING);
  assert.ok(existsSync(join(calcom, 'node_modules/.bin/turbo')), 'installed dependencies kept');

  const restore = harness(pilot, 'restore', String(TASK));
  assert.equal(restore.status, 0, restore.stdout + restore.stderr);
  assert.match(execFileSync('git', ['log', '--oneline', '-1', 'main'], { cwd: calcom, encoding: 'utf8' }), /Add cancelBooking/, 'real history is back');
});

test('real harness: two workers in parallel grade their own runs', { skip: SKIP }, async () => {
  const dir = join(root, 'two');
  mkdirSync(dir);
  const { pilots, inputs } = makeFixture(dir, 2);
  const seen = [];
  const matrix = {
    out: join(dir, 'batch'), tasks: [TASK, TASK], conditions: ['text', 'prose'], repeats: 2, seed: 3, maxMinutes: 2, python: PYTHON,
    inputs: { [TASK]: inputs }, workers: pilots,
  };
  // Both workers take the task (listed twice) in their own checkout and write to their own run directories.
  await runBatch(matrix, {
    log: () => {},
    deps: { runOne: c => runOne({ ...c, out: join(matrix.out, `worker-${pilots.findIndex(p => p.pilotDir === c.pilotDir)}`) },
      { agent: agentFor(c.condition === 'text', seen) }) },
  });
  const all = ['worker-0', 'worker-1'].flatMap(w => ['text', 'prose'].flatMap(c => [1, 2].map(r =>
    JSON.parse(readFileSync(join(matrix.out, w, String(TASK), `${c}-r${r}`, 'run.json'), 'utf8')))));
  assert.equal(all.length, 8);
  for (const r of all) {
    assert.equal(r.status, 'completed', r.error);
    assert.equal(r.resolved, r.condition === 'text', `${r.condition}-r${r.repeat}: graded on its own change`);
  }
  assert.ok(seen.every(s => s === BOOKING), 'every run started from the base snapshot');
});

test('real harness: unavailable reports retain diagnostics; gold checks clean up after success and failures', { skip: SKIP }, () => {
  const dir = join(root, 'startup-failure');
  mkdirSync(dir);
  const { pilots: [pilot] } = makeFixture(dir, 1);
  const prep = harness(pilot, 'prepare', String(TASK));
  assert.equal(prep.status, 0, prep.stdout + prep.stderr);
  const calcom = join(pilot.pilotDir, 'calcom');
  const results = join(pilot.pilotPrivate, 'results');
  const yarn = join(pilot.pilotDir, 'bin/yarn');
  const original = readFileSync(yarn, 'utf8');
  // A healthy full suite has one stable passing test even when Vitest exits 1 with a late warning. A candidate
  // manifest can then prevent both focused and full-suite startup, producing no report or a malformed one.
  const stableReport = {
    numFailedTests: 0,
    testResults: [{ name: join(calcom, 'src/stable.test.mjs'), status: 'passed', assertionResults: [
      { ancestorTitles: [], title: 'baseline behavior', status: 'passed' },
    ] }],
  };
  writeFileSync(yarn, original.replace('#!/usr/bin/env node\n', `#!/usr/bin/env node
{
  const fs = require('node:fs');
  const args = process.argv.slice(2);
  if (args[0] === 'vitest') {
    const out = args.find(a => a.startsWith('--outputFile=')).slice('--outputFile='.length);
    if (fs.existsSync('candidate-startup-failure.json')) {
      const mode = JSON.parse(fs.readFileSync('candidate-startup-failure.json', 'utf8')).mode;
      console.error('candidate dependency metadata prevents test startup: ' + mode);
      if (mode === 'invalid') fs.writeFileSync(out, '{not valid JSON');
      process.exit(1);
    }
    if (!args.some(a => a.endsWith('.test.mjs'))) {
      fs.writeFileSync(out, JSON.stringify(${JSON.stringify(stableReport)}));
      console.error('late warning after a valid report');
      process.exit(1);
    }
  }
}
`));
  const baseline = harness(pilot, 'baseline', String(TASK));
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  const baselinePath = join(results, `${TASK}-baseline.json`);
  assert.deepEqual(JSON.parse(readFileSync(baselinePath, 'utf8')).stable_passing,
    ['src/stable.test.mjs::baseline behavior']);
  const savedBaseline = readFileSync(baselinePath, 'utf8');

  for (const mode of ['success', 'missing', 'invalid', 'downstream-error']) {
    if (['missing', 'invalid'].includes(mode))
      writeFileSync(join(calcom, 'candidate-startup-failure.json'), JSON.stringify({ mode }));
    if (mode === 'downstream-error') writeFileSync(baselinePath, '{invalid baseline');
    const checked = spawnSync(PYTHON, [join(TEAM_ROOT, 'q2q3-tools/gold_regress.py'), String(TASK)], {
      encoding: 'utf8', env: { ...process.env, PILOT_DIR: pilot.pilotDir, PILOT_PRIVATE: pilot.pilotPrivate },
    });
    assert.equal(checked.status === 0, mode === 'success', checked.stdout + checked.stderr);
    assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: calcom, encoding: 'utf8' }).trim(), '',
      `gold ${mode}: checkout must be clean`);
    assert.equal(readFileSync(join(calcom, 'src/booking.mjs'), 'utf8'), BOOKING, `gold ${mode}: source restored`);
    assert.ok(!existsSync(join(calcom, 'src/booking.test.mjs')), `gold ${mode}: injected test removed`);
    const output = join(results, `${TASK}-gold-regress.json`);
    if (mode === 'downstream-error') {
      assert.match(checked.stderr, /JSONDecodeError/);
      assert.ok(!existsSync(output), 'downstream failure must not leave a stale gold result');
    } else {
      const result = JSON.parse(readFileSync(output, 'utf8'));
      assert.equal(result.baseline_stable_passing, 1);
      assert.equal(result.gold_passing, mode === 'success' ? 1 : null);
      assert.deepEqual(result.broken_by_gold, mode === 'success' ? [] : null);
      if (mode === 'success') assert.equal(result.execution_error, null);
      else {
        assert.equal(result.execution_error.exit_code, 1);
        assert.match(readFileSync(result.execution_error.log, 'utf8'), /candidate dependency metadata/);
      }
    }
    writeFileSync(baselinePath, savedBaseline);
  }

  for (const mode of ['missing', 'invalid']) {
    const label = `startup-${mode}`;
    writeFileSync(join(calcom, 'candidate-startup-failure.json'), JSON.stringify({ mode }));
    // If these are accidentally reused, the missing-report case would look like successful regression grading.
    writeFileSync(join(pilot.pilotPrivate, 'tmp/vitest.json'), JSON.stringify(stableReport));
    writeFileSync(join(results, `suite-${TASK}-${label}.json`), JSON.stringify(stableReport));
    const graded = harness(pilot, 'evaluate', String(TASK), label, '--regress');
    assert.equal(graded.status, 0, graded.stdout + graded.stderr);
    const result = JSON.parse(readFileSync(join(results, `${TASK}-${label}.json`), 'utf8'));
    assert.equal(result.resolved, false);
    assert.equal(result.f2p_passed, 0);
    assert.deepEqual(Object.values(result.f2p_status), ['missing']);
    assert.equal(result.test_execution_error.exit_code, 1);
    assert.match(result.test_execution_error.stderr_tail, /candidate dependency metadata/);
    assert.equal(result.regressions.baseline_stable_passing, 1);
    assert.equal(result.regressions.broken, null);
    assert.equal(result.regressions.broken_tests, null);
    assert.equal(result.regressions.execution_error.exit_code, 1);
    assert.match(readFileSync(result.regressions.execution_error.log, 'utf8'), /candidate dependency metadata/);
  }

  const failedBaseline = harness(pilot, 'baseline', String(TASK));
  assert.notEqual(failedBaseline.status, 0);
  assert.match(failedBaseline.stderr, /Baseline unavailable/);
  assert.ok(!existsSync(baselinePath), 'failed baseline must not leave an old successful baseline usable');
});
