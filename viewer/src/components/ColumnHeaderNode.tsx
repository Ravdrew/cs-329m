import type { NodeProps, Node } from "@xyflow/react";
import type { ColumnHeaderData } from "../graph/layout";

type Props = NodeProps<Node<ColumnHeaderData, "columnHeader">>;

/** Label above a column in columns layout mode; not selectable or draggable. */
export default function ColumnHeaderNode({ data }: Props) {
  return (
    <div className={`colhead kind-${data.kinds[0]}`}>
      <span className="colhead-label">{data.label}</span>
    </div>
  );
}
