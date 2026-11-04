# Proposal: the component-graph file format

*CS 329M — Graphical Representations of Codebases for Intent Legibility.*
*Draft v0, 2026-10-18. Author: Claude (for Andres). Status: needs team review.*

## TL;DR

Define our own small format rather than adopting an existing one. Store it as
**one YAML file per graph** (`graph.yaml`, JSON accepted) with a JSON Schema,
checked into the target repository. The shape is deliberately close to
ArchEyes' `plan-graph.json` (so we inherit its editing protocol and
`status` overlay) but adds what no surveyed format has: **per-node file
lists with roles, per-edge code evidence with line numbers, nested groups,
and a provenance tag (`extracted` / `inferred` / `manual`) on every fact.**

Nothing off the shelf fits. The two closest are LikeC4 (great DSL, has links
with line ranges and an MCP server, but string-only metadata and no
edit-status concept) and ArchEyes (has the overlay and the editor loop, but
flat groups, no line numbers, and a closed schema). Details in §2.

A working viewer that loads this format is in `viewer/`; a hand-built
34-node graph of the Cal.diy booking subsystem that uses every feature of
the format is in `graphs/booking-handmade.yaml`.

## 1. What the file has to do

From the project proposal (§3 "Potential design"), the file must:

| # | Requirement | Why |
|---|---|---|
| R1 | Be human-readable and **diffable in a PR** | "a developer's edit is an ordinary diff, reviewable in a pull request beside the code that implements it" |
| R2 | Every **node lists the files** it owns | provenance; zoom-in from component to code |
| R3 | Every **edge lists the code locations** that justify it | checkable graph; agents can expand an edge into call sites |
| R4 | **Typed nodes** (page, UI component, endpoint, data model, service) and **labelled edges** (renders, navigates, calls, reads, writes) | the vocabulary developers already think in |
| R5 | **Groups / hierarchy** so a 1M-line app can be shown at several zoom levels | readability |
| R6 | An **edit overlay**: a developer can mark nodes/edges as new / modified / deleted and attach a note | this *is* the intent channel to the agent (Q2, Q3) |
| R7 | Record whether a fact was **extracted by static analysis, inferred by an LLM, or written by a human** | Q1 compares hot-started vs LLM-only graphs; the reference graph is hand-built |
| R8 | Trivial to parse from a **React viewer** and from an **MCP server** (TypeScript) | the two consumers we are building |
| R9 | Be **stable across regeneration**: ids should not churn so comments, positions and edits stay anchored | ArchEyes learned this the hard way; Cursor's Merkle-tree incremental indexing is the model |

Non-requirements, for now: layout/positions (computed by the viewer with
ELK), rendering styles, symbol-level (function) nodes.

## 2. What exists (audit summary)

Two full audits are in `docs/audit/`. The short version:

**Diagram / architecture DSLs.** These are designed for people to *draw*
systems, not to record facts about code.

| Format | Verdict |
|---|---|
| **LikeC4** | Closest DSL. User-defined node and edge kinds, arbitrary nesting, `link ../src/x.ts#L1-L10` on elements *and* relationships, `metadata {}`, VS Code LSP, CLI, and an official MCP server. But metadata values are strings/arrays only (no structured evidence objects), there is no status/overlay concept, and the JSON export is undocumented, so a React viewer must go through the `likec4` Node API. |
| Structurizr DSL / C4 | Fixed C4 kinds (person/system/container/component); the JSON is explicitly "not designed to be edited by hand". No file lists. |
| D2, Mermaid, PlantUML, DOT | Rendering languages. D2 has a fixed keyword set (no custom metadata); Mermaid's C4/architecture diagrams cannot even carry links or edge labels; DOT allows arbitrary string attributes but no structure. Good **export targets** for PR descriptions (GitHub renders Mermaid), bad sources of truth. |
| GraphML / GEXF | XML, flat scalar attributes. Interchange only. |
| JSON Graph Format / Cytoscape JSON | Neutral JSON with `metadata`; JGF has no hierarchy, Cytoscape's `parent` is renderer-specific. Either could carry our fields but gives no vocabulary or tooling. |
| JSON Canvas (Obsidian) | A spatial canvas with mandatory pixel geometry; grouping is by overlap. Not a graph model. |
| FINOS CALM | JSON-Schema-validated, has `composed-of` vs `connects`, but finance/deployment vocabulary (interfaces, protocols, controls) and nothing for code locations. |
| Backstage `catalog-info.yaml` | Nice `kind/metadata/spec` envelope and entity reference strings; relations are untyped lists on the source entity; repo-level source links only. |
| React Flow node/edge JSON | The viewer's in-memory shape (`{id,type,parentId,data}`), not a storage format: needs `position` on every node. |

