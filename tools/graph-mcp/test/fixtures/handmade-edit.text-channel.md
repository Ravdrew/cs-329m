# Cal.diy — booking subsystem (developer edit: Booked Appointments page)

This is a component-level map of the `calcom/cal.diy` code at commit `6bfe2df9d13c`. It has 36 components and 55 dependencies between them. Component names are followed by their id in square brackets. A sentence such as "A calls B" means code in A depends on B.

The same graph with a developer edit applied, as in Figure 2 of the proposal: add a **Booked appointments page** that becomes the attendee landing page after booking, replacing the direct redirect to the success page. Green = new, amber = modified, red = deleted.

## Requested change

The developer marked these parts of the graph as changed. Implement them; the rest of the graph below is the code as it is now.
- Change component Booking success page [booking-success-page] (page): Confirmation page after a booking; also cancel/reschedule entry.
  - Routes: `/booking/[uid]`, `/booking-successful/[uid]`
  - Developer note: Add a "See all your bookings" link to the new page.
- Add component Booked appointments page [booked-appointments-page] (page): New: lists all of the attendee's upcoming bookings after they book.
  - Description: Attendee-facing page listing every booking for the attendee's email, reachable after a successful booking. Should reuse the booking list item component from the organizer dashboard.
  - Routes: `/booked`
  - Developer note: Group by day; link each row to its /booking/[uid] page.
- Add component Attendee bookings endpoint [attendee-bookings-endpoint] (endpoint): New: returns bookings for a verified attendee email.
  - Routes: `trpc viewer.public.attendeeBookings`
  - Developer note: Public (unauthenticated) but must verify the email token from the success page.
- Remove dependency: **Book event form [book-event-form]** navigates to **Booking success page [booking-success-page]**. (redirect after booking)
  - Developer note: Redirect to the booked-appointments page instead.
- Add dependency: **Book event form [book-event-form]** navigates to **Booked appointments page [booked-appointments-page]**. (redirect after booking)
- Add dependency: **Booked appointments page [booked-appointments-page]** calls **Attendee bookings endpoint [attendee-bookings-endpoint]**.
- Add dependency: **Attendee bookings endpoint [attendee-bookings-endpoint]** reads from **Booking [booking-model]**.
- Add dependency: **Booked appointments page [booked-appointments-page]** navigates to **Booking success page [booking-success-page]**. (open one booking)
- Add dependency: **Booking success page [booking-success-page]** navigates to **Booked appointments page [booked-appointments-page]**. (see all bookings)

## Components

### Group: Public booking flow
What an attendee sees when they open someone's booking link.

#### User profile page [user-profile-page]
Kind: page.
Lists a user's public event types.
Public landing page for a username. Shows the user's avatar, bio and the list of bookable event types; clicking one navigates to the event booking page.
Routes: `/[user]`.
Files (2):
- `apps/web/app/(booking-page-wrapper)/[user]/page.tsx` (route)
- `apps/web/modules/users/views/users-public-view.tsx`
This component:
- navigates to **Event booking page [event-booking-page]**. Opens event type.
Used by 0 other components.

#### Event booking page [event-booking-page]
Kind: page.
Hosts the Booker widget for one event type.
Server-rendered page for a single event type. Loads the public event data on the server, then renders the **Booker** widget. Also reached through private links (`/d/[link]/[slug]`) and the embed route.
Routes: `/[user]/[type]`, `/d/[link]/[slug]`.
Files (5):
- `apps/web/app/(booking-page-wrapper)/[user]/[type]/page.tsx` (route)
- `apps/web/app/(booking-page-wrapper)/[user]/[type]/embed/page.tsx`
- `apps/web/app/(booking-page-wrapper)/d/[link]/[slug]/page.tsx`
- `apps/web/modules/users/views/users-type-public-view.tsx`
- `apps/web/app/(booking-page-wrapper)/layout.tsx`
This component:
- renders **Booker [booker]**. Evidence: `apps/web/modules/users/views/users-type-public-view.tsx:6`, `apps/web/modules/users/views/users-type-public-view.tsx:33`.
- reads from **EventType [event-type-model]**. Loads public event on the server.
Used by 1 other component.

