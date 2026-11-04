# Automated LLM-only graph construction

One command starts a fresh **Pi SDK session with `openai/gpt-6-astra`**, explores a clean Cal.com checkout, and saves a validated graph in the team's shared YAML format. The LLM authors components and relationships directly. Host code exposes source, maintains the draft, validates evidence and serializes the result; it does not compute a dependency graph.

## Run

Requirements: Node **22.19+**, Git, and credentials for the selected Pi provider. This Node requirement is for the standalone runner; Cal.com's application runtime is separate. Graph construction does not require Cal.com dependencies, a database or Docker.

Node **22.22.3 LTS** is verified for both the runner and Pi's interactive login. Avoid Node 23.7.0 for the login CLI: it lacks `zlib.createZstdDecompress`, which can crash Pi during startup. If multiple Node versions are installed, select the compatible version before running either command.

```sh
npm ci --prefix tools/llm-only --ignore-scripts
bash scripts/run_llm_only_graph.sh --check
bash scripts/run_llm_only_graph.sh
```

The default is exactly `openai/gpt-6-astra`, with `medium` reasoning. `--check` resolves the model and local authentication without generating a graph or checking out source. Missing credentials, an unknown model or an unsupported effort cause an error; there is no model fallback.

For a ChatGPT subscription, open Pi, enter `/login openai`, and choose **Sign in with ChatGPT** using the account with your subscription:

```sh
node tools/llm-only/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js \
  --no-extensions --no-skills --no-prompt-templates --no-themes \
  --no-context-files --no-session
```

