// The agent sandbox (sandbox.mjs) on macOS: the profile on its own, then Pi's tools inside a session.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { closeGraphSession, createGraphSession } from '../pi.mjs';
import { runSandboxed, SANDBOX_EXEC, SANDBOX_REFUSAL, sandboxedToolDefinitions, sandboxProfile, sandboxSpec, sandboxSupported } from '../sandbox.mjs';
import { modelFixture, toolCall } from './model-fixture.mjs';

const SKIP = !sandboxSupported() && 'needs macOS sandbox-exec';
// Under the home directory, like the real pilot directories (~/q2q3-pilot): outside /Users everything but the deny
// list is readable by design, so a fixture in /tmp could not show the pilot directory's other files staying private.
const root = SKIP ? realpathSync(mkdtempSync(join(tmpdir(), 'sandbox-test-'))) : realpathSync(mkdtempSync(join(homedir(), '.sandbox-test-')));
// A secret elsewhere under the home directory, like ~/.pi/agent/auth.json or the team repo.
const homeSecretDir = join(root, 'home-secret');
mkdirSync(homeSecretDir, { recursive: true });
after(() => rmSync(root, { recursive: true, force: true }));

function fixture(name) {
  const dir = join(root, name);
  const checkout = join(dir, 'calcom');
  const hidden = join(dir, 'private');
  mkdirSync(join(checkout, 'src'), { recursive: true });
  mkdirSync(hidden, { recursive: true });
  writeFileSync(join(checkout, 'src/booking.ts'), 'export const book = 1;\n');
  writeFileSync(join(dir, 'env.sh'), 'export SANDBOX_ENV=sourced\n');
  writeFileSync(join(dir, 'install.log'), 'NOT_FOR_THE_AGENT\n');
  writeFileSync(join(hidden, 'gold.diff'), 'HIDDEN_GOLD\n');
  writeFileSync(join(homeSecretDir, 'auth.json'), 'HOME_SECRET\n');
  const spec = sandboxSpec({ workdir: checkout, envScript: join(dir, 'env.sh'), deny: [hidden] });
  const profile = join(dir, 'sandbox.sb');
  writeFileSync(profile, sandboxProfile(spec));
  return { dir, checkout, hidden, spec, profile };
}

const sh = (f, command) => {
  const r = runSandboxed(f.profile, command, f.checkout);
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
};

test('the profile: the checkout and env.sh work; home, the hidden results, other pilot files and the network do not', { skip: SKIP }, async () => {
  const f = fixture('profile');
  assert.equal(sh(f, 'cat src/booking.ts').out, 'export const book = 1;\n');
  assert.equal(sh(f, `echo ok > src/new.ts && cat src/new.ts`).out, 'ok\n');
  assert.equal(sh(f, `source ${f.dir}/env.sh && echo $SANDBOX_ENV`).out, 'sourced\n');
  assert.equal(sh(f, 'echo tmp > "$TMPDIR/sb-$$" && cat "$TMPDIR/sb-$$" && rm "$TMPDIR/sb-$$"').out, 'tmp\n', 'temporary files work');
  for (const command of [`cat ${homeSecretDir}/auth.json`, `ls ${homeSecretDir}`, `cat ${f.hidden}/gold.diff`, `ls ${f.hidden}`,
    `cat ${f.dir}/install.log`, `echo x > ${f.dir}/escape.txt`, `echo x > ${homeSecretDir}/escape.txt`]) {
    const r = sh(f, command);
    assert.match(r.out, /Operation not permitted/, command);
    assert.doesNotMatch(r.out, /HOME_SECRET|HIDDEN_GOLD|NOT_FOR_THE_AGENT/, command);
  }
  assert.ok(!existsSync(join(f.dir, 'escape.txt')));
  // A deny path wins even inside the checkout.
  const inside = fixture('inside');
  writeFileSync(inside.profile, sandboxProfile(sandboxSpec({ workdir: inside.checkout, deny: [join(inside.checkout, 'src')] })));
  assert.match(sh(inside, 'cat src/booking.ts').out, /Operation not permitted/);

  // Outbound connections fail, even to an address (no DNS needed); a localhost server still works.
  assert.notEqual(sh(f, 'curl -sS -m 5 -o /dev/null http://1.1.1.1').status, 0);
  const server = createServer(socket => socket.end('pong'));
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  try {
    const { port } = server.address();
    // Async: spawnSync would block this process's event loop, and with it the server.
    const child = spawn(SANDBOX_EXEC, ['-f', f.profile, process.execPath, '-e',
      `require('net').connect(${port},'127.0.0.1').on('data',d=>{console.log(String(d));process.exit(0)}).on('error',e=>{console.log(e.code);process.exit(1)})`],
      { cwd: f.checkout });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    const timer = setTimeout(() => child.kill(), 10_000);
    await new Promise(res => child.on('close', res));
    clearTimeout(timer);
    assert.equal(out.trim(), 'pong');
  } finally { server.close(); }
  const listen = sh(f, `${process.execPath} -e "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log('listening');s.close()})"`);
  assert.equal(listen.out.trim(), 'listening', 'a test may start a localhost server');
});