#### Booking success page [booking-success-page] (TO CHANGE, requested)
Kind: page.
Confirmation page after a booking; also cancel/reschedule entry.
Shows the booked slot, attendees and location. From here an attendee can cancel or request a reschedule, and rate the host after the meeting.
Routes: `/booking/[uid]`, `/booking-successful/[uid]`.
Files (6):
- `apps/web/app/(booking-page-wrapper)/booking/[uid]/page.tsx` (route)
- `apps/web/app/(booking-page-wrapper)/booking-successful/[uid]/page.tsx`
- `apps/web/modules/bookings/views/bookings-single-view.tsx`
- `apps/web/modules/bookings/views/bookings-single-view.getServerSideProps.tsx`
- `apps/web/modules/bookings/components/BookingSuccessCard.tsx`
- `apps/web/components/booking/CancelBooking.tsx`
This component:
- navigates to **Booked appointments page [booked-appointments-page]** (NEW, requested). See all bookings.
- calls **Cancel endpoint [cancel-endpoint]**. Attendee cancels. Evidence: `apps/web/modules/bookings/views/bookings-single-view.tsx:925`.
- reads from **Booking [booking-model]**. Evidence: `apps/web/modules/bookings/views/bookings-single-view.getServerSideProps.tsx:79`.
Used by 2 other components.

#### Booked appointments page [booked-appointments-page] (NEW, requested)
Kind: page.
New: lists all of the attendee's upcoming bookings after they book.
Attendee-facing page listing every booking for the attendee's email, reachable after a successful booking. Should reuse the booking list item component from the organizer dashboard.
Routes: `/booked`.
Files: none yet.
This component:
- navigates to **Booking success page [booking-success-page]** (NEW, requested). Open one booking.
- calls **Attendee bookings endpoint [attendee-bookings-endpoint]** (NEW, requested).
Used by 2 other components.

### Group: Public booking flow > Booker UI
The client-side booking widget and its pieces.

#### Booker [booker]
Kind: component.
The booking widget — layout shell that composes the pieces below.
Composes the event meta, date picker, time slots and booking form into one of several layouts (month, week, column). `BookerWebWrapper` wires it to Next.js routing and the tRPC client; the layout and state logic live in `packages/features/bookings/Booker`.
Files (8):
- `apps/web/modules/bookings/components/Booker.tsx` (entry)
- `apps/web/modules/bookings/components/BookerWebWrapper.tsx`
- `packages/features/bookings/Booker/config.ts`
- `packages/features/bookings/Booker/types.ts`
- `packages/features/bookings/Booker/hooks/useBookerLayout.ts`
- `packages/features/bookings/Booker/hooks/useBookerTime.ts`
- `packages/features/bookings/Booker/utils/layout.ts`
- `packages/features/bookings/Booker/utils/getBookerWrapperClasses.ts`
This component:
- renders **Available times [available-times]**. Evidence: `apps/web/modules/bookings/components/Booker.tsx:42`.
- renders **Book event form [book-event-form]**. Evidence: `apps/web/modules/bookings/components/Booker.tsx:43`, `apps/web/modules/bookings/components/Booker.tsx:44`.
- renders **Date picker [date-picker]**. Evidence: `apps/web/modules/bookings/components/Booker.tsx:45`.
- renders **Event meta [event-meta]**. Evidence: `apps/web/modules/bookings/components/Booker.tsx:47`.
- uses **Booker store [booker-store]**. Evidence: `apps/web/modules/bookings/components/Booker.tsx:7`.
Used by 1 other component.

#### Booker store [booker-store]
Kind: store.
Zustand store holding the selected date, slot, timezone and form values.
Files (3):
- `packages/features/bookings/Booker/store.ts` (entry)
- `packages/features/bookings/Booker/BookerStoreProvider.tsx`
- `packages/features/bookings/Booker/utils/query-param.ts`
Used by 2 other components.

