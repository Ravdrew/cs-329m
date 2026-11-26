# Cal.com booking subsystem components

This is a component-level map of the `calcom/cal.com` code at commit `54343aa685ae`. It has 33 components and 295 dependencies between them. Component names are followed by their id in square brackets. A sentence such as "A calls B" means code in A depends on B.

Responsibility-oriented grouping of the pinned booking-scoped structural input. Dependencies are static links rather than a verified runtime workflow.

## Requested change

None. The graph describes the code as it is; no component or dependency is marked as changed.

## Components

#### User and aggregate availability [availability]
Kind: service.
Resolve user schedules and aggregate availability across event hosts.
User-availability service, schedule detection, host selection for availability checks and date-range aggregation helpers, plus the indexed loading placeholder.
Files (7):
- `packages/features/availability/components/SkeletonLoader.tsx`
- `packages/features/availability/lib/detectEventTypeScheduleForUser.ts`
- `packages/features/availability/lib/findUsersForAvailabilityCheck.ts`
- `packages/features/availability/lib/getAggregatedAvailability/date-range-utils/filterRedundantDateRanges.ts`
- `packages/features/availability/lib/getAggregatedAvailability/date-range-utils/mergeOverlappingDateRanges.ts`
- `packages/features/availability/lib/getAggregatedAvailability/getAggregatedAvailability.ts`
- `packages/features/availability/lib/getUserAvailability.ts`
This component:
- calls **Booking persistence and lookup [booking-data]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/availability/lib/getUserAvailability.ts:321`.
- calls **Busy-time constraints [busy-times]**. 4 static relationships across 2 distinct file pairs. Evidence: `packages/features/availability/lib/getUserAvailability.ts:546`.
- calls **Event type definitions and retrieval [eventtypes]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/availability/lib/getUserAvailability.ts:289`.
- calls **Prisma client and database support [prisma]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/availability/lib/getUserAvailability.ts:295`.
- calls **Availability schedule editing [schedules]**. 5 static relationships across 2 distinct file pairs. Evidence: `packages/features/availability/lib/getAggregatedAvailability/getAggregatedAvailability.ts:43`, `packages/features/availability/lib/getUserAvailability.ts:511`.
- uses **Booking creation and rescheduling [booking-create]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/availability/lib/getUserAvailability.ts:30`.
- uses **Booking persistence and lookup [booking-data]**. 3 static relationships across 1 distinct file pairs. Evidence: `packages/features/availability/lib/getUserAvailability.ts:4`.
- uses **Busy-time constraints [busy-times]**. 3 static relationships across 1 distinct file pairs. Evidence: `packages/features/availability/lib/getUserAvailability.ts:5`.
- uses **Event type definitions and retrieval [eventtypes]**. 3 static relationships across 1 distinct file pairs. Evidence: `packages/features/availability/lib/getUserAvailability.ts:10`.
- uses **Prisma client and database support [prisma]**. 8 static relationships across 6 distinct file pairs. Evidence: `packages/features/availability/lib/findUsersForAvailabilityCheck.ts:3`, `packages/features/availability/lib/getUserAvailability.ts:28`.
- uses **Availability schedule editing [schedules]**. 27 static relationships across 4 distinct file pairs. Evidence: `packages/features/availability/lib/getAggregatedAvailability/date-range-utils/filterRedundantDateRanges.ts:1`, `packages/features/availability/lib/getAggregatedAvailability/date-range-utils/mergeOverlappingDateRanges.ts:1` and 1 more.
Used by 9 other components.

#### Shared booker state and client logic [booker-client]
Kind: store.
Maintain booking selections, URL state, layout and reusable client helpers.
Reusable booker store/provider, form and time hooks, selection utilities and presentation primitives. Includes client mutation mapping, HTTP booking request helpers, decoy state and booking-result URL/time helpers.
Files (50):
- `packages/features/bookings/Booker/` (7 files)
- `packages/features/bookings/Booker/components/OverlayCalendar/` (1 file)
- `packages/features/bookings/Booker/hooks/` (7 files)
- `packages/features/bookings/Booker/utils/` (15 files)
- `packages/features/bookings/components/` (3 files)
- `packages/features/bookings/components/event-meta/` (2 files)
- `packages/features/bookings/hooks/` (4 files)
- `packages/features/bookings/lib/` (9 files)
- `packages/features/bookings/lib/client/` (1 file)
- `packages/features/bookings/lib/client/booking-event-form/` (1 file)
This component:
- calls **Booking fields and response validation [booking-input]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/Booker/hooks/useBookingForm.ts:48`, `packages/features/bookings/Booker/hooks/useInitialFormValues.ts:100`.
- calls **Calendar integration services [calendars]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/getCalendarLinks.ts:37`.
- calls **Event type definitions and retrieval [eventtypes]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/getCalendarLinks.ts:185`.
- calls **Prisma client and database support [prisma]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/Booker/utils/layout.ts:4`, `packages/features/bookings/lib/getCalendarLinks.ts:168`.
- uses **User and aggregate availability [availability]**. 5 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/Booker/hooks/useAvailableTimeSlots.ts:5`.
- uses **Booking creation and rescheduling [booking-create]**. 34 static relationships across 12 distinct file pairs. Evidence: `packages/features/bookings/Booker/hooks/useBookerLayout.ts:15`, `packages/features/bookings/Booker/hooks/useBookingForm.ts:9` and 1 more.
- uses **Booking persistence and lookup [booking-data]**. 8 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/Booker/store.ts:8`, `packages/features/bookings/Booker/types.ts:3`.
- uses **Booking fields and response validation [booking-input]**. 10 static relationships across 4 distinct file pairs. Evidence: `packages/features/bookings/Booker/hooks/useBookingForm.ts:8`, `packages/features/bookings/Booker/hooks/useInitialFormValues.ts:5` and 1 more.
- uses **Calendar controls and weekly view state [calendar-ui]**. 3 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/Booker/hooks/useAvailableTimeSlots.ts:4`.
- uses **Calendar integration services [calendars]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/getCalendarLinks.ts:2`.
- uses **Booking calendar and meeting coordination [event-integrations]**. 3 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/bookingSuccessRedirect.ts:7`.
- uses **Event type configuration controls [eventtype-ui]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/components/Section.tsx:21`.
- uses **Event type definitions and retrieval [eventtypes]**. 4 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/getCalendarLinks.ts:9`.
- uses **Prisma client and database support [prisma]**. 23 static relationships across 10 distinct file pairs. Evidence: `packages/features/bookings/Booker/config.ts:5`, `packages/features/bookings/Booker/hooks/useBookerLayout.ts:17` and 1 more.
Used by 14 other components.

#### Time selection and booking form [booker-ui]
Kind: component.
Present event details, available times and the attendee booking form.
Web booker composition with date and slot selection, overlay-calendar controls, event metadata, verification and submission UI. Submission hooks coordinate booking requests, payment links and result navigation.
Files (45):
- `apps/web/modules/bookings/` (1 file)
- `apps/web/modules/bookings/components/` (16 files)
- `apps/web/modules/bookings/components/BookEventForm/` (5 files)
- `apps/web/modules/bookings/components/OverlayCalendar/` (4 files)
- `apps/web/modules/bookings/components/event-meta/` (10 files)
- `apps/web/modules/bookings/hooks/` (9 files)
This component:
- navigates to **Booking result and self-service page [booking-result-ui]**. 3 static relationships across 2 distinct file pairs. Evidence: `apps/web/modules/bookings/hooks/useBookings.ts:158`.
- calls **Shared booker state and client logic [booker-client]**. 109 static relationships across 65 distinct file pairs. Evidence: `apps/web/modules/bookings/components/AvailableTimeSlots.tsx:84`, `apps/web/modules/bookings/components/AvailableTimes.tsx:110` and 1 more.
- calls **Booking fields and response validation [booking-input]**. 1 static relationships across 1 distinct file pairs. Evidence: `apps/web/modules/bookings/hooks/useSkipConfirmStep.ts:28`.
- calls **Availability schedule editing [schedules]**. 3 static relationships across 2 distinct file pairs. Evidence: `apps/web/modules/bookings/components/BookEventForm/BookFormAsModal.tsx:18`, `apps/web/modules/bookings/components/BookerWebWrapper.tsx:39`.
- uses **User and aggregate availability [availability]**. 8 static relationships across 2 distinct file pairs. Evidence: `apps/web/modules/bookings/components/AvailableTimes.tsx:6`, `apps/web/modules/bookings/components/OutOfOfficeInSlots.tsx:3`.
- uses **Shared booker state and client logic [booker-client]**. 193 static relationships across 86 distinct file pairs. Evidence: `apps/web/modules/bookings/components/AvailableTimeSlots.tsx:8`, `apps/web/modules/bookings/components/AvailableTimes.tsx:7` and 1 more.
- uses **Booking creation and rescheduling [booking-create]**. 59 static relationships across 19 distinct file pairs. Evidence: `apps/web/modules/bookings/components/AvailableTimeSlots.tsx:10`, `apps/web/modules/bookings/components/AvailableTimes.tsx:11` and 1 more.
- uses **Booking persistence and lookup [booking-data]**. 5 static relationships across 2 distinct file pairs. Evidence: `apps/web/modules/bookings/components/BookEventForm/BookingFields.tsx:3`, `apps/web/modules/bookings/hooks/useBookings.ts:14`.
- uses **Booking fields and response validation [booking-input]**. 2 static relationships across 1 distinct file pairs. Evidence: `apps/web/modules/bookings/hooks/useSkipConfirmStep.ts:4`.
- uses **Booking management workspace [booking-management-ui]**. 2 static relationships across 1 distinct file pairs. Evidence: `apps/web/modules/bookings/types.ts:13`.
- uses **Calendar controls and weekly view state [calendar-ui]**. 4 static relationships across 2 distinct file pairs. Evidence: `apps/web/modules/bookings/components/DatePicker.tsx:7`, `apps/web/modules/bookings/components/LargeCalendar.tsx:9`.
- uses **Event type definitions and retrieval [eventtypes]**. 2 static relationships across 1 distinct file pairs. Evidence: `apps/web/modules/bookings/components/BookerWebWrapper.tsx:15`.
- uses **Prisma client and database support [prisma]**. 8 static relationships across 5 distinct file pairs. Evidence: `apps/web/modules/bookings/components/AvailableTimeSlots.tsx:16`, `apps/web/modules/bookings/components/AvailableTimesHeader.tsx:8` and 1 more.
- uses **Availability schedule editing [schedules]**. 14 static relationships across 5 distinct file pairs. Evidence: `apps/web/modules/bookings/components/AvailableTimeSlots.tsx:20`, `apps/web/modules/bookings/components/BookEventForm/BookFormAsModal.tsx:14` and 1 more.
Used by 4 other components.

#### Booking audit and history [booking-audit]
Kind: service.
Produce, process, persist and present booking action history.
Audit actors, action strategies and versioned changes feed task processing and audit/history viewer services, backed by repositories and access checks.
Files (47):
- `packages/features/booking-audit/di/` (13 files)
- `packages/features/booking-audit/lib/` (2 files)
- `packages/features/booking-audit/lib/actions/` (15 files)
- `packages/features/booking-audit/lib/common/` (1 file)
- `packages/features/booking-audit/lib/dto/` (1 file)
- `packages/features/booking-audit/lib/repository/` (4 files)
- `packages/features/booking-audit/lib/service/` (9 files)
- `packages/features/booking-audit/lib/types/` (2 files)
This component:
- calls **Booking persistence and lookup [booking-data]**. 6 static relationships across 4 distinct file pairs. Evidence: `packages/features/booking-audit/lib/repository/PrismaAuditActorRepository.ts:57`, `packages/features/booking-audit/lib/service/BookingAuditAccessService.ts:50` and 1 more.
- uses **Booking persistence and lookup [booking-data]**. 22 static relationships across 7 distinct file pairs. Evidence: `packages/features/booking-audit/di/BookingAuditTaskConsumer.module.ts:5`, `packages/features/booking-audit/di/BookingAuditViewerService.module.ts:6` and 1 more.
- uses **Prisma client and database support [prisma]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/features/booking-audit/lib/repository/PrismaAuditActorRepository.ts:1`, `packages/features/booking-audit/lib/repository/PrismaBookingAuditRepository.ts:2`.
Used by 2 other components.

