# Automated LLM-only graph construction

One command starts a fresh Codex session, lets it explore a clean Cal.com checkout, and saves a validated graph in the team's shared YAML format. The LLM authors components and relationships directly. The tools only expose source, maintain the draft, validate evidence, and serialize the result. Pi is not used.

## Run

Requirements: Node 20+, Git, a recent authenticated Codex CLI, and network access for the model (and GitHub unless a local source cache is supplied). No Cal.com dependencies, database, Docker or API test setup is needed for graph construction.

```sh
npm ci --prefix tools/llm-only --ignore-scripts
codex login
bash scripts/run_llm_only_graph.sh --model YOUR_MODEL
```

Choose a model your Codex account supports. The model argument is required so experiments record an explicit selection. Reasoning effort defaults to `medium`; set `--effort low|medium|high|xhigh|max` as supported by your model. `--codex /absolute/path/to/codex` selects a binary if it is not on PATH. The desktop app's macOS binary is typically `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`.

To reuse upstream Git objects already on disk:

```sh
bash scripts/run_llm_only_graph.sh \
  --model YOUR_MODEL \
  --source /absolute/path/to/calcom-checkout \
  --max-tools 600 --max-minutes 45
```

The runner reads the shared pin from `targets/calcom.env`. It initializes a **new standalone checkout outside the team repository**, then fetches only that commit from upstream or the local object cache. It does not copy the cache's working files, untracked graphs, Git config, hooks or branches. Changing the pin remains a team decision.

By default, output is in a new timestamped directory under `../llm-only-runs/`, a sibling of this team checkout. `--output-root` can change that location, but it must be outside all existing Git checkouts. Every command starts a new experiment: there is no resume or reuse of a draft/context.

Prepare and inspect inputs without calling a model:

```sh
bash scripts/run_llm_only_graph.sh --prepare-only --source /absolute/path/to/calcom-checkout
```

`prepared` means the checkout and inputs are ready; it is not a generated graph. Start a normal run to generate a prediction in another fresh directory.

## Construction and validation

The construction context receives only the experiment [prompt](prompt.md), blank shared schema, target metadata, and source returned through six tools:

- `list_source`, `search_source`, `read_source`: plain file listing, literal search and bounded source reads. Only tracked regular files at the pin are accessible; path traversal, symlinks, Git internals and untracked files are rejected.
- `update_graph`: submit YAML entries in batches. Entries replace by explicit ID; removal is explicit. There is no seed graph or deterministic component/dependency extraction.
- `inspect_graph`: inspect only this run's draft.
- `finalize_graph`: validate the draft, return repair errors to the agent, or freeze the output. After success the draft cannot change.

Every component needs member files, descriptions and exact source ranges. Every relationship needs an explanation and exact source ranges. Citations must cover lines actually returned by `read_source` in this run. Search hits do not count as reads. The harness inserts exact excerpts, file SHA-256 hashes, `inferred`/`existing` defaults and standard edge evidence without inferring any graph topology.

Validation checks the shared JSON Schema, unique IDs, references, group cycles, duplicate relationships, source pin and cleanliness, member-file evidence, valid line ranges and exact excerpts. Final output is revalidated by a separate host pass that replays the source-read transcript. These checks establish structural and provenance validity; semantic accuracy and completeness still require evaluation against the withheld reference in a separate context.

The scope prompt covers public booking, availability, submission, persistence, rescheduling, cancellation and principal host management. Each generated graph records its actual coverage and exclusions in `x-scope`.

## Run artifacts

Each directory contains:

- `graph.yaml` and `validation.json`: the frozen prediction and checksum/counts, created only after successful validation.
- `run.json`: status, source pin, requested model/effort, CLI version, elapsed time, available usage, limits, input/tool hashes and isolation configuration. Dollar cost is `null` because Codex CLI does not report it.
- `instructions.md`, `schema.json`, `source-manifest.json`: exact construction inputs.
- `tools.jsonl`: all source/graph calls, returned source text, validation errors and timings.
- `events.jsonl`, `codex.stderr.log`, `invocation.json`: CLI events, diagnostics and exact argument list. Credentials are not passed as arguments or copied into run artifacts.
- `draft.partial.yaml`: the latest draft for inspection after failure. It is never automatically treated as a prediction or resumed.
- `calcom/`: the independent pinned source checkout.

