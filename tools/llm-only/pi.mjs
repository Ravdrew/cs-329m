import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { clampThinkingLevel } from '@earendil-works/pi-ai/compat';
import { createAgentSession, createExtensionRuntime, ModelRuntime, SessionManager, SettingsManager, VERSION } from '@earendil-works/pi-coding-agent';
import { createGraphTools, toolDefinitions } from './source-server.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_MODEL = 'gpt-6-astra';
export const DEFAULT_PROVIDER = 'openai';
export const toolNames = toolDefinitions.map(tool => tool.name);
const frozenReason = 'Graph frozen; stopped after finalization';
const json = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

export async function createModelRuntime(config = {}) {
  const authPath = config.authFile ? resolve(config.authFile) : join(homedir(), '.pi/agent/auth.json');
  if (config.authFile && !existsSync(authPath)) throw new Error('The specified Pi auth file does not exist');
  return ModelRuntime.create({
    ...(existsSync(authPath) ? { authPath } : { credentials: new InMemoryCredentialStore() }),
    modelsPath: null, allowModelNetwork: false, refreshOnCreate: false,
  });
}

function selectModel(runtime, config) {
  const provider = config.provider ?? DEFAULT_PROVIDER;
  const id = config.model ?? DEFAULT_MODEL;
  const model = runtime.getModel(provider, id);
  if (!model) throw new Error(`Pi ${VERSION} does not contain ${provider}/${id}; no fallback model will be used`);
  const effort = config.effort ?? 'medium';
  if (clampThinkingLevel(model, effort) !== effort) throw new Error(`${provider}/${id} does not support reasoning effort ${effort}`);
  return model;
}

export async function checkPi(config = {}, runtime) {
  runtime ??= await createModelRuntime(config);
  const model = selectModel(runtime, config);
  const auth = await runtime.getAuth(model, { signal: AbortSignal.timeout(30_000) });
  if (!auth) throw new Error(`Pi needs credentials for ${model.provider}/${model.id}. For OpenAI, set OPENAI_API_KEY locally or sign in with Pi's /login (OpenAI). Never put credentials in graph files or arguments.`);
  // Only report non-secret metadata. Never serialize the resolved auth object.
  return { version: VERSION, provider: model.provider, model: model.id, api: model.api, reasoning_effort: config.effort ?? 'medium' };
}

