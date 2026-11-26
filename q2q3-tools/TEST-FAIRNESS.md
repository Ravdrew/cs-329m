# Hidden-test fairness (2026-11-25, decisions 2026-11-26)

Many hidden tests check details that nothing given to the agent determines, so no condition can pass them, and others
turn on guesses that look like differences between conditions. In the 5-PR pilot, about 30% of the hidden tests never
passed in any of 8 runs. We labelled every FAIL_TO_PASS test of the 20 tasks, in the spirit of SWE-bench Verified's
"valid solutions rejected by the tests" check, and score them in tiers fixed before any experiment run.

## Labels

Each test is judged against what **every** condition gets: the PR description, the spec (`specs-final/`) and the code
at the base commit. The intent paragraph and graph are not counted, so the tiers are the same for every condition.

| Label | Meaning | Tier |
|---|---|---|
| `fair` | The checked behavior is stated in the description or spec, or follows from the base code's conventions or the signature | **fair** (tier 1) |
| `ambiguous` (kind `convention` or `behavior`) | A reasonable reading gives a different valid answer: a unit, format or constant (`convention`), or what the code should do (`behavior`) | **underdetermined** (tier 2) |
| `unfair` | Nothing available determines what the test checks: invented strings or messages, exact style values or constants, an undocumented input format, an unmentioned fix to an existing bug, a test-environment quirk | **excluded** |

## Scoring (decided 2026-11-26, Jo)

Report three scores for every run, each as the fraction of tests passed:

1. **Fair** (tier 1): a competence check. The shared inputs determine these, so conditions should be close.
2. **Underdetermined** (tier 2): the shared inputs leave the answer open, so this is where an intent paragraph or a
   graph edit can add information. This is where a condition effect should show.
3. **Full FAIL_TO_PASS**, all tests including the excluded ones, so the filtering is visible.

`test_fairness.json` gives each test a `tier` (`fair`, `underdetermined`, `excluded`). The tiers are frozen before any
experiment run; tag the commit that freezes them.

**No spec clarifications.** The 16 sentences drafted for the convention tests (`fairness/CLARIFICATIONS-draft.md`) were
rejected on 2026-11-26. Under the 2026-11-02 interface rule, a spec names interfaces only, never asserted values,
messages or call arguments, and most drafts stated asserted values (#24880 defaults, #27088 call arguments), one
contradicted the standard it cited (#25313 RFC 6749, the `grant_type` test expects `invalid_request`), and one restored
the `S256` hint removed on 2026-11-02. Convention tests stay unclarified in tier 2.

**Condition material must be written blind to the hidden tests.** Whoever writes graph edits and intent paragraphs must
not see the hidden tests or the PR diff, or tier 2 measures leakage instead of the graph.

## Counts

| PR | Tests | Fair | Underdetermined | Excluded | Scored (tiers 1+2) |
|---|---|---|---|---|---|
| #19626 | 7 | 6 | 0 | 1 | 6 |
| #19997 | 11 | 2 | 4 | 5 | 6 |
| #20646 | 22 | 12 | 7 | 3 | 19 |
| #22024 | 3 | 2 | 0 | 1 | 2 |
| #24124 | 52 | 23 | 18 | 11 | 41 |
| #24207 | 7 | 7 | 0 | 0 | 7 |
| #24324 | 13 | 1 | 3 | 9 | 4 |
| #24465 | 7 | 7 | 0 | 0 | 7 |
| #24880 | 21 | 11 | 5 | 5 | 16 |
| #25313 | 26 | 10 | 10 | 6 | 20 |
| #25315 | 8 | 6 | 0 | 2 | 6 |
| #26039 | 22 | 22 | 0 | 0 | 22 |
| #26217 | 29 | 20 | 1 | 8 | 21 |
| #27088 | 14 | 6 | 8 | 0 | 14 |
| #27192 | 10 | 10 | 0 | 0 | 10 |
| #27208 | 10 | 5 | 5 | 0 | 10 |
| #27378 | 24 | 23 | 0 | 1 | 23 |
| #27405 | 25 | 25 | 0 | 0 | 25 |
| #27428 | 25 | 22 | 1 | 2 | 23 |
| #30354 | 30 | 17 | 12 | 1 | 29 |
| **Total** | **366** | **237** | **74** | **55** | **311** |

## How the labels were made

- **First labels (2026-11-25).** #19626, #19997, #20646, #22024 and #24207 by hand, checked against replayed failure
  messages (`test_fairness.py`). The other 15 by Claude subagents (`fairness/<PR>.json`), spot-checked.
- **Blind second review (2026-11-25).** The 11 subagent-labelled PRs with any non-fair label (252 tests) were relabelled
  by fresh Claude agents that got the description, spec, base code and tests but not the first labels
  (`fairness/second-review/<PR>.json`). The four subagent PRs with only fair labels (#24465, #26039, #27192, #27405) were
  not re-reviewed.
  - Same label: 203 of 252. Same keep/remove decision under the earlier plan: 225 of 252. The `convention` label was
    the least reliable: of the 37 tests the first review called convention in these PRs, the second review agreed on 14.
- **Resolution (2026-11-26, Jo).** `fairness/resolve_second_review.py` merges the two reviews: agreements stand; 31
  disagreements, mostly between kept and excluded, are decided one by one (`OVERRIDES`, each with its reason); a test that one review calls fair and the other ambiguous goes to tier 2, so tier 1 holds only tests both
  reviews call fair. The script stops on anything unresolved. Each entry keeps `first_review`, `second_review` and a
  `resolution` note. Notable calls: #26217's invite-path tests need an unmentioned change to
  `selfHostedHandler.ts:115` (excluded); #27428's contenteditable tests pass only through a jsdom quirk (excluded);
  #30354's Google test is fair because `__mocks__/googleapis.ts` ships with the hidden tests.

## Rebuild

```sh
cd q2q3-tools
python3 fairness/resolve_second_review.py   # idempotent; reads first_review/second_review
python3 test_fairness.py                     # writes test_fairness.json with tiers and prints the counts
```

## To do

1. **Scoring:** have the harness report the fair, underdetermined and full scores for each run.
2. **Freeze:** once the team agrees, tag the commit (e.g. `fairness-frozen-2026-11-26`) before any experiment run.
3. **Task choice:** drop PRs whose scored tests every condition already passes, or whose tiers can't separate
   conditions (e.g. #24207 has no tier-2 tests).

## Files

- `test_fairness.py`: hand labels for the first five PRs; merges `fairness/<PR>.json`, adds tiers, writes `test_fairness.json`.
- `fairness/<PR>.json`: final labels for the other 15 PRs (with both reviews where re-reviewed).
- `fairness/second-review/<PR>.json`: the blind second review, unchanged.
- `fairness/resolve_second_review.py`: the merge and Jo's decisions on the disagreements.
- `fairness/CLARIFICATIONS-draft.md`: the rejected spec sentences, kept for the record.
- `test_fairness.json`: every F2P test id by PR, with `label`, `reason`, `tier`, and `kind` for ambiguous ones.
