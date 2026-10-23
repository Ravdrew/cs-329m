# Q1 graph scorer

Scores candidate component graphs (files following `schema/graph.schema.json`) against a reference graph,
so graph-building methods can be compared. Python 3.12 with PyYAML and jsonschema; tests need pytest.

## Confidentiality

The reference graph, its file ownership, adjudications, the question set generated from it, and every score
produced against it are **answer-key material**. Teammates' agents build graphs in this repo, so none of that may be
written here. Keep the reference outside the repo and pass `--out-dir` outside the repo too. The scorer prints a
warning when its output directory is inside the repo but the reference is not. `make_questions.py` refuses to write
there unless you pass `--allow-in-repo`. `scoring/out/` is gitignored, but agents working in the repo can still read
it. The tests use only the synthetic pet clinic fixtures in `tests/fixtures/`.

## Running

```
python3 scoring/score_graph.py \
  --reference REF.yaml --ownership OWN.json [--adjudications ADJ.yaml] [--questions Q.json] \
  [--tasks tasks.json] [--source-repo PATH] [--commit SHA] [--schema schema/graph.schema.json] \
  [--out-dir DIR] CANDIDATE [CANDIDATE ...] [--name NAME ...]

python3 scoring/make_questions.py --reference REF.yaml --ownership OWN.json [--adjudications ADJ.yaml] \
  [--extra EXTRA.yaml] [--subsystem "booking subsystem"] [--label LABEL] [--date YYYY-MM-DD] --out Q.json

python3 -m pytest scoring/tests -q
```

- `--reference` and `--ownership` are required. Nothing about the reference is built in.
- `--commit` defaults to the reference's top-level `commit` and is resolved with `git rev-parse` in
  `--source-repo`. Without `--source-repo`, citation checks and localization are reported as `skipped`.
- `--schema` defaults to `schema/graph.schema.json` in this repo.
- `--questions` and `--tasks` are optional. Missing parts are reported as `{"status": "skipped"}`.
- `--name` gives one name per candidate. Put it after the candidates, or repeat it (`--name a --name b`). By
  default the name is the file stem, with `-2`, `-3`, ... added on collisions.
- Candidates may be `.yaml`, `.yml` or `.json`.
- Exit code is 0 whenever scoring ran, including for schema-invalid candidates. It is 2 for bad usage or for
  unreadable or unparsable inputs, including a commit that does not resolve.

### Inputs

- **ownership** (`file-ownership.json`): `files: {path: {owner, basis, reason?}}`, where `owner` is a
  reference node id, `shared` or `out_of_scope`. Its keys are the *ownership universe*.
  `named_nodes: {ref_id: {kind, names, schema_lines?, schema_file?}}` holds model and external names.
- **adjudications**: `pairs: [{from, to, verdict, by, evidence, note}]` with reference node ids.
- **tasks**: a list of objects with `source_files` like `"M:path"`, `"A:path"` or `"R100:old\tnew"`, plus
  `pull_number`, `title`, ...
- **kind mapping**: `x-scoring.kind_mapping` in the reference (`edges`, `nodes`) if present. Otherwise the
  built-in default applies: `emits`/`uses` → `calls`, `job`/`external` → `service`, every other kind maps to
  itself.
- **build cost**: optional top-level `x-build-cost` mapping in a candidate (e.g. `{model, tokens_in, tokens_out,
  usd, wall_clock_minutes, notes}`). It is copied into the result and used only as the comparison tiebreak.

## Rules

### Paths

Candidate paths are normalised in this order:

