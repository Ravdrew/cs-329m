# Three fresh LLM-only graph runs

All three runs completed and passed graph validation. Each used **openai/gpt-6-astra**, **medium** reasoning effort, Pi 1.4.0, and Cal.com commit `54343aa685ae8f33159d2f485ec4a57bad5c574a`. The experiment ran on October 26, 2026 in America/Los_Angeles (UTC timestamps are October 27).

| Run | Runner time | Nodes | Edges | Groups | Member files | Tool calls | Rejected calls | Validation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| [run-01](run-01/graph.yaml) | 9m 8.8s | 34 | 49 | 5 | 55 | 153 | 0 | Pass |
| [run-02](run-02/graph.yaml) | 8m 11.3s | 32 | 42 | 5 | 53 | 160 | 1 | Pass |
| [run-03](run-03/graph.yaml) | 7m 51.0s | 33 | 43 | 5 | 50 | 157 | 0 | Pass |

Mean runner time: **8m 23.7s**; median: **8m 11.3s**; sample standard deviation: **40.4 s** (n = 3). Total sequential batch wall time, including separate verification passes: **25m 14.7s**. Runner time includes setup and internal verification. Detailed phase boundaries and monotonic process measurements are in [protocol.json](protocol.json) and each run's timing.json.

The scope was public booking, availability, submission, persistence, rescheduling, cancellation, and principal host-management paths. Each graph declares its actual coverage and exclusions in x-scope. Counts describe output size; they do not score accuracy or completeness. No reference scoring or Cal.com API tests were performed.

## Fresh-start protocol

The runs executed sequentially. Each CLI invocation created a new standalone Git checkout outside the team repository, a new in-memory Pi session, and an empty graph draft. Each checkout fetched only the pinned commit from the same local Git object cache; working-tree and untracked files were not copied. OS filesystem caches were not reset. All three checkouts were clean afterward and used the same pin, source manifest, instructions, schema, and generator files at commit `f3f3854eb30c2b2eee3d0de3506f6b9b2892019d`. The same limits applied: 600 tool calls and 45 minutes per run. No failed run was replaced or excluded.

The sessions had only list_source, search_source, read_source, update_graph, inspect_graph, and finalize_graph. They received no previous graphs, hot-start graphs, reference graph, PR #3, project instructions, shell, web, or plugins. Isolation uses the allowlisted tools and separate checkouts; it is not an OS container. Compaction, cache warming, and automatic provider retries were disabled. In-session tool errors and corrections remain included in the measurements. Pi appends the unique checkout path to the otherwise identical system instructions. Fresh context does not guarantee a cold provider cache.

## Tests and validation

- **32/32 harness tests passed**, with zero skipped or cancelled, in 23.646 s. See [TAP output](tests/harness.tap) and [timing/counts](tests/harness.json).
- **3/3 graphs passed finalization and a separate CLI --verify process**. Checks replay source reads against the pinned checkout and validate schema, IDs, references, group structure, file membership, evidence ranges/excerpts, source hashes, canonical YAML, and frozen graph checksums.
- **3/3 graphs passed the repository viewer's schema/reference validator**, invoked only on these three candidate files. See [viewer validation](tests/viewer-validation.json).

An initial harness invocation from the repository root produced 31 passes and one test failure because a test subprocess uses a package-relative path. Repeating the command from tools/llm-only, as the documented npm test command does, passed all 32 without code changes. That initial attempt is retained in [tests/initial-wrong-cwd.json](tests/initial-wrong-cwd.json) and its TAP log.

## Usage

| Run | Responses | Uncached input | Output | Cache reads | Total tokens | Catalog estimate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| run-01 | 30 | 112,639 | 17,346 | 1,745,152 | 1,875,137 | $3.7388 |
| run-02 | 31 | 109,650 | 16,670 | 1,774,592 | 1,900,912 | $3.7046 |
| run-03 | 31 | 105,070 | 16,103 | 1,703,040 | 1,824,213 | $3.5589 |

Usage is summed once per assistant response. Reasoning tokens, when reported, are already part of output. Catalog estimates are Pi model-price calculations, not billed charges or measurements of ChatGPT plan allowance usage; actual cost remains unknown (cost_usd: null). [statistics.json](statistics.json) contains per-run measurements, kind distributions, and mean/median/min/max/sample standard deviations.

## Audit and repeat

Each run directory contains its unchanged frozen graph, metadata, timing, Pi session descriptor, validation reports, and losslessly compressed source-tool transcript. Shared instructions and schema are included. Local paths in run records and test logs are normalized as documented in protocol.json. Full source checkouts and model event streams remain in the original local experiment directories.

With runner dependencies installed and a clean checkout at the recorded Cal.com pin, rerun all evidence checks without model calls:

```sh
node results/llm-only/astra-medium-2026-10-26/verify-results.mjs --source /path/to/clean/pinned/calcom
```

The verifier checks every published checksum, decompresses the exact read transcripts into a temporary directory, and replays the harness validator against the supplied source. [run-batch.mjs](run-batch.mjs) records the actual sequential driver; to repeat generation, use a clean checkout of the recorded runner revision, a fresh output directory outside the repository, passing harness-test JSON, and configured Pi credentials. Outputs are stochastic; the pin, configuration and code are reproducible, not the exact graph.

To view a graph, load run-01/graph.yaml, run-02/graph.yaml, or run-03/graph.yaml in the repository viewer. No layout data was added to the frozen graphs.
