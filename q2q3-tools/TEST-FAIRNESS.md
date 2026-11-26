# Hidden-test fairness (2026-11-25)

Many hidden tests check details that nothing given to the agent determines, so no condition can pass them, and others
turn on coin-flip guesses that look like differences between conditions. In the 5-PR pilot, about 30% of the hidden
tests never passed in any of 8 runs. We labelled every FAIL_TO_PASS test of the 20 tasks, in the spirit of SWE-bench
Verified's "valid solutions rejected by the tests" check, and propose to act on the labels as below.

## Labels

Each test is judged against what **every** condition gets: the PR description, the spec (`specs-final/`) and the code
at the base commit. The intent paragraph is not counted, so the set of fair tests is the same for every condition.

| Label | Meaning | What to do |
|---|---|---|
| `fair` | The checked behavior is stated in the description or spec, or follows from the base code's conventions or the signature | Keep |
| `ambiguous`, kind `convention` | A reasonable reading gives a different valid answer, and the difference is a unit, format, constant or threshold (e.g. prices in dollars vs cents) | **Clarify**: add the one-line `clarification` to the spec, then keep |
| `ambiguous`, kind `behavior` | A reasonable reading gives a different valid answer about what the code should do (e.g. whether the layout follows screen width) | **Remove** from scoring. Stating the behavior in the spec would give every condition what the intent and graph are meant to carry |
| `unfair` | Nothing available determines what the test checks: invented strings or messages, exact style values, an undocumented input format, or an unmentioned fix to an existing bug | **Remove** from scoring |

## Counts

| PR | Tests | Fair | Ambiguous, clarify | Ambiguous behavior, remove | Unfair, remove | Scored after |
|---|---|---|---|---|---|---|
| #19626 | 7 | 6 | 0 | 0 | 1 | 6 |
| #19997 | 11 | 2 | 4 | 0 | 5 | 6 |
| #20646 | 22 | 12 | 3 | 4 | 3 | 15 |
| #22024 | 3 | 2 | 0 | 0 | 1 | 2 |
| #24124 | 52 | 25 | 5 | 12 | 10 | 30 |
| #24207 | 7 | 7 | 0 | 0 | 0 | 7 |
| #24324 | 13 | 3 | 1 | 1 | 8 | 4 |
| #24465 | 7 | 7 | 0 | 0 | 0 | 7 |
| #24880 | 21 | 12 | 7 | 2 | 0 | 19 |
| #25313 | 26 | 10 | 10 | 0 | 6 | 20 |
| #25315 | 8 | 6 | 0 | 0 | 2 | 6 |
| #26039 | 22 | 22 | 0 | 0 | 0 | 22 |
| #26217 | 29 | 20 | 0 | 7 | 2 | 20 |
| #27088 | 14 | 9 | 3 | 2 | 0 | 12 |
| #27192 | 10 | 10 | 0 | 0 | 0 | 10 |
| #27208 | 10 | 5 | 0 | 5 | 0 | 5 |
| #27378 | 24 | 23 | 1 | 0 | 0 | 24 |
| #27405 | 25 | 25 | 0 | 0 | 0 | 25 |
| #27428 | 25 | 22 | 2 | 1 | 0 | 24 |
| #30354 | 30 | 18 | 8 | 3 | 1 | 26 |
| **Total** | **366** | **246** | **44** | **37** | **39** | **290** |

## To do

1. **Remove** the `unfair` and `ambiguous`/`behavior` tests from scoring. Report the full F2P score next to the filtered
   one so the filtering is visible.
2. **Clarify** the `ambiguous`/`convention` tests: add the sentences in `fairness/CLARIFICATIONS-draft.md` to
   `specs-final/`. This changes the Nov 2 spec rule (names only, no behavior), so it needs the team's agreement first;
   `specs-final/` is unchanged until then.
3. **Review the labels.** The first five PRs (#19626, #19997, #20646, #22024, #24207) were labelled by hand and checked
   against replayed failure messages. The other 15 were labelled by Claude subagents and only spot-checked; a second
   reviewer should check their non-fair labels. Borderline cases noted while labelling: #19997 option-editor tests
   (unfair, could be fair), #20646 layout (behavior, could be fair), #22024 rate-limit key (unfair, could be ambiguous),
   #24880 default constants and #25313 error codes (ambiguous, could be unfair), #27428 contentEditable pair (passes
   only via a jsdom quirk), #30354 Google titles test and Office365 `$select` order, #27088 limit-check arguments.

## Files

- `test_fairness.py`: labels and reasons for the first five PRs; run it to write `test_fairness.json`.
- `fairness/<PR>.json`: labels for the other 15, merged in by `test_fairness.py`.
- `test_fairness.json`: every F2P test id, by PR, with `label`, `reason`, and `kind`/`clarification` for ambiguous ones.
- `fairness/CLARIFICATIONS-draft.md`: the proposed spec sentences, by PR.
