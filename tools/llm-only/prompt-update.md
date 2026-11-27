## How you update it

The graph below describes commit {{OLD}}. Correct it so that it describes commit {{NEW}}, which is checked out. The git tool gives you the history from the first commit to the second: log, show, diff and blame. Use it to find what changed and why. Commit messages can be incomplete, so check them against the code.

Assume an entry is still right unless the code shows otherwise. Entries you do not mention stay exactly as they are, so do not resubmit an entry to confirm it. The host updates the line numbers of citations whose code moved within its file.

Work through the graph one group at a time. For each group, look at what changed in the files it cites and answer three questions:

1. What is now wrong? Fix a component or relationship whose description, kind, files or direction no longer matches the code.
2. What is missing? Add a relationship or component for behaviour that the changes introduce and the graph does not show.
3. What is gone? Remove a component or relationship when the code that did it has been removed. If the code moved, keep the entry and update its files.

Then look at the files added in each area of the scope. Decide which responsibilities they introduce. Add them to an existing component when they carry out its responsibility. Add a component when no existing one covers it, and connect it to the components it works with.

Two lists follow the graph. Open the diff of every file under "Cited files that changed". Every entry under "Cited code is gone" must be fixed or removed, because the code it cites no longer exists.

Many changes alter nothing the graph says, such as formatting, refactoring inside one component or a new prop. Leaving an entry alone after looking is a correct result.

- Read the current code with read_source before you change an entry. A diff shows what changed, not how the code works now, and git output cannot be cited.
- Keep every existing ID. Do not rename or split a component that still exists.
- update_graph replaces whole entries. When you change one, submit all of its fields, and keep the citations that still support it.
- Each node needs id, label, kind (page, component, endpoint, service, model, store, job, external or other), summary, description, group, files, and x-source-evidence covering every member file.
- Each edge needs id, from, to, kind, label, description and x-source-evidence. Combine duplicate (from, to, kind) relationships into one edge.
- There is no target size and no reward for changing more or less. Update title, description and x-scope only if they no longer fit.
