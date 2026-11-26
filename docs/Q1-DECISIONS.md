# Q1 / evaluation decisions log

Decisions about how graphs and agents are scored, with the date and why. Add new entries at the bottom.
Master copy: Documents/School/329m/Q1-DECISIONS.md on Jo's Mac.
This repo copy leaves out reference-specific details (node and edge names, which files a node owns); those are
replaced with counts and marked [reference detail omitted]. Paths in it refer to Jo's local 329m folder.

## 2026-10-22 — Localization headline is F2, fixed before any candidate was scored
Recall weighted over precision: an agent can skim an extra file but cannot fix one it never looks at.
Recall and precision are always reported next to it.

## 2026-10-25 — Localization uses only the 19 PRs that touch booking files
18 of the 37 benchmark PRs change no booking file, so a booking graph cannot find them and the reference
itself scored below a candidate. Applied to every graph. All-37 numbers are still reported.

## 2026-10-26 — Two localization numbers in Q1; agents are always scored on the full diff
Finding: on the 19 booking PRs, more than half of the changed source files are outside the booking subsystem
(embeds, signup/auth, bot detection, troubleshooter, form builder, calendar sync, webhook DI wiring, global
types). Tests are already excluded by the task format. Under reference v2.6:

| Share of changed files found | LLM-only (Nathan) | Reference ceiling |
|---|---|---|
| Booking-subsystem files only | 0.61 | 0.91 |
| All changed files | 0.32 | 0.54 |

Rules:
1. **Q1 (graph vs graph)** reports both numbers. The booking-only number compares graph quality inside the
   area a booking graph claims to cover. The all-files number shows how much of a real change the graph can see.
   Never quote the booking-only number alone.
2. **Q2-Q4 (agent runs) never use the booking-only restriction.** An agent is scored on the PR's own tests and
   on file overlap against every file the PR changed. An agent that edits all the booking files and misses the
   embed or auth change has failed the task.
3. **Task selection for agent runs:** tag each task with its share of booking files and report results split by
   that tag (or drop tasks that are mostly outside booking, e.g. PR 20646: 1 of 14 files in booking). Decide
   before agent runs start.
4. Open idea for the team: one-hop "neighbor" nodes (embeds, form builder, auth) so a booking graph can at least
   point an agent outside the subsystem.

How the booking-only number is made: `booking-reference-output/v2.7-draft/make_in_subsystem_tasks.py` restricts
each task's `source_files` to the reference ownership universe, following renames to the pinned commit. Scorer
unchanged. Runs: `q1-runs/regrade-v2.7-2026-10-26/` (v2.6 numbers above are `out/v2.6.booking/` and
`out/v2.6.booking.in-subsystem-v2.6/`).