This uses the ChatGPT plan's allowance and model access. API-key authentication uses separate OpenAI Platform billing; a ChatGPT subscription does not fund an API key. To use API billing instead, choose Pi's API-key login or make `OPENAI_API_KEY` available through your usual local credential setup. See [OpenAI authentication](https://learn.chatgpt.com/docs/auth) and [Pi providers](https://pi.dev/docs/latest/providers).

Quit Pi after signing in, then use the graph command above. The runner reads only Pi's credential file (`~/.pi/agent/auth.json` when present); it does not import Pi sessions, settings, models configuration or extensions. `--auth-file /absolute/path/to/auth.json` selects another Pi credential file. OAuth refresh may update that file. Never paste keys into chat or commit them. The runner does not reuse the Codex app's login.

To reuse upstream Git objects already on disk:

```sh
bash scripts/run_llm_only_graph.sh \
  --provider openai --model gpt-6-astra --effort medium \
  --source /absolute/path/to/calcom-checkout \
  --max-tools 600 --max-minutes 45
```

The runner reads the pin from `targets/calcom.env`. It creates a **new standalone checkout outside the team repository**, fetching only that commit from upstream or a local object cache. It does not copy the cache's working files, untracked graphs, Git config, hooks or branches.

Output defaults to a new timestamped directory under `../llm-only-runs/`, beside this team checkout. `--output-root` changes that location, but it must be outside all existing Git checkouts. Each invocation starts an empty graph and independent session; there is no resume.

Prepare source and inputs without calling a model:

```sh
bash scripts/run_llm_only_graph.sh --prepare-only --source /absolute/path/to/calcom-checkout
```

`prepared` is not a generated graph. Start a normal run to generate a prediction in another fresh directory.

## Construction and validation

The model receives the generic [prompt](prompt.md), blank shared schema, target metadata, the clean working-directory path added by Pi, and source returned through six tools:

- `list_source`, `search_source`, `read_source`: file listing, literal search and bounded reads. Only tracked regular files at the pin are accessible. Traversal, symlinks, Git internals and untracked files are rejected.
- `update_graph`: submit YAML entries in batches. Whole entries replace by ID; removal is explicit. There is no seed graph or static dependency extraction.
- `inspect_graph`: inspect only this run's draft.
- `finalize_graph`: validate, return repair errors, or freeze output. After success the draft cannot change and the model loop stops immediately.

Every component needs member files, descriptions and source ranges. Every relationship needs an explanation and source ranges. Evidence must cite lines actually returned by `read_source` in this run. Search hits do not count as reads. The harness inserts exact excerpts, file SHA-256 hashes, `inferred`/`existing` defaults and standard edge evidence without inferring graph topology.

Validation checks the shared JSON Schema, unique IDs, references, group cycles, duplicate relationships, source pin and cleanliness, member-file evidence, line ranges and exact excerpts. A separate host pass replays the read transcript and revalidates frozen output. These checks establish structural and provenance validity; semantic accuracy and completeness still require separate evaluation against the withheld reference.

The scope covers public booking, availability, submission, persistence, rescheduling, cancellation and principal host management. Each graph records actual coverage and exclusions in `x-scope`.

## Run artifacts

- `graph.yaml`, `validation.json`: frozen prediction, checksum and counts; created only after successful validation.
- `run.json`: status, source pin, provider/model/effort, Pi version, elapsed time, usage, limits, hashes and inspection counts. Pi usage separates uncached input, output, cache reads and cache writes; reasoning is a subset of output. Counts accumulate across responses. `estimated_cost_usd` comes from Pi's catalog pricing; actual billed `cost_usd` remains `null`. With ChatGPT subscription authentication, this catalog estimate is not an API charge or a measure of remaining plan allowance.
- `instructions.md`, `effective-system-prompt.md`, `schema.json`, `source-manifest.json`: construction inputs, including the effective prompt checked before generation.
- `tools.jsonl`: tool calls, returned source, repair errors and timings. `events.jsonl` also records finalized Pi messages and attempted calls rejected before our tools execute.
- `pi-session.json`: resolved model metadata, exact tools and session configuration. `pi.stderr.log` and `invocation.json` hold subprocess diagnostics and arguments. Credentials are not arguments and are not copied into artifacts.
- `draft.partial.yaml`: latest draft after failure; never automatically treated as a prediction or resumed.
- `calcom/`: independent pinned checkout.

```sh
bash scripts/run_llm_only_graph.sh --verify /absolute/path/to/run
```

Failures and unfinished graphs exit nonzero with diagnostics preserved. Tool attempts, including failed calls, count toward the limit. A separate host enforces the deadline and terminates an unresponsive worker. Successful finalization stops the loop inside the tool, before another model request. Retries, compaction and cache warming are disabled. Usage covers completed response events; an interrupted response can have unreported usage. There is no token or dollar spending cap.

## Isolation

This uses **restricted tools and a fresh context**, not an OS filesystem jail or VM/container. The trusted Node host retains normal credential and filesystem access. The model gets only six custom tools, with tracked-file restrictions enforced by host code.

Pi uses explicit in-memory sessions and settings, an empty resource loader, and a pinned static model catalog. Shell, arbitrary file read/write, web, extensions, skills, MCP discovery and subagents are absent from the model's tools. The runner checks the exact tool set, system prompt and reasoning effort before generation. Model catalogs are not refreshed over the network. The source tools also have a stdio MCP adapter for separate consumers; Pi calls their functions directly.

Historical graphs, hot-started graphs, team PRs (including PR #3) and previous run logs are never construction inputs. Do not inject them into a construction session or regenerate after reference evaluation in the same context. Existing frozen artifacts remain unchanged.

## Tests and verification history

```sh
npm test --prefix tools/llm-only
```

Tests use tiny Git fixtures and a simulated model transport. They exercise the actual Pi SDK session and tool loop without API tokens or network access: resource isolation, exact model selection, evidence rejection and repair, tool restrictions, usage accounting, immediate stopping after finalization, time/call limits, source boundaries, schema and graph consistency, repeated independent runs and frozen-output verification. A simulated run does not measure Astra's graph quality.

The previous **Codex backend** completed a live Cal.com run on 2026-10-24 at `54343aa685ae8f33159d2f485ec4a57bad5c574a`, using `gpt-6.1-sol` with medium reasoning. It produced **42 nodes, 63 edges, 5 groups and 61 source files** in 278.289 seconds. Run ID: `2026-10-24T22-17-54.827Z-75ESDY`; frozen YAML SHA-256: `c8a5babd4a85b3af5f854b1854e72b8e7a6d638842d1ba5c5bd23c3fec0e8ccc`. The backend-independent verifier still supports that run. It is not a Pi/Astra result, and has not been scored against the withheld reference.

Pi migration verification on 2026-10-24: **32 runner tests and 30 historical graph tests passed**. The historical prediction in `experiments/llm-only/` is unchanged.

A fresh **Pi/Astra live run passed** on 2026-10-24 using Pi 1.4.0, `openai/gpt-6-astra`, medium reasoning, ChatGPT subscription OAuth and Node 22.22.3. At the same Cal.com pin it produced **33 nodes, 40 edges, 4 groups and 49 member source files** in 273.975 seconds. It made 134 tool calls, including two rejected source reads, and read 52 distinct files. Run ID: `2026-10-24T22-50-30.920Z-wLO9C6`; runner revision: `1bed35815012304ae5d35140a1deed08c6389902`; frozen YAML SHA-256: `c61e54a3b948bc54133d8a90ccbeabcc26f2fb0c3f23e4ba1ba4d4d305bff2fc`. Finalization and the separate `--verify` pass succeeded, and the source checkout remained clean. This validates execution, structure and provenance; graph quality has not been scored against the withheld reference.

References: [Pi SDK](https://pi.dev/docs/latest/sdk), [Pi models and authentication](https://pi.dev/docs/latest/models), [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra).
