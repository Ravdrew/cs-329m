// One coding-agent session: Pi in the task's checkout, with the condition's graph channel, under time, tool-call and
// cost limits. Runs in a disposable subprocess (`node agent.mjs --worker CONFIG.json`) that prints one JSON event per
// line; tests call runAgent directly with a scripted model.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertTools, closeGraphSession, createGraphSession, createModelRuntime } from '../graph-mcp/pi.mjs';

const MAX_EVENT_TEXT = 20_000;

/** Tool results can be large (file reads); keep the event log readable. The full transcript is in the session. */
function trimResult(result) {
  const content = result?.content;
  if (!Array.isArray(content)) return result;
  return { ...result, content: content.map(c => (c.type === 'text' && c.text.length > MAX_EVENT_TEXT
    ? { ...c, text: `${c.text.slice(0, MAX_EVENT_TEXT)}\n…[${c.text.length - MAX_EVENT_TEXT} more characters]` }
    : c)) };
}

/**
 * config: { workdir, runDir, prompt, condition: { channel, graph, codegraph }, codegraphServer?, provider, model,
 *           effort, maxMinutes, maxToolCalls, maxCostUsd, authFile?, graphTools?, maxChars? }
 */
export async function runAgent(config, emit = () => {}, runtime) {
  if (!runtime) {
    runtime = await createModelRuntime(config.authFile);
    // An API key in the environment would be visible to the agent's bash tool: hand it to Pi, then remove it.
    if (process.env.OPENAI_API_KEY) {
      await runtime.setRuntimeApiKey('openai', process.env.OPENAI_API_KEY);
      delete process.env.OPENAI_API_KEY;
    }
  }
  const { condition } = config;
  const extraMcpServers = condition.codegraph
    ? [{ name: 'codegraph', config: { cwd: config.workdir, ...config.codegraphServer } }]
    : [];
  if (condition.codegraph && !config.codegraphServer?.command) throw new Error('The codegraph condition needs codegraphServer.command');
  const { session, model, expectedTools, allowedPrefixes } = await createGraphSession({
    graph: condition.graph, runDir: config.runDir, cwd: config.workdir, channel: condition.channel, extraMcpServers,
    provider: config.provider, model: config.model, effort: config.effort, authFile: config.authFile,
    tools: config.graphTools, maxChars: config.maxChars,
  }, runtime);

  const deadline = Date.now() + config.maxMinutes * 60_000;
  let stopReason = null, lastError = null, toolCalls = 0, responses = 0, activeTools = null;
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, reasoning: 0, cost: 0 };
  const stop = reason => {
    if (stopReason) return;
    stopReason = reason;
    emit({ type: 'limit', reason });
    session.abort().catch(() => {});
  };
  // abort() alone can still let Pi's loop start the next model request (tools/llm-only/pi.mjs found the same): end the
  // turn and refuse further requests once a limit is hit.
  const finishTurn = session.agent.finishTurn;
  session.agent.finishTurn = async (turn, signal) => {
    const decision = await finishTurn?.(turn, signal);
    return stopReason ? { action: 'end' } : decision;
  };
  const stream = session.agent.streamFunction;
  session.agent.streamFunction = (...args) => {
    if (stopReason) throw new Error(stopReason);
    return stream(...args);
  };
  session.subscribe(event => {
    if (event.type === 'tool_execution_start') {
      toolCalls++;
      emit({ type: event.type, toolCallId: event.toolCallId, toolName: event.toolName, args: event.args, at: Date.now() });
      if (toolCalls > config.maxToolCalls) stop('Tool-call limit reached');
    }
    if (event.type === 'tool_execution_end') {
      emit({ type: event.type, toolCallId: event.toolCallId, toolName: event.toolName, isError: event.isError,
        durationMs: event.durationMs, result: trimResult(event.result), at: Date.now() });
    }
    if (event.type === 'message_end') {
      emit({ type: event.type, message: event.message, at: Date.now() });
      if (event.message.role !== 'assistant') return;
      responses++;
      const u = event.message.usage ?? {};
      for (const k of ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens', 'reasoning']) usage[k] += u[k] ?? 0;
      usage.cost += u.cost?.total ?? 0;
      emit({ type: 'usage', usage: { ...usage }, responses });
      if (['error', 'aborted'].includes(event.message.stopReason) && !stopReason) lastError = event.message.errorMessage ?? event.message.stopReason;
      // MCP tools are declared once the first prompt starts: check the tool set on the first response.
      if (!activeTools) {
        try { activeTools = assertTools(session, expectedTools, allowedPrefixes); }
        catch (error) { lastError = error.message; stop('Unexpected tool set'); }
      }
      if (config.maxCostUsd && usage.cost > config.maxCostUsd) stop('Cost limit reached');
    }
  });
  const monitor = setInterval(() => { if (Date.now() >= deadline) stop('Time limit reached'); }, 500);
  const started = Date.now();
  emit({ type: 'session_started', provider: model.provider, model: model.id, effort: session.thinkingLevel,
    channel: condition.channel, expectedTools, at: started });
  writeFileSync(join(config.runDir, 'effective-system-prompt.md'), session.systemPrompt);
  try {
    await session.prompt(config.prompt, { expandPromptTemplates: false });
  } catch (error) {
    if (!stopReason) lastError = error.message;
  } finally {
    clearInterval(monitor);
    await closeGraphSession(session);
  }
  const result = {
    status: stopReason === 'Unexpected tool set' ? 'invalid' : lastError && !stopReason ? 'error' : stopReason ? 'limit' : 'completed',
    stopReason, lastError, usage, responses, toolCalls, activeTools,
    model: { provider: model.provider, id: model.id, effort: config.effort }, durationMs: Date.now() - started,
  };
  emit({ type: 'run_completed', ...result });
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2] === '--worker') {
  const emit = event => process.stdout.write(`${JSON.stringify(event)}\n`);
  const config = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  config.prompt = readFileSync(config.promptFile, 'utf8');
  runAgent(config, emit)
    .then(result => { process.exitCode = result.status === 'error' ? 1 : 0; })
    .catch(error => { emit({ type: 'worker_error', message: error.message }); process.exitCode = 1; });
}
