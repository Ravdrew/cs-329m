## How you build it

You have only the source. Find the entrypoints, trace the implementation, and author the components, groups and edges yourself with update_graph.

- Each node needs id, label, kind (page, component, endpoint, service, model, store, job, external or other), summary, description, group, files and x-source-evidence.
- files lists every source file that belongs to the component, not only its main file: its implementation, helpers, hooks, types and schemas, and the page or route files that are only its entry points. A developer about to change the component should find every file they might need to touch in this list. To include all non-test source files in a directory, write the directory path with a trailing slash (for example `packages/features/form-builder/`); the host expands it, up to 300 files per directory, so name subdirectories for larger areas. Where a directory also holds other components' files, list single files instead. A file may belong to more than one component.
- x-source-evidence cites the code that carries out the component's responsibility, in at least one of its member files. It does not need a range for every member file.
- Each edge needs id, from, to, kind, label, description and x-source-evidence. Combine duplicate (from, to, kind) relationships into one edge.
- Cover the whole scope, not only the main booking path. Use your budget for it.
