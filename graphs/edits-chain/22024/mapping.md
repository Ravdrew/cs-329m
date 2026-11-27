# Mapping for PR 22024

| Intent clause | fresh | chain |
|---|---|---|
| Make phone-only booking an option for personal events as well as team and organization events | form-builder | form-builder |
| Expose the phone-versus-email requirement control through the booking-field editor | form-builder | form-builder |
| carry that choice into the booker form | form-builder (owns BookingFields.tsx) | booker-ui (owns BookingFields.tsx) |
| and server-side validation | handle-new-booking (owns getBookingResponsesSchema.ts) | booking-fields (owns getBookingResponsesSchema.ts) |
| Reuse the existing phone-only attendee representation and phone validation | handle-new-booking | booking-fields |
| so a booking with a valid required phone number can be confirmed without asking for an email address | form-builder, handle-new-booking | booker-ui, booking-fields |
| Keep the email-confirmation path working for event types that select it | form-builder, handle-new-booking | booker-ui, booking-fields |
| Update SMSManager's send path so a phone-only attendee is eligible even with no team ID | email-manager (owns packages/sms/sms-manager.ts) | email-sms-notifications |
| The base implementation returns early for personal events and teams outside an org; remove those restrictions | email-manager | email-sms-notifications |
| preserving the organization's explicit `disablePhoneOnlySMSNotifications` preference where applicable | email-manager | email-sms-notifications |
| Carry the organizer and optional team context through dispatch so personal bookings have a usable rate-limit identity without a fabricated team ID | e-sms-dispatch (new edge email-manager -> workflows-boundary) | e-sms-dispatch (new edge email-sms-notifications -> workflow-reminders) |
| Continue using the existing SMS rate-limit check, sender selection, message templates | email-manager | email-sms-notifications |
| and `sendSmsOrFallbackEmail` dispatcher | e-sms-dispatch | e-sms-dispatch |
| Send only when the attendee has a phone number and is a phone-only booking; email attendees keep current behavior | email-manager | email-sms-notifications |
| Apply the same eligibility decision to single-attendee and all-attendee sends | email-manager | email-sms-notifications |

## Unsure / not placed

- The SMS rate-limit check (`checkRateLimitAndThrowError`) has no component in either graph; it is carried in the SMS manager note.
- Chain has no component listing `packages/sms/sms-manager.ts`; SMSManager is placed on email-sms-notifications, which covers attendee SMS.
- Neither graph had an edge from the SMS manager to the workflows component that holds `messageDispatcher.ts`; I added one (`e-sms-dispatch`) because the intent changes what flows through dispatch.
- Booker form: in fresh, BookingFields.tsx belongs to form-builder, so the booker-form clause goes on form-builder rather than booker-ui. In chain it goes on booker-ui.
- "Make phone-only booking an option for personal events..." is placed on the editor component. It is a general goal and could also apply to the validation and SMS components.
