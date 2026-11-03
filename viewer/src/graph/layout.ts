import ELK, { type ElkNode, type ElkExtendedEdge } from "elkjs/lib/elk.bundled.js";
import type { Edge, Node } from "@xyflow/react";
import type { ComponentGraph, GraphEdge, GraphNode, Group, NodeKind } from "./types";
import { edgeId } from "./types";

export const NODE_W = 220;
export const NODE_H = 72;
const GROUP_PAD = 48;
const HEADER_H = 36;
const HEADER_GAP = 28;

export type ComponentNodeData = {
  node: GraphNode;
  selected?: boolean;
  dimmed?: boolean;
  editable?: boolean;
  /** Edges attach left/right instead of top/bottom (RIGHT direction, columns). */
  horizontal?: boolean;
};
export type GroupNodeData = { group: Group; dimmed?: boolean };
export type ColumnHeaderData = { label: string; kinds: NodeKind[] };
export type EdgeData = { edge: GraphEdge; dimmed?: boolean; highlighted?: boolean };

export type RFNode =
  | Node<ComponentNodeData, "component">
  | Node<GroupNodeData, "group">
  | Node<ColumnHeaderData, "columnHeader">;
export type RFEdge = Edge<EdgeData>;

/**
 * Columns mode: left-to-right bands by node kind, so the graph reads as a
 * data flow (UI -> API -> services -> side effects -> data). Index = ELK
 * partition.
 */
export const COLUMNS: ReadonlyArray<{ label: string; kinds: NodeKind[] }> = [
  { label: "Pages", kinds: ["page"] },
  { label: "UI components", kinds: ["component", "store"] },
  { label: "Endpoints", kinds: ["endpoint"] },
  { label: "Services", kinds: ["service"] },
  { label: "Jobs & external", kinds: ["job", "external", "other"] },
  { label: "Data models", kinds: ["model"] },
];

export function columnOf(kind: NodeKind): number {
  const i = COLUMNS.findIndex((c) => c.kinds.includes(kind));
  return i < 0 ? COLUMNS.length - 2 : i;
}

const HEADER_PREFIX = "__column:";
const headerId = (col: number) => `${HEADER_PREFIX}${col}`;

const elk = new ELK();

/**
 * Lay out the graph with ELK's layered algorithm. Groups become compound
 * nodes; ELK handles cross-group edges because hierarchyHandling is
 * INCLUDE_CHILDREN.
 *
 * With `columns` on, the layout is flat (no group boxes: ELK partitions do not
 * mix with compound nodes), direction is forced to RIGHT and every node is
 * assigned an ELK partition from its kind, so partition 0 is strictly left of
 * partition 1 and so on. A "columnHeader" node is added above each non-empty
 * column.
 */
