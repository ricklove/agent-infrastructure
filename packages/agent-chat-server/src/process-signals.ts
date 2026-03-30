export function findStandaloneSignalLine(
  text: string,
  allowedSignals: Iterable<string>,
): { signalText: string | null; visibleText: string } {
  const trimmed = text.trimEnd();
  if (!trimmed) {
    return { signalText: null, visibleText: text.trim() };
  }

  const allowed = new Set<string>();
  for (const signal of allowedSignals) {
    const normalized = signal.trim();
    if (normalized) {
      allowed.add(normalized);
    }
  }
  if (allowed.size === 0) {
    return { signalText: null, visibleText: trimmed.trim() };
  }

  const lines = trimmed.split(/\r?\n/);
  let signalLineIndex = -1;
  let signalText: string | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const candidate = lines[index]?.trim() ?? "";
    if (!candidate || !allowed.has(candidate)) {
      continue;
    }
    signalLineIndex = index;
    signalText = candidate;
  }

  if (signalLineIndex < 0 || !signalText) {
    return { signalText: null, visibleText: trimmed.trim() };
  }

  lines.splice(signalLineIndex, 1);
  return {
    signalText,
    visibleText: lines.join("\n").trim(),
  };
}
