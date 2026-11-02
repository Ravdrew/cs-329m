# Regression set: proposal (2026-11-02)

**Problem.** Only 7 of the 20 tasks have PASS_TO_PASS tests: #19997 (15), #22024 (6), #24124 (23), #24465 (7),
#25313 (2), #27192 (35) and #30354 (49). For the other 13 we can't tell whether the agent broke anything.

## Options
| Option | What counts as a regression | Cost | Problem |
|---|---|---|---|
| A. PR's own PASS_TO_PASS | one of those tests fails after the agent | free (already run) | 13 of 20 tasks have no check |
| **B. Full unit suite against a per-task baseline (recommended)** | a test that passed on both baseline runs at the base commit fails after the agent (FAIL_TO_PASS excluded) | ~6 min per suite run on a 2-core cloud box; Cal.com's own baseline was ~95 s on an M-series Mac | compute time, not tokens |
| C. `vitest related <changed files>` | tests that import the changed files fail | would be cheap | **does not work on Cal.com.** It crashes resolving the `crypto` package before any test runs (tried at #24207's base). |

## Measured (2026-11-02, cloud box: 2 cores, Node 20, isolation on, TZ=UTC)
- **#24207 base, three full-suite runs:**
  - 382 test files;
  - 0 failures;
  - identical passing sets, so no flaky tests;
  - 350–405 s per run.

  Vitest exited 1 once with every test passing, from a late promise-rejection warning. So the harness reads the JSON
  report and ignores the exit code.
- **Gold patch for #24207:**
  - 0 baseline tests broken;
  - passing count went 3,326 → 3,333, i.e. exactly the 7 FAIL_TO_PASS tests.

  So the metric reads zero for the real PR.

## Cost of B for the whole study
- 20 tasks × 2 baseline runs + 320 agent runs = 360 suite runs.
- That's ~36 h on one 2-core cloud box, or ~9.5 h on a Mac at 95 s per run. It parallelizes across machines.
- It adds no API cost. It can run after the agent finishes, so it never delays the next agent run.

## How to run it
```
python3 harness.py prepare PULL
python3 harness.py baseline PULL           # once per task: 2 suite runs at base
# ... agent works ...
python3 harness.py evaluate PULL LABEL --regress
```
`evaluate --regress` adds `regressions: {baseline_stable_passing, broken, broken_tests}` to the result JSON.

**Team decision:** B as the regression metric (reported as secondary, next to fraction of FAIL_TO_PASS passed), or A
with the 13-task gap stated in the write-up.

## Gold checks with test support files shipped as hidden (harness v2)
| Task | Support file | Pass at base | Pass with gold |
|---|---|---|---|
| #19997 | `form-builder/testUtils.ts` | 0/11 | 11/11 |
| #20646 | `embed-core/test/__mocks__/windowMatchMedia.ts` | 0/22 | 22/22 |
| #30354 | `googlecalendar/lib/__mocks__/googleapis.ts` | 0/30 | 30/30 |

Shipping the helpers doesn't make any test pass on its own: base is still 0 on all three.