#### Event meta [event-meta]
Kind: component.
Event title, duration, location, price and timezone picker.
Files (3):
- `apps/web/modules/bookings/components/EventMeta.tsx`
- `packages/features/bookings/components/event-meta/Price.tsx`
- `packages/features/bookings/components/event-meta/PayIcon.tsx`
Used by 1 other component.

#### Date picker [date-picker]
Kind: component.
Month calendar; days without slots are disabled.
Files (3):
- `apps/web/modules/bookings/components/DatePicker.tsx`
- `packages/features/calendars/components/DatePicker.tsx`
- `packages/features/calendars/components/NoAvailabilityDialog.tsx`
Used by 1 other component.

#### Available times [available-times]
Kind: component.
The list of bookable slots for the selected day.
Fetches the schedule for the visible month through the slots endpoint and renders the slots for the selected day, honouring the attendee's timezone and 12/24h preference.
Files (6):
- `apps/web/modules/bookings/components/AvailableTimes.tsx`
- `apps/web/modules/bookings/components/AvailableTimeSlots.tsx`
- `apps/web/modules/bookings/components/AvailableTimesHeader.tsx`
- `packages/features/bookings/Booker/hooks/useAvailableTimeSlots.ts`
- `packages/features/bookings/Booker/utils/isTimeslotAvailable.ts`
- `packages/features/bookings/Booker/utils/getPrefetchMonthCount.ts`
This component:
- calls **Slots endpoint [slots-endpoint]**. GetSchedule for the visible month. Evidence: `packages/features/bookings/Booker/hooks/useAvailableTimeSlots.ts`.
Used by 1 other component.

#### Book event form [book-event-form]
Kind: component.
Name/email/custom questions; submits the booking.
Renders the event type's booking fields, validates them with the shared responses schema, and posts to the book-event endpoint.
Files (7):
- `apps/web/modules/bookings/components/BookEventForm/BookEventForm.tsx` (entry)
- `apps/web/modules/bookings/components/BookEventForm/BookFormAsModal.tsx`
- `apps/web/modules/bookings/components/BookEventForm/BookingFields.tsx`
- `packages/features/bookings/Booker/hooks/useBookingForm.ts`
- `packages/features/bookings/Booker/hooks/useInitialFormValues.ts`
- `packages/features/bookings/lib/client/booking-event-form/booking-to-mutation-input-mapper.tsx`
- `packages/features/bookings/lib/create-booking.ts`
This component:
- navigates to **Booked appointments page [booked-appointments-page]** (NEW, requested). Redirect after booking.
- navigates to **Booking success page [booking-success-page]** (TO REMOVE, requested). Redirect after booking. Evidence: `packages/features/bookings/lib/bookingSuccessRedirect.ts`.
- calls **Book event endpoint [book-event-endpoint]**. POST /api/book/event. Evidence: `packages/features/bookings/lib/create-booking.ts:13`.
- calls **Reserve slot endpoint [reserve-slot-endpoint]**. Holds the slot while the form is open. Evidence: `packages/features/bookings/Booker/useSlotReservationId.ts`.
- reads from **Booker store [booker-store]**. Evidence: `apps/web/modules/bookings/components/BookEventForm/BookEventForm.tsx:71`, `packages/features/bookings/Booker/hooks/useBookingForm.ts:40`.
- uses **Booking fields schema [booking-fields-schema]**. Validates responses. Evidence: `packages/features/bookings/Booker/hooks/useBookingForm.ts:48`.
Used by 1 other component.

### Group: Booking domain services

#### Booking fields schema [booking-fields-schema]
Kind: service.
Zod schemas shared by the form (client) and the endpoint (server).
Files (2):
- `packages/features/bookings/lib/getBookingResponsesSchema.ts`
- `packages/features/bookings/lib/bookingCreateBodySchema.ts`
Used by 2 other components.

