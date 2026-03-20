import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "reactflow";
import type { GraphEdge } from "@agent-infrastructure/agent-graph-core";
import { edgeColors } from "../components/graphColors";

export function DirectEdgeRenderer(props: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath(props);
  const edge = props.data as GraphEdge | undefined;
  const isHiddenContext = edge?.kind === "hidden-context";
  const colorKey = isHiddenContext
    ? `hidden:${edge?.supportingPathIds.join("|") ?? props.id}`
    : `${edge?.kind ?? "direct"}:${props.label ?? edge?.label ?? props.id}`;
  const colors = edgeColors(colorKey);

  return (
    <>
      <BaseEdge
        {...props}
        path={path}
        style={
          isHiddenContext
            ? { stroke: colors.stroke, strokeDasharray: "6 5", opacity: 0.8 }
            : { stroke: colors.stroke }
        }
      />
      {props.label && !isHiddenContext ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              border: `1px solid ${colors.labelBorder}`,
              background: colors.labelBackground,
              color: colors.labelText,
            }}
            className="rounded-full px-2 py-1 text-[10px] font-medium"
          >
            {props.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
