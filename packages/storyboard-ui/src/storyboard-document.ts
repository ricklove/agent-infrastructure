export type StoryboardTransitionRecord = {
  id: string
  label: string
  kind: "user" | "system"
  targetFrameId: string
}

export type StoryboardFrameRecord = {
  id: string
  title: string
  description?: string
  transitions?: StoryboardTransitionRecord[]
  nextLabel?: string
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

export function formatStoryboardDocument(document: StoryboardDocument) {
  return `${JSON.stringify(document, null, 2)}\n`
}