#### Booking service [booking-service]
Kind: service.
The booking pipeline — validate, pick hosts, check limits, create, notify.
`RegularBookingService` (and the recurring variant) is the heart of the system. In order it: loads the event type, loads and validates users, checks booking/duration limits, ensures hosts are available, handles seats, creates the booking row, syncs calendars/video through the EventManager, takes payment if needed, and fires emails and webhooks.
Files (13):
- `packages/features/bookings/lib/service/RegularBookingService.ts` (entry)
- `packages/features/bookings/lib/service/RecurringBookingService.ts`
- `packages/features/bookings/di/RegularBookingService.container.ts`
- `packages/features/bookings/lib/handleNewBooking/getBookingData.ts`
- `packages/features/bookings/lib/handleNewBooking/getEventType.ts`
- `packages/features/bookings/lib/handleNewBooking/loadAndValidateUsers.ts`
- `packages/features/bookings/lib/handleNewBooking/ensureAvailableUsers.ts`
- `packages/features/bookings/lib/handleNewBooking/createBooking.ts`
- `packages/features/bookings/lib/handleNewBooking/validateBookingTimeIsNotOutOfBounds.ts`
- `packages/features/bookings/lib/handleNewBooking/validateEventLength.ts`
- `packages/features/bookings/lib/handleNewBooking/getRequiresConfirmationFlags.ts`
- `packages/features/bookings/lib/handleNewBooking/scheduleNoShowTriggers.ts`
- `packages/features/bookings/lib/handleNewBooking/types.ts`
This component:
- calls **Booking limits [booking-limits]**. Evidence: `packages/features/bookings/lib/service/RegularBookingService.ts:817`.
- calls **Event manager [event-manager]**. Evidence: `packages/features/bookings/lib/service/RegularBookingService.ts:1835`.
- calls **Payments [payments]**. Evidence: `packages/features/bookings/lib/service/RegularBookingService.ts:27`.
- calls **Seats [seats-service]**. Evidence: `packages/features/bookings/lib/service/RegularBookingService.ts:1586`.
- calls **User availability [user-availability]**. EnsureAvailableUsers. Evidence: `packages/features/bookings/lib/service/RegularBookingService.ts:902`.
- reads from **EventType [event-type-model]**. Evidence: `packages/features/bookings/lib/service/RegularBookingService.ts:523`.
- writes to **Booking [booking-model]**. Evidence: `packages/features/bookings/lib/service/RegularBookingService.ts:1707`, `packages/features/bookings/lib/service/RegularBookingService.ts:684`.
- emits events to **Tasker [tasker]**. Queues emails / no-show triggers. Evidence: `packages/features/bookings/lib/service/RegularBookingService.ts:30`.
- emits events to **Webhooks [webhooks]**. BOOKING_CREATED. Evidence: `packages/features/bookings/lib/service/RegularBookingService.ts:28`.
- uses **Booking fields schema [booking-fields-schema]**. Validates request body.
Used by 1 other component.

#### Booking limits [booking-limits]
Kind: service.
Per-day/week/month booking and duration caps.
Files (4):
- `packages/features/bookings/lib/handleNewBooking/checkBookingAndDurationLimits.ts`
- `packages/features/bookings/lib/checkBookingLimits.ts`
- `packages/features/bookings/lib/checkDurationLimits.ts`
- `packages/features/bookings/lib/handleNewBooking/checkActiveBookingsLimitForBooker.ts`
Used by 2 other components.

#### Seats [seats-service]
Kind: service.
Multi-attendee ("seated") events share one booking row.
Files (2):
- `packages/features/bookings/lib/handleSeats/handleSeats.ts`
- `packages/features/bookings/lib/handleNewBooking/getSeatedBooking.ts`
Used by 1 other component.

#### Cancel booking service [cancel-service]
Kind: service.
Cancels, removes calendar events, sends cancellation emails.
Files (4):
- `packages/features/bookings/lib/handleCancelBooking.ts` (entry)
- `packages/features/bookings/lib/handleCancelBooking/types.ts`
- `packages/features/bookings/di/BookingCancelService.container.ts`
- `packages/features/bookings/lib/cancellationReason.ts`
This component:
- calls **Email manager [email-manager]**. Evidence: `packages/features/bookings/lib/handleCancelBooking.ts:5`.
- calls **Event manager [event-manager]**. Evidence: `packages/features/bookings/lib/handleCancelBooking.ts:7`.
- writes to **Booking [booking-model]**. Evidence: `packages/features/bookings/lib/handleCancelBooking.ts:41`.
- emits events to **Webhooks [webhooks]**. BOOKING_CANCELLED.
Used by 1 other component.

