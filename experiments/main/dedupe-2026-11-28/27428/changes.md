# Changes for #27428

## Intent
- Unchanged: no sentence restates another, and the wording is already tight.

## Edits (both)
- Removed the utility path `apps/web/modules/bookings/lib/bookingSheetKeyboardHandler.ts` from the note (both) and from the new node's files list (fresh -> `[]`); the intent says only "the specified utility" (added detail, feedback).
- calendar-views (fresh) / calendar-weekly-view (chain): dropped "(and the weekly-calendar event interaction marker)", which the intent never says the calendar adds, and the "so the sheet stays open ..." purpose, which the sheet note already states; now "Place the booking UID on calendar event buttons." (added detail / repetition, feedback).
- e-bookinglist-sheet-keyboard (fresh): edge note no longer repeats the listener / cleanup / navigation-state requirements from booking-list-ui; now a short phrase (repetition, feedback).
- e-bookinglist-calviews-marker (fresh) / e-bookingslist-weekly-marker (chain): edge note no longer repeats "keep the sheet open ... by recognizing both interaction markers"; now a short phrase (repetition, feedback).
- booking-sheet-keyboard-handler (fresh): summary shortened to "Booking sheet shortcuts." so it does not echo the note (repetition).

## Brief
- Unchanged.

## Word counts (before -> after; edits count note, label, summary, description)
- intent.md: 205 -> 205
- brief.md: 28 -> 28
- fresh/edit.json: 289 -> 226
- chain/edit.json: 250 -> 213

## Open questions for the intent author
- "recognizing both interaction markers": does the weekly calendar need to add its own marker to event buttons (beyond the booking UID), or does one already exist? The earlier edit assumed it adds one; that was removed as not in the intent.
- The brief mentions arrows and Esc but not Enter-to-join or tooltips. That is fine for a brief; just noting it.
