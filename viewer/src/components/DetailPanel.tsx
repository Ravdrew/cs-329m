import ReactMarkdown from "react-markdown";
import type { ComponentGraph, GraphEdge, GraphNode } from "../graph/types";
import { edgeId, filePath } from "../graph/types";
import { EDGE_META, KIND_META } from "../graph/kinds";
import NodeForm from "./NodeForm";
import EdgeForm from "./EdgeForm";

type Selection = { type: "node"; id: string } | { type: "edge"; id: string } | null;

interface Props {
  graph: ComponentGraph;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onClose: () => void;
  editable?: boolean;
  onDelete?: (s: Selection) => void;
  onRestore?: (s: Selection) => void;
  /** Live edits (editable mode). */
  onChangeNode?: (n: GraphNode) => void;
  onNodeLabelBlur?: (n: GraphNode) => void;
  onChangeEdge?: (e: GraphEdge, prevId: string) => void;
  /** Ids of nodes/edges that exist in the committed baseline. */
  committedNodeIds?: Set<string>;
  committedEdgeIds?: Set<string>;
  /** Node that was just created and should get focus. */
  freshNodeId?: string | null;
}

function EditBar({ status, onDelete, onRestore }: { status?: string; onDelete: () => void; onRestore: () => void }) {
  const deleted = status === "delete";
  return (
    <div className="editbar">
      {deleted || status === "modify" ? (
        <button className="btn small" onClick={onRestore} title="Restore the committed version">
          Restore
        </button>
      ) : null}
      {!deleted && (
        <button className="btn small danger" onClick={onDelete}>
          {status === "new" ? "Remove" : "Delete"}
        </button>
      )}
    </div>
  );
}

function sourceUrl(graph: ComponentGraph, path: string, line?: number): string | undefined {
  if (!graph.repo) return undefined;
  const ref = graph.commit ?? "main";
  const base = `https://github.com/${graph.repo}/blob/${ref}/${path}`;
  return line ? `${base}#L${line}` : base;
}

function FileLink({ graph, path, line }: { graph: ComponentGraph; path: string; line?: number }) {
  const url = sourceUrl(graph, path, line);
  const text = line ? `${path}:${line}` : path;
  return url ? (
    <a className="file-link" href={url} target="_blank" rel="noreferrer">
      {text}
    </a>
  ) : (
    <span className="file-link">{text}</span>
  );
}

function StatusChip({ status, note }: { status?: string; note?: string }) {
  if (!status || status === "existing") return null;
  return (
    <div className={`status-chip badge-${status}`}>
      <strong>{status}</strong>
      {note && <span> · {note}</span>}
    </div>
  );
}

