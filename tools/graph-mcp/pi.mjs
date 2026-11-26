// Connect the graph tools to a Pi (1.x) SDK session, in one of two ways:
//   mcp    — Pi's built-in MCP extension runs server.mjs over stdio, with direct exposure (the proposal's MCP channel);
//   native — the same functions registered as Pi custom tools, with no subprocess.
// Both give the model the same tool names, descriptions and results, so the channel is the only difference.
//
//   node pi.mjs --graph G.yaml --cwd CHECKOUT --prompt "..." [--channel mcp|native] [--run-dir DIR]
//               [--provider openai] [--model gpt-6-astra] [--effort medium] [--tools a,b] [--max-chars N] ...
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import {
  createAgentSession, createMcpExtension, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager, VERSION,
} from '@earendil-works/pi-coding-agent';
import { parseCli } from './server.mjs';
import { createGraphTools, toolDefinitions } from './tools.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SERVER_NAME = 'graph';
/** Pi names MCP tools mcp__<server>__<tool>; native tools use the same names so the model sees no difference. */
export const piToolName = name => `mcp__${SERVER_NAME}__${name}`;
export const PI_DEFAULT_TOOLS = ['read', 'bash', 'edit', 'write'];
const DESCRIPTION = 'Component graph of this codebase: components, their files and dependencies, and the change the developer requested.';

/** server.mjs flags for a config (the inverse of parseCli). */
export function serverArgs(config) {
  const flags = { graph: config.graph, 'run-dir': config.runDir, tools: config.tools?.join(','), 'max-chars': config.maxChars,
    'max-files': config.maxFiles, 'evidence-per-edge': config.evidencePerEdge, 'max-calls': config.maxCalls };
  return Object.entries(flags).filter(([, v]) => v !== undefined).flatMap(([k, v]) => [`--${k}`, String(resolveIfPath(k, v))]);
}
const resolveIfPath = (key, value) => (['graph', 'run-dir'].includes(key) ? resolve(value) : value);

/**
 * Pi's MCP extension, given exactly these servers ({ name, config } with an mcp.json-style config). loadConfig
 * replaces Pi's reading of the user's and the project's mcp.json, so no other server can connect. Exposure defaults
 * to direct, which declares each tool to the model like a built-in one (Pi's default, codemode, would hide them
 * behind a script tool).
 */
export function mcpExtension(servers, runDir) {
  const entries = servers.map(({ name, config }) => ({
    name, source: `<${name}>`, scope: 'extension', config: { exposure: 'direct', ...config },
  }));
  return {
    name: 'mcp-servers',
    factory: createMcpExtension({
      loadConfig: () => ({ servers: entries, autoEnableCodemode: false, errors: [] }),
      ...(runDir ? { logPath: join(resolve(runDir), 'mcp.log') } : {}),
    }),
  };
}

/** The graph server as an MCP server entry. */
export function graphServer(config) {
  return {
    name: SERVER_NAME,
    config: { command: process.execPath, args: [join(HERE, 'server.mjs'), ...serverArgs(config)], description: DESCRIPTION },
  };
}

/** MCP channel: the graph server alone. */
export const graphMcpExtension = config => mcpExtension([graphServer(config)], config.runDir);

/** Native channel: the graph tools as Pi custom tools. */
export function graphCustomTools(config) {
  const tools = createGraphTools(config);
  return tools.definitions.map(def => ({
    name: piToolName(def.name), label: def.name, description: def.description, parameters: def.inputSchema,
    execute: async (_id, args) => {
      const result = tools.call(def.name, args);
      if (result.isError) throw new Error(result.content[0].text);
      return { content: result.content, details: {} };
    },
  }));
}

/**
 * A resource loader that discovers nothing: no extensions, skills, prompt templates, themes or context files
 * (AGENTS.md) from disk, and only the given system prompt and inline extensions.
 */
export async function isolatedResourceLoader({ cwd, agentDir, settingsManager, systemPrompt, extensions = [] }) {
  const loader = new DefaultResourceLoader({
    cwd, agentDir, settingsManager, systemPrompt, extensionFactories: extensions,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  });
  await loader.reload();
  return loader;
}

export async function createModelRuntime(authFile) {
  const authPath = authFile ? resolve(authFile) : join(homedir(), '.pi/agent/auth.json');
  return ModelRuntime.create({
    ...(existsSync(authPath) ? { authPath } : { credentials: new InMemoryCredentialStore() }),
    modelsPath: null, allowModelNetwork: false, refreshOnCreate: false,
  });
}

/**
 * Start an isolated Pi session in `cwd` with the graph tools on the chosen channel, plus Pi's coding tools.
 * config: server config (graph, runDir, tools, maxChars, ...) plus cwd, channel ('mcp' | 'native' | 'none' for no
 * graph tools), provider, model, effort, systemPrompt, builtinTools (default read/bash/edit/write; [] for graph tools
 * only), extraMcpServers ([{ name, config }], e.g. CodeGraph's server). Returns the session and the tool names the
 * model should see; check them with assertTools after the first prompt has started.
 */
