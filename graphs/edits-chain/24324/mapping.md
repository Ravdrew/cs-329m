# Mapping for PR 24324

Router/handler component: fresh `bookings-trpc-router`, chain `booking-list-query` (holds `viewer/bookings/_router.tsx`).

| Intent clause | fresh | chain |
|---|---|---|
| Add booking reporting as an authenticated operation | bookings-trpc-router | booking-list-query |
| backed by a BookingReport record | booking-report-model (new) | booking-report-model (new) |
| booking, reporter, organization, optional watchlist relations; three report reasons | booking-report-model; e-report-booking-rel | booking-report-model; e-report-booking-rel; e-report-watchlist (new edge) |
| Persistence behind PrismaBookingReportRepository | booking-report-repository (new); e-report-repo; e-report-repo-model | same |
| Authorization behind BookingAccessService | booking-access-service (new); e-report-access | same |
| tRPC handler coordinates without embedding DB access rules in UI | bookings-trpc-router; booking-access-service | booking-list-query; booking-access-service |
| reportBookingHandler: validate input, verify access, load booking with existing report | bookings-trpc-router; e-report-access; e32 | booking-list-query; e-report-access; e-listquery-reads |
| Derive booker email and organizational context | bookings-trpc-router | booking-list-query |
| Create report with reason, optional description, record cancellation, leave watchlistId unset | bookings-trpc-router; e-report-repo; booking-report-repository | booking-list-query; e-report-repo; booking-report-repository |
| Handle already-reported booking: no duplicate reports or repeated cancellation | bookings-trpc-router; e-report-repo; e-report-cancel | booking-list-query; e-report-repo; e-report-cancel |
| Existing cancellation flow for upcoming reported booking, incl. notifications and state updates | e-report-cancel (to cancel-booking-service) | e-report-cancel (to handle-cancel-booking) |
| Recurring-booking repository lookup for active related bookings, clear scope of occurrences | e32 | e-listquery-reads |
| Return booking UID and updated report count | bookings-trpc-router; e-dialog-report | booking-list-query; e-dialog-report |
| Add reporting action and dialog | report-booking-dialog (new); e-list-report-dialog; bookings-list-view | report-booking-dialog (new); e-list-report-dialog; bookings-list-page |
| Refresh report badge, count, reason tooltip after success | bookings-list-view; e-dialog-report | bookings-list-page; e-dialog-report |
| Keep watchlist management and future email blocking outside | bookings-trpc-router; booking-report-model note | booking-list-query; e-report-watchlist |

## Unsure / not placed

- Neither graph has a BookingRepository component; the "load booking with its existing report" and "recurring-booking repository lookup" clauses sit on the handler's existing read edge to the Booking model (e32 / e-listquery-reads).
- Fresh has no Watchlist, User or Team node; the optional watchlist relation and the out-of-scope note are on the booking-report-model note. Chain has `watchlist`, so they go on a new edge there.
- The booking list item / badge UI file is not in either graph; the badge, count, tooltip refresh goes on the bookings list page component.
- Chain splits bookings handlers by procedure; I put the new handler on `booking-list-query` (which holds the bookings `_router.tsx`) rather than adding a node.
- Spec-only `bookingCancelSchema.skipCancellationReasonValidation` is not in the intent, so it is not included.
