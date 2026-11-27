# Mapping for PR 24124

| Intent clause | fresh | chain |
|---|---|---|
| Process external-calendar cancellations and time changes through CalendarSyncService and the existing booking services | calendar-subscription | calendar-subscription |
| Filter incoming events to Cal.com bookings, resolve booking safely from UID, skip malformed/missing references | calendar-subscription | calendar-subscription |
| For cancellation, call existing cancellation handler with `skipCalendarSyncTaskCancellation` so Cal.com does not delete the external event again | e-sync-cancel-booking (+ cancel-booking) | e-sync-cancel-booking (+ handle-cancel-booking) |
| Mark booking references deleted regardless of skip flag | cancel-booking | handle-cancel-booking |
| Exported helpers: compare start time, extract saved responses, merge event data, construct regular-booking input | calendar-subscription | calendar-subscription |
| Preserve existing response data the event does not replace | calendar-subscription | calendar-subscription |
| Include original booking's `rescheduleUid`, use existing idempotency service | e-sync-reschedule-booking | e-sync-reschedule-booking |
| Set calendar-creation skip flag to avoid a sync loop | e-sync-reschedule-booking | e-sync-reschedule-booking |
| Reuse RegularBookingService, no second mutation path; scoped to affected booking | e-sync-reschedule-booking | e-sync-reschedule-booking |
| Check owner, email, event-type info before invoking services | calendar-subscription; owner/email also on e-sync-cancel-booking, event-type on e-sync-reschedule-booking | same |
| Log and skip incomplete data; catch failures with serialized error details so one bad event does not abort sync | calendar-subscription | calendar-subscription |
| Add invocation, outcome, duration metrics | calendar-subscription | calendar-subscription |
| Dynamic import for booking-service dependency (avoid UI dependency chain at webhook init) | e-sync-reschedule-booking | e-sync-reschedule-booking |
| Dynamic import for routing dependencies | routing-forms | routing-forms |

## Unplaced / unsure

- Routing dynamic import: the module that does the import is not in either graph, so I put it on `routing-forms` in both graphs. Not sure this is the right place.
- Idempotency service: no fresh component lists it (in chain it sits inside `handle-new-booking`). I put it on the reschedule edge in both graphs and added no node.
- Sentry metrics: neither graph has a node for them, so they go on the `calendar-subscription` note only.
- In chain, RegularBookingService is part of `handle-new-booking`, so the reschedule edge goes there.