1. `\` becomes `/`.
2. If a path is absolute and contains the `--source-repo` path, everything up to and including that prefix is
   removed.
3. Leading `./` and `/` are removed.

A file entry expands to every ownership-universe path under or matching it when it is:

- a directory: it ends with `/`, or its last segment has no `.` and it is a prefix of an ownership path; or
- a glob: it contains `*`, and is matched with `fnmatch`, so `*` also crosses `/`.

`nodes.path_expansion` records the number of entries expanded and the paths they added. Each node's expanded
paths are de-duplicated. If a node id occurs more than once, the first occurrence is used for scoring, and the
duplicate is flagged under coherence.

### Node mapping

Ids and labels are never used, except for the name match below.

- **Voting files** of candidate node `a`: its expanded paths whose ownership owner is a node id.
- **Name match**, tried in this order:
  1. *Exact*: the node's label, the last `.`-segment of its id, or its id equals one of `named_nodes[r].names`
     (compared lower-case, alphanumeric only).
  2. *Tokens* (`model`/`external` candidate nodes only): contiguous runs of label or id tokens (split on
     punctuation and camelCase) that equal a name, keeping only maximal runs. `User & Schedule` matches
     `Schedule`; `booking-seat-model` matches `BookingSeat`, not `Booking`. One match gives S(a); several give
     no strict match, and all of them join T(a).
  3. *Line ranges* (`model`/`external` only, used when no name matched): file entries with `lines` in a file
     that reference node `r` (or `schema_file`) lists. T(a) gets every `r` whose `schema_lines` are at least
     half covered; S(a) is the single `r` with the largest overlap (a tie gives none). A wide range such as
     `schema.prisma` lines 401-1000 therefore cannot pick an arbitrary model as its strict match.
- **Strict map S(a)**: for `model`/`external` candidate nodes, and for nodes with no voting files, the name
  match is used if it succeeds. Otherwise S(a) is the reference node owning the plurality of a's voting files; a
  tie gives no mapping.
- **Tolerant map T(a)** = S(a) ∪ {r : a lists the most of r's owned files among all candidate nodes}. When nodes
  tie, every tied node gets r. A node that merges two reference nodes therefore represents both. A reference node
  split over several nodes is represented by its largest piece, plus any piece whose strict map is r.
- **Outside reference scope**: T(a) is empty and `a` has at least one path, all of them `out_of_scope` or not in
  ownership. A node with no files is not outside scope. It counts as unmapped.

### Node facts (`nodes`)

- `recall` = |reference nodes in ∪T(a)| / |reference nodes|. `recall_by_kind` breaks this down by raw
  reference node kind.
- `precision` = |candidate nodes with non-empty T(a)| / |candidate nodes not outside reference scope|.
- `recall_strict` and `precision_strict` are the same quantities under S.
- `node_kind_agreement_strict`: the share of strictly mapped nodes whose mapped kind equals that of S(a).

### Edges (`edges.tolerant`, `edges.strict`; tolerant is the headline)

- **Reference facts R**: the directed pairs (x, y) of reference edges. Parallel edges count once. A pair's kind
  set holds the mapped kinds of its edges. Adjudicated-true pairs join R with an empty kind set, so they count
  for recall too.
- Each candidate edge `e = a→b` is handled under map M (T or S) as follows:
  - **unmapped** if M(a) or M(b) is empty;
  - **collapsed** if every pair in M(a)×M(b) is a self pair;
  - otherwise it has candidate pairs P(e) = {(x, y) ∈ M(a)×M(b), x ≠ y}, and then:
    - **TP edge** if P(e) ∩ R ≠ ∅; it covers those reference pairs;
    - **confirmed FP edge** if every pair of P(e) is adjudicated false;
    - otherwise **pending**: its pairs that are not adjudicated go to `needs_human_review`.
- **Distinct candidate pairs C** = the covered reference pairs ∪ the P(e) of every non-TP edge. Under S each edge
  has a single pair, so C is the prototype's pair set. Under T, pairs of a TP edge that are not in R are *not*
  counted as false positives, because the edge is credited as one fact.
- From C:
  - `tp` = |C ∩ R|;
  - `confirmed_fp` = |C \ R that are adjudicated false|;
  - `pending` = |C \ R that are not adjudicated|.
- Ratios (`null` when the denominator is 0):
  - `precision_decided` = tp / (tp + confirmed_fp). This is the headline.
  - `precision_lower` = tp / (tp + confirmed_fp + pending), which assumes every pending pair is wrong. Under S
    this equals the prototype's precision.
  - `precision_upper` = (tp + pending) / (tp + confirmed_fp + pending).
  - `recall` = |covered pairs| / |R|.
  - `f1` comes from precision_decided and recall.
- Each block also reports edge counts (`tp_edges`, `confirmed_fp_edges`, `pending_edges`, `unmapped_edges`,
  `collapsed_edges`) and the lists `covered_pairs` and `missed_pairs`.
- `route_and_api_edges`: the same metrics, restricted to pairs, in R or C, whose target reference node has kind
  `page` or `endpoint`.
- `edge_kind_agreement`: among covered pairs with a non-empty reference kind set, the share where some covering
  candidate edge's mapped kind is in that set. Adjudicated-true pairs have no reference kind, so they are left out
  and counted in `pairs_without_reference_kind`.
- `needs_human_review` (top level): one entry per unadjudicated pair that is pending under either map, with
  `maps` showing which maps produced it. Each entry gives the candidate edges behind the pair: id (or `#index`),
  from, to, kind, label and evidence.
