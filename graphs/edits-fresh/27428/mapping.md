# Mapping for PR 27428

| Intent clause | fresh | chain |
|---|---|---|
| Extract booking-sheet keyboard handling into the specified utility | add_node `booking-sheet-keyboard-handler` (file from spec) | modify `bookings-list-page` (already covers `apps/web/modules/bookings/lib/`) |
| connect it to BookingDetailsSheet with a capture-phase keydown listener | modify `booking-list-ui`; add_edge `e-bookinglist-sheet-keyboard` | modify `bookings-list-page` |
| Only handle shortcuts while the sheet is active and the target is not editable | `booking-sheet-keyboard-handler` | `bookings-list-page` |
| Focus in a different Radix portal = active overlay; allow inside sheet or outside any portal | `booking-sheet-keyboard-handler` | `bookings-list-page` |
| Remove the listener when no longer needed; keep its navigation state current | `booking-list-ui`; `e-bookinglist-sheet-keyboard` | `bookings-list-page` |
| ArrowUp/ArrowDown always preventDefault + stopPropagation when sheet owns event, incl. first/last booking | `booking-sheet-keyboard-handler` | `bookings-list-page` |
| Call previous/next only when direction available and not transitioning | `booking-sheet-keyboard-handler` | `bookings-list-page` |
| Enter activates current join link when present, consumes event so focused actions button cannot also open; leave unrelated keys and Enter without join alone | `booking-sheet-keyboard-handler` | `bookings-list-page` |
| Preserve existing Escape-to-close | `booking-list-ui` | `bookings-list-page` |
| Translated shortcut tooltips on previous, next, close, join; JoinMeetingButton ref locates its link | `booking-list-ui` | `bookings-list-page` |
| Keep sheet open switching via list rows or weekly-calendar events by recognizing both interaction markers | `booking-list-ui`; add_edge `e-bookinglist-calviews-marker` | `bookings-list-page`; add_edge `e-bookingslist-weekly-marker` |
| Place the booking UID on calendar event buttons | modify `calendar-views` (Event.tsx) | modify `calendar-weekly-view` (Event.tsx) |

## Unsure / not placed

- Fresh graph: `JoinMeetingButton.tsx` is not listed in any component; the JoinMeetingButton ref clause is put on `booking-list-ui`, which holds BookingDetailsSheet. In chain it is in `bookings-list-page`.
- The edge from the bookings UI to the weekly calendar view is a judgment call: the intent couples the sheet to a calendar-event marker but does not name a dependency. The calendar-view note mentions the calendar interaction marker because "both interaction markers" implies one; the intent only names the booking UID explicitly.
- Translation files (common.json) are not named in the intent, so no locale node or file was added.
