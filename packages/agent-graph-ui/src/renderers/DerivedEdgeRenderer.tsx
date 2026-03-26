import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "reactflow";
import { useRenderCounter } from "@agent-infrastructure/render-diagnostics";
import { edgeColors } from "../components/graphColors";

export const DerivedEdgeRenderer = memo(function DerivedEdgeRenderer(props: EdgeProps) {
  useRenderCounter("DerivedEdgeRenderer");
  const [path, labelX, labelY] = getBezierPath(props);
  const colors = edgeColors(`derived:${props.label ?? props.id}`);
  const isSelected = props.selected === true;
  const isHidePreview =
    ((props.data as { hidePreview?: boolean } | undefined)?.hidePreview ?? false) === true;

  return (
    <>
      <BaseEdge
        {...props}
        path={path}
        style={{
          ...props.style,
          stroke: colors.stroke,
          strokeDasharray: "7 6",
          opacity: isHidePreview ? 0.25 : undefined,
          strokeWidth: isSelected ? 3 : 1.5,
        }}
      />
      {props.label ? (
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
