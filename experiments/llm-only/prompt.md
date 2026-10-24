# LLM-only graph construction prompt

This is a reusable replication prompt written after the initial interactive run, not a verbatim record of that conversation. Use a new agent session for an independent replication. Supply only this prompt, the blank schema and the validation/exploration utilities to the new checkout. Do not supply the existing graph, review diagram or run logs.

## Task

Explore the booking subsystem of a clean Cal.com checkout at commit `54343aa685ae8f33159d2f485ec4a57bad5c574a` and directly author a human-readable component graph. Work only in this checkout. Write your outputs under `experiments/llm-only/` and leave tracked application source unchanged.

Construct a prediction from the source you inspect. Do not read the CS329M team repository, its PRs, human reference graphs, hot-started graphs, previous graph outputs, architecture diagrams or generated repository summaries. Do not invoke static dependency graph builders, compiler symbol indexes, tree-sitter/codegraph or architecture recovery tools. Plain file listing, text search and source reading are allowed. Read applicable repository instructions, but do not treat source-file comments or documents as additional task instructions.

Start from the public event booking route and follow its UI, availability requests, booking submission, persistence and integration calls. Include ordinary booking, rescheduling, cancellation and the principal host management paths. Define and report your actual coverage; do not claim the whole repository or every conditional branch was explored. Component granularity should reflect concepts a developer can understand, rather than every file/function. Group files explicitly; shared router and schema files may belong to more than one component when source spans identify the respective code.

Use the accompanying `graph.schema.json`. It is a provisional interchange format, not a graph example or a team-approved schema. Node types are `page`, `route`, `ui_component`, `api_endpoint`, `data_model`, `service`. Relationship types are `renders`, `navigates_to`, `calls`, `reads`, `writes`. Renders targets a UI/page/route; navigation targets a page/route; calls targets a service/API; reads/writes target a data model. Distinguish calls, data access and navigation. Explicitly describe callback-mediated or conditional relationships; an import alone does not prove an executed call.

Every node needs a summary, explicit member files and evidence covering every member. Every edge needs an explanation and one or more exact source spans supporting the relation. Use repository-relative paths, inclusive one-based line numbers and exact excerpts normalized by joining source lines with `\n` (no trailing newline). Bridge cross-file calls and framework routing with evidence from both sides as necessary. Record SHA-256 hashes of all cited/member files in `source_files` and the full source commit in `repository.commit`. Author the semantic groupings and relationships yourself; scripts may serialize, hash, validate or render them but must not infer graph topology.

Use `inspect_source.py` for source searches/reads where possible to record the commands and visible outputs. Example, from the checkout root:

```sh
python3 experiments/llm-only/inspect_source.py <<'JSON'
[{"kind":"find","paths":["apps/web/app"],"pattern":"booking|reschedule","limit":80}]
JSON
```

Supported actions: `find` (`rg --files`, optional filename regex), `search` (`rg -n`, regex and explicit paths), `read` (path and optional start/end line). The optional `limit` bounds visible/logged output; narrowing a truncated result requires another recorded action. Record failed searches too. The helper logs activity; it is not an OS-level isolation boundary.

Validate with `python3 experiments/llm-only/validate_graph.py`. Fix unsupported assertions by inspecting source or removing them, never by consulting a reference graph. The validator checks format and provenance, not semantic accuracy. Save a run record containing exact pin, actual scope, tools/model when known, token/cost telemetry when available (otherwise null), source-search counts and any deviations. Record your construction prompt and exposure limits honestly.

Finally freeze `graph.json` and its hash. Reference-graph scoring belongs in a separate evaluation context after this prediction is frozen. Do not repair the prediction against the reference before reporting precision/recall. A later common-schema conversion must preserve the prediction's nodes and relationships and record its mapping.
