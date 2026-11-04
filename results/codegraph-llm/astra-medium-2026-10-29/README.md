# Three CodeGraph hotstart runs with Pi/Astra

All three runs completed and passed independent replay and viewer validation on October 29, 2026. Each used **openai/gpt-6-astra**, **medium** reasoning, Pi **1.4.0**, Node **22.22.3**, and runner commit `462cd12e9168091338548fc5a12908b1b3339f65`. The target was `calcom/cal.com` at `54343aa685ae8f33159d2f485ec4a57bad5c574a`.

| Run | Runner time | Components | Edges | Groups | Member files | Tool calls | Rejected calls | Validation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| [run-01](run-01/graph.yaml) | 4m 42.1s | 34 | 315 | 0 | 738 | 62 | 3 | Pass |
| [run-02](run-02/graph.yaml) | 4m 58.4s | 33 | 306 | 3 | 738 | 60 | 2 | Pass |
| [run-03](run-03/graph.yaml) | 4m 0.5s | 33 | 307 | 5 | 738 | 62 | 1 | Pass |

Mean runner time: **4m 33.7s**; median: **4m 42.1s**; sample standard deviation: **29.8 s** (n = 3). Runner time includes preparation, model/tool interaction, repairs and internal verification. It excludes separate verification. Run 1 was the initial live test; runs 2 and 3 extended the requested total to three. They ran sequentially with a gap between requests, so the overall elapsed span is not a continuous batch timing.

## Input and method

All runs used the same CodeGraph 1.6.2 snapshot: **11,525 nodes, 20,363 edges and 738 files with structural nodes**. The raw export's 740-file mapping also contains two Docker Compose files without nodes (`packages/emails/docker-compose.yml` and `packages/prisma/docker-compose.yml`); these are absent from the structural snapshot. Every input node has exactly one component owner in every run.

The scope covers the web booking subsystem and supporting packages. API v2, generic UI/auth utilities and provider-specific app-store implementations are outside the boundary. Astra authored component memberships, labels and descriptions using the raw graph and source reads. The host derived all component edges: containment and internal edges were removed, while all cross-component static dependencies were retained, including low or unknown confidence. The different edge counts reflect different component assignments.

Each run started with a new detached checkout, a fresh in-memory Pi session and an empty component draft. Previous component assignments, grouping labels, reference graphs and prior predictions were not inputs. All three used the same source pin, source manifest, prompt, schema, runner files and static-input hashes, with limits of 600 tool attempts and 45 minutes. No failed run was replaced or excluded. Tool rejections and repairs are retained in each `tool-errors.json` and the exact compressed transcript.

Pi exposed only the runner's restricted tools, with no shell, web, inherited project instructions, extensions, subagents, automatic provider retries, compaction or cache warming. This is tool-level isolation, not an OS container. OS and provider caches were not reset. See [protocol.json](protocol.json) for configuration and publication details.

## Validation

- **30/30 Pi harness tests passed**, with zero skipped or cancelled: [TAP output](tests/harness.tap).
- **10/10 component projection tests passed**: [log](tests/components-tests.log).
- **3/3 live graphs passed finalization and separate CLI replay verification**, checking source hashes and reads, membership, edge conservation, schemas, evidence, frozen graphs and audit sidecars.
- **3/3 graphs passed viewer validation in both YAML and JSON form**: [viewer results](tests/viewer-validation.json).

The runner and target source were unchanged. Structural and provenance checks do not establish semantic accuracy; no reference scoring or Cal.com application test suites were run.

## Usage

| Run | Responses | Uncached input | Output | Cache reads | Total tokens | Catalog estimate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| run-01 | 18 | 80,976 | 13,167 | 995,456 | 1,089,599 | $2.4636 |
| run-02 | 26 | 82,391 | 10,664 | 1,252,224 | 1,345,279 | $2.6093 |
| run-03 | 18 | 80,000 | 8,663 | 891,648 | 980,311 | $2.1248 |

Usage is summed once per completed assistant response. Reasoning tokens are already included in output. Catalog estimates come from Pi model pricing; they are not billed charges or measurements of subscription allowance. Actual cost remains unknown (`cost_usd: null`). [statistics.json](statistics.json) records the per-run values and summary statistics.

## Inspect or replay

Open any `run-0N/graph.yaml` in the existing viewer. Frozen graphs, model component definitions, Pi session descriptors and validation reports are preserved. JSON graphs, membership and aggregation sidecars, and exact tool transcripts are losslessly compressed. The identical structural snapshot, source manifest, prompt and schema are stored once.

With runner dependencies installed and a clean checkout at the recorded Cal.com pin, verify this publication without model calls:

```sh
node results/codegraph-llm/astra-medium-2026-10-29/verify-results.mjs --source /path/to/clean/pinned/calcom
```

The script verifies published checksums, restores the compressed inputs and sidecars into temporary files, then replays all three through the original harness verifier.

To repeat generation, use the recorded runner revision and snapshot at the same target pin, a new output directory outside any Git checkout, Node 22.19+ and configured Pi credentials. Invoke this once per fresh run:

```sh
bash scripts/run_codegraph_llm_graph.sh --provider openai --model gpt-6-astra --effort medium \
  --source /path/to/calcom-object-cache --static-graph /path/to/raw-codegraph-export.json \
  --output-root /path/outside/git/checkouts --max-tools 600 --max-minutes 45
```

The `--static-graph` argument takes the raw CodeGraph export, not the sanitized `static-input.json` included here. Rebuild it with `bash scripts/build_booking_graph.sh`; record its hash because raw export IDs/fingerprints can differ across builds. The existing packaged snapshot is sufficient for exact replay of the saved results. New model outputs are stochastic.
