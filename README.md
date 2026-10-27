# Graphical Representations of Codebases for Intent Legibility

CS 329M (Machine Programming) project, Fall 2026: Andres Garcia, Nathan Cho, Renaldo Venegas, Joseph Bailey.

We build a component-level graph of a real TypeScript app (starting with [Cal.com](https://github.com/calcom/cal.com)), let developers express intent by editing the graph, and measure whether that helps coding agents and people compared with prose alone.

## Layout

```
targets/calcom.env       pinned Cal.com commit and Node version
experiments/llm-only/    LLM-only booking graph, provenance and review tools
tools/llm-only/           automated LLM-only construction runner
scripts/                 setup and test scripts for target apps
results/baselines/       committed test baselines at the pinned commit
results/llm-only/        timed graph-generation trials and validation records
results/runs/            raw test runs (git-ignored)
work/                    target app checkouts and local database data (git-ignored)
```

The [LLM-only booking graph](experiments/llm-only/README.md) was built in a separate clean Cal.com checkout at the shared pin. Load [graph.yaml](experiments/llm-only/graph.yaml) in the viewer; it uses the shared format in [schema/graph.schema.json](schema/graph.schema.json). Its 36 components and 62 relationships include source evidence, a Mermaid view and validation tools. Set `CALCOM_DIR` to the pinned checkout to validate, export or render it; graph review does not require Cal.com's dependencies or a database.

For **automated independent construction**, see [tools/llm-only](tools/llm-only/README.md). After installing its dependencies and configuring Pi authentication, run `bash scripts/run_llm_only_graph.sh`. It starts a fresh Pi agent using `openai/gpt-6-astra` with restricted source tools in a separate pinned checkout, validates the shared YAML and evidence, and saves the prediction and run logs outside this repository.

The [three fresh Astra-medium trials from October 26](results/llm-only/astra-medium-2026-10-26/README.md) include frozen graphs, timing and token statistics, source-read transcripts, and replayable validation. All three graphs validated; the harness passed 32 tests. Mean construction time was 8m 23.7s at the same Cal.com pin.

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

`db.sh` uses Docker when its daemon is running and otherwise the Postgres and Redis installed on your machine (`DB_BACKEND=docker|native` forces one). Ports and credentials match Cal.com's own defaults, so nothing goes in a `.env` file. Both backends use port 5450, so stop one (`db.sh down`) before starting the other.

On a Mac without Docker Desktop, [Colima](https://github.com/abiosoft/colima) works:

```bash
brew install colima docker docker-compose
# let `docker compose` find the plugin (only if you have no Docker config yet)
mkdir -p ~/.docker
[ -e ~/.docker/config.json ] || echo '{"cliPluginsExtraDirs":["/opt/homebrew/lib/docker/cli-plugins"]}' > ~/.docker/config.json
colima start --cpu 4 --memory 6
```

If you already have `~/.docker/config.json`, add `"cliPluginsExtraDirs": ["/opt/homebrew/lib/docker/cli-plugins"]` to it by hand instead.

For the native backend instead: `brew install postgresql@18 redis`.

The first `up` for a Cal.com commit applies the migrations, runs Cal.com's seed script (test users such as `free`/`free` and `pro`/`pro`), and saves a snapshot in `work/db/snapshots/`. Every database-backed test run then restores that snapshot first, so each run starts from the same state no matter what earlier runs wrote; `--no-reset` skips this. The first `api-e2e` run also builds the platform packages the API imports, once per commit.

`scripts/db.sh status` shows what's running, and `scripts/db.sh nuke` deletes the database and snapshots.

`--mode api-e2e` runs Jest the way Cal.com CI does in one shard: `CI=true` and 4 workers. With `CI=true`, Cal.com's `test/jest.setup-e2e.ts` retries each failed test up to 2 times, and Jest runs the retries after the rest of the file. So a test can pass in CI only because the file's later tests changed the database. The summarizer lists these tests as "passed only on a retry", and baselines record them under `passedOnRetry`. One differs from CI: the default Jest timeout is raised from 5 s to 30 s, because each file's `beforeAll` boots the whole Nest app, which sometimes took longer than 5 s on a laptop and failed the whole file.

### Database-backed baseline

At `54343aa` on a 10-core M-series MacBook Pro with 16 GB (Node 22.17, Docker via Colima with 4 CPUs and 6 GB, 2026-10-18), each suite run 3 times:

| Suite | Files | Passed | Failed | Skipped | Time per run |
|---|---|---|---|---|---|
| integration | 15 | 114 | 0 | 1 | 7–9 s |
| api-e2e | 42 (2 fully skipped) | 522 | 0 | 30 | 68–78 s |

These runs used Node 22.17, while Cal.com CI and the unit baseline use Node 20, so rerun them on Node 20 before relying on exact counts (`run_calcom_tests.sh` now warns when the Node version differs). Results were identical across the 3 runs (no flaky tests), and they match Cal.com CI's integration job (114 passed, 1 skipped). The 30 skipped api-e2e tests are `.skip`ped in Cal.com's source (calendars, Google Calendar and two others). One-time costs: the first `db.sh up` (migrations and seed) took 67 s with Docker, including pulling the images, and 41 s native. Restoring the snapshot takes 1–2 s. The first `api-e2e` run builds the platform packages in about 85 s.

Tests that passed only on a retry:
- `seated-bookings.e2e-spec.ts` › "should not be able to reschedule seated booking if seatUid is not provided", in every run. It sends an unauthenticated reschedule for a booking that still has seats, and the API answers 500 (`No auth user found`) before it reaches the 400 the test expects. It passes on the retry because by then later tests in the file have moved the seats. Cal.com CI logs show the same 500 followed by a pass. Keep this in mind when grading PRs that touch seated bookings, such as calcom/cal.diy#26786.
- `app.e2e-spec.ts` › rate limiting with multiple limits, and `booking-access-auth.e2e-spec.ts` › organizer can access transcripts, in 1 of 3 runs each.

**Scope:** we use Cal.com's Vitest unit and integration tests and the API v2 end-to-end tests as graders. We don't run the Playwright browser tests.

## Workflow

Open a pull request for changes; don't push directly to `master`.