**Code-graph tools for agents.** These record facts about code but are
symbol-level indexes, not something a person edits.

| Tool | Verdict |
|---|---|
| **ArchEyes** | Closest overall. `plan-graph.json` with `groups`, `nodes{id,label,kind,group,status,files[],description}`, `edges{from,to,kind,status,calls[],description}`, JSON Schema, a React Flow editor, and a feedback envelope (`comments`, `reconnected`, `added`, `deleted`, `moved`). Limits: flat groups, no line numbers, `calls` is prose, `additionalProperties:false`, node kinds lack page/endpoint/model, one-maintainer project. |
| **Understand Anything** | Committed `.ua/knowledge-graph.json` with a Zod schema, `gitCommitHash`, node types that include `page, component, endpoint, service, table, schema`, and `layers[].nodeIds` for grouping. Edges have no code locations. |
| **codegraph** | Richest typed schema (`route`, `component` nodes; `navigates`, `references` edges; edge `line/col`; `provenance: tree-sitter | scip | heuristic`). SQLite, gitignored, symbol-level. A good **hot-start source** for our extracted edges. |
| Graphify | Committed NetworkX node-link JSON with per-edge `source_file` + `source_location:"L40"` and `confidence: EXTRACTED | INFERRED | AMBIGUOUS`. No node kinds, stem-based ids collide. |
| Codebase-Memory (MCP) | SQLite outside the repo; richest edge vocabulary (`HANDLES`, `READS`, `WRITES`, `HTTP_CALLS` with confidence). Evidence that graph queries over MCP cut tokens ~10×. |
| RepoGraph / LocAgent | Research artifacts, pickled NetworkX, line- or symbol-level. LocAgent's `path:Qualified.Name` ids and `contains` tree are a good precedent. |
| Nx / dependency-cruiser / madge | Deterministic import graphs; none records the import's line; none models renders/navigates. Usable as evidence for `uses` edges. |
| SCIP / LSIF | The precise symbol index. SCIP symbol strings + ranges are the ideal *evidence* reference, not a graph format. |

**What nobody has:** structured code evidence on edges *and* a developer
status overlay *and* nested groups *and* a provenance tag, in a file a
person is expected to read. That combination is our requirement list, so we
define it.

## 3. The proposal

### 3.1 Serialisation: YAML, one file, JSON Schema

- **YAML** rather than JSON: comments, multi-line `description: |` blocks,
  no trailing-comma noise in diffs, and it is a superset of JSON so a
  generated `graph.json` is also valid. Parsed with `js-yaml` in the
  browser and in Node (already done in `viewer/src/graph/parse.ts`).
- **One file per graph**, at `.codegraph/graph.yaml` in the target repo
  (name open; see §5). A large app may later split into one file per
  top-level group with `include:`; not needed for Cal.diy.
- A **JSON Schema** (`schema/graph.schema.json`, to be written from the
  TypeScript types in `viewer/src/graph/types.ts`) so the viewer, the MCP
  server and CI can validate. Unlike ArchEyes, we allow additional
  properties under an `x-` prefix so experiments can add fields without
  forking the schema.