#### Confirmation service [confirmation-service]
Kind: service.
Organizer accepts a booking that required confirmation.
Files (1):
- `packages/features/bookings/lib/handleConfirmation.ts`
This component:
- calls **Email manager [email-manager]**. Evidence: `packages/features/bookings/lib/handleConfirmation.ts:108`.
- calls **Event manager [event-manager]**. Evidence: `packages/features/bookings/lib/handleConfirmation.ts:78`.
Used by 1 other component.

### Group: HTTP / tRPC endpoints

#### Slots endpoint [slots-endpoint]
Kind: endpoint.
Returns the bookable slots for an event type over a date range.
Routes: `trpc viewer.slots.getSchedule`.
Files (6):
- `packages/trpc/server/routers/viewer/slots/_router.tsx`
- `packages/trpc/server/routers/viewer/slots/getSchedule.handler.ts` (handler)
- `packages/trpc/server/routers/viewer/slots/getSchedule.schema.ts`
- `packages/trpc/server/routers/viewer/slots/types.ts`
- `packages/trpc/server/routers/viewer/slots/util.ts`
- `apps/web/pages/api/trpc/slots/[trpc].ts`
This component:
- calls **Available slots service [available-slots-service]**. Evidence: `packages/trpc/server/routers/viewer/slots/getSchedule.handler.ts:6`.
Used by 1 other component.

#### Reserve slot endpoint [reserve-slot-endpoint]
Kind: endpoint.
Temporarily holds a slot while the attendee fills the form.
Routes: `trpc viewer.slots.reserveSlot`, `trpc viewer.slots.isAvailable`.
Files (6):
- `packages/trpc/server/routers/viewer/slots/reserveSlot.handler.ts` (handler)
- `packages/trpc/server/routers/viewer/slots/reserveSlot.schema.ts`
- `packages/trpc/server/routers/viewer/slots/isAvailable.handler.ts`
- `packages/trpc/server/routers/viewer/slots/isAvailable.schema.ts`
- `packages/trpc/server/routers/viewer/slots/removeSelectedSlot.schema.ts`
- `packages/features/bookings/Booker/useSlotReservationId.ts`
This component:
- writes to **SelectedSlots [selected-slots-model]**. Evidence: `packages/trpc/server/routers/viewer/slots/reserveSlot.handler.ts:6`.
Used by 1 other component.

#### Book event endpoint [book-event-endpoint]
Kind: endpoint.
Creates a booking. Rate-limited and bot-checked.
Next.js API route. Resolves the session (if any), checks rate limits, Turnstile and bot detection, then delegates to the regular (or recurring) booking service.
Routes: `POST /api/book/event`, `POST /api/book/recurring-event`.
Files (2):
- `apps/web/pages/api/book/event.ts` (handler)
- `apps/web/pages/api/book/recurring-event.ts`
This component:
- calls **Booking service [booking-service]**. Evidence: `apps/web/pages/api/book/event.ts:3`.
Used by 1 other component.

#### Cancel endpoint [cancel-endpoint]
Kind: endpoint.
Cancels a booking (attendee or organizer).
Routes: `POST /api/cancel`.
Files (1):
- `apps/web/app/api/cancel/route.ts` (handler)
This component:
- calls **Cancel booking service [cancel-service]**.
Used by 2 other components.

