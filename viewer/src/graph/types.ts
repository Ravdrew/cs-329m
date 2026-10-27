/**
 * Component-graph file format, draft v0 (see docs/graph-format-proposal.md).
 *
 * A graph is a single YAML (or JSON) document checked into the repository.
 * Nodes are human-scale components (a page, an endpoint, a service, a data
 * model); every node lists the files it owns, and every edge lists the code
 * locations that justify it.
 */

export const NODE_KINDS = [
  "page",
  "component",
  "endpoint",
  "service",
  "model",
  "store",
  "job",
  "external",
  "other",
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const EDGE_KINDS = [
  "renders",
  "navigates",
  "calls",
  "reads",
  "writes",
  "emits",
  "uses",
] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

/** Where a fact came from: static analysis, an LLM, or a human. */
export type Provenance = "extracted" | "inferred" | "manual";

/** Edit overlay: how a node/edge differs from the committed baseline. */
export type Status = "existing" | "new" | "modify" | "delete";

export interface FileRef {
  path: string;
  /** Optional role of the file inside the component, e.g. "entry", "schema". */
  role?: string;
  /** Optional 1-based line range inside the file. */
  lines?: [number, number];
}

export interface Evidence {
  file: string;
  line?: number;
  /** Symbol at that location, e.g. the function being called. */
  symbol?: string;
  note?: string;
}

export interface Group {
  id: string;
  label: string;
  /** Parent group id for nested groups. */
  parent?: string;
  summary?: string;
}

export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  group?: string;
  summary?: string;
  /** Markdown. */
  description?: string;
  files: Array<string | FileRef>;
  /** URL routes served (pages) or exposed (endpoints), e.g. "/[user]/[type]". */
  routes?: string[];
  provenance?: Provenance;
  status?: Status;
  /** Developer note attached as part of an edit. */
  note?: string;
  tags?: string[];
}

export interface GraphEdge {
  id?: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
  description?: string;
  evidence?: Evidence[];
  provenance?: Provenance;
  status?: Status;
  note?: string;
}

export interface ComponentGraph {
  version: 1;
  /** e.g. "calcom/cal.diy" — used to build source links. */
  repo?: string;
  /** Commit the graph was built against. */
  commit?: string;
  title?: string;
  description?: string;
  groups: Group[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function filePath(f: string | FileRef): string {
  return typeof f === "string" ? f : f.path;
}

export function edgeId(e: GraphEdge): string {
  return e.id ?? `${e.from}->${e.to}:${e.kind}`;
}
