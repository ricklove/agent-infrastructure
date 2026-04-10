export type CanonicalDashboardReleaseParts = {
  dateKey: string
  increment: string
  hash: string
}

const canonicalReleaseTagPattern =
  /^release-(\d{4}\.\d{2}\.\d{2})\.(\d{4,})\.([0-9a-f]{7,40})$/i

function normalizeHash(hash: string): string {
  return hash.trim().toLowerCase()
}

function normalizeIncrement(increment: string | number): string {
  const numericValue =
    typeof increment === "number" ? increment : Number.parseInt(increment, 10)
  if (!Number.isInteger(numericValue) || numericValue < 0) {
    throw new Error("release increment must be a non-negative integer")
  }
  return String(numericValue).padStart(4, "0")
}

export function parseCanonicalDashboardReleaseTag(
  tag: string,
): CanonicalDashboardReleaseParts | null {
  const match = canonicalReleaseTagPattern.exec(tag.trim())
  if (!match) {
    return null
  }

  return {
    dateKey: match[1],
    increment: normalizeIncrement(match[2]),
    hash: normalizeHash(match[3]),
  }
}

export function buildCanonicalDashboardReleaseTag(
  parts: CanonicalDashboardReleaseParts,
): string {
  return `release-${parts.dateKey}.${normalizeIncrement(parts.increment)}.${normalizeHash(parts.hash)}`
}

export function buildCanonicalDashboardVersion(
  parts: CanonicalDashboardReleaseParts,
): string {
  return `dashboard-${parts.dateKey}.${normalizeIncrement(parts.increment)}.${normalizeHash(parts.hash)}`
}

export function canonicalDashboardVersionFromTag(tag: string): string | null {
  const parsed = parseCanonicalDashboardReleaseTag(tag)
  return parsed ? buildCanonicalDashboardVersion(parsed) : null
}

export function fallbackDashboardVersion(hash: string): string {
  return `dashboard-dev.${normalizeHash(hash)}`
}

export function formatUtcDashboardReleaseDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}.${month}.${day}`
}

export function nextCanonicalDashboardReleaseTag(input: {
  dateKey: string
  hash: string
  visibleReleaseTags: readonly string[]
}): string {
  let highestIncrement = 999

  for (const tag of input.visibleReleaseTags) {
    const parsed = parseCanonicalDashboardReleaseTag(tag)
    if (!parsed || parsed.dateKey !== input.dateKey) {
      continue
    }
    highestIncrement = Math.max(highestIncrement, Number(parsed.increment))
  }

  return buildCanonicalDashboardReleaseTag({
    dateKey: input.dateKey,
    increment: String(highestIncrement + 1),
    hash: input.hash,
  })
}
