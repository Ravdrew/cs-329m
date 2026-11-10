# Testing the Q2/Q3 runner on a Mac

Four steps, each building on the last: offline tests, a Pi login, a real-model smoke test on a toy task (minutes,
cents), then a real Cal.com pilot on one task (1–2 hours, a few dollars). Stop at the first step that fails and send
its output.

Run everything from the repository root on the `agent-runner` branch.

## 0. Prerequisites (once)

```sh
git fetch origin && git checkout agent-runner
# nvm (https://github.com/nvm-sh/nvm): the runner needs Node 22.19+, Cal.com needs Node 20
nvm install 22 && nvm install 20
nvm use 22                                     # the shell you run the runner from uses Node 22
python3 -m venv ~/q2q3-venv && ~/q2q3-venv/bin/pip install -q pyyaml pytest
npm ci --prefix tools/graph-mcp                # Pi 1.4.0 and the graph server
```

## 1. Offline tests (no model, no Cal.com; about a minute)

```sh
npm test --prefix tools/graph-mcp
PYTHON=~/q2q3-venv/bin/python npm test --prefix tools/agent-runner
~/q2q3-venv/bin/python -m pytest -q q2q3-tools/test_graph_text.py
```

Expect `# pass 14`, then `# pass 10` with **`# skipped 0`** (the two `real harness` tests must run on a Mac; if they
are skipped, `PYTHON` does not point at an interpreter with PyYAML), then `9 passed, 1 skipped`.

The `real harness` tests run the real `q2q3-tools/harness.py` on a toy repository: prepare, run, grade, reset, restore,
and two workers in parallel. They are the first test of the harness on macOS.

## 2. Pi login (once)

```sh
node tools/graph-mcp/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js \
  --no-extensions --no-skills --no-prompt-templates --no-themes --no-context-files --no-session
```

In Pi, type `/login openai`, choose **Sign in with ChatGPT** (or an API key), then quit. This writes
`~/.pi/agent/auth.json`. Never paste a key into a chat or commit it. Alternatively `export OPENAI_API_KEY=...` in the
shell you run from; the runner hands it to Pi and removes it from the agent's environment.

## 3. Smoke test: the real model on a toy task (5–15 minutes, well under $1)

```sh
node tools/agent-runner/pilot/smoke.mjs --python ~/q2q3-venv/bin/python
```

The toy task: a repository with `src/booking.mjs`, and a hidden test that wants a `cancelBooking(id)` export. It runs
`prose`, `text` and `tool` once each, with the real harness, prompt builder, graph server and grading. Expect
`credentials ok`, then one line per condition, and `smoke test passed`. Each run should be `completed` and most likely
`resolved=true` (the task is easy); `tool` should show graph calls. A `limit` (10 minutes, 60 tool calls, $2) is
worth a look but not a failure. The run directories are printed at the end.

## 4. Real Cal.com pilot: one task, three conditions (1–2 hours, a few dollars)

**Read this first.** The agent gets a real shell, running as you. The prompt confines it to the checkout and the audit
flags anything outside it afterwards, but nothing prevents it. For this one supervised pilot, either accept that, or
run step 4 as a separate macOS user (System Settings → Users & Groups) that has its own copy of the repository and
its own Pi login. For the full batch, use the team's cloud box or an isolated machine.

```sh
PYTHON=~/q2q3-venv/bin/python bash tools/agent-runner/pilot/calcom-pilot.sh
```

It clones Cal.com into `~/q2q3-pilot/calcom` (blobless clone; about 5 GB once installed), prepares task **24207**
(bot detection on the booking endpoint; unit tests only, no database), checks that the PR's hidden tests fail at the
base commit and pass with the real PR, then runs `prose`, `text` and `tool` once each (up to 45 minutes and $10 per
run), and restores the checkout's git history at the end, even if interrupted. Run it again to resume;
`SKIP_PREPARE=1 SKIP_CHECK=1` skips the slow setup on a re-run. Settings are at the top of the script.

Note: no per-task edited graphs exist yet, so `text` and `tool` get the **unedited** hot-start graph (the agent is
told there is no requested change). This tests the pipeline on real Cal.com, not the effect of a graph edit.

## What to send back

- Step 1: the three summary lines, or the first failing test's output.
- Step 3: the console output, and for any run that is not `completed`: its `run.json` and the end of its
  `events.jsonl` and `agent.stderr.log`.
- Step 4: the console output (especially the sanity check), `~/q2q3-pilot-runs/summary.csv`, and each
  `~/q2q3-pilot-runs/24207/*-r1/run.json` and `audit.json`. Not `prompt.md` or `events.jsonl` unless asked: they can
  be large.

## Cleanup

```sh
rm -rf ~/q2q3-pilot ~/q2q3-pilot-private ~/q2q3-pilot-runs ~/q2q3-venv
```

The smoke test's files are under the system temp folder (printed at the end) and are removed by macOS eventually.
