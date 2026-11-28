# Changes for #24324

## Intent
- "Use the existing cancellation flow for an upcoming booking that is reported" -> "Cancel a reported upcoming booking through the existing cancellation flow" (wording).
- Dropped ", as described in the request" after the watchlist/email-blocking exclusion (wording).

## Brief
- Unchanged (already tight).

## Edits (both graphs, same content)
- Handler node (bookings-trpc-router / booking-list-query): keeps authenticated operation, no DB rules in UI, validate/verify access/load before changes, derive booker email and org context, retry handling, return UID and count, scope exclusion. Removed report-creation details and the "(via ...)" mentions, which now live on their own entries (repetition). Dropped "as described in the request" (wording).
- e32 / e-listquery-reads: removed "before making changes" (on handler) (repetition).
- List view/page: now only the reporting action and the badge/count/tooltip refresh; the dialog is on its own node (repetition).
- booking-report-model: removed "(BookingReportReason: SPAM, DONT_KNOW_PERSON, OTHER)" (added detail, feedback), removed the repeated watchlist/out-of-scope sentences (repetition). files -> [] since the intent names no path (added detail).
- booking-report-repository, booking-access-service: notes cut to the "put persistence/authorization behind ..." requirement; creation details and access check moved to edges/handler (repetition). files -> [] (added detail).
- e-report-access: short phrase; access check is on the handler (repetition).
- e-report-repo: carries the report-creation requirement once; removed "no duplicate reports on retry" (on handler) (repetition).
- e-report-booking-rel: removed "(each booking has its existing report)" cardinality claim (added detail, feedback).
- e-report-cancel: removed the retry sentence (on handler) (repetition).
- e-list-report-dialog, e-dialog-report: short phrases; removed input fields "(booking UID, reason, optional description)" (added detail, feedback) and the repeated return/refresh text (repetition).
- Chain only: removed edge e-report-watchlist; feedback found it misplaced (schema relation drawn to the watchlist service) and its content is on the model node and handler (misplaced / repetition).
- New-node summaries shortened so they do not restate notes (repetition).

## Word counts (edits: words in note/label/summary/description)
- intent: 208 -> 201
- brief: 24 -> 24
- fresh: 450 -> 271
- chain: 453 -> 271

## Validation
- fresh: 14 marked (11 new, 3 modify), ok. chain: 14 marked (11 new, 3 modify), ok.

## Open questions for the intent author
- None from human reviewers (no comments yet).