#### Booking creation and rescheduling [booking-create]
Kind: service.
Orchestrate regular and recurring bookings with validation and host assignment.
Creation service and its preparation pipeline load event types and users, validate booking constraints, select hosts, create records and coordinate downstream effects. Includes creation DI, shared booking contracts, confirmation requirements and post-create private-link usage handling.
Files (52):
- `packages/features/bookings/` (2 files)
- `packages/features/bookings/di/` (7 files)
- `packages/features/bookings/lib/` (9 files)
- `packages/features/bookings/lib/conflictChecker/` (1 file)
- `packages/features/bookings/lib/dto/` (2 files)
- `packages/features/bookings/lib/handleNewBooking/` (24 files)
- `packages/features/bookings/lib/interfaces/` (2 files)
- `packages/features/bookings/lib/onBookingEvents/` (2 files)
- `packages/features/bookings/lib/requiresConfirmation/` (1 file)
- `packages/features/bookings/lib/service/` (2 files)
This component:
- calls **Booking persistence and lookup [booking-data]**. Query booking repository for limits and assignment. Booking preparation and host assignment depend on repository contracts and query existing booking intervals and totals. Evidence: `packages/features/bookings/lib/checkBookingLimits.ts:83`, `packages/features/bookings/lib/checkDurationLimits.ts:59` and 1 more.
- calls **Booking fields and response validation [booking-input]**. Validate booking fields. Creation preparation calls field/schema helpers and shares request types with the validation component. Evidence: `packages/features/bookings/lib/dto/types.d.ts:5`, `packages/features/bookings/lib/handleNewBooking/createBooking.ts:10` and 1 more.
- calls **Cancellation and confirmation rules [booking-lifecycle]**. Check minimum reschedule notice. Regular booking service uses the reschedule-notice rule before proceeding. Evidence: `packages/features/bookings/lib/service/RegularBookingService.ts:469`, `packages/features/bookings/lib/service/RegularBookingService.ts:115`.
- calls **Booking notification tasks [booking-notifications]**. Dispatch booking notifications. Creation service references notification taskers and invokes the email/SMS handler. Evidence: `packages/features/bookings/di/RegularBookingService.module.ts:12`, `packages/features/bookings/lib/service/RegularBookingService.ts:30` and 1 more.
- calls **Booking payment and refund policy [booking-payments]**. Handle booking payment. Regular booking service invokes the payment handler. Evidence: `packages/features/bookings/lib/service/RegularBookingService.ts:27`, `packages/features/bookings/lib/service/RegularBookingService.ts:2291`.
- calls **Seated booking lifecycle [booking-seats]**. Delegate seated booking handling. Creation uses seated-booking types and invokes the seat lifecycle handler. Evidence: `packages/features/bookings/lib/service/RegularBookingService.ts:1586`, `packages/features/bookings/lib/handleNewBooking/getSeatedBooking.ts:3` and 1 more.
- calls **Busy-time constraints [busy-times]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/handleNewBooking/ensureAvailableUsers.ts:83`.
- calls **Calendar integration services [calendars]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/getLuckyUser.ts:468`.
- calls **Email notification orchestration [email-dispatch]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/handleBookingRequested.ts:40`.
- calls **Email message and calendar-invite assembly [email-messages]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/service/RegularBookingService.ts:1306`.
- calls **Booking calendar and meeting coordination [event-integrations]**. Coordinate provider events and credentials. Creation loads and refreshes credentials and calls EventManager operations for meeting/calendar changes. Evidence: `packages/features/bookings/lib/service/RegularBookingService.ts:1159`, `packages/features/bookings/lib/service/RegularBookingService.ts:24`.
- calls **Event type definitions and retrieval [eventtypes]**. 6 static relationships across 4 distinct file pairs. Evidence: `packages/features/bookings/lib/handleNewBooking/getEventType.ts:21`, `packages/features/bookings/lib/service/RegularBookingService.ts:639`.
- calls **Prisma client and database support [prisma]**. 6 static relationships across 4 distinct file pairs. Evidence: `packages/features/bookings/lib/handleNewBooking/createBooking.ts:139`, `packages/features/bookings/lib/handleNewBooking/getEventTypesFromDB.ts:230` and 1 more.
- calls **Availability schedule editing [schedules]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/lib/getLuckyUser.ts:658`, `packages/features/bookings/lib/handleNewBooking/ensureAvailableUsers.ts:198`.
- calls **Webhook production and delivery [webhooks]**. Prepare and trigger booking webhooks. Creation and request handling use webhook payload, trigger and scheduling helpers. This includes preparation and cleanup calls, not only emission. Evidence: `packages/features/bookings/lib/handleBookingRequested.ts:2`, `packages/features/bookings/lib/handleNewBooking/scheduleNoShowTriggers.ts:4` and 1 more.
- uses **User and aggregate availability [availability]**. 6 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/lib/conflictChecker/checkForConflicts.ts:4`, `packages/features/bookings/lib/handleNewBooking/types.ts:5`.
- uses **Shared booker state and client logic [booker-client]**. 6 static relationships across 4 distinct file pairs. Evidence: `packages/features/bookings/lib/index.ts:1`.
- uses **Booking management RPC [booking-rpc]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/handleNewBooking/getLocationValuesForDb.ts:8`.
- uses **Calendar integration services [calendars]**. 4 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/lib/getLuckyUser.ts:3`, `packages/features/bookings/types.ts:4`.
- uses **Email notification orchestration [email-dispatch]**. 3 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/handleBookingRequested.ts:1`.
- uses **Email message and calendar-invite assembly [email-messages]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/service/RegularBookingService.ts:16`.
- uses **Event type definitions and retrieval [eventtypes]**. 16 static relationships across 7 distinct file pairs. Evidence: `packages/features/bookings/lib/handleNewBooking/getEventType.ts:1`, `packages/features/bookings/lib/handleNewBooking/getEventTypesFromDB.ts:3` and 1 more.
- uses **Prisma client and database support [prisma]**. 49 static relationships across 36 distinct file pairs. Evidence: `packages/features/bookings/lib/checkDurationLimits.ts:8`, `packages/features/bookings/lib/doesBookingRequireConfirmation.ts:4` and 1 more.
- uses **Availability schedule editing [schedules]**. 4 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/lib/getLuckyUser.ts:6`, `packages/features/bookings/lib/handleNewBooking/ensureAvailableUsers.ts:8`.
Used by 20 other components.

#### Booking persistence and lookup [booking-data]
Kind: store.
Provide repositories and lookup adapters for bookings and related records.
Booking, attendee, seat, reference, payment, tracking and assignment-report persistence contracts and Prisma adapters, with common booking retrieval functions.
Files (21):
- `packages/features/bookingReference/repositories/BookingReferenceRepository.ts`
- `packages/features/bookingReference/repositories/IBookingReferenceRepository.ts`
- `packages/features/bookings/di/Attendee.module.ts`
- `packages/features/bookings/di/BookingAttendeeRepository.module.ts`
- `packages/features/bookings/di/BookingReferenceRepository.module.ts`
- `packages/features/bookings/lib/dto/IBookingAttendeeRepository.ts`
- `packages/features/bookings/lib/get-booking.ts`
- `packages/features/bookings/lib/getAllUserBookings.ts`
- `packages/features/bookings/lib/getBookingInfo.ts`
- `packages/features/bookings/lib/getUserBooking.ts`
- `packages/features/bookings/repositories/AttendeeRepository.ts`
- `packages/features/bookings/repositories/BookingPaymentRepository.interface.ts`
- `packages/features/bookings/repositories/BookingRepository.ts`
- `packages/features/bookings/repositories/BookingSeatRepository.ts`
- `packages/features/bookings/repositories/IAttendeeRepository.ts`
- `packages/features/bookings/repositories/IBookingRepository.ts`
- `packages/features/bookings/repositories/PrismaBookingAttendeeRepository.ts`
- `packages/features/bookings/repositories/PrismaBookingPaymentRepository.ts`
- `packages/features/bookings/repositories/PrismaTrackingRepository.ts`
- `packages/features/bookings/repositories/TrackingRepository.interface.ts`
- `packages/features/bookings/repositories/WrongAssignmentReportRepository.ts`
This component:
- calls **Booking fields and response validation [booking-input]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/get-booking.ts:223`.
- calls **Booking management RPC [booking-rpc]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/getAllUserBookings.ts:47`.
- calls **Booking calendar and meeting coordination [event-integrations]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/repositories/PrismaBookingPaymentRepository.ts:44`, `packages/features/bookings/repositories/WrongAssignmentReportRepository.ts:22`.
- uses **Booking creation and rescheduling [booking-create]**. 7 static relationships across 3 distinct file pairs. Evidence: `packages/features/bookings/repositories/BookingRepository.ts:3`, `packages/features/bookings/repositories/IBookingRepository.ts:2` and 1 more.
- uses **Booking fields and response validation [booking-input]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/get-booking.ts:1`.
- uses **Booking management RPC [booking-rpc]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/getAllUserBookings.ts:6`.
- uses **Prisma client and database support [prisma]**. 19 static relationships across 16 distinct file pairs. Evidence: `packages/features/bookingReference/repositories/BookingReferenceRepository.ts:1`, `packages/features/bookingReference/repositories/IBookingReferenceRepository.ts:1` and 1 more.
Used by 26 other components.

#### Booking HTTP entry points [booking-http]
Kind: endpoint.
Guard HTTP booking creation and cancellation requests and delegate to services.
Web API handlers for single and recurring booking creation, cancellation and the booking tRPC adapter. Creation applies anti-bot and rate-limit checks before calling the booking service.
Files (4):
- `apps/web/app/api/cancel/route.ts`
- `apps/web/pages/api/book/event.ts`
- `apps/web/pages/api/book/recurring-event.ts`
- `apps/web/pages/api/trpc/bookings/[trpc].ts`
This component:
- calls **Booking creation and rescheduling [booking-create]**. Delegate booking creation. HTTP entry points obtain regular or recurring services and call their booking creation operations. Evidence: `apps/web/pages/api/book/event.ts:3`, `apps/web/pages/api/book/recurring-event.ts:3` and 1 more.
- calls **Cancellation and confirmation rules [booking-lifecycle]**. Delegate cancellation. Cancellation HTTP handler imports and calls the booking cancellation handler. Evidence: `apps/web/app/api/cancel/route.ts:7`, `apps/web/app/api/cancel/route.ts:52`.
- calls **Prisma client and database support [prisma]**. 1 static relationships across 1 distinct file pairs. Evidence: `apps/web/app/api/cancel/route.ts:23`.
- uses **Booking management RPC [booking-rpc]**. 3 static relationships across 1 distinct file pairs. Evidence: `apps/web/pages/api/trpc/bookings/[trpc].ts:2`.
- uses **Event type definitions and retrieval [eventtypes]**. 3 static relationships across 1 distinct file pairs. Evidence: `apps/web/pages/api/book/event.ts:5`.
- uses **Prisma client and database support [prisma]**. 3 static relationships across 2 distinct file pairs. Evidence: `apps/web/app/api/cancel/route.ts:11`, `apps/web/pages/api/book/event.ts:13`.
Used by 1 other component.

