/**
 * Pure graph-editing operations. Every function returns a new ComponentGraph.
 *
 * Status rules (see docs/graph-format-proposal.md §3.3):
 *  - a node/edge that exists in the baseline and is changed      -> "modify"
 *  - a node/edge that exists in the baseline and is removed      -> "delete" (kept in the file)
 *  - a node/edge that does not exist in the baseline             -> "new"; removing it drops it
 *  - an edited node/edge that becomes equal to its baseline again -> "existing"
 */
import { dump } from "js-yaml";
import {
  edgeId,
  type ComponentGraph,
  type GraphEdge,
  type GraphNode,
  type Group,
} from "./types";

export type Baseline = {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
};

export function makeBaseline(g: ComponentGraph): Baseline {
  return {
    nodes: new Map(g.nodes.map((n) => [n.id, n])),
    edges: new Map(g.edges.map((e) => [edgeId(e), e])),
  };
}

/** Fields that describe the edit itself, not the component. */
const EDIT_FIELDS = new Set(["status", "note"]);

function stripEditFields<T extends object>(x: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(x)) {
    if (EDIT_FIELDS.has(k)) continue;
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
function normalize(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(normalize);
  if (x && typeof x === "object") {
    return Object.fromEntries(
      Object.keys(x as object)
        .sort()
        .map((k) => [k, normalize((x as Record<string, unknown>)[k])])
    );
  }
  return x;
}

function statusAfterEdit<T extends { status?: string }>(edited: T, base: T | undefined): T["status"] {
  if (!base) return "new";
  if (edited.status === "delete") return "delete";
  return deepEqual(stripEditFields(edited), stripEditFields(base)) ? "existing" : "modify";
}

// ----------------------------------------------------------------- ids

export function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "node"
  );
}

export function uniqueNodeId(g: ComponentGraph, label: string): string {
  const base = slugify(label);
  const taken = new Set(g.nodes.map((n) => n.id));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

// ----------------------------------------------------------------- nodes

/** Rename a node id everywhere it is referenced (used for new nodes whose label changed). */
export function renameNode(g: ComponentGraph, oldId: string, newId: string): ComponentGraph {
  if (oldId === newId || g.nodes.some((n) => n.id === newId)) return g;
  return {
    ...g,
    nodes: g.nodes.map((n) => (n.id === oldId ? { ...n, id: newId } : n)),
    edges: g.edges.map((e) =>
      e.from === oldId || e.to === oldId
        ? { ...e, from: e.from === oldId ? newId : e.from, to: e.to === oldId ? newId : e.to }
        : e
    ),
  };
}

export function upsertNode(g: ComponentGraph, node: GraphNode, baseline: Baseline): ComponentGraph {
  const base = baseline.nodes.get(node.id);
  const next: GraphNode = { ...node, status: statusAfterEdit(node, base) };
  if (next.status === "existing") delete next.status;
  const exists = g.nodes.some((n) => n.id === node.id);
  return {
    ...g,
    nodes: exists ? g.nodes.map((n) => (n.id === node.id ? next : n)) : [...g.nodes, next],
  };
}

export function deleteNode(g: ComponentGraph, id: string, baseline: Baseline): ComponentGraph {
  const inBase = baseline.nodes.has(id);
  if (!inBase) {
    // never existed: drop it and every edge touching it
    return {
      ...g,
      nodes: g.nodes.filter((n) => n.id !== id),
      edges: g.edges.filter((e) => e.from !== id && e.to !== id),
    };
  }
  return {
    ...g,
    nodes: g.nodes.map((n) => (n.id === id ? { ...n, status: "delete" } : n)),
    edges: g.edges.flatMap((e) => {
      if (e.from !== id && e.to !== id) return [e];
      if (!baseline.edges.has(edgeId(e))) return []; // new edge to a deleted node: drop
      return [{ ...e, status: "delete" as const }];
    }),
  };
}

/** Undo a "delete" (or a "modify" by restoring the baseline copy). */
export function restoreNode(g: ComponentGraph, id: string, baseline: Baseline): ComponentGraph {
  const base = baseline.nodes.get(id);
  if (!base) return g;
  return {
    ...g,
    nodes: g.nodes.map((n) => (n.id === id ? { ...base } : n)),
    edges: g.edges.map((e) => {
      if (e.from !== id && e.to !== id) return e;
      const b = baseline.edges.get(edgeId(e));
      return b && e.status === "delete" ? { ...b } : e;
    }),
  };
}

// ----------------------------------------------------------------- edges

export function upsertEdge(g: ComponentGraph, edge: GraphEdge, baseline: Baseline, prevId?: string): ComponentGraph {
  const id = edgeId(edge);
  const base = baseline.edges.get(id);
  const next: GraphEdge = { ...edge, status: statusAfterEdit(edge, base) };
  if (next.status === "existing") delete next.status;
  const without = prevId && prevId !== id ? g.edges.filter((e) => edgeId(e) !== prevId) : g.edges;
  const exists = without.some((e) => edgeId(e) === id);
  return {
    ...g,
    edges: exists ? without.map((e) => (edgeId(e) === id ? next : e)) : [...without, next],
  };
}

export function deleteEdge(g: ComponentGraph, id: string, baseline: Baseline): ComponentGraph {
  if (!baseline.edges.has(id)) return { ...g, edges: g.edges.filter((e) => edgeId(e) !== id) };
  return { ...g, edges: g.edges.map((e) => (edgeId(e) === id ? { ...e, status: "delete" } : e)) };
}

export function restoreEdge(g: ComponentGraph, id: string, baseline: Baseline): ComponentGraph {
  const base = baseline.edges.get(id);
  if (!base) return g;
  return { ...g, edges: g.edges.map((e) => (edgeId(e) === id ? { ...base } : e)) };
}

/**
 * Reconnect an existing edge to a different endpoint. An existing edge is
 * marked "delete" and a "new" edge is added, so the PR diff shows both; a
 * new edge is simply moved.
 */
export function reconnectEdge(
  g: ComponentGraph,
  id: string,
  from: string,
  to: string,
  baseline: Baseline
): ComponentGraph {
  const old = g.edges.find((e) => edgeId(e) === id);
  if (!old) return g;
  if (old.from === from && old.to === to) return g;
  const moved: GraphEdge = { ...old, from, to, evidence: undefined, provenance: "manual" };
  delete moved.id;
  if (!baseline.edges.has(id)) {
    return upsertEdge(g, moved, baseline, id);
  }
  const withDeleted = deleteEdge(g, id, baseline);
  return upsertEdge(withDeleted, { ...moved, note: moved.note ?? `was ${old.from} → ${old.to}` }, baseline);
}

// ----------------------------------------------------------------- groups

export function upsertGroup(g: ComponentGraph, group: Group): ComponentGraph {
  const exists = g.groups.some((x) => x.id === group.id);
  return { ...g, groups: exists ? g.groups.map((x) => (x.id === group.id ? group : x)) : [...g.groups, group] };
}

// ----------------------------------------------------------------- pending edit

export interface PendingEdit {
  added: { nodes: GraphNode[]; edges: GraphEdge[] };
  modified: { nodes: GraphNode[]; edges: GraphEdge[] };
  deleted: { nodes: GraphNode[]; edges: GraphEdge[] };
  count: number;
}

export function pendingEdit(g: ComponentGraph): PendingEdit {
  const pick = <T extends { status?: string }>(xs: T[], s: string) => xs.filter((x) => x.status === s);
  const p = {
    added: { nodes: pick(g.nodes, "new"), edges: pick(g.edges, "new") },
    modified: { nodes: pick(g.nodes, "modify"), edges: pick(g.edges, "modify") },
    deleted: { nodes: pick(g.nodes, "delete"), edges: pick(g.edges, "delete") },
  };
  const count =
    p.added.nodes.length + p.added.edges.length + p.modified.nodes.length + p.modified.edges.length +
    p.deleted.nodes.length + p.deleted.edges.length;
  return { ...p, count };
}

/** Structured delta in the shape an MCP server would hand to the agent. */
export function editEnvelope(g: ComponentGraph, baseline: Baseline) {
  const p = pendingEdit(g);
  return {
    action: "revise",
    added: {
      nodes: p.added.nodes.map(({ id, label, kind, group, summary, description, files, routes, note }) => ({
        id, label, kind, group, summary, description, files, routes, note,
      })),
      edges: p.added.edges.map(({ from, to, kind, label, note }) => ({ from, to, kind, label, note })),
    },
    modified: {
      nodes: p.modified.nodes.map((n) => ({ id: n.id, note: n.note, before: baseline.nodes.get(n.id), after: n })),
      edges: p.modified.edges.map((e) => ({ id: edgeId(e), note: e.note, before: baseline.edges.get(edgeId(e)), after: e })),
    },
    deleted: {
      nodes: p.deleted.nodes.map((n) => ({ id: n.id, note: n.note })),
      edges: p.deleted.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind, note: e.note })),
    },
  };
}

