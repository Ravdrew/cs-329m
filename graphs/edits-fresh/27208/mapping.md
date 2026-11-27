# Mapping for 27208

| Intent clause | fresh | chain |
|---|---|---|
| Validate saved booking filter segments against resources accessible to the viewer before applying them | bookings-list-ui | bookings-list-page |
| Pure filtering logic in `createActiveFiltersValidator`: drop unavailable user, event-type and team IDs, keep valid selections and unrelated filter kinds | bookings-list-ui | bookings-list-page |
| `useActiveFiltersValidator` fetches resources per `canReadOthersBookings`, returns validator / `"loading"` / unsupported-unused state through the supplied interface | bookings-list-ui | bookings-list-page |
| Accept that validator in DataTableProvider | e-list-datatable, data-table | e-list-datatable, data-table |
| Wait for both segments and validation data before applying a selected segment | data-table | data-table |
| Keep bookings query gated while validation is pending (no flash of unfiltered results) | bookings-list-ui | e-list-query |
| Reapply selected or preferred segment reliably after navigation | data-table | data-table |
| Delayed response for an older selection cannot overwrite a more recent choice | data-table | data-table |
| Split provider into State, Segment, Filters contexts, nested in that order | data-table | data-table |
| Compatibility bridge so existing `useDataTable()` consumers keep working | data-table | data-table |
| Segment states idle, waiting-for-segments, waiting-for-validator, applying, ready | data-table | data-table |
| Transition decisions in pure state-machine logic, React effects in connecting hook | data-table | data-table |
| Bounded automatic transitions, explicit handling of null filter state | data-table | data-table |

## Unsure / not placed

- No new nodes: the new validator hook is put on the existing bookings list component (its files cover the bookings hooks), and the state-machine logic, hook and contexts go on data-table. You could also argue for separate new nodes.
- The intent does not say where the validator fetches resources from, so no edge was added for that fetch.
- The fresh graph has no edge from the bookings list to the bookings query, so query gating sits on the bookings-list-ui node there; in chain it sits on edge e-list-query.
