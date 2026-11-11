# Graphs

Every component graph the project has produced, one file each, all in the shared format
(`schema/graph.schema.json`). The viewer serves this folder at `http://localhost:5173/?graph=/graphs/<file>`
and opens `booking-handmade.yaml` by default. Validate everything here with `cd viewer && npm run validate`.

File names are `<scope>-<builder>[-<date>][-<run>]`. Scope is `booking` (the Cal.com booking subsystem)
or `calcom` (the whole repository). The date is the day the graph was generated.

| File | Title in the file | Built by | Cal.com pin | Nodes / edges / groups | Source of truth |
|---|---|---|---|---|---|
| `booking-handmade.yaml` | Cal.diy — booking subsystem | Hand-built by Andres, verified against source | `6bfe2df9` | 34 / 50 / 8 | this file |
| `booking-handmade-edit.yaml` | Cal.diy — booking subsystem (developer edit: Booked Appointments page) | The hand-built graph after a developer adds a page; demonstrates `status: new/modify` | `6bfe2df9` | 36 / 55 / 8 | this file |
| `booking-codegraph-static.json` | Cal.com booking subsystem — CodeGraph baseline | CodeGraph 1.6.2 index projected by path rules (`tools/codegraph/booking.config.json`) | `54343aa` | 32 / 79 / 5 | `codegraph-booking/components.json`, rebuilt by `scripts/build_booking_graph.sh` |
| `calcom-codegraph-static.json` | Cal.com — component dependency baseline | CodeGraph 1.6.2 index of the whole repository projected by path rules | `54343aa` | 48 / 144 / 4 | `codegraph-calcom/components.json` |
| `booking-llm-only-2026-10-24.yaml` | Cal.com booking subsystem — LLM-only | First LLM-only graph: Astra read source in a clean checkout and authored nodes and edges | `54343aa` | 36 / 62 / 7 | `experiments/llm-only/graph.yaml` |
| `booking-llm-only-2026-10-26-run01.yaml` | Public scheduling and host management in Cal.diy | LLM-only runner (`tools/llm-only`), gpt-6-astra medium, run 1 of 3 | `54343aa` | 34 / 49 / 5 | `results/llm-only/astra-medium-2026-10-26/run-01/graph.yaml` |
| `booking-llm-only-2026-10-26-run02.yaml` | Cal.diy public booking and host management | LLM-only runner, run 2 of 3 | `54343aa` | 32 / 42 / 5 | `results/llm-only/astra-medium-2026-10-26/run-02/graph.yaml` |
| `booking-llm-only-2026-10-26-run03.yaml` | Public booking and host management in Cal.diy | LLM-only runner, run 3 of 3 | `54343aa` | 33 / 43 / 5 | `results/llm-only/astra-medium-2026-10-26/run-03/graph.yaml` |
| `booking-hotstart-2026-10-29-run01.yaml` | Cal.com booking subsystem components | Hot-started runner (`tools/codegraph-llm`): Astra grouped the CodeGraph graph, host derived edges; run 1 of 3 | `54343aa` | 34 / 315 / 0 | `results/codegraph-llm/astra-medium-2026-10-29/run-01/graph.yaml` |
| `booking-hotstart-2026-10-29-run02.yaml` | Cal.com booking subsystem components | Hot-started runner, run 2 of 3 | `54343aa` | 33 / 306 / 3 | `results/codegraph-llm/astra-medium-2026-10-29/run-02/graph.yaml` |
| `booking-hotstart-2026-10-29-run03.yaml` | Cal.com booking subsystem components | Hot-started runner, run 3 of 3 | `54343aa` | 33 / 307 / 5 | `results/codegraph-llm/astra-medium-2026-10-29/run-03/graph.yaml` |
| `booking-llm-only-sonnet55-2026-11-10.yaml` | Cal.diy booking, availability, cancel/reschedule and host-management paths | LLM-only runner, claude-sonnet-5-5 medium via Pi | `54343aa` | 28 / 40 / 5 | local run bundle `llm-only-runs/2026-11-10T23-53-59.628Z-xQpsrG` |
| `booking-llm-only-sonnet55-2026-11-11-fresh.yaml` | Cal.diy booking, availability, cancel/reschedule and host-management paths | LLM-only runner, claude-sonnet-5-5 medium; fresh run sent for Q1 grading | `54343aa` | 30 / 38 / 5 | local run bundle `llm-only-runs/2026-11-11T20-12-47.826Z-VlNONY` |
| `booking-hotstart-sonnet55-2026-11-10.yaml` | Cal.com booking subsystem | Hot-started runner as on master (no edge operations), claude-sonnet-5-5 medium | `54343aa` | 53 / 489 / 11 | local run bundle `codegraph-llm-runs/*-buxdAh` |
| `booking-hotstart-reviewed-sonnet55-2026-11-10.yaml` | Cal.com booking subsystem | Hot-started runner, `hotstart-edge-ops` (PR #9) with required review of pairs above 5 file pairs | `54343aa` | 50 / 404 / 0 | local run bundle `codegraph-llm-runs/*-LGNoDa` |
| `booking-hotstart-classified-sonnet55-2026-11-10.yaml` | Cal.com booking subsystem | PR #9: one edge per pair, every edge classified or dropped, groups required | `54343aa` | 54 / 273 / 11 | local run bundle `codegraph-llm-runs/2026-11-11T02-37-25.644Z-FqfGWF` |
| `booking-hotstart-sites-sonnet55-2026-11-11.yaml` | Cal.com booking subsystem | PR #9 + code sites shown as evidence and stronger drop guidance (141 dropped) | `54343aa` | 45 / 117 / 11 | local run bundle `codegraph-llm-runs/2026-11-11T19-34-31.453Z-BLE17v` |
| `booking-hotstart-kinds-sonnet55-2026-11-11.yaml` | Cal.com booking subsystem | PR #9 + host kind hints (reads/writes/emits/renders from the code at each site) | `54343aa` | 47 / 240 / 8 | local run bundle `codegraph-llm-runs/2026-11-11T19-50-41.069Z-Yd5HOU` |
| `booking-hotstart-final-sonnet55-2026-11-11.yaml` | Cal.com booking subsystem | PR #9 + kind hints + automatic drop of weak uses-only edges (148 dropped) | `54343aa` | 46 / 118 / 10 | local run bundle `codegraph-llm-runs/2026-11-11T20-03-24.614Z-lyVsdd` |
| `booking-hotstart-sonnet55-2026-11-11-fresh.yaml` | Cal.com booking subsystem | PR #9 at `5c4c6af` (required policy); fresh run sent for Q1 grading (111 dropped) | `54343aa` | 48 / 148 / 9 | local run bundle `codegraph-llm-runs/2026-11-11T20-12-48.071Z-w01Pvs` |

The two hand-built graphs target an earlier Cal.com commit than everything else; see the top-level README.

## Folders

- `codegraph-booking/`, `codegraph-calcom/`: the CodeGraph build outputs (full structural export summary,
  report, standalone visualization) with their own READMEs. The `components.json` in each is what the
  matching `*-codegraph-static.json` above is copied from.

## Adding a graph

Copy the frozen `graph.yaml` here under the naming scheme, add a row above with the file's own `title`,
and keep the original where its run bundle or build script puts it. The copies here are for browsing and
the viewer; the run bundles under `results/` carry the checksums and replay verifiers.
