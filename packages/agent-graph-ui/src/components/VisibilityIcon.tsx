import { useRenderCounter } from "@agent-infrastructure/render-diagnostics";

type VisibilityIconProps = {
  visible: boolean;
  className?: string;
};

export function VisibilityIcon({ visible, className = "h-3.5 w-3.5" }: VisibilityIconProps) {
  useRenderCounter("VisibilityIcon")
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      {visible ? null : <path d="M4 20 20 4" />}
    </svg>
  );
}
