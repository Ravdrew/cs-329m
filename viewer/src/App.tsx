import { useCallback, useEffect, useRef, useState } from "react";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ComponentGraph, GraphEdge, GraphNode, NodeKind } from "./graph/types";
import { edgeId } from "./graph/types";
import { parseGraph } from "./graph/parse";
import {
  groupAtPoint, layoutGraph, mergeLayout, NODE_H, NODE_W, renameInLayout,
  type Point, type RFEdge, type RFNode,
} from "./graph/layout";
import {
  acceptAll, deleteEdge, deleteNode, makeBaseline, pendingEdit, reconnectEdge, renameNode, restoreEdge, restoreNode,
  uniqueNodeId, upsertEdge, upsertNode, type Baseline,
} from "./graph/edit";
import GraphCanvas, { renameKeptPosition } from "./components/GraphCanvas";
import DetailPanel, { type Selection } from "./components/DetailPanel";
import Toolbar from "./components/Toolbar";
import ChangesPanel from "./components/ChangesPanel";

const DEFAULT_GRAPH = "graphs/cal-diy-booking.yaml";
const EMPTY_BASELINE: Baseline = { nodes: new Map(), edges: new Map() };
const NEW_NODE_LABEL = "New node";

type Layout = { nodes: RFNode[]; edges: RFEdge[] };
type CommitOpts = {
  /** Successive commits with the same key collapse into one undo step. */
  coalesce?: string;
  /** Absolute canvas positions for nodes being placed. */
  placeAt?: Record<string, Point>;
};

