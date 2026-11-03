import type { ComponentGraph, EdgeKind, GraphEdge } from "../graph/types";
import { EDGE_KINDS } from "../graph/types";
import { EDGE_META } from "../graph/kinds";

interface Props {
  graph: ComponentGraph;
  edge: GraphEdge;
  /** True when the edge exists in the committed graph; its ends can then only be moved on the canvas. */
  committed: boolean;
  onChange: (edge: GraphEdge) => void;
}

/** Live edge editor: every change updates the graph immediately. */
export default function EdgeForm({ graph, edge, committed, onChange }: Props) {
  const nodes = graph.nodes.filter((n) => n.status !== "delete");
  const set = <K extends keyof GraphEdge>(key: K, value: GraphEdge[K]) => onChange({ ...edge, [key]: value });
  const setText = (key: "label" | "description" | "note", value: string) =>
    onChange({ ...edge, [key]: value === "" ? undefined : value });

  return (
    <div className="form">
      <div className="row2">
        <label>
          From
          <select value={edge.from} disabled={committed} onChange={(e) => set("from", e.target.value)}>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          To
          <select value={edge.to} disabled={committed} onChange={(e) => set("to", e.target.value)}>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {committed && <p className="hint">To re-point a committed edge, drag its end on the canvas.</p>}
      <label>
        Kind
        <select value={edge.kind} onChange={(e) => set("kind", e.target.value as EdgeKind)}>
          {EDGE_KINDS.map((k) => (
            <option key={k} value={k}>
              {EDGE_META[k].label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Label
        <input value={edge.label ?? ""} onChange={(e) => setText("label", e.target.value)} placeholder="e.g. redirect after booking" />
      </label>
      <label>
        Description
        <textarea rows={2} value={edge.description ?? ""} onChange={(e) => setText("description", e.target.value)} />
      </label>
      <label>
        Note to the agent
        <textarea rows={2} value={edge.note ?? ""} onChange={(e) => setText("note", e.target.value)} />
      </label>
    </div>
  );
}
