export type StoryboardTransitionRecord = {
  id: string
  label: string
  kind: "user" | "system"
  targetFrameId: string
}

export type StoryboardFrameScreenshots = {
  desktop?: string
  mobile?: string
  square?: string
}

export type StoryboardFrameCaptureSetRecord = {
  label?: string
  screenshots?: StoryboardFrameScreenshots
}

export type StoryboardFrameCaptureSets = Record<
  string,
  StoryboardFrameCaptureSetRecord
>

export type StoryboardFrameRecord = {
  id: string
  title: string
  description?: string
  notes?: string
  screenshots?: StoryboardFrameScreenshots
  captureSets?: StoryboardFrameCaptureSets
  transitions?: StoryboardTransitionRecord[]
  nextLabel?: string
}

function isFrameScreenshots(value: unknown): value is StoryboardFrameScreenshots {
  if (!value || typeof value !== "object") {
    return false
  }
  const candidate = value as Partial<StoryboardFrameScreenshots>
  return (
    (candidate.desktop === undefined || typeof candidate.desktop === "string") &&
    (candidate.mobile === undefined || typeof candidate.mobile === "string") &&
    (candidate.square === undefined || typeof candidate.square === "string")
  )
}

function isFrameCaptureSetRecord(
  value: unknown,
): value is StoryboardFrameCaptureSetRecord {
  if (!value || typeof value !== "object") {
    return false
  }
  const candidate = value as Partial<StoryboardFrameCaptureSetRecord>
  return (
    (candidate.label === undefined || typeof candidate.label === "string") &&
    (candidate.screenshots === undefined || isFrameScreenshots(candidate.screenshots))
  )
}

function isFrameCaptureSets(value: unknown): value is StoryboardFrameCaptureSets {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }
  return Object.values(value).every(isFrameCaptureSetRecord)
}

export type StoryboardBranchRecord = {
  id: string
  label: string
  sourceFrameId?: string
  frames: StoryboardFrameRecord[]
}

export type StoryboardStoryRecord = {
  id: string
  title: string
  notes?: string
  frames: StoryboardFrameRecord[]
  branches?: StoryboardBranchRecord[]
}

export type StoryboardHumanNote = {
  id: string
  targetType: "storyboard" | "story" | "frame" | "branch"
  targetId: string
  markdown: string
}

export type StoryboardSnapshotRequest = {
  id: string
  frameId: string
  componentSlug: string
  scenarioSlug: string
}

export type StoryboardDocument = {
  id: string
  title: string
  stories: StoryboardStoryRecord[]
  humanNotes?: StoryboardHumanNote[]
  snapshotRequests?: StoryboardSnapshotRequest[]
}

function isTransitionRecord(value: unknown): value is StoryboardTransitionRecord {
  if (!value || typeof value !== "object") {
    return false
  }
  const candidate = value as Partial<StoryboardTransitionRecord>
  return (
    typeof candidate.id === "string" &&
    typeof candidate.label === "string" &&
    (candidate.kind === "user" || candidate.kind === "system") &&
    typeof candidate.targetFrameId === "string"
  )
}

function isFrameRecord(value: unknown): value is StoryboardFrameRecord {
  if (!value || typeof value !== "object") {
    return false
  }
  const candidate = value as Partial<StoryboardFrameRecord>
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    (candidate.description === undefined || typeof candidate.description === "string") &&
    (candidate.notes === undefined || typeof candidate.notes === "string") &&
    (candidate.screenshots === undefined || isFrameScreenshots(candidate.screenshots)) &&
    (candidate.captureSets === undefined || isFrameCaptureSets(candidate.captureSets)) &&
    (candidate.nextLabel === undefined || typeof candidate.nextLabel === "string") &&
    (candidate.transitions === undefined ||
      (Array.isArray(candidate.transitions) && candidate.transitions.every(isTransitionRecord)))
  )
}

