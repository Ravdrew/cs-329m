# Changes for #30354

## Intent
- "implement it for Google and Office365, including the telemetry wrapper" -> "for Google, Office365 and the telemetry wrapper" (wording).
- Dropped "Finally," (wording).

## Edits (both)
- app-store-framework: dropped "(the Calendar interface that getCalendar resolves)" (added detail) and "The busy-time data gains an optional title" (repetition of the carry requirement).
- calendar-manager: dropped the overlay-only / own-credentials / ordinary-path sentences, which sit on schedule-management (fresh) / schedules-api (chain); keeps only the fallback (repetition, feedback).
- Carry-through requirement now stated once ("Carry the optional title through busy-time data") on busy-times (fresh) / user-availability (chain); each display node states only that it shows the title (repetition, feedback).
- fresh: removed user-availability from modify; its note was identical to busy-times and is now empty (repetition, feedback).
- booker-ui: merged "confirmation hover card (conflicting-slot hover card)" into one phrase; shortened "the continue modal opens" -> "it opens" (wording).
- session-auth / nextauth-credentials: dropped the restated "picks the Google or Microsoft action" clause (repetition of booker-ui).
- e-booker-social-providers: edge note no longer repeats the booker-ui sentence; now a short phrase for the dependency (repetition, feedback).
- telemetry wrapper note: dropped "too" (wording).

## Brief
- Unchanged.

## Word counts (before -> after)
- intent.md: 212 -> 210
- brief.md: 21 -> 21
- fresh/edit.json (note, label, summary): 328 -> 244
- chain/edit.json (note, label, summary): 311 -> 244

## Open questions for the intent author
- Are the "conflicting-slot hover card" (paragraph 1) and the "confirmation hover card" (paragraph 2) the same card? If so, one of the two mentions could go.
