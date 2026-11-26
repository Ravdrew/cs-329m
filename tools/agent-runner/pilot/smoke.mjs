// Stage 1 of the pilot: the real model (Pi, gpt-6-astra) on the fixture task, through the real harness, prompt builder
// and runner. Minutes and cents; it checks credentials, real tool use, grading, usage recording and limits without
// Cal.com. See ../TESTING.md.
//
//   node tools/agent-runner/pilot/smoke.mjs [--python PY] [--conditions prose,text,tool] [--dir DIR]
//                                           [--model gpt-6-astra] [--effort medium] [--auth-file FILE]
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createModelRuntime } from '../../graph-mcp/pi.mjs';
import { makeFixture, TASK } from '../fixture-repo.mjs';
import { python, runOne } from '../run.mjs';

const { values } = parseArgs({ options: {
  python: { type: 'string', default: 'python3' }, conditions: { type: 'string', default: 'prose,text,tool' },
  dir: { type: 'string' }, provider: { type: 'string', default: 'openai' }, model: { type: 'string', default: 'gpt-6-astra' },
  effort: { type: 'string', default: 'medium' }, 'auth-file': { type: 'string' },
} });

const die = message => { console.error(`error: ${message}`); process.exit(1); };

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 19)) die(`the runner needs Node 22.19+; this is ${process.version}`);

// Credentials first, so a missing login fails here and not inside a run.
const runtime = await createModelRuntime(values['auth-file']);
if (process.env.OPENAI_API_KEY) await runtime.setRuntimeApiKey('openai', process.env.OPENAI_API_KEY);
const model = runtime.getModel(values.provider, values.model);
if (!model) die(`Pi has no model ${values.provider}/${values.model}`);
if (!await runtime.getAuth(model, { signal: AbortSignal.timeout(30_000) })) {
  die(`no Pi credentials for ${values.provider}/${values.model}: run Pi's /login openai (TESTING.md) or set OPENAI_API_KEY`);
}
console.log(`credentials ok for ${model.provider}/${model.id}`);

const root = values.dir ? resolve(values.dir) : realpathSync(mkdtempSync(join(tmpdir(), 'q2q3-smoke-')));
mkdirSync(root, { recursive: true });
const { pilots, inputs } = makeFixture(realpathSync(root), 1);
const [pilot] = pilots;
const settings = { python: values.python, ...pilot };
python(settings, 'harness.py', ['prepare', String(TASK)]);
console.log(`fixture prepared in ${root}\n`);

const rows = [];
try {
  for (const condition of values.conditions.split(',')) {
    process.stdout.write(`${condition}: running... `);
    const r = await runOne({
      ...settings, task: TASK, condition, repeat: 1, out: join(root, 'runs'), inputs,
      provider: values.provider, model: values.model, effort: values.effort, authFile: values['auth-file'],
      maxMinutes: 10, maxToolCalls: 60, maxCostUsd: 2,
    });
    rows.push(r);
    console.log(`${r.status}${r.stop_reason ? ` (${r.stop_reason})` : ''}, resolved=${r.resolved}, ` +
      `tool calls ${r.tool_calls} (graph ${r.graph_tool_calls}), $${(r.usage?.cost ?? 0).toFixed(3)}, ` +
      `${Math.round((r.duration_ms ?? 0) / 1000)}s${r.audit_flagged ? ', AUDIT FLAGGED' : ''}${r.error ? `\n  error: ${r.error}` : ''}`);
  }
} finally {
  python(settings, 'harness.py', ['restore', String(TASK)], { allowFail: true });
}

console.log(`\nRun directories: ${join(root, 'runs', String(TASK))}`);
const bad = rows.filter(r => ['error', 'invalid'].includes(r.status) || r.resolved === null);
const graphless = rows.filter(r => ['tool', 'tool-noedit'].includes(r.condition) && !r.graph_tool_calls);
if (graphless.length) console.log(`note: ${graphless.map(r => r.condition).join(', ')} never called a graph tool`);
if (bad.length) {
  console.log(`FAILED: ${bad.map(r => `${r.condition} (${r.status}${r.error ? `: ${r.error}` : ''})`).join('; ')}`);
  process.exitCode = 1;
} else {
  console.log('smoke test passed: every run completed and was graded');
}
