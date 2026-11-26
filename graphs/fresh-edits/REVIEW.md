# Fresh graphs and blind edits: review before any run (2026-11-26)

Graphs: `graphs/fresh/PULL.yaml` (scope wide-full, Sonnet 5.5 medium, one fresh build per PR at its base commit,
`tools/llm-only/batch-fresh.mjs`); quality in `PULL.quality.json`; every build in `batch-results.json`.
Edits: `graphs/fresh-edits/PULL/`: `edit.json` (what the author wrote), `edit.yaml` (applied to the graph),
`intent.md`. Each drafted by a fresh subagent that was told to read only the PR description, the interface spec and
the base graph (tools/llm-only/EDITS.md); this was an instruction, not enforced. Format checked by apply-edit.mjs and
by loading each edit.yaml in the graph tools; content not reviewed.

Not built (budget, $37.86 of $40 spent): 19626, 22024, 24207, 24324, 24465, 25315, 27192, 27208.

Coverage columns use the PR's real files and are for the write-up only (never used to accept a graph). "existing"
counts only PR files that exist before the PR (a graph of the base cannot contain files the PR adds).

| PR | build $ | scope cov. | existing PR files in graph | in changed comps | within 1 step | marked (mod/new nodes/new edges) | check |
|---|---|---|---|---|---|---|---|
| 19997 | 2.54 | 0.335 | 10/11 | 7/11 | 8/11 | 3/0/1 |  |
| 20646 | 2.05 | 0.362 | 10/15 | 9/15 | 9/15 | 1/2/2 |  |
| 24124 | 2.24 | 0.245 | 2/4 | 2/4 | 2/4 | 4/0/2 |  |
| 24880 | 4.38 | 0.292 | 4/6 | 4/6 | 4/6 | 1/1/1 |  |
| 25313 | 3.48 | 0.276 | 3/9 | 5/9 | 5/9 | 1/3/3 | new nodes trpc-oauth-router, model-oauth-client list files that already exist (graph had no node for them) |
| 26039 | 5.35 (2 builds) | 0.198 | 0/4 | 0/4 | 0/4 | 1/3/4 | graph failed the quality check twice (scope coverage 0.198 / 0.175); kept the better; covers 0 of 4 existing PR files |
| 26217 | 3.09 | 0.237 | 2/4 | 2/4 | 2/4 | 1/1/1 |  |
| 27088 | 3.56 | 0.279 | 6/10 | 3/10 | 5/10 | 3/1/1 | new node troubleshooter-calendar has no files (graph had no Troubleshooter node) |
| 27378 | 3.05 | 0.276 | 1/4 | 1/4 | 1/4 | 1/2/4 |  |
| 27405 | 2.24 | 0.21 | 3/4 | 3/4 | 3/4 | 4/1/3 | new node m-wrong-assignment-report lists a file that already exists (schema.prisma) |
| 27428 | 1.88 | 0.246 | 2/3 | 2/3 | 2/3 | 2/1/2 |  |
| 30354 | 4.01 | 0.302 | 11/21 | 11/21 | 11/21 | 8/0/1 |  |