#### Booking fields and response validation [booking-input]
Kind: model.
Define and validate booking request fields and normalize attendee responses.
Request body and dynamic field schemas shared by booking consumers; response preprocessing handles boolean, multiple-choice, radio and phone values.
Files (6):
- `packages/features/bookings/lib/bookingCreateBodySchema.ts`
- `packages/features/bookings/lib/getBookingDataSchema.ts`
- `packages/features/bookings/lib/getBookingDataSchemaForApi.ts`
- `packages/features/bookings/lib/getBookingFields.ts`
- `packages/features/bookings/lib/getBookingResponsesSchema.ts`
- `packages/features/bookings/lib/getCalEventResponses.ts`
This component:
- calls **Prisma client and database support [prisma]**. 8 static relationships across 3 distinct file pairs. Evidence: `packages/features/bookings/lib/getBookingFields.ts:49`, `packages/features/bookings/lib/getBookingResponsesSchema.ts:315` and 1 more.
- uses **Booking creation and rescheduling [booking-create]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/bookingCreateBodySchema.ts:52`.
- uses **Booking calendar and meeting coordination [event-integrations]**. 5 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/lib/getBookingFields.ts:6`, `packages/features/bookings/lib/getCalEventResponses.ts:9`.
- uses **Prisma client and database support [prisma]**. 15 static relationships across 5 distinct file pairs. Evidence: `packages/features/bookings/lib/getBookingFields.ts:6`, `packages/features/bookings/lib/getBookingResponsesSchema.ts:5` and 1 more.
Used by 17 other components.

#### Cancellation and confirmation rules [booking-lifecycle]
Kind: service.
Apply cancellation, confirmation and reschedule-access rules to existing bookings.
Cancellation orchestration validates booking status and cancellation permissions; also owns confirmation handling, internal notes, cancellation reasons and reschedule notice helpers.
Files (12):
- `packages/features/bookings/di/BookingCancelService.container.ts`
- `packages/features/bookings/di/BookingCancelService.module.ts`
- `packages/features/bookings/lib/cancellationReason.ts`
- `packages/features/bookings/lib/dto/BookingCancel.d.ts`
- `packages/features/bookings/lib/getBookingToDelete.ts`
- `packages/features/bookings/lib/handleCancelBooking.ts`
- `packages/features/bookings/lib/handleCancelBooking/types.ts`
- `packages/features/bookings/lib/handleConfirmation.ts`
- `packages/features/bookings/lib/handleInternalNote.ts`
- `packages/features/bookings/lib/interfaces/IBookingCancelService.ts`
- `packages/features/bookings/lib/reschedule/determineReschedulePreventionRedirect.ts`
- `packages/features/bookings/lib/reschedule/isWithinMinimumRescheduleNotice.ts`
This component:
- calls **Booking creation and rescheduling [booking-create]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/handleConfirmation.ts:379`.
- calls **Booking persistence and lookup [booking-data]**. 5 static relationships across 3 distinct file pairs. Evidence: `packages/features/bookings/lib/handleCancelBooking.ts:367`.
- calls **Booking fields and response validation [booking-input]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/lib/handleCancelBooking.ts:247`, `packages/features/bookings/lib/handleConfirmation.ts:345`.
- calls **Booking payment and refund policy [booking-payments]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/lib/handleCancelBooking.ts:411`.
- calls **Seated booking lifecycle [booking-seats]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/handleCancelBooking.ts:309`.
- calls **Email notification orchestration [email-dispatch]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/lib/handleCancelBooking.ts:509`, `packages/features/bookings/lib/handleConfirmation.ts:108`.
- calls **Booking calendar and meeting coordination [event-integrations]**. 3 static relationships across 3 distinct file pairs. Evidence: `packages/features/bookings/lib/handleCancelBooking.ts:462`, `packages/features/bookings/lib/handleConfirmation.ts:80`.
- calls **Event type definitions and retrieval [eventtypes]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/handleCancelBooking.ts:288`.
- calls **Prisma client and database support [prisma]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/lib/handleCancelBooking.ts:105`, `packages/features/bookings/lib/handleConfirmation.ts:76`.
- calls **Webhook production and delivery [webhooks]**. 6 static relationships across 4 distinct file pairs. Evidence: `packages/features/bookings/lib/handleCancelBooking.ts:328`, `packages/features/bookings/lib/handleConfirmation.ts:355`.
- uses **Booking creation and rescheduling [booking-create]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/handleConfirmation.ts:21`.
- uses **Booking persistence and lookup [booking-data]**. 19 static relationships across 5 distinct file pairs. Evidence: `packages/features/bookings/di/BookingCancelService.module.ts:4`, `packages/features/bookings/lib/handleCancelBooking.ts:6`.
- uses **Booking fields and response validation [booking-input]**. 4 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/lib/handleCancelBooking.ts:8`, `packages/features/bookings/lib/handleConfirmation.ts:20`.
- uses **Booking payment and refund policy [booking-payments]**. 4 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/lib/handleCancelBooking.ts:9`.
- uses **Seated booking lifecycle [booking-seats]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/handleCancelBooking.ts:50`.
- uses **Email notification orchestration [email-dispatch]**. 4 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/lib/handleCancelBooking.ts:5`, `packages/features/bookings/lib/handleConfirmation.ts:2`.
- uses **Booking calendar and meeting coordination [event-integrations]**. 11 static relationships across 3 distinct file pairs. Evidence: `packages/features/bookings/lib/handleCancelBooking.ts:7`, `packages/features/bookings/lib/handleConfirmation.ts:3`.
- uses **Event type definitions and retrieval [eventtypes]**. 3 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/lib/handleCancelBooking.ts:11`.
- uses **Prisma client and database support [prisma]**. 18 static relationships across 9 distinct file pairs. Evidence: `packages/features/bookings/lib/dto/BookingCancel.d.ts:7`, `packages/features/bookings/lib/getBookingToDelete.ts:1` and 1 more.
- uses **Webhook production and delivery [webhooks]**. 24 static relationships across 8 distinct file pairs. Evidence: `packages/features/bookings/lib/handleCancelBooking.ts:16`, `packages/features/bookings/lib/handleConfirmation.ts:5`.
Used by 9 other components.

#### Booking access and attendee services [booking-management]
Kind: service.
Enforce access and expose attendee, detail and assignment-report operations.
Application services above the repositories for inspecting and changing attendee membership, retrieving details and reporting incorrect assignments. Includes rating updates and service construction.
Files (10):
- `packages/features/bookings/di/BookingAttendeesRemoveService.container.ts`
- `packages/features/bookings/di/BookingAttendeesRemoveService.module.ts`
- `packages/features/bookings/di/BookingAttendeesService.container.ts`
- `packages/features/bookings/di/BookingAttendeesService.module.ts`
- `packages/features/bookings/lib/rating.ts`
- `packages/features/bookings/services/BookingAccessService.ts`
- `packages/features/bookings/services/BookingAttendeesRemoveService.ts`
- `packages/features/bookings/services/BookingAttendeesService.ts`
- `packages/features/bookings/services/BookingDetailsService.ts`
- `packages/features/bookings/services/WrongAssignmentReportService.ts`
This component:
- calls **Booking persistence and lookup [booking-data]**. 11 static relationships across 6 distinct file pairs. Evidence: `packages/features/bookings/services/BookingAccessService.ts:70`, `packages/features/bookings/services/BookingAttendeesRemoveService.ts:103` and 1 more.
- calls **Booking notification tasks [booking-notifications]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/services/BookingAttendeesService.ts:164`.
- calls **Booking management RPC [booking-rpc]**. 15 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/services/BookingAttendeesRemoveService.ts:47`, `packages/features/bookings/services/BookingAttendeesService.ts:95`.
- calls **Email message and calendar-invite assembly [email-messages]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/services/BookingAttendeesRemoveService.ts:128`.
- calls **Webhook production and delivery [webhooks]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/services/WrongAssignmentReportService.ts:135`.
- uses **Booking persistence and lookup [booking-data]**. 23 static relationships across 7 distinct file pairs. Evidence: `packages/features/bookings/di/BookingAttendeesRemoveService.module.ts:4`, `packages/features/bookings/services/BookingAccessService.ts:4` and 1 more.
- uses **Booking notification tasks [booking-notifications]**. 3 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/services/BookingAttendeesService.ts:2`.
- uses **Booking management RPC [booking-rpc]**. 35 static relationships across 3 distinct file pairs. Evidence: `packages/features/bookings/services/BookingAttendeesRemoveService.ts:8`, `packages/features/bookings/services/BookingAttendeesService.ts:8`.
- uses **Email message and calendar-invite assembly [email-messages]**. 3 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/services/BookingAttendeesRemoveService.ts:1`.
- uses **Prisma client and database support [prisma]**. 3 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/services/BookingAttendeesRemoveService.ts:7`, `packages/features/bookings/services/WrongAssignmentReportService.ts:6`.
- uses **Webhook production and delivery [webhooks]**. 4 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/services/WrongAssignmentReportService.ts:1`.
Used by 4 other components.

#### Booking management workspace [booking-management-ui]
Kind: component.
List, filter, inspect and act on existing bookings.
Authenticated booking list and calendar workspace, detail-sheet state, selection and navigation hooks, action controls and audit-log entry page.
Files (51):
- `apps/web/app/(use-page-wrapper)/(main-nav)/booking/[uid]/logs/` (1 file)
- `apps/web/app/(use-page-wrapper)/(main-nav)/bookings/[status]/` (1 file)
- `apps/web/components/booking/` (6 files)
- `apps/web/components/booking/actions/` (4 files)
- `apps/web/components/booking/hooks/` (1 file)
- `apps/web/modules/bookings/columns/` (1 file)
- `apps/web/modules/bookings/components/` (8 files)
- `apps/web/modules/bookings/hooks/` (22 files)
- `apps/web/modules/bookings/lib/` (5 files)
- `apps/web/modules/bookings/store/` (1 file)
- `apps/web/modules/bookings/views/` (1 file)
This component:
- navigates to **Booking result and self-service page [booking-result-ui]**. 2 static relationships across 1 distinct file pairs. Evidence: `apps/web/modules/bookings/components/BookingDetailsSheet.tsx:880`.
- calls **Shared booker state and client logic [booker-client]**. 2 static relationships across 2 distinct file pairs. Evidence: `apps/web/modules/bookings/components/BookingCalendarView.tsx:26`, `apps/web/modules/bookings/components/BookingDetailsSheet.tsx:645`.
- calls **Booking HTTP entry points [booking-http]**. 1 static relationships across 1 distinct file pairs. Evidence: `apps/web/components/booking/CancelBooking.tsx:286`.
- calls **Cancellation and confirmation rules [booking-lifecycle]**. 2 static relationships across 2 distinct file pairs. Evidence: `apps/web/components/booking/CancelBooking.tsx:167`, `apps/web/components/booking/actions/bookingActions.ts:252`.
- calls **Booking payment and refund policy [booking-payments]**. 1 static relationships across 1 distinct file pairs. Evidence: `apps/web/components/booking/CancelBooking.tsx:155`.
- calls **Booking result and self-service page [booking-result-ui]**. 2 static relationships across 2 distinct file pairs. Evidence: `apps/web/modules/bookings/components/BookingDetailsSheet.tsx:768`.
- calls **Prisma client and database support [prisma]**. 4 static relationships across 2 distinct file pairs. Evidence: `apps/web/components/booking/BookingListItem.tsx:80`, `apps/web/modules/bookings/components/BookingDetailsSheet.tsx:255`.
- uses **Shared booker state and client logic [booker-client]**. 3 static relationships across 3 distinct file pairs. Evidence: `apps/web/modules/bookings/components/BookingCalendarView.tsx:4`, `apps/web/modules/bookings/components/BookingDetailsSheet.tsx:4`.
- uses **Time selection and booking form [booker-ui]**. 112 static relationships across 20 distinct file pairs. Evidence: `apps/web/components/booking/BookingListItem.tsx:46`, `apps/web/modules/bookings/columns/filterColumns.ts:5` and 1 more.
- uses **Booking creation and rescheduling [booking-create]**. 1 static relationships across 1 distinct file pairs. Evidence: `apps/web/modules/bookings/components/BookingCalendarView.tsx:4`.
- uses **Cancellation and confirmation rules [booking-lifecycle]**. 4 static relationships across 2 distinct file pairs. Evidence: `apps/web/components/booking/CancelBooking.tsx:4`, `apps/web/components/booking/actions/bookingActions.ts:1`.
- uses **Booking payment and refund policy [booking-payments]**. 2 static relationships across 1 distinct file pairs. Evidence: `apps/web/components/booking/CancelBooking.tsx:5`.
- uses **Booking result and self-service page [booking-result-ui]**. 4 static relationships across 2 distinct file pairs. Evidence: `apps/web/modules/bookings/components/BookingDetailsSheet.tsx:44`.
- uses **Calendar controls and weekly view state [calendar-ui]**. 2 static relationships across 1 distinct file pairs. Evidence: `apps/web/modules/bookings/components/BookingCalendarView.tsx:5`.
- uses **Prisma client and database support [prisma]**. 10 static relationships across 5 distinct file pairs. Evidence: `apps/web/app/(use-page-wrapper)/(main-nav)/bookings/[status]/page.tsx:3`, `apps/web/components/booking/BookingListItem.tsx:17` and 1 more.
Used by 4 other components.

#### Booking notification tasks [booking-notifications]
Kind: service.
Dispatch booking email and SMS work through sync or background task adapters.
Action-specific notification handler for requests, confirmations and reschedules with task service, tasker implementations, trigger jobs and dependency injection.
Files (23):
- `packages/features/bookings/di/BookingEmailSmsHandler.container.ts`
- `packages/features/bookings/di/BookingEmailSmsHandler.module.ts`
- `packages/features/bookings/di/tasker/BookingEmailAndSmsSyncTasker.container.ts`
- `packages/features/bookings/di/tasker/BookingEmailAndSmsSyncTasker.module.ts`
- `packages/features/bookings/di/tasker/BookingEmailAndSmsTaskService.container.ts`
- `packages/features/bookings/di/tasker/BookingEmailAndSmsTaskService.module.ts`
- `packages/features/bookings/di/tasker/BookingEmailAndSmsTasker.container.ts`
- `packages/features/bookings/di/tasker/BookingEmailAndSmsTasker.module.ts`
- `packages/features/bookings/di/tasker/BookingEmailAndSmsTriggerDevTasker.container.ts`
- `packages/features/bookings/di/tasker/BookingEmailAndSmsTriggerDevTasker.module.ts`
- `packages/features/bookings/di/tasker/tokens.ts`
- `packages/features/bookings/lib/BookingEmailSmsHandler.ts`
- `packages/features/bookings/lib/tasker/BookingEmailAndSmsSyncTasker.ts`
- `packages/features/bookings/lib/tasker/BookingEmailAndSmsTaskService.ts`
- `packages/features/bookings/lib/tasker/BookingEmailAndSmsTasker.ts`
- `packages/features/bookings/lib/tasker/BookingEmailAndSmsTriggerTasker.ts`
- `packages/features/bookings/lib/tasker/trigger/notifications/config.ts`
- `packages/features/bookings/lib/tasker/trigger/notifications/confirm.ts`
- `packages/features/bookings/lib/tasker/trigger/notifications/request.ts`
- `packages/features/bookings/lib/tasker/trigger/notifications/reschedule.ts`
- `packages/features/bookings/lib/tasker/trigger/notifications/rr-reschedule.ts`
- `packages/features/bookings/lib/tasker/trigger/notifications/schema.ts`
- `packages/features/bookings/lib/tasker/types.ts`
This component:
- calls **Booking creation and rescheduling [booking-create]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/tasker/BookingEmailAndSmsTaskService.ts:108`.
- calls **Booking persistence and lookup [booking-data]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/tasker/BookingEmailAndSmsTaskService.ts:28`.
- calls **Email notification orchestration [email-dispatch]**. 9 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/BookingEmailSmsHandler.ts:121`.
- uses **Booking creation and rescheduling [booking-create]**. 7 static relationships across 3 distinct file pairs. Evidence: `packages/features/bookings/di/BookingEmailSmsHandler.module.ts:5`, `packages/features/bookings/lib/BookingEmailSmsHandler.ts:2` and 1 more.
- uses **Booking persistence and lookup [booking-data]**. 7 static relationships across 5 distinct file pairs. Evidence: `packages/features/bookings/lib/tasker/BookingEmailAndSmsTaskService.ts:5`, `packages/features/bookings/lib/tasker/trigger/notifications/confirm.ts:19` and 1 more.
- uses **Event type definitions and retrieval [eventtypes]**. 5 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/lib/BookingEmailSmsHandler.ts:3`, `packages/features/bookings/lib/tasker/BookingEmailAndSmsTaskService.ts:7`.
- uses **Prisma client and database support [prisma]**. 5 static relationships across 3 distinct file pairs. Evidence: `packages/features/bookings/lib/BookingEmailSmsHandler.ts:8`, `packages/features/bookings/lib/tasker/BookingEmailAndSmsTasker.ts:4`.
Used by 5 other components.

#### Booking payment and refund policy [booking-payments]
Kind: service.
Coordinate booking payments, refunds and no-show cancellation fees.
Payment setup and cancellation-related charge/refund helpers, including policy deadlines and per-seat successful-payment refunds. Provider implementations themselves are outside this component scope.
Files (9):
- `packages/features/bookings/lib/handlePayment.ts`
- `packages/features/bookings/lib/payment/deletePayment.ts`
- `packages/features/bookings/lib/payment/getBooking.ts`
- `packages/features/bookings/lib/payment/handleNoShowFee.ts`
- `packages/features/bookings/lib/payment/handlePaymentRefund.ts`
- `packages/features/bookings/lib/payment/handleRefundError.ts`
- `packages/features/bookings/lib/payment/processNoShowFeeOnCancellation.ts`
- `packages/features/bookings/lib/payment/processPaymentRefund.ts`
- `packages/features/bookings/lib/payment/shouldChargeNoShowCancellationFee.ts`
This component:
- calls **Booking fields and response validation [booking-input]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/payment/getBooking.ts:182`.
- calls **Email notification orchestration [email-dispatch]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/lib/payment/handleNoShowFee.ts:164`, `packages/features/bookings/lib/payment/handleRefundError.ts:7`.
- calls **Event type definitions and retrieval [eventtypes]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/lib/payment/getBooking.ts:213`, `packages/features/bookings/lib/payment/handleNoShowFee.ts:116`.
- calls **Prisma client and database support [prisma]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/lib/payment/getBooking.ts:138`, `packages/features/bookings/lib/payment/processPaymentRefund.ts:35`.
- uses **Booking fields and response validation [booking-input]**. 5 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/lib/handlePayment.ts:4`, `packages/features/bookings/lib/payment/getBooking.ts:3`.
- uses **Email notification orchestration [email-dispatch]**. 4 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/lib/payment/handleNoShowFee.ts:4`, `packages/features/bookings/lib/payment/handleRefundError.ts:1`.
- uses **Booking calendar and meeting coordination [event-integrations]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/handlePayment.ts:7`.
- uses **Event type definitions and retrieval [eventtypes]**. 6 static relationships across 4 distinct file pairs. Evidence: `packages/features/bookings/lib/payment/getBooking.ts:4`, `packages/features/bookings/lib/payment/handleNoShowFee.ts:6`.
- uses **Prisma client and database support [prisma]**. 16 static relationships across 13 distinct file pairs. Evidence: `packages/features/bookings/lib/handlePayment.ts:7`, `packages/features/bookings/lib/payment/deletePayment.ts:2` and 1 more.
Used by 9 other components.

