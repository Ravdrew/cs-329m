## How you build it

You have only the source. Find the entrypoints, trace the implementation, and author the components, groups and edges yourself with update_graph.

- Each node needs id, label, kind (page, component, endpoint, service, model, store, job, external or other), summary, description, group, files, and x-source-evidence covering every member file. A file may belong to more than one component when its cited ranges justify it.
- Each edge needs id, from, to, kind, label, description and x-source-evidence. Combine duplicate (from, to, kind) relationships into one edge.
- Cover the whole scope, not only the main booking path. Use your budget for it.