function isBranchRecord(value: unknown): value is StoryboardBranchRecord {
  if (!value || typeof value !== "object") {
    return false
  }
  const candidate = value as Partial<StoryboardBranchRecord>
  return (
    typeof candidate.id === "string" &&
    typeof candidate.label === "string" &&
    (candidate.sourceFrameId === undefined || typeof candidate.sourceFrameId === "string") &&
    Array.isArray(candidate.frames) &&
    candidate.frames.every(isFrameRecord)
  )
}

function isStoryRecord(value: unknown): value is StoryboardStoryRecord {
  if (!value || typeof value !== "object") {
    return false
  }
  const candidate = value as Partial<StoryboardStoryRecord>
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    (candidate.notes === undefined || typeof candidate.notes === "string") &&
    Array.isArray(candidate.frames) &&
    candidate.frames.every(isFrameRecord) &&
    (candidate.branches === undefined ||
      (Array.isArray(candidate.branches) && candidate.branches.every(isBranchRecord)))
  )
}

export function isStoryboardDocument(value: unknown): value is StoryboardDocument {
  if (!value || typeof value !== "object") {
    return false
  }
  const candidate = value as Partial<StoryboardDocument>
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    Array.isArray(candidate.stories) &&
    candidate.stories.every(isStoryRecord)
  )
}

export function normalizeStoryboardFrameRecord(
  frame: StoryboardFrameRecord,
): StoryboardFrameRecord {
  const normalizedCaptureSets: StoryboardFrameCaptureSets = frame.captureSets
    ? Object.fromEntries(
        Object.entries(frame.captureSets).map(([id, captureSet]) => [
          id,
          {
            ...(captureSet.label ? { label: captureSet.label } : {}),
            ...(captureSet.screenshots ? { screenshots: captureSet.screenshots } : {}),
          },
        ]),
      )
    : frame.screenshots
      ? {
          default: {
            screenshots: frame.screenshots,
          },
        }
      : {}

  return {
    ...frame,
    ...(Object.keys(normalizedCaptureSets).length > 0
      ? { captureSets: normalizedCaptureSets }
      : {}),
    screenshots: undefined,
  }
}

export function normalizeStoryboardDocument(
  document: StoryboardDocument,
): StoryboardDocument {
  return {
    ...document,
    stories: document.stories.map((story) => ({
      ...story,
      frames: story.frames.map(normalizeStoryboardFrameRecord),
      branches: story.branches?.map((branch) => ({
        ...branch,
        frames: branch.frames.map(normalizeStoryboardFrameRecord),
      })),
    })),
  }
}

export function frameCaptureSetIds(frame: Partial<StoryboardFrameRecord>) {
  if (frame.captureSets) {
    return Object.keys(frame.captureSets)
  }
  if (frame.screenshots) {
    return ["default"]
  }
  return []
}

export function frameCaptureSet(
  frame: Partial<StoryboardFrameRecord>,
  captureSetId?: string,
) {
  const normalized = normalizeStoryboardFrameRecord(frame as StoryboardFrameRecord)
  const captureSets = normalized.captureSets ?? {}
  const ids = Object.keys(captureSets)
  if (ids.length === 0) {
    return {
      id: captureSetId ?? "default",
      label: captureSetId && captureSetId !== "default" ? captureSetId : "Default",
      screenshots: undefined,
    }
  }

  if (captureSetId && !captureSets[captureSetId]) {
    return {
      id: captureSetId,
      label: captureSetId === "default" ? "Default" : captureSetId,
      screenshots: undefined,
    }
  }

  const selectedId = captureSetId ?? (captureSets.default ? "default" : ids[0])
  const selected = captureSets[selectedId]
  return {
    id: selectedId,
    label: selected?.label ?? (selectedId === "default" ? "Default" : selectedId),
    screenshots: selected?.screenshots,
  }
}

export function formatStoryboardDocument(document: StoryboardDocument) {
  return `${JSON.stringify(normalizeStoryboardDocument(document), null, 2)}\n`
}
