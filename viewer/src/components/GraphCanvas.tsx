import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type OnNodeDrag,
} from "@xyflow/react";
import type { ComponentGraph } from "../graph/types";
import { groupAtPoint, NODE_H, NODE_W, type Point, type RFEdge, type RFNode } from "../graph/layout";
import { edgeColor } from "../graph/kinds";
import ComponentNode from "./ComponentNode";
import GroupNode from "./GroupNode";
import ColumnHeaderNode from "./ColumnHeaderNode";
import ComponentEdge from "./ComponentEdge";
import type { Selection } from "./DetailPanel";

const nodeTypes = { component: ComponentNode, group: GroupNode, columnHeader: ColumnHeaderNode };
const edgeTypes = { component: ComponentEdge };

interface Props {
  graph: ComponentGraph;
  layout: { nodes: RFNode[]; edges: RFEdge[] };
  layoutVersion: number;
  selection: Selection;
  onSelect: (s: Selection) => void;
  hiddenKinds: Set<string>;
  focusId: string | null;
  editable: boolean;
  /** Columns layout mode: flat layout, no group boxes to drop nodes into. */
  columns: boolean;
  onConnect: (from: string, to: string) => void;
  onReconnect: (edgeId: string, from: string, to: string) => void;
  /** A node was dropped inside a different group box (or outside every box). */
  onMoveToGroup: (nodeId: string, groupId: string | undefined, at: Point) => void;
  /** A node or group was dragged; position is relative to its parent. */
  onNodePositioned: (id: string, position: Point) => void;
}

