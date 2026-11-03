# q2q3-tools

Tooling for the Q2/Q3 agent runs: a harness that runs a coding agent on a benchmark task and grades it with the PR's
own hidden tests, plus the interface specs every agent gets. Nothing here comes from the booking reference graph
(no graph, ownership, adjudications or Q1 scores). The decisions behind it are summarized in
`HAND-EDITS.md` (spec rule) and `REGRESSION.md` (regression proposal).

| File | What it is |
|---|---|
| `harness.py` | One task at a time: `prepare` (check out the base commit, install, hide git history), `check` (gold patch passes, base fails), `baseline` (full unit suite twice at base), `evaluate LABEL [--regress]` (record the agent's diff, add the hidden tests, score tests and files), `restore`. |
| `task_overrides.json` | Test helper files that ship with the hidden tests (#19997, #20646, #30354). |
| `gold_regress.py` | Sanity check for the regression metric: the real PR should break no baseline test. |
| `make_spec.py` + `ts_exports.js` | Interface-spec generator. It uses the TypeScript parser, prints signatures only, and covers changed signatures, Prisma additions and the members the tests' mocks define. |
| `apply_hand_edits.py` | Builds `specs-final/` from `specs-generated-v3/` plus `pilot-specs/` and every hand edit, each with its reason. |
| `specs-final/` | **The 20 specs to give agents.** They passed four independent reviews (`SPEC-REVIEW-2026-11-02.md`). |
| `specs-generated-v3/` | Raw generator output (`.md` plus `.json` summaries). |
| `pilot-specs/` | The pilot's hand-finished specs for #24207, #24324 and #25315. |
| `HAND-EDITS.md` | The interface/behaviour rule, every hand edit, and what is left out on purpose. |
| `SPEC-REVIEW-2026-11-02.md` | The four reviews and what each one changed. |
| `REGRESSION.md` | Proposed regression check (full unit suite against a per-task baseline), with measured times. |
| `results/` | Gold checks for the three tasks with test helpers, and the gold-patch regression check for #24207. |
| `env/` | `env.sh` and the Yarn shim used on the cloud box (Node 20, bundled Yarn, Prisma engine workarounds). |

## Running
The defaults point at the cloud box layout. Override them with these env vars:
- `BENCH_TASKS`: the task list (default `../benchmark/tasks.json`, from the benchmark branch);
- `CALCOM_DIR`: a Cal.com clone with full history, for `make_spec.py`;
- `PILOT_DIR`: the folder holding `calcom/` and `env.sh`, for the harness;
- `PILOT_PRIVATE`: where hidden history and results go (default `/root/pilot-private`);
- `TS_PATH`: the `typescript` package `ts_exports.js` loads (default: Cal.com's).

```
python3 make_spec.py --out specs-generated-v3 19626 19997 ...    # then
python3 apply_hand_edits.py                                       # -> specs-final/
python3 harness.py prepare 19997 && python3 harness.py check 19997
python3 harness.py baseline 19997                                  # optional, for --regress
python3 harness.py evaluate 19997 LABEL [--regress]
python3 harness.py restore 19997
```
Regenerating is deterministic: the same inputs give byte-identical specs.

## Checks run (2026-11-02)
- **Specs:**
  - no hidden-test message string of 10 or more characters appears in any spec;
  - no code bodies;
  - no test or test-helper file is named.
- **Gold checks with the helpers shipped as hidden** (base → gold): #19997 0/11 → 11/11, #20646 0/22 → 22/22,
  #30354 0/30 → 30/30. On the 3 pilot tasks, harness v2 reproduces the pilot's task definitions.
- **Regression check at #24207's base:**
  - three full-suite runs gave identical passing sets;
  - each run took ~6 min on 2 cores;
  - the gold patch broke 0 of 3,326 baseline tests.

## Environment notes
- `env/yarn` handles Yarn 4's renamed CA setting (#30354's base ships Yarn 4).
- `prepare` turns off git auto-gc and waits for any running gc before it moves `.git` aside. A background gc once
  wiped a clone mid-move.
