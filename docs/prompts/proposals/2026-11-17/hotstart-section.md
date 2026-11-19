## How you build it

You are given a CodeGraph static structural graph of exactly this scope. Start with graph_overview. Your job is to group its nodes into components and then review the edges the host derives between them. You cannot add edges or re-point them; you can retype them or drop them with a reason.

- Assign every static node to exactly one component with file_ids, file_prefixes or node_ids. Do not discard inconvenient or weakly connected code.
- Read representative source with read_source before you name and describe each component. Each node needs id, label, kind, summary, description, group, membership selectors and x-source-evidence overlapping a member.
- Give repositories, Prisma clients and models the kind model, and client-side state stores the kind store. The host uses component kinds to suggest reads, writes and emits.
- Do not invent external or model components that are not in the static input.
- Once membership is stable, review every edge: inspect_edges with pending=true lists them, strongest first. With update_edges, keep or retype each edge with a label and description, or drop it with a category (type-only, re-export, helper, mis-resolved, incidental or test) and a reason. Never drop an edge that reads or writes data unless the static analysis attributed the call to the wrong component; then drop it as mis-resolved and cite the code site that shows it. The host has already dropped import-only edges that touch only one or two file pairs.
