# Changes for #24124

## Intent
- Merged "Check required owner, email, and event-type information before invoking those services. Log and skip incomplete data, and catch ..." into one check sentence ("..., logging and skipping incomplete data") plus a separate failure-handling sentence (wording).
- Everything else already tight; kept.

## Brief
- Unchanged.

## Edits (fresh and chain; identical apart from ids cancel-booking/handle-cancel-booking and regular-booking-service/handle-new-booking)
- routing-forms modify entry removed: the dynamic import is done by the calendar sync code, so the requirement moved to calendar-subscription with the booking-service import as one sentence matching the intent (misplaced, AI check). That left routing-forms empty.
- e-sync-reschedule-booking: dropped the booking-service dynamic import (now on calendar-subscription with the routing one) and "Only invoke it once the required event-type information is present" (repetition, and added detail: the intent does not say which field gates which service, AI check).
- e-sync-cancel-booking: dropped "Only invoke it once the required owner and email information is present" (repetition and added detail, AI check). Now holds the only copy of the skip-flag call requirement.
- cancel-booking / handle-cancel-booking: dropped the skip-flag call sentence, which is on the edge (repetition, AI check). Keeps only the references-deleted-regardless rule.
- calendar-subscription: follows the merged intent sentence.

## Word counts (JSON: words in all text values except ids/kinds/groups)
- intent.md: 214 -> 213
- brief.md: 35 -> 35
- fresh/edit.json: 294 -> 231
- chain/edit.json: 294 -> 231

## Validation
- apply-edit.mjs passes for both: 4 marked (2 new, 2 modify).

## Open questions for the intent author
- Does the routing dependency's dynamic import live only in the calendar sync code, or does the routing code itself change to import lazily? The edits now follow the AI check and put it on calendar-subscription only.
- "the requested dynamic imports" and "the described ... metrics" refer to a request and description the agents never see. Should the metric names and the modules to import lazily be spelled out, or left open?
