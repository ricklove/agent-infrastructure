import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "reactflow";
import type { GraphEdge } from "@agent-infrastructure/agent-graph-core";

export function DirectEdgeRenderer(props: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath(props);
  const edge = props.data as GraphEdge | undefined;
  const isHiddenContext = edge?.kind === "hidden-context";

  return (
    <>
      <BaseEdge
        {...props}
        path={path}
        style={
          isHiddenContext
            ? { stroke: "#f59e0b", strokeDasharray: "6 5", opacity: 0.72 }
            : { stroke: "#60a5fa" }
        }
      />
      {props.label && !isHiddenContext ? (
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
