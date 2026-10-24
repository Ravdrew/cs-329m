# LLM-only booking graph

A source-grounded LLM prediction of the Cal.com booking subsystem, authored in a separate clean upstream checkout. The graph has **36 nodes and 62 directed relationships**, backed by exact excerpts and hashes from **72 source files**.

The source is pinned to **`54343aa685ae8f33159d2f485ec4a57bad5c574a`**, the team's revision from [PR #1's target configuration](https://github.com/Ravdrew/cs-329m/blob/44e26e017fbcfe6c57b0f966572fb0ee0499e096/targets/calcom.env). The requested `calcom/cal.com` URL redirects to `calcom/cal.diy`. No application source was changed.

## Deliverables

- [graph.json](graph.json): canonical, editable graph prediction, source evidence and file hashes.
- [graph-review.md](graph-review.md): full Mermaid diagram and component/edge explanations with pinned source links.
- [graph.mmd](graph.mmd): standalone Mermaid graph, rendered mechanically from the same JSON.
- [graph.schema.json](graph.schema.json): provisional JSON Schema, shared in shape across possible LLM-only/hot-started/reference variants. No safe team schema was available on the default branch; compatibility with PR #3 has not been inspected.
- [prompt.md](prompt.md): a reusable prompt for a fresh agent run. It was written after this interactive run.
- [run.json](run.json), [exploration.jsonl](exploration.jsonl) and [preliminary-exploration.jsonl](preliminary-exploration.jsonl): exposure history and recorded source exploration.
- [validation-report.json](validation-report.json): structural and exact-source checks.

## Validate or render

Only Python 3.8+ and Git are needed for validation/rendering. `rg` is also needed for the optional exploration logger. No Cal.com dependencies, database or API keys are required.

From this team repository's root, point `CALCOM_DIR` at a clean Cal.com checkout at the pin:

```sh
export CALCOM_DIR=/absolute/path/to/pinned/calcom
python3 experiments/llm-only/validate_graph.py
python3 -m unittest discover -s experiments/llm-only -p 'test_*.py' -v
python3 experiments/llm-only/render_graph.py
```

Without `CALCOM_DIR`, validation, rendering and tests use `work/calcom`, matching the shared setup scripts. Both CLI tools also accept `--repo /absolute/path/to/pinned/calcom`. Graph construction takes place in a separate clean upstream checkout; this branch packages the already frozen result for review.

The validator rejects a different checkout commit, modified tracked source, malformed graph structure, duplicate/dangling relationships, incompatible relationship target types, paths outside the checkout, untracked evidence, missing file provenance, stale file hashes and incorrect excerpt/line ranges. It implements the keywords used in the bundled schema, rather than a general-purpose JSON Schema engine.

`inspect_source.py` is retained as the original construction helper. Its paths assume it is copied into `experiments/llm-only/` inside a fresh upstream checkout. For a new construction run, copy only that helper; keep prior graphs, logs and the team repository outside the construction agent's context. The included exploration logs are the frozen historical record.

## Branch and frozen prediction

`codegraph-llm-only` branches from shared setup commit `16449ab34e7849926ddf285a0b0cf4aec482f43d` (`calcom-postgres`, PR #2). It includes the LLM-only artifacts after source exploration and graph construction were complete. Graph contents, evidence, logs and the original run record are preserved; packaging only adds portable source-checkout selection to the review tools and updates these instructions.

The frozen `graph.json` SHA-256 is `273bf829388a424363d9c3163d8af16735f78cc910bb43c1e1660b2592ac6919`.

## Coverage and interpretation

Included: the public event booking page, event summary and date/form UI; event and slot queries; temporary reservations; ordinary and recurring booking creation; database persistence; calendar, notification and webhook boundaries; the normal confirmation/detail route; rescheduling and cancellation; selected authenticated host list and confirmation/rejection actions.

Not expanded: API v1/v2 servers, team/organization/routing-form/hashed-link/embed entrypoint variants, payment/anti-abuse/dry-run/decoy paths, provider/queue/workflow/auth internals, and every conditional/helper path. The exact scope is also recorded in the JSON. In particular, `/booking/[uid]` is the normal result page; the similarly named `/booking-successful/[uid]` is a decoy path and is outside this graph.

Nodes list inspected files belonging to each component. Shared `schema.prisma` and router files have overlapping membership; line spans distinguish the relevant pieces. This is not a partition of all repository files. Scoring file grouping should account for shared files rather than arbitrarily forcing each into one node. Edges describe relationships between these components and state conditional behavior; `reads` may include an explicitly documented in-memory model read.

## Independence and evaluation

The construction agent did **not** open PR #3, its patch or reference graph, or any hot-started graph. It read the supplied proposal (including its conceptual example), the default-branch team README, PR #1/#2 metadata and filenames, PR #1's `targets/calcom.env`, and the upstream source/instructions. Team code was not cloned into this checkout. No static dependency graph, compiler index or architecture-recovery tool supplied nodes or edges; the model authored them directly. Scripts only serialize evidence, log text inspection, validate and render.

Before the team pin was supplied, the same session explored upstream `0f19cc46ef6b6426ee398c670575b3c96be7af9e`. That history is retained separately, not presented as an independent run at the final pin. Previously inspected files unchanged between revisions were reused; the changed Booker UI files were rechecked. Every final evidence excerpt and full file hash was validated at the team's pin. This source-version exposure and the absence of model token/dollar telemetry limit cost comparability; `run.json` reports available counts and nulls for unavailable measurements. Use a fresh session and checkout at the pin for a controlled replication, without copying previous graphs/logs into the agent's context.

This graph has not been scored against the withheld reference. Source validation does not establish semantic precision, recall or exhaustive grouping. Freeze this prediction before a separate evaluator reads the reference, and reconcile only output format without changing semantic predictions. The graph schema is provisional and may need a topology-preserving adapter to the eventual shared format.

Cal.com API/application tests were not run: this change adds graph research artifacts, with no runtime application changes. The friend's PR #2 database note was used to locate the shared pin; database setup and PR review were not part of this graph run.
