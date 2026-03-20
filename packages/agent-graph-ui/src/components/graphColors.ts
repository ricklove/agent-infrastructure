function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function nodeAvatarColors(key: string) {
  const hash = hashString(key);
  const hue = hash % 360;
  return {
    background: `hsl(${hue} 72% 42%)`,
    border: `hsl(${hue} 72% 60%)`,
    text: "rgba(250, 250, 249, 0.96)",
    shadow: `0 8px 22px hsla(${hue} 72% 20% / 0.38)`,
  };
}

export function edgeColors(key: string) {
  const hash = hashString(key);
  const hue = hash % 360;
  return {
    stroke: `hsl(${hue} 72% 60%)`,
    labelBorder: `hsla(${hue} 72% 60% / 0.42)`,
    labelBackground: `hsla(${hue} 72% 18% / 0.92)`,
    labelText: `hsl(${hue} 82% 84%)`,
  };
}
