# Graphical Representations of Codebases for Intent Legibility

CS 329M (Machine Programming) project, Fall 2026: Andres Garcia, Nathan Cho, Renaldo Venegas, Joseph Bailey.

We build a component-level graph of a real TypeScript app (starting with [Cal.com](https://github.com/calcom/cal.com)), let developers express intent by editing the graph, and measure whether that helps coding agents and people compared with prose alone.

## Layout

```
targets/calcom.env       pinned Cal.com commit and Node version
scripts/                 setup and test scripts for target apps
results/baselines/       committed test baselines at the pinned commit
results/runs/            raw test runs (git-ignored)
work/                    target app checkouts (git-ignored)
```

## Prerequisites

- git and bash. **Windows: use WSL2 (Ubuntu)**; Cal.com's scripts don't run in PowerShell or cmd.
- Node 20, which Cal.com's CI uses. With [nvm](https://github.com/nvm-sh/nvm): `nvm install 20 && nvm use` (this repo has an `.nvmrc`).
- About 10 GB free disk for one Cal.com checkout with dependencies.

You don't need to install Yarn: Cal.com includes its own copy (4.12), and the scripts run it through `corepack`, which comes with Node.

## Cal.com setup

```bash
nvm use
scripts/setup_calcom.sh            # clones into work/calcom at the pinned commit, installs deps
scripts/run_calcom_tests.sh        # full unit suite (TZ=UTC), results in results/runs/
```

To run only some tests, pass the files: `scripts/run_calcom_tests.sh packages/features/bookings/lib/foo.test.ts`.
`--mode timezone` runs the timezone-dependent tests the way Cal.com CI does.
To compare runs and spot flaky tests, use `node scripts/summarize_results.mjs results/runs/*.json`.

To check out a different commit, use `scripts/setup_calcom.sh <sha>`. To put the checkout elsewhere (e.g. `/scratch/users/$USER/calcom` on FarmShare), set `CALCOM_DIR`.

### Baseline at the pinned commit

At `54343aa` on an M-series MacBook Pro (Node 20.20, 2026-10-14), setup took about 3 minutes and used 4.9 GB. The unit suite passed **4,087 tests, failed 0, and skipped 50**, identically on 3 runs (no flaky tests), in about 95 s per run. The timezone suite passed 62. Per-test statuses are in `results/baselines/`.

Note that Cal.com CI runs Vitest with `--no-isolate`. That made about 560 tests fail locally from state leaking between test files, so our script runs with isolation (Vitest's default).

**Scope:** we use Cal.com's Vitest unit tests (and possibly integration tests) as graders. We don't run Playwright end-to-end tests.

## Workflow

Open a pull request for changes; don't push directly to `master`.
