function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableHue(seed: string): number {
  const hash = hashString(seed);
  return Number((((hash * 0.61803398875) % 1) * 360).toFixed(1));
}

function stablePercent(seed: string, salt: string, min: number, span: number): number {
  const hash = hashString(`${seed}:${salt}`);
  return min + (hash % span);
}

function hsla(hue: number, saturation: number, lightness: number, alpha: number): string {
  return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
}

function hsl(hue: number, saturation: number, lightness: number): string {
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export function stableGraphColor(seed: string) {
  const hue = stableHue(seed);
  const saturation = stablePercent(seed, "s", 62, 17);
  const lightness = stablePercent(seed, "l", 56, 11);
  const borderLightness = Math.max(44, lightness - 8);
  const textLightness = Math.min(86, lightness + 22);
  const deepLightness = Math.max(16, lightness - 40);

  return {
    hue,
    saturation,
    lightness,
    borderLightness,
    textLightness,
    deepLightness,
  };
}

export function nodeTypeColors(kind: string) {
  const color = stableGraphColor(kind);

  return {
    borderColor: hsla(color.hue, color.saturation, color.borderLightness, 0.72),
    dotColor: hsl(color.hue, color.saturation, color.lightness),
    bandColor: hsla(color.hue, color.saturation, color.lightness, 0.22),
    bandGlow: hsla(color.hue, color.saturation, color.lightness, 0.14),
    chipBackground: hsla(color.hue, Math.max(34, color.saturation - 18), color.deepLightness, 0.86),
    chipBorder: hsla(color.hue, color.saturation, color.borderLightness, 0.46),
    chipText: hsl(color.hue, Math.max(42, color.saturation - 10), color.textLightness),
  };
}

export function nodeAvatarColors(key: string) {
  const color = stableGraphColor(key);

  return {
    background: hsl(color.hue, color.saturation, Math.max(36, color.lightness - 16)),
    border: hsl(color.hue, color.saturation, Math.min(76, color.lightness + 4)),
    text: "rgba(250, 250, 249, 0.96)",
    shadow: `0 8px 22px ${hsla(color.hue, color.saturation, Math.max(18, color.lightness - 28), 0.38)}`,
  };
}

export function edgeColors(key: string) {
  const color = stableGraphColor(key);

  return {
    stroke: hsl(color.hue, color.saturation, Math.min(76, color.lightness + 2)),
    labelBorder: hsla(color.hue, color.saturation, Math.min(76, color.lightness + 2), 0.42),
    labelBackground: hsla(color.hue, Math.max(36, color.saturation - 16), Math.max(14, color.lightness - 42), 0.92),
    labelText: hsl(color.hue, Math.min(88, color.saturation + 8), Math.min(90, color.lightness + 22)),
  };
}
