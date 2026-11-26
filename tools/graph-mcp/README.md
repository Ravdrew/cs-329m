# Graph MCP server

The **tool channel** for Q2/Q3: a coding agent asks for the parts of a component graph it needs instead of
receiving the whole graph in its prompt (the text channel, `q2q3-tools/graph_to_text.py`). It is a local stdio
MCP server with seven read-only tools, and the same tools are plain functions (`tools.mjs`) that a harness can
register directly.

## Run

Requirements: Node **22.19+**.

```sh
npm ci --prefix tools/graph-mcp
node tools/graph-mcp/server.mjs --graph graphs/booking-handmade-edit.yaml --run-dir /tmp/graph-run
```

| Flag | Default | Meaning |
|---|---|---|
| `--graph` | required | Graph file in the shared format (YAML or JSON). Validated against `schema/graph.schema.json` at start. |
| `--run-dir` | none | Writes `tools.jsonl` there: one `server_started` line (graph path, SHA-256, tools, settings, number of changed items), then every call with its arguments, result, size and time. |
| `--tools` | all seven | Comma-separated subset, for ablations. |
| `--max-chars` | 12000 | Longer results are cut at a line break with a note telling the agent to page or narrow. |
| `--max-files` | 40 | Same as the text channel: beyond this, a node's files are summarised by directory. |
| `--evidence-per-edge` | 2 | Same as the text channel: code locations shown per dependency in `get_node`. |
| `--max-calls` | unlimited | Refuse graph calls after this many. |

Connect an agent with its MCP config, e.g. Claude Code:
`claude mcp add graph -- node tools/graph-mcp/server.mjs --graph <graph.yaml> --run-dir <dir>`.
For Pi (1.x), add the same command to `mcp.json`, and use **direct** exposure so each tool is an ordinary tool
call rather than going through codemode. Inspect it by hand with
`npx @modelcontextprotocol/inspector node tools/graph-mcp/server.mjs --graph <graph.yaml>`.

## Pi

`pi.mjs` connects the tools to a Pi 1.4.0 SDK session (the version `tools/llm-only` pins), on either channel:

| `channel` | How the tools reach Pi |
|---|---|
| `mcp` (default) | Pi's built-in MCP extension starts `server.mjs` over stdio with **direct** exposure, so each tool is declared to the model like a built-in one. Pi's default exposure, codemode, would hide the tools behind a script tool; direct exposure leaves codemode and `tool_search` off. |
| `native` | The same functions registered as Pi custom tools, in process. |

Both use Pi's MCP naming (`mcp__graph__get_node`, …), and the tests check that the model sees identical names,
descriptions, schemas and results on both, so the channel is the only difference.

```js
import { assertTools, closeGraphSession, createGraphSession } from './tools/graph-mcp/pi.mjs';
const { session, expectedTools } = await createGraphSession({
  graph: 'graphs/booking-handmade-edit.yaml', runDir: 'run', cwd: '/work/calcom', channel: 'mcp',
  provider: 'openai', model: 'gpt-6-astra', effort: 'medium', systemPrompt: '...',
});
await session.prompt('...');
assertTools(session, expectedTools);   // read, bash, edit, write + the graph tools, nothing else
await closeGraphSession(session);      // dispose() alone leaves the MCP server running
```

The session is isolated like the graph builders' (`tools/llm-only/pi.mjs`): a private agent directory in the run
directory, in-memory settings with compaction and retries off, and no extensions, skills, prompt templates, themes
or context files (`AGENTS.md`) from disk. The MCP extension is given the graph server directly, so neither the
user's nor the project's `mcp.json` is read. A test plants all of these in a checkout and checks that none reaches
the model. MCP tools are declared when the first prompt starts, so check tools after `prompt()`.
`builtinTools: []` gives a graph-only session; `tools: [...]` restricts the graph tools.

For a quick pilot with real credentials (Pi's `/login openai`, or `OPENAI_API_KEY`):

```sh
node tools/graph-mcp/pi.mjs --graph graphs/booking-handmade-edit.yaml --cwd /work/calcom --run-dir /tmp/pilot \
  --channel mcp --prompt "Implement the change marked on the component graph."
```

It streams the answer, logs tool calls to stderr, and writes `events.jsonl`, `effective-system-prompt.md`,
`tools.jsonl` and `mcp.log` to the run directory. It has no time or call limits; the Q2/Q3 runner should add them as
`tools/llm-only/pi.mjs` does.

## Tools

| Tool | Returns |
|---|---|
| `get_requested_change` | The nodes and edges the developer marked `new`, `modify` or `delete`, with notes. **Identical to the text channel's "Requested change" section.** "None." for an unedited graph. |
| `graph_overview` | The text channel's header (title, repo, commit, counts, description), whether anything is marked as changed, and the group tree with component counts. A graph without groups lists every component instead (paged). |
| `get_group` | A group's summary, parent, subgroups, members (nested by default) and its dependencies with other groups, rolled up by group and kind. `(ungrouped)` is the components outside any group. |
| `get_node` | A component's kind, group, summary, description, routes, developer note, files (summarised as in the text channel; `files_offset` lists all), what it depends on (the text channel's lines) and what depends on it. |
| `get_edge` | The dependencies between two components (or one by `id`), with every code location as `file:line`, paged. |
| `find_components` | Components matching all words of a query in name, routes, description or file paths; or the owners of a file or directory. |
| `neighbors` | Components up to two steps away, by direction and dependency kind, and the dependencies between them. |

## Same facts as the text channel

Q2 compares delivery, so the tools show nothing the text channel hides:

- the same exclusions: no `x-*` fields, no `provenance`, no evidence notes or symbols, fenced code replaced by
  `[code omitted]`, auto-generated edge labels such as `uses (4)` dropped;
- the same wording: `render.mjs` is a port of `graph_to_text.py`. The tests check that `get_requested_change` and
  the graph header are byte-identical to the text channel's output (`test/fixtures/`), and that no line of any
  `x-*` field appears in any tool's output on a hot-started graph.

What the tools add is **derived from the same graph**: incoming dependencies listed by name (the text channel
gives a count), dependencies rolled up between groups, search, and **every** code location of a dependency in
`get_edge` (the text channel shows two per dependency, then "and N more"). These are locations, not code.

Experiment conditions come from the graph you pass: the edited graph for "graph edit", the unedited graph for
"our graph with no edit" (`get_requested_change` then says "None.").

## Tests

```sh
npm test --prefix tools/graph-mcp
```

They load every graph in `graphs/`, check text-channel parity, check that no `x-*` content leaks, exercise each
tool on the hand-built, LLM-only and hot-started graphs (including one with no groups), and talk MCP to the server
over stdio. If the text channel's wording changes, regenerate `test/fixtures/handmade-edit.text-channel.md` with
`python3 q2q3-tools/graph_to_text.py graphs/booking-handmade-edit.yaml`.
