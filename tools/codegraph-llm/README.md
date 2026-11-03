# CodeGraph → Astra components → static component edges

This runner starts Astra with the **raw booking-scoped CodeGraph graph**, and asks
it to choose component boundaries, memberships, names, summaries and descriptions.
The host aggregates the underlying static edges after those assignments. Astra
cannot author component edges. The output uses `schema/graph.schema.json` and
opens in the existing viewer.

The Pi SDK integration is adapted from `origin/codegraph-llm-only` at
`f3f3854eb30c2b2eee3d0de3506f6b9b2892019d`. It uses the same pinned Pi 1.4.0 SDK,
`ModelRuntime` → `createAgentSession` → `session.prompt` agent loop, OpenAI
Responses transport (`openai/gpt-6-astra`, medium reasoning by default), credential
resolution, session isolation, tool/time limits and usage logging. Model requests
go through Pi's API transport; Codex does not supply the component assignments.
There is no silent model fallback.

## Run

Use Node **22.19+** for this runner (Cal.com's app tests separately use Node 20).
From the repository root:

```bash
npm ci --prefix tools/codegraph-llm

# Only if the raw baseline is missing or needs rebuilding:
npm ci --prefix tools/codegraph
bash scripts/build_booking_graph.sh

bash scripts/run_codegraph_llm_graph.sh --check
bash scripts/run_codegraph_llm_graph.sh --source work/calcom
```

Pi needs `OPENAI_API_KEY` in the process environment, or a Pi OpenAI login saved
in `~/.pi/agent/auth.json`. To sign in interactively, launch
`tools/codegraph-llm/node_modules/.bin/pi` and use `/login`. A separate credential
file can be selected with `--auth-file /absolute/path/to/auth.json`. Do not put
credentials in arguments or tracked files. `--check` checks model selection and
credential resolution without making a generation request; actual API access
is only established by a successful live run.

The default input is `work/calcom-booking-structural.json`, built against
`targets/calcom.env`: **54343aa685ae8f33159d2f485ec4a57bad5c574a**, currently
**11,525 nodes / 20,363 edges / 740 files**. Override with `--static-graph PATH`;
the repository and commit must match the target. This file is gitignored, so a
fresh checkout needs the baseline build first. The scope comes from the existing
booking baseline, including its supporting packages; the runner strips its old
`file_components` assignments and does not give Astra the path-rule configuration,
old labels, component graphs or reference graphs. The build command also rebuilds
the historical deterministic projection, but that projection is not model input.

Each run creates a separate clean, detached source checkout and fresh empty
component draft. `--source work/calcom` fetches only pinned Git objects from that
local cache, excluding its untracked index/output files. Runs default to the
sibling `../codegraph-llm-runs` directory. `--output-root PATH` must be outside
every Git checkout. No Cal.com dependencies are installed.

Defaults: 600 tool attempts, 45 minutes, no automatic retry or compaction.
Override with `--max-tools`, `--max-minutes`, `--effort`, `--provider`, `--model`.
For input preparation without model access:

```bash
bash scripts/run_codegraph_llm_graph.sh --prepare-only --source work/calcom \
  --output-root /tmp/codegraph-llm-runs
```

## Model and host responsibilities

[prompt.md](prompt.md) is the exact instruction template; each run adds the target
pin and shared schema and saves the effective prompt. Astra uses paginated tools
to inspect files, symbols, incoming/outgoing static dependencies and source code.
It submits YAML component definitions with file IDs, literal file prefixes and/or
explicit structural node IDs. Prefixes are selectors **chosen by Astra during the
run**, not preconfigured grouping rules. Explicit node assignments can split a
shared file across components. Every structural node must have exactly one owner.
Each component must cite source ranges actually read during that run to support
its name and description. The suggested granularity is 20–45 components, not a
fixed component count.

The host then:

1. Drops containment relationships and dependencies internal to a component.
2. Groups the remaining edges by `(from component, to component, mapped kind)`.
3. Preserves `calls`/`navigates`; maps imports, references, instantiation,
   inheritance, implementation and decoration to `uses`.
4. Records raw edge counts, distinct file-pair counts, raw kinds, confidence
   counts and up to three source evidence sites per component edge.

There is **no confidence threshold or lean edge pruning**. Low-confidence and
unknown-confidence dependencies remain visible and counted. No database
read/write, render or workflow edges are invented. Raw edge IDs are retained in
an audit sidecar. The validator rejects model-authored edges, unknown members,
overlapping assignments, unassigned nodes, empty components, invalid references,
unread evidence and schema violations. Successful finalization freezes output
and stops further model requests.

The model has no shell, web, arbitrary local file access, inherited project
instructions, extensions, skills or previous session. This is tool-level
isolation, not an OS container. The static snapshot normalizes CodeGraph file
container ranges that include the empty EOF segment after a terminal newline,
retaining their original value as `raw_end_line`. It does not change node IDs or
edge endpoints. Source hashes bind the snapshot to the fresh checkout.

## Outputs, verification and viewer

The CLI prints `run_directory`. A **completed** run contains:

| File | Contents |
| --- | --- |
| `graph.yaml`, `graph.json` | Shared-format component graph, no saved layout |
| `components.yaml` | Astra's component definitions and membership selectors |
| `membership.json` | Every static node ID → its component ID |
| `aggregation.json` | Component edge ID → raw edge IDs, mapping policy and conservation counts |
| `static-input.json` | Sanitized structural input, scope, source hashes and original export fingerprint |
| `validation.json` | Counts and graph/input/membership/aggregation hashes |
| `run.json` | Status, pin, model, limits, input counts, inspection counts, usage and runner hashes |
| `tools.jsonl`, `events.jsonl` | Tool audit trail and Pi events/usage |
| `instructions.md`, `effective-system-prompt.md`, `pi-session.json` | Exact prompt and session configuration |

Failed runs preserve diagnostics and partial drafts and are marked `failed`;
they must not be presented as completed predictions. Token usage comes from Pi's
responses. `estimated_cost_usd` uses model-catalog rates; `cost_usd` remains null
because this is not a billing report.

```bash
# Replace the path with the printed run_directory; keep its checkout and logs.
bash scripts/run_codegraph_llm_graph.sh --verify /absolute/path/to/run
node viewer/scripts/validate.mjs /absolute/path/to/run/graph.yaml

npm ci --prefix viewer
npm run dev --prefix viewer
```

Open Vite's printed URL and choose **Open…**, then the run's `graph.yaml` or
`graph.json`. Click a component for files, summary and connections; click an edge
for source evidence. The large structural snapshot and sidecars are audit data,
not viewer inputs. Full verification replays the successful read/update/finalize
tool transcript against pinned source and compares the graph and sidecars; it
does not need model access. Schema validity and full static coverage do not prove
that Astra's component boundaries or summaries are semantically correct.

## Tests

```bash
npm test --prefix tools/codegraph-llm
```

Tests exercise the real Pi session with a fake model transport, including repaired
tool errors, session isolation, finalization stopping requests, and usage capture.
They also check complete membership, symbol splits, edge conservation, confidence
retention, source evidence, input/output tampering and failed-run reporting. They
make no live model requests and are not generated Cal.com predictions.
