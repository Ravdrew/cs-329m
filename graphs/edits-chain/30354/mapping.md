# Mapping for 30354

| Intent clause | fresh | chain |
|---|---|---|
| Add an optional title-aware availability method to the calendar service contract | app-store-framework | app-store-framework |
| implement it for Google | google-calendar-app | google-calendar-integration |
| and Office365 | other-calendar-apps | calendar-integrations-family |
| including the telemetry wrapper | calendar-subscription-service | calendar-subscription |
| Request titles only for overlay mode using the logged-in user's own credentials | calendar-manager, schedule-management | calendar-manager, schedules-api |
| with identity checked by user ID rather than username | schedule-management | schedules-api |
| Keep other availability requests on the ordinary path | calendar-manager, schedule-management | calendar-manager, schedules-api |
| fall back to ordinary availability when a provider lacks the optional method or title retrieval fails | calendar-manager | calendar-manager |
| Carry the optional title through busy-time data | busy-times, user-availability (+ app-store-framework for the data type) | user-availability (+ app-store-framework) |
| ... to the troubleshooter | availability-ui | availability-ui |
| ... overlay week view | calendar-views-ui | calendar-weekly-view |
| ... and conflicting-slot hover card | booker-ui | booker-ui |
| Initialize the overlay with the calendars already selected for conflict checking and fetch their availability immediately after authentication | booker-ui | booker-ui |
| Use the requested date-range helpers and `lastVisibleDate` input to cover the displayed range | booker-ui | booker-ui |
| Pass an overlapping event's title through `useCheckOverlapWithOverlay` so the confirmation hover card can show it with the relevant time range | booker-ui | booker-ui |
| Fetch the enabled social-login providers when the continue modal opens | booker-ui, e-booker-social-providers (new edge booker-ui -> session-auth) | booker-ui, e-booker-social-providers (new edge booker-ui -> nextauth-credentials) |
| and offer the corresponding Google or Microsoft action | booker-ui | booker-ui |
| Connect that calendar during the existing sign-in flow and return to the booking page with overlay enabled, without broadening Google OAuth scopes | session-auth | nextauth-credentials |
| split multi-day and all-day events into day-bounded display segments using `getEventSegmentForDay`, rendering each nonempty segment on its covered day | calendar-views-ui | calendar-weekly-view |
| Keep end-boundary handling consistent so an event ending at midnight does not occupy the following day | calendar-views-ui | calendar-weekly-view |

## Unsure

- The calendar service contract (Calendar interface) has no own component in either graph; placed on app-store-framework (getCalendar resolves the Calendar implementation).
- The availability handler that does the user-ID identity check is not in the fresh graph's files; placed on schedule-management (owns viewer/availability router). In chain it is schedules-api (user.handler.ts).
- `useCalendars.ts` and `useCheckOverlapWithOverlay` are not in any fresh node; placed on booker-ui (overlay calendar component). In chain useCalendars.ts is in both booker-ui and bookings-list-page; chose booker-ui.
- The new edge to the auth component for fetching social-login providers is an inference that the providers come from the sign-in (NextAuth) component; the intent does not name the source.
- Fresh has a separate busy-times node; chain folds busy times into user-availability.

## Not placed

Nothing.
