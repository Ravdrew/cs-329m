// One Q2/Q3 run: reset the prepared checkout, build the condition's prompt, run the agent, audit it, grade it.
//
//   node tools/agent-runner/run.mjs --config RUN.json
//
// RUN.json: { task, condition, repeat, inputs: { base?, edit?, intent? }, out, pilotDir, pilotPrivate?, python?,
//             provider?, model?, effort?, maxMinutes?, maxToolCalls?, maxCostUsd?, authFile?, regress?,
//             codegraphServer?, sandbox? ('auto' | true | false, see sandboxFor) }
// The task must have been prepared (`python3 q2q3-tools/harness.py prepare PULL` with the same PILOT_DIR).
// Writes OUT/PULL/CONDITION-rREPEAT/: prompt.md, worker.json, events.jsonl, agent.stderr.log, tools.jsonl (graph
// tool channel), audit.json, evaluation.json, run.json (full F2P score and the fair-only score next to it). A run whose run.json exists is skipped (resumable batches),
// unless it ended in an error; then it is redone and the failed attempt kept as CONDITION-rREPEAT.error-N.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { audit } from './audit.mjs';
import { resolveCondition } from './conditions.mjs';
import { sandboxSpec, sandboxSupported } from '../graph-mcp/sandbox.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const TEAM_ROOT = resolve(HERE, '../..');
const Q2Q3 = join(TEAM_ROOT, 'q2q3-tools');
const { version: PI_VERSION } = JSON.parse(readFileSync(join(TEAM_ROOT, 'tools/graph-mcp/node_modules/@earendil-works/pi-coding-agent/package.json'), 'utf8'));

export const DEFAULTS = {
  provider: 'openai', model: 'gpt-6-astra', effort: 'medium', maxMinutes: 45, maxToolCalls: 300, maxCostUsd: 10,
  python: 'python3', regress: false, sandbox: 'auto',
};

/**
 * The agent's sandbox (graph-mcp/sandbox.mjs): 'auto' (the default) sandboxes wherever sandbox-exec exists (macOS),
 * true requires it, false turns it off. The hidden history and test reports (deny) stay unreadable either way it runs.
 */
/** The pinned CodeGraph CLI (npm ci --prefix tools/codegraph). */
export const CODEGRAPH_CLI = join(TEAM_ROOT, 'tools/codegraph/node_modules/.bin/codegraph');

/**
 * CodeGraph's MCP server for the codegraph conditions, unless the config gives one: the pinned CLI serving the
 * checkout's index (built by `harness.py prepare PULL --codegraph`), with telemetry and update checks off.
 */
export function codegraphServerFor(config, workdir) {
  if (config.codegraphServer) return config.codegraphServer;
  if (!existsSync(CODEGRAPH_CLI)) throw new Error(`CodeGraph is not installed: npm ci --prefix ${join(TEAM_ROOT, 'tools/codegraph')}`);
  if (!existsSync(join(workdir, '.codegraph'))) throw new Error(`${workdir} has no CodeGraph index: run harness.py prepare PULL --codegraph`);
  return { command: CODEGRAPH_CLI, args: ['serve', '--mcp', '--path', workdir], env: { DO_NOT_TRACK: '1', CODEGRAPH_NO_UPDATE_CHECK: '1' } };
}

/**
 * Stop CodeGraph servers serving this checkout. `codegraph serve` detaches into its own process group, so it outlives
 * the agent and would keep re-indexing the checkout through reset and the next prepare. Returns the pids stopped.
 */
