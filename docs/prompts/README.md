# Graph-construction prompts

The live prompts (v2, adopted 2026-11-18) are `tools/prompts/shared-core.md` followed by each runner's own `prompt.md`: `tools/llm-only/prompt.md` or `tools/codegraph-llm/prompt.md`. The core states the task, scope, what a good graph looks like and the evidence rules, identically for both conditions; each `prompt.md` says only how that condition builds the graph. The runner sends that text as the system prompt, followed by `Target: <repo>, commit <sha>.` and the shared schema, then sends a one-line opening user message from `pi.mjs`. `run.json` records the hash of each part under `runner_files` (`prompt.md` and `../prompts/shared-core.md`).

| Part | SHA-256 (first 12) |
|---|---|
| `tools/prompts/shared-core.md` | `7950a7da1d2e` |
| `tools/llm-only/prompt.md` | `1862fb99ac61` |
| `tools/codegraph-llm/prompt.md` | `2181116aa259` |

v2 opening messages: `Build the booking component graph for {repo} at {commit}. You have at most {maxTools} tool calls and {maxMinutes} minutes. Start by discovering source files.` (LLM-only) and `Build the booking component graph for {repo} at {commit} from the supplied CodeGraph static graph. You have at most {maxTools} tool calls and {maxMinutes} minutes. Start with graph_overview.` (hot-start). First graphs: `graphs/booking-llm-only-sonnet55-v2-2026-11-18-run01.yaml` and `graphs/booking-hotstart-sonnet55-v2-2026-11-18-run01.yaml`.

- `archive/` holds every prompt version we have used, copied byte for byte. **Never edit these files.** Each file is named after the first 12 hex characters of its SHA-256, which is the same hash `run.json` records under `runner_files["prompt.md"]` for hot-start runs. `archive/index.json` gives the full hash, source commit, opening message and the runs that used each version.
- `proposals/` holds drafts and the reasoning behind them. `proposals/2026-11-17/` (Option A) is what became v2.

When a prompt changes, copy the outgoing version into `archive/` first, add it to the tables below, and start new runs. Never mix graphs made with different prompts in one comparison.

## Archived versions

### LLM-only (`tools/llm-only/prompt.md`)

| File | Words | Source | Used by |
|---|---|---|---|
| `archive/llm-only/fc27940ad591.md` | 555 | `e5a0bae` (2026-10-24), Codex backend | `booking-llm-only-2026-10-24.yaml` (by date; that run bundle does not record the prompt) |
| `archive/llm-only/6845416fb8b3.md` | 554 | `1bed358` (2026-10-24), Pi backend; last version before v2 | Astra runs `booking-llm-only-2026-10-26-run01..03` (confirmed via `prompt_sha256`); Sonnet 5.5 runs `booking-llm-only-sonnet55-2026-11-10` and `-2026-11-11-run01..03` |

Opening message, both versions: `Construct the graph for {repo} at {commit}. Use the source tools and finalize_graph. You have at most {maxTools} tool calls and {maxMinutes} minutes. Start by discovering source files.`

### Hot-start (`tools/codegraph-llm/prompt.md`)

| File | Words | Source | Used by |
|---|---|---|---|
| `archive/hotstart/1d03043c430c.md` | 629 | `462cd12` (2026-10-29), on master | Astra `booking-hotstart-2026-10-29-run01..03` (confirmed via `runner_files`); Sonnet `booking-hotstart-sonnet55-2026-11-10` |
| `archive/hotstart/8e1722a35fc8.md` | 826 | `c66eff7` (2026-11-03), edge retype/consolidate | run `ECIbRL` (graph not published) |
| `archive/hotstart/1f2ae823c534.md` | 927 | uncommitted iteration, recovered from the run bundle | `booking-hotstart-reviewed-sonnet55-2026-11-10` |
| `archive/hotstart/18a3ea9a5033.md` | 1042 | uncommitted iteration | `booking-hotstart-classified-sonnet55-2026-11-10` |
| `archive/hotstart/f545ea52cb25.md` | 1129 | uncommitted iteration | `booking-hotstart-sites-sonnet55-2026-11-11` |
| `archive/hotstart/1636b8215036.md` | 1309 | uncommitted iteration | `booking-hotstart-kinds-sonnet55-2026-11-11` |
| `archive/hotstart/c4fe9062b4c3.md` | 1400 | `5c4c6af` (2026-11-11), PR #9; last version before v2 | `booking-hotstart-final-sonnet55-2026-11-11`, `booking-hotstart-sonnet55-2026-11-11-run01..03` |

Opening messages: `462cd12` ends its first sentence with "do not author edges"; every later version asks the model to review edges with `inspect_edges`/`update_edges`. The exact text for each version is in `archive/index.json`.

Uncommitted versions were recovered from each run's `instructions.md` (the text before `\nTarget: `). Their hashes match the `prompt.md` hash in that run's `run.json`.