#### Bookings tRPC router [bookings-trpc-router]
Kind: endpoint.
Organizer-side booking operations (confirm, reschedule, edit location, guests).
Routes: `trpc viewer.bookings.*`.
Files (9):
- `packages/trpc/server/routers/viewer/bookings/_router.tsx` (entry)
- `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts`
- `packages/trpc/server/routers/viewer/bookings/confirm.schema.ts`
- `packages/trpc/server/routers/viewer/bookings/get.handler.ts`
- `packages/trpc/server/routers/viewer/bookings/get.schema.ts`
- `packages/trpc/server/routers/viewer/bookings/getBookingDetails.handler.ts`
- `packages/trpc/server/routers/viewer/bookings/requestReschedule.handler.ts`
- `packages/trpc/server/routers/viewer/bookings/editLocation.handler.ts`
- `packages/trpc/server/routers/viewer/bookings/addGuests.handler.ts`
This component:
- calls **Confirmation service [confirmation-service]**. Evidence: `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts`.
- reads from **Booking [booking-model]**.
Used by 2 other components.

#### Attendee bookings endpoint [attendee-bookings-endpoint] (NEW, requested)
Kind: endpoint.
New: returns bookings for a verified attendee email.
Routes: `trpc viewer.public.attendeeBookings`.
Files: none yet.
This component:
- reads from **Booking [booking-model]** (NEW, requested).
Used by 1 other component.

### Group: Availability & slots

#### Available slots service [available-slots-service]
Kind: service.
Turns working hours minus busy times into discrete slots.
Files (3):
- `packages/features/di/containers/AvailableSlots.ts`
- `packages/features/schedules/lib/slots.ts`
- `packages/features/availability/lib/getAggregatedAvailability/getAggregatedAvailability.ts`
This component:
- calls **User availability [user-availability]**.
Used by 1 other component.

#### User availability [user-availability]
Kind: service.
Working hours, date overrides, busy times and limits for one user.
Files (6):
- `packages/features/availability/lib/getUserAvailability.ts` (entry)
- `packages/features/availability/lib/detectEventTypeScheduleForUser.ts`
- `packages/features/availability/lib/findUsersForAvailabilityCheck.ts`
- `packages/features/busyTimes/services/getBusyTimes.ts`
- `packages/features/busyTimes/lib/getBusyTimesFromLimits.ts`
- `packages/features/schedules/repositories/ScheduleRepository.ts`
This component:
- calls **Booking limits [booking-limits]**. Evidence: `packages/features/availability/lib/getUserAvailability.ts:6`.
- calls **Calendar & video apps [calendar-apps]**. Fetches busy times from connected calendars.
- reads from **Booking [booking-model]**. Existing bookings as busy times. Evidence: `packages/features/availability/lib/getUserAvailability.ts:9`.
- reads from **User & Schedule [user-schedule-model]**. Working hours & overrides.
Used by 2 other components.

### Group: Side effects after booking

#### Event manager [event-manager]
Kind: service.
Creates/updates/deletes the calendar event and video meeting for a booking.
Files (3):
- `packages/features/bookings/lib/EventManager.ts` (entry)
- `packages/features/calendars/lib/CalendarManager.ts`
- `packages/features/bookings/lib/getAllCredentialsForUsersOnEvent/getAllCredentials.ts`
This component:
- calls **Calendar & video apps [calendar-apps]**. Evidence: `packages/features/bookings/lib/EventManager.ts:10`, `packages/features/bookings/lib/EventManager.ts:11` and 1 more.
- writes to **Booking [booking-model]**. Stores BookingReference rows.
Used by 3 other components.

#### Calendar & video apps [calendar-apps]
Kind: external.
Google/Outlook/CalDAV calendars and Cal Video/Zoom adapters from the app store.
Files (3):
- `packages/app-store/googlecalendar/lib/CalendarService.ts`
- `packages/app-store/dailyvideo/lib/VideoApiAdapter.ts`
- `packages/app-store/_utils/getCalendar.ts`
Used by 2 other components.

#### Email manager [email-manager]
Kind: service.
Sends scheduled / rescheduled / cancelled emails to organizer and attendees.
Files (5):
- `packages/emails/email-manager.ts` (entry)
- `packages/emails/src/templates/AttendeeScheduledEmail.tsx`
- `packages/emails/src/templates/OrganizerScheduledEmail.tsx`
- `packages/emails/src/templates/AttendeeCancelledEmail.tsx`
- `packages/features/bookings/lib/BookingEmailSmsHandler.ts`
Used by 3 other components.

