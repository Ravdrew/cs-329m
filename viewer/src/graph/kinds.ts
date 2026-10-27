import type { EdgeKind, GraphEdge, NodeKind } from "./types";

export const KIND_META: Record<NodeKind, { label: string; icon: string }> = {
  page: { label: "Page", icon: "▭" },
  component: { label: "UI component", icon: "◫" },
  endpoint: { label: "Endpoint", icon: "◇" },
  service: { label: "Service", icon: "⚙" },
  model: { label: "Data model", icon: "⛁" },
  store: { label: "Client store", icon: "◎" },
  job: { label: "Background job", icon: "⏱" },
  external: { label: "External", icon: "⇗" },
  other: { label: "Other", icon: "•" },
};

export const EDGE_META: Record<EdgeKind, { label: string }> = {
  renders: { label: "renders" },
  navigates: { label: "navigates to" },
  calls: { label: "calls" },
  reads: { label: "reads" },
  writes: { label: "writes" },
  emits: { label: "emits" },
  uses: { label: "uses" },
};

/** CSS colour for an edge: status wins over kind. Resolved via the CSS variables in index.css. */
export function edgeColor(e: Pick<GraphEdge, "kind" | "status">): string {
  const status = e.status ?? "existing";
  if (status === "new") return "var(--new)";
  if (status === "modify") return "var(--modify)";
  if (status === "delete") return "var(--delete)";
  return EDGE_META[e.kind] ? `var(--e-${e.kind})` : "var(--line-2)";
}