- **Layout is never stored.** The viewer computes it with ELK. This keeps
  diffs semantic (the JSON Canvas and React Flow lesson).

### 3.2 Shape

```yaml
version: 1
repo: calcom/cal.diy                 # used to build source links
commit: 6bfe2df9…                    # commit the graph was built against
title: Cal.diy — booking subsystem
description: |                       # markdown
  …

groups:                              # nestable via `parent`
  - id: public-booking
    label: Public booking flow
  - id: booker-ui
    label: Booker UI
    parent: public-booking

nodes:
  - id: book-event-form              # stable kebab-case id (R9)
    label: Book event form
    kind: component                  # page | component | endpoint | service | model | store | job | external | other
    group: booker-ui
    summary: Name/email/custom questions; submits the booking.
    description: |                   # markdown, shown in the viewer
      …
    routes: ["POST /api/book/event"] # pages and endpoints only
    files:                           # R2 — strings or {path, role, lines}
      - path: apps/web/modules/bookings/components/BookEventForm/BookEventForm.tsx
        role: entry
      - packages/features/bookings/Booker/hooks/useBookingForm.ts
    provenance: manual               # R7 — extracted | inferred | manual
    status: existing                 # R6 — existing | new | modify | delete (default existing)
    note: ""                         # developer note attached with an edit
    tags: []

edges:
  - from: book-event-form
    to: book-event-endpoint
    kind: calls                      # renders | navigates | calls | reads | writes | emits | uses
    label: POST /api/book/event      # optional human label
    evidence:                        # R3 — code locations that justify the edge
      - file: packages/features/bookings/lib/create-booking.ts
        line: 13
        symbol: "/api/book/event"
    provenance: extracted
    status: existing
```

Design decisions, with the precedent each one borrows:

| Decision | Borrowed from | Rationale |
|---|---|---|
| `groups` with `parent` | LikeC4 / Structurizr nesting; ArchEyes `groups` | R5. Flat list + parent pointer diffs better than nested YAML and maps 1:1 onto React Flow `parentId`. |
| Nine node kinds incl. `page`, `endpoint`, `model`, `store`, `job` | Understand Anything (`page, endpoint, service, table`), codegraph (`route`, `component`) | R4. Covers Next.js/tRPC apps. `other` is the escape hatch. |
| Seven edge kinds | codegraph `navigates`; Codebase-Memory `READS/WRITES/HANDLES`; proposal's own list | R4. Small enough to colour-code; `uses` for plain imports. |
| `files[]` with optional `role` and `lines` | ArchEyes `files`; Understand Anything `lineRange` | R2. `role: entry` tells the viewer (and the agent) where to start reading. |
| `evidence[] {file, line, symbol, note}` on edges | Graphify `source_file/source_location`; codegraph edge `line/col`; SCIP ranges | R3. Structured, not prose, so an MCP tool can open the exact call site. |
| `provenance` on nodes and edges | codegraph `provenance`; Graphify `confidence` | R7. Lets us measure Q1 (extracted vs inferred precision) from the file itself. |
| `status` + `note` inline | ArchEyes `status` enum | R6. The developer's intent *is* the diff of the file; no separate feedback file needed for Q3. (We keep ArchEyes' structured feedback envelope as the *derived* form the MCP server sends to the agent, §3.3.) |
| `repo` + `commit` header | Understand Anything `gitCommitHash` | Staleness detection; the viewer builds GitHub links from them. |
| Stable kebab-case ids | ArchEyes guidance; LocAgent qualified names | R9. Ids are chosen by the builder once and never regenerated from labels. |

### 3.3 The edit overlay and how it reaches the agent

A developer edits the graph in the viewer (week 4). The viewer writes the
same `graph.yaml` back with `status`/`note` set on the touched nodes and
edges and, for new nodes, a fresh id. That means:

- **For a human reviewer** the intent is a normal `git diff` of
  `graph.yaml` (R1).
