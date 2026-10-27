import type { ComponentGraph, GraphEdge, GraphNode } from "../graph/types";
import { edgeId } from "../graph/types";
import type { Baseline } from "../graph/edit";
import { editEnvelope, pendingEdit, serializeGraph } from "../graph/edit";
import type { Selection } from "./DetailPanel";

interface Props {
  graph: ComponentGraph;
  baseline: Baseline;
  fileName: string;
  onSelect: (s: Selection) => void;
  onDiscard: () => void;
  onAccept: () => void;
  onClose: () => void;
}

function download(name: string, text: string, type = "text/yaml") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ChangesPanel({ graph, baseline, fileName, onSelect, onDiscard, onAccept, onClose }: Props) {
  const p = pendingEdit(graph);
  const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
  const NodeRow = ({ n }: { n: GraphNode }) => (
    <li>
      <button className="linklike strong" onClick={() => onSelect({ type: "node", id: n.id })}>
        {n.label}
      </button>
      <span className="muted"> · {n.kind}</span>
      {n.note && <div className="ev-note">“{n.note}”</div>}
    </li>
  );
  const EdgeRow = ({ e }: { e: GraphEdge }) => (
    <li>
      <button className="linklike" onClick={() => onSelect({ type: "edge", id: edgeId(e) })}>
        {label(e.from)} <span className="muted">{e.label ?? e.kind}</span> {label(e.to)}
      </button>
      {e.note && <div className="ev-note">“{e.note}”</div>}
    </li>
  );
  const Section = ({ title, nodes, edges }: { title: string; nodes: GraphNode[]; edges: GraphEdge[] }) =>
    nodes.length + edges.length === 0 ? null : (
      <>
        <h3>
          {title} ({nodes.length + edges.length})
        </h3>
        <ul className="edges">
          {nodes.map((n) => (
            <NodeRow key={n.id} n={n} />
          ))}
          {edges.map((e) => (
            <EdgeRow key={edgeId(e)} e={e} />
          ))}
        </ul>
      </>
    );

  const yamlName = fileName.replace(/\.(json|yml)$/, ".yaml") || "graph.yaml";
  return (
    <div className="changes">
      <div className="changes-head">
        <strong>Pending edit</strong>
        <span className="muted">
          {p.count === 0 ? "no changes" : `${p.count} change${p.count === 1 ? "" : "s"}`}
        </span>
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="changes-body">
        {p.count === 0 && <p className="hint">Edit a node or edge, draw a connection, or add a node to start an edit.</p>}
        <Section title="Added" nodes={p.added.nodes} edges={p.added.edges} />
        <Section title="Modified" nodes={p.modified.nodes} edges={p.modified.edges} />
        <Section title="Deleted" nodes={p.deleted.nodes} edges={p.deleted.edges} />
      </div>
      <div className="changes-actions">
        <button className="btn primary" onClick={() => download(yamlName, serializeGraph(graph))}>
          Download {yamlName}
        </button>
        <button className="btn" onClick={() => navigator.clipboard?.writeText(serializeGraph(graph))}>
          Copy YAML
        </button>
        <button
          className="btn"
          disabled={p.count === 0}
          onClick={() => download("graph.edit.json", JSON.stringify(editEnvelope(graph, baseline), null, 2), "application/json")}
          title="The structured delta an MCP server would hand to the agent"
        >
          Export edit JSON
        </button>
        <span className="spacer" />
        <button className="btn" disabled={p.count === 0} onClick={onAccept} title="Apply all statuses: deletes removed, new/modify become existing">
          Accept all
        </button>
        <button className="btn danger" disabled={p.count === 0} onClick={onDiscard}>
          Discard all
        </button>
      </div>
    </div>
  );
}
