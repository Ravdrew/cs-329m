# Mapping: intent -> edit entries (PR 27192)

| Intent clause | fresh | chain |
|---|---|---|
| Carry assignment explanations from booking data into organizer emails | email-manager | email-sms-notifications |
| ... and the authenticated booking detail view | booking-single-view (new node), e-view-booking (new edge) | booking-success-page |
| Add `getAssignmentReasonCategory` as the single mapping from AssignmentReasonEnum values to translation keys | assignment-reason-category (new node) | assignment-reason-category (new node) |
| reuse it wherever a human-readable category is needed | assignment-reason-category, e-builder-category, e-view-category | same ids |
| Fetch both the reason enum and detailed reason string in the booking repository so neither presentation layer has to infer a category from free text | booking-model (holds BookingRepository.ts) | model-booking |
| Represent the email-facing CalendarEvent value as the optional `{ category, details }` object | calendar-event-builder (new node, files CalendarEventBuilder.ts + Calendar.d.ts) | calendar-event-builder (new node) |
| Add the chainable `withAssignmentReason` builder method | calendar-event-builder | calendar-event-builder |
| have booking-to-event construction populate it from the stored assignment reason | calendar-event-builder, e-builder-booking-reason, e-builder-category | same ids (edge to model-booking) |
| Render the translated category followed by available details in organizer emails; handle absent or null reasons without showing an empty explanation | email-manager | email-sms-notifications |
| On the booking single view, show the category badge and details only under the existing hidden-data access rule for the logged-in host or an authorized team member | booking-single-view | booking-success-page |
| Keep the presentation translated and consistent with the email wording | booking-single-view | booking-success-page |
| Preserve the webhook payload's existing array of `{ reasonEnum, reasonString }` entries by separating its assignmentReason type from the CalendarEvent email type | webhook-dispatch (holds sendPayload.ts) | webhook-dispatch |

## Could not place / unsure

- Neither graph has a component containing `packages/features/CalendarEventBuilder.ts` or `packages/types/Calendar.d.ts`, so both edits add `calendar-event-builder` (an existing file, but no component covers it). The CalendarEvent type sits on the same node.
- Fresh has no component for the booking single view (`/booking/[uid]`), so the fresh edit adds `booking-single-view` (no files: the intent and spec name none) and a reads edge to booking-model. Chain already has it as booking-success-page.
- Booking repository: in fresh, `BookingRepository.ts` is in booking-model. In chain, no node lists `BookingRepository.ts`. I put that clause on model-booking (the Prisma Booking model) as the closest match; handle-new-booking was the other candidate.
- The webhook type separation goes on webhook-dispatch on the assumption that the payload type lives in its files (sendPayload.ts); the intent names no file for it.
