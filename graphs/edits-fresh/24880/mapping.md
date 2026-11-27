# Mapping for PR 24880

Both graphs put the whole weekly view (Calendar.tsx, state/store.ts, components/event/Event.tsx, utils/) in one component, so every clause sits in one modify entry: `fresh: calendar-views-ui`, `chain: calendar-weekly-view`.

| Intent clause | fresh | chain |
|---|---|---|
| Give each weekly Calendar instance its own Zustand store, provided through that instance's context | calendar-views-ui | calendar-weekly-view |
| so changing dates or events in one calendar cannot update another on the same page | calendar-views-ui | calendar-weekly-view |
| Preserve the current consumer API while moving store creation out of shared module-level state | calendar-views-ui | calendar-weekly-view |
| Move overlap calculations into the specified utility module | calendar-views-ui | calendar-weekly-view |
| Sort a copy of the input events, group by overlapping time ranges, compute layout per connected overlap group | calendar-views-ui | calendar-weekly-view |
| Account for the latest end time across the group (long event keeps shorter overlapping events together) | calendar-views-ui | calendar-weekly-view |
| Events that only meet at an endpoint do not overlap | calendar-views-ui | calendar-weekly-view |
| Return group position, horizontal offset, width, stacking order without mutating source; provide ID-to-layout lookup | calendar-views-ui | calendar-weekly-view |
| Bound the cascade by the space inside a single day column | calendar-views-ui | calendar-weekly-view |
| Constrain offset step and width together; every event visible, right edge inside column, incl. large groups | calendar-views-ui | calendar-weekly-view |
| Respect the optional layout configuration, not an unbounded fixed offset | calendar-views-ui | calendar-weekly-view |
| Apply the calculated positioning in the event component; remove the conflicting horizontal inset rule | calendar-views-ui | calendar-weekly-view |

## Not placed / unsure

- Nothing unplaced.
- Unsure: whether the new `utils/overlap.ts` module deserved its own node. I did not add one, because the existing weekly view component already covers `weeklyview/utils/`. The path comes from spec.md, which the intent calls "the specified utility module".
- No edges: the intent creates no new connection between components.
