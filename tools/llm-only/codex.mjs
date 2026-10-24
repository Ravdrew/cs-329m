import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const disabledFeatures = [
  'shell_tool', 'shell_snapshot', 'apps', 'plugins', 'remote_plugin', 'memories',
  'multi_agent', 'hooks', 'browser_use', 'computer_use', 'in_app_browser',
  'image_generation', 'view_image', 'code_mode',
  'workspace_dependencies', 'skill_search', 'skill_mcp_dependency_install',
];

export function checkCodex(binary) {
  const run = args => execFileSync(binary, args, { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] });
  const version = run(['--version']).trim();
  const help = run(['exec', '--help']);
  for (const flag of ['--ignore-user-config', '--ignore-rules', '--ephemeral', '--strict-config']) {
    if (!help.includes(flag)) throw new Error(`${version} lacks ${flag}; update Codex before running this isolated experiment`);
  }
  const features = run(['features', 'list']);
  for (const name of [...disabledFeatures, 'skip_host_skill_discovery']) {
    if (!new RegExp(`^${name}\\s`, 'm').test(features)) throw new Error(`${version} lacks required isolation setting ${name}`);
  }
  return version;
}

export function codexArgs(config) {
  // These are TOML-valued argv entries, never shell interpolation.
  const toml = value => value && typeof value === 'object' && !Array.isArray(value)
    ? `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}=${toml(item)}`).join(',')}}`
    : JSON.stringify(value);
  const settings = {
    approval_policy: 'never', web_search: 'disabled', project_doc_max_bytes: 0,
    project_doc_fallback_filenames: [], developer_instructions: '',
    model_instructions_file: join(config.runDir, 'instructions.md'),
    model_reasoning_effort: config.effort,
    tool_output_token_limit: 12_000,
    'features.skip_host_skill_discovery': true,
    // Current Codex uses this bounded JS host to dispatch MCP tools; it has no filesystem API.
    'features.code_mode_host': true,
    'analytics.enabled': false, 'feedback.enabled': false,
    projects: { [config.checkout]: { trust_level: 'untrusted' } },
    'mcp_servers.source.command': process.execPath,
    'mcp_servers.source.args': [join(HERE, 'source-server.mjs'), join(config.runDir, 'server.json')],
    'mcp_servers.source.cwd': config.checkout,
    'mcp_servers.source.env.PATH': `${dirname(process.execPath)}:/usr/local/bin:/usr/bin:/bin`,
    'mcp_servers.source.required': true,
    'mcp_servers.source.startup_timeout_sec': 30,
    'mcp_servers.source.tool_timeout_sec': 60,
    'mcp_servers.source.default_tools_approval_mode': 'approve',
    'mcp_servers.source.enabled_tools': ['list_source', 'search_source', 'read_source', 'update_graph', 'inspect_graph', 'finalize_graph'],
  };
  for (const name of disabledFeatures) settings[`features.${name}`] = false;
  return ['exec', '--ignore-user-config', '--ignore-rules', '--strict-config', '--ephemeral',
    '--sandbox', 'read-only', '--cd', config.checkout, '--json', '--color', 'never',
    '--model', config.model, ...Object.entries(settings).flatMap(([key, value]) => ['-c', `${key}=${toml(value)}`]), '-'];
}

export async function executeCodex(config, progress = () => {}) {
  const args = codexArgs(config);
  for (const file of ['events.jsonl', 'codex.stderr.log']) writeFileSync(join(config.runDir, file), '', { flag: 'wx' });
  writeFileSync(join(config.runDir, 'invocation.json'), `${JSON.stringify({ binary: config.codex, args }, null, 2)}\n`);
  // Do not carry desktop thread identity/executor state into a new CLI session. Auth stays in its normal location.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('CODEX_') || ['CODEX_HOME', 'CODEX_API_KEY'].includes(key)));
  const child = spawn(config.codex, args, { cwd: config.checkout, env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stopReason = null;
  let forceKill;
  let finalizedAt;
  let usage = null;
  let threadId = null;
  let lastError = null;
  const stop = reason => {
    if (stopReason) return;
    stopReason = reason;
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* child already exited */ }
    forceKill = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ } }, 2000);
  };
  const onInterrupt = () => stop('Interrupted');
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onInterrupt);
  const monitor = setInterval(() => {
    if (existsSync(join(config.runDir, 'validation.json'))) finalizedAt ??= Date.now();
    if (existsSync(join(config.runDir, 'limit.json'))) stop('Tool/time limit reached');
    else if (finalizedAt && Date.now() - finalizedAt > 15_000) stop('Graph frozen; stopped after finalization');
    else if (Date.now() >= config.deadline) stop('Time limit reached');
  }, 250);
  const lines = createInterface({ input: child.stdout });
  const readEvents = (async () => {
    for await (const line of lines) {
      appendFileSync(join(config.runDir, 'events.jsonl'), `${line}\n`);
      let event;
      try { event = JSON.parse(line); } catch { lastError = 'Codex emitted invalid JSON'; stop(lastError); continue; }
      if (event.type === 'thread.started') threadId = event.thread_id;
      if (event.type === 'turn.completed') usage = event.usage ?? null;
      if (event.type === 'turn.failed' || event.type === 'error') lastError = event.error?.message ?? event.message ?? 'Codex turn failed';
      const item = event.item;
      if (item && ['command_execution', 'web_search', 'file_change', 'collab_tool_call'].includes(item.type)) stop(`Unexpected tool exposure: ${item.type}`);
      if (item?.type === 'mcp_tool_call' && item.server !== 'source') stop(`Unexpected MCP server: ${item.server}`);
      if (event.type === 'item.completed' && item?.type === 'mcp_tool_call') progress({ tool: item.tool, status: item.status });
    }
  })();
  child.stderr.on('data', chunk => appendFileSync(join(config.runDir, 'codex.stderr.log'), chunk));
  child.stdin.on('error', () => {}); // An early config/auth failure may close stdin before the prompt is consumed.
  child.stdin.end(`Construct the graph for ${config.repo} at ${config.commit}. Use the source tools and finalize_graph. You have at most ${config.maxTools} tool calls and ${config.maxMinutes} minutes. Start by discovering source files.\n`);
  try {
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    await readEvents;
    return { ...result, stopReason, lastError, usage, threadId };
  } finally {
    clearInterval(monitor);
    clearTimeout(forceKill);
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onInterrupt);
  }
}
