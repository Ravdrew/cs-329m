# Q2/Q3 agent runner

Runs Pi (`openai/gpt-6-astra`) on benchmark tasks under each experimental condition and grades the result with the
PR's hidden tests. It joins the pieces that already exist: `q2q3-tools/harness.py` (prepare, reset, grade),
`q2q3-tools/make_prompt.py` (one prompt template for every condition), and `tools/graph-mcp` (the graph tools and
the Pi session).

## Conditions

Only one prompt block differs between conditions (`make_prompt.py` tests this); every prompt has the PR description,
the interface spec, and the same work instructions and rules.

| Condition | Prompt block | Graph the agent can query | Task inputs | Answers |
|---|---|---|---|---|
| `prose` | none | none | | Q3 baseline |
| `prose-intent` | the developer's intent as prose (`--intent`) | none | `intent` | Q3 |
| `text` | the edited graph rendered as text (`--graph`) | none | `edit` | Q2, Q3 |
| `tool` | "the graph is available through the graph tools" | edited graph, MCP | `edit` | Q2, Q3 |
| `tool-noedit` | same as `tool` | unedited graph, MCP | `base` | Q3 control |
| `codegraph` | "a code graph is available through the CodeGraph tools" | CodeGraph's MCP server | | Q3 control |

Task inputs are files: `base` (the graph at the task's base commit), `edit` (the same graph with the developer's
edit), `intent` (the same intent written as prose by someone who has not seen the patch). Every agent also gets Pi's
`read`, `bash`, `edit` and `write` tools. The image channel was dropped (see the team decision of 2026-11-10).

**To try it on a Mac, follow [TESTING.md](TESTING.md)**: offline tests, Pi login, a real-model smoke test on a toy
task (`pilot/smoke.mjs`), and a real Cal.com pilot on one task (`pilot/calcom-pilot.sh`).

## Setup (Linux box or Mac, as the harness expects)

```sh
npm ci --prefix tools/graph-mcp          # Pi 1.4.0 and the graph server; the runner has no other dependencies
# Pi credentials: run Pi's /login openai once (tools/llm-only/README.md), or export OPENAI_API_KEY
python3 q2q3-tools/harness.py prepare 24207   # with PILOT_DIR / PILOT_PRIVATE set as for the harness
```

`OPENAI_API_KEY`, if set, is handed to Pi and removed from the agent's environment so its `bash` tool cannot read it.

## One run

```sh
cat > run.json <<'EOF'
{ "task": 24207, "condition": "tool", "repeat": 1, "out": "/root/q2q3-runs",
  "pilotDir": "/home/claude/pilot", "pilotPrivate": "/root/pilot-private",
  "inputs": { "edit": "/root/q2q3-inputs/24207/edit.yaml" } }
EOF
node tools/agent-runner/run.mjs --config run.json
```

Steps: `harness.py reset` (back to the base snapshot), `make_prompt.py --spec` with the condition's block, the agent
in a subprocess, the audit, `harness.py evaluate`. Defaults: `medium` effort, 45 minutes, 300 tool calls, $10; set
`maxMinutes`, `maxToolCalls`, `maxCostUsd`, `effort`, `regress` (full-suite regression check) in the config.

Each run writes `OUT/PULL/CONDITION-rN/`:

| File | Contents |
|---|---|
| `run.json` | The record: status (`completed`, `limit`, `error`, `invalid`), stop reason, model, Pi version, limits, usage and cost, tool calls, graph tool calls, bash and search commands, audit flag, and the grading (resolved, FAIL_TO_PASS passed, file recall and precision, agent files, regressions); sha256 of the prompt and every input |
| `prompt.md`, `effective-system-prompt.md` | Exactly what the agent was told |
| `events.jsonl` | Every model response (with usage) and tool call, in order; long tool results trimmed to 20k characters |
| `tools.jsonl`, `mcp.log` | The graph server's own log (tool conditions) |
| `audit.json` | Tool calls by name, search commands, and rule flags |
| `evaluation.json` | `harness.py evaluate`'s result |

A run with a `run.json` is skipped when run again, so batches resume. A run that ended in an `error` (an API failure,
a crashed agent) is redone instead, and the failed attempt is kept as `CONDITION-rN.error-M` (not counted in the
summary). Delete a run directory to redo a finished run.

