// File-localization diagnostic: does the component graph help an agent find the code a change needs?
//
//   node tools/agent-runner/fileloc.mjs --config FILELOC.json
//
// FILELOC.json: { out, checkouts: { PULL: dir }, graphs: { PULL: base graph yaml }, tasks: [PULL...],
//                 conditions: ["none", "graph"], repeats, provider, model, effort, maxMinutes, maxToolCalls, maxCostUsd }
// Each agent gets the PR description only (no spec, no intent, no edited graph: those name the files), reads the
// checkout with read and bash, changes nothing, and ends with the files it would change. Scored against the PR's
// source files (benchmark/tasks.json, minus hidden support files). Checkouts must hold only the base commit.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { audit } from './audit.mjs';
import { TEAM_ROOT, executeAgent, isDone, readEvents } from './run.mjs';

const GRAPH_TOOLS = ['get_requested_change', 'graph_overview', 'get_group', 'get_node', 'get_edge', 'find_components', 'neighbors'];
const json = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const INTRO = (workdir, problem) => `You are a software engineer working on the Cal.com monorepo, checked out at ${workdir} (TypeScript, Next.js, tRPC, Prisma).

A developer has asked for the change below (links to screenshots and videos in the original are not available to you):

---
${problem}
---`;

const GRAPH = `## Component graph

You also have a component graph of the codebase as it is in your checkout, through the graph tools (their names start with \`mcp__graph__\`). The graph is a map of the codebase, written to help you find your way around it. Each component lists the source files it owns, and each dependency says how two components connect (calls, renders, reads, writes or emits) and where in the code that happens. Use it to find the code you need before you search for it:

1. Call \`mcp__graph__graph_overview\` to see the groups of components, or \`mcp__graph__find_components\` with words from the request to find the components it is about.
2. For each component that looks relevant, call \`mcp__graph__get_node\` to see its files and what it connects to, and \`mcp__graph__neighbors\` to see what else a change there would touch.
3. When you meet a file or a feature you do not know, \`mcp__graph__find_components\` with a file path tells you which component owns it, and \`mcp__graph__get_edge\` shows where two components connect.

Open the files the graph points to, and search the code for what the graph does not cover. The graph can be incomplete, so check what it says against the code.`;

const WORK = (workdir) => `## Your task

Do not implement the change. Find the source files that a developer would have to change to implement it, the way you would before starting work on an unfamiliar codebase. Include files that would need to be created, with the path you would give them. Leave out test files.

Rules:
- Work only inside ${workdir}, and only read: do not change, create or delete any file. Do not use the web or any network resource. The repository has no useful git history.
- End your final message with the list, one repository-relative path per line, inside a fenced block that starts with \`\`\`files, like this:

\`\`\`files
packages/example/src/thing.ts
apps/web/pages/example.tsx
\`\`\``;

export function buildPrompt(task, condition, workdir) {
  const parts = [INTRO(workdir, task.problem_statement.replace(/\r\n/g, '\n').trim())];
  if (condition !== 'none') parts.push(GRAPH);
  parts.push(WORK(workdir));
  return `${parts.join('\n\n')}\n`;
}

const TEST_FILE = /(^|\/)(__tests__|__mocks__|test|tests|e2e)\/|\.(test|spec|e2e)\.[cm]?[jt]sx?$/;

/** The PR's source files, as harness.py counts them: renames by their new path, hidden support files left out. */
export function goldFiles(task, overrides = {}) {
  const support = new Set(overrides[String(task.pull_number)]?.hidden_support_files ?? []);
  return [...new Set(task.source_files.map(e => {
    const [status, rest] = [e.slice(0, e.indexOf(':')), e.slice(e.indexOf(':') + 1)];
    return status.startsWith('R') ? rest.split('\t').at(-1) : rest;
  }))].filter(p => !support.has(p)).sort();
}

