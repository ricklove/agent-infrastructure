export type StoryboardFrameRecord = {
  id: string
  title: string
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

export function isStoryboardDocument(value: unknown): value is StoryboardDocument {
  if (!value || typeof value !== "object") {
    return false
  }
  const candidate = value as Partial<StoryboardDocument>
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    Array.isArray(candidate.stories)
  )
}

export function formatStoryboardDocument(document: StoryboardDocument) {
  return `${JSON.stringify(document, null, 2)}\n`
}
