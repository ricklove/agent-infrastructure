export function parseNumericStoryboardHeader(value: string | null) {
  if (!value) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function shouldRefreshRunMirrorAsset(
  sourceMtimeMs: number | null,
  mirrorMtimeMs: number,
  toleranceMs = 1,
) {
  return sourceMtimeMs !== null && sourceMtimeMs > mirrorMtimeMs + toleranceMs
}
