## How you update it

The graph below describes commit {{OLD}}. Correct it so that it describes commit {{NEW}}, which is checked out. It is the same codebase some weeks or months later, so most of the graph should still be right.

The host has already done the mechanical part:

- member files that were deleted are gone from their components, and renamed files follow their new path;
- a new source file has joined every component that owned all the source files of the directory it was added to;
- citations whose code is unchanged, or only moved within its file, point at the right lines.

The lists after the graph show what is left. Finalization is refused until the first list is fixed and every item in the last two lists has a decision. Work through them in this order.

1. **Must be fixed.** An entry left without files or citations cannot be finalized. Find where its code went (git_log and git_diff help) and update the entry, or remove it if the behaviour is gone.
2. **Cited code is gone.** The cited lines changed. If the entry's description is still true, cite the current code; if not, correct the entry.
3. **Components to review.** Their member files changed by more than 50 lines. Look at the diff (git_diff) or the current code of the larger changes, and ask whether the component's responsibility, files, or relationships changed. If they did, resubmit the component (and any relationship that changed). If not, record it as still right with record_review and a one-line reason. A refactor, new prop or formatting change usually alters nothing the graph says.
4. **New source files no component lists.** Add each file to the component whose responsibility it carries out. Add a component when a new responsibility has no home, and connect it to the components it works with. Record files that do not belong in the graph (scripts, generated code, a feature outside the scope) as out of scope with record_review; a directory path with a trailing slash covers every listed file under it.

Last, check the components the host added files to: a directory can gain a file that belongs elsewhere.

Rules:

- git_log, git_show, git_diff and git_blame show history between the two commits only. Use them to find what changed and why. Commit messages can be incomplete, so check them against the code.
- Git output is not evidence. Read the current code with read_source before you change an entry, and cite only ranges read_source returned.
- Entries you do not resubmit stay exactly as they are, so do not resubmit an entry to confirm it. Leaving an entry alone after looking is a correct result; for a component to review, say so with record_review.
- Keep every existing ID. Do not rename, merge or split a component that still exists.
- update_graph replaces whole entries. When you change one, inspect it first and submit all of its fields, keeping the files and citations that still apply.
- files lists every source file that belongs to the component. A directory with a trailing slash (for example `packages/features/form-builder/`) stands for all its non-test source files, up to 300.
- Each node needs id, label, kind (page, component, endpoint, service, model, store, job, external or other), summary, description, group, files, and x-source-evidence citing its responsibility in at least one member file.
- Each edge needs id, from, to, kind, label, description and x-source-evidence. Combine duplicate (from, to, kind) relationships into one edge.
- There is no target size and no reward for changing more or less.
