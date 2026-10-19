import type { NodeProps, Node } from "@xyflow/react";
import type { GroupNodeData } from "../graph/layout";

type Props = NodeProps<Node<GroupNodeData, "group">>;

export default function GroupNode({ data }: Props) {
  return (
    <div className={`gnode ${data.dimmed ? "is-dimmed" : ""}`}>
      <div className="gnode-label" title={data.group.summary}>
        {data.group.label}
      </div>
    </div>
  );
}
