import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { getCurrentTools, modelFixture, toolCall } from '../../graph-mcp/test/model-fixture.mjs';
import { PI_DEFAULT_TOOLS, piToolName } from '../../graph-mcp/pi.mjs';
import { toolDefinitions } from '../../graph-mcp/tools.mjs';
import { runAgent } from '../agent.mjs';
import { audit } from '../audit.mjs';
import { plan, runBatch, shuffle } from '../batch.mjs';
import { resolveCondition } from '../conditions.mjs';
import { executeAgent, runOne, TEAM_ROOT } from '../run.mjs';

const EDIT = join(TEAM_ROOT, 'graphs/booking-handmade-edit.yaml');
const BASE = join(TEAM_ROOT, 'graphs/booking-handmade.yaml');
const GRAPH_TOOLS = toolDefinitions.map(t => piToolName(t.name));
const root = mkdtempSync(join(tmpdir(), 'agent-runner-test-'));
after(() => rmSync(root, { recursive: true, force: true }));

function pilot(name) {
  const pilotDir = join(root, name);
  mkdirSync(join(pilotDir, 'calcom/src'), { recursive: true });
  writeFileSync(join(pilotDir, 'calcom/src/booking.ts'), 'export function book() {\n  return "booked";\n}\n');
  writeFileSync(join(pilotDir, 'env.sh'), '');
  writeFileSync(join(root, 'intent.md'), 'Add a page listing the attendee\'s bookings.\n');
  return pilotDir;
}

/** run.mjs with the Linux-only steps replaced and the agent run in process on a scripted model. */
function fakeDeps(steps, { cost, calls } = {}) {
  const log = { reset: 0, prompts: [], evaluated: [] };
  return {
    log,
    deps: {
      reset: () => { log.reset++; },
      prompt: (args, out) => { log.prompts.push(args); writeFileSync(out, `PROMPT ${args.join(' ')}`); },
      agent: async worker => {
        const { runtime, requests } = await modelFixture(steps, { cost });
        calls?.push(requests);
        const events = join(worker.runDir, 'events.jsonl');
        return runAgent({ ...worker, prompt: readFileSync(worker.promptFile, 'utf8') },
          e => appendFileSync(events, `${JSON.stringify(e)}\n`), runtime);
      },
      evaluate: label => {
        log.evaluated.push(label);
        return { resolved: true, f2p_passed: 3, f2p_total: 3, file_recall: 0.5, file_precision: 1, agent_files: ['src/booking.ts'] };
      },
    },
  };
}

test('conditions resolve to make_prompt.py blocks and graph channels', () => {
  const inputs = { base: BASE, edit: EDIT, intent: '/i.md' };
  assert.deepEqual(resolveCondition('prose', inputs).promptArgs, []);
  assert.deepEqual(resolveCondition('prose-intent', inputs).promptArgs, ['--intent', '/i.md']);
  assert.deepEqual(resolveCondition('text', inputs).promptArgs, ['--graph', EDIT]);
  assert.deepEqual(resolveCondition('tool', inputs), { name: 'tool', channel: 'mcp', codegraph: false, graph: EDIT, promptArgs: ['--graph-tools', 'graph'] });
  assert.equal(resolveCondition('tool-noedit', inputs).graph, BASE);
  assert.equal(resolveCondition('codegraph', {}).codegraph, true);
  assert.throws(() => resolveCondition('tool', {}), /needs task inputs: edit/);
  assert.throws(() => resolveCondition('image', inputs), /Unknown condition/);
});

test('the audit counts searches and graph calls and flags rule breaks', () => {
  const call = (toolName, args) => ({ type: 'tool_execution_start', toolName, args });
  const report = audit([
    call('bash', { command: 'source /p/env.sh && cd /p/calcom && rg -n "book" packages | head' }),
    call('bash', { command: 'find . -name "*.ts" | grep booking' }),
    call('bash', { command: 'cd /p/calcom && TZ=UTC yarn vitest run x.test.ts' }),
    call('bash', { command: 'cat /home/user/.pi/agent/auth.json' }),
    call('bash', { command: 'curl https://github.com/calcom/cal.com/pull/24207.diff' }),
    call('bash', { command: 'git log --oneline' }),
    call('read', { path: '/p/calcom/src/booking.ts' }),
    call('read', { path: '/etc/passwd' }),
    call(piToolName('get_node'), { id: 'x' }),
  ], { workdir: '/p/calcom', envScript: '/p/env.sh' });
  assert.equal(report.tool_calls, 9);
  assert.equal(report.bash_commands, 6);
  assert.equal(report.search_commands, 2);
  assert.equal(report.graph_tool_calls, 1);
  assert.equal(report.flagged, true);
  assert.deepEqual(report.flags.outside_paths.map(f => f.path), ['/home/user/.pi/agent/auth.json', '/etc/passwd']);
  assert.equal(report.flags.network.length, 1);
  assert.equal(report.flags.history.length, 1);
  assert.equal(audit([call('bash', { command: 'cd /p/calcom && ls src' })], { workdir: '/p/calcom' }).flagged, false);
});

