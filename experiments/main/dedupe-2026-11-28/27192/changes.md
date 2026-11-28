# Changes for #27192

## Intent
- Dropped "rather than forcing both consumers onto the same representation" from the webhook sentence; it restates "separating its assignmentReason type from the CalendarEvent email type" (repetition).

## Edits (both)
- calendar-event-builder: removed the exact type signatures (`assignmentReason?: { category: string; details?: string | null } | null`, same on `withAssignmentReason(...)`) and the `packages/types/Calendar.d.ts` reference; the note now uses the intent's "optional `{ category, details }` object described in the interface" (added detail, feedback).
- New-node files lists emptied (`getAssignmentReasonCategory.ts`, `CalendarEventBuilder.ts`, `Calendar.d.ts` are not named in the intent); label "CalendarEventBuilder and CalendarEvent type" -> "CalendarEvent builder" (added detail, feedback).
- assignment-reason-category: summary repeated the note; replaced with "Assignment reason categories." (summary is required by the validator) (repetition).
- email-manager / email-sms-notifications: dropped "Carry assignment explanations from booking data into organizer emails", which the render sentence already covers (repetition).
- booking-single-view (fresh) / booking-success-page (chain): dropped the "Carry ... into the authenticated booking detail view" sentence; kept "authenticated" in the show sentence (repetition).
- webhook-dispatch: follows the intent change (repetition).
- Edge notes shortened to what the dependency is for; they no longer restate builder/view notes or name `withAssignmentReason` / `getAssignmentReasonCategory` again (repetition).
- Not changed: chain puts the booking-repository fetch on model-booking; feedback calls this a small doubt (the repository files sit under handle-new-booking in the chain graph). Left in place since feedback calls model-booking a reasonable home; the edit owner may retarget.

## Brief
- Unchanged.

## Word counts (before -> after; edits count note, label, summary)
- intent.md: 185 -> 176
- brief.md: 26 -> 26
- fresh/edit.json: 308 -> 220
- chain/edit.json: 286 -> 206

## Open questions for the intent author
- Should `details` and the whole assignment-reason value be nullable as well as optional? The intent says only "optional `{ category, details }` ... described in the interface" (the earlier edit had fixed this; it was removed as added detail).
