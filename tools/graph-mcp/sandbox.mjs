// Sandbox for the agent's own tools (macOS): Pi's bash, read, edit and write, rebuilt from Pi's factories so their
// names, schemas and descriptions are unchanged, with every bash command run under sandbox-exec and every file tool
// path checked. The model API calls and the graph's MCP server run in Pi's process, outside the sandbox.
//
// What the agent can do:
//   network  Unix sockets (DNS lookups) and localhost servers; no outbound connection to any other address
//   read     everything outside /Users and /Volumes (system files, /tmp), and under them only the checkout, env.sh and
//            the Node toolchain (nvm, corepack's Yarn); never a `deny` path (PILOT_PRIVATE). File metadata (stat) is
//            readable everywhere, so paths can be resolved; directory listings and contents are not.
//   write    the checkout, temporary directories, /dev, and the toolchain caches
//   read/edit/write tools: the checkout only (and env.sh for read)
// A refusal shows up as "Operation not permitted" (bash) or SANDBOX_REFUSAL (file tools); the audit counts both.
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync, writeFileSync } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import {
  createBashToolDefinition, createEditToolDefinition, createReadToolDefinition, createWriteToolDefinition,
} from '@earendil-works/pi-coding-agent';

export const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
export const SANDBOX_REFUSAL = 'Sandbox: outside the checkout';

export const sandboxSupported = () => process.platform === 'darwin' && existsSync(SANDBOX_EXEC);

/** The nearest existing ancestor's real path, plus the rest: real paths for files that do not exist yet. */
export function realish(path) {
  let p = resolve(path);
  const rest = [];
  while (!existsSync(p)) {
    const parent = dirname(p);
    if (parent === p) break;
    rest.unshift(p.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)));
    p = parent;
  }
  return join(realpathSync(p), ...rest);
}

const within = (path, roots) => roots.some(r => path === r || path.startsWith(r.endsWith(sep) ? r : `${r}${sep}`));

/**
 * The sandbox for one run. workdir: the checkout; envScript: the env.sh the agent sources; deny: paths that stay
 * unreadable even inside an allowed directory (PILOT_PRIVATE); home: whose toolchain folders to allow.
 */
export function sandboxSpec({ workdir, envScript, deny = [], home = homedir() }) {
  const r = p => realish(p);
  const toolchain = ['.nvm', '.cache/node', '.yarn'].map(d => join(home, d)).filter(existsSync).map(r);
  const temp = ['/tmp', '/private/var/folders', process.env.TMPDIR].filter(p => p && existsSync(p)).map(r);
  return {
    workdir: r(workdir),
    envScript: envScript ? r(envScript) : null,
    readable: [...new Set([r(workdir), ...toolchain])],
    writable: [...new Set([r(workdir), ...temp, ...toolchain.filter(p => !p.endsWith(`${sep}.nvm`))])],
    deny: [...new Set(deny.filter(Boolean).map(r))],
  };
}

const q = s => JSON.stringify(s); // SBPL strings use the same escapes as JSON for paths

/** The sandbox-exec profile (SBPL). Later rules win, so the deny list comes last. */
export function sandboxProfile(spec) {
  const sub = paths => paths.map(p => `(subpath ${q(p)})`).join(' ');
  return [
    '(version 1)',
    '(allow default)',
    '(deny network*)',
    // Not `(local ip "localhost:*")`: on macOS that lets every outbound connection through.
    '(allow network* (remote unix-socket) (remote ip "localhost:*"))',
    '(allow network-bind network-inbound (local ip "localhost:*"))',
    '(deny file-read* (subpath "/Users") (subpath "/Volumes"))',
    '(allow file-read-metadata)',
    `(allow file-read* ${sub(spec.readable)}${spec.envScript ? ` (literal ${q(spec.envScript)})` : ''})`,
    '(deny file-write*)',
    `(allow file-write* ${sub(spec.writable)} (subpath "/dev"))`,
    ...(spec.deny.length ? [`(deny file-read* file-write* ${sub(spec.deny)})`] : []),
    '',
  ].join('\n');
}

const shellQuote = s => `'${s.replace(/'/g, `'\\''`)}'`;

/** Pi's bash/read/edit/write definitions, sandboxed. Writes the profile to profileFile. */
export function sandboxedToolDefinitions(cwd, spec, profileFile, names = ['read', 'bash', 'edit', 'write']) {
  if (!sandboxSupported()) throw new Error(`The agent sandbox needs macOS ${SANDBOX_EXEC}; run with sandbox off on this platform`);
  writeFileSync(profileFile, sandboxProfile(spec));
  const readRoots = [spec.workdir, ...(spec.envScript ? [spec.envScript] : [])];
  const check = (path, roots) => {
    const real = realish(path);
    if (!within(real, roots) || within(real, spec.deny)) throw new Error(`${SANDBOX_REFUSAL}: ${path}`);
    return real;
  };
  const make = {
    bash: () => createBashToolDefinition(cwd, {
      spawnHook: ctx => ({ ...ctx, command: `${SANDBOX_EXEC} -f ${shellQuote(profileFile)} /bin/bash -c ${shellQuote(ctx.command)}` }),
    }),
    read: () => createReadToolDefinition(cwd, { operations: {
      readFile: p => readFile(check(p, readRoots)), access: p => access(check(p, readRoots)),
    } }),
    edit: () => createEditToolDefinition(cwd, { operations: {
      readFile: p => readFile(check(p, [spec.workdir])), writeFile: (p, c) => writeFile(check(p, [spec.workdir]), c),
      access: p => access(check(p, [spec.workdir])),
    } }),
    write: () => createWriteToolDefinition(cwd, { operations: {
      writeFile: (p, c) => writeFile(check(p, [spec.workdir]), c), mkdir: d => mkdir(check(d, [spec.workdir]), { recursive: true }).then(() => {}),
    } }),
  };
  return names.filter(n => make[n]).map(n => make[n]());
}

/** Run one command under the profile (for tests and a quick manual check). */
export function runSandboxed(profileFile, command, cwd) {
  return spawnSync(SANDBOX_EXEC, ['-f', profileFile, '/bin/bash', '-c', command], { cwd, encoding: 'utf8' });
}
