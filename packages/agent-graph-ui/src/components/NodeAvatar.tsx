import { nodeAvatarColors } from "./graphColors";

function initialsForLabel(label: string): string {
  const words = label
    .split(/[^A-Za-z0-9]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

type NodeAvatarProps = {
  nodeKey: string;
  label: string;
  size?: "sm" | "md";
};

export function NodeAvatar({
  nodeKey,
  label,
  size = "md",
}: NodeAvatarProps) {
  const colors = nodeAvatarColors(nodeKey);
  const sizing =
    size === "sm"
      ? "h-4 w-4 text-[8px]"
      : "h-5 w-5 text-[9px]";

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full border font-semibold uppercase tracking-[0.08em] ${sizing}`}
      style={{
        backgroundColor: colors.background,
        borderColor: colors.border,
        color: colors.text,
        boxShadow: colors.shadow,
      }}
    >
      {initialsForLabel(label)}
    </span>
  );
}