/** The paths in the last ```files block of the agent's final text. */
export function parseFiles(text) {
  const blocks = [...String(text).matchAll(/```files\s*\n([\s\S]*?)```/g)];
  if (!blocks.length) return null;
  return [...new Set(blocks.at(-1)[1].split('\n')
    .map(l => l.trim().replace(/^[-*]\s+/, '').replace(/^`|`$/g, '').replace(/^\.\//, ''))
    .filter(Boolean))].sort();
}

export function score(agentFiles, gold) {
  const files = (agentFiles ?? []).filter(p => !TEST_FILE.test(p));
  const g = new Set(gold);
  const hit = files.filter(p => g.has(p));
  return { agent_files: files, pr_files: gold, hit, missed: gold.filter(p => !files.includes(p)),
    recall: gold.length ? +(hit.length / gold.length).toFixed(3) : null,
    precision: files.length ? +(hit.length / files.length).toFixed(3) : null };
}

const finalText = events => {
  const last = events.filter(e => e.type === 'message_end' && e.message?.role === 'assistant').at(-1);
  return (last?.message?.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
};

async function runOneLoc(config, task, gold, condition, repeat) {
  const runDir = join(resolve(config.out), String(task.pull_number), `${condition}-r${repeat}`);
  if (isDone(runDir)) return JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8'));
  mkdirSync(runDir, { recursive: true });
  const workdir = resolve(config.checkouts[task.pull_number]);
  // Put back anything the agent changed despite the rules, then check the checkout holds only the base commit.
  spawnSync('git', ['-C', workdir, 'checkout', '-q', '--', '.']);
  spawnSync('git', ['-C', workdir, 'clean', '-qfd']);
  const head = spawnSync('git', ['-C', workdir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const commits = spawnSync('git', ['-C', workdir, 'rev-list', '--all', '--count'], { encoding: 'utf8' }).stdout.trim();
  if (head !== task.base_commit || commits !== '1') throw new Error(`${workdir}: expected only ${task.base_commit}, found ${head} (${commits} commits)`);
  const promptFile = join(runDir, 'prompt.md');
  writeFileSync(promptFile, buildPrompt(task, condition, workdir));
  const graph = condition !== 'none' ? resolve(config.graphs[task.pull_number]) : undefined;
  // graph-noreq: the unedited graph without get_requested_change, which on an unedited graph only says nothing is marked
  // (added when its description still said "Start here", which drew every agent to it first).
  const graphTools = condition === 'graph-noreq' ? GRAPH_TOOLS.filter(t => t !== 'get_requested_change') : undefined;
  const worker = {
    workdir, runDir, promptFile, condition: { channel: graph ? 'mcp' : 'none', graph, codegraph: false },
    graphTools, builtinTools: ['read', 'bash'], provider: config.provider, model: config.model, effort: config.effort,
    maxMinutes: config.maxMinutes, maxToolCalls: config.maxToolCalls, maxCostUsd: config.maxCostUsd,
  };
  json(join(runDir, 'worker.json'), worker);
  const started = new Date().toISOString();
  const agent = await executeAgent(config, runDir, workdir);
  const events = readEvents(join(runDir, 'events.jsonl'));
  const report = audit(events, { workdir });
  json(join(runDir, 'audit.json'), report);
  const changed = spawnSync('git', ['-C', workdir, 'status', '--porcelain'], { encoding: 'utf8' }).stdout.trim();
  const files = parseFiles(finalText(events));
  const record = {
    task: task.pull_number, condition, repeat, started, finished: new Date().toISOString(), status: agent.status,
    error: agent.lastError ?? null, model: agent.model, usage: agent.usage ?? null, graph: graph ?? null,
    tool_calls: report.tool_calls, tool_calls_by_name: report.tool_calls_by_name, graph_tool_calls: report.graph_tool_calls,
    search_commands: report.search_commands, audit_flagged: report.flagged, changed_files: changed ? changed.split('\n') : [],
    list_found: files !== null, ...score(files, gold),
  };
  json(join(runDir, 'run.json'), record);
  return record;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const { values } = parseArgs({ options: { config: { type: 'string' } } });
  const config = { maxMinutes: 30, maxToolCalls: 150, maxCostUsd: 2, repeats: 1, conditions: ['none', 'graph'],
    ...JSON.parse(readFileSync(values.config, 'utf8')) };
  const tasks = JSON.parse(readFileSync(join(TEAM_ROOT, 'benchmark/tasks.json'), 'utf8'));
  const overridesFile = join(TEAM_ROOT, 'q2q3-tools/task_overrides.json');
  const overrides = existsSync(overridesFile) ? JSON.parse(readFileSync(overridesFile, 'utf8')) : {};
  const rows = [];
  for (const pull of config.tasks) {
    const task = tasks.find(t => t.pull_number === pull);
    const gold = goldFiles(task, overrides);
    for (let r = 1; r <= config.repeats; r++) for (const c of config.conditions) {
      const rec = await runOneLoc(config, task, gold, c, r);
      rows.push(rec);
      console.log(`${pull} ${c}-r${r} ${rec.status} recall=${rec.recall} precision=${rec.precision} hit=${rec.hit.length}/${rec.pr_files.length} listed=${rec.agent_files.length} graph_calls=${rec.graph_tool_calls} tools=${rec.tool_calls} $${rec.usage?.cost?.toFixed(2)}`);
    }
  }
  json(join(resolve(config.out), 'summary.json'), rows);
}