#### Webhooks [webhooks]
Kind: service.
BOOKING_CREATED / CANCELLED / RESCHEDULED payloads to subscribers.
Files (2):
- `packages/features/bookings/lib/handleWebhookTrigger.ts`
- `packages/features/webhooks/lib/sendPayload.ts`
Used by 2 other components.

#### Payments [payments]
Kind: service.
Collects payment (Stripe etc.) for paid event types before confirming.
Files (2):
- `packages/features/bookings/lib/handlePayment.ts`
- `packages/app-store/stripepayment/lib/PaymentService.ts`
Used by 1 other component.

#### Tasker [tasker]
Kind: job.
Background task queue used for async emails and no-show triggers.
Files (5):
- `packages/features/tasker/index.ts`
- `packages/features/tasker/internal-tasker.ts`
- `packages/features/tasker/task-processor.ts`
- `packages/features/tasker/repository.ts`
- `packages/features/bookings/lib/tasker/BookingEmailAndSmsTasker.ts`
This component:
- calls **Email manager [email-manager]**.
Used by 1 other component.

### Group: Data models

#### Booking [booking-model]
Kind: model.
Booking, Attendee and BookingReference tables plus the repository.
Files (3):
- `packages/prisma/schema.prisma` (schema, lines 801-945)
- `packages/features/bookings/repositories/BookingRepository.ts`
- `packages/features/bookings/repositories/IBookingRepository.ts`
Used by 7 other components.

#### EventType [event-type-model]
Kind: model.
The bookable event definition (length, hosts, fields, limits).
Files (3):
- `packages/prisma/schema.prisma` (schema, lines 156-400)
- `packages/features/eventtypes/lib/getPublicEvent.ts`
- `packages/features/eventtypes/lib/getEventTypeById.ts`
Used by 2 other components.

#### User & Schedule [user-schedule-model]
Kind: model.
User, Schedule and Availability tables.
Files (2):
- `packages/prisma/schema.prisma` (schema, lines 401-1000)
- `packages/features/users/repositories/UserRepository.ts`
Used by 1 other component.

#### SelectedSlots [selected-slots-model]
Kind: model.
Short-lived slot reservations.
Files (1):
- `packages/prisma/schema.prisma` (schema, lines 1437-1460)
Used by 1 other component.

### Group: Organizer dashboard

#### Bookings list page [bookings-list-page]
Kind: page.
Upcoming / past / cancelled bookings for the signed-in user.
Routes: `/bookings/[status]`.
Files (6):
- `apps/web/app/(use-page-wrapper)/(main-nav)/bookings/[status]/page.tsx` (route)
- `apps/web/modules/bookings/views/bookings-view.tsx`
- `apps/web/modules/bookings/components/BookingList.tsx`
- `apps/web/modules/bookings/components/BookingListContainer.tsx`
- `apps/web/components/booking/BookingListItem.tsx`
- `apps/web/modules/bookings/components/BookingDetailsSheet.tsx`
This component:
- renders **Booking actions [booking-actions]**.
- calls **Bookings tRPC router [bookings-trpc-router]**. Viewer.bookings.get.
Used by 0 other components.

#### Booking actions [booking-actions]
Kind: component.
Accept / reject / cancel / reschedule / edit-location menu.
Files (7):
- `apps/web/components/booking/actions/BookingActionsDropdown.tsx`
- `apps/web/components/booking/actions/bookingActions.ts`
- `apps/web/components/booking/actions/store.ts`
- `apps/web/components/booking/AcceptBookingButton.tsx`
- `apps/web/components/booking/RejectBookingButton.tsx`
- `apps/web/components/dialog/CancelBookingDialog.tsx`
- `apps/web/components/booking/hooks/useBookingConfirmation.tsx`
This component:
- calls **Bookings tRPC router [bookings-trpc-router]**. Confirm / requestReschedule / editLocation.
- calls **Cancel endpoint [cancel-endpoint]**.
Used by 1 other component.