export default function GraphCanvas(props: Props) {
  const { graph, layout, layoutVersion, selection, onSelect, hiddenKinds, focusId, editable, columns, onConnect, onReconnect, onMoveToGroup, onNodePositioned } = props;
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>([]);
  const rf = useReactFlow();

  // Neighbourhood of the current selection, used to dim everything else.
  const focus = useMemo(() => {
    if (!selection) return null;
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();
    if (selection.type === "node") {
      nodeIds.add(selection.id);
      for (const e of layout.edges) {
        if (e.source === selection.id || e.target === selection.id) {
          edgeIds.add(e.id);
          nodeIds.add(e.source);
          nodeIds.add(e.target);
        }
      }
    } else {
      const e = layout.edges.find((x) => x.id === selection.id);
      if (e) {
        edgeIds.add(e.id);
        nodeIds.add(e.source);
        nodeIds.add(e.target);
      }
    }
    return { nodeIds, edgeIds };
  }, [selection, layout.edges]);

  // Apply layout + decorations. Positions of nodes the user dragged are kept
  // unless a fresh ELK layout arrived (layoutVersion changed).
  useEffect(() => {
    const hiddenNodes = new Set(graph.nodes.filter((n) => hiddenKinds.has(n.kind)).map((n) => n.id));
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return layout.nodes.map((n) => {
        const old = prevById.get(n.id);
        const keepPos = old && old.type === n.type && old.parentId === n.parentId && n.id in keptPositions;
        const position = keepPos ? old!.position : n.position;
        const style = old && n.type === "group" && keepPos ? old.style : n.style;
        if (n.type === "group") {
          return { ...n, position, style, data: { ...n.data, dimmed: !!focus } } as RFNode;
        }
        if (n.type === "columnHeader") {
          // a column whose kinds are all filtered out has no header either
          return { ...n, hidden: n.data.kinds.every((k) => hiddenKinds.has(k)) } as RFNode;
        }
        return {
          ...n,
          position,
          // In view mode a node dragged past its group's edge grows the group;
          // in edit mode it can leave the group (see onNodeDragStop).
          expandParent: !editable && !!n.parentId,
          hidden: hiddenNodes.has(n.id),
          selected: selection?.type === "node" && selection.id === n.id,
          data: { ...n.data, dimmed: !!focus && !focus.nodeIds.has(n.id), editable },
        } as RFNode;
      });
    });
    setEdges(
      layout.edges.map((e) => ({
        ...e,
        hidden: hiddenNodes.has(e.source) || hiddenNodes.has(e.target),
        selected: selection?.type === "edge" && selection.id === e.id,
        reconnectable: editable,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: edgeColor(e.data!.edge) },
        data: {
          ...e.data!,
          dimmed: !!focus && !focus.edgeIds.has(e.id),
          highlighted: !!focus && focus.edgeIds.has(e.id),
        },
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, selection, focus, hiddenKinds, graph.nodes, editable, setNodes, setEdges]);

  // Re-fit only when a fresh automatic layout arrives.
  useEffect(() => {
    keptPositions = {};
    const t = setTimeout(() => rf.fitView({ padding: 0.1, duration: 300 }), 50);
    return () => clearTimeout(t);
  }, [layoutVersion, rf]);

  // Center on a node chosen from search or just created.
  useEffect(() => {
    if (!focusId) return;
    const t = setTimeout(() => {
      const n = rf.getInternalNode(focusId);
      if (!n) return;
      const { x, y } = n.internals.positionAbsolute;
      rf.setCenter(x + (n.measured.width ?? 220) / 2, y + (n.measured.height ?? 72) / 2, {
        zoom: Math.max(rf.getZoom(), 1),
        duration: 400,
      });
    }, 60);
    return () => clearTimeout(t);
  }, [focusId, rf]);

  const onNodeClick: NodeMouseHandler<RFNode> = useCallback(
    (_, n) => {
      if (n.type === "component") onSelect({ type: "node", id: n.id });
    },
    [onSelect]
  );
  const onEdgeClick: EdgeMouseHandler<RFEdge> = useCallback(
    (_, e) => onSelect({ type: "edge", id: e.id }),
    [onSelect]
  );
  const handleConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target && c.source !== c.target) onConnect(c.source, c.target);
    },
    [onConnect]
  );
  const onNodeDragStop: OnNodeDrag<RFNode> = useCallback(
    (_, n) => {
      const internal = rf.getInternalNode(n.id);
      if (!internal) return;
      if (!editable || columns || n.type !== "component") {
        onNodePositioned(n.id, n.position);
        return;
      }
      const abs = internal.internals.positionAbsolute;
      const w = internal.measured.width ?? NODE_W;
      const h = internal.measured.height ?? NODE_H;
      const center = { x: abs.x + w / 2, y: abs.y + h / 2 };
      const groups = rf.getNodes().filter((x) => x.type === "group") as RFNode[];
      const target = groupAtPoint(groups, center);
      const current = graph.nodes.find((x) => x.id === n.id)?.group;
      if ((target ?? undefined) !== (current ?? undefined)) onMoveToGroup(n.id, target, abs);
      else onNodePositioned(n.id, n.position);
    },
    [editable, columns, graph.nodes, onMoveToGroup, onNodePositioned, rf]
  );
  const handleReconnect = useCallback(
    (old: RFEdge, c: Connection) => {
      if (c.source && c.target) onReconnect(old.id, c.source, c.target);
    },
    [onReconnect]
  );

  return (
    <ReactFlow
      className={editable ? "rf-editable" : ""}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={(changes) => {
        for (const c of changes) if (c.type === "position") keptPositions[c.id] = true;
        onNodesChange(changes);
      }}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      onEdgeClick={onEdgeClick}
      onPaneClick={() => onSelect(null)}
      onConnect={handleConnect}
      onReconnect={handleReconnect}
      onNodeDragStop={onNodeDragStop}
      connectionMode={ConnectionMode.Loose}
      connectionRadius={36}
      nodesConnectable={editable}
      edgesReconnectable={editable}
      deleteKeyCode={null}
      minZoom={0.05}
      maxZoom={3}
      fitView
      zIndexMode="manual"
      proOptions={{ hideAttribution: true }}
      defaultEdgeOptions={{ type: "component" }}
    >
      <Background gap={24} size={1} />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => (n.type !== "component" ? "transparent" : `var(--k-${(n.data as { node?: { kind: string } }).node?.kind ?? "other"})`)}
        nodeStrokeWidth={0}
      />
    </ReactFlow>
  );
}

/** ids whose position the user changed since the last automatic layout */
let keptPositions: Record<string, true> = {};

/** Keep a dragged position across a node id rename. */
export function renameKeptPosition(oldId: string, newId: string) {
  if (keptPositions[oldId]) {
    delete keptPositions[oldId];
    keptPositions[newId] = true;
  }
}