#### Booking result and self-service page [booking-result-ui]
Kind: page.
Show booking confirmation, meeting access and attendee self-service modes.
Single-booking and success routes with server props, payment state, join-location helpers and dry-run results; handles cancellation and feedback modes on the result page.
Files (13):
- `apps/web/app/(booking-page-wrapper)/booking-successful/[uid]/page.tsx`
- `apps/web/app/(booking-page-wrapper)/booking/[uid]/embed/page.tsx`
- `apps/web/app/(booking-page-wrapper)/booking/[uid]/page.tsx`
- `apps/web/app/(booking-page-wrapper)/booking/dry-run-successful/page.tsx`
- `apps/web/modules/bookings/components/BookingSuccessCard.tsx`
- `apps/web/modules/bookings/components/DecoyBookingSuccessCard.tsx`
- `apps/web/modules/bookings/components/JoinMeetingButton.tsx`
- `apps/web/modules/bookings/components/UnconfirmedBookingBadge.tsx`
- `apps/web/modules/bookings/components/useJoinableLocation.tsx`
- `apps/web/modules/bookings/hooks/usePaymentStatus.ts`
- `apps/web/modules/bookings/views/booking-dry-run-success-view.tsx`
- `apps/web/modules/bookings/views/bookings-single-view.getServerSideProps.tsx`
- `apps/web/modules/bookings/views/bookings-single-view.tsx`
This component:
- navigates to **Booking management workspace [booking-management-ui]**. 1 static relationships across 1 distinct file pairs. Evidence: `apps/web/modules/bookings/components/UnconfirmedBookingBadge.tsx:14`.
- navigates to **Public booking entry pages [public-pages]**. 1 static relationships across 1 distinct file pairs. Evidence: `apps/web/modules/bookings/views/bookings-single-view.tsx:890`.
- calls **Shared booker state and client logic [booker-client]**. 3 static relationships across 3 distinct file pairs. Evidence: `apps/web/modules/bookings/components/useJoinableLocation.tsx:31`, `apps/web/modules/bookings/views/bookings-single-view.tsx:182`.
- calls **Time selection and booking form [booker-ui]**. 1 static relationships across 1 distinct file pairs. Evidence: `apps/web/app/(booking-page-wrapper)/booking-successful/[uid]/page.tsx:13`.
- calls **Booking persistence and lookup [booking-data]**. 3 static relationships across 2 distinct file pairs. Evidence: `apps/web/modules/bookings/views/bookings-single-view.getServerSideProps.tsx:69`.
- calls **Cancellation and confirmation rules [booking-lifecycle]**. 1 static relationships across 1 distinct file pairs. Evidence: `apps/web/modules/bookings/views/bookings-single-view.tsx:408`.
- calls **Booking access and attendee services [booking-management]**. 2 static relationships across 1 distinct file pairs. Evidence: `apps/web/modules/bookings/views/bookings-single-view.tsx:210`.
- calls **Booking management workspace [booking-management-ui]**. 1 static relationships across 1 distinct file pairs. Evidence: `apps/web/modules/bookings/views/bookings-single-view.tsx:108`.
- calls **Event type definitions and retrieval [eventtypes]**. 2 static relationships across 2 distinct file pairs. Evidence: `apps/web/modules/bookings/views/bookings-single-view.getServerSideProps.tsx:99`, `apps/web/modules/bookings/views/bookings-single-view.tsx:284`.
- calls **Prisma client and database support [prisma]**. 3 static relationships across 3 distinct file pairs. Evidence: `apps/web/modules/bookings/components/useJoinableLocation.tsx:27`, `apps/web/modules/bookings/views/bookings-single-view.getServerSideProps.tsx:145` and 1 more.
- uses **Shared booker state and client logic [booker-client]**. 7 static relationships across 4 distinct file pairs. Evidence: `apps/web/modules/bookings/components/useJoinableLocation.tsx:4`, `apps/web/modules/bookings/views/bookings-single-view.tsx:24`.
- uses **Time selection and booking form [booker-ui]**. 2 static relationships across 1 distinct file pairs. Evidence: `apps/web/app/(booking-page-wrapper)/booking-successful/[uid]/page.tsx:7`.
- uses **Booking persistence and lookup [booking-data]**. 6 static relationships across 2 distinct file pairs. Evidence: `apps/web/modules/bookings/views/bookings-single-view.getServerSideProps.tsx:3`.
- uses **Cancellation and confirmation rules [booking-lifecycle]**. 2 static relationships across 1 distinct file pairs. Evidence: `apps/web/modules/bookings/views/bookings-single-view.tsx:27`.
- uses **Booking access and attendee services [booking-management]**. 3 static relationships across 1 distinct file pairs. Evidence: `apps/web/modules/bookings/views/bookings-single-view.tsx:26`.
- uses **Booking management workspace [booking-management-ui]**. 2 static relationships across 1 distinct file pairs. Evidence: `apps/web/modules/bookings/views/bookings-single-view.tsx:66`.
- uses **Event type definitions and retrieval [eventtypes]**. 6 static relationships across 2 distinct file pairs. Evidence: `apps/web/modules/bookings/views/bookings-single-view.getServerSideProps.tsx:5`, `apps/web/modules/bookings/views/bookings-single-view.tsx:28`.
- uses **Prisma client and database support [prisma]**. 7 static relationships across 4 distinct file pairs. Evidence: `apps/web/modules/bookings/components/useJoinableLocation.tsx:6`, `apps/web/modules/bookings/views/bookings-single-view.getServerSideProps.tsx:11` and 1 more.
Used by 5 other components.

