# Mapping for 27405

| Intent clause | fresh | chain |
|---|---|---|
| Persist wrong-assignment reports through a new WrongAssignmentReportRepository | add_node wrong-assignment-report-repository; e-wrong-assignment-repo-model | same ids |
| ...and the specified Prisma model | add_node model-wrong-assignment-report | same |
| Make `bookingUid` unique; initial status PENDING; store reporter, correct assignee, notes, team, routing form, timestamps | model-wrong-assignment-report | model-wrong-assignment-report |
| Reporter and team nullable with requested deletion behavior so reports survive | model-wrong-assignment-report | model-wrong-assignment-report |
| In `reportWrongAssignment`: check access, load team and routing-form response, reject existing report, create record | trpc-bookings-router; e-wrong-assignment-handler-repo | booking-report; e-wrong-assignment-handler-repo |
| Return its ID with the existing response | trpc-bookings-router | booking-report |
| DB uniqueness as final protection; P2002 -> same localized duplicate error | trpc-bookings-router | booking-report |
| Preserve notification flow, not sent twice for rejected duplicate | trpc-bookings-router | booking-report |
| Add access-checked `hasWrongAssignmentReport` query for the dialog | trpc-bookings-router; e-wrong-assignment-handler-repo; e-list-router | booking-report; e-wrong-assignment-handler-repo |
| Dialog shows already-reported warning, disables submission; server keeps authorization/duplicate protection | bookings-list-ui; e-list-router | booking-report |
| Include `routedFromRoutingFormReponse.formId` in booking repository result | m-booking (holds BookingRepository.ts) | model-booking |
| ...and persist it when present | trpc-bookings-router (+ m-booking) | booking-report (+ model-booking) |
| Fix clearing the assignee Select | bookings-list-ui | booking-report |

## Unsure / could not place
- fresh: no component holds `WrongAssignmentDialog.tsx`; dialog parts were put on `bookings-list-ui` (and its edge `e-list-router` to the router) as the nearest booking-management UI. Chain holds the dialog in `booking-report`.
- chain: no component holds `BookingRepository.ts`; the formId selection was put on `model-booking`.
- Neither graph has a BookingAccessService component in fresh, a notification/webhook edge from the report handler, or User/Team/RoutingForm models; access check and notification flow live only in the handler note, and the relations only in the new model's note (no edges to routing-forms added).