export default function DetailPanel(props: Props) {
  const {
    graph, selection, onSelect, onClose, editable, onDelete, onRestore,
    onChangeNode, onNodeLabelBlur, onChangeEdge, committedNodeIds, committedEdgeIds, freshNodeId,
  } = props;
  const editBar = (status?: string) =>
    editable && selection && onDelete && onRestore ? (
      <EditBar status={status} onDelete={() => onDelete(selection)} onRestore={() => onRestore(selection)} />
    ) : null;
  if (!selection) {
    const edgeKindsPresent = Array.from(new Set(graph.edges.map((e) => e.kind)));
    return (
      <aside className="panel panel-empty">
        <h2>{graph.title ?? "Component graph"}</h2>
        {graph.description && (
          <div className="md">
            <ReactMarkdown>{graph.description}</ReactMarkdown>
          </div>
        )}
        <dl className="meta">
          {graph.repo && (
            <>
              <dt>Repo</dt>
              <dd>
                <a href={`https://github.com/${graph.repo}`} target="_blank" rel="noreferrer">
                  {graph.repo}
                </a>
              </dd>
            </>
          )}
          {graph.commit && (
            <>
              <dt>Commit</dt>
              <dd>
                <code>{graph.commit.slice(0, 10)}</code>
              </dd>
            </>
          )}
          <dt>Size</dt>
          <dd>
            {graph.nodes.length} nodes · {graph.edges.length} edges · {graph.groups.length} groups
          </dd>
        </dl>
        <h3>Edge colours</h3>
        <div className="legend">
          {edgeKindsPresent.map((k) => (
            <div key={k} className={`legend-item edge-kind-${k}`}>
              <span className="legend-swatch" aria-hidden />
              {EDGE_META[k]?.label ?? k}
            </div>
          ))}
        </div>
        <p className="hint">
          Node colours follow the kind chips in the toolbar. Click a node to see its description and
          files. Click an edge to see the code that justifies it. Scroll to zoom, drag to pan.
        </p>
        {editable && (
          <p className="hint">
            <strong>Editing is on.</strong> Drag from a node's bottom handle to another node to draw an
            edge; drag an edge end to reconnect it. Use <em>Edit</em> / <em>Delete</em> in this panel,
            or <em>+ Node</em> in the toolbar. ⌘Z undoes.
          </p>
        )}
      </aside>
    );
  }

  if (selection.type === "edge") {
    const e = graph.edges.find((x) => edgeId(x) === selection.id);
    if (!e) return null;
    const from = graph.nodes.find((n) => n.id === e.from);
    const to = graph.nodes.find((n) => n.id === e.to);
    return (
      <aside className="panel">
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="eyebrow">Edge · {EDGE_META[e.kind]?.label ?? e.kind}</div>
        <h2>
          <button className="linklike" onClick={() => onSelect({ type: "node", id: e.from })}>
            {from?.label ?? e.from}
          </button>
          <span className="arrow"> → </span>
          <button className="linklike" onClick={() => onSelect({ type: "node", id: e.to })}>
            {to?.label ?? e.to}
          </button>
        </h2>
        <StatusChip status={e.status} note={e.note} />
        {editBar(e.status)}
        {editable && onChangeEdge && e.status !== "delete" ? (
          <EdgeForm
            key={selection.id}
            graph={graph}
            edge={e}
            committed={!!committedEdgeIds?.has(selection.id)}
            onChange={(next) => onChangeEdge(next, selection.id)}
          />
        ) : (
          <>
            {e.label && <p className="summary">{e.label}</p>}
            {e.description && (
              <div className="md">
                <ReactMarkdown>{e.description}</ReactMarkdown>
              </div>
            )}
          </>
        )}
        <h3>Evidence {e.evidence?.length ? `(${e.evidence.length})` : ""}</h3>
        {e.evidence?.length ? (
          <ul className="files">
            {e.evidence.map((ev, i) => (
              <li key={i}>
                <FileLink graph={graph} path={ev.file} line={ev.line} />
                {ev.symbol && <code className="sym">{ev.symbol}</code>}
                {ev.note && <div className="ev-note">{ev.note}</div>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">No code locations recorded for this edge.</p>
        )}
        {e.provenance && <div className="prov">provenance: {e.provenance}</div>}
      </aside>
    );
  }

  const n = graph.nodes.find((x) => x.id === selection.id);
  if (!n) return null;
  const outgoing = graph.edges.filter((e) => e.from === n.id);
  const incoming = graph.edges.filter((e) => e.to === n.id);
  const group = n.group ? graph.groups.find((g) => g.id === n.group) : undefined;
  const nodeLabel = (id: string) => graph.nodes.find((x) => x.id === id)?.label ?? id;

  const EdgeRow = ({ e, other }: { e: GraphEdge; other: string }) => (
    <li>
      <button className="linklike" onClick={() => onSelect({ type: "edge", id: edgeId(e) })}>
        <span className={`edge-kind edge-kind-${e.kind}`}>{e.label ?? EDGE_META[e.kind]?.label ?? e.kind}</span>
      </button>{" "}
      <button className="linklike strong" onClick={() => onSelect({ type: "node", id: other })}>
        {nodeLabel(other)}
      </button>
      {e.status && e.status !== "existing" && (
        <span className={`cnode-badge badge-${e.status}`}>{e.status}</span>
      )}
    </li>
  );

  return (
    <aside className="panel">
      <button className="close" onClick={onClose} aria-label="Close">
        ×
      </button>
      {editable && onChangeNode && n.status !== "delete" ? (
        <>
          <div className="eyebrow">
            {KIND_META[n.kind]?.label ?? n.kind}
            {group && <> · in {group.label}</>}
            <span className="muted"> · id {n.id}</span>
          </div>
          <StatusChip status={n.status} note={undefined} />
          {editBar(n.status)}
          <NodeForm
            key={n.id}
            graph={graph}
            node={n}
            onChange={onChangeNode}
            onLabelBlur={committedNodeIds?.has(n.id) ? undefined : onNodeLabelBlur}
            autoFocusLabel={freshNodeId === n.id}
          />
        </>
      ) : (
        <>
          <div className="eyebrow">
            {KIND_META[n.kind]?.label ?? n.kind}
            {group && <> · in {group.label}</>}
          </div>
          <h2>{n.label}</h2>
          <StatusChip status={n.status} note={n.note} />
          {editBar(n.status)}
          {n.summary && <p className="summary">{n.summary}</p>}
          {n.routes?.length ? (
            <div className="routes">
              {n.routes.map((r) => (
                <code key={r}>{r}</code>
              ))}
            </div>
          ) : null}
          {n.description && (
            <div className="md">
              <ReactMarkdown>{n.description}</ReactMarkdown>
            </div>
          )}
        </>
      )}

      <h3>Files ({n.files.length})</h3>
      <ul className="files">
        {n.files.map((f, i) => {
          const p = filePath(f);
          const role = typeof f === "string" ? undefined : f.role;
          const lines = typeof f === "string" ? undefined : f.lines;
          return (
            <li key={i}>
              <FileLink graph={graph} path={p} line={lines?.[0]} />
              {role && <span className="role">{role}</span>}
            </li>
          );
        })}
      </ul>

      {outgoing.length > 0 && (
        <>
          <h3>Outgoing ({outgoing.length})</h3>
          <ul className="edges">
            {outgoing.map((e) => (
              <EdgeRow key={edgeId(e)} e={e} other={e.to} />
            ))}
          </ul>
        </>
      )}
      {incoming.length > 0 && (
        <>
          <h3>Incoming ({incoming.length})</h3>
          <ul className="edges">
            {incoming.map((e) => (
              <EdgeRow key={edgeId(e)} e={e} other={e.from} />
            ))}
          </ul>
        </>
      )}
      {n.tags?.length ? (
        <div className="tags">
          {n.tags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
      ) : null}
      {n.provenance && <div className="prov">provenance: {n.provenance}</div>}
    </aside>
  );
}

export type { Selection, GraphNode };
