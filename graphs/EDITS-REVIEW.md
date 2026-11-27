# Graph edits from Nathan's prose intents: review before any run (2026-11-26)

These are 40 edits: each of the 20 prose intents (`q2q3-tools/prose-intents/PULL.md`, branch
`codex/prose-intents-2026-11-26` at 3f0b3b7) translated onto two graphs:

- `graphs/edits-fresh/PULL/` uses `graphs/fresh/PULL.yaml`, one fresh build per PR.
- `graphs/edits-chain/PULL/` uses `graphs/chain/PULL.yaml`, one graph rolled forward.

Each folder holds:

- `edit.json`: what the author wrote.
- `edit.yaml`: the edited graph the agent gets.
- `intent.md`: a copy of the prose intent.
- `mapping.md`: each intent clause and the entry that carries it, in both graphs, plus the author's doubts.

`graphs/fresh-edits/` is superseded. Its edits came from the old intents, and 8 of its PRs had no graph.

**How they were made.** One subagent per PR wrote both edits, following `tools/llm-only/EDITS-INTENT.md`. It read
only the intent, the PR description, the spec and the two graphs: no source, diff, tests or results. This was an
instruction, not enforced. Two exceptions came up:

- The #24324 author also read `apply-edit.mjs` (the format checker, which holds no PR content).
- Subagents shared a scratch folder. One helper script was overwritten mid-run, and #24880 briefly had #20646's
  text before its author rewrote it. The checks below show no PR's notes in another PR.

**Rules.**

- Same content as the intent: every requirement in some note, nothing the intent doesn't say, and open choices
  left open.
- Same content in both arms, which differ only in ids and placement.

**Checks run.**

- All 40 pass `apply-edit.mjs`, and the base graphs are unchanged.
- No note text is shared across PRs.
- Every content word of the intent appears in the notes for 26 of 40 edits; none misses more than 4 (of 60–112).
- #19626's notes had copied full signatures from spec.md, which the intent only says "as specified". These were
  removed by hand. Elsewhere a few file or function names from the spec remain (every agent gets the spec).

**Not checked.** Whether each note sits on the right component. Read the `mapping.md` files for that.

| PR | fresh (mod/del/new nodes/new edges) | chain | flags |
|---|---|---|---|
| 19626 | 2/0/0/1 | 2/0/0/1 | The two graphs are the same (the chain starts here). No component owns `bookings/types.ts`, so the Slots type sits on booker-ui. |
| 19997 | 5/0/0/1 | 5/0/0/1 | The new edge (payment uses booking fields) is inferred. Neither graph links the event-type UI to the form builder. |
| 20646 | 1/0/0/0 | 1/0/0/0 | **One component holds all embed code, so the note is the whole intent, verbatim.** The graph arm is close to the prose arm here. |
| 22024 | 3/0/0/1 | 4/0/0/1 | No component owns the SMS rate-limit check or (in chain) `sms-manager.ts`. The dispatch edge was added. |
| 24124 | 3/0/0/2 | 3/0/0/2 | No component for the idempotency service or Sentry metrics. The routing dynamic import sits on routing-forms. |
| 24207 | 3/0/1/3 | 3/0/1/3 | New bot-detection-service. `.env.example` and checkBotId are only in the service note. |
| 24324 | 3/0/4/7 | 3/0/4/8 | The new report model lists `schema.prisma`, which another node already lists. The new report dialog has no files. Watchlist exists only in chain. |
| 24465 | 2/0/0/0 | 2/0/0/0 | The intent names no file for provider selection; it was put on the Google Calendar node (weak fit in fresh). |
| 24880 | 1/0/0/0 | 1/0/0/0 | **One component holds all of weeklyview, so the note is the whole intent.** Same issue as 20646. |
| 25313 | 1/0/2/3 | 1/0/2/3 | The new OAuth model lists `schema.prisma`, which another node already lists. The admin form clause sits on oauth-provider. |
| 25315 | 1/0/1/2 | 1/0/1/2 | New credential-access-service. Neither graph has a user or credential repository node. |
| 26039 | 1/0/2/3 | 1/0/2/3 | Adds a node for the "shared" CRM enums and schemas, which the intent doesn't call new. Fresh's CRM node lists only Salesforce files. |
| 26217 | 1/0/1/1 | 1/0/1/1 | No signup-page component, so the UI rules sit on `signup`. The arms differ only in group id. |
| 27088 | 4/0/1/0 | 3/0/0/0 | **Fresh adds troubleshooter-large-calendar with no files** (the graph has no troubleshooter node). The limit-manager content sits on a different component in each arm. |
| 27192 | 3/0/3/4 | 4/0/2/3 | Adds calendar-event-builder for existing files neither graph covers. **Fresh adds booking-single-view with no files.** |
| 27208 | 3/0/0/0 | 4/0/0/0 | Fresh has no list-to-query edge, so the gating rule sits on the list node (chain: on the edge). |
| 27378 | 1/0/1/3 | 1/0/1/3 | New webhook-tasker. DI wiring sits on the new node (fresh) or on webhook-dispatch (chain). Fresh's tasker node lacks `Tasker.ts`. |
| 27405 | 4/0/2/2 | 2/0/2/2 | The new report model lists `schema.prisma`, which another node already lists. Fresh has no dialog component, so it sits on the list UI. |
| 27428 | 2/0/1/2 | 2/0/0/1 | **The list-to-calendar edge is not in the intent.** Fresh adds a node for the spec's keyboard-handler file; chain already covers it. |
| 30354 | 12/0/0/1 | 11/0/0/1 | **The booker-to-auth edge is not in the intent.** The Calendar contract sits on app-store-framework. |

## To decide

1. **20646 and 24880.** These are single-node edits whose note is the intent. Keep them as they are, which is a
   fair result of these graphs, or exclude them from the graph-versus-prose comparison.
2. **Unstated edges in 27428, 30354 and 19997.** Drop them, or keep them as what a developer would draw.
3. **New nodes for code that already exists (26039, 27192) and file-less new nodes (24324, 27088, 27192).**
4. **Re-translation.** Any intent Nathan changes in review needs its two edits re-translated. Rerun one subagent
   with the same instructions.
