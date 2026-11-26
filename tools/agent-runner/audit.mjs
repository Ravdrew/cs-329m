// What the agent did, from its tool calls: search commands (a Q2/Q3 cost metric) and anything that breaks the
// prompt's rules, and what the sandbox (graph-mcp/sandbox.mjs) refused. With the sandbox on, the flags are a second look
// (they match text, so they over-report); with it off (Linux, or sandbox: false) they are the only check.
// Flags are for review: a flagged run is not discarded automatically.

const SEARCH = /(^|[\s;&|(`$])(grep|egrep|rg|ag|ack|find|fd|tree|git\s+grep|ls\s+(-\w*R|--recursive))\b/;
const NETWORK = /(^|[\s;&|(`$])(curl|wget|ssh|scp|nc|git\s+(clone|fetch|pull|ls-remote)|npm\s+(view|info|install|i|pack)|npx|yarn\s+(add|dlx|npm\s+info)|pnpm\s+(add|dlx)|pip3?\s+install)\b/;
const HISTORY = /(^|[\s;&|(`$])git\s+(log|show|reflog|blame|rev-list|cat-file|whatchanged)\b/;
// What a refusal looks like: sandbox-exec makes the command's file or socket call fail with EPERM; the file tools
// throw SANDBOX_REFUSAL (graph-mcp/sandbox.mjs).
const REFUSAL = /Operation not permitted|Sandbox: outside the checkout/;
const ABSOLUTE = /(?:^|[\s'"=:(<>])(\/[\w.@%+~-][^\s'";|&)<>`]*)/g;

export const isSearch = command => SEARCH.test(command);

/**
 * events: the worker's event stream; workdir: the checkout the agent works in; allowed: other absolute paths the rules
 * permit (the env script, /tmp, /dev/null, system binaries).
 */
export function audit(events, { workdir, envScript } = {}) {
  const calls = events.filter(e => e.type === 'tool_execution_start');
  const allowed = [workdir, envScript, '/tmp', '/dev/null', '/dev/stdout', '/dev/stderr', '/usr/bin', '/usr/local/bin', '/bin', '/opt/homebrew/bin']
    .filter(Boolean).map(p => p.replace(/\/+$/, ''));
  const inside = p => allowed.some(a => p === a || p.startsWith(`${a}/`));
  const flags = { outside_paths: [], network: [], history: [], parent_escape: [] };
  // Refused by the sandbox: counted (each is a rule the agent tried to break, or a tool the sandbox breaks), not flagged.
  const refusals = events.filter(e => e.type === 'tool_execution_end')
    .map(e => ({ tool: e.toolName, text: (e.result?.content ?? []).map(c => c.text ?? '').join('\n') }))
    .filter(r => REFUSAL.test(r.text))
    .map(r => ({ tool: r.tool, line: r.text.split('\n').find(l => REFUSAL.test(l)).slice(0, 300) }));
  const bash = [];
  const byTool = {};
  for (const c of calls) {
    byTool[c.toolName] = (byTool[c.toolName] ?? 0) + 1;
    if (c.toolName === 'bash') {
      const command = String(c.args?.command ?? '');
      bash.push(command);
      for (const [, path] of command.matchAll(ABSOLUTE)) if (!inside(path)) flags.outside_paths.push({ command, path });
      if (NETWORK.test(command)) flags.network.push(command);
      if (HISTORY.test(command)) flags.history.push(command);
      if (/(^|[\s/])\.\.\/\.\.(\/|\s|$)/.test(command)) flags.parent_escape.push(command);
    } else if (typeof c.args?.path === 'string' && c.args.path.startsWith('/') && !inside(c.args.path)) {
      flags.outside_paths.push({ tool: c.toolName, path: c.args.path });
    }
  }
  const graphCalls = Object.entries(byTool).filter(([n]) => n.startsWith('mcp__')).reduce((s, [, n]) => s + n, 0);
  return {
    tool_calls: calls.length,
    tool_calls_by_name: byTool,
    graph_tool_calls: graphCalls,
    bash_commands: bash.length,
    search_commands: bash.filter(isSearch).length,
    flagged: Object.values(flags).some(f => f.length > 0),
    flags,
    sandbox_refusals: refusals.length,
    refusals,
  };
}
