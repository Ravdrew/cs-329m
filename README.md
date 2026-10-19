# Graphical Representations of Codebases for Intent Legibility

CS 329M (Machine Programming) project, Fall 2026: Andres Garcia, Nathan Cho, Renaldo Venegas, Joseph Bailey.

We build a component-level graph of a real TypeScript app (starting with [Cal.com](https://github.com/calcom/cal.com)), let developers express intent by editing the graph, and measure whether that helps coding agents and people compared with prose alone.

## Layout

```
targets/calcom.env       pinned Cal.com commit and Node version
scripts/                 setup and test scripts for target apps
results/baselines/       committed test baselines at the pinned commit
results/runs/            raw test runs (git-ignored)
work/                    target app checkouts and local database data (git-ignored)
```

## Prerequisites

- git and bash. **Windows: use WSL2 (Ubuntu)**; Cal.com's scripts don't run in PowerShell or cmd.
- Node 20, which Cal.com's CI uses. With [nvm](https://github.com/nvm-sh/nvm): `nvm install 20 && nvm use` (this repo has an `.nvmrc`).
- About 10 GB free disk for one Cal.com checkout with dependencies.
- For the database-backed tests only: [Docker Desktop](https://www.docker.com/products/docker-desktop/), or Postgres and Redis installed locally (macOS: `brew install postgresql@18 redis`).

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

### Database-backed tests

Some tests need a real database: Cal.com's integration tests (`*.integration-test.ts`, Vitest) and the API v2 end-to-end tests (`apps/api/v2/**/*.e2e-spec.ts`, Jest, which also need Redis). Several candidate PRs, such as new API endpoints, are only covered by these.

```bash
scripts/db.sh up                                   # start Postgres (port 5450) and Redis, migrate and seed
scripts/run_calcom_tests.sh --mode integration     # all integration tests
scripts/run_calcom_tests.sh --mode api-e2e apps/api/v2/src/platform/bookings/2024-08-13/controllers/e2e/seated-bookings.e2e-spec.ts
scripts/db.sh down                                 # stop them when you're done
```

`db.sh` uses Docker when its daemon is running and otherwise the Postgres and Redis installed on your machine (`DB_BACKEND=docker|native` forces one). Ports and credentials match Cal.com's own defaults, so nothing goes in a `.env` file.

The first `up` for a Cal.com commit applies the migrations, runs Cal.com's seed script (test users such as `free`/`free` and `pro`/`pro`), and saves a snapshot in `work/db/snapshots/`. Every database-backed test run then restores that snapshot first, so each run starts from the same state no matter what earlier runs wrote; `--no-reset` skips this. The first `api-e2e` run also builds the platform packages the API imports, once per commit.

`scripts/db.sh status` shows what's running, and `scripts/db.sh nuke` deletes the database and snapshots.

**Scope:** we use Cal.com's Vitest unit and integration tests and the API v2 end-to-end tests as graders. We don't run the Playwright browser tests.

## Workflow

Open a pull request for changes; don't push directly to `master`.
