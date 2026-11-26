# Prompt proposals, 2026-11-17

Option A was adopted as the v2 prompts on 2026-11-18 (`tools/prompts/shared-core.md` plus each runner's `prompt.md`), together with the hot-start drop rules and the LLM-only group rule. The previous versions are archived byte for byte in `../../archive/`. The text below is the proposal as written.

## The problem

| | LLM-only (`6845416fb8b3`, 554 words) | Hot-start (`c4fe9062b4c3`, 1,400 words) |
|---|---|---|
| Scope | One sentence: "booking, availability, submission, persistence, rescheduling, cancellation and principal host-management paths". Never mentions email, webhooks, payments, calendars or seats. | A fixed 738-file input that explicitly includes calendar, email, SMS, webhook and database-client code |
| Coverage pressure | "State actual coverage and exclusions"; "report exclusions honestly if the budget is tight" | "Cover all input nodes exactly once; do not quietly discard…" |
| What a good graph is | Nothing beyond the schema | Edge-kind definitions with examples, what to drop and keep, "readable at a glance", example group names, 20–45 components |
| Harness mechanics in the prompt | About half the text (upsert rules, hash/excerpt insertion, validator checks) | About a third (aggregation, auto-drop, evidence forms), most of it repeated in the tool descriptions |

The Sonnet 5.5 LLM-only runs stopped after about 110 of 600 tool calls and 4–5 of 45 minutes. They traced the main path well, but left out every side effect of cancel, confirm and reschedule (emails, webhooks, refunds, calendar updates), and the prompt allowed that. Because the hot-start prompt also carries all of the quality guidance, a hot-start win today can't be attributed to the static graph alone.

## Option A (recommended): shared core plus a short section per condition

Each system prompt becomes `shared-core.md` followed by its runner's section:

- LLM-only: `shared-core.md` + `llm-only-section.md` = about 580 words, roughly the same as today.
- Hot-start: `shared-core.md` + `hotstart-section.md` = about 670 words, down from 1,400.

The shared core is identical in both prompts and carries:

- the task and who the graph is for;
- the scope, written to match the static input's own scope string (`static-input.json`), so both conditions are asked to cover the same code;
- what a good graph looks like (side effects and data access visible, edge kinds with definitions, labels, what to leave out, 20–45 components in groups);
- the evidence and integrity rules.

The condition sections say only how the graph gets built: from source alone, or by grouping the static graph and reviewing host edges. The two conditions then differ in the static graph and the mechanics it forces, nothing else.

**What is removed and where it still lives**

| Removed from the prompt | Still enforced or explained by |
|---|---|
| Upsert/remove_ids mechanics | `update_graph` tool description |
| "The harness adds excerpts, hashes, provenance defaults" | The harness does this anyway; the model doesn't need to know |
| List of validator checks | `finalize_graph` returns specific repair errors |
| Static aggregation details (EDGE_MAP, strongest-kind rule) | `inspect_edges` / `update_edges` tool descriptions |
| Evidence forms for retyped edges ({path, line} code sites) | `update_edges` tool description |
| "Do not store layout", group-cycle rules, ID rules | Schema plus validator |

**Opening messages** (`pi.mjs:163`), aligned:

- LLM-only: `Build the booking component graph for {repo} at {commit}. You have at most {maxTools} tool calls and {maxMinutes} minutes. Start by discovering source files.`
- Hot-start: `Build the booking component graph for {repo} at {commit} from the supplied CodeGraph static graph. You have at most {maxTools} tool calls and {maxMinutes} minutes. Start with graph_overview.`

**Code changes needed to adopt it**

1. Store `shared-core.md` once (e.g. `tools/prompts/shared-core.md`). Each runner concatenates it with its own section, and records the hash of the combined text plus each part's hash in `run.json`.
2. LLM-only `finalize_graph` should enforce groups the same way hot-start does (a group for every node above 20 nodes, at least 3 groups). Otherwise the shared "each in a group" line is enforced for one condition only.
3. Update the two opening messages.
4. Run 3× per condition with Sonnet 5.5 and save the results as new graph files (for example `booking-llm-only-sonnet55-v2-…`). The October `verify-results.mjs` pins runner hashes and will refuse these runs by design, so they can't be mixed in with older results.

## Option B: minimal patch to LLM-only only

Leave the hot-start prompt alone and append three things to the LLM-only prompt: the shared scope paragraph, the "What a good graph looks like" list, and the size target.

- Pro: hot-start runs `run01..03` stay valid, so only LLM-only needs re-running (3 runs instead of 6).
- Con: the hot-start prompt stays 1,400 words of mostly mechanics, and the two prompts still word the same guidance differently, so the conditions remain only roughly matched.

## Option C: add a coverage checklist to Option A

Add to the shared core a list of lifecycle areas that x-scope must mark as included or excluded: public booker, slots/availability, create, recurring, seats, confirm/decline, reschedule, request-reschedule, cancel, persistence, email/SMS, webhooks, tasks, calendars/video, payments.

- Pro: makes it impossible to drop side effects silently, and the coverage can be scored mechanically.
- Con: a list this specific is close to a skeleton of the answer. It could inflate both conditions' scores against the reference graph and make Q1 less meaningful. Use it only if Option A runs still leave side effects out.

## Risks with any option

- **The scope sentence is new information for LLM-only.** That is intended, because hot-start already gets it implicitly through its input. Even so, the paper should say that the v2 prompts give both conditions the same scope.
- **Shorter is not automatically better.** If the shorter hot-start prompt produces worse edge review, compare `edge_review` counts and dropped-edge reasons in `run.json` against runs `run01..03` before blaming the static graph.
