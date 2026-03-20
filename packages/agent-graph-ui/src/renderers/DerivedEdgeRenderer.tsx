import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "reactflow";
import { edgeColors } from "../components/graphColors";

export function DerivedEdgeRenderer(props: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath(props);
  const colors = edgeColors(`derived:${props.label ?? props.id}`);

  return (
    <>
      <BaseEdge
        {...props}
        path={path}
        style={{ stroke: colors.stroke, strokeDasharray: "7 6" }}
      />
      {props.label ? (
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