export function isolatedResources(instructions) {
  const runtime = createExtensionRuntime();
  return {
    getExtensions: () => ({ extensions: [], errors: [], runtime }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => instructions,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => { throw new Error('Resources are fixed for this experiment'); },
    reload: async () => {},
  };
}

// This runs inside a disposable subprocess in production. Tests inject only the model
// transport; the actual Pi session, tool dispatch, validation and event handling still run.
export async function runPiSession(config, emit = () => {}, runtime) {
  runtime ??= await createModelRuntime(config);
  const model = selectModel(runtime, config);
  await checkPi(config, runtime);
  const tools = createGraphTools(config);
  let session;
  let attempts = 0;
  let stopReason = null;
  let lastError = null;
  let responses = 0;
  let usage = null;
  const usageKeys = ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens'];
  const costKeys = ['input', 'output', 'cacheRead', 'cacheWrite', 'total'];
  const stop = reason => {
    if (stopReason) return;
    stopReason = reason;
    if (reason !== frozenReason) json(join(config.runDir, 'limit.json'), { reason, calls: attempts });
    session?.agent.abort();
  };
  const instructions = readFileSync(join(config.runDir, 'instructions.md'), 'utf8');
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false }, cacheWarming: 'off',
    retry: { enabled: false, provider: { maxRetries: 0, timeoutMs: 120_000 } },
    transport: 'sse',
  });
  ({ session } = await createAgentSession({
    cwd: config.checkout, agentDir: join(config.runDir, 'pi-private'), modelRuntime: runtime, model,
    thinkingLevel: config.effort, tools: toolNames,
    sessionManager: SessionManager.inMemory(config.checkout), settingsManager,
    resourceLoader: isolatedResources(instructions),
    customTools: toolDefinitions.map(def => ({
      name: def.name, label: def.name, description: def.description, parameters: def.inputSchema,
      executionMode: 'sequential',
      execute: async (_id, args, signal) => {
        if (signal?.aborted || stopReason) throw new Error(stopReason ?? 'Interrupted');
        const result = tools.call(def.name, args);
        if (result.isError) throw new Error(result.content[0].text);
        // Mark completion here; the finishTurn hook below ends the loop. An abort
        // signal alone can still enter the next transport in Pi's agent loop.
        if (def.name === 'finalize_graph' && tools.graph.frozen) stop(frozenReason);
        return { content: result.content, details: {} };
      },
    })),
  }));
  const finishTurn = session.agent.finishTurn;
  session.agent.finishTurn = async (turn, signal) => {
    const decision = await finishTurn?.(turn, signal);
    return stopReason ? { action: 'end' } : decision;
  };
  const stream = session.agent.streamFunction;
  session.agent.streamFunction = (...args) => {
    if (stopReason || Date.now() >= config.deadline) {
      stop(stopReason ?? 'Time limit reached');
      throw new Error(stopReason);
    }
    return stream(...args);
  };
  let monitor;
  const interrupted = () => stop('Interrupted');
  try {
    if (session.messages.length || JSON.stringify([...session.getActiveToolNames()].sort()) !== JSON.stringify([...toolNames].sort())) throw new Error('Pi session inherited history or unexpected tools');
    // Pi appends only the explicit working directory to a custom system prompt.
    const expectedPrompt = `${instructions}\n\n<cwd>\n${config.checkout}\n</cwd>`;
    if (session.systemPrompt !== expectedPrompt || session.thinkingLevel !== config.effort) throw new Error('Pi changed the experiment instructions or reasoning effort');
    writeFileSync(join(config.runDir, 'effective-system-prompt.md'), session.systemPrompt);
    json(join(config.runDir, 'pi-session.json'), {
      sdk_version: VERSION, session_id: session.sessionManager.getSessionId(),
      model, reasoning_effort: session.thinkingLevel, tools: session.getActiveToolNames(),
      inherited_resources: [], compaction: false, cache_warming: false, retries: false,
    });
    emit({ type: 'session_started', provider: model.provider, model: model.id, tools: toolNames });
    session.subscribe(event => {
      // Finalized messages contain the transcript and one usage value per response.
      // Avoid duplicating partial streaming events or persisting transport headers.
      if (['message_end', 'tool_execution_start', 'tool_execution_end', 'agent_end'].includes(event.type)) emit(event);
      if (event.type === 'message_end' && event.message.role === 'assistant') {
        responses++;
        const current = event.message.usage;
        if (current) {
          usage ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: Object.fromEntries(costKeys.map(key => [key, 0])) };
          for (const key of usageKeys) usage[key] += current[key] ?? 0;
          if (current.reasoning !== undefined) usage.reasoning = (usage.reasoning ?? 0) + current.reasoning;
          for (const key of costKeys) usage.cost[key] += current.cost?.[key] ?? 0;
        }
        if (['error', 'aborted'].includes(event.message.stopReason)) lastError = event.message.errorMessage ?? event.message.stopReason;
        emit({ type: 'usage', usage, responses });
      }
      if (event.type === 'tool_execution_start') {
        attempts++;
        if (!toolNames.includes(event.toolName)) stop(`Unexpected tool request: ${event.toolName}`);
        else if (attempts > config.maxTools) stop('Tool-call limit reached');
      }
      if (event.type === 'tool_execution_end' && event.toolName === 'finalize_graph' && !event.isError && tools.graph.frozen) stop(frozenReason);
    });
    process.once('SIGINT', interrupted);
    process.once('SIGTERM', interrupted);
    monitor = setInterval(() => { if (Date.now() >= config.deadline) stop('Time limit reached'); }, 100);
    await session.prompt(`Construct the graph for ${config.repo} at ${config.commit}. Use the source tools and finalize_graph. You have at most ${config.maxTools} tool calls and ${config.maxMinutes} minutes. Start by discovering source files.`, { expandPromptTemplates: false });
  } catch (error) {
    lastError = error.message;
  } finally {
    clearInterval(monitor);
    process.removeListener('SIGINT', interrupted);
    process.removeListener('SIGTERM', interrupted);
    session.dispose();
  }
  const result = { code: tools.graph.frozen && (!stopReason || stopReason === frozenReason) ? 0 : 1, stopReason, lastError, usage, responses, toolAttempts: attempts };
  emit({ type: 'run_completed', ...result });
  return result;
}

