# Main run: plan (drafted 2026-11-27, nothing run yet)

Everything is on the local branch `experiment-prep` (worktree `/Users/andg/Desktop/cs-329m-experiment`): master,
plus `codegraph-intent`, Nathan's intents (`codex/prose-intents-2026-11-26`), Joseph's PR #15
(`fairness-second-review`) and `fresh-graphs`, merged without conflicts. Not pushed.

## Checked overnight (no decisions taken)

- **All 20 tasks on this Mac** (`prepcheck.sh`, log `~/q2q3-main/prepcheck.log`): prepare (install, CodeGraph index)
  works. All 366 hidden tests fail at the base commit and pass with the real PR. Prepare takes 1–2 minutes a task.
- **Three workers** (`~/q2q3-pilot`, `-w1`, `-w2`, APFS clones): three tasks prepared and checked at the same time,
  and each worker's history was restored.
- **Dry run**: all task × condition combinations build their prompt and graph tools, and prompts differ only in
  the condition block.
- **Real smoke test** (`~/q2q3-main/runs-smoke`, #24207, $0.34): `prose-intent`, `text@fresh` and `tool@chain` each
  resolved 7/7. Each run.json records and hashes its set's graph, and the tool run used the graph tools.

## Inputs are solution-blind

No input any condition gets was made with the real PR's solution: nobody who made them opened the PR's diff, the
code after the change, or the hidden test bodies.

| Input | Made from | Record |
|---|---|---|
| Prose intents (`q2q3-tools/prose-intents/`) | PR description, spec, and for 7 tasks (19626, 19997, 20646, 22024, 24207, 24465, 25315) code files at the base commit | Nathan's `README.md`, `provenance.json` (files and hashes) |
| Graph edits (`graphs/edits-{fresh,chain}/`) | the intent, PR description, spec and the two graphs only | `tools/llm-only/EDITS-INTENT.md` (by instruction, not sandboxed) |
| Graphs (`graphs/fresh`, `graphs/chain`) | the code at the base commit (chain: rolled forward over earlier PRs) | build logs on `fresh-graphs` |
| Briefs (`q2q3-tools/prose-briefs/`) | the intents only | `prose-briefs/README.md` |
| Review fixes (2026-11-28: 19626, 24207 edits; 24880 brief) | the intent, the edit and the reviewer's comment | commits bfbfa72, 4a3dc75 |

What still carries knowledge of the solution, the same for every condition: the PR description (its author knew the
solution) and the spec (written from the hidden tests: names, signatures, paths). Intents and edits that restate the
spec add nothing an agent doesn't already have. The records cover how the inputs were drafted, not what a human
reviewer had seen before; reviewers should judge from the intent and description only.

## Conditions (default in make-matrix.mjs)

| Condition | The agent gets | Input |
|---|---|---|
| `prose` | PR description and spec only (the control) | |
| `prose-brief` | plus a 1–3 sentence request in the developer’s words | `q2q3-tools/prose-briefs/PULL.md` |
| `prose-intent` | plus Nathan's intent | `q2q3-tools/prose-intents/PULL.md` |
| `text@fresh` | plus the edited fresh graph, rendered in the prompt | `graphs/edits-fresh/PULL/edit.yaml` |
| `text@chain` | plus the edited chain graph, rendered in the prompt | `graphs/edits-chain/PULL/edit.yaml` |
| `tool@fresh` | plus the graph tools on the edited fresh graph | same |
| `tool@chain` | plus the graph tools on the edited chain graph | same |
| `codegraph-intent` | the intent plus CodeGraph | intent |

Can be added with `--conditions`: `tool-guided@SET` (the tool prompt that says how to use the graph),
`tool-noedit@SET` (unedited graph: the value of the graph alone).

Every prompt has the same description, spec and work rules; only the condition block differs. The dry run checks this.

## Size, cost and time

| | |
|---|---|
| Runs | 20 tasks × 8 conditions × 3 repeats = **480** |
| Cost estimate | about **$28 per repeat, $84 for 3** (see below) |
| Budget stop | `maxTotalUsd` (default $60 in make-matrix.mjs; pass `--max-total-usd`), per-run cap $1 |
| Time | about 1.5 min per run → 3.5 h per repeat on one checkout; **about 4 h for all 3** on 3 workers |

Cost per run in the pilots (Sonnet 5.5, medium; 5 small tasks, 5 runs each): prose $0.09, prose-intent $0.11,
tool $0.12, codegraph-intent $0.13, text $0.20. The new graphs are larger (text prompts 22k–27k tokens, against
about 10k in the pilot), so text is estimated at $0.35 a run. `prose-brief` is estimated like `prose`, $0.10. Per task and repeat: 0.09 + 0.10 + 0.11 + 2 × 0.35 + 2 × 0.13
+ 0.13 ≈ $1.39; × 20 tasks ≈ $28. The 15 tasks not in the pilot are larger on average, so this could be 30–50%
higher; a $100 budget stop leaves room.

Suggested start: one repeat of all conditions on 2 tasks (about $3) to check the new graphs end to end, then the rest.

## Scoring

Each run.json has, next to the full FAIL_TO_PASS score:

- `tier1_*`: the 237 tests labelled fair (TEST-FAIRNESS.md, PR #15).
- `tier12_*`: tiers 1 and 2, the 311 fair plus underdetermined tests.
- `fair_*`: the older rule (fair plus convention-ambiguous, 276 tests). Kept for comparison with the pilots.

## Decide before starting

1. **Edit wording.** The edits carry all of each intent. An independent check (`EDIT-CHECKS.md`) found:
   - nothing missing in any of the 20;
   - 15 added details, mostly file or function names copied from the spec;
   - 42 repeated requirements;
   - 8 placement doubts.

   Tighten them (same content, each clause once, no added names), or run them as they are.
2. **`get_requested_change` wording.** It says "the rest of the graph below" in the tool arm, where nothing follows.
   Fixing it is one line in `tools/graph-mcp/render.mjs`, but the same sentence is in the text arm.
3. **Nathan's review of his intents.** Six of them have open questions (his README). Changing an intent means
   re-translating its two edits.
4. **Task choice.** Keep all 20 and analyse by tier, or drop tasks every condition already solves (#24207 in the
   pilots) or with very few scored tests (#22024: 2 tier-1 tests).
5. **Budget.** The estimate is $84; a stop at $100 is suggested.
6. **Pushing.** The branch is local. Push it, and open a PR, before the run, so the run records a revision others can
   check out.
7. **Briefs.** `q2q3-tools/prose-briefs/` was drafted by Claude from the intents (1–3 sentences, no names from the
   spec). Read them before the run; a brief that says more than a developer would type defeats the condition.

## How to run

```sh
cd /Users/andg/Desktop/cs-329m-experiment
experiments/main/setup-workers.sh 3                     # once: APFS clones ~/q2q3-pilot-w1, -w2 (instant)
experiments/main/run-main.sh ~/q2q3-main/runs-pilot --tasks 19626,24124 --repeats 1 --max-total-usd 5
experiments/main/run-main.sh ~/q2q3-main/runs --max-total-usd 100     # resumable; Ctrl-C and rerun to continue
```

`run-main.sh` writes `matrix.json`, a dry run (`dry-run.txt`), the git revision, `batch.log`, and
`summary.csv`/`summary.jsonl` at the end, and restores every worker's git history.
