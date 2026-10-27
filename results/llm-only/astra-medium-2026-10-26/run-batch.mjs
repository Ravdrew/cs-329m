#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  repo: { type: 'string' }, source: { type: 'string' }, directory: { type: 'string' },
  'preflight-report': { type: 'string' },
} });
for (const key of ['repo', 'source', 'directory', 'preflight-report']) {
  assert(values[key], `Missing --${key}`);
}
const repo = resolve(values.repo);
const source = resolve(values.source);
const directory = resolve(values.directory);
const preflight = JSON.parse(readFileSync(resolve(values['preflight-report']), 'utf8'));
assert.equal(preflight.exit_code, 0, 'Harness preflight must pass');
assert.equal(preflight.counts.fail, 0);
const cli = join(repo, 'tools/llm-only/cli.mjs');
const git = args => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
assert.equal(git(['status', '--porcelain']), '', 'Use a clean generator checkout');
const target = readFileSync(join(repo, 'targets/calcom.env'), 'utf8');
const commit = target.match(/^CALCOM_SHA=(.+)$/m)[1];
const root = join(directory, 'runs');
mkdirSync(root, { recursive: true });
assert(!existsSync(join(directory, 'batch.json')), 'Refusing to overwrite an existing batch');
const job = {
  version: 1, status: 'running', started_at: new Date().toISOString(),
  requested_runs: 3, execution_order: 'sequential',
  provider: 'openai', model: 'gpt-6-astra', reasoning_effort: 'medium',
  target_commit: commit, runner_revision: git(['rev-parse', 'HEAD']),
  limits: { max_tool_calls: 600, max_minutes_per_run: 45 },
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  harness_preflight: preflight, runs: [],
};
const batchStart = performance.now();
const save = () => {
  const temp = join(directory, 'batch.json.tmp');
  writeFileSync(temp, JSON.stringify(job, null, 2) + '\n');
  renameSync(temp, join(directory, 'batch.json'));
};
const emit = value => console.log(JSON.stringify(value));
save();

async function execute(args, prefix, onProgress = () => {}) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const stdoutPath = join(directory, `${prefix}.stdout.log`);
  const stderrPath = join(directory, `${prefix}.stderr.log`);
  writeFileSync(stdoutPath, '', { flag: 'wx' });
  writeFileSync(stderrPath, '', { flag: 'wx' });
  const child = spawn(process.execPath, args, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  child.stdout.on('data', chunk => { stdout += chunk; appendFileSync(stdoutPath, chunk); });
  child.stderr.on('data', chunk => appendFileSync(stderrPath, chunk));
  const messages = (async () => {
    for await (const line of createInterface({ input: child.stderr })) {
      let progress;
      try { progress = JSON.parse(line); } catch { continue; }
      onProgress(progress, (performance.now() - started) / 1000);
    }
  })();
  const result = await new Promise((resolveResult, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolveResult({ exit_code: code, signal }));
  });
  await messages;
  return { ...result, started_at: startedAt, finished_at: new Date().toISOString(), wall_seconds: (performance.now() - started) / 1000, stdout };
}

try {
  for (let index = 1; index <= job.requested_runs; index++) {
    const name = `run-${String(index).padStart(2, '0')}`;
    const row = { index, name, status: 'starting', tool_results: 0, tool_errors: 0 };
    job.runs.push(row);
    save();
    emit({ event: 'run_starting', run: index, total: job.requested_runs });
    const args = [cli, '--provider', job.provider, '--model', job.model, '--effort', job.reasoning_effort,
      '--source', source, '--output-root', root, '--max-tools', '600', '--max-minutes', '45'];
    const execution = await execute(args, name, (progress, elapsed) => {
      if (progress.run_directory) row.run_directory = progress.run_directory;
      if (progress.stage) {
        row.status = progress.stage;
        if (progress.stage === 'running') row.preparation_seconds = elapsed;
        emit({ event: 'stage', run: index, ...progress });
      }
      if (progress.tool) {
        row.tool_results++;
        if (progress.status === 'error') row.tool_errors++;
        row.latest_tool = progress.tool;
        if (row.tool_results % 25 === 0) emit({ event: 'progress', run: index, tools: row.tool_results, errors: row.tool_errors });
      }
      save();
    });
    const { stdout, ...timing } = execution;
    row.process = timing;
    if (row.preparation_seconds !== undefined) row.generation_through_exit_seconds = execution.wall_seconds - row.preparation_seconds;
    assert(row.run_directory, 'Runner did not report its new run directory');
    const metadata = JSON.parse(readFileSync(join(row.run_directory, 'run.json'), 'utf8'));
    row.status = metadata.status;
    row.metadata = metadata;
    assert.equal(metadata.target.commit, commit);
    assert.equal(metadata.model, job.model);
    assert.equal(metadata.reasoning_effort, job.reasoning_effort);
    assert.equal(metadata.runner_revision, job.runner_revision);
    if (execution.exit_code === 0 && metadata.status === 'completed') {
      const verified = await execute([cli, '--verify', row.run_directory], `${name}.verify`);
      assert.equal(verified.exit_code, 0, `Independent verification failed for ${name}`);
      row.verification = { ...JSON.parse(verified.stdout), elapsed_seconds: verified.wall_seconds };
      row.session_id = JSON.parse(readFileSync(join(row.run_directory, 'pi-session.json'), 'utf8')).session_id;
      row.total_with_verification_seconds = execution.wall_seconds + verified.wall_seconds;
      const successful = job.runs.filter(run => run.verification?.valid);
      assert.equal(new Set(successful.map(run => run.session_id)).size, successful.length, 'Session ID reused');
      assert.equal(new Set(job.runs.map(run => run.run_directory)).size, job.runs.length, 'Run directory reused');
      for (const previous of successful.slice(0, -1)) {
        for (const key of ['prompt_sha256', 'schema_sha256', 'source_manifest_sha256']) assert.equal(metadata[key], previous.metadata[key], `${key} changed between runs`);
        assert.deepEqual(metadata.runner_files, previous.metadata.runner_files, 'Generator code changed between runs');
      }
      emit({ event: 'run_verified', run: index, elapsed_seconds: metadata.elapsed_seconds, counts: metadata.counts });
    } else {
      emit({ event: 'run_failed', run: index, error: metadata.error });
      if (/credential|auth|credits|quota|rate.?limit|usage.?limit/i.test(metadata.error ?? '')) {
        job.status = 'blocked';
        job.error = 'Provider access failed; subsequent runs were not attempted.';
        break;
      }
    }
    save();
  }
  if (job.status !== 'blocked') job.status = job.runs.length === 3 && job.runs.every(run => run.verification?.valid) ? 'completed' : 'completed_with_failures';
} catch (error) {
  job.status = 'failed';
  job.error = error.message;
} finally {
  job.finished_at = new Date().toISOString();
  job.wall_seconds = (performance.now() - batchStart) / 1000;
  save();
  emit({ event: 'batch_finished', status: job.status, completed: job.runs.filter(run => run.verification?.valid).length, directory, error: job.error });
  process.exitCode = job.status === 'completed' ? 0 : 1;
}
