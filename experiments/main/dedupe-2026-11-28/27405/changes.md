# Changes for #27405

Word counts (wc -w): intent 189 -> 189; brief 24 -> 24; fresh/edit.json 370 -> 308; chain/edit.json 344 -> 291.

## Intent
- Unchanged: no restated sentences; wording already tight.

## Brief
- Unchanged.

## Edits (same content in fresh and chain; chain puts handler and dialog on its single booking-report node)
- Handler note (fresh trpc-bookings-router / chain booking-report): dropped "(reportWrongAssignment.handler.ts)" (added detail: file the intent does not name) and "through WrongAssignmentReportRepository" (repetition: the handler->repository edge and repository node carry it).
- Handler note: "Persist `routedFromRoutingFormReponse.formId` when present" -> "Persist the booking's routing form ID when present" (the field name now appears once, on the booking repository entry).
- Handler note: merged "Add the access-checked query ..." and "Keep authorization and duplicate protection on the server" into one sentence.
- Dialog note (fresh bookings-list-ui / chain booking-report): dropped "while keeping authorization and duplicate protection on the server" (repetition; reviewer [repeated] findings for both graphs); "WrongAssignmentDialog:" -> "In the wrong-assignment dialog," (added detail: component name the intent does not use).
- fresh e-list-router: note cut to "The dialog checks for an existing report." (repetition of the dialog note; reviewer [repeated]).
- m-booking / model-booking: dropped "BookingRepository:", the method name "(findByUidIncludeEventTypeAndTeamAndAssignmentReason)" (reviewer [added]) and "so the handler can persist it when present" (repetition of the handler note).
- wrong-assignment-report-repository: note cut to "Persist wrong-assignment reports through this new repository." (repetition of the handler/edge; reviewer [repeated]); files -> [] (the intent names no path).
- model-wrong-assignment-report: files -> [] (the intent names no path); "The specified Prisma model for wrong-assignment reports." -> "Add the specified Prisma model." (wording).
- e-wrong-assignment-handler-repo: note cut to "Existence checks and report creation." (repetition; reviewer [repeated]).
- e-wrong-assignment-repo-model: note cut to "Stores report rows." (repetition of the repository note).

## Validation
- fresh: 8 marked (4 new, 4 modify, 0 delete), OK. chain: 6 marked (4 new, 2 modify, 0 delete), OK.

## Open questions for the intent author
- None (no human comments). The intent says "the requested deletion behavior" for reporter and team relations without stating it; left as written.