export async function layoutGraph(
  graph: ComponentGraph,
  direction: "DOWN" | "RIGHT" = "DOWN",
  columns = false
): Promise<{ nodes: RFNode[]; edges: RFEdge[] }> {
  if (columns) return layoutColumns(graph);
  const childrenOfGroup = new Map<string | undefined, ElkNode[]>();
  const push = (parent: string | undefined, n: ElkNode) => {
    const arr = childrenOfGroup.get(parent) ?? [];
    arr.push(n);
    childrenOfGroup.set(parent, arr);
  };

  const groupById = new Map(graph.groups.map((g) => [g.id, g]));
  const elkGroups = new Map<string, ElkNode>();
  for (const g of graph.groups) {
    const en: ElkNode = {
      id: g.id,
      children: [],
      layoutOptions: {
        "elk.padding": `[top=${GROUP_PAD + 8},left=${GROUP_PAD / 2},bottom=${GROUP_PAD / 2},right=${GROUP_PAD / 2}]`,
      },
    };
    elkGroups.set(g.id, en);
  }
  for (const g of graph.groups) push(g.parent, elkGroups.get(g.id)!);
  for (const n of graph.nodes) {
    push(n.group && groupById.has(n.group) ? n.group : undefined, {
      id: n.id,
      width: NODE_W,
      height: NODE_H,
    });
  }
  for (const [gid, en] of elkGroups) en.children = childrenOfGroup.get(gid) ?? [];

  const elkEdges: ElkExtendedEdge[] = graph.edges.map((e) => ({
    id: edgeId(e),
    sources: [e.from],
    targets: [e.to],
  }));

  const root: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.layered.spacing.nodeNodeBetweenLayers": "90",
      "elk.spacing.nodeNode": "40",
      "elk.spacing.componentComponent": "60",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.edgeRouting": "SPLINES",
    },
    children: childrenOfGroup.get(undefined) ?? [],
    edges: elkEdges,
  };

  const laid = await elk.layout(root);

  const nodes: RFNode[] = [];
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const walk = (parent: ElkNode, parentId?: string) => {
    for (const c of parent.children ?? []) {
      const pos = { x: c.x ?? 0, y: c.y ?? 0 };
      if (elkGroups.has(c.id)) {
        nodes.push({
          id: c.id,
          type: "group",
          position: pos,
          data: { group: groupById.get(c.id)! },
          parentId,
          style: { width: c.width, height: c.height },
          selectable: false,
          draggable: true,
          zIndex: 0,
        });
        walk(c, c.id);
      } else {
        nodes.push({
          id: c.id,
          type: "component",
          position: pos,
          data: { node: nodeById.get(c.id)! },
          parentId,
          width: NODE_W,
          height: NODE_H,
          zIndex: 10,
        });
      }
    }
  };
  walk(laid);

  if (direction === "RIGHT") for (const n of nodes) if (n.type === "component") n.data.horizontal = true;

  return { nodes, edges: rfEdges(graph) };
}

function rfEdges(graph: ComponentGraph): RFEdge[] {
  return graph.edges.map((e) => ({
    id: edgeId(e),
    source: e.from,
    target: e.to,
    type: "component",
    zIndex: 5,
    data: { edge: e },
  }));
}

async function layoutColumns(graph: ComponentGraph): Promise<{ nodes: RFNode[]; edges: RFEdge[] }> {
  const root: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.partitioning.activate": "true",
      // keep every component in one layering so partitions line up globally
      "elk.separateConnectedComponents": "false",
      "elk.layered.spacing.nodeNodeBetweenLayers": "48",
      "elk.spacing.nodeNode": "28",
      "elk.layered.spacing.edgeNodeBetweenLayers": "12",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "4",
      "elk.spacing.edgeNode": "12",
      "elk.spacing.edgeEdge": "4",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.edgeRouting": "SPLINES",
    },
    children: graph.nodes.map((n) => ({
      id: n.id,
      width: NODE_W,
      height: NODE_H,
      layoutOptions: { "elk.partitioning.partition": String(columnOf(n.kind)) },
    })),
    edges: graph.edges.map((e) => ({ id: edgeId(e), sources: [e.from], targets: [e.to] })),
  };

  const laid = await elk.layout(root);
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const nodes: RFNode[] = [];
  const extent = new Map<number, { minX: number; maxX: number }>();
  let minY = Infinity;
  for (const c of laid.children ?? []) {
    const gn = nodeById.get(c.id);
    if (!gn) continue;
    const x = c.x ?? 0;
    const y = c.y ?? 0;
    minY = Math.min(minY, y);
    const col = columnOf(gn.kind);
    const ex = extent.get(col) ?? { minX: Infinity, maxX: -Infinity };
    ex.minX = Math.min(ex.minX, x);
    ex.maxX = Math.max(ex.maxX, x + NODE_W);
    extent.set(col, ex);
    nodes.push({
      id: c.id,
      type: "component",
      position: { x, y },
      data: { node: gn, horizontal: true },
      width: NODE_W,
      height: NODE_H,
      zIndex: 10,
    });
  }
  const headers: RFNode[] = [];
  for (const [col, ex] of [...extent.entries()].sort((a, b) => a[0] - b[0])) {
    headers.push(columnHeaderNode(col, ex.minX, ex.maxX - ex.minX, (isFinite(minY) ? minY : 0) - HEADER_GAP - HEADER_H));
  }
  return { nodes: [...headers, ...nodes], edges: rfEdges(graph) };
}