#### Booking management RPC [booking-rpc]
Kind: endpoint.
Expose booking queries, confirmation, edits and reporting through tRPC.
Booking router handlers and input schemas for list/detail access, attendees, history, reschedule requests, location edits and assignment reports.
Files (31):
- `packages/trpc/server/routers/viewer/bookings/_router.tsx`
- `packages/trpc/server/routers/viewer/bookings/addGuests.handler.ts`
- `packages/trpc/server/routers/viewer/bookings/addGuests.schema.ts`
- `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts`
- `packages/trpc/server/routers/viewer/bookings/confirm.schema.ts`
- `packages/trpc/server/routers/viewer/bookings/editLocation.handler.ts`
- `packages/trpc/server/routers/viewer/bookings/editLocation.schema.ts`
- `packages/trpc/server/routers/viewer/bookings/find.handler.ts`
- `packages/trpc/server/routers/viewer/bookings/find.schema.ts`
- `packages/trpc/server/routers/viewer/bookings/get.handler.ts`
- `packages/trpc/server/routers/viewer/bookings/get.schema.ts`
- `packages/trpc/server/routers/viewer/bookings/getBookingAttendees.handler.ts`
- `packages/trpc/server/routers/viewer/bookings/getBookingAttendees.schema.ts`
- `packages/trpc/server/routers/viewer/bookings/getBookingDetails.handler.ts`
- `packages/trpc/server/routers/viewer/bookings/getBookingDetails.schema.ts`
- `packages/trpc/server/routers/viewer/bookings/getBookingHistory.handler.ts`
- `packages/trpc/server/routers/viewer/bookings/getBookingHistory.schema.ts`
- `packages/trpc/server/routers/viewer/bookings/getWrongAssignmentReports.handler.ts`
- `packages/trpc/server/routers/viewer/bookings/getWrongAssignmentReports.schema.ts`
- `packages/trpc/server/routers/viewer/bookings/hasWrongAssignmentReport.handler.ts`
- `packages/trpc/server/routers/viewer/bookings/hasWrongAssignmentReport.schema.ts`
- `packages/trpc/server/routers/viewer/bookings/reportBooking.handler.ts`
- `packages/trpc/server/routers/viewer/bookings/reportBooking.schema.ts`
- `packages/trpc/server/routers/viewer/bookings/reportWrongAssignment.handler.ts`
- `packages/trpc/server/routers/viewer/bookings/reportWrongAssignment.schema.ts`
- `packages/trpc/server/routers/viewer/bookings/requestReschedule.handler.ts`
- `packages/trpc/server/routers/viewer/bookings/requestReschedule.schema.ts`
- `packages/trpc/server/routers/viewer/bookings/types.ts`
- `packages/trpc/server/routers/viewer/bookings/updateWrongAssignmentReportStatus.handler.ts`
- `packages/trpc/server/routers/viewer/bookings/updateWrongAssignmentReportStatus.schema.ts`
- `packages/trpc/server/routers/viewer/bookings/util.ts`
This component:
- calls **Booking audit and history [booking-audit]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/getBookingHistory.handler.ts:53`.
- calls **Booking creation and rescheduling [booking-create]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts:286`.
- calls **Booking persistence and lookup [booking-data]**. 11 static relationships across 7 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/addGuests.handler.ts:97`, `packages/trpc/server/routers/viewer/bookings/editLocation.handler.ts:111` and 1 more.
- calls **Booking fields and response validation [booking-input]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts:239`, `packages/trpc/server/routers/viewer/bookings/requestReschedule.handler.ts:214`.
- calls **Cancellation and confirmation rules [booking-lifecycle]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts:364`, `packages/trpc/server/routers/viewer/bookings/reportBooking.handler.ts:85`.
- calls **Booking access and attendee services [booking-management]**. 6 static relationships across 6 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts:167`, `packages/trpc/server/routers/viewer/bookings/getBookingDetails.handler.ts:17` and 1 more.
- calls **Booking notification tasks [booking-notifications]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/addGuests.handler.ts:357`.
- calls **Booking payment and refund policy [booking-payments]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts:415`.
- calls **Email notification orchestration [email-dispatch]**. 3 static relationships across 3 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts:441`, `packages/trpc/server/routers/viewer/bookings/editLocation.handler.ts:310` and 1 more.
- calls **Booking calendar and meeting coordination [event-integrations]**. 3 static relationships across 3 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/addGuests.handler.ts:345`, `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts:354` and 1 more.
- calls **Event type definitions and retrieval [eventtypes]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/addGuests.handler.ts:308`, `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts:291`.
- calls **Prisma client and database support [prisma]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/addGuests.handler.ts:117`, `packages/trpc/server/routers/viewer/bookings/get.handler.ts:782`.
- calls **Webhook production and delivery [webhooks]**. 5 static relationships across 4 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts:479`, `packages/trpc/server/routers/viewer/bookings/requestReschedule.handler.ts:90`.
- uses **Booking audit and history [booking-audit]**. 9 static relationships across 3 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/getBookingHistory.handler.ts:6`.
- uses **Booking creation and rescheduling [booking-create]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts:7`.
- uses **Booking persistence and lookup [booking-data]**. 28 static relationships across 9 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/addGuests.handler.ts:7`, `packages/trpc/server/routers/viewer/bookings/editLocation.handler.ts:6` and 1 more.
- uses **Booking fields and response validation [booking-input]**. 4 static relationships across 2 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts:8`, `packages/trpc/server/routers/viewer/bookings/requestReschedule.handler.ts:8`.
- uses **Cancellation and confirmation rules [booking-lifecycle]**. 4 static relationships across 2 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts:9`, `packages/trpc/server/routers/viewer/bookings/reportBooking.handler.ts:3`.
- uses **Booking access and attendee services [booking-management]**. 18 static relationships across 6 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts:12`, `packages/trpc/server/routers/viewer/bookings/getBookingDetails.handler.ts:1` and 1 more.
- uses **Booking notification tasks [booking-notifications]**. 3 static relationships across 1 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/addGuests.handler.ts:5`.
- uses **Booking payment and refund policy [booking-payments]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts:11`.
- uses **Email notification orchestration [email-dispatch]**. 6 static relationships across 3 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts:4`, `packages/trpc/server/routers/viewer/bookings/editLocation.handler.ts:4` and 1 more.
- uses **Booking calendar and meeting coordination [event-integrations]**. 9 static relationships across 3 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/addGuests.handler.ts:6`, `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts:5` and 1 more.
- uses **Event type definitions and retrieval [eventtypes]**. 6 static relationships across 4 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/addGuests.handler.ts:8`, `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts:13`.
- uses **Prisma client and database support [prisma]**. 34 static relationships across 24 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/addGuests.handler.ts:17`, `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts:28` and 1 more.
- uses **Webhook production and delivery [webhooks]**. 20 static relationships across 7 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts:10`, `packages/trpc/server/routers/viewer/bookings/requestReschedule.handler.ts:11`.
Used by 7 other components.

