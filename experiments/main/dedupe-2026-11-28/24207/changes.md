# Changes for #24207

## Intent
- Merged "Pass the request headers and optional event type ID into `checkBotDetection`, and keep the route responsible for assembling those inputs and reporting ..." into "The route assembles the request headers and optional event type ID for `checkBotDetection` and reports ..." (repetition / wording).

## Edits (both)
- Most of the repetition the feedback lists (disabled rollout said three times, bot/human outcome on edge and node, checkBotDetection inputs on route and edge) was already fixed in the current files; checked and left as is.
- bot-detection-service: dropped `description`, which repeated the note's first sentence; shortened `summary` to "BotID check for booking requests." (repetition, reviewer "Stuff is repeated a lot").
- bot-detection-service: files list emptied; `packages/features/bot-detection/BotDetectionService.ts` is not named in the intent (added detail).
- e-bookapi-botdetection: "The route calls `checkBotDetection`." -> "Runs the bot check." (the label already names it) (repetition).
- e-botdetection-flags: no longer restates `booker-botid` (on the node and label); keeps "through the feature repository" from the intent (repetition).
- Route note follows the reworded intent sentence (wording).
- Left as is: "add the environment setting to the example configuration" on the service node (feedback: no better component in either graph).

## Brief
- Unchanged (reviewer: ok).

## Word counts (before -> after; edits count note, label, summary, description)
- intent.md: 189 -> 182
- brief.md: 25 -> 25
- fresh/edit.json: 229 -> 205
- chain/edit.json: 229 -> 205

## Open questions for the intent author (from the human reviewer)
- "with an explicit failure policy": what should happen when the verification service fails (allow the booking, or reject it)?
- "make the behavior for a missing event type or personal event explicit": should the check be on or off when there is no event type or no team?