- **For the agent** the MCP server (week 5) computes a structured delta in
  ArchEyes' envelope shape (`added`, `deleted`, `reconnected`, `comments`)
  from `status` fields, and exposes tools such as `get_pending_edit`,
  `expand_node(id) → files + entry points`, `expand_edge(from,to) →
  evidence lines`. The in-prompt channel (Q2) just pastes the YAML diff;
  the image channel renders the viewer.
- After the agent implements the change, a rebuilt graph should have those
  nodes with `status: existing`; comparing the rebuilt graph with the
  developer's edited graph is the Q3 "intent conformance" metric.

### 3.4 Validation rules (implemented in `viewer/src/graph/parse.ts`)

- ids unique within nodes, groups, and edges (`from->to:kind` if no `id`);
- every `group`, `parent`, `from`, `to` resolves;
- `kind` values in the enums;
- `files` non-empty for `status: existing` nodes (warning, not error).
  CI in the target repo should additionally check that every `files[].path`
  and `evidence[].file` exists at `commit`.

### 3.5 What we deliberately leave out (v0)

- Symbol-level nodes. The graph is component-level by design; evidence
  points into code instead.
- Edge weights / confidence scores. `provenance` is a three-way enum; if Q1
  needs a numeric score we add `x-confidence`.
- Positions, colours, collapsed state. Viewer-local.
- Multi-file graphs and `include:`. Add when a target app needs it.

## 4. Alternatives considered and why not

1. **Adopt LikeC4 outright.** Tempting: VS Code support, MCP server, and
   `link file#L1-L10` already exist. Rejected because (a) evidence would be
   a flat list of links with no `symbol`/`note` and no per-edge structure,
   (b) `status`/`note` would be a metadata convention the tooling ignores,
   (c) the JSON export is undocumented, so our viewer would depend on their
   Node API, and (d) we lose control of the schema we are evaluating.
   We can still **export** to LikeC4 or D2 for pretty diagrams later.
2. **Fork ArchEyes' schema.** Nearly what we did, but it lacks nesting and
   line-level evidence and its node kinds are backend-centric. Keeping our
   field names close (`groups`, `kind`, `status`, `files`) makes reusing
   their React Flow editor code or their feedback protocol easy.
3. **JSON instead of YAML.** Simpler parsing, worse for humans (no
   comments, no multi-line descriptions). The viewer accepts both, so
   generated graphs can stay JSON if a team prefers.
4. **Nested YAML (nodes inside groups).** Reads nicely but makes moving a
   node between groups a large diff and complicates ids. Flat lists with
   references won.

## 5. Open questions for the team

1. **File location and name.** `.codegraph/graph.yaml` vs `ARCHITECTURE.graph.yaml` at the repo root vs `docs/graph.yaml`. Root-level is more discoverable for agents (AGENTS.md convention); a dot-folder keeps the repo tidy.
2. **Should `status` live in the main file or in a sidecar `graph.edit.yaml`?** Inline is simplest and gives the PR-diff story; a sidecar keeps the committed graph "clean" between experiments. I recommend inline, with the MCP server able to reset all `status` to `existing`.
3. **Edge kinds.** Is seven enough? `navigates` vs `renders` is sometimes ambiguous for Next.js layouts; `emits` (webhooks/queues) was added beyond the proposal's four.
4. **Line numbers go stale.** Evidence `line` is pinned to `commit`. For the hot-started variant we regenerate; for the hand-built reference graph we accept drift and store `symbol` so it can be re-found.
5. **Ids for LLM-built graphs.** Ask the LLM to propose ids once, then freeze them; on rebuild, match by id first, then by file overlap (Jaccard) to keep ids stable.

## 6. Next steps

- Write `schema/graph.schema.json` from the TS types and add a `validate` script.
- Have Nathan/Renaldo emit this format from both graph-construction variants (week 2–3).
- Add editing (status/note, add node, draw edge, save YAML) to the viewer (week 4).
- Build the MCP server on top of `parse.ts` (week 5).