test('Pi in the sandbox: same tools and system prompt, every escape refused', { skip: SKIP }, async () => {
  const f = fixture('session');
  const secret = join(homeSecretDir, 'auth.json');
  const run = async sandbox => {
    const { runtime, requests } = await modelFixture([[
      toolCall('bash', { command: `cat ${secret}; cat ${f.hidden}/gold.diff; echo edited >> src/booking.ts` }),
      toolCall('read', { path: secret }),
      toolCall('read', { path: `${f.dir}/install.log` }),
      toolCall('write', { path: `${f.dir}/escape.txt`, content: 'x' }),
      toolCall('edit', { path: '../install.log', edits: [{ oldText: 'NOT', newText: 'YES' }] }),
      toolCall('read', { path: 'src/booking.ts' }),
    ]]);
    const runDir = join(f.dir, sandbox ? 'run-sandboxed' : 'run-open');
    const { session } = await createGraphSession({ cwd: f.checkout, runDir, channel: 'none', sandbox, systemPrompt: 'You are a test agent.' }, runtime);
    try { await session.prompt('Go.', { expandPromptTemplates: false }); } finally { await closeGraphSession(session); }
    const results = requests.at(-1).messages.filter(m => m.role === 'toolResult').map(m => m.content.map(c => c.text).join(''));
    return { requests, results, runDir, systemPrompt: session.systemPrompt };
  };
  const open = await run(undefined);
  writeFileSync(join(f.checkout, 'src/booking.ts'), 'export const book = 1;\n');
  rmSync(join(f.dir, 'escape.txt'), { force: true });
  writeFileSync(join(f.dir, 'install.log'), 'NOT_FOR_THE_AGENT\n'); // the open run's edit got out
  const boxed = await run(f.spec);

  // The model sees exactly the same tools and instructions.
  assert.equal(boxed.systemPrompt, open.systemPrompt);
  assert.deepEqual(boxed.requests[0].tools, open.requests[0].tools);
  assert.ok(existsSync(join(boxed.runDir, 'sandbox.sb')), 'profile kept with the run');

  // Without the sandbox everything leaks (this is what the audit used to be the only guard against) ...
  assert.match(open.results[0], /HOME_SECRET[\s\S]*HIDDEN_GOLD/);
  // ... with it, nothing does, and work inside the checkout goes on.
  const [bash, readSecret, readLog, write, edit] = boxed.results;
  assert.match(bash, /Operation not permitted/);
  assert.doesNotMatch(bash, /HOME_SECRET|HIDDEN_GOLD/);
  for (const r of [readSecret, readLog, write, edit]) assert.match(r, new RegExp(SANDBOX_REFUSAL));
  assert.doesNotMatch(boxed.results.join('\n'), /HOME_SECRET|HIDDEN_GOLD|NOT_FOR_THE_AGENT/);
  // (Pi runs a turn's tool calls in parallel, so check the edit on disk, not through the read in the same turn.)
  assert.equal(readFileSync(join(f.checkout, 'src/booking.ts'), 'utf8'), 'export const book = 1;\nedited\n');
  assert.match(boxed.results[5], /export const book = 1;/, 'the read tool works inside the checkout');
  assert.ok(!existsSync(join(f.dir, 'escape.txt')));
  assert.equal(readFileSync(join(f.dir, 'install.log'), 'utf8'), 'NOT_FOR_THE_AGENT\n');
});

test('a symlink in the checkout does not let the file tools out', { skip: SKIP }, async () => {
  const f = fixture('symlink');
  const { symlinkSync } = await import('node:fs');
  symlinkSync(f.hidden, join(f.checkout, 'link'));
  const tools = Object.fromEntries(sandboxedToolDefinitions(f.checkout, f.spec, f.profile).map(t => [t.name, t]));
  await assert.rejects(tools.read.execute('1', { path: 'link/gold.diff' }, undefined, undefined, { cwd: f.checkout }), new RegExp(SANDBOX_REFUSAL));
  assert.match(sh(f, 'cat link/gold.diff').out, /Operation not permitted/, 'and bash cannot follow it either');
});