Verify a completed run later:

```sh
bash scripts/run_llm_only_graph.sh --verify /absolute/path/to/run
```

The runner exits nonzero on failure or an unfinished graph, preserving diagnostics and any partial draft. Time and tool-call limits are enforced. Failed calls count toward the tool limit. After a successful freeze, the CLI gets 15 seconds to finish before the host stops it. Token usage is recorded when Codex emits its completed-turn event; interrupted runs may have no usage report. There is no token or dollar spending cap.

## Isolation and compatibility

This uses **restricted tools and a fresh context**, not a VM/container or an OS filesystem jail around Codex. The host CLI retains its normal authentication access. Source access available to the model is confined to the MCP server's tracked-file allowlist.

The invocation ignores user config and execution rules, disables automatic project instructions and host skill discovery, disables shell, web, apps, plugins, memories and subagents, and uses Codex's read-only sandbox with approval policy `never`. The source MCP server is required and its six tools are explicitly enabled. Codex's bounded JavaScript tool dispatcher remains enabled because current builds use it to call MCP tools; it does not grant arbitrary Node/filesystem access.

The runner checks required CLI flags and isolation features and uses strict config parsing; it fails rather than silently dropping unsupported settings. First verified against `codex-cli 0.162.0-alpha.17.2`. Host skill-discovery suppression is currently an under-development Codex feature; reverify the integration when updating Codex. Managed host policies may prevent a run and are not bypassed.

The historical `experiments/llm-only/graph.yaml`, reference graphs, hot-started graphs, team PRs and previous run logs are never inputs to this runner. Existing frozen artifacts are unchanged. Do not inject them into a construction session or reuse an evaluated session to regenerate a prediction.

## Tests

```sh
npm test --prefix tools/llm-only
```

Tests use tiny Git fixtures and mock model execution; they do not spend model tokens or require a network. They cover checkout isolation, path/symlink restrictions, source reads and search, invalid evidence and repairs, shared schema, graph consistency, frozen-output verification, the stdio protocol, budgets, process handling and repeated independent runs. A successful mock run is not evidence of model quality on Cal.com.

Verified on 2026-10-24 with Node 23.7.0 and Codex CLI 0.162.0-alpha.17.2:

- All **28 runner tests** and **30 historical graph tests** passed.
- A live run at `54343aa685ae8f33159d2f485ec4a57bad5c574a`, using `gpt-6.1-sol` with medium reasoning, completed in **278.289 seconds**. It produced **42 nodes, 63 edges and 5 groups**, with evidence from **61 source files**. The committed verifier subsequently revalidated its schema, source transcript, exact excerpts, file hashes and frozen checksum.
- The run made 215 tool calls, including 104 successful source reads across 64 files and 4 rejected calls. Codex reported 2,878,572 input tokens (2,720,512 cached) and 14,604 output tokens. These are cumulative across requests, not unique context size; dollar cost was unavailable.
- Run ID: `2026-10-24T22-17-54.827Z-75ESDY`. Frozen YAML SHA-256: `c8a5babd4a85b3af5f854b1854e72b8e7a6d638842d1ba5c5bd23c3fec0e8ccc`. The run and its checkout remain outside the team repository. Source/graph construction code matches this implementation; the final verifier additionally checks reported counts and preserves failure metadata for truncated logs.

This independent prediction has not been scored against the withheld reference. The earlier frozen graph remains the historical artifact in `experiments/llm-only/`.

Codex integration references: [non-interactive execution](https://learn.chatgpt.com/docs/non-interactive-mode), [configuration controls](https://learn.chatgpt.com/docs/config-file/config-reference), [MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