#### Seated booking lifecycle [booking-seats]
Kind: service.
Create, cancel and move individual seats within shared bookings.
Seat-specific orchestration distinguishes attendee and owner reschedules, combines occupied bookings and handles last-attendee deletion. Guards duplicate registration for an existing time slot.
Files (10):
- `packages/features/bookings/lib/handleSeats/cancel/cancelAttendeeSeat.ts`
- `packages/features/bookings/lib/handleSeats/create/createNewSeat.ts`
- `packages/features/bookings/lib/handleSeats/handleSeats.ts`
- `packages/features/bookings/lib/handleSeats/lib/lastAttendeeDeleteBooking.ts`
- `packages/features/bookings/lib/handleSeats/reschedule/attendee/attendeeRescheduleSeatedBooking.ts`
- `packages/features/bookings/lib/handleSeats/reschedule/owner/combineTwoSeatedBookings.ts`
- `packages/features/bookings/lib/handleSeats/reschedule/owner/moveSeatedBookingToNewTimeSlot.ts`
- `packages/features/bookings/lib/handleSeats/reschedule/owner/ownerRescheduleSeatedBooking.ts`
- `packages/features/bookings/lib/handleSeats/reschedule/rescheduleSeatedBooking.ts`
- `packages/features/bookings/lib/handleSeats/types.d.ts`
This component:
- calls **Booking creation and rescheduling [booking-create]**. 6 static relationships across 6 distinct file pairs. Evidence: `packages/features/bookings/lib/handleSeats/create/createNewSeat.ts:221`, `packages/features/bookings/lib/handleSeats/handleSeats.ts:39` and 1 more.
- calls **Booking payment and refund policy [booking-payments]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/handleSeats/create/createNewSeat.ts:262`.
- calls **Email notification orchestration [email-dispatch]**. 6 static relationships across 5 distinct file pairs. Evidence: `packages/features/bookings/lib/handleSeats/cancel/cancelAttendeeSeat.ts:140`, `packages/features/bookings/lib/handleSeats/create/createNewSeat.ts:206` and 1 more.
- calls **Booking calendar and meeting coordination [event-integrations]**. 7 static relationships across 6 distinct file pairs. Evidence: `packages/features/bookings/lib/handleSeats/create/createNewSeat.ts:216`, `packages/features/bookings/lib/handleSeats/reschedule/attendee/attendeeRescheduleSeatedBooking.ts:42` and 1 more.
- calls **Prisma client and database support [prisma]**. 3 static relationships across 3 distinct file pairs. Evidence: `packages/features/bookings/lib/handleSeats/cancel/cancelAttendeeSeat.ts:42`, `packages/features/bookings/lib/handleSeats/reschedule/attendee/attendeeRescheduleSeatedBooking.ts:71` and 1 more.
- calls **Webhook production and delivery [webhooks]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/features/bookings/lib/handleSeats/cancel/cancelAttendeeSeat.ts:171`, `packages/features/bookings/lib/handleSeats/handleSeats.ts:130`.
- uses **Booking creation and rescheduling [booking-create]**. 45 static relationships across 18 distinct file pairs. Evidence: `packages/features/bookings/lib/handleSeats/create/createNewSeat.ts:13`, `packages/features/bookings/lib/handleSeats/handleSeats.ts:8` and 1 more.
- uses **Cancellation and confirmation rules [booking-lifecycle]**. 3 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/handleSeats/cancel/cancelAttendeeSeat.ts:21`.
- uses **Booking payment and refund policy [booking-payments]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/handleSeats/create/createNewSeat.ts:5`.
- uses **Email notification orchestration [email-dispatch]**. 10 static relationships across 5 distinct file pairs. Evidence: `packages/features/bookings/lib/handleSeats/cancel/cancelAttendeeSeat.ts:6`, `packages/features/bookings/lib/handleSeats/create/createNewSeat.ts:2` and 1 more.
- uses **Booking calendar and meeting coordination [event-integrations]**. 22 static relationships across 8 distinct file pairs. Evidence: `packages/features/bookings/lib/handleSeats/create/createNewSeat.ts:3`, `packages/features/bookings/lib/handleSeats/reschedule/attendee/attendeeRescheduleSeatedBooking.ts:5` and 1 more.
- uses **Prisma client and database support [prisma]**. 16 static relationships across 12 distinct file pairs. Evidence: `packages/features/bookings/lib/handleSeats/cancel/cancelAttendeeSeat.ts:16`, `packages/features/bookings/lib/handleSeats/create/createNewSeat.ts:8` and 1 more.
- uses **Versioned webhook payloads [webhook-payloads]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/handleSeats/types.d.ts:51`.
- uses **Webhook production and delivery [webhooks]**. 16 static relationships across 6 distinct file pairs. Evidence: `packages/features/bookings/lib/handleSeats/cancel/cancelAttendeeSeat.ts:8`, `packages/features/bookings/lib/handleSeats/handleSeats.ts:2` and 1 more.
Used by 3 other components.

#### Busy-time constraints [busy-times]
Kind: service.
Combine existing bookings, calendars and booking limits into busy intervals.
Busy-time calculation accounts for owner and attendee bookings, buffers, seated events and reschedules, with limit-derived blocking periods.
Files (2):
- `packages/features/busyTimes/lib/getBusyTimesFromLimits.ts`
- `packages/features/busyTimes/services/getBusyTimes.ts`
This component:
- calls **Booking persistence and lookup [booking-data]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/busyTimes/lib/getBusyTimesFromLimits.ts:204`.
- calls **Calendar integration services [calendars]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/busyTimes/services/getBusyTimes.ts:197`.
- calls **Event type definitions and retrieval [eventtypes]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/busyTimes/services/getBusyTimes.ts:109`.
- calls **Availability schedule editing [schedules]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/busyTimes/services/getBusyTimes.ts:253`.
- uses **User and aggregate availability [availability]**. 6 static relationships across 2 distinct file pairs. Evidence: `packages/features/busyTimes/lib/getBusyTimesFromLimits.ts:3`, `packages/features/busyTimes/services/getBusyTimes.ts:14`.
- uses **Booking creation and rescheduling [booking-create]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/busyTimes/services/getBusyTimes.ts:14`.
- uses **Booking persistence and lookup [booking-data]**. 8 static relationships across 3 distinct file pairs. Evidence: `packages/features/busyTimes/lib/getBusyTimesFromLimits.ts:4`, `packages/features/busyTimes/services/getBusyTimes.ts:2`.
- uses **Calendar integration services [calendars]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/busyTimes/services/getBusyTimes.ts:3`.
- uses **Event type definitions and retrieval [eventtypes]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/busyTimes/services/getBusyTimes.ts:4`.
- uses **Prisma client and database support [prisma]**. 3 static relationships across 3 distinct file pairs. Evidence: `packages/features/busyTimes/lib/getBusyTimesFromLimits.ts:14`, `packages/features/busyTimes/services/getBusyTimes.ts:13`.
- uses **Availability schedule editing [schedules]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/busyTimes/services/getBusyTimes.ts:5`.
Used by 5 other components.

#### Calendar controls and weekly view state [calendar-ui]
Kind: component.
Supply calendar selectors, date controls and weekly display state.
Reusable calendar controls and weekly-view types, sample data, interval-overlap helpers and store managing visible range, events and selection.
Files (11):
- `packages/features/calendars/components/DatePicker.tsx`
- `packages/features/calendars/components/DestinationCalendarSelector.tsx`
- `packages/features/calendars/components/NoAvailabilityDialog.tsx`
- `packages/features/calendars/weeklyview/_storybookData.ts`
- `packages/features/calendars/weeklyview/components/DefaultOutOfOfficeSlot.tsx`
- `packages/features/calendars/weeklyview/state/store.ts`
- `packages/features/calendars/weeklyview/types/common.ts`
- `packages/features/calendars/weeklyview/types/events.ts`
- `packages/features/calendars/weeklyview/types/state.ts`
- `packages/features/calendars/weeklyview/utils/index.ts`
- `packages/features/calendars/weeklyview/utils/overlap.ts`
This component:
- calls **Shared booker state and client logic [booker-client]**. 3 static relationships across 1 distinct file pairs. Evidence: `packages/features/calendars/components/DatePicker.tsx:177`.
- calls **Calendar integration services [calendars]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/calendars/components/DatePicker.tsx:180`.
- uses **User and aggregate availability [availability]**. 5 static relationships across 1 distinct file pairs. Evidence: `packages/features/calendars/weeklyview/types/state.ts:1`.
- uses **Shared booker state and client logic [booker-client]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/calendars/components/DatePicker.tsx:7`.
- uses **Calendar integration services [calendars]**. 5 static relationships across 2 distinct file pairs. Evidence: `packages/features/calendars/components/DatePicker.tsx:8`.
- uses **Event type definitions and retrieval [eventtypes]**. 3 static relationships across 1 distinct file pairs. Evidence: `packages/features/calendars/components/DestinationCalendarSelector.tsx:1`.
Used by 5 other components.

#### Calendar integration services [calendars]
Kind: service.
Resolve connected calendars, synchronize defaults and manage calendar events.
CalendarManager and connected/destination calendar queries with repository and task adapters. Calendar credentials are cleaned before exposure to clients.
Files (22):
- `packages/features/calendars/di/tasker/CalendarsSyncTasker.module.ts`
- `packages/features/calendars/di/tasker/CalendarsTaskService.container.ts`
- `packages/features/calendars/di/tasker/CalendarsTaskService.module.ts`
- `packages/features/calendars/di/tasker/CalendarsTasker.container.ts`
- `packages/features/calendars/di/tasker/CalendarsTasker.module.ts`
- `packages/features/calendars/di/tasker/CalendarsTriggerTasker.module.ts`
- `packages/features/calendars/di/tasker/tokens.ts`
- `packages/features/calendars/lib/CalendarManager.ts`
- `packages/features/calendars/lib/getAvailableDatesInMonth.ts`
- `packages/features/calendars/lib/getCalendarsEvents.ts`
- `packages/features/calendars/lib/getConnectedDestinationCalendars.ts`
- `packages/features/calendars/lib/tasker/CalendarsSyncTasker.ts`
- `packages/features/calendars/lib/tasker/CalendarsTaskService.ts`
- `packages/features/calendars/lib/tasker/CalendarsTasker.ts`
- `packages/features/calendars/lib/tasker/CalendarsTriggerTasker.ts`
- `packages/features/calendars/lib/tasker/trigger/config.ts`
- `packages/features/calendars/lib/tasker/trigger/ensure-default-calendars.ts`
- `packages/features/calendars/lib/tasker/trigger/schema.ts`
- `packages/features/calendars/lib/tasker/types.ts`
- `packages/features/calendars/lib/timezone-conversion.ts`
- `packages/features/calendars/lib/types.ts`
- `packages/features/calendars/repositories/DestinationCalendarRepository.ts`
This component:
- calls **Booking persistence and lookup [booking-data]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/calendars/repositories/DestinationCalendarRepository.ts:35`.
- uses **User and aggregate availability [availability]**. 5 static relationships across 1 distinct file pairs. Evidence: `packages/features/calendars/lib/types.ts:1`.
- uses **Prisma client and database support [prisma]**. 6 static relationships across 5 distinct file pairs. Evidence: `packages/features/calendars/lib/getConnectedDestinationCalendars.ts:13`, `packages/features/calendars/repositories/DestinationCalendarRepository.ts:4`.
Used by 12 other components.

#### Email notification orchestration [email-dispatch]
Kind: service.
Select recipients and dispatch booking and supporting product notifications.
Email manager coordinates recipient preferences and booking emails/SMS; supporting auth, billing, integration, organization, OAuth, recording and workflow mail services are retained within the indexed scope.
Files (10):
- `packages/emails/auth-email-service.ts`
- `packages/emails/billing-email-service.ts`
- `packages/emails/daily-video-emails.ts`
- `packages/emails/email-manager.ts`
- `packages/emails/email-types.ts`
- `packages/emails/integration-email-service.ts`
- `packages/emails/oauth-email-service.ts`
- `packages/emails/organization-email-service.ts`
- `packages/emails/recording-email-service.ts`
- `packages/emails/workflow-email-service.ts`
This component:
- calls **Email message and calendar-invite assembly [email-messages]**. 9 static relationships across 9 distinct file pairs. Evidence: `packages/emails/auth-email-service.ts:16`, `packages/emails/billing-email-service.ts:12` and 1 more.
- calls **Event type definitions and retrieval [eventtypes]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/emails/email-manager.ts:115`.
- calls **Attendee SMS message support [sms]**. 17 static relationships across 1 distinct file pairs. Evidence: `packages/emails/email-manager.ts:127`.
- uses **Email message and calendar-invite assembly [email-messages]**. 236 static relationships across 62 distinct file pairs. Evidence: `packages/emails/auth-email-service.ts:1`, `packages/emails/billing-email-service.ts:1` and 1 more.
- uses **Email HTML rendering [email-rendering]**. 6 static relationships across 2 distinct file pairs. Evidence: `packages/emails/organization-email-service.ts:7`, `packages/emails/workflow-email-service.ts:7`.
- uses **Event type definitions and retrieval [eventtypes]**. 6 static relationships across 1 distinct file pairs. Evidence: `packages/emails/email-manager.ts:6`.
- uses **Prisma client and database support [prisma]**. 7 static relationships across 3 distinct file pairs. Evidence: `packages/emails/billing-email-service.ts:2`, `packages/emails/email-manager.ts:12`.
- uses **Attendee SMS message support [sms]**. 34 static relationships across 9 distinct file pairs. Evidence: `packages/emails/email-manager.ts:16`.
Used by 11 other components.

#### Email message and calendar-invite assembly [email-messages]
Kind: service.
Build recipient-specific mail payloads, text bodies and ICS attachments.
Message classes and base mail behavior assemble subjects, addressing, reply-to and calendar invites and invoke the rendering layer. Includes shared mail formatting and type utilities.
Files (56):
- `packages/emails/lib/` (4 files)
- `packages/emails/lib/types/` (2 files)
- `packages/emails/lib/utils/` (2 files)
- `packages/emails/templates/` (48 files)
This component:
- renders **Email HTML rendering [email-rendering]**. Render notification HTML. Mail message classes invoke the email renderer to produce template HTML for mail payloads. Evidence: `packages/emails/templates/account-verify-email.ts:37`, `packages/emails/templates/admin-oauth-client-notification.ts:32` and 1 more.
- calls **Calendar integration services [calendars]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/emails/lib/generateIcsString.ts:75`, `packages/emails/templates/organizer-attendee-cancelled-seat-email.ts:11`.
- uses **Calendar integration services [calendars]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/emails/lib/generateIcsString.ts:3`.
- uses **Prisma client and database support [prisma]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/emails/templates/_base-email.ts:10`.
Used by 8 other components.

#### Email HTML rendering [email-rendering]
Kind: component.
Render reusable email layouts and localized notification templates.
React email components, template registry and renderer cover booking details and supporting account, organization and integration notifications.
Files (73):
- `packages/emails/src/` (1 file)
- `packages/emails/src/components/` (24 files)
- `packages/emails/src/templates/` (48 files)
This component:
- calls **Email message and calendar-invite assembly [email-messages]**. 3 static relationships across 2 distinct file pairs. Evidence: `packages/emails/src/templates/AttendeeRequestEmail.tsx:5`, `packages/emails/src/templates/TeamInviteEmail.tsx:27`.
- uses **Email message and calendar-invite assembly [email-messages]**. 47 static relationships across 38 distinct file pairs. Evidence: `packages/emails/src/templates/AttendeeRequestEmail.tsx:1`, `packages/emails/src/templates/BookingRedirectEmailNotification.tsx:1` and 1 more.
Used by 2 other components.

