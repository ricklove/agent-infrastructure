import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "reactflow";

export function DerivedEdgeRenderer(props: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath(props);

  return (
    <>
      <BaseEdge {...props} path={path} style={{ stroke: "#f59e0b", strokeDasharray: "7 6" }} />
      {props.label ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            className="rounded-full border border-amber-500/40 bg-stone-950/90 px-2 py-1 text-[10px] font-medium text-amber-200"
          >
            {props.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
