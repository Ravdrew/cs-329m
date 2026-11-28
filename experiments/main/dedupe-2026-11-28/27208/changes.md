# Changes for #27208

## Intent
- Unchanged: no restated sentences or wordy phrasing found.

## Brief
- Unchanged (already tight).

## Edits
- e-list-datatable (both): "Pass the validator ... into DataTableProvider, which accepts it and applies it to saved booking filter segments before applying them" -> "Passes the validator from `useActiveFiltersValidator` to DataTableProvider." The accepting and before-applying parts are on data-table and the bookings list node (repetition, feedback).
- Not changed: the query-gating rule sits on bookings-list-ui in fresh and on edge e-list-query in chain. This is a graph difference: fresh has no list-to-query edge.

## Word counts (edits: words in note/label/summary/description)
- intent: 191 -> 191
- brief: 24 -> 24
- fresh: 213 -> 199
- chain: 213 -> 199

## Validation
- fresh: 3 marked (3 modify), ok. chain: 4 marked (4 modify), ok.

## Open questions for the intent author
- None (no human comments yet).