#### Booking calendar and meeting coordination [event-integrations]
Kind: service.
Coordinate calendar, conferencing and CRM integrations for booking events.
EventManager selects and orders credentials for integrations; credential loading and refresh helpers support creation and rescheduling across providers without owning provider-specific implementations.
Files (4):
- `packages/features/bookings/lib/EventManager.ts`
- `packages/features/bookings/lib/getAllCredentialsForUsersOnEvent/getAllCredentials.ts`
- `packages/features/bookings/lib/getAllCredentialsForUsersOnEvent/refreshCredential.ts`
- `packages/features/bookings/lib/getAllCredentialsForUsersOnEvent/refreshCredentials.ts`
This component:
- calls **Calendar integration services [calendars]**. 8 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/EventManager.ts:528`.
- calls **Prisma client and database support [prisma]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/EventManager.ts:392`.
- uses **Calendar integration services [calendars]**. 4 static relationships across 1 distinct file pairs. Evidence: `packages/features/bookings/lib/EventManager.ts:10`.
- uses **Prisma client and database support [prisma]**. 13 static relationships across 8 distinct file pairs. Evidence: `packages/features/bookings/lib/EventManager.ts:27`, `packages/features/bookings/lib/getAllCredentialsForUsersOnEvent/getAllCredentials.ts:6` and 1 more.
Used by 11 other components.

#### Event type configuration controls [eventtype-ui]
Kind: component.
Configure event hosts, booking limits, recurrence and managed event settings.
Indexed event-type editor controls, dialogs and location types. Limit controls translate persisted booking-window modes into editable UI values.
Files (13):
- `packages/features/eventtypes/components/AssignAllTeamMembers.tsx`
- `packages/features/eventtypes/components/BulkEditDefaultForEventsModal.tsx`
- `packages/features/eventtypes/components/CheckedTeamSelect.tsx`
- `packages/features/eventtypes/components/ChildrenEventTypeSelect.tsx`
- `packages/features/eventtypes/components/CreateEventTypeForm.tsx`
- `packages/features/eventtypes/components/LearnMoreLink.tsx`
- `packages/features/eventtypes/components/dialogs/HostEditDialogs.tsx`
- `packages/features/eventtypes/components/dialogs/ManagedEventDialog.tsx`
- `packages/features/eventtypes/components/locations/types.ts`
- `packages/features/eventtypes/components/tabs/limits/EventLimitsTab.tsx`
- `packages/features/eventtypes/components/tabs/limits/MaxActiveBookingsPerBookerController.tsx`
- `packages/features/eventtypes/components/tabs/recurring/EventRecurringTab.tsx`
- `packages/features/eventtypes/components/tabs/recurring/RecurringEventController.tsx`
This component:
- calls **Event type definitions and retrieval [eventtypes]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/eventtypes/components/tabs/limits/EventLimitsTab.tsx:506`.
- uses **Event type definitions and retrieval [eventtypes]**. 67 static relationships across 12 distinct file pairs. Evidence: `packages/features/eventtypes/components/AssignAllTeamMembers.tsx:4`, `packages/features/eventtypes/components/CheckedTeamSelect.tsx:8` and 1 more.
- uses **Prisma client and database support [prisma]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/eventtypes/components/tabs/recurring/RecurringEventController.tsx:10`.
Used by 1 other component.

#### Event type definitions and retrieval [eventtypes]
Kind: service.
Resolve public and managed event definitions, schemas and branding policy.
Event-type repositories and services, public/viewer queries, booking-field configuration, event naming and shared types used by booking flows.
Files (19):
- `packages/features/eventtypes/di/EventTypeService.container.ts`
- `packages/features/eventtypes/di/EventTypeService.module.ts`
- `packages/features/eventtypes/di/tokens.ts`
- `packages/features/eventtypes/eventtypes.repository.interface.ts`
- `packages/features/eventtypes/lib/bookingFieldsManager.ts`
- `packages/features/eventtypes/lib/childrenEventType.ts`
- `packages/features/eventtypes/lib/defaultEvents.ts`
- `packages/features/eventtypes/lib/eventNaming.ts`
- `packages/features/eventtypes/lib/getDefinedBufferTimes.ts`
- `packages/features/eventtypes/lib/getEventTypeById.ts`
- `packages/features/eventtypes/lib/getEventTypesByViewer.ts`
- `packages/features/eventtypes/lib/getEventTypesPublic.ts`
- `packages/features/eventtypes/lib/getPublicEvent.ts`
- `packages/features/eventtypes/lib/getTeamEventType.ts`
- `packages/features/eventtypes/lib/schemas.ts`
- `packages/features/eventtypes/lib/types.ts`
- `packages/features/eventtypes/repositories/EventRepository.ts`
- `packages/features/eventtypes/repositories/eventTypeRepository.ts`
- `packages/features/eventtypes/service/EventTypeService.ts`
This component:
- calls **Booking creation and rescheduling [booking-create]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/eventtypes/lib/getPublicEvent.ts:298`.
- calls **Booking fields and response validation [booking-input]**. 5 static relationships across 3 distinct file pairs. Evidence: `packages/features/eventtypes/lib/bookingFieldsManager.ts:34`, `packages/features/eventtypes/lib/getEventTypeById.ts:224` and 1 more.
- calls **Prisma client and database support [prisma]**. 21 static relationships across 7 distinct file pairs. Evidence: `packages/features/eventtypes/lib/defaultEvents.ts:122`, `packages/features/eventtypes/lib/getEventTypeById.ts:118` and 1 more.
- uses **Booking fields and response validation [booking-input]**. 6 static relationships across 3 distinct file pairs. Evidence: `packages/features/eventtypes/lib/bookingFieldsManager.ts:1`, `packages/features/eventtypes/lib/getEventTypeById.ts:6` and 1 more.
- uses **Booking management RPC [booking-rpc]**. 3 static relationships across 1 distinct file pairs. Evidence: `packages/features/eventtypes/repositories/eventTypeRepository.ts:54`.
- uses **Prisma client and database support [prisma]**. 59 static relationships across 28 distinct file pairs. Evidence: `packages/features/eventtypes/lib/bookingFieldsManager.ts:2`, `packages/features/eventtypes/lib/defaultEvents.ts:4` and 1 more.
Used by 34 other components.

#### Prisma client and database support [prisma]
Kind: store.
Configure shared Prisma clients, safety extensions, selects and schema utilities.
Database-client setup and read replica support, booking idempotency and query guards, selection definitions and Zod utilities. Includes all indexed migration, enum generation and maintenance scripts, not an inferred database entity model.
Files (21):
- `packages/prisma/auto-migrations.ts`
- `packages/prisma/cleanup-pbac.ts`
- `packages/prisma/client/index.ts`
- `packages/prisma/delete-app.ts`
- `packages/prisma/enum-generator.ts`
- `packages/prisma/extensions/booking-idempotency-key.ts`
- `packages/prisma/extensions/disallow-undefined-delete-update-many.ts`
- `packages/prisma/extensions/exclude-locked-users.ts`
- `packages/prisma/extensions/exclude-pending-payment-teams.ts`
- `packages/prisma/index.ts`
- `packages/prisma/is-prisma-available-check.ts`
- `packages/prisma/run-enum-generator.js`
- `packages/prisma/seed-pbac-only.ts`
- `packages/prisma/selects/app.ts`
- `packages/prisma/selects/booking.ts`
- `packages/prisma/selects/credential.ts`
- `packages/prisma/selects/event-types.ts`
- `packages/prisma/selects/index.ts`
- `packages/prisma/selects/payment.ts`
- `packages/prisma/selects/user.ts`
- `packages/prisma/zod-utils.ts`
Used by 41 other components.

#### Public booking entry pages [public-pages]
Kind: page.
Resolve public event URLs and initialize localized booking pages.
Next app routes for user, event, private-link, embed and reschedule entry points, with their server-side event-loading bridge.
Files (10):
- `apps/web/app/(booking-page-wrapper)/[user]/[type]/embed/page.tsx`
- `apps/web/app/(booking-page-wrapper)/[user]/[type]/page.tsx`
- `apps/web/app/(booking-page-wrapper)/[user]/embed/page.tsx`
- `apps/web/app/(booking-page-wrapper)/[user]/page.tsx`
- `apps/web/app/(booking-page-wrapper)/d/[link]/[slug]/page.tsx`
- `apps/web/app/(booking-page-wrapper)/layout.tsx`
- `apps/web/app/reschedule/[uid]/embed/page.tsx`
- `apps/web/app/reschedule/[uid]/page.tsx`
- `apps/web/modules/users/views/users-type-public-view.tsx`
- `apps/web/server/lib/[user]/[type]/getServerSideProps.ts`
This component:
- renders **Time selection and booking form [booker-ui]**. Render the public booker. Public event view renders the booker with resolved event and optional reschedule data. Evidence: `apps/web/modules/users/views/users-type-public-view.tsx:27`, `apps/web/modules/users/views/users-type-public-view.tsx:6`.
- calls **Shared booker state and client logic [booker-client]**. 1 static relationships across 1 distinct file pairs. Evidence: `apps/web/modules/users/views/users-type-public-view.tsx:32`.
- calls **Booking persistence and lookup [booking-data]**. 2 static relationships across 1 distinct file pairs. Evidence: `apps/web/server/lib/[user]/[type]/getServerSideProps.ts:44`.
- calls **Event type definitions and retrieval [eventtypes]**. 3 static relationships across 2 distinct file pairs. Evidence: `apps/web/server/lib/[user]/[type]/getServerSideProps.ts:152`.
- uses **Shared booker state and client logic [booker-client]**. 2 static relationships across 1 distinct file pairs. Evidence: `apps/web/modules/users/views/users-type-public-view.tsx:7`.
- uses **Booking persistence and lookup [booking-data]**. 6 static relationships across 1 distinct file pairs. Evidence: `apps/web/server/lib/[user]/[type]/getServerSideProps.ts:2`.
- uses **Booking result and self-service page [booking-result-ui]**. 1 static relationships across 1 distinct file pairs. Evidence: `apps/web/modules/users/views/users-type-public-view.tsx:13`.
- uses **Event type definitions and retrieval [eventtypes]**. 6 static relationships across 3 distinct file pairs. Evidence: `apps/web/server/lib/[user]/[type]/getServerSideProps.ts:4`.
- uses **Prisma client and database support [prisma]**. 1 static relationships across 1 distinct file pairs. Evidence: `apps/web/server/lib/[user]/[type]/getServerSideProps.ts:10`.
Used by 1 other component.

#### Public event and feedback RPC [public-rpc]
Kind: endpoint.
Serve public event metadata, verification checks, timezone data and feedback.
Public-viewer procedures and schemas, including event lookup through EventRepository and attendee-facing no-show and rating inputs.
Files (14):
- `packages/trpc/server/routers/publicViewer/_router.tsx`
- `packages/trpc/server/routers/publicViewer/checkIfUserEmailVerificationRequired.handler.ts`
- `packages/trpc/server/routers/publicViewer/checkIfUserEmailVerificationRequired.schema.ts`
- `packages/trpc/server/routers/publicViewer/countryCode.handler.ts`
- `packages/trpc/server/routers/publicViewer/countryCode.schema.ts`
- `packages/trpc/server/routers/publicViewer/event.handler.ts`
- `packages/trpc/server/routers/publicViewer/event.schema.ts`
- `packages/trpc/server/routers/publicViewer/markHostAsNoShow.handler.ts`
- `packages/trpc/server/routers/publicViewer/markHostAsNoShow.schema.ts`
- `packages/trpc/server/routers/publicViewer/procedures/event.ts`
- `packages/trpc/server/routers/publicViewer/submitRating.handler.ts`
- `packages/trpc/server/routers/publicViewer/submitRating.schema.ts`
- `packages/trpc/server/routers/publicViewer/timezones/_router.tsx`
- `packages/trpc/server/routers/publicViewer/timezones/cityTimezones.schema.ts`
This component:
- calls **Event type definitions and retrieval [eventtypes]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/trpc/server/routers/publicViewer/event.handler.ts:11`.
- uses **Event type definitions and retrieval [eventtypes]**. 5 static relationships across 2 distinct file pairs. Evidence: `packages/trpc/server/routers/publicViewer/event.handler.ts:1`, `packages/trpc/server/routers/publicViewer/event.schema.ts:2`.
- uses **Prisma client and database support [prisma]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/trpc/server/routers/publicViewer/checkIfUserEmailVerificationRequired.handler.ts:4`, `packages/trpc/server/routers/publicViewer/submitRating.handler.ts:1`.
Used by 0 other components.

#### Availability schedule editing [schedules]
Kind: service.
Edit recurring working hours and date overrides with ownership checks.
Schedule editing components and hooks, range and slot utilities, repository and update service. Includes web schedule hooks consuming the shared scheduling model.
Files (11):
- `apps/web/modules/schedules/hooks/useEvent.ts`
- `apps/web/modules/schedules/hooks/useSchedule.ts`
- `packages/features/schedules/components/DateOverrideInputDialog.tsx`
- `packages/features/schedules/components/DateOverrideList.tsx`
- `packages/features/schedules/components/ScheduleComponent.tsx`
- `packages/features/schedules/components/ScheduleListItem.tsx`
- `packages/features/schedules/hooks/useTimesForSchedule.ts`
- `packages/features/schedules/lib/date-ranges.ts`
- `packages/features/schedules/lib/slots.ts`
- `packages/features/schedules/repositories/ScheduleRepository.ts`
- `packages/features/schedules/services/ScheduleService.ts`
This component:
- calls **Shared booker state and client logic [booker-client]**. 9 static relationships across 8 distinct file pairs. Evidence: `apps/web/modules/schedules/hooks/useEvent.ts:22`, `apps/web/modules/schedules/hooks/useSchedule.ts:68` and 1 more.
- calls **Calendar controls and weekly view state [calendar-ui]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/schedules/components/DateOverrideInputDialog.tsx:22`.
- calls **Event type definitions and retrieval [eventtypes]**. 1 static relationships across 1 distinct file pairs. Evidence: `apps/web/modules/schedules/hooks/useSchedule.ts:90`.
- uses **User and aggregate availability [availability]**. 13 static relationships across 2 distinct file pairs. Evidence: `packages/features/schedules/lib/date-ranges.ts:3`, `packages/features/schedules/lib/slots.ts:3`.
- uses **Shared booker state and client logic [booker-client]**. 19 static relationships across 9 distinct file pairs. Evidence: `apps/web/modules/schedules/hooks/useEvent.ts:3`, `apps/web/modules/schedules/hooks/useSchedule.ts:3` and 1 more.
- uses **Calendar controls and weekly view state [calendar-ui]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/schedules/components/DateOverrideInputDialog.tsx:18`.
- uses **Event type definitions and retrieval [eventtypes]**. 2 static relationships across 1 distinct file pairs. Evidence: `apps/web/modules/schedules/hooks/useSchedule.ts:5`.
- uses **Prisma client and database support [prisma]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/features/schedules/lib/date-ranges.ts:4`, `packages/features/schedules/repositories/ScheduleRepository.ts:8`.
Used by 10 other components.