export function stopCodegraphServers(workdir, { signal = 'SIGTERM' } = {}) {
  const ps = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).stdout ?? '';
  const pids = ps.split('\n').map(l => l.trim().match(/^(\d+)\s+(.*)$/)).filter(Boolean)
    // The whole path, so another worker's checkout (calcom-2, calcom/sub) is never matched.
    .filter(([, , cmd]) => /codegraph\.js serve\b/.test(cmd) && new RegExp(`--path ${workdir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(cmd))
    .map(([, pid]) => Number(pid));
  for (const pid of pids) { try { process.kill(pid, signal); } catch { /* already gone */ } }
  return pids;
}

export function sandboxFor(setting, { workdir, envScript, deny = [] }) {
  if (setting === false) return null;
  if (!sandboxSupported()) {
    if (setting === true) throw new Error('sandbox: true needs macOS sandbox-exec; set sandbox to false or "auto" on this platform');
    return null;
  }
  return sandboxSpec({ workdir, envScript, deny });
}

const json = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const sha256 = text => createHash('sha256').update(text).digest('hex');
export const runLabel = c => `${c.condition}-r${c.repeat}`;
export const runDirOf = c => join(resolve(c.out), String(c.task), runLabel(c));

/**
 * A run counts as done once it has a run.json, unless the agent ended in an error (an API failure, a crash): those are
 * redone when a batch resumes, and the failed attempt is kept beside it as LABEL.error-N.
 */
export function isDone(runDir) {
  const file = join(runDir, 'run.json');
  return existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).status !== 'error';
}

function setAsideFailedAttempt(runDir) {
  if (!existsSync(runDir)) return;
  let n = 1;
  while (existsSync(`${runDir}.error-${n}`)) n++;
  renameSync(runDir, `${runDir}.error-${n}`);
}

// Real paths, as harness.py uses (on macOS /tmp and /var are symlinks into /private).
const real = p => (existsSync(p) ? realpathSync(p) : resolve(p));

/** Paths the harness uses, from PILOT_DIR / PILOT_PRIVATE (see harness.py). */
export function paths(config) {
  const pilotDir = real(config.pilotDir);
  const pilotPrivate = real(config.pilotPrivate ?? '/root/pilot-private');
  return { pilotDir, pilotPrivate, workdir: join(pilotDir, 'calcom'), envScript: join(pilotDir, 'env.sh') };
}

/** Run a Python helper from q2q3-tools with the run's PILOT_DIR/PILOT_PRIVATE. Throws with its output on failure. */
export function python(config, script, args, { allowFail = false } = {}) {
  const { pilotDir, pilotPrivate } = paths(config);
  const r = spawnSync(config.python, [join(Q2Q3, script), ...args], {
    cwd: Q2Q3, encoding: 'utf8', env: { ...process.env, PILOT_DIR: pilotDir, PILOT_PRIVATE: pilotPrivate }, maxBuffer: 64 << 20,
  });
  if (r.status !== 0 && !allowFail) throw new Error(`${script} ${args.join(' ')} failed (${r.status ?? r.error?.message}):\n${(r.stdout ?? '').slice(-3000)}\n${(r.stderr ?? '').slice(-3000)}`);
  return r;
}

/** The environment the agent's process (and its bash tool) gets: no other agent's or Node's injection variables. */
export function agentEnv(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([k]) =>
    !k.startsWith('CODEX_') && !k.startsWith('PI_') && !k.startsWith('CLAUDE') && !['NODE_OPTIONS', 'NODE_PATH', 'PILOT_PRIVATE'].includes(k)));
}

/** Start agent.mjs in its own process group; kill the group if it overruns its own time limit. */
export async function executeAgent(config, runDir, workdir) {
  const worker = join(runDir, 'worker.json');
  const events = join(runDir, 'events.jsonl');
  writeFileSync(events, '');
  const child = spawn(process.execPath, [join(HERE, 'agent.mjs'), '--worker', worker], {
    cwd: workdir, env: { ...agentEnv(), PI_OFFLINE: '1', PI_TELEMETRY: '0' }, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const kill = signal => { try { process.kill(-child.pid, signal); } catch { try { child.kill(signal); } catch { /* gone */ } } };
  // The worker stops itself at maxMinutes; this is the backstop if it hangs.
  const backstop = setTimeout(() => { kill('SIGTERM'); setTimeout(() => kill('SIGKILL'), 5000); }, (config.maxMinutes + 5) * 60_000);
  const onInterrupt = () => kill('SIGTERM');
  process.once('SIGINT', onInterrupt);
  let completed = null, workerError = null;
  child.stderr.on('data', chunk => appendFileSync(join(runDir, 'agent.stderr.log'), chunk));
  const reading = (async () => {
    for await (const line of createInterface({ input: child.stdout })) {
      appendFileSync(events, `${line}\n`);
      try {
        const e = JSON.parse(line);
        if (e.type === 'run_completed') completed = e;
        if (e.type === 'worker_error') workerError = e.message;
      } catch { /* non-JSON output is kept in events.jsonl */ }
    }
  })();
  const exit = await new Promise(res => child.once('close', (code, signal) => res({ code, signal })));
  await reading;
  clearTimeout(backstop);
  process.removeListener('SIGINT', onInterrupt);
  return completed ?? { status: 'error', lastError: workerError ?? `agent process exited (${exit.code ?? exit.signal}) without a result` };
}

export const readEvents = file => readFileSync(file, 'utf8').split('\n').filter(Boolean)
  .flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });

/**
 * One run. `deps` replaces the external steps in tests: { reset(), prompt(promptArgs, outFile), agent(workerConfig),
 * evaluate(label) }.
 */
export async function runOne(config, deps = {}) {
  config = { ...DEFAULTS, ...config };
  const runDir = runDirOf(config);
  const label = runLabel(config);
  if (isDone(runDir)) return { skipped: true, runDir, ...JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8')) };
  setAsideFailedAttempt(runDir);
  mkdirSync(runDir, { recursive: true });
  const { workdir, envScript, pilotPrivate } = paths(config);
  const condition = resolveCondition(config.condition, config.inputs);
  const started = new Date().toISOString();
  const record = { task: config.task, condition: config.condition, repeat: config.repeat, label, started,
    pi_version: PI_VERSION, inputs: config.inputs ?? {} };
  for (const [k, p] of Object.entries(config.inputs ?? {})) if (p && existsSync(p)) record[`${k}_sha256`] = sha256(readFileSync(p));

  // 1. Back to the base snapshot.
  (deps.reset ?? (() => python(config, 'harness.py', ['reset', String(config.task)])))();
  // 2. The prompt: make_prompt.py with the spec and this condition's block.
  const promptFile = join(runDir, 'prompt.md');
  (deps.prompt ?? ((args, out) => python(config, 'make_prompt.py',
    [String(config.task), '--spec', ...args, '--workdir', workdir, '--env-script', envScript, '-o', out])))(condition.promptArgs, promptFile);
  record.prompt_sha256 = sha256(readFileSync(promptFile));
  // 3. The agent.
  const sandbox = sandboxFor(config.sandbox, { workdir, envScript, deny: [pilotPrivate] });
  record.sandbox = sandbox ? 'sandbox-exec' : 'off';
  const worker = {
    workdir, runDir, promptFile, condition, sandbox,
    codegraphServer: condition.codegraph ? (deps.codegraphServer ?? codegraphServerFor(config, workdir)) : undefined,
    provider: config.provider, model: config.model, effort: config.effort, authFile: config.authFile,
    maxMinutes: config.maxMinutes, maxToolCalls: config.maxToolCalls, maxCostUsd: config.maxCostUsd,
  };
  json(join(runDir, 'worker.json'), worker);
  if (condition.codegraph && !deps.agent) stopCodegraphServers(workdir); // a server left over from an earlier run
  const agent = await (deps.agent ?? (w => executeAgent(config, runDir, w.workdir)))(worker);
  if (condition.codegraph && !deps.agent) record.codegraph_servers_stopped = stopCodegraphServers(workdir).length;
  // 4. What it did.
  const report = audit(readEvents(join(runDir, 'events.jsonl')), { workdir, envScript });
  json(join(runDir, 'audit.json'), report);
  // 5. Grade with the hidden tests (unless the agent never produced a result).
  let evaluation = null;
  if (agent.status !== 'invalid') {
    const evaluate = deps.evaluate ?? (l => {
      python(config, 'harness.py', ['evaluate', String(config.task), l, ...(config.regress ? ['--regress'] : [])]);
      return JSON.parse(readFileSync(join(pilotPrivate, 'results', `${config.task}-${l}.json`), 'utf8'));
    });
    evaluation = evaluate(label);
    json(join(runDir, 'evaluation.json'), evaluation);
  }
  Object.assign(record, {
    finished: new Date().toISOString(), status: agent.status, stop_reason: agent.stopReason ?? null, error: agent.lastError ?? null,
    model: agent.model ?? { provider: config.provider, id: config.model, effort: config.effort },
    limits: { max_minutes: config.maxMinutes, max_tool_calls: config.maxToolCalls, max_cost_usd: config.maxCostUsd },
    duration_ms: agent.durationMs ?? null, responses: agent.responses ?? 0, usage: agent.usage ?? null,
    active_tools: agent.activeTools ?? null,
    tool_calls: report.tool_calls, graph_tool_calls: report.graph_tool_calls, bash_commands: report.bash_commands,
    search_commands: report.search_commands, audit_flagged: report.flagged, sandbox_refusals: report.sandbox_refusals,
    resolved: evaluation?.resolved ?? null, f2p_passed: evaluation?.f2p_passed ?? null, f2p_total: evaluation?.f2p_total ?? null,
    // Fair-only score: the hidden tests labelled fair or convention in q2q3-tools/test_fairness.json (null if unlabelled).
    fair_resolved: evaluation?.fair_resolved ?? null, fair_passed: evaluation?.fair_passed ?? null, fair_total: evaluation?.fair_total ?? null,
    ...Object.fromEntries(['tier1', 'tier12'].flatMap(t => ['resolved', 'passed', 'total'].map(f => [`${t}_${f}`, evaluation?.[`${t}_${f}`] ?? null]))),
    file_recall: evaluation?.file_recall ?? null, file_precision: evaluation?.file_precision ?? null,
    agent_files: evaluation?.agent_files ?? null, regressions: evaluation?.regressions?.broken ?? null,
  });
  json(join(runDir, 'run.json'), record);
  return { runDir, ...record };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { config: { type: 'string' } } });
  if (!values.config) { console.error('Usage: node run.mjs --config RUN.json'); process.exit(2); }
  runOne(JSON.parse(readFileSync(values.config, 'utf8')))
    .then(r => console.log(JSON.stringify({ runDir: r.runDir, skipped: r.skipped ?? false, status: r.status, resolved: r.resolved,
      f2p: `${r.f2p_passed}/${r.f2p_total}`, fair_resolved: r.fair_resolved, fair: `${r.fair_passed}/${r.fair_total}`, tier1: `${r.tier1_passed}/${r.tier1_total}`, tier12: `${r.tier12_passed}/${r.tier12_total}`, cost: r.usage?.cost, tool_calls: r.tool_calls, graph_tool_calls: r.graph_tool_calls,
      flagged: r.audit_flagged })))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
