import { useMemo, useState } from "react";
import type { ComponentGraph, NodeKind } from "../graph/types";
import { NODE_KINDS } from "../graph/types";
import { KIND_META } from "../graph/kinds";

interface Props {
  graph: ComponentGraph | null;
  fileName: string;
  onOpenFile: (f: File) => void;
  onPickNode: (id: string) => void;
  hiddenKinds: Set<string>;
  onToggleKind: (k: NodeKind) => void;
  direction: "DOWN" | "RIGHT";
  onDirection: (d: "DOWN" | "RIGHT") => void;
  columns: boolean;
  onToggleColumns: () => void;
  editable: boolean;
  onToggleEditable: () => void;
  onAddNode: () => void;
  onRelayout: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  changeCount: number;
  onShowChanges: () => void;
}

export default function Toolbar(props: Props) {
  const {
    graph, fileName, onOpenFile, onPickNode, hiddenKinds, onToggleKind, direction, onDirection, columns, onToggleColumns,
    editable, onToggleEditable, onAddNode, onRelayout, onUndo, onRedo, canUndo, canRedo, changeCount, onShowChanges,
  } = props;
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    if (!graph || q.trim().length < 2) return [];
    const needle = q.toLowerCase();
    return graph.nodes
      .filter(
        (n) =>
          n.label.toLowerCase().includes(needle) ||
          n.id.toLowerCase().includes(needle) ||
          n.summary?.toLowerCase().includes(needle) ||
          n.files.some((f) => (typeof f === "string" ? f : f.path).toLowerCase().includes(needle))
      )
      .slice(0, 8);
  }, [graph, q]);

  const kindsPresent = useMemo(() => {
    const s = new Set<NodeKind>();
    graph?.nodes.forEach((n) => s.add(n.kind));
    return NODE_KINDS.filter((k) => s.has(k));
  }, [graph]);

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark">⬡</span>
        <span className="brand-name">Graph viewer</span>
        <span className="brand-file" title={fileName}>
          {fileName}
          {changeCount > 0 ? " •" : ""}
        </span>
      </div>

      <label className="btn">
        Open…
        <input
          type="file"
          accept=".yaml,.yml,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onOpenFile(f);
            e.currentTarget.value = "";
          }}
        />
      </label>

      <div className="search">
        <input
          type="search"
          placeholder="Search nodes or files…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) {
              onPickNode(results[0].id);
              setQ("");
            }
            if (e.key === "Escape") setQ("");
          }}
        />
        {results.length > 0 && (
          <ul className="search-results">
            {results.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => {
                    onPickNode(n.id);
                    setQ("");
                  }}
                >
                  <span className="sr-kind">{KIND_META[n.kind].icon}</span>
                  <span className="sr-label">{n.label}</span>
                  {n.summary && <span className="sr-summary">{n.summary}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="kinds" role="group" aria-label="Filter by kind">
        {kindsPresent.map((k) => (
          <button
            key={k}
            className={`kind-chip kind-${k} ${hiddenKinds.has(k) ? "is-off" : ""}`}
            onClick={() => onToggleKind(k)}
            title={`${hiddenKinds.has(k) ? "Show" : "Hide"} ${KIND_META[k].label}`}
          >
            <span className="dot" /> {KIND_META[k].label}
          </button>
        ))}
      </div>

      <div className="seg">
        {!columns && (
          <>
            <button className={direction === "DOWN" ? "on" : ""} onClick={() => onDirection("DOWN")} title="Top to bottom">
              ↓
            </button>
            <button className={direction === "RIGHT" ? "on" : ""} onClick={() => onDirection("RIGHT")} title="Left to right">
              →
            </button>
          </>
        )}
        <button onClick={onRelayout} title="Re-run automatic layout">
          ⟳
        </button>
      </div>
      <label className="switch" title="Order nodes into columns by kind: pages, UI, endpoints, services, jobs, data">
        <input type="checkbox" checked={columns} onChange={onToggleColumns} />
        <span>Columns</span>
      </label>

      <div className="edit-tools">
        <label className="switch" title="Toggle editing">
          <input type="checkbox" checked={editable} onChange={onToggleEditable} />
          <span>Edit</span>
        </label>
        {editable && (
          <>
            <button className="btn" onClick={onAddNode} title="Add a new node (N)">
              + Node
            </button>
            <div className="seg">
              <button onClick={onUndo} disabled={!canUndo} title="Undo (⌘Z)">
                ↶
              </button>
              <button onClick={onRedo} disabled={!canRedo} title="Redo (⇧⌘Z)">
                ↷
              </button>
            </div>
          </>
        )}
        <button className={`btn changes-btn ${changeCount > 0 ? "has-changes" : ""}`} onClick={onShowChanges} title="Pending edit, export">
          Changes{changeCount > 0 ? ` (${changeCount})` : ""}
        </button>
      </div>
    </header>
  );
}
