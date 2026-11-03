import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  useStore,
} from "@xyflow/react";
import type { RFEdge } from "../graph/layout";

export default function ComponentEdge(props: EdgeProps<RFEdge>) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
    markerEnd,
  } = props;
  const zoom = useStore((s) => s.transform[2]);
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const edge = data?.edge;
  const status = edge?.status ?? "existing";
  const cls = [
    "cedge",
    `edge-kind-${edge?.kind}`,
    `edge-status-${status}`,
    selected || data?.highlighted ? "is-highlighted" : "",
    data?.dimmed ? "is-dimmed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const showLabel = zoom > 0.6 && (selected || data?.highlighted || status !== "existing");
  return (
    <>
      <BaseEdge id={id} path={path} className={cls} markerEnd={markerEnd} interactionWidth={14} />
      {showLabel && edge && (
        <EdgeLabelRenderer>
          <div
            className={`cedge-label edge-status-${status}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
          >
            {edge.label ?? edge.kind}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