- `missed_reference_pairs` (top level): reference pairs not covered under T, each with its reference edges' ids,
  kinds and labels.

### File grouping (`file_grouping`)

This is the prototype's rule, applied to expanded paths. Each listed file is assigned to the first candidate node
that lists it. Over the files that ownership assigns to a node and that the candidate lists, a positive pair is two
files in the same node:

- `precision` = pairs together in both / pairs together in the candidate;
- `recall` = pairs together in both / pairs together in the reference;
- `f1` combines the two;
- `coverage` = files compared / reference-assigned files.

`files_listed_by_2plus_nodes` counts files that more than one candidate node lists.

### Questions (`questions`, optional)

Format (also what `make_questions.py` writes):

```json
{"status": "PROVISIONAL", "reference": "<path or label>", "generated": "<date>", "notes": "...",
 "questions": [{"id": "q001", "polarity": "has|does_not_have", "category": "node|edge|scope|documented",
   "text": "...", "check": {"type": "node", "ref": "<ref id>"} | {"type": "edge", "from": "...", "to": "..."}
   | {"type": "files", "paths": ["..."], "min_share": 0.5}, "source": "...", "weight": 1}]}
```

Each question is answered under T:

- `node`: yes if the reference node is in ∪T(a).
- `edge`: yes if some candidate edge has (from, to) in P(e).
- `files`: yes if candidate nodes list at least `min_share` (default 0.5) of the paths.

A `has` question is correct when the answer is yes. A `does_not_have` question is correct when it is no. The
result reports:

- `overall`, `by_polarity` and `by_category`, each with n, correct, accuracy and weighted_accuracy;
- `headline`: `has`, `does_not_have` (excluding scope) and `scope`, reported separately;
- `incorrect`: every wrong question with its text.

If the file's `status` is `PROVISIONAL`, the summary header says so.

`make_questions.py` writes the questions in this order, each block sorted by id or pair:

1. **has/node**: one per reference node.
2. **has/edge**: one per distinct pair in R.
3. **does_not_have/edge** from adjudicated-false pairs.
4. **does_not_have/edge** reversal negatives (source `reversal (closed world)`): one for each (x, y) ∈ R where
   (y, x) is not in R and not adjudicated false, y is not a model or external node, and x is not a model node.
5. **does_not_have/scope**: one per distinct `out_of_scope` reason, as a `files` check over that reason's paths
   with `min_share` 0.5.
6. **--extra** questions, copied verbatim.

Ids are renumbered `q001`… and `weight` defaults to 1. The output is always `PROVISIONAL`. It is deterministic for
fixed inputs and `--date`.

### Localization (`localization`, optional; needs `--tasks` and `--source-repo`)

For each task:

- **Files**: `source_files` with the status prefix (`M:`, `A:`, `D:`, `R100:` …) removed. For renames the new
  path is kept.
