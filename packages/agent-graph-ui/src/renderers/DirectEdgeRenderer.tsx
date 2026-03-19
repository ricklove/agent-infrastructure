import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "reactflow";

export function DirectEdgeRenderer(props: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath(props);

  return (
    <>
      <BaseEdge {...props} path={path} style={{ stroke: "#60a5fa" }} />
      {props.label ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            className="rounded-full border border-sky-500/40 bg-stone-950/90 px-2 py-1 text-[10px] font-medium text-sky-200"
          >
            {props.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
