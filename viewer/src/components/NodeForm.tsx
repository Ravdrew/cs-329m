import { useEffect, useRef, useState } from "react";
import type { ComponentGraph, FileRef, GraphNode, NodeKind } from "../graph/types";
import { NODE_KINDS } from "../graph/types";
import { KIND_META } from "../graph/kinds";

interface Props {
  graph: ComponentGraph;
  node: GraphNode;
  /** Called on every change; the graph updates live. */
  onChange: (node: GraphNode) => void;
  /** Called when the label field loses focus (used to derive the id of a new node). */
  onLabelBlur?: (node: GraphNode) => void;
  /** Focus and select the label on mount (just-created node). */
  autoFocusLabel?: boolean;
}

function filesToText(files: Array<string | FileRef> | undefined): string {
  return (files ?? [])
    .map((f) => (typeof f === "string" ? f : f.role ? `${f.path} | ${f.role}` : f.path))
    .join("\n");
}

function textToFiles(text: string): Array<string | FileRef> {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [path, role] = l.split("|").map((s) => s.trim());
      return role ? { path, role } : path;
    });
}

function textToRoutes(text: string): string[] {
  return text.split(",").map((r) => r.trim()).filter(Boolean);
}

/**
 * Live node editor: every keystroke updates the graph. Routes and files are
 * kept as local text (their parsed form is lossy while typing) and re-synced
 * when the node changes underneath us (undo, redo, another node selected).
 */
export default function NodeForm({ graph, node, onChange, onLabelBlur, autoFocusLabel }: Props) {
  const [routesText, setRoutesText] = useState((node.routes ?? []).join(", "));
  const [filesText, setFilesText] = useState(filesToText(node.files));
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (JSON.stringify(textToRoutes(routesText)) !== JSON.stringify(node.routes ?? [])) {
      setRoutesText((node.routes ?? []).join(", "));
    }
    if (JSON.stringify(textToFiles(filesText)) !== JSON.stringify(node.files ?? [])) {
      setFilesText(filesToText(node.files));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node]);

  useEffect(() => {
    if (autoFocusLabel && labelRef.current) {
      labelRef.current.focus();
      labelRef.current.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof GraphNode>(key: K, value: GraphNode[K]) => onChange({ ...node, [key]: value });
  const setText = (key: "summary" | "description" | "note", value: string) =>
    onChange({ ...node, [key]: value === "" ? undefined : value });

  return (
    <div className="form">
      <label>
        Label
        <input
          ref={labelRef}
          value={node.label}
          onChange={(e) => set("label", e.target.value)}
          onBlur={() => onLabelBlur?.(node)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      </label>
      <div className="row2">
        <label>
          Kind
          <select value={node.kind} onChange={(e) => set("kind", e.target.value as NodeKind)}>
            {NODE_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_META[k].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Group
          <select value={node.group ?? ""} onChange={(e) => set("group", e.target.value || undefined)}>
            <option value="">(none)</option>
            {graph.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Summary <span className="muted">one line</span>
        <input value={node.summary ?? ""} onChange={(e) => setText("summary", e.target.value)} />
      </label>
      <label>
        Description <span className="muted">markdown</span>
        <textarea rows={4} value={node.description ?? ""} onChange={(e) => setText("description", e.target.value)} />
      </label>
      <label>
        Routes <span className="muted">comma-separated</span>
        <input
          value={routesText}
          onChange={(e) => {
            setRoutesText(e.target.value);
            set("routes", textToRoutes(e.target.value));
          }}
          placeholder="/booked, POST /api/x"
        />
      </label>
      <label>
        Files <span className="muted">one per line, optional “ | role”</span>
        <textarea
          rows={4}
          className="mono"
          value={filesText}
          onChange={(e) => {
            setFilesText(e.target.value);
            set("files", textToFiles(e.target.value));
          }}
          placeholder="apps/web/app/booked/page.tsx | route"
        />
      </label>
      <label>
        Note to the agent
        <textarea
          rows={2}
          value={node.note ?? ""}
          onChange={(e) => setText("note", e.target.value)}
          placeholder="What should be true about this component?"
        />
      </label>
    </div>
  );
}
