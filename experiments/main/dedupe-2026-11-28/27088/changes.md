# Changes for #27088

Word counts (wc -w): intent 202 -> 202; brief 20 -> 20; fresh/edit.json 279 -> 258; chain/edit.json 253 -> 232.

## Intent
- Unchanged: no restated sentences; wording already tight.

## Brief
- Unchanged (human reviewer: "brief: verdict ok").

## Edits
- fresh user-availability: dropped "Obtain the needed limit busy times through the existing busy-time services when they are not already supplied" (repetition; reviewer [repeated]). It now sits once on e-avail-busy (user-availability -> busy-times, an existing edge in fresh/graph.yaml), since it is about that dependency.
- fresh e-avail-busy: note is now exactly that intent sentence, without the restated function name and "in initial data" (repetition / wording).
- chain user-availability: unchanged (chain has no separate busy-times component or edge, so the sentence stays on the node).
- chain calendar-weekly-view: the full troubleshooter/LargeCalendar requirement was also on availability-ui (repetition; reviewer [repeated]); calendar-weekly-view now has a short note naming its part, and the requirement is stated once on availability-ui.
- chain availability-ui: "In the troubleshooter (and its LargeCalendar)" -> "In the troubleshooter and LargeCalendar" (the intent's wording).

## Validation
- fresh: 5 marked (1 new, 4 modify, 0 delete), OK. chain: 3 marked (0 new, 3 modify, 0 delete), OK.

## Open questions for the intent author
- None (no questions from human comments).
