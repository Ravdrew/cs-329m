# Writing a developer edit and intent for a benchmark PR

In the experiment, a developer describes a change they want by editing the component graph of the codebase: they
mark the components and dependencies that change, add the ones that will exist, and leave a short note on each. The
same change is also written as a paragraph of prose (the intent). Coding agents get one or the other.

You write both for one PR, **as the developer who asked for it would, before any code exists.**

## What you may read

Only the files in the PR's input folder:

- `pr.md`: the PR description, as its author wrote it.
- `spec.md`: the interface the PR's tests expect (file and function names and signatures). Every coding agent gets
  this too.
- `graph.md`: the component graph of the code before the change, as text. `graph.yaml` is the same graph with exact
  ids, if you need to check one.

Do not read anything else: no other folder, repository, git history, test file, benchmark file, earlier edit or
result, and no web. The point is that the edit says only what the developer knew. If the inputs do not tell you
something, leave it out rather than guess at the implementation.

## What you write

Two files in the same folder.

### `edit.json`

```json
{
  "modify":    [{ "id": "existing-node-or-edge-id", "note": "What changes here, in one or two sentences." }],
  "delete":    [{ "id": "existing-node-or-edge-id", "note": "Why it goes." }],
  "add_nodes": [{ "id": "new-id", "label": "Name", "kind": "service", "group": "existing-group-id",
                  "summary": "One line.", "description": "Optional, a few sentences.",
                  "files": ["path/the/developer/plans.ts"], "note": "What it should do." }],
  "add_edges": [{ "id": "new-edge-id", "from": "node-id", "to": "node-id", "kind": "calls",
                  "label": "short label", "note": "What should flow here." }]
}
```

- Leave out a key you do not need. Node kinds: page, component, endpoint, service, model, store, job, external,
  other. Edge kinds: renders, navigates, calls, reads, writes, emits, uses.
- `modify` and `delete` ids must be ids in `graph.yaml` (nodes or edges). New ids must not exist yet. A new edge may
  connect existing nodes or new ones. Deleting a node means deleting its edges too.
- Mark what a developer would mark: usually 2–6 entries. Mark a component when its behaviour changes, not every
  file the change might touch. Mark or add a dependency when the change adds or changes how two components connect.
- Notes say **what** should change and any rule the change must follow, in the developer's words: behaviour,
  conditions, defaults, what the user sees. They do not say how to code it.
- Every coding agent already gets `spec.md`, so do not copy it into notes: no lists of fields, props, signatures or
  test ids. Name a function or file from it only where that says which part of the graph changes. Say what the spec
  does not: which components change and how they connect, and the rules from the PR description.
- `files` on a new node: only paths the developer would plan (for example those `spec.md` names); otherwise omit.

### `intent.md`

The same change as one to three short paragraphs of plain prose, for an agent that has no graph: what to add or
change, where (by component or file name as the graph and spec call them), and the rules from your notes. It must
say the same things as `edit.json`: nothing more, nothing less, and like the notes it does not copy `spec.md`.

## Check

Run `node tools/llm-only/apply-edit.mjs graph.yaml edit.json /tmp/check.yaml` from the team checkout (the path
you are given) and fix any error it reports. Then stop.