Recorded in: slide 18 table, caption and speaker notes; evaluation slide notes ("counted against every file the
PR changed"); this file; the cs329m Project docs.

## (Resolved 2026-10-27: v2.7, see below) Pending decision — reference v2.6 or v2.7
v2.7 draft (`booking-reference-output/v2.7-draft/`) extends file ownership to each node's own module directory
[reference detail omitted]. Graph unchanged. Ceiling 0.535 -> 0.552; LLM-only unchanged except file
coverage; CodeGraph file grouping F1 0.46 -> 0.64. Must be settled before the hot-started graph is scored,
because that graph is seeded from CodeGraph. Deck stays on v2.6 until then.

## 2026-10-27 — Reference v2.7 frozen; the reference is a baseline, not a ceiling; one-hop neighbors stay secondary
Why: the reference's all-files localization recall (0.54 under v2.6) was being read as a ceiling. It is not one:
the scorer credits a candidate for every changed file it lists, so candidates can and do score above the
reference (v2.7 draft: CodeGraph recall 0.58 vs 0.55; LLM-only F2 0.27 vs 0.18). About half the gap is PRs that
also change other features (embeds, signup, bot detection, troubleshooter, data tables); about 0.2 is booking
dependencies outside the booking directories. One-hop "neighbor" nodes were considered and an independent review
recommended against putting them in the headline: the F2 gain they showed came from many small nodes, which this
metric rewards (one node per file would score perfect precision), not from evidence that agents navigate better.
Decisions (made before the hot-started graph is scored):
1. **Reference = v2.7, frozen** as `booking-reference-output/snapshots/v2.7/` (graph identical to v2.6; ownership
   extended to node module directories). Two general builder fixes: `.d.ts` imports resolve (no owner changed);
   every shared file lists its member nodes (61 of 70 have any).
2. **"Ceiling" is renamed "reference baseline"** in the scorer, its outputs and the deck.
3. **Localization targets production code only**: code files that are not tests, mocks, fixtures or test
   utilities. One rule for every task and graph. Q2-Q4 still score agents on the PR's full diff and its tests.
4. **Shared files**: the reference baseline lists each shared file under every member node. Exclusive ownership
   (and so file grouping) is unchanged. This lowers the baseline's precision (0.13 -> 0.07).
5. **Directory and glob entries expand over every source file at the pinned commit**, not only the reference
   universe. (No effect on the current candidates.)
6. **One-hop neighbors are a secondary "reach" analysis only**, not built into the reference: 524 more files
   would raise reference coverage from 0.60 to 0.79. Agent benefit untested.
7. **Known limitation, stated wherever F2 is shown**: nodes are chosen using the true changed files and precision
   ignores node count, so F2 favours graphs with small nodes. Read it next to recall and node counts.
8. **Still to do**: rerun CodeGraph at the pinned commit (current inputs are built from 6bfe2df).

Results (19 booking PRs, macro), LLM-only / reference baseline: all files recall 0.32 / 0.60, F2 0.28 / 0.16
(precision 0.47 / 0.07); booking-only recall 0.57 / 0.95. Edge, node and grouping numbers unchanged.
Runs: `q1-runs/regrade-v2.7-final-2026-10-27/` (README has the CodeGraph numbers).
Scorer changes are in the `cs-329m-q1` worktree, with 3 new tests (21 pass); not committed yet.
Recorded in: slide 18 (table header, two values, new F2 row, caption, speaker notes); this file; the cs329m
Project docs.

## 2026-10-27 (later) — Reference v2.7.1: notifications stays booking-only; precision counts production code only
A second independent review of frozen v2.7 found two problems; both were reproduced and fixed by general rules.
1. **Email templates.** v2.7 gave one node every email template, including account and organization emails, because
   a registry re-exports all 45 templates. Decision: that node stays scoped to booking emails only; it does not stand
   for the whole email subsystem. Rule: a registry (a pure
   re-export file imported as a namespace and indexed by name) does not pass ownership on, and
   `renderEmail("Name")` counts as an edge to that template. One file qualifies. 26 owner changes
   [reference detail omitted]. Frozen as
   `booking-reference-output/snapshots/v2.7.1/`, which supersedes v2.7. The v2.7 "open before freezing" ownership
   spot-check is closed by this.
2. **Precision and listed tests.** Directory entries skipped tests but tests listed by name still counted in node
   size, so the same node scored differently depending on how it was written. Decision: retrieval cost counts
   production source files only, the same rule as targets and directory expansion. New test; 22 pass.
3. **Scorer pinned.** The exact scorer (score_graph.py, README, tests) is archived in `snapshots/v2.7.1/scorer/`
   with checksums. Committing it to the team repo is still to do; a committed version must match the checksum.
Results: slide 18 values unchanged at two decimals (reference F2 0.163 -> 0.164, CodeGraph F2 0.150 -> 0.151).
CodeGraph file grouping F1 0.64 -> 0.56: part of its v2.7 gain was the email artifact. Runs:
`q1-runs/regrade-v2.7.1-2026-10-27/` (current headline). Slide 18 caption now says v2.7.1.
Still to do: commit the scorer; rebuild CodeGraph at the pinned commit before the hot-started graph is scored.

## 2026-10-27 (final) — Evaluation design frozen at v2.7.1
A follow-up independent review verified the v2.7.1 fixes, checksums and archived scorer, and recommended keeping
v2.7.1. Decision: **no further changes to the evaluation design** unless another reproducible defect appears.
The next evidence comes from correctly built candidates and agent runs, not from raising reference coverage.
Corrections to the entry above (frozen files unchanged; addendum in snapshots/v2.7.1/README-v2.7.1.md):
- The count of owner changes by destination was corrected [reference detail omitted].
- Registry detection is structural; resolving `renderEmail("Name")` to its template is a codebase-specific
  resolver, not a general one.
Remaining before final comparisons: commit the scorer and check it against the archived checksum
(`scorer/score_graph.py` in snapshots/v2.7.1/SHA256SUMS); rebuild CodeGraph at the pinned commit; keep the
oracle node-selection / small-node limitation visible wherever F2 is shown; keep one-hop coverage secondary.

## 2026-10-27 — Remaining items closed
- **Scorer committed**: cs-329m `8285228` on branch q1-scorer (not pushed). Its score_graph.py, README and tests
  match the checksums in snapshots/v2.7.1/SHA256SUMS.
- **CodeGraph at the pinned commit**: Renaldo's rebuild (codegraph-baseline @ 1bdaa2e, declares 54343aa) scored
  with the pinned scorer against v2.7.1 in `q1-runs/codegraph-booking-54343aa-2026-10-27/`. Every number is
  identical to the 6bfe2df build; the commit check now passes. This is the structural seed, not the hot-started
  graph. Use these inputs from now on.
- Slide 18 is current (v2.7.1 caption; the oracle-selection/small-node caveat and one-hop coverage are in the notes).
Next: score the hot-started graph with the same scorer and reference when it exists.

## 2026-10-29 — Hot-started graph scored; Q1 compares builders on the same model
What was scored: Renaldo's hot-started builder (codegraph-baseline @ 462cd12), three fresh runs published by Nathan
(branch test-results/codegraph-hotstart-astra-medium-2026-10-29 @ 1b3eca6, PR #6): gpt-6-astra, medium effort,
target 54343aa. The model assigns CodeGraph's 11,525 symbols to about 34 components and names them; the host
derives every component edge from static dependencies, so the model never writes an edge. Scored with the pinned
scorer (checksum verified) against v2.7.1, same tasks and schema as before.
Decisions:
1. **The Q1 headline comparison is same-model**: Nathan's three Astra LLM-only runs (test-results/astra-medium-2026-10-26
   @ 8d33023, scored for the first time today) against the three hot-started runs. The Codex LLM-only graph stays as
   its own column. Report the range over runs, never one chosen run.
2. **Strict edge recall is shown next to tolerant recall** wherever hot-started edges are reported. Hot-started
   components merge 2-4 reference nodes each (12-13 such merges per run), and tolerant matching credits every
   reference pair they span, so tolerant recall alone overstates edge recovery.
3. **Hot-started edge precision is reported as a bound** (decided 1.00, lower bound 0.29-0.32). 122-148 pairs per
   run (about 210 distinct) await review. Not adjudicated for the slides; reviewing them is an open choice.

| 19 booking PRs, macro | LLM-only Codex (1) | LLM-only Astra (3) | Hot-started Astra (3) | Reference |
|---|---|---|---|---|
| Edge recall tolerant / strict | 0.20 / 0.12 | 0.13-0.16 / 0.10-0.12 | 0.30-0.31 / 0.10-0.11 | 1.00 |
| Edge precision (lower bound) | 1.00 (0.93) | 1.00 (0.90-1.00) | 1.00 (0.29-0.32) | 1.00 |
| Route/API edge recall | 0.39 | 0.26-0.35 | 0.35-0.39 | 1.00 |
| File grouping F1 / coverage | 0.54 / 0.13 | 0.34-0.45 / 0.07 | 0.58-0.60 / 0.81 | 1.00 |
| PRs with a changed file found | 16 of 19 | 12-14 of 19 | 18 of 19 | 19 of 19 |
| Booking-only / all-files recall | 0.57 / 0.32 | 0.40-0.47 / 0.23-0.27 | 0.90 / 0.58 | 0.95 / 0.60 |
| All files F2 (precision) | 0.28 (0.47) | 0.24-0.26 (0.69-0.81) | 0.17-0.18 (0.06) | 0.16 (0.07) |

Reading: hot-starting helps grouping and coverage, not edges. Strict edge recall and route/API edges do not improve,
as expected when every edge comes from static analysis. Its file coverage equals the CodeGraph seed's, so localization
recall is the seed's; components are large, so precision is low. Hot-started runs agree closely; LLM-only runs vary
more. The Codex LLM-only graph beats all three Astra LLM-only runs on every metric except strict edge recall, so the
builder model matters too.
Runs: `q1-runs/hotstart-astra-2026-10-29/` (README; inputs include all seven candidates plus CodeGraph lean/full).
Recorded in: slide 18 (rebuilt table, title, caption, notes), slide 17 status lines, this file, the cs329m Project docs.
Open: review the ~210 pending hot-started pairs or keep the bound; choose the builder for Q2 and Q3.

## 2026-10-29 (later) — Codex out of the slide table; route edges under strict matching; pending-pair review started
1. **Codex LLM-only graph removed from slide 18's table** (supersedes decision 1 above, which kept it as a column).
   It was one interactive run with human follow-ups, an unrecorded model, and the proposal's example graph in view,
   so it differs from the Astra runs in more than the build method. It stays in the speaker notes as one sentence:
   it scored higher than all three Astra LLM-only runs on most metrics, so builder setup matters too.
2. **Route/API edges flip under strict matching**: tolerant recall favours hot-start (0.35-0.39 vs 0.26-0.35), strict
   favours LLM-only (0.22-0.30 vs 0.17-0.22). The slide row is now labelled "tolerant" and the notes give both.
3. **Pending-pair review**: all pending pairs from all seven candidates (213; 210 from hot-start, 3 from LLM-only)
   pooled with 10 reference edges as known-true controls, shuffled, and stripped of which graph proposed each.
   Package and key: `q1-runs/hotstart-astra-2026-10-29/review/` (`PROMPT.md`, `pairs.json`; `KEY-do-not-share.json`
   maps ids to controls and proposers and is not given to the reviewer). Reviewer: a fresh Claude agent, not a GPT/Astra
   model, working against a clean checkout at 54343aa. Verdicts must cite code owned by the source node; type-only
   imports and leads in third-node files do not count. Before use: check the controls, hand-check a random 20, then
   freeze as a new snapshot (v2.7.1 + adjudications) and rescore every candidate.

## 2026-10-29 (final) — Reference v2.7.2: review verdicts adopted, webhook ownership fixed; slide 18 has real edge precision
Jo approved the blind review and asked for any needed reference fixes.
1. **Review adopted.** 213 pending pairs from all seven candidates, reviewed blind (proposer hidden) by a fresh Claude
   agent, with 10 known-true reference edges mixed in: all 10 came back true. Verdicts: 5 true, 206 false, 2 unsure.
   The 5 new true pairs were added to the adjudications [reference detail omitted]. Most false pairs had no lead in the source node's own code, or
   rested on type-only imports.
2. **Webhook ownership fixed (reproducible defect, found by the reviewer).** The webhook task consumer's pipeline is
   wired through a DI container that import tracing cannot see. v2.7.1 assigned the consumer and its dependencies
   inconsistently with the reference's own edges. New builder rule, following the existing "DI wiring belongs to the
   service it builds": 9 owner changes and 1 new edge [reference detail omitted]. The two unsure pairs are false under
   this ownership.
3. **Frozen** as `booking-reference-output/snapshots/v2.7.2/` (checksummed; scorer byte-identical to v2.7.1; README
   explains every change). The booking-only task file is unchanged (same file universe).
4. **Results** (19 booking PRs, macro; Astra, three runs each): edge precision tolerant / strict, LLM-only 0.90-1.00 /
   0.96-1.00, hot-start 0.33-0.38 / 0.39-0.46. Edge recall tolerant 0.13-0.15 vs 0.32-0.33; strict 0.10-0.12 vs 0.12-0.14
   (hot-start's strict recall rose from 0.10-0.11 with the ownership fix). Route/API recall tolerant 0.24-0.32 vs
   0.36-0.44, strict 0.20-0.28 vs 0.16-0.24. Grouping, coverage, localization and the reference baseline are unchanged at
   two decimals. Headline reading unchanged: hot-starting helps grouping and coverage, not edges.
Runs: `q1-runs/hotstart-astra-2026-10-29/out/v2.7.2.booking/` and `.booking.in-subsystem/` (current headline).
Recorded in: slide 18 (table, caption, notes), this file, the cs329m Project docs.
Known issues left: other DI containers were not audited; questions.json does not include the new edges.

## 2026-10-30 — Other DI containers checked; nothing to fix
Scanned all 147 DI files in the repo at 54343aa for bindings to files the ownership builder marked "not reached".
Besides the webhook files fixed in v2.7.2, only 4 match, and they are used only by code outside
the booking scope, so their current owner is right [reference detail omitted]. v2.7.2 stands; this closes the
"other DI containers were not audited" known issue (the frozen snapshot README still lists it).

## 2026-11-02 — Q2/Q3 prep: specs v2, test helpers hidden, regression set proposed
Follow-up to `sunday-prep-2026-11-01/` (leak check, specs review, tags, cost, scope, score_new.sh). All new tooling is
in `q2q3-tools/` (no reference material; fit for a team-repo PR).
1. **Spec generator v2.** `make_spec.py` now uses the TypeScript parser (`ts_exports.js`) and prints signatures only:
   no bodies, initializers or default values. This fixes the two v1 defects behind the leaks: arrow-function exports
   lost their signature, and method regexes copied code from inside bodies (#24324 access rules, #20646 lifecycle
   code, #19626 the month-skip fix itself). On all 20 tasks it selects the same items as v1, minus three intended
   removals.
2. **Specs final for the 20 tasks** (`q2q3-tools/specs-final/`): v2 output plus 8 hand edits, each logged in
   `HAND-EDITS.md`. #24207, #24324 and #25315 keep the pilot's hand versions. #24465's spec is empty on purpose.
   Checks: none of the hidden tests' message strings appear, and no code bodies appear. Asserted messages and branch
   order stay out of every spec. A teammate should skim the hand edits before freezing.
3. **Test helpers ship with the hidden tests** (`task_overrides.json`): #19997 `testUtils.ts`, #20646
   `windowMatchMedia.ts`, #30354 `__mocks__/googleapis.ts`. They are left out of specs and of file recall/precision.
   Harness v2 gold checks: 0/11 → 11/11, 0/22 → 22/22 and 0/30 → 30/30 (base → gold).
4. **Regression set: proposal for the team** (`REGRESSION.md`). Only 7 of 20 tasks have PASS_TO_PASS tests.
   Proposal: the full unit suite against a two-run baseline at each base commit.
   - Measured at #24207's base: no flaky tests, ~6 min per run on a 2-core box (Cal.com measured ~95 s on an M-series
     Mac).
   - The gold patch broke 0 baseline tests.
   - `vitest related` crashes on Cal.com, so it isn't an option.
   - Whole study: 360 suite runs ≈ 36 h on the cloud box or ~9.5 h on a Mac, with no API cost.
5. **Scoring setup for Andres's graphs.** Drop them in `q1-runs/incoming/` (README there). score_new.sh reproduces
   hotstart-01's score.json byte for byte when the scorer's Python dependencies come from `~/.pylib-329m`.
Still for the team: agent model and price; whole-repo vs booking-only graphs; builder choice; code excerpts in graph
text; spec in all conditions; regression set A vs B.

## 2026-11-02 (later) — Interface rule for specs; specs ready to freeze
An independent review of the hand edits found that the specs missed things the hidden tests depend on (test ids,
spied and injected members, zod and return fields, env and flag names) and that one hand edit gave away an
asserted default (#25313 `"S256"`, removed). Jo set the rule:
- **Interface (in the spec):** anything a hidden test calls, constructs, imports, spies on, injects, sets or looks
  up by name: paths, exports, signatures, types, enum members, schema/zod/return field names, test ids and the DOM
  attributes the tests set, env var names, flag keys, i18n keys, mocked modules and the members their mocks define.
- **Behaviour (out):** anything a test compares a result against: messages, asserted values and literals, branch
  logic, call order, expected call arguments, code bodies.
Applied through generator v3 (changed signatures, Prisma additions, `export {}` clauses, mock-factory parsing) and
documented hand edits in `q2q3-tools/apply_hand_edits.py`. Four independent reviews; the last two found no
behaviour leaks, and every remaining gap is fixed (`q2q3-tools/SPEC-REVIEW-2026-11-02.md`). Deliberately left out:
asserted messages and expected call arguments, and #20646's `768px` breakpoint (the tests assert 768 vs 800). These
cost tests equally in every condition; the primary metric stays the fraction of tests passed.
Note: some of #24324's pilot failures (4/13 with a spec) came from spec gaps (`reportedCount`,
`skipCancellationReasonValidation`), not only from behaviour.

## 2026-11-04 — PR #9 hot-start scored: no change from the October hot-start runs
What was scored: one run of Andres's reworked hot-start pipeline (PR #9: the model may retype or consolidate the
host's static edges, never add, delete or re-point them), run by Nathan (runner c66eff7, gpt-6-astra medium, Pi 1.4.0,
target 54343aa, settings checked against the Oct 29 runs; 33 nodes, 295 edges; 12 edge operations applied to 307
host edges; 5.5 min, ~1.7M tokens, ~$3.07). Archive checksums verified. Scored with the pinned v2.7.2 scorer and
reference via score_new.sh; the nine existing candidates reproduce the published comparison exactly.
Inputs: `q1-runs/incoming/pr9-astra-medium-2026-11-04/`. Outputs: `sunday-prep-2026-11-01/06-score-new/runs/hotstart-pr9-astra-01/`.

| 19 booking PRs, macro | PR #9 hot-start (1 run) | Oct hot-start (3) | Astra LLM-only (3) |
|---|---|---|---|
| Edge P decided, tolerant (bounds) | 0.34 (0.30-0.41) | 0.33-0.38 | 0.90-1.00 |
| Edge P decided, strict | 0.43 | 0.39-0.46 | 0.96-1.00 |
| Edge recall tolerant / strict | 0.32 / 0.14 | 0.32-0.33 / 0.12-0.14 | 0.13-0.16 / 0.10-0.12 |
| Edge kind agreement, tolerant | 0.72 | 0.69-0.75 | 0.93-1.00 |
| Route/API edge F1, tolerant | 0.22 | 0.23-0.24 | 0.39-0.49 |
| File grouping F1 / coverage | 0.59 / 0.81 | 0.58-0.60 / 0.81 | 0.34-0.45 / 0.07 |
| All-files recall / F2 | 0.58 / 0.17 | 0.58 / 0.17-0.18 | 0.23-0.27 / 0.24-0.26 |

Reading: every metric falls inside the October hot-start range (route/API F1 just under it). With 12 operations on
307 edges the rework cannot move edge precision much, and retyping did not raise kind agreement. Localization and
coverage are the CodeGraph seed's, as before. One run only, so this is "no detectable change", not "no change".
Pending pairs: 22 (19 edges) not covered by the 213 adjudications. A blind-review bundle (with 10 controls) is in the
outputs folder, but it is not needed for the conclusion: even if all 22 were true, tolerant precision (0.41) stays far
below LLM-only. Not reviewed; reported as bounds.
Not on slide 18 yet (the slide compares three runs per builder).
Still open for the team: which builder for Q2/Q3. On these numbers the old and PR #9 hot-start pipelines are
equivalent, so the choice is cost and convenience.

## 2026-11-11 — Sonnet 5.5 fresh graphs (Andres) scored: hot-start edge precision up, LLM-only sparse
What was scored: the two graphs Andres sent for grading, from Ravdrew/cs-329m `agent-runner` @ da65a61:
`booking-llm-only-sonnet55-2026-11-11-fresh.yaml` (30 nodes, 38 edges) and `booking-hotstart-sonnet55-2026-11-11-fresh.yaml`
(PR #9 at 5c4c6af, required policy: 48 nodes, 148 edges kept of 259 host edges, 111 dropped). claude-sonnet-5-5 medium via
Pi, target 54343aa, one run each. Checked first: both pass `npm run validate`, counts match Andres's table, all 773 recorded
file checksums and 240 code excerpts match 54343aa. Scored with the pinned v2.7.2 scorer and reference (the score_new.sh
steps, run one variant at a time); the nine existing candidates reproduce the published tables exactly.
Inputs: `q1-runs/incoming/sonnet55-fresh-2026-11-11/`. Outputs: `sunday-prep-2026-11-01/06-score-new/runs/sonnet55-*-fresh-01/`.

| 19 booking PRs, macro | Sonnet LLM-only (1) | Sonnet hot-start (1) | Oct hot-start Astra (3) | Astra LLM-only (3) |
|---|---|---|---|---|
| Edge P decided, tolerant (bounds) | 1.00 | 0.59 (0.56-0.60) | 0.33-0.38 | 0.90-1.00 |
| Edge P decided, strict | 1.00 | 0.71 | 0.39-0.46 | 0.96-1.00 |
| Edge recall tolerant / strict | 0.10 / 0.09 | 0.38 / 0.15 | 0.32-0.33 / 0.12-0.14 | 0.13-0.16 / 0.10-0.12 |
| Edge kind agreement, tolerant | 0.90 | 0.85 | 0.69-0.75 | 0.93-1.00 |
| Route/API edge F1, tolerant | 0.21 | 0.19 | 0.23-0.24 | 0.39-0.49 |
| File grouping F1 / coverage | 0.31 / 0.07 | 0.43 / 0.81 | 0.58-0.60 / 0.81 | 0.34-0.45 / 0.07 |
| Booking-only / all-files recall | 0.26 / 0.17 | 0.90 / 0.58 | 0.90 / 0.58 | 0.40-0.47 / 0.23-0.27 |
| All-files F2 (precision) | 0.17 (0.90) | 0.22 (0.09) | 0.17-0.18 (0.06) | 0.24-0.26 (0.69-0.81) |

Reading: the Sonnet hot-start graph has far fewer false edges than any earlier hot-start graph (tolerant precision
0.59 vs 0.33-0.38; false share down from about two thirds to about two fifths) without losing edge recall, and kind
agreement rises; precision is still well below LLM-only. Grouping F1 falls (0.43; 11 merges) and route/API F1 is the
lowest of any candidate. Coverage and localization recall are the CodeGraph seed's, as before. The Sonnet LLM-only
graph has lower edge recall, localization recall and grouping F1 than the Astra LLM-only runs (node recall is the
same); 4 of its edge citations point at blank lines (coherence still passes). Model and drop policy both changed and
these are single runs, so the gain cannot yet be credited to the policy alone; an Astra run of the same policy would
separate them.
Pending pairs: 7 (5 edges) not covered by the 213 adjudications; blind-review bundle with 10 controls in the hot-start
output folder. Not reviewed; the bounds are tight (0.56-0.60), so it does not change the reading. (The Q1 presentation is already submitted; slides are no longer updated.)

## 2026-11-12 — Sonnet 5.5 runs 2 and 3 scored: three runs per builder confirm the 11-11 reading
What was scored: runs 2 and 3 of both Sonnet builders, from `agent-runner` @ ee0fc49 (run 1 is the 11-11 "fresh" pair,
renamed, byte-identical). LLM-only 23/26 and 31/42 nodes/edges; hot-start (PR #9 at 5c4c6af) 54/136 of 310 host edges
and 46/122 of 265. All four pass `npm run validate`; every recorded file checksum and code excerpt matches 54343aa.
Same pinned v2.7.2 scorer and reference; existing tables reproduced exactly each time.
Outputs: `sunday-prep-2026-11-01/06-score-new/runs/sonnet55-{llm-only,hotstart}-{fresh-01,02,03}/`.

| 19 booking PRs, macro (range over 3 runs) | Sonnet LLM-only | Sonnet hot-start | Oct hot-start Astra | Astra LLM-only |
|---|---|---|---|---|
| Edge P decided, tolerant (bounds) | 1.00 | 0.59-0.67 (0.55-0.69) | 0.33-0.38 | 0.90-1.00 |
| Edge P decided, strict | 1.00 | 0.71-0.76 | 0.39-0.46 | 0.96-1.00 |
| Edge recall tolerant / strict | 0.07-0.13 / 0.06-0.12 | 0.34-0.38 / 0.11-0.15 | 0.32-0.33 / 0.12-0.14 | 0.13-0.16 / 0.10-0.12 |
| PRs with a changed file found | 9-10 of 19 | 18 of 19 | 18 of 19 | 12-14 of 19 |
| Edge kind agreement, tolerant | 0.90-1.00 | 0.85-0.89 | 0.69-0.75 | 0.93-1.00 |
| Route/API edge F1, tolerant | 0.21 | 0.16-0.24 | 0.23-0.24 | 0.39-0.49 |
| File grouping F1 / coverage | 0.31-0.52 / 0.06-0.07 | 0.43-0.46 / 0.81 | 0.58-0.60 / 0.81 | 0.34-0.45 / 0.07 |
| Booking-only / all-files recall | 0.26-0.27 / 0.16-0.18 | 0.90 / 0.58 | 0.90 / 0.58 | 0.40-0.47 / 0.23-0.27 |
| All-files F2 (precision) | 0.15-0.17 (0.70-0.90) | 0.22-0.26 (0.09-0.14) | 0.17-0.18 (0.06) | 0.24-0.26 (0.69-0.81) |

Reading: the 11-11 single-run reading holds over three runs. Within Sonnet, hot-start has much higher edge recall,
coverage, localization recall and F2; LLM-only keeps perfect edge precision and higher localization precision, and the
two overlap on grouping and route/API F1. Sonnet hot-start edge precision (0.59-0.67) is well above every earlier
hot-start but still below LLM-only. Caveat (included in the reply to the team): "PRs with a changed file found" uses oracle node
selection and big graphs pass it almost automatically, so Q1 cannot show which graph helps agents; Q2/Q3 can.
Pending pairs: 17 and 8 for runs 2 and 3 (bundles in their output folders); not reviewed, bounds tight.
Team question raised (Andres): keeping hot-start graphs in sync as code changes. Proposed answer in the reply: rerun CodeGraph,
diff the static graph, and have the LLM handle only new/moved/deleted symbols and new edges, keeping node ids stable.
Not a Q2/Q3 issue (all graphs are pinned at 54343aa); for the writeup.

## 2026-11-18 — v2-prompt Sonnet graphs (Andres, `prompt-proposals`) scored: LLM-only improves, hot-start still covers far more
What was scored: one run of each builder from Ravdrew/cs-329m `prompt-proposals` @ 4df2a81: both runners now send the same
`tools/prompts/shared-core.md` (same scope text, same "good graph" guidance) plus a short per-condition section; LLM-only
enforces the hot-start group rule; hot-start drops need a category, and reads/writes edges can be dropped only as
mis-resolved with a code site. LLM-only 38/77/8 nodes/edges/groups; hot-start 47/173/9 (85 dropped). claude-sonnet-5-5
medium, target 54343aa. Both pass `npm run validate`. Same pinned v2.7.2 scorer and reference (checksums verified); the nine
existing candidates reproduce the published tables exactly.
Inputs: `q1-runs/incoming/sonnet55-v2-2026-11-18/`. Outputs: `sunday-prep-2026-11-01/06-score-new/runs/sonnet55v2-{llm-only,hotstart}-01/`.

| 19 booking PRs, macro | v2 LLM-only (1) | Nov 11 LLM-only (3) | v2 hot-start (1) | Nov 11 hot-start (3) |
|---|---|---|---|---|
| Edge P decided, tolerant (bounds) | 0.97 (0.94-0.97) | 1.00 | 0.66 (0.56-0.71) | 0.59-0.67 |
| Edge P decided, strict | 0.97 | 1.00 | 0.69 | 0.71-0.76 |
| Edge recall tolerant / strict | 0.16 / 0.14 | 0.07-0.13 / 0.06-0.12 | 0.33 / 0.14 | 0.34-0.38 / 0.11-0.15 |
| Edge kind agreement, tolerant | 1.00 | 0.90-1.00 | 0.88 | 0.85-0.89 |
| Route/API edge F1, tolerant | 0.15 | 0.21 | 0.26 | 0.16-0.24 |
| Node recall | 0.42 | 0.30-0.42 | 0.70 | 0.66 |
| File grouping F1 / coverage | 0.59 / 0.10 | 0.31-0.52 / 0.06-0.07 | 0.64 / 0.81 | 0.43-0.46 / 0.81 |
| PRs with a changed file found | 14 of 19 | 9-10 of 19 | 18 of 19 | 18 of 19 |
| Booking-only / all-files recall | 0.46 / 0.25 | 0.26-0.27 / 0.16-0.18 | 0.90 / 0.58 | 0.90 / 0.58 |
| All-files F2 (precision) | 0.25 (0.64) | 0.15-0.17 (0.70-0.90) | 0.22 (0.10) | 0.22-0.26 (0.09-0.14) |
| "Has" questions | 0.21 | 0.12-0.18 | 0.40 | 0.40-0.43 |

Reading: the v2 prompt clearly helps LLM-only: edge recall, grouping, coverage and localization recall all rise
(all-files recall 0.16-0.18 -> 0.25, 14 of 19 PRs hit), edge precision stays near 1.00, and email/webhook side effects now
appear. Route/API F1 falls to the lowest of any candidate. Hot-start is unchanged within its range on edges and localization;
grouping F1 rises (0.43-0.46 -> 0.64). Head to head under v2: LLM-only wins edge precision, kind agreement, localization
precision and F2; hot-start wins node recall, route/API F1, grouping, coverage (0.81 vs 0.10), localization recall (0.58 vs
0.25; booking-only 0.90 vs 0.46) and "has" questions. Strict edge recall is a tie (0.14 each): hot-start's tolerant-recall
lead comes from merged components. So "LLM-only now has better coverage" holds against its own earlier runs, not against
hot-start. Caveats: one run each (Sonnet LLM-only varied widely before); F2 favours small nodes (oracle node selection);
the shared prompt now gives LLM-only the scope text, so its gain is partly the prompt, not the builder. Readability is not
measured in Q1.
Pending pairs: 1 (LLM-only) and 17 (hot-start), not covered by the 213 adjudications; blind-review bundles with 10 controls
in each output folder. Not reviewed; bounds as shown. Restoring dropped edges (`scoring/with_dropped.py`) not yet scored.
Still open: runs 2 and 3 of both v2 builders before choosing a builder for Q2/Q3.

## 2026-11-26 — Hidden tests: spec clarifications rejected, three-tier scoring, second review resolved
Context: Andres's fairness audit (`q2q3-tools/TEST-FAIRNESS.md`, 2026-11-25) labelled all 366 FAIL_TO_PASS tests and
drafted 16 spec sentences for the 44 "ambiguous convention" tests, pending Jo's agreement because they change the
2026-11-02 interface rule. Decisions (Jo):
1. **Interface rule kept; all 16 clarifications rejected.** Most stated asserted values or call arguments (#24880
   defaults 80/8/60 and layout formula, #27088 call arguments, #24324 findMany arguments, #27378 log fields). #25313's
   sentence cites RFC 6749 but the `grant_type` test expects `invalid_request` where the RFC says
   `unsupported_grant_type`, and its `S256` default (RFC 7636 says `plain`) is the hint removed on 2026-11-02.
   An unanchored reviewer agent, given the options without a recommendation, reached the same conclusion. The rule was
   set by Jo on 2026-11-02 and never formally agreed by the team; it goes to the group for objections.
2. **Three-tier scoring replaces "remove ambiguous tests".** Fair (tier 1, competence check), underdetermined
   (tier 2, all ambiguous tests: where intent or graph can add information) and the full F2P score, reported for every
   run. Only `unfair` tests are excluded. Reason: removing ambiguous-behavior tests would remove exactly the tests where a
   condition effect can show. Condition material (graph edits, intents) must be written blind to the hidden tests.
   This changes the 2026-11-02 note that "the primary metric stays the fraction of tests passed".
3. **Blind second review** of the 11 subagent-labelled PRs with non-fair labels (252 tests; fresh Claude agents without
   the first labels): same label 203/252; same keep/remove 225/252; first-review "convention" labels confirmed for only
   14 of 37. Jo decided 31 disagreements one by one, mostly kept vs excluded (`OVERRIDES` in
   `q2q3-tools/fairness/resolve_second_review.py`, each with a reason); tests fair in only one review go to tier 2.
   Checked by hand: #26217 invite-path tests need an unmentioned change at base `selfHostedHandler.ts:115` (excluded).
Result: 366 tests = 237 fair + 74 underdetermined + 55 excluded; 311 scored (the 2026-11-25 plan had 290).
Branch `fairness-second-review` (local; not pushed). Still open: harness reports the three scores; tag the frozen
labels before any experiment run; task selection.