test('a tool run: prompt, Pi with the graph over MCP, audit, grading and a resumable record', async () => {
  const pilotDir = pilot('pilot-tool');
  const requests = [];
  const { deps, log } = fakeDeps([
    [toolCall(piToolName('get_requested_change'))],
    [toolCall('read', { path: 'src/booking.ts' }), toolCall(piToolName('get_node'), { id: 'booking-success-page' })],
  ], { calls: requests });
  const config = { task: 24207, condition: 'tool', repeat: 1, inputs: { edit: EDIT }, out: join(root, 'out-tool'), pilotDir, maxMinutes: 2 };
  const r = await runOne(config, deps);
  assert.equal(r.status, 'completed', r.error);
  assert.deepEqual(log.prompts, [['--graph-tools', 'graph']]);
  assert.equal(log.reset, 1);
  assert.deepEqual(getCurrentTools(requests[0][0].messages).map(t => t.name).sort(), [...PI_DEFAULT_TOOLS, ...GRAPH_TOOLS].sort());
  assert.equal(r.tool_calls, 3);
  assert.equal(r.graph_tool_calls, 2);
  assert.equal(r.responses, 3);
  assert.equal(r.resolved, true);
  assert.equal(r.audit_flagged, false);
  assert.match(r.prompt_sha256, /^[0-9a-f]{64}$/);
  assert.match(r.edit_sha256, /^[0-9a-f]{64}$/);
  for (const f of ['prompt.md', 'worker.json', 'events.jsonl', 'audit.json', 'evaluation.json', 'run.json', 'tools.jsonl', 'effective-system-prompt.md']) {
    assert.ok(existsSync(join(r.runDir, f)), f);
  }
  // The graph server logged its calls in the run directory.
  const graphLog = readFileSync(join(r.runDir, 'tools.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.deepEqual(graphLog.filter(e => e.name).map(e => e.name), ['get_requested_change', 'get_node']);
  // Run again: skipped, nothing re-run.
  const again = await runOne(config, deps);
  assert.equal(again.skipped, true);
  assert.equal(log.reset, 1);
});

test('prose conditions get no graph tools; codegraph gets its own server', async () => {
  const pilotDir = pilot('pilot-prose');
  const requests = [];
  const prose = await runOne({ task: 1, condition: 'prose', repeat: 1, out: join(root, 'out-prose'), pilotDir, maxMinutes: 2 },
    fakeDeps([], { calls: requests }).deps);
  assert.equal(prose.status, 'completed', prose.error);
  assert.deepEqual(getCurrentTools(requests[0][0].messages).map(t => t.name).sort(), [...PI_DEFAULT_TOOLS].sort());
  assert.equal(prose.graph_tool_calls, 0);

  // A stand-in for CodeGraph's MCP server: our server under the name "codegraph".
  const cg = [];
  const codegraph = await runOne({
    task: 1, condition: 'codegraph', repeat: 1, out: join(root, 'out-cg'), pilotDir, maxMinutes: 2,
    codegraphServer: { command: process.execPath, args: [join(TEAM_ROOT, 'tools/graph-mcp/server.mjs'), '--graph', BASE] },
  }, fakeDeps([[toolCall('mcp__codegraph__graph_overview')]], { calls: cg }).deps);
  assert.equal(codegraph.status, 'completed', codegraph.error);
  const names = getCurrentTools(cg[0][0].messages).map(t => t.name);
  assert.ok(names.includes('mcp__codegraph__graph_overview'));
  assert.ok(!names.some(n => n.startsWith('mcp__graph__')));
  assert.equal(codegraph.graph_tool_calls, 1);
});

test('limits stop the agent and are recorded', async () => {
  const pilotDir = pilot('pilot-limits');
  const loop = () => [toolCall('read', { path: 'src/booking.ts' })];
  const calls = await runOne({ task: 1, condition: 'prose', repeat: 1, out: join(root, 'out-limit'), pilotDir, maxMinutes: 2, maxToolCalls: 4 },
    fakeDeps(loop).deps);
  assert.equal(calls.status, 'limit');
  assert.equal(calls.stop_reason, 'Tool-call limit reached');
  assert.ok(calls.tool_calls <= 6, `stopped promptly (${calls.tool_calls} calls)`);
  assert.equal(calls.resolved, true, 'a stopped run is still graded on what it changed');

  const cost = await runOne({ task: 1, condition: 'prose', repeat: 2, out: join(root, 'out-limit'), pilotDir, maxMinutes: 2, maxCostUsd: 2.5 },
    fakeDeps(loop, { cost: 1 }).deps);
  assert.equal(cost.stop_reason, 'Cost limit reached');
  assert.ok(cost.usage.cost >= 2.5 && cost.usage.cost <= 4);

  const slow = await runOne({ task: 1, condition: 'prose', repeat: 3, out: join(root, 'out-limit'), pilotDir, maxMinutes: 0.02 },
    fakeDeps(() => [toolCall('bash', { command: process.platform === 'win32' ? 'Start-Sleep 3' : 'sleep 3' })]).deps);
  assert.equal(slow.stop_reason, 'Time limit reached');
});

test('the agent subprocess reports a failure as an error result, not a hang', async () => {
  const pilotDir = pilot('pilot-proc');
  const runDir = join(root, 'proc');
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'prompt.md'), 'Hello.');
  writeFileSync(join(runDir, 'worker.json'), JSON.stringify({
    workdir: join(pilotDir, 'calcom'), runDir, promptFile: join(runDir, 'prompt.md'), condition: resolveCondition('prose'),
    provider: 'openai', model: 'not-a-model', effort: 'medium', maxMinutes: 1, maxToolCalls: 10,
  }));
  const result = await executeAgent({ maxMinutes: 1 }, runDir, join(pilotDir, 'calcom'));
  assert.equal(result.status, 'error');
  assert.match(result.lastError, /no model openai\/not-a-model/);
});