export async function createGraphSession(config, runtime) {
  const channel = config.channel ?? 'mcp';
  if (!['mcp', 'native', 'none'].includes(channel)) throw new Error(`Unknown channel: ${channel}`);
  if (channel !== 'none' && !config.graph) throw new Error(`Channel ${channel} needs a graph`);
  const cwd = resolve(config.cwd);
  const runDir = config.runDir ? resolve(config.runDir) : mkdtempSync(join(tmpdir(), 'graph-pi-'));
  mkdirSync(runDir, { recursive: true });
  // A private agent directory: no user settings, auth, extensions or mcp.json leak into the session.
  const agentDir = join(runDir, 'pi-private');
  mkdirSync(agentDir, { recursive: true });
  const serverConfig = { ...config, runDir };
  runtime ??= await createModelRuntime(config.authFile);
  const model = runtime.getModel(config.provider ?? 'openai', config.model ?? 'gpt-6-astra');
  if (!model) throw new Error(`Pi ${VERSION} has no model ${config.provider ?? 'openai'}/${config.model ?? 'gpt-6-astra'}; no fallback is used`);
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false }, cacheWarming: 'off', retry: { enabled: false, provider: { maxRetries: 0, timeoutMs: 120_000 } },
  });
  const graphNames = channel === 'none' ? [] : (config.tools ?? toolDefinitions.map(t => t.name)).map(piToolName);
  const builtins = config.builtinTools ?? PI_DEFAULT_TOOLS;
  const extra = config.extraMcpServers ?? [];
  const servers = [...(channel === 'mcp' ? [graphServer(serverConfig)] : []), ...extra];
  const resourceLoader = await isolatedResourceLoader({
    cwd, agentDir, settingsManager, systemPrompt: config.systemPrompt,
    extensions: servers.length ? [mcpExtension(servers, runDir)] : [],
  });
  // Every tool of an extra server is allowed; their names are only known once it connects.
  const extraPatterns = extra.map(s => `mcp__${s.name}__*`);
  const { session } = await createAgentSession({
    cwd, agentDir, modelRuntime: runtime, model, thinkingLevel: config.effort ?? 'medium',
    tools: [...builtins, ...graphNames, ...extraPatterns], sessionManager: SessionManager.inMemory(cwd), settingsManager, resourceLoader,
    customTools: channel === 'native' ? graphCustomTools(serverConfig) : [],
  });
  // Emits session_start: the MCP extension connects the servers here; the first prompt waits for direct tools.
  await session.bindExtensions({});
  return { session, runDir, channel, model, expectedTools: [...builtins, ...graphNames], allowedPrefixes: extra.map(s => `mcp__${s.name}__`) };
}

/**
 * End the session. dispose() alone leaves the MCP server running (and the process alive): extensions release their
 * resources on session_shutdown, which Pi's own runtime emits on quit but an SDK caller must emit itself.
 */
export async function closeGraphSession(session) {
  try {
    if (session.extensionRunner?.hasHandlers('session_shutdown')) {
      await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
    }
  } finally {
    session.dispose();
  }
}

/**
 * Throw unless the session offers exactly the expected tools, plus any tools of the allowed extra servers (call after
 * the first prompt has started, for MCP). Returns the active tool names.
 */
export function assertTools(session, expected, allowedPrefixes = []) {
  const all = [...session.getActiveToolNames()].sort();
  const active = all.filter(name => !allowedPrefixes.some(p => name.startsWith(p)));
  if (JSON.stringify(active) !== JSON.stringify([...expected].sort())) {
    throw new Error(`Pi session has unexpected tools: ${active.join(', ')} (expected ${[...expected].sort().join(', ')})`);
  }
  return all;
}

// ------------------------------------------------------------------ CLI: one prompt, for pilots

async function main(argv) {
  const { values } = parseArgs({
    args: argv, strict: false,
    options: { cwd: { type: 'string' }, prompt: { type: 'string' }, channel: { type: 'string' }, provider: { type: 'string' },
      model: { type: 'string' }, effort: { type: 'string' }, 'auth-file': { type: 'string' }, 'system-prompt': { type: 'string' } },
  });
  if (!values.cwd || !values.prompt) throw new Error('Usage: node pi.mjs --graph G.yaml --cwd DIR --prompt "..." [--channel mcp|native] [--run-dir DIR]');
  const serverFlags = argv.filter((a, i) => !['--cwd', '--prompt', '--channel', '--provider', '--model', '--effort', '--auth-file', '--system-prompt']
    .some(f => a === f || argv[i - 1] === f));
  const config = { ...parseCli(serverFlags), cwd: values.cwd, channel: values.channel, provider: values.provider, model: values.model,
    effort: values.effort, authFile: values['auth-file'], systemPrompt: values['system-prompt'] };
  const { session, runDir, expectedTools } = await createGraphSession(config);
  const events = [];
  session.subscribe(event => {
    if (['message_end', 'tool_execution_start', 'tool_execution_end'].includes(event.type)) events.push(event);
    if (event.type === 'tool_execution_start') console.error(`[tool] ${event.toolName} ${JSON.stringify(event.args ?? {})}`);
    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') process.stdout.write(event.assistantMessageEvent.delta);
  });
  try {
    await session.prompt(values.prompt, { expandPromptTemplates: false });
    assertTools(session, expectedTools);
  } finally {
    writeFileSync(join(runDir, 'events.jsonl'), events.map(e => JSON.stringify(e)).join('\n') + '\n');
    writeFileSync(join(runDir, 'effective-system-prompt.md'), session.systemPrompt);
    await closeGraphSession(session);
  }
  console.error(`\nRun files: ${runDir}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
