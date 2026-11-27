# Mapping for PR 27088

| Intent clause | fresh | chain |
|---|---|---|
| Make every internal EventBusyDetails entry carry its source, keeping the user-facing title separate from that diagnostic value | busy-times | user-availability |
| Add LimitSources helpers returning translation key and descriptive source together | busy-times | user-availability |
| Pass that pair into LimitManager for event-booking, event-duration and team-limit busy intervals | busy-times | user-availability |
| Give buffer entries the same complete information | busy-times | user-availability |
| Give date-override entries the same complete information | user-availability | user-availability |
| Preserve an external calendar's supplied source; calendar fallback only when absent | busy-times | user-availability |
| Propagate metadata through interval subtraction with generic types so splitting keeps source | available-slots-service | user-availability |
| Troubleshooter and LargeCalendar: translate title with `busy_time.*`, fallback `busy_time.busy`, source on the event's diagnostic data attribute | troubleshooter-large-calendar (new node) | availability-ui, calendar-weekly-view |
| Apply `withSource` at the response boundary so callers not requesting sources keep the response shape | user-availability | user-availability |
| Add `getUserAvailabilityIncludingBusyTimesFromLimits` wrapping `_getUserAvailability` | user-availability | user-availability |
| Obtain needed limit busy times through the existing busy-time services when not supplied | user-availability, e-avail-busy | user-availability |
| Preserve `initialData.busyTimesFromLimitsBookings`, including an empty array, not overwritten with a new empty list | user-availability | user-availability |
| Leave an absent value absent; forward assembled initial data into the existing availability calculation | user-availability | user-availability |

## Could not place / unsure

- Neither graph has a component for LimitManager/LimitSources (intervalLimits) or the EventBusyDetails type. Fresh: placed on busy-times (owns getBusyTimesFromLimits.ts and getBusyTimes.ts). Chain: placed on user-availability (owns getBusyTimes.ts; BusyTimesService is folded into it).
- Fresh has no troubleshooter or LargeCalendar component, so a node was added (no files, since neither intent nor spec names a path). Chain: the troubleshooter pages are in availability-ui and a LargeCalendar.tsx is in calendar-weekly-view; unsure whether that is the same LargeCalendar the intent means, so the sentence is on both.
- Interval subtraction: fresh places it on available-slots-service because it owns `packages/features/schedules/lib/date-ranges.ts` (assumed to hold `subtract`); chain has no such file, so it goes on user-availability.
- "Response boundary" for `withSource` is not named; placed on user-availability (which builds the availability response) rather than the tRPC availability router.