test('batches spread tasks over workers, shuffle reproducibly, prepare once per task and resume', async () => {
  const matrix = {
    out: join(root, 'batch'), tasks: [1, 2, 3], conditions: ['prose', 'text'], repeats: 2, seed: 7,
    inputs: { 1: { edit: EDIT }, 2: { edit: EDIT }, 3: { edit: EDIT } },
    workers: [{ pilotDir: join(root, 'w0') }, { pilotDir: join(root, 'w1') }],
  };
  const p = plan(matrix);
  assert.deepEqual(p.map(w => w.tasks.map(t => t.task)), [[1, 3], [2]]);
  assert.equal(p[0].tasks[0].runs.length, 4);
  assert.deepEqual(plan(matrix), p, 'same seed, same order');
  assert.deepEqual(shuffle([1, 2, 3, 4, 5], 1).sort(), [1, 2, 3, 4, 5]);
  assert.throws(() => plan({ ...matrix, inputs: {} }), /needs task inputs/);

  const prepared = [];
  const ran = [];
  const deps = {
    prepare: (w, task) => prepared.push(task),
    runOne: async c => {
      ran.push(`${c.task}-${c.condition}-${c.repeat}`);
      const dir = join(c.out, String(c.task), `${c.condition}-r${c.repeat}`);
      mkdirSync(dir, { recursive: true });
      const record = { task: c.task, condition: c.condition, repeat: c.repeat, status: 'completed', resolved: c.condition === 'text', usage: { cost: 0.5 } };
      writeFileSync(join(dir, 'run.json'), JSON.stringify(record));
      return record;
    },
  };
  const rows = await runBatch(matrix, { log: () => {}, deps });
  assert.equal(rows.length, 12);
  assert.deepEqual(prepared.sort(), [1, 2, 3]);
  assert.ok(readFileSync(join(matrix.out, 'summary.csv'), 'utf8').startsWith('task,condition,repeat,status'));
  // Resume: everything done, nothing prepared or run again.
  prepared.length = 0; ran.length = 0;
  await runBatch(matrix, { log: () => {}, deps });
  assert.deepEqual([prepared.length, ran.length], [0, 0]);
});

test('a run that ends in an error is redone on resume, and the failed attempt is kept', async () => {
  const pilotDir = pilot('pilot-retry');
  const out = join(root, 'out-retry');
  let attempt = 0;
  const deps = {
    reset: () => {}, prompt: (args, file) => writeFileSync(file, 'PROMPT'), evaluate: () => ({ resolved: attempt > 1 }),
    agent: async worker => {
      attempt++;
      writeFileSync(join(worker.runDir, 'events.jsonl'), '');
      return attempt === 1 ? { status: 'error', lastError: 'OpenAI API error (429): rate limited' } : { status: 'completed' };
    },
  };
  const config = { task: 5, condition: 'prose', repeat: 1, out, pilotDir };
  assert.equal((await runOne(config, deps)).status, 'error');
  const second = await runOne(config, deps);
  assert.equal(second.status, 'completed');
  assert.equal(second.resolved, true);
  assert.ok(existsSync(join(out, '5', 'prose-r1.error-1', 'run.json')), 'failed attempt kept');
  assert.equal((await runOne(config, deps)).skipped, true, 'a completed run is not redone');
  assert.equal(attempt, 2);
  const { summarize } = await import('../batch.mjs');
  assert.deepEqual(summarize(out).map(r => r.status), ['completed'], 'the summary has the result, not the failed attempt');
});
