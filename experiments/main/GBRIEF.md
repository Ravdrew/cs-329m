# Write a brief-level graph edit for one PR

The experiment compares a long prose intent, a 1-3 sentence brief, and the same change as an edit of a component
graph. The existing graph edit (`full-edit.json`) carries the whole intent in its notes, which no developer would
write. You write the **brief-level** version: what a busy developer would actually do when marking a graph. They
mark the same components and dependencies, and write one short note on each.

Folder: `/private/tmp/claude-501/-Users-andg-Desktop-CS-329M/7c53770b-be93-4fe5-bcd8-a992d7eeacad/scratchpad/gbrief/PULL/`

Read only: `brief.md` (the level of detail to match), `intent.md` (the source: nothing may go beyond it),
`pr.md` (context; every agent gets it), `graph.md` / `graph.yaml` (the graph, exact ids), `full-edit.json` (which
entries are marked). Nothing else: no other folder, repository, code, git, tests, spec, web.

## Rules

- **Same structure.** Mark exactly the entries `full-edit.json` marks: the same `modify` and `delete` ids, the same
  `add_nodes` (id, label, kind, group) and `add_edges` (id, from, to, kind, label). The structure is the graph's
  information; keep it. You may shorten a new edge's `label` if it holds a code name the brief would not use.
- **Short notes.** Each note is one plain sentence, at most about 15 words, saying what this component or
  dependency does differently, at the level of the brief: the goal, not the method. No lists of steps, conditions,
  edge cases, error handling, metrics, or "keep X working" unless the brief itself says it.
- **Nothing beyond the intent**, and no detail beyond the brief's level. No file paths, function, type, variable,
  test or spec names, unless the brief uses the word. Plain product words (booking, webhook, HubSpot, Zustand) are
  fine when the brief or the graph uses them.
- **New nodes:** keep `label` and `kind`; `summary` is a few words; no `description`; `files: []`.
- Every marked entry needs a non-empty note. Do not state the same thing on two entries; an edge note can be a few
  words ("reports the booking").
- Write as the developer: "Cancel the booking when the calendar event is cancelled." not "Process external-calendar
  cancellations through ...".

Example (#24124, the calendar-subscription node). The full edit's note is a paragraph about helpers, response
merging, metrics and dynamic imports. The brief-level note:

> Apply cancellations and time changes from the external calendar to the matching Cal.com bookings.

## Output

Write `PULL/edit.json` (same JSON shape as `full-edit.json`) and validate it:

    node /Users/andg/Desktop/cs-329m-experiment/tools/llm-only/apply-edit.mjs PULL_DIR/graph.yaml PULL_DIR/edit.json PULL_DIR/edit.yaml

Also write `PULL/notes.md`: the note count, total words in notes, and any entry where one short sentence could
not say it without going beyond the brief (what you chose).
