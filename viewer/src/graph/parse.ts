import { load as yamlLoad } from "js-yaml";
import {
  EDGE_KINDS,
  NODE_KINDS,
  type ComponentGraph,
  type GraphEdge,
  type GraphNode,
  edgeId,
} from "./types";

export class GraphParseError extends Error {}

/** Parse a YAML or JSON document into a validated ComponentGraph. */
export function parseGraph(text: string): ComponentGraph {
  let raw: unknown;
  try {
    raw = yamlLoad(text); // YAML is a superset of JSON
  } catch (e) {
    throw new GraphParseError(`Could not parse file: ${(e as Error).message}`);
  }
  return validateGraph(raw);
}

export function validateGraph(raw: unknown): ComponentGraph {
  if (!raw || typeof raw !== "object") throw new GraphParseError("Graph must be an object");
  const g = raw as Partial<ComponentGraph>;
  const problems: string[] = [];

  const groups = Array.isArray(g.groups) ? g.groups : [];
  const nodes = Array.isArray(g.nodes) ? g.nodes : [];
  const edges = Array.isArray(g.edges) ? g.edges : [];
  if (!Array.isArray(g.nodes)) problems.push("`nodes` must be a list");

  const groupIds = new Set<string>();
  for (const gr of groups) {
    if (!gr.id) problems.push("group without id");
    else if (groupIds.has(gr.id)) problems.push(`duplicate group id "${gr.id}"`);
    groupIds.add(gr.id);
  }
  for (const gr of groups) {
    if (gr.parent && !groupIds.has(gr.parent))
      problems.push(`group "${gr.id}" has unknown parent "${gr.parent}"`);
  }

  const nodeIds = new Set<string>();
  for (const n of nodes as GraphNode[]) {
    if (!n.id) problems.push("node without id");
    else if (nodeIds.has(n.id)) problems.push(`duplicate node id "${n.id}"`);
    nodeIds.add(n.id);
    if (!n.label) n.label = n.id;
    if (!NODE_KINDS.includes(n.kind)) {
      problems.push(`node "${n.id}" has unknown kind "${n.kind}"`);
    }
    if (n.group && !groupIds.has(n.group))
      problems.push(`node "${n.id}" references unknown group "${n.group}"`);
    if (!Array.isArray(n.files)) n.files = [];
  }

  const seenEdges = new Set<string>();
  for (const e of edges as GraphEdge[]) {
    const id = edgeId(e);
    if (!nodeIds.has(e.from)) problems.push(`edge ${id}: unknown source "${e.from}"`);
    if (!nodeIds.has(e.to)) problems.push(`edge ${id}: unknown target "${e.to}"`);
    if (!EDGE_KINDS.includes(e.kind)) problems.push(`edge ${id}: unknown kind "${e.kind}"`);
    if (seenEdges.has(id)) problems.push(`duplicate edge ${id}`);
    seenEdges.add(id);
  }

  if (problems.length) {
    throw new GraphParseError(
      `Invalid graph:\n` + problems.slice(0, 20).map((p) => `  - ${p}`).join("\n")
    );
  }

  return {
    version: 1,
    repo: g.repo,
    commit: g.commit,
    title: g.title,
    description: g.description,
    groups,
    nodes: nodes as GraphNode[],
    edges: edges as GraphEdge[],
  };
}
