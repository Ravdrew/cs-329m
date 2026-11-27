# Checking that a graph edit says the same as its prose intent

An experiment compares coding agents given a prose intent with agents given the same change as an edit of a component
graph. The edits were translated from the intents by someone else. You check, for one PR, whether each of its two edits
(one per graph) carries the same content as the intent: nothing missing, nothing added, and each part on a sensible
component.

## What you may read

Only these files in the PR's folder, which you are given:

- `intent.md`: the prose intent.
- `fresh/edit.json`, `chain/edit.json`: the two edits (`modify`, `delete`, `add_nodes`, `add_edges`, each with a note).
- `fresh/graph.md`, `chain/graph.md`: the graphs the edits apply to, as text (components, their files, dependencies).

Do not read `mapping.md`, `pr.md`, `spec.md`, or anything outside the folder.

## What to check, for each edit

1. **Missing**: a requirement, rule, condition, default, open choice, or named file or function in the intent that no
   note carries.
2. **Added**: something a note says that the intent does not, beyond restating the intent in the graph's terms: a new
   rule, a resolved open choice, a detail, a dependency the intent does not imply.
3. **Misplaced**: a note on a component or dependency the graph shows is not where that part of the change happens,
   when a better one exists in the same graph. Say which.
4. **Repeated**: the same requirement stated on several entries.
5. **Arms differ**: content one edit carries and the other does not (placement may differ).

Be specific and quote the words. Do not report wording or style.

## Output

Write `check.json` in the PR folder:

```json
{ "verdict": "ok" | "minor" | "fix",
  "summary": "One or two sentences.",
  "findings": [{ "arm": "fresh" | "chain" | "both", "type": "missing" | "added" | "misplaced" | "repeated" | "arms-differ",
                 "entry": "entry id or null", "detail": "What and why, quoting the words." }] }
```

`ok`: nothing to report. `minor`: only repetition or small placement doubts. `fix`: something missing, added or
clearly misplaced. Then stop.
