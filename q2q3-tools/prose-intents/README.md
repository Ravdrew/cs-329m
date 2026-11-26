# Prose implementation intents

Twenty draft implementation prompts for the `prose-intent` condition, prepared on
2026-11-26. Each numbered file is the additional developer-intent block for that
task. The runner already supplies the original PR description, shared interface
spec, and work instructions; these files supplement those inputs.

**Status: AI-drafted and checked for coverage and prompt assembly; awaiting
Nathan's content review and a comparison with the final graph edits.** No model
runs or hidden-test evaluations were used to tune these drafts.

## Task index

| Task | Implementation focus |
| --- | --- |
| [19626](19626.md) | Scope automatic month advancement to the displayed month's slots |
| [19997](19997.md) | Carry priced booking fields into the payment amount |
| [20646](20646.md) | Share skeleton, theme, and layout behavior across embeds |
| [22024](22024.md) | Enable phone-only booking and SMS beyond organization events |
| [24124](24124.md) | Sync external cancellations and reschedules without update loops |
| [24207](24207.md) | Gate booking creation through a configurable BotID service |
| [24324](24324.md) | Persist booking reports and coordinate cancellation and badges |
| [24465](24465.md) | Make cache eligibility explicit and bypass cache on falsy values |
| [24880](24880.md) | Isolate calendar stores and bound overlapping-event layouts |
| [25313](25313.md) | Carry PKCE through public/confidential OAuth client flows |
| [25315](25315.md) | Check credential access before changing a booking's location |
| [26039](26039.md) | Map booking data into configured HubSpot Meeting properties |
| [26217](26217.md) | Redirect existing invitees into login without duplicate signup |
| [27088](27088.md) | Preserve busy-time source metadata and supplied limit data |
| [27192](27192.md) | Carry assignment categories and details into authorized views |
| [27208](27208.md) | Validate saved filters before applying segments or querying bookings |
| [27378](27378.md) | Dispatch webhooks through synchronous or Trigger.dev taskers |
| [27405](27405.md) | Persist wrong-assignment reports with duplicate protection |
| [27428](27428.md) | Coordinate sheet shortcuts, focus, and event propagation |
| [30354](30354.md) | Show owner-only calendar titles and render events across days |

## Review first

The drafts propose an implementation from the supplied requirements. The items
below distinguish authoring judgments from requirements that are already explicit
in the task text. Resolve them with the intended feature behavior, not by looking
at hidden tests or the original implementation.

| Task | Review decision |
| --- | --- |
| 19997 | Confirm quantity multiplication, checkbox fees, option sums, and currency units. Confirm how add-ons should affect the existing card-hold path. These are proposed pricing semantics. |
| 22024 | Confirm the organizer identity used to rate-limit personal-event SMS and how the existing organization opt-out carries over. The base code establishes the current team-only restriction, but does not specify the new personal-event policy. |
| 24207 | Specify the environment-switch/team-feature truth table, missing-team behavior, and verification-service failure policy. The available description and interface do not settle these choices. |
| 24324 | Confirm whether reporting always cancels an upcoming booking or can leave it active, and which recurring occurrences are affected. The description mentions both with-cancellation and without-cancellation flows, while the supplied input has no cancellation toggle. |
| 25315 | Specify the credential-access decision table for editor ownership, booking-owner ownership, team membership, and organization sharing. The draft identifies the checks and where they belong without claiming the short issue description settles every case. |
| 26039 | Confirm empty placeholder values, date representations, and the meaning of the write policy on a newly created Meeting object. |

For every task, review the prose and graph edit together for the same requested
change and comparable implementation guidance. These drafts were authored
independently of the graph edits; matching filenames do not establish semantic
equivalence. In particular, a difference in file hints or policy detail can affect
the graph-versus-prose comparison independently of the presentation format.

The requested OAuth refresh-verifier behavior in 25313 comes directly from the
benchmark's description. It is retained as that task's contract. Several later
task descriptions already contain detailed implementation guidance; the prose
mostly organizes that material into a connected plan, while the shorter tasks
require more author interpretation.

## Authoring record

The task set is the 20 numbered files in `q2q3-tools/specs-final/` at project
revision `79161f49fb66f87c97048c4c99665d25583c6c40`. The task metadata and specs also
match `graph-chain` at `97b14a04a3da1a63a148faaa4b8405ae44786fbc`.

Inputs used for drafting:

- The original `problem_statement` and shared `specs-final` file for each task.
- Only the task identity, title, URL, base commit, and merge date from the remaining
  benchmark metadata. The task's `source_files`, `test_files`, and test IDs were
  excluded from the authoring projection.
- Selected production-source files fetched at the particular task's **base**
  commit for 19626, 19997, 20646, 22024, 24207, 24465, and 25315. Paths and content
  hashes are recorded in [provenance.json](provenance.json). Other tasks use the
  description and shared interface alone.
- The project chat's assignment and methodological guidance, and runner
  documentation/code needed to determine the input format.

The original target PR diffs, post-change implementations, hidden test bodies,
fairness-label files, draft spec clarifications, prior agent solutions, and pilot
intent files were not opened for drafting. General project documentation and the
chat include aggregate evaluation discussion; those were read for coordination,
not used as behavioral specifications. The shared interface specs themselves are
test-derived and are already supplied to every experimental condition.

This is an audit trail for this drafting session, not a claim about the human
reviewer's prior exposure. Record any prior exposure when deciding whether to use
a reviewed prompt in the experiment. After edits, refresh the intent hashes in
the provenance record before freezing the input set.

## Use with the existing runner

To inspect one complete prompt from the repository root:

```sh
python3 q2q3-tools/make_prompt.py 24465 --spec \
  --intent q2q3-tools/prose-intents/24465.md \
  -o /tmp/prompt-24465-prose-intent.md
```

The batch runner invokes the prompt builder from `q2q3-tools`, so use **absolute
intent paths** in its configuration. This command prints a portable-on-checkout
input fragment for all 20 files, without running an agent:

```sh
python3 - <<'PY'
import json
from pathlib import Path

folder = Path('q2q3-tools/prose-intents').resolve()
inputs = {
    path.stem: {'intent': str(path)}
    for path in sorted(folder.glob('*.md'))
    if path.stem.isdigit()
}
print(json.dumps({'inputs': inputs}, indent=2))
PY
```

Merge each task's `intent` entry into the experiment matrix while retaining its
existing `base` and `edit` entries. Use the `prose-intent` condition for these
files. Keep this README and the provenance record outside the agent prompt.

## Validation

All 20 task IDs have exactly one nonempty numbered intent file. Each builds with
the repository's `make_prompt.py --spec --intent` path. Removing the added intent
block produces the identical description-only prompt, including its original
spec and work rules. The runner's condition resolver selects that same intent
file without enabling graph tools. This checks packaging and condition wiring;
it does not establish implementation correctness, human review, or equivalence
to the graph edits.
