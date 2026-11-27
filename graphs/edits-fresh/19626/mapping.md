# Mapping: intent -> edit entries (PR 19626)

Note: fresh/graph.yaml and chain/graph.yaml are byte-identical for this PR, so both edits are identical.

| Intent clause | fresh | chain |
|---|---|---|
| Make the booker's automatic month advance depend on availability in the displayed month | booker-ui | booker-ui |
| CRM-owner lookup can return next-month slots; one nonempty-day list from whole response makes empty month look bookable | booker-ui | booker-ui |
| In the booker DatePicker, restrict dates for this decision to browsing month/year using existing nonempty-schedule-day logic | booker-ui | booker-ui |
| Keep actual slot data available to the calendar for rendering and out-of-office info | calendar-weekly-view; e-booker-ui-renders-calendar-datepicker | same |
| Keep existing restriction that auto-advance applies to the current month | booker-ui | booker-ui |
| Wait for completed availability response; missing data / in-progress fetch must not navigate | booker-ui | booker-ui |
| When loaded current month has no bookable days, advance via existing month-change callback (selected date, day-count state consistent) | booker-ui; e-booker-ui-renders-calendar-datepicker | same |
| A bookable day in displayed month prevents advancement even when response spans months | booker-ui | booker-ui |
| Decouple booker DatePicker from schedule-query object; accept `slots` and `isLoading` directly | booker-ui; e-booker-ui-renders-calendar-datepicker | same |
| Add shared `Slots` type | booker-ui (packages/features/bookings/types.ts) | same |
| Update callers | booker-ui | booker-ui |
| Use `isLoading` consistently in the calendar component (isPending -> isLoading) | calendar-weekly-view | calendar-weekly-view |
| Expose named DatePicker export | calendar-weekly-view | calendar-weekly-view |
| Month label `<time>` element with machine-readable `dateTime` | calendar-weekly-view | calendar-weekly-view |

## Unsure / not placed
- `packages/features/bookings/types.ts` belongs to no component in either graph; the `Slots` type was placed on booker-ui (its consumer) rather than adding a node, since the file already exists.
- "Update callers": callers of the booker DatePicker are not identified by the intent; placed on booker-ui (which holds Booker.tsx). Callers outside booker-ui, if any, are not marked.
- The existing nonempty-schedule-day logic lives in booker-slot-hooks (useNonEmptyScheduleDays.ts), but the intent reuses it unchanged, so booker-slot-hooks is not marked and no edge was added for it.
- "Expose the named DatePicker export" could refer to either DatePicker; per spec it is the calendar one (packages/features/calendars/DatePicker.tsx), placed on calendar-weekly-view.
- Signatures in notes were taken from spec.md (allowed input), slightly abbreviated for the classNames types.