/** Apply every pending status: deletes are removed, new/modify become existing. */
export function acceptAll(g: ComponentGraph): ComponentGraph {
  const strip = <T extends { status?: string; note?: string }>(x: T): T => {
    const y = { ...x };
    delete y.status;
    delete y.note;
    return y;
  };
  return {
    ...g,
    nodes: g.nodes.filter((n) => n.status !== "delete").map(strip),
    edges: g.edges.filter((e) => e.status !== "delete").map(strip),
  };
}

// ----------------------------------------------------------------- serialisation

const NODE_KEYS = ["id", "label", "kind", "group", "summary", "description", "files", "routes", "provenance", "status", "note", "tags"];
const EDGE_KEYS = ["id", "from", "to", "kind", "label", "description", "evidence", "provenance", "status", "note"];
const GROUP_KEYS = ["id", "label", "parent", "summary"];
const TOP_KEYS = ["version", "repo", "commit", "title", "description", "groups", "nodes", "edges"];

function ordered(obj: object, keys: string[]): Record<string, unknown> {
  const src = obj as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = src[k];
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0 && k !== "files") continue;
    if (k === "status" && v === "existing") continue;
    out[k] = v;
  }
  for (const k of Object.keys(src)) if (k.startsWith("x-") && src[k] !== undefined) out[k] = src[k];
  return out;
}

/** Serialise with stable key order so that PR diffs stay small. */
export function serializeGraph(g: ComponentGraph): string {
  const doc = ordered(
    {
      ...g,
      groups: g.groups.map((x) => ordered(x, GROUP_KEYS)),
      nodes: g.nodes.map((n) =>
        ordered(
          {
            ...n,
            files: n.files.map((f) => (typeof f === "string" || (!f.role && !f.lines) ? (typeof f === "string" ? f : f.path) : f)),
          },
          NODE_KEYS
        )
      ),
      edges: g.edges.map((e) => ordered(e, EDGE_KEYS)),
    },
    TOP_KEYS
  );
  return dump(doc, { lineWidth: 100, noRefs: true, sortKeys: false });
}
