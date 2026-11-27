# Translating a prose intent into graph edits

In the experiment, a coding agent gets a developer's description of the change in one of two forms: a paragraph of
prose (the intent), or an edit of the component graph of the codebase, which marks the components and dependencies
that change, adds the ones that will exist, and leaves a short note on each. The comparison is only fair if both
forms say the same thing. The prose intent is already written. You translate it onto two graphs of the same code: a
fresh graph built for this commit, and a graph rolled forward from older commits. The two graphs differ in their ids
and in how they divide the code.

## What you may read

Only the files in the PR's input folder:

- `intent.md`: the prose intent. This is the source of what to say.
- `pr.md`: the PR description. Every coding agent gets it too. Read it for context, but don't add anything from it
  that the intent does not say.
- `spec.md`: the interface the PR's tests expect. Every coding agent gets it too.
- `fresh/graph.md` and `chain/graph.md`: the two graphs as text. `graph.yaml` next to each has the exact ids.

Do not read anything else: no other folder, repository, source code, git history, test, benchmark file, earlier edit
or result, and no web.

## What you write

In each of `fresh/` and `chain/`, an `edit.json`:

```json
{
  "modify":    [{ "id": "existing-node-or-edge-id", "note": "What changes here." }],
  "delete":    [{ "id": "existing-node-or-edge-id", "note": "Why it goes." }],
  "add_nodes": [{ "id": "new-id", "label": "Name", "kind": "service", "group": "existing-group-id",
                  "summary": "One line.", "description": "Optional, a few sentences.",
                  "files": ["path/named/in/the/intent/or/spec.ts"], "note": "What it should do." }],
  "add_edges": [{ "id": "new-edge-id", "from": "node-id", "to": "node-id", "kind": "calls",
                  "label": "short label", "note": "What should flow here." }]
}
```

- Leave out a key you don't need. Node kinds: page, component, endpoint, service, model, store, job, external,
  other. Edge kinds: renders, navigates, calls, reads, writes, emits, uses.
- `modify` and `delete` ids must exist in that folder's `graph.yaml`. New ids must not exist yet. A new edge may
  connect existing nodes or new ones.
- Mark where the intent says the change happens. Put each part of the intent on the component (or dependency) it
  concerns. If the intent names a file or function, mark the component whose files include it. Add a node only for
  something the intent says will be new and no existing component already covers; add an edge when the intent
  creates or changes a connection between two components.
- **Same content.** Every requirement, rule, condition, default, file or function name and open choice in the
  intent must appear in some note. Nothing may appear in a note that the intent does not say. Keep the intent's
  wording where you can. Don't resolve what it leaves open (if it says "make the failure policy explicit", the note
  says that too, not which policy). Don't drop a sentence because the graph seems to say it already.
- **Same in both graphs.** The two edits carry the same content. They differ only where the graphs differ: other ids,
  a part landing on a different component, or a node one graph lacks and the edit adds.
- `files` on a new node: only paths the intent or spec names, otherwise omit.

Then write `mapping.md` in the PR folder: each sentence or clause of the intent, and the entry that carries it in
each graph (`fresh: id`, `chain: id`). List anything you could not place, and any place where you were unsure.

## Check

From `/Users/andg/Desktop/cs-329m-fresh-graphs`, run, for each arm:

    node tools/llm-only/apply-edit.mjs IN/ARM/graph.yaml IN/ARM/edit.json IN/ARM/edit.yaml

Fix any error it reports. Then stop.
