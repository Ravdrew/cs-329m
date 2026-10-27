# Component graph viewer

A React + React Flow web app that renders a component graph file
(`docs/graph-format-proposal.md`) so a person can see the architecture,
pan and zoom, and click any node to read its description and the files it
owns.

```bash
cd viewer
npm install
npm run dev        # http://localhost:5173
npm run build      # static bundle in dist/
```

## What it does

- Loads `public/graphs/cal-diy-booking.yaml` by default; `?graph=<url>`
  loads another file; the **Open…** button or drag-and-drop loads a local
  `.yaml`/`.json`.
- Lays the graph out automatically with ELK (layered, top-down or
  left-right toggle). Groups become nested containers.
- **Zoom/pan** with scroll and drag, minimap, fit-to-view. Node summaries
  appear only when zoomed in (semantic zoom).
- **Click a node** → right panel with kind, group, summary, markdown
  description, routes, the **file list** (each file links to GitHub at the
  graph's `commit`), and incoming/outgoing edges.
- **Click an edge** → the code locations (file:line, symbol) that justify
  it. Selecting anything dims the rest of the graph to its neighbourhood.
- **Search** nodes by label, id, summary or file path; Enter jumps to the
  first match.
- **Filter** by node kind with the chips in the toolbar.
- **Colour coding**: every node card has a header band in its kind colour (the
  same palette as the toolbar chips and the minimap), and edges, arrowheads and
  edge labels are coloured by edge kind. The overview panel shows an edge-colour
  legend. Palette lives in `src/index.css` (`--k-*` for node kinds, `--e-*` for
  edge kinds, light and dark variants); `edgeColor()` in `src/graph/kinds.ts`
  picks the arrowhead colour (status wins over kind).
- Edit overlay rendering: `status: new` nodes are green/dashed, `modify`
  amber, `delete` red with strike-through; edges likewise, with the
  developer `note` shown in the panel.

## Editing (the intent channel)

Turn on **Edit** in the toolbar (on by default; remembered in localStorage).
Everything edits live: the panel on the right is the editor, and the canvas
updates on every keystroke.

- **Add a node**: `+ Node` or press `N`. A blank card appears at the centre of
  the view, already selected, with the label field focused. Type the label,
  pick a kind, fill in files and so on; the card updates as you type. The
  node's id is derived from its label when you leave the label field.
- **Position and group by dragging**: drag the card anywhere. Dropping it inside
  a group box puts it in that group; dropping it outside every box removes the
  group. The Group select in the panel does the same thing.
- **Edit an existing node or edge**: click it. In edit mode the panel shows the
  live form instead of the read-only view. A node or edge that differs from the
  committed file turns amber (`modify`); editing it back to its original state
  clears the status.
- **Delete / Restore**: buttons at the top of the panel, or Delete/Backspace
  with something selected. Deleting a committed node or edge marks it
  `delete` (red, kept in the file); removing a new one drops it.
- **Draw an edge**: drag from the dot at the bottom of a card and drop anywhere
  on another card (the whole card lights up as the drop target). The edge is
  created straight away as `calls` and selected so you can change its kind,
  label and note. Drag an edge end to re-point a committed edge, which records
  the old edge as `delete` and the new one as `new`.
- **Undo / redo**: ⌘Z and ⇧⌘Z, or the toolbar arrows. Typing in one field is
  one undo step, not one per keystroke. **Re-layout** (⟳) re-runs ELK and
  discards hand positions.
- **Changes**: the toolbar button lists the pending edit (added / modified /
  deleted) and offers *Download* (full YAML with `status` fields), *Copy YAML*,
  *Export edit JSON* (an ArchEyes-style envelope with before/after for each
  item), *Accept all* (makes the current graph the new baseline) and *Discard
  all*.

The editing logic is pure and lives in `src/graph/edit.ts`, so the same
functions can back an MCP server later.

## Code map

| File | Role |
|---|---|
| `src/graph/types.ts` | TypeScript types for the file format |
| `src/graph/parse.ts` | YAML/JSON parsing + referential validation |
| `src/graph/layout.ts` | ELK layout → React Flow nodes/edges |
| `src/components/GraphCanvas.tsx` | React Flow canvas, selection/dimming, minimap |
| `src/components/ComponentNode.tsx`, `GroupNode.tsx`, `ComponentEdge.tsx` | custom renderers |
| `src/components/DetailPanel.tsx` | node/edge detail side panel |
| `src/components/Toolbar.tsx` | open, search, kind filters, direction, edit tools |
| `src/graph/edit.ts` | editing operations, status rules, pending-edit envelope, YAML writer |
| `src/components/NodeForm.tsx`, `EdgeForm.tsx` | add/edit forms |
| `src/components/ChangesPanel.tsx` | pending edit list and export |

## Why React Flow (and not the alternatives)

- **React Flow (@xyflow/react)**: custom React nodes, sub-flows for
  groups, built-in pan/zoom/minimap, and it is what ArchEyes already uses,
  so editing (week 4) can borrow from it. Chosen.
- **Cytoscape.js**: excellent graph algorithms and compound nodes, but
  canvas-rendered nodes make rich HTML cards and markdown panels awkward.
- **Sigma.js / D3-force**: built for thousands of nodes; overkill and
  force layouts are unstable across reloads, which fights the "stable
  diagram" goal.
- **LikeC4 / Structurizr viewers**: would force their file format.

## Not yet done

- Adding or editing groups from the UI (nodes can be moved between existing groups).
- Editing edge evidence by hand.
- Collapsing a group into a single node for very large graphs.
- Plan-review mode (agent's proposed changes shown as an overlay diff, with approve/reject).
