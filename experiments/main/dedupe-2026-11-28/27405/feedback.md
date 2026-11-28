# Feedback for #27405

## Independent check (a second AI compared both edits with the intent)
Verdict: fix
Both edits carry every part of the intent and place it sensibly, but both name a BookingRepository method the intent never mentions. Beyond that there is only repetition of the dialog and duplicate-check requirements.

- [added] both m-booking / model-booking: The note names the method "(findByUidIncludeEventTypeAndTeamAndAssignmentReason)", but the intent only says "Include `routedFromRoutingFormReponse.formId` in the booking repository result" and names no function. Neither graph lists this function.
- [repeated] fresh e-list-router: "calls the access-checked `hasWrongAssignmentReport` query to display the already-reported warning and disable submission" repeats what the bookings-list-ui note already says ("use the `hasWrongAssignmentReport` query to display the already-reported warning and disable submission").
- [repeated] fresh bookings-list-ui: "while keeping authorization and duplicate protection on the server" is also on trpc-bookings-router ("Keep authorization and duplicate protection on the server"). The server-side rule belongs on the router only.
- [repeated] chain booking-report: The one note says both "Keep authorization and duplicate protection on the server" and "while keeping authorization and duplicate protection on the server".
- [repeated] both e-wrong-assignment-handler-repo: "reportWrongAssignment rejects an existing report, then creates the new record" repeats the handler note and the repository node note ("the handler checks for an existing report and creates the new record through it").

## Human reviewer comments
(none yet)