- **Eligible files**: those present as files at the pinned commit (from `git ls-tree -r`). Benchmark PRs are
  older than the pinned commit, so a file missing there is followed through git rename detection
  (`git diff -M50%` from the task's `merge_commit` to the pinned commit) and scored under its current path;
  these are listed under `renamed`. Files still missing (deleted since, or added after the pin) are listed
  under `excluded`.
- `file_recall` = share of eligible files that some candidate node lists, after expansion.
- `in_scope_files` = eligible files whose owner is a node id; `in_scope_recall` is computed over those.
- `nodes_pointed` = candidate nodes listing any eligible file.
- `precision` = eligible task files listed / all files (present at the pinned commit) of the `nodes_pointed`.
  This is the share of what the graph hands a developer for this task that the task actually needed. Listing
  more files raises recall but makes the pointed nodes bigger, so listing every file is not free: one node holding
  the whole repo gets near-perfect recall and near-zero precision. Undefined when nothing is hit.
- `f1` = harmonic mean of precision and `file_recall`; 0 when nothing is hit.
- `hit` = at least one eligible file is listed.

Aggregates:

- `file_recall_macro`: mean over tasks with at least one eligible file;
- `in_scope_recall_macro`: mean over tasks with at least one in-scope file;
- `precision_macro`: mean over tasks with a hit; `f1_macro`: mean over tasks with at least one eligible file
  (a miss counts 0), the balanced headline;
- `hit_rate` and the counts.

**Reference (ownership).** The same metrics are computed with ownership standing in for a graph: each owner
is a node holding every file assigned to it. For recall and hit rate this is the **ceiling**, since a candidate
can only be credited for files it lists, and ownership covers the reference's whole universe. Each candidate
reports `file_recall_macro_vs_ceiling` and `hit_rate_vs_ceiling` (its value divided by the ceiling) and copies
the reference values under `reference_ceiling`. These ratios can exceed 1 when a graph lists task files outside
the reference's universe. For precision and F1 the reference value is a point of comparison, not a bound: finer
nodes than the reference's can be more precise. The values appear as the last column of `comparison.md`
and under `reference_ceiling` in `comparison.json`.

### Coherence (`coherence`)

- `schema_valid` and up to 50 `schema_errors` (jsonschema Draft 2020-12).
- The referential checks of `viewer/scripts/validate.mjs`: `dangling_edges`, `unknown_group` and
  `unknown_group_parent`. Further checks: `duplicate_node_ids`, `duplicate_edge_ids`, `self_loop_edges` and
  `nodes_without_files`.
- `citations` (needs `--source-repo`). Files are read with `git show <commit>:<path>`, cached per path.
  - Every node file path, after normalisation, must exist at the commit.
  - Every `lines: [a, b]` must satisfy 1 ≤ a ≤ b ≤ line count.
  - Every edge evidence `file` must exist, and its `line`, if given, must be within the file and not blank.
  - Directory and glob entries are checked only for existence (`directory_entries`, `directory_entries_missing`).
    They are not counted as citations.
  - Reported rates:
    - `node_file_resolve_rate`;
    - `line_range_valid_rate`;
    - `evidence_resolve_rate`;
    - `citation_resolve_rate` = (node file citations that exist and have valid lines + evidence that resolves) /
      (node file citations + evidence citations).
  - The first 50 failures are listed.
- `declared_commit` and `commit_matches_pinned`: a prefix match in either direction counts as the same commit;
  the value is `null` when the candidate declares no commit.
- `coherence_pass` = the schema is valid (or schema checking was skipped) and there are no dangling edges.

## Outputs

For each candidate, `--out-dir` (default `scoring/out/`) receives:

- `<name>.score.json`, with the sections `inputs` (paths, sha256 of each input, pinned commit), `nodes`, `edges`,
  `route_and_api_edges`, `edge_kind_agreement`, `file_grouping`, `questions`, `localization`, `coherence`,
  `build_cost`, `needs_human_review`, `missed_reference_pairs` and `granularity`. `granularity` holds `merges`,
  `splits`, `unmapped` and `strict_unmapped` (with vote counts), `outside_reference_scope`, `tolerant_map` and
  `strict_map`. Undefined ratios are `null`, never NaN.
- `<name>.summary.md`: a header, a metrics table, and the first 8 items of each list (needs human review, missed
  reference pairs, incorrect questions, coherence failures), with "(N more in JSON)" after a truncated list.

With 2+ candidates the directory also receives:

- `comparison.md`: one table with candidates as columns;
- `comparison.json`: the same numbers, plus the column order and the reference ceiling.

The comparison columns are ordered by tolerant edge F1, descending. When two candidates are equal to 3 decimals,
the cheaper build comes first: `x-build-cost.usd`, otherwise total tokens, and candidates without a cost go last.
The summaries are also printed to stdout.
