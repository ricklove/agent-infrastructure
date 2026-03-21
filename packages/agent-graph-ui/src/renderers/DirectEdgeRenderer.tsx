import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "reactflow";
import type { GraphEdge } from "@agent-infrastructure/agent-graph-core";
import { edgeColors } from "../components/graphColors";

export const DirectEdgeRenderer = memo(function DirectEdgeRenderer(props: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath(props);
  const edge = props.data as (GraphEdge & { hidePreview?: boolean }) | undefined;
  const isHiddenContext = edge?.kind === "hidden-context";
  const isSelected = props.selected === true;
  const isHidePreview = edge?.hidePreview === true;
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
                ? {
                    ...props.style,
                    stroke: colors.stroke,
                    strokeDasharray: "6 5",
                    opacity: isHidePreview ? 0.25 : 0.8,
                    strokeWidth: isSelected ? 3 : 1.5,
                  }
                : {
                    ...props.style,
                    stroke: colors.stroke,
                    opacity: isHidePreview ? 0.25 : undefined,
                    strokeWidth: isSelected ? 3 : 1.5,
                  }
        }
      />
      {props.label && !isHiddenContext ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              border: `1px solid ${isSelected ? "rgba(125,211,252,0.75)" : colors.labelBorder}`,
              background: isSelected ? "rgba(12, 74, 110, 0.94)" : colors.labelBackground,
              color: colors.labelText,
              opacity: isHidePreview ? 0.25 : undefined,
              boxShadow: isSelected ? "0 0 0 1px rgba(125,211,252,0.35), 0 8px 24px rgba(0,0,0,0.35)" : undefined,
            }}
            className="rounded-full px-2 py-1 text-[10px] font-medium"
          >
            {props.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});