function columnHeaderNode(col: number, x: number, width: number, y: number): RFNode {
  return {
    id: headerId(col),
    type: "columnHeader",
    position: { x, y },
    data: { label: COLUMNS[col].label, kinds: COLUMNS[col].kinds },
    width,
    height: HEADER_H,
    style: { width, height: HEADER_H },
    selectable: false,
    draggable: false,
    connectable: false,
    focusable: false,
    zIndex: 0,
  };
}

export type Point = { x: number; y: number };

/** Absolute (canvas) position of a node, walking up its parents. */
export function absolutePosition(nodes: RFNode[], id: string): Point {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let x = 0;
  let y = 0;
  let cur = byId.get(id);
  while (cur) {
    x += cur.position.x;
    y += cur.position.y;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return { x, y };
}

/** Rename a node id in a layout, keeping its position (edges are rebuilt by mergeLayout). */
export function renameInLayout(
  l: { nodes: RFNode[]; edges: RFEdge[] },
  oldId: string,
  newId: string
): { nodes: RFNode[]; edges: RFEdge[] } {
  return {
    nodes: l.nodes.map((n) => (n.id === oldId ? ({ ...n, id: newId } as RFNode) : n)),
    edges: l.edges.map((e) => ({
      ...e,
      source: e.source === oldId ? newId : e.source,
      target: e.target === oldId ? newId : e.target,
    })),
  };
}

/** Deepest group whose box contains the absolute point, or undefined. */
export function groupAtPoint(nodes: RFNode[], p: Point): string | undefined {
  let best: { id: string; depth: number } | undefined;
  const depthOf = (n: RFNode) => {
    let d = 0;
    let cur: RFNode | undefined = n;
    const byId = new Map(nodes.map((x) => [x.id, x]));
    while (cur?.parentId) {
      d++;
      cur = byId.get(cur.parentId);
    }
    return d;
  };
  for (const n of nodes) {
    if (n.type !== "group") continue;
    const a = absolutePosition(nodes, n.id);
    const w = Number(n.measured?.width ?? n.style?.width ?? 0);
    const h = Number(n.measured?.height ?? n.style?.height ?? 0);
    if (p.x >= a.x && p.x <= a.x + w && p.y >= a.y && p.y <= a.y + h) {
      const d = depthOf(n);
      if (!best || d > best.depth) best = { id: n.id, depth: d };
    }
  }
  return best?.id;
}

/**
 * Update an existing layout for an edited graph without re-running ELK:
 * keep positions of known nodes, drop removed ones, place new ones, and
 * rebuild edges from the graph. `placeAt` pins nodes (new, or moved to
 * another group) to an absolute canvas position, e.g. where the user
 * dropped them or the centre of the viewport.
 */
export function mergeLayout(
  prev: { nodes: RFNode[]; edges: RFEdge[] },
  graph: ComponentGraph,
  placeAt: Record<string, Point> = {},
  columns = false
): { nodes: RFNode[]; edges: RFEdge[] } {
  if (columns) return mergeColumns(prev, graph, placeAt);
  const groupIds = new Set(graph.groups.map((g) => g.id));
  const byId = new Map(prev.nodes.map((n) => [n.id, n]));
  const nodes: RFNode[] = [];

  // groups first (React Flow requires parents before children)
  for (const g of graph.groups) {
    const old = byId.get(g.id);
    if (old && old.type === "group") {
      nodes.push({ ...old, data: { ...old.data, group: g } } as RFNode);
    } else {
      nodes.push({
        id: g.id,
        type: "group",
        position: { x: 0, y: maxBottom(prev.nodes) + 80 },
        data: { group: g },
        parentId: g.parent && groupIds.has(g.parent) ? g.parent : undefined,
        style: { width: NODE_W + 80, height: NODE_H + 120 },
        selectable: false,
        draggable: true,
        zIndex: 0,
      });
    }
  }

  const groupById = new Map(nodes.filter((n) => n.type === "group").map((n) => [n.id, n]));
  let freeY = maxBottom(prev.nodes) + 100;
  for (const n of graph.nodes) {
    const old = byId.get(n.id);
    const parentId = n.group && groupIds.has(n.group) ? n.group : undefined;
    if (old && old.type === "component" && old.parentId === parentId) {
      nodes.push({ ...old, data: { ...old.data, node: n } } as RFNode);
      continue;
    }
    // new node, or moved to another group: place it
    let position = { x: 0, y: freeY };
    const pin = placeAt[n.id];
    if (pin) {
      const origin = parentId ? absolutePosition(nodes, parentId) : { x: 0, y: 0 };
      position = { x: pin.x - origin.x, y: pin.y - origin.y };
    } else if (parentId) {
      const parent = groupById.get(parentId)!;
      const h = Number(parent.style?.height ?? 200);
      const w = Number(parent.style?.width ?? 300);
      position = { x: Math.max(24, w / 2 - NODE_W / 2), y: h - 12 };
      // grow the parent so the node sits inside it
      parent.style = { ...parent.style, height: h + NODE_H + 36, width: Math.max(w, NODE_W + 48) };
    } else {
      freeY += NODE_H + 40;
    }
    nodes.push({
      id: n.id,
      type: "component",
      position,
      data: { node: n },
      parentId,
      width: NODE_W,
      height: NODE_H,
      zIndex: 10,
      selected: old?.selected,
    });
  }

  return { nodes, edges: rfEdges(graph) };
}

/**
 * Columns-mode merge: flat nodes, no group boxes. Column headers are kept
 * (and added for a column that just gained its first node); a new node lands
 * where it was dropped, or under its kind's column.
 */
function mergeColumns(
  prev: { nodes: RFNode[]; edges: RFEdge[] },
  graph: ComponentGraph,
  placeAt: Record<string, Point>
): { nodes: RFNode[]; edges: RFEdge[] } {
  const byId = new Map(prev.nodes.map((n) => [n.id, n]));
  const headers = new Map<number, RFNode>();
  let minY = Infinity;
  for (const n of prev.nodes) {
    if (n.type === "columnHeader") headers.set(Number(n.id.slice(HEADER_PREFIX.length)), n);
    else if (n.type === "component") minY = Math.min(minY, n.position.y);
  }
  const nodes: RFNode[] = [];
  let freeY = maxBottom(prev.nodes) + 100;
  for (const n of graph.nodes) {
    const old = byId.get(n.id);
    if (old && old.type === "component" && !old.parentId) {
      nodes.push({ ...old, data: { ...old.data, node: n, horizontal: true } } as RFNode);
      continue;
    }
    const col = columnOf(n.kind);
    let header = headers.get(col);
    let position = placeAt[n.id];
    if (!position) {
      position = { x: header ? header.position.x : 0, y: freeY };
      freeY += NODE_H + 40;
    }
    if (!header) {
      header = columnHeaderNode(col, position.x, NODE_W, (isFinite(minY) ? minY : position.y) - HEADER_GAP - HEADER_H);
      headers.set(col, header);
    }
    nodes.push({
      id: n.id,
      type: "component",
      position,
      data: { node: n, horizontal: true },
      width: NODE_W,
      height: NODE_H,
      zIndex: 10,
      selected: old?.selected,
    });
  }
  const headerNodes = [...headers.entries()].sort((a, b) => a[0] - b[0]).map(([, h]) => h);
  return { nodes: [...headerNodes, ...nodes], edges: rfEdges(graph) };
}

function maxBottom(nodes: RFNode[]): number {
  let y = 0;
  for (const n of nodes) {
    if (n.parentId) continue;
    const h = n.type === "component" ? NODE_H : Number(n.style?.height ?? 0);
    y = Math.max(y, n.position.y + h);
  }
  return y;
}