function readBool(key: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

export default function App() {
  return (
    <ReactFlowProvider>
      <AppInner />
    </ReactFlowProvider>
  );
}

function AppInner() {
  const [graph, setGraph] = useState<ComponentGraph | null>(null);
  const [baseline, setBaseline] = useState<Baseline>(EMPTY_BASELINE);
  const [history, setHistory] = useState<{ past: ComponentGraph[]; future: ComponentGraph[] }>({ past: [], future: [] });
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [relayoutNonce, setRelayoutNonce] = useState(0);
  const [loadNonce, setLoadNonce] = useState(0);
  const [selection, setSelectionState] = useState<Selection>(null);
  const [hiddenKinds, setHiddenKinds] = useState<Set<string>>(new Set());
  const [direction, setDirection] = useState<"DOWN" | "RIGHT">("DOWN");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [editable, setEditable] = useState(() => readBool("viewer.editable", true));
  const [changesOpen, setChangesOpen] = useState(false);
  const [freshNodeId, setFreshNodeId] = useState<string | null>(null);
  const graphRef = useRef<ComponentGraph | null>(null);
  graphRef.current = graph;
  const coalesceRef = useRef<string | null>(null);
  const rf = useReactFlow();

  /** Selecting something ends the current coalesced edit session. */
  const setSelection = useCallback((s: Selection) => {
    coalesceRef.current = null;
    setFreshNodeId(null);
    setSelectionState(s);
  }, []);

  // ------------------------------------------------------------ loading

  const loadText = useCallback(
    (text: string, name: string) => {
      try {
        const g = parseGraph(text);
        setGraph(g);
        setBaseline(makeBaseline(g));
        setHistory({ past: [], future: [] });
        setFileName(name);
        setError(null);
        setSelection(null);
        setLoadNonce((n) => n + 1);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [setSelection]
  );

  const loadFile = useCallback(
    (f: File) => {
      f.text().then((t) => loadText(t, f.name));
    },
    [loadText]
  );

  useEffect(() => {
    const url = new URLSearchParams(location.search).get("graph") ?? DEFAULT_GRAPH;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.text();
      })
      .then((t) => loadText(t, url.split("/").pop() ?? url))
      .catch((e) => setError(`Could not load ${url}: ${e.message}`));
  }, [loadText]);

  // Automatic layout: on load, direction change, or explicit re-layout.
  useEffect(() => {
    const g = graphRef.current;
    if (!g) return;
    let cancelled = false;
    layoutGraph(g, direction).then((l) => {
      if (cancelled) return;
      setLayout(l);
      setLayoutVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [loadNonce, direction, relayoutNonce]);

  useEffect(() => {
    try {
      localStorage.setItem("viewer.editable", editable ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [editable]);

  // ------------------------------------------------------------ editing core

  /** Apply an edit: push history (unless coalesced), update graph, merge the layout. */
  const commit = useCallback((next: ComponentGraph, opts: CommitOpts = {}) => {
    const prev = graphRef.current;
    if (!prev || next === prev) return;
    const key = opts.coalesce ?? null;
    if (!(key && coalesceRef.current === key)) {
      setHistory((h) => ({ past: [...h.past.slice(-49), prev], future: [] }));
    }
    coalesceRef.current = key;
    setGraph(next);
    setLayout((l) => (l ? mergeLayout(l, next, opts.placeAt) : l));
  }, []);

  const undo = useCallback(() => {
    coalesceRef.current = null;
    setHistory((h) => {
      const prev = h.past[h.past.length - 1];
      const cur = graphRef.current;
      if (!prev || !cur) return h;
      setGraph(prev);
      setLayout((l) => (l ? mergeLayout(l, prev) : l));
      return { past: h.past.slice(0, -1), future: [cur, ...h.future] };
    });
  }, []);

  const redo = useCallback(() => {
    coalesceRef.current = null;
    setHistory((h) => {
      const next = h.future[0];
      const cur = graphRef.current;
      if (!next || !cur) return h;
      setGraph(next);
      setLayout((l) => (l ? mergeLayout(l, next) : l));
      return { past: [...h.past, cur], future: h.future.slice(1) };
    });
  }, []);

  const pickNode = useCallback(
    (id: string) => {
      setSelection({ type: "node", id });
      setFocusId(null);
      requestAnimationFrame(() => setFocusId(id));
    },
    [setSelection]
  );

  /** Drop a blank node at the centre of the view and start editing it. */
  const addNode = useCallback(() => {
    const g = graphRef.current;
    if (!g) return;
    const pane = document.querySelector(".react-flow") as HTMLElement | null;
    const r = pane?.getBoundingClientRect();
    const centre = r
      ? rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
      : { x: 0, y: 0 };
    const at = { x: centre.x - NODE_W / 2, y: centre.y - NODE_H / 2 };
    const groups = rf.getNodes().filter((n) => n.type === "group") as RFNode[];
    const group = groupAtPoint(groups, centre);
    const id = uniqueNodeId(g, NEW_NODE_LABEL);
    const node: GraphNode = { id, label: NEW_NODE_LABEL, kind: "component", group, files: [], provenance: "manual" };
    commit(upsertNode(g, node, baseline), { placeAt: { [id]: at } });
    setSelection({ type: "node", id });
    setFreshNodeId(id);
  }, [baseline, commit, rf, setSelection]);

  /** Live node edit from the panel (one undo step per editing session). */
  const changeNode = useCallback(
    (node: GraphNode) => {
      const g = graphRef.current;
      if (!g) return;
      commit(upsertNode(g, node, baseline), { coalesce: `node:${node.id}` });
    },
    [baseline, commit]
  );

  /** A new node's id follows its label once the label field is left. */
  const syncNodeId = useCallback(
    (node: GraphNode) => {
      const g = graphRef.current;
      if (!g || baseline.nodes.has(node.id)) return;
      const others = { ...g, nodes: g.nodes.filter((n) => n.id !== node.id) };
      const want = uniqueNodeId(others, node.label || NEW_NODE_LABEL);
      if (want === node.id) return;
      renameKeptPosition(node.id, want);
      setLayout((l) => (l ? renameInLayout(l, node.id, want) : l));
      commit(renameNode(g, node.id, want), { coalesce: `node:${node.id}` });
      coalesceRef.current = `node:${want}`;
      setSelectionState({ type: "node", id: want });
      setFreshNodeId((f) => (f === node.id ? want : f));
    },
    [baseline, commit]
  );

  const changeEdge = useCallback(
    (edge: GraphEdge, prevId: string) => {
      const g = graphRef.current;
      if (!g) return;
      commit(upsertEdge(g, edge, baseline, prevId), { coalesce: `edge:${prevId}` });
      const id = edgeId(edge);
      if (id !== prevId) {
        coalesceRef.current = `edge:${id}`;
        setSelectionState({ type: "edge", id });
      }
    },
    [baseline, commit]
  );

  const remove = useCallback(
    (s: Selection) => {
      const g = graphRef.current;
      if (!g || !s) return;
      const next = s.type === "node" ? deleteNode(g, s.id, baseline) : deleteEdge(g, s.id, baseline);
      commit(next);
      const stillThere =
        s.type === "node" ? next.nodes.some((n) => n.id === s.id) : next.edges.some((e) => edgeId(e) === s.id);
      if (!stillThere) setSelection(null);
    },
    [baseline, commit, setSelection]
  );

  const restore = useCallback(
    (s: Selection) => {
      const g = graphRef.current;
      if (!g || !s) return;
      commit(s.type === "node" ? restoreNode(g, s.id, baseline) : restoreEdge(g, s.id, baseline));
    },
    [baseline, commit]
  );

  /** Dragging a handle onto another node creates the edge straight away. */
  const onConnect = useCallback(
    (from: string, to: string) => {
      const g = graphRef.current;
      if (!g) return;
      const existing = g.edges.find((e) => e.from === from && e.to === to && e.status !== "delete");
      if (existing) {
        setSelection({ type: "edge", id: edgeId(existing) });
        return;
      }
      const edge: GraphEdge = { from, to, kind: "calls", provenance: "manual" };
      commit(upsertEdge(g, edge, baseline));
      setSelection({ type: "edge", id: edgeId(edge) });
    },
    [baseline, commit, setSelection]
  );

  const onReconnect = useCallback(
    (id: string, from: string, to: string) => {
      const g = graphRef.current;
      if (!g) return;
      const next = reconnectEdge(g, id, from, to, baseline);
      commit(next);
      const moved = next.edges.find((e) => e.from === from && e.to === to && e.status !== "delete");
      setSelection(moved ? { type: "edge", id: edgeId(moved) } : null);
    },
    [baseline, commit, setSelection]
  );

  /** A node was dropped into another group box (or outside every box). */
  const onMoveToGroup = useCallback(
    (id: string, group: string | undefined, at: Point) => {
      const g = graphRef.current;
      const node = g?.nodes.find((n) => n.id === id);
      if (!g || !node) return;
      const next = { ...node, group };
      if (!group) delete next.group;
      commit(upsertNode(g, next, baseline), { placeAt: { [id]: at } });
    },
    [baseline, commit]
  );

  /** Keep dragged positions in the layout so they survive renames and merges. */
  const onNodePositioned = useCallback((id: string, position: Point) => {
    setLayout((l) => (l ? { ...l, nodes: l.nodes.map((n) => (n.id === id ? { ...n, position } : n)) } : l));
  }, []);

  const discardAll = useCallback(() => {
    const g = graphRef.current;
    if (!g) return;
    commit({ ...g, nodes: [...baseline.nodes.values()], edges: [...baseline.edges.values()] });
    setSelection(null);
  }, [baseline, commit, setSelection]);

  const acceptAllEdits = useCallback(() => {
    const g = graphRef.current;
    if (!g) return;
    const next = acceptAll(g);
    commit(next);
    setBaseline(makeBaseline(next));
    setSelection(null);
  }, [commit, setSelection]);

  // ------------------------------------------------------------ keyboard

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if (e.key === "Escape") {
        if (typing) (target as HTMLElement).blur();
        else if (changesOpen) setChangesOpen(false);
        else setSelection(null);
        return;
      }
      if (typing) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (editable && (e.key === "Delete" || e.key === "Backspace") && selection) {
        e.preventDefault();
        remove(selection);
      } else if (editable && e.key.toLowerCase() === "n" && !mod) {
        e.preventDefault();
        addNode();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changesOpen, editable, selection, undo, redo, remove, addNode, setSelection]);

  // ------------------------------------------------------------ misc

  const toggleKind = (k: NodeKind) =>
    setHiddenKinds((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const changeCount = graph ? pendingEdit(graph).count : 0;
  const committedNodeIds = new Set(baseline.nodes.keys());
  const committedEdgeIds = new Set(baseline.edges.keys());

  return (
    <div
      className={`app ${dragging ? "is-dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) loadFile(f);
      }}
    >
      <Toolbar
        graph={graph}
        fileName={fileName}
        onOpenFile={loadFile}
        onPickNode={pickNode}
        hiddenKinds={hiddenKinds}
        onToggleKind={toggleKind}
        direction={direction}
        onDirection={setDirection}
        editable={editable}
        onToggleEditable={() => setEditable((v) => !v)}
        onAddNode={addNode}
        onRelayout={() => setRelayoutNonce((n) => n + 1)}
        onUndo={undo}
        onRedo={redo}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        changeCount={changeCount}
        onShowChanges={() => setChangesOpen((v) => !v)}
      />
      <main className="main">
        <div className="canvas">
          {graph && layout ? (
            <GraphCanvas
              graph={graph}
              layout={layout}
              layoutVersion={layoutVersion}
              selection={selection}
              onSelect={setSelection}
              hiddenKinds={hiddenKinds}
              focusId={focusId}
              editable={editable}
              onConnect={onConnect}
              onReconnect={onReconnect}
              onMoveToGroup={onMoveToGroup}
              onNodePositioned={onNodePositioned}
            />
          ) : (
            <div className="empty">{error ? null : "Loading graph…"}</div>
          )}
          {error && <pre className="error">{error}</pre>}
          {dragging && <div className="drop-hint">Drop a graph file (.yaml / .json)</div>}
          {graph && changesOpen && (
            <ChangesPanel
              graph={graph}
              baseline={baseline}
              fileName={fileName}
              onSelect={(s) => {
                setSelection(s);
                if (s?.type === "node") pickNode(s.id);
              }}
              onDiscard={discardAll}
              onAccept={acceptAllEdits}
              onClose={() => setChangesOpen(false)}
            />
          )}
        </div>
        {graph && (
          <DetailPanel
            graph={graph}
            selection={selection}
            onSelect={(s) => {
              setSelection(s);
              if (s?.type === "node") pickNode(s.id);
            }}
            onClose={() => setSelection(null)}
            editable={editable}
            onDelete={remove}
            onRestore={restore}
            onChangeNode={changeNode}
            onNodeLabelBlur={syncNodeId}
            onChangeEdge={changeEdge}
            committedNodeIds={committedNodeIds}
            committedEdgeIds={committedEdgeIds}
            freshNodeId={freshNodeId}
          />
        )}
      </main>
    </div>
  );
}
