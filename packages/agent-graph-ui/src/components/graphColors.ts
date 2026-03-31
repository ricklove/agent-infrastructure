function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function stableHue(seed: string): number {
  const hash = hashString(seed)
  return Number((((hash * 0.61803398875) % 1) * 360).toFixed(1))
}

function stablePercent(
  seed: string,
  salt: string,
  min: number,
  span: number,
): number {
  const hash = hashString(`${seed}:${salt}`)
  return min + (hash % span)
}

function hsla(
  hue: number,
  saturation: number,
  lightness: number,
  alpha: number,
): string {
  return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`
}

function hsl(hue: number, saturation: number, lightness: number): string {
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

type GraphColorDomain = "node-type" | "node-avatar" | "edge"

const NODE_TYPE_HUES = [
  4, 18, 32, 46, 60, 74, 88, 104, 122, 140, 158, 176, 194, 210, 226, 242, 258,
  274, 290, 306, 322, 338, 352,
]

function domainHue(seed: string, domain: GraphColorDomain): number {
  if (domain === "node-type") {
    const hash = hashString(`${seed}:${domain}:hue`)
    const slot = hash % NODE_TYPE_HUES.length
    const offset = ((hash >>> 8) % 9) - 4
    return Number((NODE_TYPE_HUES[slot] + offset).toFixed(1))
  }

  const base = stableHue(seed)

  if (domain === "node-avatar") {
    return Number(((base * 0.88 + 142) % 360).toFixed(1))
  }

  return Number(((base * 0.76 + 248) % 360).toFixed(1))
}

export function stableGraphColor(seed: string, domain: GraphColorDomain) {
  const hue = domainHue(seed, domain)
  const saturation =
    domain === "node-type"
      ? stablePercent(seed, `${domain}:s`, 66, 13)
      : domain === "node-avatar"
        ? stablePercent(seed, `${domain}:s`, 58, 15)
        : stablePercent(seed, `${domain}:s`, 72, 11)
  const lightness =
    domain === "node-type"
      ? stablePercent(seed, `${domain}:l`, 56, 10)
      : domain === "node-avatar"
        ? stablePercent(seed, `${domain}:l`, 38, 10)
        : stablePercent(seed, `${domain}:l`, 60, 8)
  const borderLightness =
    domain === "node-avatar"
      ? Math.min(76, lightness + 14)
      : Math.max(44, lightness - 8)
  const textLightness =
    domain === "edge"
      ? Math.min(92, lightness + 20)
      : Math.min(86, lightness + 22)
  const deepLightness =
    domain === "node-avatar"
      ? Math.max(14, lightness - 26)
      : Math.max(16, lightness - 40)

  return {
    hue,
    saturation,
    lightness,
    borderLightness,
    textLightness,
    deepLightness,
  }
}

export function nodeTypeColors(kind: string) {
  const color = stableGraphColor(kind, "node-type")

  return {
    borderColor: hsla(color.hue, color.saturation, color.borderLightness, 0.72),
    dotColor: hsl(color.hue, color.saturation, color.lightness),
    bandColor: hsla(color.hue, color.saturation, color.lightness, 0.22),
    bandGlow: hsla(color.hue, color.saturation, color.lightness, 0.14),
    chipBackground: hsla(
      color.hue,
      Math.max(34, color.saturation - 18),
      color.deepLightness,
      0.86,
    ),
    chipBorder: hsla(color.hue, color.saturation, color.borderLightness, 0.46),
    chipText: hsl(
      color.hue,
      Math.max(42, color.saturation - 10),
      color.textLightness,
    ),
  }
}

export function nodeAvatarColors(key: string) {
  const color = stableGraphColor(key, "node-avatar")

  return {
    background: hsl(
      color.hue,
      color.saturation,
      Math.max(36, color.lightness - 16),
    ),
    border: hsl(color.hue, color.saturation, Math.min(76, color.lightness + 4)),
    text: "rgba(250, 250, 249, 0.96)",
    shadow: `0 8px 22px ${hsla(color.hue, color.saturation, Math.max(18, color.lightness - 28), 0.38)}`,
  }
}

export function edgeColors(key: string) {
  const color = stableGraphColor(key, "edge")

  return {
    stroke: hsl(color.hue, color.saturation, Math.min(76, color.lightness + 2)),
    labelBorder: hsla(
      color.hue,
      color.saturation,
      Math.min(76, color.lightness + 2),
      0.42,
    ),
    labelBackground: hsla(
      color.hue,
      Math.max(36, color.saturation - 16),
      Math.max(14, color.lightness - 42),
      0.92,
    ),
    labelText: hsl(
      color.hue,
      Math.min(88, color.saturation + 8),
      Math.min(90, color.lightness + 22),
    ),
  }
}