#### Available slots and reservation API [slots]
Kind: service.
Compute and cache bookable slots and manage temporary slot reservations.
Slot router, schemas and AvailableSlotsService, combining schedule queries with reservation cleanup and availability checks. Includes its substantial slot calculation utility rather than treating it as mere transport.
Files (10):
- `packages/trpc/server/routers/viewer/slots/_router.tsx`
- `packages/trpc/server/routers/viewer/slots/getSchedule.handler.ts`
- `packages/trpc/server/routers/viewer/slots/getSchedule.schema.ts`
- `packages/trpc/server/routers/viewer/slots/isAvailable.handler.ts`
- `packages/trpc/server/routers/viewer/slots/isAvailable.schema.ts`
- `packages/trpc/server/routers/viewer/slots/removeSelectedSlot.schema.ts`
- `packages/trpc/server/routers/viewer/slots/reserveSlot.handler.ts`
- `packages/trpc/server/routers/viewer/slots/reserveSlot.schema.ts`
- `packages/trpc/server/routers/viewer/slots/types.ts`
- `packages/trpc/server/routers/viewer/slots/util.ts`
This component:
- calls **User and aggregate availability [availability]**. 8 static relationships across 2 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/slots/util.ts:420`.
- calls **Booking creation and rescheduling [booking-create]**. 3 static relationships across 3 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/slots/util.ts:504`.
- calls **Booking persistence and lookup [booking-data]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/slots/util.ts:468`.
- calls **Busy-time constraints [busy-times]**. 3 static relationships across 1 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/slots/util.ts:396`.
- calls **Event type definitions and retrieval [eventtypes]**. 4 static relationships across 3 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/slots/isAvailable.handler.ts:36`, `packages/trpc/server/routers/viewer/slots/util.ts:187`.
- calls **Availability schedule editing [schedules]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/slots/util.ts:1109`.
- uses **User and aggregate availability [availability]**. 13 static relationships across 2 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/slots/util.ts:4`.
- uses **Shared booker state and client logic [booker-client]**. 5 static relationships across 1 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/slots/util.ts:11`.
- uses **Booking creation and rescheduling [booking-create]**. 7 static relationships across 3 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/slots/util.ts:12`.
- uses **Booking persistence and lookup [booking-data]**. 3 static relationships across 1 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/slots/util.ts:36`.
- uses **Busy-time constraints [busy-times]**. 3 static relationships across 1 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/slots/util.ts:37`.
- uses **Event type definitions and retrieval [eventtypes]**. 8 static relationships across 3 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/slots/isAvailable.handler.ts:3`, `packages/trpc/server/routers/viewer/slots/util.ts:39`.
- uses **Availability schedule editing [schedules]**. 7 static relationships across 3 distinct file pairs. Evidence: `packages/trpc/server/routers/viewer/slots/util.ts:43`.
Used by 0 other components.

#### Attendee SMS message support [sms]
Kind: service.
Format booking SMS messages and gate attendee sending by phone eligibility and rate limits.
SMS manager and attendee message variants. The inspected base send path checks phone-only booking eligibility and rate limiting; this graph does not assert a provider transport implementation.
Files (10):
- `packages/sms/attendee/awaiting-payment-sms.ts`
- `packages/sms/attendee/cancelled-seat-sms.ts`
- `packages/sms/attendee/event-cancelled-sms.ts`
- `packages/sms/attendee/event-declined-sms.ts`
- `packages/sms/attendee/event-location-changed-sms.ts`
- `packages/sms/attendee/event-request-sms.ts`
- `packages/sms/attendee/event-request-to-reschedule-sms.ts`
- `packages/sms/attendee/event-rescheduled-sms.ts`
- `packages/sms/attendee/event-scheduled-sms.ts`
- `packages/sms/sms-manager.ts`
Used by 2 other components.

#### Versioned webhook payloads [webhook-payloads]
Kind: model.
Define webhook DTOs and convert event categories into versioned payloads.
Base and versioned builders, registry and factory dispatch map booking, meeting, out-of-office and recording events to their payload representations.
Files (15):
- `packages/features/webhooks/lib/dto/types.ts`
- `packages/features/webhooks/lib/factory/base/BaseBookingPayloadBuilder.ts`
- `packages/features/webhooks/lib/factory/base/BaseMeetingPayloadBuilder.ts`
- `packages/features/webhooks/lib/factory/base/BaseOOOPayloadBuilder.ts`
- `packages/features/webhooks/lib/factory/base/BaseRecordingPayloadBuilder.ts`
- `packages/features/webhooks/lib/factory/base/index.ts`
- `packages/features/webhooks/lib/factory/types.ts`
- `packages/features/webhooks/lib/factory/versioned/PayloadBuilderFactory.ts`
- `packages/features/webhooks/lib/factory/versioned/registry.ts`
- `packages/features/webhooks/lib/factory/versioned/v2021-10-20/BookingPayloadBuilder.ts`
- `packages/features/webhooks/lib/factory/versioned/v2021-10-20/MeetingPayloadBuilder.ts`
- `packages/features/webhooks/lib/factory/versioned/v2021-10-20/OOOPayloadBuilder.ts`
- `packages/features/webhooks/lib/factory/versioned/v2021-10-20/RecordingPayloadBuilder.ts`
- `packages/features/webhooks/lib/factory/versioned/v2021-10-20/index.ts`
- `packages/features/webhooks/lib/factory/versioned/v2021-10-20/types.ts`
This component:
- uses **Webhook production and delivery [webhooks]**. 23 static relationships across 3 distinct file pairs. Evidence: `packages/features/webhooks/lib/dto/types.ts:4`, `packages/features/webhooks/lib/factory/versioned/PayloadBuilderFactory.ts:14` and 1 more.
Used by 3 other components.

#### Webhook production and delivery [webhooks]
Kind: service.
Resolve subscribers and emit, schedule or deliver webhook notifications.
Webhook facade, repositories, data fetchers, services, delivery taskers and legacy send helpers, including booking-specific trigger bridges and service factory. Supports indexed non-booking events as well.
Files (46):
- `packages/features/bookings/lib/` (2 files)
- `packages/features/webhooks/lib/` (12 files)
- `packages/features/webhooks/lib/facade/` (1 file)
- `packages/features/webhooks/lib/infrastructure/mappers/` (1 file)
- `packages/features/webhooks/lib/interface/` (6 files)
- `packages/features/webhooks/lib/repository/` (2 files)
- `packages/features/webhooks/lib/service/` (8 files)
- `packages/features/webhooks/lib/service/data-fetchers/` (4 files)
- `packages/features/webhooks/lib/tasker/` (4 files)
- `packages/features/webhooks/lib/tasker/trigger/` (3 files)
- `packages/features/webhooks/lib/types/` (2 files)
- `packages/lib/server/service/` (1 file)
This component:
- calls **Booking persistence and lookup [booking-data]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/webhooks/lib/service/data-fetchers/BookingWebhookDataFetcher.ts:37`.
- calls **Booking fields and response validation [booking-input]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/webhooks/lib/scheduleTrigger.ts:100`.
- calls **Event type definitions and retrieval [eventtypes]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/webhooks/lib/repository/WebhookRepository.ts:93`.
- calls **Prisma client and database support [prisma]**. 1 static relationships across 1 distinct file pairs. Evidence: `packages/features/webhooks/lib/scheduleTrigger.ts:256`.
- calls **Versioned webhook payloads [webhook-payloads]**. 2 static relationships across 2 distinct file pairs. Evidence: `packages/features/webhooks/lib/service/WebhookNotificationHandler.ts:85`, `packages/features/webhooks/lib/service/WebhookTaskConsumer.ts:123`.
- uses **Booking creation and rescheduling [booking-create]**. 3 static relationships across 1 distinct file pairs. Evidence: `packages/features/webhooks/lib/scheduleTrigger.ts:13`.
- uses **Booking persistence and lookup [booking-data]**. 7 static relationships across 2 distinct file pairs. Evidence: `packages/features/webhooks/lib/service/data-fetchers/BookingWebhookDataFetcher.ts:1`, `packages/features/webhooks/lib/scheduleTrigger.ts:68`.
- uses **Booking fields and response validation [booking-input]**. 2 static relationships across 1 distinct file pairs. Evidence: `packages/features/webhooks/lib/scheduleTrigger.ts:6`.
- uses **Event type definitions and retrieval [eventtypes]**. 6 static relationships across 2 distinct file pairs. Evidence: `packages/features/webhooks/lib/repository/WebhookRepository.ts:1`.
- uses **Prisma client and database support [prisma]**. 7 static relationships across 6 distinct file pairs. Evidence: `packages/features/webhooks/lib/getWebhooks.ts:2`, `packages/features/webhooks/lib/repository/WebhookRepository.ts:8` and 1 more.
- uses **Versioned webhook payloads [webhook-payloads]**. 134 static relationships across 23 distinct file pairs. Evidence: `packages/features/webhooks/lib/WebhookService.ts:4`, `packages/features/webhooks/lib/getWebhooks.ts:6` and 1 more.
Used by 10 other components.