export async function executePi(config, progress = () => {}, worker = join(HERE, 'pi.mjs')) {
  const args = [worker, '--worker', join(config.runDir, 'server.json')];
  for (const file of ['events.jsonl', 'pi.stderr.log']) writeFileSync(join(config.runDir, file), '', { flag: 'wx' });
  json(join(config.runDir, 'invocation.json'), { binary: process.execPath, args });
  // The SDK gets explicit resources, settings and history. Do not inherit Node injection
  // or another agent's process identity. Provider credentials stay in their normal place.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('CODEX_') && !key.startsWith('PI_') && !['NODE_OPTIONS', 'NODE_PATH'].includes(key)));
  env.PI_OFFLINE = '1';
  env.PI_TELEMETRY = '0';
  const child = spawn(process.execPath, args, { cwd: config.checkout, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stopReason = null;
  let forceKill;
  let finalizedAt;
  let usage = null;
  let responses = 0;
  let lastError = null;
  let reported;
  const stop = reason => {
    if (stopReason) return;
    stopReason = reason;
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already exited */ }
    forceKill = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ } }, 2000);
  };
  const onInterrupt = () => stop('Interrupted');
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onInterrupt);
  const monitor = setInterval(() => {
    if (existsSync(join(config.runDir, 'validation.json'))) finalizedAt ??= Date.now();
    if (existsSync(join(config.runDir, 'limit.json'))) {
      let reason = 'Tool/time limit reached';
      try { reason = JSON.parse(readFileSync(join(config.runDir, 'limit.json'), 'utf8')).reason ?? reason; } catch { /* writer may still be finishing */ }
      stop(reason);
    }
    else if (finalizedAt && Date.now() - finalizedAt > 15_000) stop(frozenReason);
    else if (!finalizedAt && Date.now() >= config.deadline) stop('Time limit reached');
  }, 100);
  const readEvents = (async () => {
    for await (const line of createInterface({ input: child.stdout })) {
      appendFileSync(join(config.runDir, 'events.jsonl'), `${line}\n`);
      let event;
      try { event = JSON.parse(line); } catch { stop('Pi worker emitted invalid JSON'); continue; }
      if (event.type === 'usage' || event.type === 'run_completed') { usage = event.usage; responses = event.responses; }
      if (event.type === 'run_completed') { reported = event; lastError = event.lastError; }
      if (event.type === 'worker_error') lastError = event.message;
      if (event.type === 'tool_execution_end') progress({ tool: event.toolName, status: event.isError ? 'error' : 'completed' });
    }
  })();
  child.stderr.on('data', chunk => appendFileSync(join(config.runDir, 'pi.stderr.log'), chunk));
  try {
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    await readEvents;
    return { ...result, stopReason: stopReason ?? reported?.stopReason ?? null, lastError, usage, responses, toolAttempts: reported?.toolAttempts ?? null };
  } finally {
    clearInterval(monitor);
    clearTimeout(forceKill);
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onInterrupt);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2] === '--worker') {
  const emit = event => process.stdout.write(`${JSON.stringify(event)}\n`);
  runPiSession(JSON.parse(readFileSync(process.argv[3], 'utf8')), emit)
    .then(result => { process.exitCode = result.code; })
    .catch(error => { emit({ type: 'worker_error', message: error.message }); process.exitCode = 1; });
}