`harness.py` sources `PILOT_DIR/env.sh` before every command, and so does the agent. The cloud box's version is
`q2q3-tools/env/env.sh`; on a Mac (or anywhere with nvm) copy `q2q3-tools/env/env-macos.sh`, which selects Node 20 and
Cal.com's own Yarn.

**Limits.** The agent stops at the time, tool-call or cost limit; the run is recorded as `limit` with the reason and
is still graded on what it changed. `invalid` means the agent was offered other tools than the condition's (it is not
graded). A subprocess that hangs is killed 5 minutes after its time limit.

**Audit.** Pi's `bash` cannot be restricted per command, so the prompt's rules are checked afterwards: absolute paths
outside the checkout (except the env script, `/tmp`, `/dev/null` and system binaries), network commands, git history
commands, and `../..` escapes. Flagged runs are marked (`audit_flagged`) for review, not dropped. `search_commands`
counts bash commands that search (`grep`, `rg`, `find`, `git grep`, `ls -R`, ...), one of the proposal's cost metrics.

## The matrix

```sh
node tools/agent-runner/batch.mjs --matrix matrix.json --dry-run   # show who runs what, in which order
node tools/agent-runner/batch.mjs --matrix matrix.json
```

```json
{
  "out": "/root/q2q3-runs",
  "tasks": [24207, 24324, 25315],
  "conditions": ["prose", "prose-intent", "text", "tool", "tool-noedit"],
  "repeats": 3,
  "seed": 329,
  "inputs": { "24207": { "base": "/root/q2q3-inputs/24207/base.yaml", "edit": "...", "intent": "..." } },
  "workers": [
    { "pilotDir": "/home/claude/pilot-0", "pilotPrivate": "/root/pilot-private-0" },
    { "pilotDir": "/home/claude/pilot-1", "pilotPrivate": "/root/pilot-private-1" }
  ],
  "effort": "medium", "maxMinutes": 45, "maxToolCalls": 300, "maxCostUsd": 10
}
```

Each worker is one Cal.com checkout (about 5 GB) and runs in parallel with the others. Tasks are dealt to workers
whole, because preparing a task reinstalls the checkout; within a task the condition × repeat runs go in a random
order fixed by the seed, so no condition always runs first. Every task's inputs are checked before anything runs.
`OUT/summary.csv` and `summary.jsonl` hold one row per run.

## Tests

```sh
npm test --prefix tools/agent-runner     # needs npm ci --prefix tools/graph-mcp
python3 -m pytest -q q2q3-tools/test_graph_text.py
```

`runner.test.mjs` uses Pi's real session and tool pipeline with a scripted model, a throwaway checkout, and stand-ins
for the harness steps: condition wiring and the tools each condition offers, a tool run end to end (prompt, MCP
graph server, audit, grading, resume), the three limits, the subprocess error path, and batch planning and resume.

`harness.test.mjs` (Linux or macOS with a Python that has PyYAML, `PYTHON=...`; skipped elsewhere) runs the **real**
`harness.py` and `make_prompt.py` on a fixture repository (`fixture-repo.mjs`) that stands in for Cal.com: a base and
a merge commit with a hidden test, component graphs of it, and a fake `yarn` that reports the test in Vitest's JSON
format. Pi edits files with its real tools on a scripted model. It
checks prepare → run → evaluate (graded by the hidden test) → reset → next run starting from the base snapshot →
restore, and two workers running a batch in parallel, each graded on its own runs.

## Not yet covered

- **`harness.py reset` has not run against a real Cal.com checkout**, only the fixture. It resets to the base
  snapshot (`git reset --hard`, since `evaluate` stages the agent's changes), cleans untracked files, deletes ignored
  files created since `prepare` (recorded by `prepare`), regenerates the Prisma client if the schema had changed, and
  fails if anything is left. Tasks prepared before this change need `prepare` again. Try it on one task before a batch.
- **`codegraph` needs an index.** The condition starts the server given in `codegraphServer` (e.g.
  `{ "command": "codegraph", "args": ["serve", "--mcp"] }`), but `codegraph init` writes `.codegraph/` into the
  checkout, which `reset` would delete and `evaluate` would count as the agent's files. Where to keep the index is
  still open.
- **Inputs:** the per-task `base`/`edit` graphs and `intent` texts do not exist yet.
- **No real model has completed a run yet.** A dry run with an invalid API key went through the real path (credential
  check, prepare, the agent subprocess reaching OpenAI, the 401 recorded as an error, grading, restore; the key did not
  appear in any run file). The next steps are TESTING.md's smoke test and Cal.com pilot.
