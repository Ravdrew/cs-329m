import { Handle, Position, type NodeProps, useConnection, useStore } from "@xyflow/react";
import type { Node } from "@xyflow/react";
import type { ComponentNodeData } from "../graph/layout";
import { KIND_META } from "../graph/kinds";

type Props = NodeProps<Node<ComponentNodeData, "component">>;

export default function ComponentNode({ id, data, selected }: Props) {
  const { node } = data;
  const meta = KIND_META[node.kind] ?? KIND_META.other;
  const zoom = useStore((s) => s.transform[2]);
  const detailed = zoom > 0.75;
  const status = node.status ?? "existing";
  // While the user drags a connection, the whole card becomes the drop target
  // (the small handles are only 12px and easy to miss).
  const connection = useConnection();
  const dropTarget = !!data.editable && connection.inProgress && connection.fromNode?.id !== id && status !== "delete";
  const cls = [
    "cnode",
    `kind-${node.kind}`,
    `status-${status}`,
    selected ? "is-selected" : "",
    data.dimmed ? "is-dimmed" : "",
    data.editable ? "is-editable" : "",
    dropTarget ? "is-drop-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls} title={node.summary ?? node.label}>
      {/* The first target/source handles are where edges attach visually. */}
      <Handle type="target" position={Position.Top} id="in" className="handle handle-in" isConnectable={!!data.editable} />
      <Handle type="source" position={Position.Bottom} id="out" className="handle handle-out" isConnectable={!!data.editable} />
      {dropTarget && (
        <Handle
          type="target"
          position={Position.Top}
          id="body"
          className="handle handle-body"
          isConnectableStart={false}
          isConnectableEnd
        />
      )}
      <div className="cnode-head">
        <span className="cnode-icon" aria-hidden>
          {meta.icon}
        </span>
        <span className="cnode-kind">{meta.label}</span>
        {status !== "existing" && <span className={`cnode-badge badge-${status}`}>{status}</span>}
        <span className="cnode-files" title={`${node.files.length} files`}>
          {node.files.length}
        </span>
      </div>
      <div className="cnode-label">{node.label}</div>
      {detailed && node.summary && <div className="cnode-summary">{node.summary}</div>}
    </div>
  );
}
