import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import {
  PanZoomContainer,
  type PanZoomContainerHandle,
} from "../PanZoomContainer"
import { PanelLayout, type PanelLayoutPanel } from "../PanelLayout"
import { ScreenshotFrameCell } from "../ScreenshotFrameCell"
import {
  StoryboardGrid,
  TitleOnlyStoryboardFrame,
  CheckIcon,
  copyTextToClipboard,
  type StoryboardGridFrame,
  type StoryboardGridSequence,
} from "../StoryboardGrid"
import {
  type StoryboardBranchRecord,
  type StoryboardDocument,
  type StoryboardRunTargetWeb,
  type StoryboardStoryRecord,
  type StoryboardTransitionRecord,
  type StoryboardFrameRecord,
  frameCaptureSet,
  frameCaptureSetIds,
  normalizeStoryboardDocument,
} from "../storyboard-document"
import {
  normalizeRunTargetHealthChecks,
  normalizeRunTargets,
  normalizeRunTarget,
  normalizeWebRunTargetUrl,
  runTargetDisplayName,
  runTargetHealthSummary,
  type RunTargetConfigField,
  type RunTargetHealthCheck,
  type RunTargetHealthPayload,
  type RunTargetHealthStatus,
  type RunTargetProviderTarget,
} from "../run-target-health"
import type { StoryboardDebugComponentDefinition } from "./types"

type DocumentResponse = {
  ok: true
  path: string
  document: StoryboardDocument
  mtimeMs: number
}

type StoryboardListEntry = {
  name: string
  root?: string
  hasStoryboardJson?: boolean
  hasStoryboardMarkdown?: boolean
  storyboardUrl: string
}

type StoryboardListResponse = {
  ok: true
  accessServerUrl: string
  rootDir: string | null
  storyboards: StoryboardListEntry[]
}

type SnapshotJob = {
  id: string
  status: "queued" | "running" | "succeeded" | "failed"
  startedAt: string
  finishedAt?: string
  exitCode?: number
  stdout?: string
  stderr?: string
}

type RunLifecycleStatus =
  | "queued"
  | "pending"
  | "running"
  | "capturing"
  | "succeeded"
  | "failed"
  | "skipped"
  | "cancelled"
  | "expired"
  | "recovered"

type RunMode = "run-to-state" | "capture" | "run-and-capture"
type OutputVariantId = "desktop" | "mobile" | "square"

type StoryboardRunJob = {
  jobId: string
  status: RunLifecycleStatus
  queuePosition?: number
  completedAt?: string
  updatedAt?: string
  error?: { message?: string }
}

type RunProvenanceDto = {
  outputAssetHash?: string
  completedAt?: string
  outputAsset?: string
  summary?: string
  runtimeTarget?: RuntimeTargetDto
}

type RuntimeTargetDto = {
  id: string
  label?: string
  appUrl: string
  appOrigin?: string
  apiRoot?: string
  apiMode?: "real" | "stub" | "mock" | "unknown"
  apiStubInfo?: string
}

export type RunTargetHealthPanelState = {
  open: boolean
  runTargetId: string
  runTargetLabel: string
  runTargetUrl?: string
  target?: RunTargetProviderTarget | null
  configDraft?: Record<string, string>
  configSaveState?: "idle" | "saving" | "saved" | "unsupported" | "error"
  configSaveMessage?: string | null
  checks: RunTargetHealthCheck[]
  owner?: string
  loading: boolean
  runningKey?: string
  error?: string | null
  updatedAt?: string
}

type StoryboardHealthBadgeState = {
  status: "PASS" | "WARN" | "FAIL" | "UNKNOWN"
  loading: boolean
  checkedAt?: string
  error?: string | null
  profileId: string
}

function storyboardHealthStatusClass(
  status: StoryboardHealthBadgeState["status"],
) {
  switch (status) {
    case "PASS":
      return "border-emerald-300/40 bg-emerald-300/10 text-emerald-100"
    case "WARN":
      return "border-amber-300/40 bg-amber-300/10 text-amber-100"
    case "FAIL":
      return "border-rose-300/40 bg-rose-300/10 text-rose-100"
    default:
      return "border-white/15 bg-white/5 text-white/60"
  }
}

function storyboardHealthStatusFromRun(
  result:
    | { checks?: Array<{ status?: string }>; status?: string }
    | null
    | undefined,
): StoryboardHealthBadgeState["status"] {
  const checks = Array.isArray(result?.checks) ? result.checks : []
  const statuses = checks.map((check) =>
    String(check.status ?? "UNKNOWN").toUpperCase(),
  )
  if (
    statuses.some(
      (status) =>
        status === "FAIL" ||
        status === "DISPATCH_FAILED" ||
        status === "UNAUTHORIZED",
    )
  )
    return "FAIL"
  if (
    statuses.some(
      (status) =>
        status === "WARN" || status === "BLOCKED" || status === "STALE",
    )
  )
    return "WARN"
  if (
    statuses.some(
      (status) =>
        status === "UNKNOWN" ||
        status === "NOT_RUN" ||
        status === "UNSUPPORTED" ||
        status === "RUNNING",
    )
  )
    return "UNKNOWN"
  if (checks.length > 0) return "PASS"
  return result?.status === "pass"
    ? "PASS"
    : result?.status === "fail"
      ? "FAIL"
      : "UNKNOWN"
}

function storyboardHealthViewHref(storyboardUrl: string) {
  const params = new URLSearchParams({
    profileId: "storyboard_source_health",
    storyboardUrl,
  })
  return `/health?${params.toString()}`
}

function storyboardHealthCheckedLabel(value?: string) {
  if (!value) return "not checked"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString()
}

type AutomationDriverDto = {
  runnerId: string
  runnerKind: string
  manifestEntryId: string
  scriptId: string
  stepId: string
  command: string
  fullyAutomated: boolean
  stateTarget: {
    storyboardId: string
    storyId: string
    frameKey: string
    captureSetId: string
    outputVariantId: string
    mode?: string
  }
  disabledReason: string | null
}

type VariantRunState = {
  key: string
  storyboardId: string
  storyId: string
  frameKey: string
  captureSetId: string
  outputVariantId: OutputVariantId
  mode: RunMode
  status: RunLifecycleStatus | "pending" | "failed-to-queue" | "disabled"
  jobId?: string
  queuePosition?: number
  message?: string
  updatedAt: string
  completedAt?: string
  outputAssetHash?: string
  outputAsset?: string
  runtimeTarget?: RuntimeTargetDto
  runnable?: boolean
  disabledReason?: string | null
  manifestEntryIds?: string[]
  automationDriver?: AutomationDriverDto
}

type FrameRunStateDto = {
  storyboardId: string
  storyId: string
  frameKey: string
  runnable?: boolean
  disabledReason?: string | null
  runtimeTarget?: RuntimeTargetDto
  manifestEntryIds?: string[]
  automationDriver?: AutomationDriverDto
  currentJob?: StoryboardRunJob
  latestJob?: StoryboardRunJob
  provenance?: RunProvenanceDto
}

type StoryboardRunStateDto = {
  ok?: boolean
  storyboardId: string
  queue?: { active: number; queued: number; maxActive: number }
  frames: FrameRunStateDto[]
}

type SelectedTarget =
  | { kind: "storyboard" }
  | { kind: "story"; storyId: string }
  | { kind: "frame"; storyId: string; frameId: string; branchId?: string }

type TransitionSelection = {
  transitionId: string
  selected: SelectedTarget
}

function PlusIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function TrashIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M4 7h16M9.5 11.5v5M14.5 11.5v5M7.5 7l1 11.5a1 1 0 001 .9h5a1 1 0 001-.9L16.5 7M9 7l.7-1.6a1 1 0 01.9-.6h2.8a1 1 0 01.9.6L15 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  )
}

function ArrowRightIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M5 12h13m0 0-5-5m5 5-5 5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function CopyIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M9 9.75A2.25 2.25 0 0111.25 7.5h6a2.25 2.25 0 012.25 2.25v8.5a2.25 2.25 0 01-2.25 2.25h-6A2.25 2.25 0 019 18.25v-8.5z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M15 7.5V6.25A2.25 2.25 0 0012.75 4h-6A2.25 2.25 0 004.5 6.25v8.5A2.25 2.25 0 006.75 17H9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

const apiRoot = "/api/storyboard"
const bundledDefaultStoryboardUrl = "http://127.0.0.1:8798/default-storyboard"
const testFixtureStoryboardUrl = "http://127.0.0.1:8799/test-storyboard"
const emptyRunTargetHealthState: RunTargetHealthPanelState = {
  open: false,
  runTargetId: "",
  runTargetLabel: "",
  checks: [],
  loading: false,
  error: null,
}

function runTargetHealthStatusClass(status: RunTargetHealthStatus) {
  if (status === "pass")
    return "border-emerald-300/40 bg-emerald-300/10 text-emerald-100"
  if (status === "warn")
    return "border-amber-300/45 bg-amber-300/10 text-amber-100"
  if (status === "fail")
    return "border-rose-300/45 bg-rose-300/10 text-rose-100"
  return "border-slate-300/35 bg-slate-300/10 text-slate-100"
}

function compactEvidence(value: unknown) {
  if (value === undefined || value === null || value === "") return ""
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function normalizeRunTargetHealthPayload(payload: unknown): {
  checks: RunTargetHealthCheck[]
  owner?: string
  target?: RunTargetProviderTarget | null
} {
  const record =
    payload && typeof payload === "object"
      ? (payload as RunTargetHealthPayload)
      : {}
  return {
    checks: normalizeRunTargetHealthChecks(payload),
    target: normalizeRunTarget(payload),
    ...(typeof record.owner === "string" && record.owner.trim()
      ? { owner: record.owner.trim() }
      : {}),
  }
}
const remoteStoryboardUrlStorageKey = "storyboard.debug.remoteStoryboardUrl"
const runStateStorageKey = "storyboard.debug.variantRunState"
const frameSize = 220
const screenshotFrameWidth = 720
const screenshotFrameHeight = 720
const screenshotActionWidth = 96
const screenshotNextHeight = 120
const frameStride = 220 + 72 + 16
const rowStride = 220 + 96 + 24

function findStory(document: StoryboardDocument | null, storyId: string) {
  return document?.stories.find((story) => story.id === storyId) ?? null
}

function findBranch(story: StoryboardStoryRecord | null, branchId?: string) {
  if (!story || !branchId) {
    return null
  }
  return story.branches?.find((branch) => branch.id === branchId) ?? null
}

function findFrameRecord(
  document: StoryboardDocument | null,
  selected: SelectedTarget | null,
) {
  if (!document || !selected || selected.kind !== "frame") {
    return { story: null, branch: null, frame: null }
  }
  const story = findStory(document, selected.storyId)
  const branch = findBranch(story, selected.branchId)
  const frames = branch ? branch.frames : (story?.frames ?? [])
  const frame = frames.find((entry) => entry.id === selected.frameId) ?? null
  return { story, branch, frame }
}

function updateStory(
  document: StoryboardDocument,
  storyId: string,
  updater: (story: StoryboardStoryRecord) => StoryboardStoryRecord,
) {
  return {
    ...document,
    stories: document.stories.map((story) =>
      story.id === storyId ? updater(story) : story,
    ),
  }
}

function frameNextLabel(
  frame: StoryboardGridFrame & { transitions?: StoryboardTransitionRecord[] },
) {
  return frame.transitions?.[0]?.label ?? frame.nextLabel
}

function buildBranchRows(
  branches: StoryboardBranchRecord[],
  parentFrames: StoryboardFrameRecord[],
  parentStartColumn: number,
  consumed: Set<string>,
): StoryboardGridSequence[] {
  const rows: StoryboardGridSequence[] = []

  for (
    let frameIndex = parentFrames.length - 1;
    frameIndex >= 0;
    frameIndex -= 1
  ) {
    const frame = parentFrames[frameIndex]
    const childBranches = branches.filter(
      (branch) => branch.sourceFrameId === frame.id && !consumed.has(branch.id),
    )

    childBranches.forEach((branch) => {
      consumed.add(branch.id)
      const branchStartColumn = parentStartColumn + frameIndex + 1
      rows.push({
        id: branch.id,
        title: `Branch: ${branch.label}`,
        sourceFrameId: branch.sourceFrameId,
        startColumn: branchStartColumn,
        startLabel: branch.label,
        frames: branch.frames.map((entry) => ({
          ...entry,
          nextLabel: frameNextLabel(entry),
        })),
      })
      rows.push(
        ...buildBranchRows(
          branches,
          branch.frames,
          branchStartColumn,
          consumed,
        ),
      )
    })
  }

  return rows
}

function buildTransitionTreeRows(
  story: StoryboardStoryRecord,
): StoryboardGridSequence[] {
  const framesById = new Map(story.frames.map((frame) => [frame.id, frame]))
  const renderedFrameIds = new Set<string>()

  const transitionTargets = (frame: StoryboardFrameRecord) =>
    (frame.transitions ?? [])
      .map((transition) => ({
        transition,
        target: transition.targetFrameId
          ? framesById.get(transition.targetFrameId)
          : undefined,
      }))
      .filter(
        (
          entry,
        ): entry is {
          transition: StoryboardTransitionRecord
          target: StoryboardFrameRecord
        } => !!entry.target,
      )

  const buildPrimaryPath = (startFrame: StoryboardFrameRecord) => {
    const path: StoryboardFrameRecord[] = []
    const pathIds = new Set<string>()
    let current: StoryboardFrameRecord | undefined = startFrame

    while (
      current &&
      !pathIds.has(current.id) &&
      !renderedFrameIds.has(current.id)
    ) {
      path.push(current)
      pathIds.add(current.id)
      renderedFrameIds.add(current.id)
      current = transitionTargets(current)[0]?.target
    }

    return path
  }

  const branchRowsForPath = (
    path: StoryboardFrameRecord[],
    parentStartColumn: number,
  ): StoryboardGridSequence[] => {
    const rows: StoryboardGridSequence[] = []

    for (let frameIndex = path.length - 1; frameIndex >= 0; frameIndex -= 1) {
      const sourceFrame = path[frameIndex]
      const alternateTransitions = transitionTargets(sourceFrame).slice(1)

      alternateTransitions.forEach(({ transition, target }) => {
        if (renderedFrameIds.has(target.id)) return
        const branchStartColumn = parentStartColumn + frameIndex + 1
        const branchPath = buildPrimaryPath(target)
        if (branchPath.length === 0) return
        rows.push({
          id: `${sourceFrame.id}-${transition.id || transition.targetFrameId || target.id}`,
          title: `Branch: ${transition.label}`,
          sourceFrameId: sourceFrame.id,
          startColumn: branchStartColumn,
          startLabel: transition.label,
          frames: branchPath.map((entry) => ({
            ...entry,
            nextLabel: frameNextLabel(entry),
          })),
        })
        rows.push(...branchRowsForPath(branchPath, branchStartColumn))
      })
    }

    return rows
  }

  const targetedFrameIds = new Set<string>()
  for (const frame of story.frames) {
    for (const { target } of transitionTargets(frame)) {
      targetedFrameIds.add(target.id)
    }
  }

  const rows: StoryboardGridSequence[] = []
  const rootFrames = story.frames.filter(
    (frame) => !targetedFrameIds.has(frame.id),
  )
  const orphanFrames = story.frames.filter((frame) =>
    targetedFrameIds.has(frame.id),
  )

  for (const frame of [...rootFrames, ...orphanFrames]) {
    if (renderedFrameIds.has(frame.id)) continue
    const path = buildPrimaryPath(frame)
    if (path.length === 0) continue
    rows.push({
      id: rows.length === 0 ? story.id : `${story.id}-${frame.id}`,
      title: rows.length === 0 ? story.title : `${story.title}: ${frame.title}`,
      startColumn: 0,
      frames: path.map((entry) => ({
        ...entry,
        nextLabel: frameNextLabel(entry),
      })),
    })
    rows.push(...branchRowsForPath(path, 0))
  }

  return rows
}

export function documentToSequences(
  document: StoryboardDocument,
): StoryboardGridSequence[] {
  return document.stories.flatMap((story) => {
    const transitionRows = buildTransitionTreeRows(story)
    const mainRows: StoryboardGridSequence[] =
      transitionRows.length > 0
        ? transitionRows
        : [
            {
              id: story.id,
              title: story.title,
              frames: story.frames.map((frame) => ({
                ...frame,
                nextLabel: frameNextLabel(frame),
              })),
            },
          ]

    const consumedBranches = new Set<string>()
    const branchRows = buildBranchRows(
      story.branches ?? [],
      story.frames,
      0,
      consumedBranches,
    )

    const orphanRows = (story.branches ?? [])
      .filter((branch) => !consumedBranches.has(branch.id))
      .map((branch) => ({
        id: branch.id,
        title: `Branch: ${branch.label}`,
        sourceFrameId: branch.sourceFrameId,
        startColumn: Math.max(story.frames.length - 1, 0),
        startLabel: branch.label,
        frames: branch.frames.map((entry) => ({
          ...entry,
          nextLabel: frameNextLabel(entry),
        })),
      }))

    return [...mainRows, ...branchRows, ...orphanRows]
  })
}

function estimateContentWidth(sequences: StoryboardGridSequence[]) {
  const maxColumns = Math.max(
    1,
    ...sequences.map(
      (sequence) => (sequence.startColumn ?? 0) + sequence.frames.length,
    ),
  )
  return maxColumns * frameStride + 240
}

function estimateContentHeight(sequences: StoryboardGridSequence[]) {
  return Math.max(520, sequences.length * rowStride + 160)
}

function estimateGridWidth(
  sequences: StoryboardGridSequence[],
  frameWidth: number,
  actionColumnWidth: number,
) {
  const maxColumns = Math.max(
    1,
    ...sequences.map(
      (sequence) => (sequence.startColumn ?? 0) + sequence.frames.length,
    ),
  )
  return (
    maxColumns * frameWidth +
    Math.max(maxColumns - 1, 0) * (actionColumnWidth + 16) +
    240
  )
}

function estimateGridHeight(
  sequences: StoryboardGridSequence[],
  frameHeight: number,
  nextCellHeight: number,
) {
  return Math.max(
    520,
    sequences.length * (frameHeight + nextCellHeight + 24) + 160,
  )
}

function storyboardUrlToDocumentQuery(storyboardUrl: string) {
  return `storyboardUrl=${encodeURIComponent(storyboardUrl)}`
}

function storyboardAccessServerUrl(storyboardUrl: string) {
  try {
    return new URL(storyboardUrl).origin
  } catch {
    return ""
  }
}

function isAccessServerRootUrl(storyboardUrl: string) {
  try {
    const url = new URL(storyboardUrl)
    const pathname = url.pathname.replace(/\/+$/u, "")
    return pathname === ""
  } catch {
    return false
  }
}

function hasFrameScreenshots(frame: Partial<StoryboardFrameRecord>) {
  if (frame.captureSets) {
    return Object.values(frame.captureSets).some(
      (captureSet) =>
        !!(
          captureSet.screenshots?.desktop ||
          captureSet.screenshots?.mobile ||
          captureSet.screenshots?.square
        ),
    )
  }
  return !!(
    frame.screenshots?.desktop ||
    frame.screenshots?.mobile ||
    frame.screenshots?.square
  )
}

function frameScreenshots(
  frame: Partial<StoryboardFrameRecord> | undefined,
  captureSetId: string,
) {
  return frame ? frameCaptureSet(frame, captureSetId).screenshots : undefined
}

function nextCaptureSetId(frame: Partial<StoryboardFrameRecord>) {
  const existingIds = new Set(frameCaptureSetIds(frame))
  if (!existingIds.has("default")) {
    return "default"
  }
  let index = 1
  while (existingIds.has("set-" + index)) {
    index += 1
  }
  return "set-" + index
}

function proxiedAssetUrl(
  storyboardUrl: string,
  assetPath: string | undefined,
  cacheKey?: string,
) {
  if (!storyboardUrl || !assetPath) {
    return undefined
  }
  const params = new URLSearchParams({ storyboardUrl, path: assetPath })
  if (cacheKey) {
    params.set("cacheBust", cacheKey)
    params.set("preferRunMirror", "1")
  }
  return `${apiRoot}/access-asset?${params.toString()}`
}

function variantRunKey(
  storyboardId: string,
  storyId: string,
  frameKey: string,
  captureSetId: string,
  outputVariantId: OutputVariantId,
  mode: RunMode,
) {
  return [
    storyboardId,
    storyId,
    frameKey,
    captureSetId,
    outputVariantId,
    mode,
  ].join("::")
}

function isTerminalRunStatus(status: VariantRunState["status"] | undefined) {
  return (
    status === "succeeded" ||
    status === "failed" ||
    status === "skipped" ||
    status === "cancelled" ||
    status === "expired" ||
    status === "recovered" ||
    status === "failed-to-queue"
  )
}

export function buildRunAssetCacheKey(input: {
  jobId?: string
  completedAt?: string
  updatedAt?: string
  outputAssetHash?: string
}) {
  const parts = [
    input.jobId,
    input.completedAt,
    input.updatedAt,
    input.outputAssetHash,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
  return parts.length > 0 ? parts.join("::") : undefined
}

function humanRunStatus(status: VariantRunState["status"]) {
  if (status === "disabled") return "Disabled"
  if (status === "pending") return "Pending"
  if (status === "queued") return "Queued"
  if (status === "running") return "Running"
  if (status === "capturing") return "Capturing"
  if (status === "succeeded") return "Succeeded"
  if (status === "failed") return "Failed"
  if (status === "failed-to-queue") return "Failed to queue"
  if (status === "skipped") return "Skipped"
  if (status === "cancelled") return "Cancelled"
  if (status === "expired") return "Expired"
  return "Recovered"
}

function runManifestEntryId(storyId: string, frameKey: string) {
  const suffix = `${storyId}-${frameKey}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180)
  return suffix
    ? `agent-browser-run-to-state-${suffix}`
    : "agent-browser-run-to-state-frame"
}

function loadPersistedVariantRunStates() {
  if (typeof window === "undefined")
    return {} as Record<string, VariantRunState>
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(runStateStorageKey) ?? "{}",
    ) as Record<string, VariantRunState>
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {} as Record<string, VariantRunState>
  }
}

function findStoryIdForFrame(
  document: StoryboardDocument | null,
  frameId: string,
) {
  for (const story of document?.stories ?? []) {
    if (story.frames.some((frame) => frame.id === frameId)) return story.id
    for (const branch of story.branches ?? []) {
      if (branch.frames.some((frame) => frame.id === frameId)) return story.id
    }
  }
  return undefined
}

export function findSelectionForFrameId(
  document: StoryboardDocument | null,
  frameId: string | null | undefined,
): SelectedTarget | null {
  const targetFrameId = frameId?.trim()
  if (!targetFrameId) return null

  for (const story of document?.stories ?? []) {
    if (story.frames.some((frame) => frame.id === targetFrameId)) {
      return { kind: "frame", storyId: story.id, frameId: targetFrameId }
    }
    for (const branch of story.branches ?? []) {
      if (branch.frames.some((frame) => frame.id === targetFrameId)) {
        return {
          kind: "frame",
          storyId: story.id,
          frameId: targetFrameId,
          branchId: branch.id,
        }
      }
    }
  }

  return null
}

export function readStoryboardEditorQuery(search: string) {
  const params = new URLSearchParams(search)
  return {
    storyboardUrl: params.get("storyboardUrl")?.trim() || "",
    frameId: params.get("frameId")?.trim() || "",
  }
}

function AssetImage({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      alt={alt}
      className="h-full w-full object-contain bg-zinc-950"
      src={src}
    />
  )
}

function AssetPreview({ src, alt }: { src?: string; alt: string }) {
  return src ? (
    <img
      alt={alt}
      className="h-full w-full object-contain bg-zinc-950"
      src={src}
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-[11px] uppercase tracking-[0.14em] text-white/35">
      No image
    </div>
  )
}

export function RunTargetHealthPanel({
  state,
  onRefresh,
  onRunAll,
  onRunOne,
  onClose,
  onConfigValueChange,
  onSaveConfig,
}: {
  state: RunTargetHealthPanelState
  onRefresh?: () => void
  onRunAll?: () => void
  onRunOne?: (key: string) => void
  onClose?: () => void
  onConfigValueChange?: (key: string, value: string) => void
  onSaveConfig?: () => void
}) {
  const statusCounts = runTargetHealthSummary(state.checks)
  const configFields = state.target?.configFields ?? []
  const diagnosticsJson = JSON.stringify(
    {
      runTargetId: state.runTargetId,
      runTargetLabel: state.runTargetLabel,
      runTargetUrl: state.runTargetUrl,
      owner: state.owner ?? state.target?.owner,
      target: state.target ?? null,
      checks: state.checks,
      summary: statusCounts,
      ok: statusCounts.fail === 0,
      updatedAt: state.updatedAt ?? null,
      error: state.error ?? null,
    },
    null,
    2,
  )
  const groupedChecks = useMemo(() => {
    const groups: {
      key: string
      label?: string
      checks: RunTargetHealthCheck[]
    }[] = []
    const groupIndex = new Map<
      string,
      { key: string; label?: string; checks: RunTargetHealthCheck[] }
    >()
    for (const check of state.checks) {
      const groupKey = check.group?.trim()
      if (!groupKey) {
        groups.push({ key: check.key, checks: [check] })
        continue
      }
      let group = groupIndex.get(groupKey)
      if (!group) {
        group = { key: groupKey, label: check.groupLabel, checks: [] }
        groupIndex.set(groupKey, group)
        groups.push(group)
      }
      group.checks.push(check)
    }
    return groups
  }, [state.checks])
  const renderCheck = (check: RunTargetHealthCheck) => {
    const evidence = compactEvidence(check.evidence)
    return (
      <div
        className={`rounded border p-3 ${runTargetHealthStatusClass(check.status)}`}
        key={check.key}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-black/25 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]">
                {check.status}
              </span>
              <span className="font-semibold text-white">
                {check.label ?? check.key}
              </span>
            </div>
            <div className="mt-1 break-all font-mono text-[11px] text-white/45">
              {check.key}
            </div>
          </div>
          <button
            className="rounded border border-white/15 bg-black/25 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/70 transition hover:border-cyan-200/60 hover:text-cyan-50"
            disabled={state.loading}
            onClick={() => onRunOne?.(check.key)}
            type="button"
          >
            {state.runningKey === check.key ? "Running…" : "Run check"}
          </button>
        </div>
        {check.detail ? (
          <div className="mt-2 text-white/70">{check.detail}</div>
        ) : null}
        {check.owner ? (
          <div className="mt-2 text-[11px] text-white/45">
            Owner: <span className="font-mono">{check.owner}</span>
          </div>
        ) : null}
        {check.checkedAt ? (
          <div className="mt-2 text-[11px] text-white/45">
            Checked: <span className="font-mono">{check.checkedAt}</span>
          </div>
        ) : null}
        {evidence ? (
          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 text-[10px] text-white/60">
            {evidence}
          </pre>
        ) : null}
        {check.remediation ? (
          <div className="mt-2 rounded border border-white/10 bg-black/20 p-2 text-white/70">
            Remediation: {check.remediation}
          </div>
        ) : null}
        {check.suggestedAction ? (
          <div className="mt-2 rounded border border-white/10 bg-black/20 p-2 text-white/70">
            Suggested action: {check.suggestedAction}
          </div>
        ) : null}
      </div>
    )
  }
  return (
    <div
      className="space-y-3 rounded border border-cyan-300/20 bg-cyan-300/5 p-3 text-xs text-white/65"
      data-run-target-health-panel="true"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.14em] text-cyan-100/75">
            Run Target Health
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            {state.runTargetLabel || state.runTargetId}
          </div>
          <div className="mt-1 break-all font-mono text-[11px] text-white/45">
            {state.runTargetId}
          </div>
          {state.runTargetUrl ? (
            <div className="mt-1 break-all text-[11px] text-white/45">
              {state.runTargetUrl}
            </div>
          ) : null}
          {state.target ? (
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-white/45">
              {state.target.kind ? (
                <span>
                  type: <span className="font-mono">{state.target.kind}</span>
                </span>
              ) : null}
              {state.target.owner ? (
                <span>
                  provider:{" "}
                  <span className="font-mono">{state.target.owner}</span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {onClose ? (
          <button
            className="rounded border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/55 transition hover:border-cyan-300/40 hover:text-cyan-100"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        ) : null}
      </div>
      <div className="rounded border border-white/10 bg-black/20 p-3 text-white/55">
        Provider-owned checks make sure the selected Run target has everything
        needed for Run to work: app entrypoint, backend/API, script
        prerequisites, source validity, stable app experience, and output
        readiness.
        {state.owner ? (
          <span>
            {" "}
            Provider:{" "}
            <span className="font-mono text-cyan-100">{state.owner}</span>.
          </span>
        ) : null}
      </div>
      {state.target?.description ? (
        <div className="rounded border border-white/10 bg-black/20 p-3 text-white/55">
          {state.target.description}
        </div>
      ) : null}
      <div className="rounded border border-white/10 bg-black/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-white/40">
              Config
            </div>
            <div className="mt-1 text-white/60">
              Provider-defined fields and current values. Missing config is
              separate from failed active health checks.
            </div>
          </div>
          {configFields.length > 0 ? (
            <button
              className="rounded border border-cyan-300/35 bg-cyan-300/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30"
              disabled={!onSaveConfig || state.configSaveState === "saving"}
              onClick={onSaveConfig}
              type="button"
            >
              {state.configSaveState === "saving" ? "Saving…" : "Save config"}
            </button>
          ) : null}
        </div>
        {configFields.length === 0 ? (
          <div className="mt-3 rounded border border-dashed border-white/10 p-3 text-white/40">
            No provider config fields returned for this run target.
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {configFields.map((field) => {
              const draftValue =
                state.configDraft?.[field.key] ??
                (field.value === undefined || field.value === null
                  ? ""
                  : String(field.value))
              const fieldStatus = field.status ?? "unknown"
              const missing =
                fieldStatus === "missing" ||
                (field.required && !draftValue.trim())
              return (
                <label
                  className={`block rounded border p-3 ${missing ? "border-rose-300/35 bg-rose-300/10" : "border-white/10 bg-black/20"}`}
                  key={field.key}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-white">
                      {field.label ?? field.key}
                    </span>
                    <span className="rounded border border-white/10 bg-black/30 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/55">
                      {fieldStatus}
                      {field.required ? " · required" : ""}
                    </span>
                  </div>
                  <div className="mt-1 break-all font-mono text-[11px] text-white/40">
                    {field.key}
                  </div>
                  <input
                    className="mt-2 w-full rounded border border-white/10 bg-black/35 px-2 py-1.5 font-mono text-xs text-cyan-100 outline-none focus:border-cyan-300 disabled:text-white/35"
                    disabled={field.readOnly || !onConfigValueChange}
                    onChange={(event) =>
                      onConfigValueChange?.(
                        field.key,
                        event.currentTarget.value,
                      )
                    }
                    placeholder={field.type ?? "value"}
                    value={draftValue}
                  />
                  {field.detail ? (
                    <div className="mt-2 text-[11px] text-white/55">
                      {field.detail}
                    </div>
                  ) : null}
                  {field.suggestedAction ? (
                    <div className="mt-2 text-[11px] text-amber-100/80">
                      Suggested action: {field.suggestedAction}
                    </div>
                  ) : null}
                </label>
              )
            })}
          </div>
        )}
        {state.configSaveMessage ? (
          <div
            className={`mt-3 rounded border p-2 text-[11px] ${state.configSaveState === "saved" ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100" : "border-amber-300/35 bg-amber-300/10 text-amber-100"}`}
          >
            {state.configSaveMessage}
          </div>
        ) : null}
        {configFields.length > 0 && !onSaveConfig ? (
          <div className="mt-3 rounded border border-amber-300/25 bg-amber-300/10 p-2 text-[11px] text-amber-100">
            Config is read-only in this surface until the provider exposes a
            config-save contract.
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded border border-white/10 bg-black/30 px-2 py-1 text-white/70 transition hover:border-cyan-300/40 hover:text-cyan-100"
          disabled={state.loading}
          onClick={onRefresh}
          type="button"
        >
          {state.loading && !state.runningKey ? "Loading…" : "Refresh status"}
        </button>
        <button
          className="rounded border border-cyan-300/35 bg-cyan-300/10 px-2 py-1 text-cyan-100 transition hover:border-cyan-200"
          disabled={state.loading}
          onClick={onRunAll}
          type="button"
        >
          {state.runningKey === "*" ? "Running all…" : "Run all checks"}
        </button>
        <button
          className="rounded border border-white/10 bg-black/30 px-2 py-1 text-white/70 transition hover:border-cyan-300/40 hover:text-cyan-100"
          onClick={() => void copyTextToClipboard(diagnosticsJson)}
          type="button"
        >
          Copy diagnostics JSON
        </button>
        <div className="ml-auto flex flex-wrap gap-1 text-[10px] uppercase tracking-[0.12em]">
          {(["pass", "warn", "fail", "unknown"] as RunTargetHealthStatus[]).map(
            (status) => (
              <span
                className={`rounded border px-2 py-1 ${runTargetHealthStatusClass(status)}`}
                key={status}
              >
                {status}: {statusCounts[status]}
              </span>
            ),
          )}
        </div>
      </div>
      {state.error ? (
        <div className="rounded border border-amber-300/35 bg-amber-300/10 p-3 text-amber-100">
          Health API unavailable or unsupported: {state.error}
        </div>
      ) : null}
      {state.checks.length === 0 && !state.loading && !state.error ? (
        <div className="rounded border border-dashed border-white/10 p-3 text-white/40">
          No provider health checks returned yet. Refresh status to load the
          provider-owned check list.
        </div>
      ) : null}
      <div className="space-y-2">
        {groupedChecks.map((group) => {
          if (group.checks.length === 1 && !group.checks[0]?.group)
            return renderCheck(group.checks[0])
          return (
            <section
              className="space-y-2 rounded border border-white/10 bg-black/20 p-2"
              key={group.key}
            >
              <div className="px-1 text-[10px] uppercase tracking-[0.16em] text-white/45">
                {group.label ?? group.key}
              </div>
              {group.checks.map(renderCheck)}
            </section>
          )
        })}
      </div>
      {state.updatedAt ? (
        <div className="text-[11px] text-white/35">
          Updated {new Date(state.updatedAt).toLocaleTimeString()}
        </div>
      ) : null}
    </div>
  )
}

export function displayedScreenshotAsset(
  screenshots: Partial<Record<OutputVariantId, string>> | undefined,
  outputVariantId: OutputVariantId,
  runOutputAsset?: string,
  _frameId?: string,
) {
  const canonicalAsset = screenshots?.[outputVariantId]?.trim()
  const trimmedRunOutputAsset = runOutputAsset?.trim()

  if (!trimmedRunOutputAsset) return canonicalAsset
  if (!canonicalAsset) return trimmedRunOutputAsset

  // Run-state is global for the storyboard and can contain successful jobs for
  // adjacent frames with very similar names. Never let a stale/provenance asset
  // replace the canonical screenshot for a different frame; only use run output
  // when it targets the same configured asset path for this exact frame/variant.
  return trimmedRunOutputAsset === canonicalAsset
    ? trimmedRunOutputAsset
    : canonicalAsset
}

function renderEditorFrame(
  frame: StoryboardGridFrame & Partial<StoryboardFrameRecord>,
  storyboardUrl: string,
  captureSetId: string,
  runVariantActions?: Partial<Record<OutputVariantId, ReactNode>>,
  variantAssetCacheKeys?: Partial<Record<OutputVariantId, string>>,
  variantOutputAssets?: Partial<Record<OutputVariantId, string>>,
) {
  if (hasFrameScreenshots(frame)) {
    const screenshots = frameScreenshots(frame, captureSetId)
    const desktop = proxiedAssetUrl(
      storyboardUrl,
      displayedScreenshotAsset(
        screenshots,
        "desktop",
        variantOutputAssets?.desktop,
        frame.id,
      ),
      variantAssetCacheKeys?.desktop,
    )
    const mobile = proxiedAssetUrl(
      storyboardUrl,
      displayedScreenshotAsset(
        screenshots,
        "mobile",
        variantOutputAssets?.mobile,
        frame.id,
      ),
      variantAssetCacheKeys?.mobile,
    )
    const square = proxiedAssetUrl(
      storyboardUrl,
      displayedScreenshotAsset(
        screenshots,
        "square",
        variantOutputAssets?.square,
        frame.id,
      ),
      variantAssetCacheKeys?.square,
    )

    return (
      <ScreenshotFrameCell
        description={frame.description}
        desktop={
          desktop ? (
            <AssetImage alt={`${frame.title} desktop`} src={desktop} />
          ) : undefined
        }
        desktopAction={runVariantActions?.desktop}
        mobile={
          mobile ? (
            <AssetImage alt={`${frame.title} mobile`} src={mobile} />
          ) : undefined
        }
        mobileAction={runVariantActions?.mobile}
        square={
          square ? (
            <AssetImage alt={`${frame.title} square`} src={square} />
          ) : undefined
        }
        squareAction={runVariantActions?.square}
        title={frame.title}
      />
    )
  }

  return (
    <TitleOnlyStoryboardFrame
      frame={frame}
      height={frameSize}
      width={frameSize}
    />
  )
}

function storyboardRecordId(prefix: string) {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function storyboardNameFromUrl(storyboardUrl: string) {
  try {
    const parsed = new URL(storyboardUrl)
    const parts = parsed.pathname.split("/").filter(Boolean)
    return parts.at(-1) || "storyboard"
  } catch {
    return "storyboard"
  }
}

function initialStoryboardUrlForSource(source: StoryboardEditorSource) {
  if (source.storyboardUrl) {
    return source.storyboardUrl
  }
  if (typeof window === "undefined") {
    return ""
  }
  const queryStoryboardUrl = readStoryboardEditorQuery(
    window.location.search,
  ).storyboardUrl
  if (queryStoryboardUrl) {
    return queryStoryboardUrl
  }
  return window.localStorage.getItem(remoteStoryboardUrlStorageKey) ?? ""
}

function createFallbackStoryboardDocument(
  storyboardUrl: string,
): StoryboardDocument {
  const storyboardName = storyboardNameFromUrl(storyboardUrl)
  const storyId = "story-001"
  const firstFrameId = "frame-001"
  const secondFrameId = "frame-002"

  return {
    id: storyboardName,
    title: "Untitled storyboard",
    stories: [
      {
        id: storyId,
        title: "Untitled story",
        notes: "- Add the first real user story here.",
        frames: [
          {
            id: firstFrameId,
            title: "Starting frame",
            description: "Describe what the user sees in this first step.",
            transitions: [
              {
                id: "transition-001",
                label: "Next",
                kind: "user",
                targetFrameId: secondFrameId,
              },
            ],
          },
          {
            id: secondFrameId,
            title: "Next frame",
            description:
              "Describe the resulting state after the first transition.",
            transitions: [],
          },
        ],
        branches: [],
      },
    ],
    humanNotes: [
      {
        id: "note-001",
        targetType: "story",
        targetId: storyId,
        markdown:
          "- Expand this story with real steps and transitions.\n- Add screenshots under assets/ when captures are available.",
      },
    ],
  }
}

function cloneDefaultStoryboardTemplate(
  templateDocument: StoryboardDocument,
  storyboardUrl: string,
): StoryboardDocument {
  return {
    ...templateDocument,
    id: storyboardNameFromUrl(storyboardUrl),
  }
}

function removeTransitionSubtree(
  story: StoryboardStoryRecord,
  targetFrameId: string,
) {
  const frameMap = new Map<string, StoryboardFrameRecord>()
  story.frames.forEach((frame) => frameMap.set(frame.id, frame))
  ;(story.branches ?? []).forEach((branch) =>
    branch.frames.forEach((frame) => frameMap.set(frame.id, frame)),
  )

  const removedFrameIds = new Set<string>()

  function visit(frameId: string) {
    if (removedFrameIds.has(frameId)) {
      return
    }
    removedFrameIds.add(frameId)
    const frame = frameMap.get(frameId)
    frame?.transitions?.forEach((transition) => {
      if (frameMap.has(transition.targetFrameId)) {
        visit(transition.targetFrameId)
      }
    })
  }

  visit(targetFrameId)

  return {
    ...story,
    frames: story.frames.filter((frame) => !removedFrameIds.has(frame.id)),
    branches: (story.branches ?? [])
      .filter(
        (branch) =>
          !removedFrameIds.has(branch.sourceFrameId ?? "") &&
          branch.frames.every((frame) => !removedFrameIds.has(frame.id)),
      )
      .map((branch) => ({
        ...branch,
        frames: branch.frames.filter((frame) => !removedFrameIds.has(frame.id)),
      })),
  }
}

type StoryboardEditorSource = {
  storyboardUrl: string
}

const remoteStoryboardWorkerPrompt = `Start the storyboard access server for the storyboard directory on this worker and give me the storyboard URL.

Requirements:
- Use Bun.
- Use the single-file script at scripts/storyboard-access-server.ts from the agent-infrastructure repo.
- Serve a storyboard directory root, not an individual file path.
- Pick an available port if 8798 is busy.
- Return the final storyboard URL in this form:
  http://<worker-host>:<port>/<storyboard-name>

Command shape:
bun scripts/storyboard-access-server.ts --root /absolute/path/to/<storyboard-name> --port 8798

Then reply with only:
Storyboard URL: http://<worker-host>:<port>/<storyboard-name>`

function StoryboardEditorFixture({
  source,
}: {
  source: StoryboardEditorSource
}) {
  const initialStoryboardUrl = initialStoryboardUrlForSource(source)
  const [path, setPath] = useState("")
  const [document, setDocument] = useState<StoryboardDocument | null>(null)
  const [status, setStatus] = useState("Loading storyboard…")
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle")
  const [snapshotJob, setSnapshotJob] = useState<SnapshotJob | null>(null)
  const [missingStoryboard, setMissingStoryboard] = useState(false)
  const [selected, setSelected] = useState<SelectedTarget | null>(null)
  const [storySearch, setStorySearch] = useState("")
  const [draftStoryboardUrl, setDraftStoryboardUrl] =
    useState(initialStoryboardUrl)
  const [connectedStoryboardUrl, setConnectedStoryboardUrl] =
    useState(initialStoryboardUrl)
  const [pendingDeleteStory, setPendingDeleteStory] = useState<null | {
    storyId: string
    anchorKey: string
  }>(null)
  const [pendingDeleteTransition, setPendingDeleteTransition] =
    useState<null | {
      transitionId: string
      anchorKey: string
    }>(null)
  const [focusedTransitionId, setFocusedTransitionId] = useState<string | null>(
    null,
  )
  const [workerPromptCopyState, setWorkerPromptCopyState] = useState<
    "idle" | "copied" | "failed"
  >("idle")
  const [markdownImportError, setMarkdownImportError] = useState<string | null>(
    null,
  )
  const [markdownImportCopyState, setMarkdownImportCopyState] = useState<
    "idle" | "copied" | "failed"
  >("idle")
  const [storyboardList, setStoryboardList] = useState<StoryboardListEntry[]>(
    [],
  )
  const [storyboardListRootDir, setStoryboardListRootDir] = useState<
    string | null
  >(null)
  const [storyboardListError, setStoryboardListError] = useState<string | null>(
    null,
  )
  const panZoomRef = useRef<PanZoomContainerHandle>(null)
  const saveTimeoutRef = useRef<number | undefined>(undefined)
  const skipAutosaveRef = useRef(true)
  const saveInFlightRef = useRef(false)
  const pendingSaveRef = useRef<StoryboardDocument | null>(null)
  const lastSavedRef = useRef("")
  const transitionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [activeCaptureSetId, setActiveCaptureSetId] = useState("default")
  const [variantRunStates, setVariantRunStates] = useState<
    Record<string, VariantRunState>
  >(() => loadPersistedVariantRunStates())
  const [variantAssetCacheKeys, setVariantAssetCacheKeys] = useState<
    Record<string, string>
  >({})
  const [runQueue, setRunQueue] = useState<
    StoryboardRunStateDto["queue"] | null
  >(null)
  const [runTargetHealth, setRunTargetHealth] =
    useState<RunTargetHealthPanelState>(emptyRunTargetHealthState)
  const [storyboardHealthBadge, setStoryboardHealthBadge] =
    useState<StoryboardHealthBadgeState>({
      status: "UNKNOWN",
      loading: false,
      profileId: "storyboard_source_health",
    })
  const isConnected = connectedStoryboardUrl.trim().length > 0
  const isAccessServerRootMode = useMemo(
    () => isConnected && isAccessServerRootUrl(connectedStoryboardUrl),
    [connectedStoryboardUrl, isConnected],
  )
  const sourceQuery = useMemo(
    () =>
      isConnected ? storyboardUrlToDocumentQuery(connectedStoryboardUrl) : "",
    [connectedStoryboardUrl, isConnected],
  )

  async function loadDocument() {
    if (!isConnected) {
      setPath("")
      setDocument(null)
      setMissingStoryboard(false)
      setSelected(null)
      setSnapshotJob(null)
      setMarkdownImportError(null)
      setStoryboardList([])
      setStoryboardListRootDir(null)
      setStoryboardListError(null)
      setRunQueue(null)
      setStatus("Enter a storyboard URL to connect")
      setSaveState("idle")
      return
    }

    if (isAccessServerRootMode) {
      setStatus("Loading storyboards…")
      setDocument(null)
      setMissingStoryboard(false)
      setSelected(null)
      const response = await fetch(`${apiRoot}/list?${sourceQuery}`)
      if (!response.ok) {
        setStoryboardList([])
        setStoryboardListRootDir(null)
        setStoryboardListError(await response.text())
        setStatus("Storyboard list failed")
        return
      }
      const payload = (await response.json()) as StoryboardListResponse
      setStoryboardList(payload.storyboards)
      setStoryboardListRootDir(payload.rootDir)
      setStoryboardListError(null)
      setStatus("Loaded storyboard list")
      setSaveState("idle")
      return
    }

    setStatus("Loading storyboard…")
    const response = await fetch(`${apiRoot}/document?${sourceQuery}`)
    if (!response.ok) {
      const message = await response.text()
      if (message.includes("storyboard.json not found")) {
        setMissingStoryboard(true)
        setDocument(null)
        setSelected(null)
        setStatus("Storyboard not initialized")
        setSaveState("idle")
        return
      }
      setMissingStoryboard(false)
      setStatus(message)
      return
    }
    const payload = (await response.json()) as DocumentResponse
    setMissingStoryboard(false)
    setMarkdownImportError(null)
    setStoryboardList([])
    setStoryboardListRootDir(null)
    setStoryboardListError(null)
    skipAutosaveRef.current = true
    pendingSaveRef.current = null
    lastSavedRef.current = JSON.stringify(payload.document)
    const nextDocument = normalizeStoryboardDocument(payload.document)
    const requestedFrameId =
      typeof window === "undefined"
        ? ""
        : readStoryboardEditorQuery(window.location.search).frameId
    setPath(payload.path)
    setDocument(nextDocument)
    setSelected(
      findSelectionForFrameId(nextDocument, requestedFrameId) ??
        (nextDocument.stories[0]
          ? { kind: "story", storyId: nextDocument.stories[0].id }
          : null),
    )
    setStatus("Loaded")
    setSaveState("idle")
  }

  useEffect(() => {
    if (!isConnected) {
      void loadDocument()
      return
    }
    void loadDocument()
  }, [isConnected, sourceQuery])

  useEffect(() => {
    if (source.storyboardUrl) {
      return
    }
    if (typeof window === "undefined") {
      return
    }
    const trimmedStoryboardUrl = connectedStoryboardUrl.trim()
    if (!trimmedStoryboardUrl) {
      window.localStorage.removeItem(remoteStoryboardUrlStorageKey)
      return
    }
    window.localStorage.setItem(
      remoteStoryboardUrlStorageKey,
      trimmedStoryboardUrl,
    )
  }, [connectedStoryboardUrl, source.storyboardUrl])

  async function persistDocument(nextDocument: StoryboardDocument) {
    const serialized = JSON.stringify(nextDocument)
    if (saveInFlightRef.current) {
      pendingSaveRef.current = nextDocument
      return
    }
    if (serialized === lastSavedRef.current) {
      setSaveState("saved")
      setStatus("Saved")
      return
    }

    saveInFlightRef.current = true
    setSaveState("saving")
    const response = await fetch(`${apiRoot}/document?${sourceQuery}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: serialized,
    })
    if (!response.ok) {
      saveInFlightRef.current = false
      setSaveState("error")
      setStatus(await response.text())
      return
    }
    const payload = (await response.json()) as DocumentResponse
    saveInFlightRef.current = false
    skipAutosaveRef.current = true
    lastSavedRef.current = JSON.stringify(payload.document)
    setDocument(normalizeStoryboardDocument(payload.document))
    setPath(payload.path)
    setSaveState("saved")
    setStatus("Saved")

    const pendingDocument = pendingSaveRef.current
    pendingSaveRef.current = null
    if (
      pendingDocument &&
      JSON.stringify(pendingDocument) !== lastSavedRef.current
    ) {
      void persistDocument(pendingDocument)
    }
  }

  useEffect(() => {
    if (!document) {
      return
    }
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false
      return
    }
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current)
    }
    setSaveState("idle")
    setStatus("Editing")
    saveTimeoutRef.current = window.setTimeout(() => {
      void persistDocument(document)
    }, 900)
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [document, sourceQuery])

  async function requestSnapshotRun() {
    if (!isConnected) {
      setStatus("Connect a storyboard URL first")
      return
    }
    setStatus("Requesting snapshot run…")
    const response = await fetch(`${apiRoot}/snapshot-jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        storyboardPath: path || null,
      }),
    })
    if (!response.ok) {
      setStatus(await response.text())
      return
    }
    const payload = (await response.json()) as { ok: true; job: SnapshotJob }
    setSnapshotJob(payload.job)
    setStatus(`Snapshot job ${payload.job.id} started`)
  }

  function upsertVariantRunState(next: VariantRunState) {
    setVariantRunStates((current) => ({ ...current, [next.key]: next }))
  }

  async function refreshRunState() {
    if (!document || !isConnected || isAccessServerRootMode) return
    const variantPayloads = await Promise.all(
      (["desktop", "mobile", "square"] as OutputVariantId[]).map(
        async (outputVariantId) => {
          const response = await fetch(
            `${apiRoot}/run-state?${sourceQuery}&captureSetId=${encodeURIComponent(activeCaptureSetId)}&outputVariantId=${encodeURIComponent(outputVariantId)}`,
          )
          if (!response.ok) return null
          return {
            outputVariantId,
            payload: (await response.json()) as StoryboardRunStateDto,
          }
        },
      ),
    )
    const firstQueue =
      variantPayloads.find((entry) => entry?.payload.queue)?.payload.queue ??
      null
    setRunQueue(firstQueue)
    const runStateUpdates: VariantRunState[] = []
    const nextCacheKeys: Record<string, string> = {}
    for (const entry of variantPayloads) {
      if (!entry) continue
      const { outputVariantId, payload } = entry
      for (const frame of payload.frames ?? []) {
        const key = variantRunKey(
          payload.storyboardId || document.id,
          frame.storyId,
          frame.frameKey,
          activeCaptureSetId,
          outputVariantId,
          "run-and-capture",
        )
        const job = frame.currentJob ?? frame.latestJob
        if (!job) {
          if (frame.runnable === false || frame.disabledReason) {
            runStateUpdates.push({
              key,
              storyboardId: payload.storyboardId || document.id,
              storyId: frame.storyId,
              frameKey: frame.frameKey,
              captureSetId: activeCaptureSetId,
              outputVariantId,
              mode: "run-and-capture",
              status: "disabled",
              message: frame.disabledReason ?? "not runnable",
              updatedAt: new Date().toISOString(),
              runtimeTarget: frame.runtimeTarget,
              runnable: frame.runnable,
              disabledReason: frame.disabledReason,
              manifestEntryIds: frame.manifestEntryIds,
              automationDriver: frame.automationDriver,
            })
          }
          continue
        }
        const completedAt = job.completedAt ?? frame.provenance?.completedAt
        const outputAssetHash = frame.provenance?.outputAssetHash
        runStateUpdates.push({
          key,
          storyboardId: payload.storyboardId || document.id,
          storyId: frame.storyId,
          frameKey: frame.frameKey,
          captureSetId: activeCaptureSetId,
          outputVariantId,
          mode: "run-and-capture",
          status: job.status,
          jobId: job.jobId,
          queuePosition: job.queuePosition,
          updatedAt: job.updatedAt ?? new Date().toISOString(),
          completedAt,
          outputAssetHash,
          outputAsset: frame.provenance?.outputAsset,
          runtimeTarget: frame.provenance?.runtimeTarget ?? frame.runtimeTarget,
          runnable: frame.runnable,
          disabledReason: frame.disabledReason,
          manifestEntryIds: frame.manifestEntryIds,
          automationDriver: frame.automationDriver,
        })
        const cacheKey = buildRunAssetCacheKey({
          jobId: job.jobId,
          completedAt,
          updatedAt: job.updatedAt,
          outputAssetHash,
        })
        if (job.status === "succeeded" && cacheKey) {
          nextCacheKeys[key] = cacheKey
        }
      }
    }
    setVariantRunStates((current) => {
      const next = { ...current }
      for (const update of runStateUpdates) {
        const existing = next[update.key]
        if (
          existing?.jobId &&
          existing.jobId !== update.jobId &&
          !isTerminalRunStatus(existing.status)
        )
          continue
        next[update.key] = update
      }
      return next
    })
    if (Object.keys(nextCacheKeys).length > 0) {
      setVariantAssetCacheKeys((current) => ({ ...current, ...nextCacheKeys }))
    }
  }

  async function refreshStoryboardHealthBadge() {
    if (!isConnected || isAccessServerRootMode) {
      setStoryboardHealthBadge({
        status: "UNKNOWN",
        loading: false,
        profileId: "storyboard_source_health",
      })
      return
    }
    setStoryboardHealthBadge((current) => ({
      ...current,
      loading: true,
      error: null,
    }))
    try {
      const response = await fetch("/api/health/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: "storyboard_source_health",
          targetId: "local",
          params: { storyboardUrl: connectedStoryboardUrl },
        }),
      })
      const payload = (await response.json()) as {
        ok?: boolean
        result?: {
          finishedAt?: string
          checks?: Array<{ status?: string }>
          status?: string
        }
        error?: string
      }
      if (!response.ok || !payload.ok || !payload.result) {
        throw new Error(
          payload.error ?? `Health API returned HTTP ${response.status}`,
        )
      }
      setStoryboardHealthBadge({
        status: storyboardHealthStatusFromRun(payload.result),
        loading: false,
        checkedAt: payload.result.finishedAt ?? new Date().toISOString(),
        profileId: "storyboard_source_health",
      })
    } catch (error) {
      setStoryboardHealthBadge({
        status: "UNKNOWN",
        loading: false,
        checkedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        profileId: "storyboard_source_health",
      })
    }
  }

  useEffect(() => {
    void refreshStoryboardHealthBadge()
  }, [isConnected, isAccessServerRootMode, connectedStoryboardUrl])

  async function requestRunTargetHealth(
    runTargetId: string,
    action: "list" | "check" | "check-all" = "list",
    key?: string,
  ) {
    if (!isConnected || !runTargetId) return
    setRunTargetHealth((current) => ({
      ...current,
      open: true,
      loading: true,
      runningKey:
        action === "check-all" ? "*" : action === "check" ? key : undefined,
      error: null,
    }))
    try {
      const params = new URLSearchParams(sourceQuery)
      params.set("runTargetId", runTargetId)
      const init: RequestInit =
        action === "list"
          ? { method: "GET" }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                storyboardUrl: connectedStoryboardUrl,
                runTargetId,
                ...(key ? { key } : {}),
              }),
            }
      const path =
        action === "list"
          ? "run-target-health"
          : action === "check"
            ? "run-target-health/check"
            : "run-target-health/check-all"
      const response = await fetch(
        `${apiRoot}/${path}?${params.toString()}`,
        init,
      )
      if (!response.ok) throw new Error(await response.text())
      const payload = normalizeRunTargetHealthPayload(await response.json())
      setRunTargetHealth((current) => ({
        ...current,
        open: true,
        checks: payload.checks,
        owner: payload.owner ?? current.owner,
        loading: false,
        runningKey: undefined,
        error: null,
        updatedAt: new Date().toISOString(),
      }))
      setStatus(
        `Loaded ${payload.checks.length} provider health checks for ${runTargetId}`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setRunTargetHealth((current) => ({
        ...current,
        open: true,
        loading: false,
        runningKey: undefined,
        error: message,
        updatedAt: new Date().toISOString(),
      }))
      setStatus(`Run target health unavailable: ${message}`)
    }
  }

  function openRunTargetHealth(
    runTargetId: string,
    runTargetLabel: string,
    runTargetUrl?: string,
  ) {
    setRunTargetHealth({
      open: true,
      runTargetId,
      runTargetLabel,
      runTargetUrl,
      checks: [],
      loading: true,
      error: null,
    })
    void requestRunTargetHealth(runTargetId)
  }

  async function requestFrameRun(
    storyId: string,
    frameKey: string,
    outputVariantId: OutputVariantId,
  ) {
    if (!document || !isConnected) return
    const mode: RunMode = "run-and-capture"
    const key = variantRunKey(
      document.id,
      storyId,
      frameKey,
      activeCaptureSetId,
      outputVariantId,
      mode,
    )
    const manifestEntryId =
      variantRunStates[key]?.manifestEntryIds?.[0] ??
      runManifestEntryId(storyId, frameKey)
    const now = new Date().toISOString()
    upsertVariantRunState({
      key,
      storyboardId: document.id,
      storyId,
      frameKey,
      captureSetId: activeCaptureSetId,
      outputVariantId,
      mode,
      status: "pending",
      message: "Queueing run…",
      updatedAt: now,
    })
    setStatus(`Queueing ${outputVariantId} run for ${frameKey}…`)
    try {
      const response = await fetch(`${apiRoot}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyboardUrl: connectedStoryboardUrl,
          scope: "frame",
          mode,
          target: {
            storyboardId: document.id,
            storyId,
            frameKey,
            outputVariantId,
          },
          manifestEntryId,
          captureSetId: activeCaptureSetId,
          outputVariantId,
          params: {},
        }),
      })
      if (!response.ok) {
        const message = await response.text()
        upsertVariantRunState({
          key,
          storyboardId: document.id,
          storyId,
          frameKey,
          captureSetId: activeCaptureSetId,
          outputVariantId,
          mode,
          status: "failed-to-queue",
          message,
          updatedAt: new Date().toISOString(),
        })
        setStatus(`Failed to queue ${outputVariantId} run: ${message}`)
        return
      }
      const payload = (await response.json()) as {
        ok?: true
        job?: StoryboardRunJob
        jobId?: string
        status?: RunLifecycleStatus
        queuePosition?: number
      }
      const jobId = payload.job?.jobId ?? payload.jobId
      const jobStatus = payload.job?.status ?? payload.status ?? "queued"
      upsertVariantRunState({
        key,
        storyboardId: document.id,
        storyId,
        frameKey,
        captureSetId: activeCaptureSetId,
        outputVariantId,
        mode,
        status: jobStatus,
        jobId,
        queuePosition: payload.job?.queuePosition ?? payload.queuePosition,
        updatedAt: payload.job?.updatedAt ?? new Date().toISOString(),
      })
      setStatus(`Queued ${outputVariantId} run ${jobId ?? ""}`.trim())
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      upsertVariantRunState({
        key,
        storyboardId: document.id,
        storyId,
        frameKey,
        captureSetId: activeCaptureSetId,
        outputVariantId,
        mode,
        status: "failed-to-queue",
        message,
        updatedAt: new Date().toISOString(),
      })
      setStatus(`Failed to queue ${outputVariantId} run: ${message}`)
    }
  }

  function renderRunVariantAction(
    storyId: string | undefined,
    frameKey: string,
    outputVariantId: OutputVariantId,
  ) {
    if (!document || !storyId) return null
    const mode: RunMode = "run-and-capture"
    const key = variantRunKey(
      document.id,
      storyId,
      frameKey,
      activeCaptureSetId,
      outputVariantId,
      mode,
    )
    const state = variantRunStates[key]
    const busy = state && !isTerminalRunStatus(state.status)
    const disabled = state?.status === "disabled"
    return (
      <div className="pointer-events-auto flex max-w-[11rem] flex-col items-end gap-1 text-right">
        <button
          className={`nopan nowheel rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] shadow transition ${
            disabled
              ? "border-slate-300/35 bg-slate-300/10 text-slate-200"
              : busy
                ? "border-amber-200/60 bg-amber-300/20 text-amber-50"
                : "border-cyan-200/50 bg-cyan-300/15 text-cyan-50 hover:border-cyan-100 hover:bg-cyan-300/25"
          }`}
          disabled={!!busy || disabled}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void requestFrameRun(storyId, frameKey, outputVariantId)
          }}
          title={
            disabled
              ? (state?.disabledReason ??
                state?.message ??
                `Run disabled for ${frameKey}`)
              : `Run ${frameKey} ${outputVariantId}`
          }
          type="button"
        >
          {disabled
            ? "Run disabled"
            : busy
              ? `${humanRunStatus(state.status)}…`
              : `Run ${outputVariantId}`}
        </button>
        {state ? (
          <div
            className={`rounded border px-2 py-1 text-[10px] leading-4 shadow ${
              state.status === "succeeded"
                ? "border-emerald-300/45 bg-emerald-300/15 text-emerald-50"
                : state.status === "failed" ||
                    state.status === "failed-to-queue"
                  ? "border-rose-300/45 bg-rose-300/15 text-rose-50"
                  : "border-amber-200/45 bg-amber-300/15 text-amber-50"
            }`}
            data-run-state-key={key}
          >
            <div className="font-semibold uppercase tracking-[0.12em]">
              {humanRunStatus(state.status)}
            </div>
            {state.jobId ? (
              <div className="font-mono">{state.jobId}</div>
            ) : null}
            {state.completedAt ? (
              <div title={state.completedAt}>
                Captured {new Date(state.completedAt).toLocaleTimeString()}
              </div>
            ) : null}
            {state.outputAssetHash ? (
              <div className="font-mono" title={state.outputAssetHash}>
                {state.outputAssetHash.replace(/^sha256:/u, "").slice(0, 12)}
              </div>
            ) : null}
            {state.outputAsset ? (
              <div className="max-w-[10rem] truncate" title={state.outputAsset}>
                {state.outputAsset.split("/").at(-1)}
              </div>
            ) : null}
            {state.runtimeTarget ? (
              <div
                className="max-w-[10rem] truncate"
                title={`${state.runtimeTarget.appUrl}${state.runtimeTarget.apiRoot ? ` | API ${state.runtimeTarget.apiRoot}` : ""}${state.runtimeTarget.apiMode ? ` | ${state.runtimeTarget.apiMode}` : ""}`}
              >
                {state.runtimeTarget.id}
              </div>
            ) : null}
            {state.automationDriver ? (
              <div
                className="max-w-[10rem] truncate"
                title={`${state.automationDriver.command} | ${state.automationDriver.stepId}`}
              >
                {state.automationDriver.fullyAutomated
                  ? "auto"
                  : "missing auto"}
                : {state.automationDriver.scriptId}
              </div>
            ) : null}
            {state.queuePosition !== undefined ? (
              <div>Queue #{state.queuePosition + 1}</div>
            ) : null}
            {state.message ? (
              <div className="max-w-[10rem] truncate" title={state.message}>
                {state.message}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  function runVariantActionsForFrame(
    frame: StoryboardGridFrame & Partial<StoryboardFrameRecord>,
  ) {
    const storyId = findStoryIdForFrame(document, frame.id)
    return {
      desktop: renderRunVariantAction(storyId, frame.id, "desktop"),
      mobile: renderRunVariantAction(storyId, frame.id, "mobile"),
      square: renderRunVariantAction(storyId, frame.id, "square"),
    }
  }

  function runVariantAssetCacheKeysForFrame(
    frame: StoryboardGridFrame & Partial<StoryboardFrameRecord>,
  ) {
    if (!document) return {}
    const storyId = findStoryIdForFrame(document, frame.id)
    if (!storyId) return {}
    const keys: Partial<Record<OutputVariantId, string>> = {}
    ;(["desktop", "mobile", "square"] as OutputVariantId[]).forEach(
      (outputVariantId) => {
        const key = variantRunKey(
          document.id,
          storyId,
          frame.id,
          activeCaptureSetId,
          outputVariantId,
          "run-and-capture",
        )
        const cacheKey = variantAssetCacheKeys[key]
        if (cacheKey) keys[outputVariantId] = cacheKey
      },
    )
    return keys
  }

  function runVariantAssetsForFrame(
    frame: StoryboardGridFrame & Partial<StoryboardFrameRecord>,
  ) {
    if (!document) return {}
    const storyId = findStoryIdForFrame(document, frame.id)
    if (!storyId) return {}
    const assets: Partial<Record<OutputVariantId, string>> = {}
    ;(["desktop", "mobile", "square"] as OutputVariantId[]).forEach(
      (outputVariantId) => {
        const key = variantRunKey(
          document.id,
          storyId,
          frame.id,
          activeCaptureSetId,
          outputVariantId,
          "run-and-capture",
        )
        const outputAsset = variantRunStates[key]?.outputAsset?.trim()
        if (outputAsset) assets[outputVariantId] = outputAsset
      },
    )
    return assets
  }

  async function initializeStoryboard() {
    if (!isConnected) {
      return
    }
    setStatus("Initializing storyboard…")
    const response = await fetch(`${apiRoot}/initialize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        storyboardUrl: connectedStoryboardUrl,
      }),
    })
    if (!response.ok) {
      setStatus(await response.text())
      return
    }
    const payload = (await response.json()) as DocumentResponse
    skipAutosaveRef.current = true
    setMissingStoryboard(false)
    setDocument(payload.document)
    const firstStoryId = payload.document.stories[0]?.id ?? null
    setSelected(
      firstStoryId
        ? { kind: "story", storyId: firstStoryId }
        : { kind: "storyboard" },
    )
    setStatus("")
  }

  async function importMarkdown() {
    if (!isConnected) {
      return
    }
    setMarkdownImportError(null)
    setStatus("Importing markdown…")
    const response = await fetch(`${apiRoot}/import-markdown`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        storyboardUrl: connectedStoryboardUrl,
      }),
    })
    const contentType = response.headers.get("content-type") ?? ""
    if (!response.ok) {
      if (contentType.includes("application/json")) {
        const payload = (await response.json()) as { message?: string }
        const message = payload.message ?? "Import failed"
        setMarkdownImportError(message)
        setStatus("Import failed")
        return
      }
      const message = await response.text()
      setMarkdownImportError(message)
      setStatus("Import failed")
      return
    }
    const payload = (await response.json()) as DocumentResponse
    skipAutosaveRef.current = true
    pendingSaveRef.current = null
    lastSavedRef.current = JSON.stringify(payload.document)
    setPath(payload.path)
    setDocument(normalizeStoryboardDocument(payload.document))
    setSelected(
      payload.document.stories[0]
        ? { kind: "story", storyId: payload.document.stories[0].id }
        : { kind: "storyboard" },
    )
    setStatus("Imported markdown")
    setSaveState("saved")
  }

  async function copyMarkdownImportError() {
    if (!markdownImportError) {
      return
    }
    const copied = await copyTextToClipboard(markdownImportError)
    setMarkdownImportCopyState(copied ? "copied" : "failed")
    window.setTimeout(() => {
      setMarkdownImportCopyState("idle")
    }, 1800)
  }

  async function copyWorkerPrompt() {
    const copied = await copyTextToClipboard(remoteStoryboardWorkerPrompt)
    setWorkerPromptCopyState(copied ? "copied" : "failed")
    window.setTimeout(() => {
      setWorkerPromptCopyState("idle")
    }, 1800)
  }

  useEffect(() => {
    if (
      !snapshotJob ||
      snapshotJob.status === "succeeded" ||
      snapshotJob.status === "failed"
    ) {
      return
    }
    const timer = window.setInterval(async () => {
      const response = await fetch(`${apiRoot}/snapshot-jobs/${snapshotJob.id}`)
      if (!response.ok) {
        return
      }
      const payload = (await response.json()) as { ok: true; job: SnapshotJob }
      setSnapshotJob(payload.job)
      if (payload.job.status === "succeeded") {
        setStatus(`Snapshot job ${payload.job.id} finished`)
      }
      if (payload.job.status === "failed") {
        setStatus(`Snapshot job ${payload.job.id} failed`)
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [snapshotJob])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(
      runStateStorageKey,
      JSON.stringify(variantRunStates),
    )
  }, [variantRunStates])

  useEffect(() => {
    const jobsToPoll = Object.values(variantRunStates).filter(
      (state) => state.jobId && !isTerminalRunStatus(state.status),
    )
    if (jobsToPoll.length === 0 || !isConnected) return
    const timer = window.setInterval(async () => {
      await Promise.all(
        jobsToPoll.map(async (state) => {
          if (!state.jobId) return
          const response = await fetch(
            `${apiRoot}/runs/${state.jobId}?${sourceQuery}`,
          )
          if (!response.ok) return
          const payload = (await response.json()) as {
            ok: true
            job: StoryboardRunJob
          }
          const job = payload.job
          upsertVariantRunState({
            ...state,
            status: job.status,
            jobId: job.jobId,
            queuePosition: job.queuePosition,
            updatedAt: job.updatedAt ?? new Date().toISOString(),
            completedAt: job.completedAt,
            message: job.error?.message,
          })
          if (isTerminalRunStatus(job.status)) {
            if (job.status === "succeeded") {
              const cacheKey = buildRunAssetCacheKey({
                jobId: job.jobId,
                completedAt: job.completedAt,
                updatedAt: job.updatedAt,
              })
              if (cacheKey) {
                setVariantAssetCacheKeys((current) => ({
                  ...current,
                  [variantRunKey(
                    state.storyboardId,
                    state.storyId,
                    state.frameKey,
                    state.captureSetId,
                    state.outputVariantId,
                    state.mode,
                  )]: cacheKey,
                }))
              }
            }
            setStatus(
              `${state.outputVariantId} run ${job.jobId} ${humanRunStatus(job.status).toLowerCase()}`,
            )
          }
        }),
      )
      void refreshRunState()
    }, 900)
    return () => window.clearInterval(timer)
  }, [variantRunStates, isConnected, sourceQuery])

  useEffect(() => {
    if (!document || !isConnected || isAccessServerRootMode) return
    void refreshRunState()
    const timer = window.setInterval(() => void refreshRunState(), 5000)
    return () => window.clearInterval(timer)
  }, [
    document?.id,
    isConnected,
    isAccessServerRootMode,
    sourceQuery,
    activeCaptureSetId,
  ])

  const storyCount = document?.stories.length ?? 0
  const frameCount =
    document?.stories.reduce((total, story) => {
      const branchFrames = (story.branches ?? []).reduce(
        (branchTotal, branch) => branchTotal + branch.frames.length,
        0,
      )
      return total + story.frames.length + branchFrames
    }, 0) ?? 0
  const isRemoteScenario = source.storyboardUrl === ""
  const isEmptyStoryboard =
    isConnected &&
    (missingStoryboard || (!!document && document.stories.length === 0))
  const headerStatus =
    saveState === "error"
      ? "Save failed"
      : snapshotJob?.status === "running"
        ? "Running snapshots…"
        : snapshotJob?.status === "failed"
          ? "Snapshot run failed"
          : null
  const sequences = useMemo(
    () => (document ? documentToSequences(document) : []),
    [document],
  )
  const availableCaptureSetIds = useMemo(() => {
    const ids = new Set<string>(Object.keys(document?.captureSets ?? {}))
    for (const story of document?.stories ?? []) {
      for (const frame of story.frames) {
        for (const id of frameCaptureSetIds(frame)) ids.add(id)
      }
      for (const branch of story.branches ?? []) {
        for (const frame of branch.frames) {
          for (const id of frameCaptureSetIds(frame)) ids.add(id)
        }
      }
    }
    return [...ids]
  }, [document])
  useEffect(() => {
    if (availableCaptureSetIds.length === 0) {
      if (activeCaptureSetId !== "default") setActiveCaptureSetId("default")
      return
    }
    if (!availableCaptureSetIds.includes(activeCaptureSetId)) {
      setActiveCaptureSetId(
        availableCaptureSetIds.includes("default")
          ? "default"
          : availableCaptureSetIds[0],
      )
    }
  }, [activeCaptureSetId, availableCaptureSetIds])
  const usesScreenshotFrames = useMemo(
    () =>
      sequences.some((sequence) =>
        sequence.frames.some((frame) =>
          hasFrameScreenshots(frame as Partial<StoryboardFrameRecord>),
        ),
      ),
    [sequences],
  )
  const editorFrameWidth = usesScreenshotFrames
    ? screenshotFrameWidth
    : frameSize
  const editorFrameHeight = usesScreenshotFrames
    ? screenshotFrameHeight
    : frameSize
  const editorActionWidth = usesScreenshotFrames ? screenshotActionWidth : 72
  const editorNextHeight = usesScreenshotFrames ? screenshotNextHeight : 96
  const selectedFrameId =
    selected?.kind === "frame" ? selected.frameId : undefined
  const selectedStory =
    selected?.kind === "story"
      ? findStory(document, selected.storyId)
      : selected?.kind === "frame"
        ? findStory(document, selected.storyId)
        : null
  const { branch: selectedBranch, frame: selectedFrame } = findFrameRecord(
    document,
    selected,
  )
  const selectedFrameTransitions = selectedFrame?.transitions ?? []
  const documentCaptureSetIds = Object.keys(document?.captureSets ?? {})
  const storyboardInspectorCaptureSetIds =
    documentCaptureSetIds.length > 0
      ? documentCaptureSetIds
      : [activeCaptureSetId]
  const selectedFrameCaptureSetIds = Array.from(
    new Set([
      ...documentCaptureSetIds,
      ...frameCaptureSetIds(selectedFrame ?? {}),
    ]),
  )
  const selectedFrameCapture = frameCaptureSet(
    selectedFrame ?? {},
    activeCaptureSetId,
  )
  const selectedDocumentCaptureSet = document?.captureSets?.[activeCaptureSetId]
  const selectedCaptureSizes = selectedDocumentCaptureSet?.sizes ?? {}
  const storyboardDefaultRunUrl = normalizeWebRunTargetUrl(
    document?.runTarget?.kind === "web" ? document.runTarget.url : "",
  )
  const selectedFrameRunAssets: Partial<Record<OutputVariantId, string>> = {}
  if (document && selected?.kind === "frame") {
    ;(["desktop", "mobile", "square"] as OutputVariantId[]).forEach(
      (outputVariantId) => {
        const key = variantRunKey(
          document.id,
          selected.storyId,
          selected.frameId,
          activeCaptureSetId,
          outputVariantId,
          "run-and-capture",
        )
        const outputAsset = variantRunStates[key]?.outputAsset?.trim()
        if (outputAsset) selectedFrameRunAssets[outputVariantId] = outputAsset
      },
    )
  }
  const selectedFrameScreenshotUrls = {
    desktop: proxiedAssetUrl(
      connectedStoryboardUrl,
      displayedScreenshotAsset(
        selectedFrameCapture.screenshots,
        "desktop",
        selectedFrameRunAssets.desktop,
      ),
    ),
    mobile: proxiedAssetUrl(
      connectedStoryboardUrl,
      displayedScreenshotAsset(
        selectedFrameCapture.screenshots,
        "mobile",
        selectedFrameRunAssets.mobile,
      ),
    ),
    square: proxiedAssetUrl(
      connectedStoryboardUrl,
      displayedScreenshotAsset(
        selectedFrameCapture.screenshots,
        "square",
        selectedFrameRunAssets.square,
      ),
    ),
  }
  const storyFrameOptions = selectedStory
    ? [
        ...selectedStory.frames.map((frame) => ({
          id: frame.id,
          title: frame.title,
        })),
        ...(selectedStory.branches ?? []).flatMap((branch) =>
          branch.frames.map((frame) => ({ id: frame.id, title: frame.title })),
        ),
      ]
    : []
  const filteredStories = useMemo(() => {
    const query = storySearch.trim().toLowerCase()
    if (!query) {
      return document?.stories ?? []
    }
    return (document?.stories ?? []).filter((story) =>
      story.title.toLowerCase().includes(query),
    )
  }, [document?.stories, storySearch])

  const visibleVariantRunStates = useMemo(
    () =>
      Object.values(variantRunStates)
        .filter((state) => state.storyboardId === document?.id)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 6),
    [variantRunStates, document?.id],
  )
  const activeVariantRunStates = visibleVariantRunStates.filter(
    (state) => !isTerminalRunStatus(state.status),
  )

  useEffect(() => {
    if (!selectedFrameId || sequences.length === 0) {
      return
    }
    const animationFrame = window.requestAnimationFrame(() => {
      const element = window.document.querySelector(
        `[data-storyboard-frame-shell="${CSS.escape(selectedFrameId)}"]`,
      )
      if (!(element instanceof HTMLElement)) {
        return
      }

      let left = element.offsetLeft
      let top = element.offsetTop
      let parent = element.offsetParent
      while (
        parent instanceof HTMLElement &&
        !parent.hasAttribute("data-panzoom-content")
      ) {
        left += parent.offsetLeft
        top += parent.offsetTop
        parent = parent.offsetParent
      }

      panZoomRef.current?.centerRect({
        left,
        top,
        width: element.offsetWidth,
        height: element.offsetHeight,
      })
    })
    return () => window.cancelAnimationFrame(animationFrame)
  }, [selectedFrameId, sequences])

  const navigatorPanel = useMemo<PanelLayoutPanel>(
    () => ({
      id: "story-navigator",
      title: "Stories",
      side: "left",
      initialWidth: 300,
      minWidth: 240,
      maxWidth: 420,
      content: (
        <div className="flex h-full min-h-0 flex-col gap-4 bg-zinc-950 p-4">
          <div className="min-h-0 flex-1 overflow-auto rounded border border-white/10 bg-black/30 p-3 text-xs text-white/65">
            <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-white/40">
              Stories
            </div>
            <div className="mb-3 flex items-center gap-2">
              <input
                className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-cyan-400"
                onChange={(event) => setStorySearch(event.currentTarget.value)}
                placeholder="Search stories"
                value={storySearch}
              />
              <button
                aria-label="Add story"
                className="flex h-8 w-8 items-center justify-center rounded border border-white/10 text-white/70 transition hover:border-cyan-300/40 hover:text-cyan-100"
                onClick={addStory}
                title="Add story"
                type="button"
              >
                <PlusIcon />
              </button>
            </div>
            <div className="space-y-3">
              {filteredStories.map((story) => (
                <div
                  className={`rounded border px-3 py-2 ${
                    selected?.kind === "story" && selected.storyId === story.id
                      ? "border-cyan-300/50 bg-cyan-200/10 text-cyan-100"
                      : "border-white/10 bg-white/5 text-white/70"
                  }`}
                  key={story.id}
                >
                  <div className="flex items-start gap-2">
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        setFocusedTransitionId(null)
                        setSelected({ kind: "story", storyId: story.id })
                      }}
                      type="button"
                    >
                      <div className="font-medium">{story.title}</div>
                      <div className="mt-1 text-white/45">
                        {story.frames.length} main frames,{" "}
                        {(story.branches ?? []).length} branches
                      </div>
                    </button>
                    {renderStoryDeleteButton(
                      story.id,
                      story.title,
                      `navigator:${story.id}`,
                    )}
                  </div>
                </div>
              ))}
              {filteredStories.length === 0 ? (
                <div className="rounded border border-dashed border-white/10 px-3 py-4 text-sm text-white/40">
                  No matching stories.
                </div>
              ) : null}
              <div className="flex justify-end pt-1">
                <button
                  aria-label="Add story"
                  className="flex h-8 w-8 items-center justify-center rounded border border-white/10 text-white/70 transition hover:border-cyan-300/40 hover:text-cyan-100"
                  onClick={addStory}
                  title="Add story"
                  type="button"
                >
                  <PlusIcon />
                </button>
              </div>
            </div>
          </div>
        </div>
      ),
    }),
    [filteredStories, pendingDeleteStory, selected, storySearch],
  )

  const inspectorPanel = useMemo<PanelLayoutPanel>(
    () => ({
      id: "frame-inspector",
      title: "Inspector",
      initialWidth: 380,
      minWidth: 300,
      maxWidth: 760,
      content: (
        <div className="flex h-full min-h-0 flex-col bg-zinc-950">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                Inspector
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/60">
                <button
                  className={`rounded border px-2 py-1 transition ${
                    selected?.kind === "storyboard"
                      ? "border-cyan-300/40 bg-cyan-200/10 text-cyan-100"
                      : "border-white/10 bg-black/30 hover:border-cyan-300/40 hover:text-cyan-100"
                  }`}
                  onClick={() => {
                    setFocusedTransitionId(null)
                    setSelected({ kind: "storyboard" })
                  }}
                  type="button"
                >
                  Storyboard
                </button>
                {selectedStory ? (
                  <>
                    <span className="text-white/30">&gt;</span>
                    <button
                      className={`rounded border px-2 py-1 transition ${
                        selected?.kind === "story"
                          ? "border-cyan-300/40 bg-cyan-200/10 text-cyan-100"
                          : "border-white/10 bg-black/30 hover:border-cyan-300/40 hover:text-cyan-100"
                      }`}
                      onClick={() => {
                        setFocusedTransitionId(null)
                        setSelected({
                          kind: "story",
                          storyId: selectedStory.id,
                        })
                      }}
                      type="button"
                    >
                      {selectedStory.title}
                    </button>
                  </>
                ) : null}
                {selected?.kind === "frame" && selectedFrame ? (
                  <>
                    <span className="text-white/30">&gt;</span>
                    <button
                      className="rounded border border-cyan-300/40 bg-cyan-200/10 px-2 py-1 text-cyan-100 transition"
                      onClick={() => {
                        setFocusedTransitionId(null)
                        setSelected({
                          kind: "frame",
                          storyId: selected.storyId,
                          frameId: selected.frameId,
                          branchId: selected.branchId,
                        })
                      }}
                      type="button"
                    >
                      {selectedFrame.title}
                    </button>
                  </>
                ) : null}
              </div>
              <div className="mt-2 text-sm text-white/55">
                {selected?.kind === "story"
                  ? "Editing story metadata"
                  : selected?.kind === "storyboard"
                    ? "Editing storyboard metadata"
                    : selected?.kind === "frame"
                      ? "Editing frame content"
                      : "Select a story or frame"}
              </div>
            </div>

            {runTargetHealth.open ? (
              <RunTargetHealthPanel
                onClose={() => setRunTargetHealth(emptyRunTargetHealthState)}
                onRefresh={() =>
                  void requestRunTargetHealth(runTargetHealth.runTargetId)
                }
                onRunAll={() =>
                  void requestRunTargetHealth(
                    runTargetHealth.runTargetId,
                    "check-all",
                  )
                }
                onRunOne={(key) =>
                  void requestRunTargetHealth(
                    runTargetHealth.runTargetId,
                    "check",
                    key,
                  )
                }
                state={runTargetHealth}
              />
            ) : null}

            {selected?.kind === "storyboard" && document ? (
              <div className="space-y-4">
                <div className="rounded border border-white/10 bg-white/5 p-3 text-xs text-white/55">
                  <div>{document.stories.length} stories</div>
                  <div>{frameCount} frames total</div>
                </div>
                <div className="space-y-3 rounded border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs uppercase tracking-[0.14em] text-white/45">
                      User stories
                    </div>
                    <button
                      aria-label="Add story"
                      className="flex h-7 w-7 items-center justify-center rounded border border-white/10 text-white/70 transition hover:border-cyan-300/40 hover:text-cyan-100"
                      onClick={addStory}
                      title="Add story"
                      type="button"
                    >
                      <PlusIcon />
                    </button>
                  </div>
                  <input
                    className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                    onChange={(event) =>
                      setStorySearch(event.currentTarget.value)
                    }
                    placeholder="Search stories"
                    value={storySearch}
                  />
                  <div className="space-y-2">
                    {filteredStories.map((story) => (
                      <div
                        className="flex items-start gap-2 rounded border border-white/10 bg-black/20 p-3"
                        key={story.id}
                      >
                        <button
                          className="min-w-0 flex-1 text-left"
                          onClick={() => {
                            setFocusedTransitionId(null)
                            setSelected({ kind: "story", storyId: story.id })
                          }}
                          type="button"
                        >
                          <div className="text-sm font-medium text-white">
                            {story.title}
                          </div>
                          <div className="mt-1 text-xs text-white/45">
                            {story.frames.length} main frames,{" "}
                            {(story.branches ?? []).length} branches
                          </div>
                        </button>
                        {renderStoryDeleteButton(
                          story.id,
                          story.title,
                          `storyboard-inspector:${story.id}`,
                        )}
                      </div>
                    ))}
                    {filteredStories.length === 0 ? (
                      <div className="rounded border border-dashed border-white/10 px-3 py-4 text-sm text-white/40">
                        No matching stories.
                      </div>
                    ) : null}
                    <div className="flex justify-end pt-1">
                      <button
                        aria-label="Add story"
                        className="flex h-7 w-7 items-center justify-center rounded border border-white/10 text-white/70 transition hover:border-cyan-300/40 hover:text-cyan-100"
                        onClick={addStory}
                        title="Add story"
                        type="button"
                      >
                        <PlusIcon />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 rounded border border-cyan-300/15 bg-cyan-300/5 p-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.14em] text-cyan-100/70">
                      Default run target
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      Stored as storyboard.runTarget. All capture sizes use this
                      web URL unless a size sets its own override.
                    </div>
                  </div>
                  <label className="block">
                    <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-white/40">
                      Web URL
                    </div>
                    <input
                      className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                      onChange={(event) =>
                        updateStoryboardDefaultRunTarget(
                          event.currentTarget.value,
                        )
                      }
                      placeholder={
                        storyboardDefaultRunUrl ||
                        "https://app.example.test/path"
                      }
                      value={storyboardDefaultRunUrl}
                    />
                  </label>
                  <button
                    className="rounded border border-cyan-300/35 bg-cyan-300/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-200 disabled:opacity-50"
                    disabled={!isConnected || !storyboardDefaultRunUrl}
                    onClick={() =>
                      openRunTargetHealth(
                        "storyboard:default",
                        "Storyboard default run target",
                        storyboardDefaultRunUrl,
                      )
                    }
                    type="button"
                  >
                    Run Target Health
                  </button>
                </div>
                <div className="space-y-3 rounded border border-cyan-300/15 bg-cyan-300/5 p-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.14em] text-cyan-100/70">
                      Run targets
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      Optional per-size overrides. Leave these blank to use the
                      storyboard default target.
                    </div>
                  </div>
                  <label className="block">
                    <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-white/40">
                      Capture set
                    </div>
                    <select
                      className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                      onChange={(event) =>
                        setActiveCaptureSetId(event.currentTarget.value)
                      }
                      value={activeCaptureSetId}
                    >
                      {storyboardInspectorCaptureSetIds.map((captureSetId) => (
                        <option key={captureSetId} value={captureSetId}>
                          {document.captureSets?.[captureSetId]?.label ??
                            captureSetId}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(["desktop", "mobile", "square"] as OutputVariantId[]).map(
                    (outputVariantId) => {
                      const size = selectedCaptureSizes[outputVariantId]
                      const runUrl = normalizeWebRunTargetUrl(
                        size?.runTarget?.kind === "web"
                          ? size.runTarget.url
                          : "",
                      )
                      const dimensions =
                        size?.width && size?.height
                          ? `${size.width} × ${size.height}`
                          : outputVariantId === "desktop"
                            ? "1440 × 900"
                            : outputVariantId === "mobile"
                              ? "390 × 844"
                              : "1024 × 1024"
                      return (
                        <div
                          className="rounded border border-white/10 bg-black/25 p-3"
                          key={outputVariantId}
                        >
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
                                {outputVariantId}
                              </div>
                              <div className="mt-1 text-[11px] text-white/40">
                                {dimensions}
                              </div>
                            </div>
                            {runUrl ? (
                              <div className="rounded border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-emerald-100">
                                web
                              </div>
                            ) : storyboardDefaultRunUrl ? (
                              <div className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-cyan-100">
                                default
                              </div>
                            ) : (
                              <div className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/35">
                                no target
                              </div>
                            )}
                          </div>
                          <label className="block">
                            <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-white/40">
                              Web URL
                            </div>
                            <input
                              className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                              onChange={(event) =>
                                updateCaptureSizeWebUrl(
                                  activeCaptureSetId,
                                  outputVariantId,
                                  event.currentTarget.value,
                                )
                              }
                              placeholder={
                                storyboardDefaultRunUrl ||
                                "https://app.example.test/path"
                              }
                              value={runUrl}
                            />
                          </label>
                          <button
                            className="mt-2 rounded border border-cyan-300/35 bg-cyan-300/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-200 disabled:opacity-50"
                            disabled={
                              !isConnected ||
                              !(runUrl || storyboardDefaultRunUrl)
                            }
                            onClick={() =>
                              openRunTargetHealth(
                                runUrl
                                  ? `storyboard:${activeCaptureSetId}:${outputVariantId}`
                                  : "storyboard:default",
                                `${activeCaptureSetId} ${outputVariantId} run target`,
                                runUrl || storyboardDefaultRunUrl,
                              )
                            }
                            type="button"
                          >
                            Run Target Health
                          </button>
                        </div>
                      )
                    },
                  )}
                </div>
              </div>
            ) : null}

            {selected?.kind === "story" && selectedStory ? (
              <div className="space-y-4">
                <div className="flex justify-end">
                  {renderStoryDeleteButton(
                    selectedStory.id,
                    selectedStory.title,
                    `story-inspector:${selectedStory.id}`,
                    "flex h-8 w-8 items-center justify-center rounded border border-white/10 text-white/60 transition hover:border-rose-300/40 hover:text-rose-100",
                  )}
                </div>
                <label className="block">
                  <div className="mb-2 text-xs uppercase tracking-[0.14em] text-white/45">
                    Story title
                  </div>
                  <input
                    className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                    onChange={(event) =>
                      updateCurrentStoryTitle(event.currentTarget.value)
                    }
                    value={selectedStory.title}
                  />
                </label>
                <label className="block">
                  <div className="mb-2 text-xs uppercase tracking-[0.14em] text-white/45">
                    Notes
                  </div>
                  <textarea
                    className="min-h-[140px] w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                    onChange={(event) =>
                      updateCurrentStory((story) => ({
                        ...story,
                        notes: event.currentTarget.value || undefined,
                      }))
                    }
                    value={selectedStory.notes ?? ""}
                  />
                </label>
                <div className="rounded border border-white/10 bg-white/5 p-3">
                  <div className="mb-2 text-xs uppercase tracking-[0.14em] text-white/45">
                    First frame
                  </div>
                  {selectedStory.frames[0] ? (
                    <button
                      className="block w-full rounded border border-white/10 bg-black/30 px-3 py-3 text-left transition hover:border-cyan-300/40 hover:bg-cyan-200/5"
                      onClick={() => {
                        setFocusedTransitionId(null)
                        setSelected({
                          kind: "frame",
                          storyId: selectedStory.id,
                          frameId: selectedStory.frames[0].id,
                        })
                      }}
                      type="button"
                    >
                      <div className="text-sm font-medium text-white">
                        {selectedStory.frames[0].title}
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        Open the first frame in the frame inspector.
                      </div>
                    </button>
                  ) : (
                    <div className="rounded border border-white/10 bg-black/30 px-3 py-3 text-sm text-white/45">
                      No first frame yet.
                    </div>
                  )}
                </div>
                <div className="rounded border border-white/10 bg-white/5 p-3 text-xs text-white/55">
                  {selectedStory.frames.length} main frames,{" "}
                  {(selectedStory.branches ?? []).length} branch rows
                </div>
              </div>
            ) : null}

            {selected?.kind === "frame" && selectedFrame ? (
              <div className="space-y-4">
                <label className="block">
                  <div className="mb-2 text-xs uppercase tracking-[0.14em] text-white/45">
                    Frame title
                  </div>
                  <textarea
                    className="min-h-[96px] w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                    onChange={(event) =>
                      updateCurrentFrame((frame) => ({
                        ...frame,
                        title: event.currentTarget.value,
                      }))
                    }
                    value={selectedFrame.title}
                  />
                </label>

                <label className="block">
                  <div className="mb-2 text-xs uppercase tracking-[0.14em] text-white/45">
                    Visual description
                  </div>
                  <textarea
                    className="min-h-[140px] w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                    onChange={(event) =>
                      updateCurrentFrame((frame) => ({
                        ...frame,
                        description: event.currentTarget.value || undefined,
                      }))
                    }
                    value={selectedFrame.description ?? ""}
                  />
                </label>

                <label className="block">
                  <div className="mb-2 text-xs uppercase tracking-[0.14em] text-white/45">
                    Notes
                  </div>
                  <textarea
                    className="min-h-[140px] w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                    onChange={(event) =>
                      updateCurrentFrame((frame) => ({
                        ...frame,
                        notes: event.currentTarget.value || undefined,
                      }))
                    }
                    value={selectedFrame.notes ?? ""}
                  />
                </label>

                <div className="space-y-3 rounded border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs uppercase tracking-[0.14em] text-white/45">
                      Capture sets
                    </div>
                    <button
                      aria-label="Add capture set"
                      className="flex h-7 w-7 items-center justify-center rounded border border-white/10 text-white/70 transition hover:border-cyan-300/40 hover:text-cyan-100"
                      onClick={addCaptureSet}
                      title="Add capture set"
                      type="button"
                    >
                      <PlusIcon />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {selectedFrameCaptureSetIds.map((captureSetId) => (
                      <button
                        className={
                          captureSetId === activeCaptureSetId
                            ? "rounded border border-cyan-300/40 bg-cyan-300/10 px-2 py-1 text-xs uppercase tracking-[0.14em] text-cyan-100"
                            : "rounded border border-white/10 bg-black/30 px-2 py-1 text-xs uppercase tracking-[0.14em] text-white/55 transition hover:border-cyan-300/30 hover:text-cyan-100"
                        }
                        key={captureSetId}
                        onClick={() => setActiveCaptureSetId(captureSetId)}
                        type="button"
                      >
                        {captureSetId}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-end gap-3">
                    <label className="block min-w-0 flex-1">
                      <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-white/40">
                        Capture set name
                      </div>
                      <input
                        className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                        onChange={(event) =>
                          renameActiveCaptureSet(event.currentTarget.value)
                        }
                        value={activeCaptureSetId}
                      />
                    </label>
                    {selectedFrameCaptureSetIds.length > 1 ? (
                      <button
                        aria-label="Remove capture set"
                        className="flex h-9 w-9 items-center justify-center rounded border border-white/10 text-white/60 transition hover:border-rose-300/40 hover:text-rose-100"
                        onClick={removeActiveCaptureSet}
                        title="Remove capture set"
                        type="button"
                      >
                        <TrashIcon />
                      </button>
                    ) : null}
                  </div>

                  <div className="grid gap-3 xl:grid-cols-3">
                    <label className="block">
                      <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-white/40">
                        Desktop
                      </div>
                      <input
                        className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                        onChange={(event) =>
                          updateCurrentFrame((frame) => ({
                            ...frame,
                            captureSets: {
                              ...(frame.captureSets ?? {}),
                              [activeCaptureSetId]: {
                                ...(frame.captureSets?.[activeCaptureSetId] ??
                                  {}),
                                screenshots: {
                                  ...(frame.captureSets?.[activeCaptureSetId]
                                    ?.screenshots ?? {}),
                                  desktop:
                                    event.currentTarget.value || undefined,
                                },
                              },
                            },
                            screenshots: undefined,
                          }))
                        }
                        placeholder="./assets/frame-001.desktop.png"
                        value={selectedFrameCapture.screenshots?.desktop ?? ""}
                      />
                      <div className="mt-2 h-28 overflow-hidden rounded border border-white/10 bg-black/20">
                        <AssetPreview
                          alt={selectedFrame.title + " desktop preview"}
                          src={selectedFrameScreenshotUrls.desktop}
                        />
                      </div>
                    </label>

                    <label className="block">
                      <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-white/40">
                        Mobile
                      </div>
                      <input
                        className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                        onChange={(event) =>
                          updateCurrentFrame((frame) => ({
                            ...frame,
                            captureSets: {
                              ...(frame.captureSets ?? {}),
                              [activeCaptureSetId]: {
                                ...(frame.captureSets?.[activeCaptureSetId] ??
                                  {}),
                                screenshots: {
                                  ...(frame.captureSets?.[activeCaptureSetId]
                                    ?.screenshots ?? {}),
                                  mobile:
                                    event.currentTarget.value || undefined,
                                },
                              },
                            },
                            screenshots: undefined,
                          }))
                        }
                        placeholder="./assets/frame-001.mobile.png"
                        value={selectedFrameCapture.screenshots?.mobile ?? ""}
                      />
                      <div className="mt-2 h-28 overflow-hidden rounded border border-white/10 bg-black/20">
                        <AssetPreview
                          alt={selectedFrame.title + " mobile preview"}
                          src={selectedFrameScreenshotUrls.mobile}
                        />
                      </div>
                    </label>

                    <label className="block">
                      <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-white/40">
                        Square
                      </div>
                      <input
                        className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                        onChange={(event) =>
                          updateCurrentFrame((frame) => ({
                            ...frame,
                            captureSets: {
                              ...(frame.captureSets ?? {}),
                              [activeCaptureSetId]: {
                                ...(frame.captureSets?.[activeCaptureSetId] ??
                                  {}),
                                screenshots: {
                                  ...(frame.captureSets?.[activeCaptureSetId]
                                    ?.screenshots ?? {}),
                                  square:
                                    event.currentTarget.value || undefined,
                                },
                              },
                            },
                            screenshots: undefined,
                          }))
                        }
                        placeholder="./assets/frame-001.square.png"
                        value={selectedFrameCapture.screenshots?.square ?? ""}
                      />
                      <div className="mt-2 h-28 overflow-hidden rounded border border-white/10 bg-black/20">
                        <AssetPreview
                          alt={selectedFrame.title + " square preview"}
                          src={selectedFrameScreenshotUrls.square}
                        />
                      </div>
                    </label>
                  </div>
                </div>

                <div className="space-y-3 rounded border border-cyan-300/15 bg-cyan-300/5 p-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.14em] text-cyan-100/70">
                      Run targets
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      Optional per-size overrides. Leave these blank to use the
                      storyboard default target.
                    </div>
                  </div>
                  {(["desktop", "mobile", "square"] as OutputVariantId[]).map(
                    (outputVariantId) => {
                      const size = selectedCaptureSizes[outputVariantId]
                      const runUrl = normalizeWebRunTargetUrl(
                        size?.runTarget?.kind === "web"
                          ? size.runTarget.url
                          : "",
                      )
                      const dimensions =
                        size?.width && size?.height
                          ? `${size.width} × ${size.height}`
                          : outputVariantId === "desktop"
                            ? "1440 × 900"
                            : outputVariantId === "mobile"
                              ? "390 × 844"
                              : "1024 × 1024"
                      return (
                        <div
                          className="rounded border border-white/10 bg-black/25 p-3"
                          key={outputVariantId}
                        >
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
                                {outputVariantId}
                              </div>
                              <div className="mt-1 text-[11px] text-white/40">
                                {dimensions}
                              </div>
                            </div>
                            {runUrl ? (
                              <div className="rounded border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-emerald-100">
                                web
                              </div>
                            ) : storyboardDefaultRunUrl ? (
                              <div className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-cyan-100">
                                default
                              </div>
                            ) : (
                              <div className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/35">
                                no target
                              </div>
                            )}
                          </div>
                          <label className="block">
                            <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-white/40">
                              Web URL
                            </div>
                            <input
                              className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                              onChange={(event) =>
                                updateCaptureSizeWebUrl(
                                  activeCaptureSetId,
                                  outputVariantId,
                                  event.currentTarget.value,
                                )
                              }
                              placeholder={
                                storyboardDefaultRunUrl ||
                                "https://app.example.test/path"
                              }
                              value={runUrl}
                            />
                          </label>
                          <button
                            className="mt-2 rounded border border-cyan-300/35 bg-cyan-300/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-200 disabled:opacity-50"
                            disabled={
                              !isConnected ||
                              !(runUrl || storyboardDefaultRunUrl)
                            }
                            onClick={() =>
                              openRunTargetHealth(
                                runUrl
                                  ? `storyboard:${activeCaptureSetId}:${outputVariantId}`
                                  : "storyboard:default",
                                `${activeCaptureSetId} ${outputVariantId} run target`,
                                runUrl || storyboardDefaultRunUrl,
                              )
                            }
                            type="button"
                          >
                            Run Target Health
                          </button>
                        </div>
                      )
                    },
                  )}
                </div>
                {selectedBranch ? (
                  <label className="block">
                    <div className="mb-2 text-xs uppercase tracking-[0.14em] text-white/45">
                      Branch label
                    </div>
                    <input
                      className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                      onChange={(event) =>
                        updateCurrentBranchLabel(event.currentTarget.value)
                      }
                      value={selectedBranch.label}
                    />
                  </label>
                ) : null}

                <div className="space-y-3 rounded border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs uppercase tracking-[0.14em] text-white/45">
                      Transitions
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        aria-label="Add transition"
                        className="flex h-7 w-7 items-center justify-center rounded border border-white/10 text-white/70 transition hover:border-cyan-300/40 hover:text-cyan-100"
                        onClick={addTransition}
                        title={
                          selectedFrameTransitions.length === 0
                            ? "Add next transition"
                            : "Add transition"
                        }
                        type="button"
                      >
                        <PlusIcon />
                      </button>
                    </div>
                  </div>
                  {selectedFrameTransitions.length > 0 ? (
                    selectedFrameTransitions.map((transition, index) => (
                      <div
                        className={`space-y-2 rounded border bg-black/20 p-3 ${
                          focusedTransitionId === transition.id
                            ? "border-cyan-300/50 shadow-[0_0_0_1px_rgba(103,232,249,0.35)]"
                            : "border-white/10"
                        }`}
                        data-transition-editor={transition.id}
                        key={transition.id}
                        ref={(node) => {
                          transitionRefs.current[transition.id] = node
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[11px] uppercase tracking-[0.14em] text-white/35">
                            {index === 0
                              ? "Primary transition"
                              : `Side transition ${index}`}
                          </div>
                          {renderTransitionDeleteButton(
                            transition.id,
                            `transition:${selectedFrame.id}:${transition.id}`,
                            index === 0 && selectedFrameTransitions.length > 1,
                            "Delete side transitions first so the main path stays coherent",
                          )}
                        </div>
                        <label className="block">
                          <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-white/40">
                            Label
                          </div>
                          <input
                            className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                            onChange={(event) =>
                              updateCurrentTransition(
                                transition.id,
                                (current) => ({
                                  ...current,
                                  label: event.currentTarget.value,
                                }),
                              )
                            }
                            value={transition.label}
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="block">
                            <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-white/40">
                              Kind
                            </div>
                            <select
                              className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                              onChange={(event) =>
                                updateCurrentTransition(
                                  transition.id,
                                  (current) => ({
                                    ...current,
                                    kind: event.currentTarget
                                      .value as StoryboardTransitionRecord["kind"],
                                  }),
                                )
                              }
                              value={transition.kind}
                            >
                              <option value="user">user</option>
                              <option value="system">system</option>
                            </select>
                          </label>
                          <label className="block">
                            <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-white/40">
                              Target frame
                            </div>
                            <select
                              className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                              onChange={(event) =>
                                updateCurrentTransition(
                                  transition.id,
                                  (current) => ({
                                    ...current,
                                    targetFrameId: event.currentTarget.value,
                                  }),
                                )
                              }
                              value={transition.targetFrameId}
                            >
                              {storyFrameOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.title}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-white/45">
                      No transitions yet for this frame.
                    </div>
                  )}
                  <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
                    <button
                      aria-label="Add transition"
                      className="flex h-7 w-7 items-center justify-center rounded border border-white/10 text-white/70 transition hover:border-cyan-300/40 hover:text-cyan-100"
                      onClick={addTransition}
                      title={
                        selectedFrameTransitions.length === 0
                          ? "Add next transition"
                          : "Add transition"
                      }
                      type="button"
                    >
                      <PlusIcon />
                    </button>
                  </div>
                </div>

                <div className="rounded border border-white/10 bg-white/5 p-3 text-xs text-white/55">
                  <div>Story: {selectedStory?.title ?? "-"}</div>
                  <div>Frame id: {selectedFrame.id}</div>
                  {selectedBranch?.sourceFrameId ? (
                    <div>Branch source: {selectedBranch.sourceFrameId}</div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {snapshotJob ? (
              <div className="rounded border border-white/10 bg-white/5 p-3 text-xs text-white/55">
                Snapshot job: {snapshotJob.status}
              </div>
            ) : null}
          </div>
        </div>
      ),
    }),
    [
      activeCaptureSetId,
      document,
      filteredStories,
      pendingDeleteStory,
      pendingDeleteTransition,
      runQueue,
      runTargetHealth,
      selected,
      selectedBranch,
      selectedCaptureSizes,
      selectedFrame,
      selectedFrameCaptureSetIds,
      selectedFrameScreenshotUrls.desktop,
      selectedFrameScreenshotUrls.mobile,
      selectedFrameScreenshotUrls.square,
      selectedFrameTransitions,
      selectedStory,
      snapshotJob,
      storyboardDefaultRunUrl,
      storyboardInspectorCaptureSetIds,
      storyFrameOptions,
      storySearch,
    ],
  )

  function updateCurrentStory(
    updater: (story: StoryboardStoryRecord) => StoryboardStoryRecord,
  ) {
    if (!document || !selected || selected.kind !== "story") {
      return
    }
    setDocument(updateStory(document, selected.storyId, updater))
  }

  function updateCurrentStoryTitle(value: string) {
    updateCurrentStory((story) => ({
      ...story,
      title: value,
    }))
  }

  function addStory() {
    const storyId = storyboardRecordId("story")
    const firstFrameId = storyboardRecordId(`${storyId}-frame`)
    const nextStory: StoryboardStoryRecord = {
      id: storyId,
      title: "Untitled story",
      notes: "",
      frames: [
        {
          id: firstFrameId,
          title: "Starting frame",
          description: "Describe the first visible state for this story.",
          notes: "",
          transitions: [],
        },
      ],
      branches: [],
    }
    setDocument((current) =>
      current
        ? {
            ...current,
            stories: [...current.stories, nextStory],
          }
        : current,
    )
    setFocusedTransitionId(null)
    setPendingDeleteStory(null)
    setSelected({ kind: "story", storyId })
    setStorySearch("")
  }

  function requestDeleteStory(storyId: string, anchorKey: string) {
    setPendingDeleteStory((current) =>
      current && current.storyId === storyId && current.anchorKey === anchorKey
        ? null
        : { storyId, anchorKey },
    )
  }

  function confirmDeleteStory(storyId: string) {
    setPendingDeleteStory(null)
    deleteStory(storyId)
  }

  function deleteStory(storyId: string) {
    setDocument((current) => {
      if (!current) {
        return current
      }
      const nextStories = current.stories.filter(
        (story) => story.id !== storyId,
      )
      if (nextStories.length === current.stories.length) {
        return current
      }
      return {
        ...current,
        stories: nextStories,
      }
    })
    setFocusedTransitionId(null)
    setPendingDeleteStory(null)
    setPendingDeleteTransition(null)
    setSelected((current) => {
      if (!current) {
        return { kind: "storyboard" }
      }
      if (current.kind === "storyboard") {
        return current
      }
      if (current.storyId === storyId) {
        return { kind: "storyboard" }
      }
      return current
    })
  }

  function renderStoryDeleteButton(
    storyId: string,
    storyTitle: string,
    anchorKey: string,
    buttonClassName = "flex h-7 w-7 items-center justify-center rounded border border-white/10 text-white/60 transition hover:border-rose-300/40 hover:text-rose-100",
  ) {
    const confirming =
      pendingDeleteStory?.storyId === storyId &&
      pendingDeleteStory.anchorKey === anchorKey

    return (
      <div className="relative flex-none">
        <button
          aria-label={`Delete ${storyTitle}`}
          className={buttonClassName}
          onClick={() => requestDeleteStory(storyId, anchorKey)}
          title="Delete story"
          type="button"
        >
          <TrashIcon />
        </button>
        {confirming ? (
          <div className="absolute right-0 top-full z-30 mt-2 w-44 rounded border border-rose-300/30 bg-zinc-950/98 p-2 shadow-[0_12px_28px_rgba(0,0,0,0.42)]">
            <div className="text-xs text-white/75">Delete this story?</div>
            <div className="mt-2 flex justify-end gap-2">
              <button
                className="rounded border border-white/10 px-2 py-1 text-[11px] text-white/70 transition hover:border-white/20 hover:text-white"
                onClick={() => setPendingDeleteStory(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded border border-rose-300/30 bg-rose-300/10 px-2 py-1 text-[11px] text-rose-100 transition hover:border-rose-200/50 hover:bg-rose-300/15"
                onClick={() => confirmDeleteStory(storyId)}
                type="button"
              >
                Delete
              </button>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  function requestDeleteTransition(transitionId: string, anchorKey: string) {
    setPendingDeleteTransition((current) =>
      current &&
      current.transitionId === transitionId &&
      current.anchorKey === anchorKey
        ? null
        : { transitionId, anchorKey },
    )
  }

  function confirmDeleteTransition(transitionId: string) {
    setPendingDeleteTransition(null)
    deleteTransition(transitionId)
  }

  function renderTransitionDeleteButton(
    transitionId: string,
    anchorKey: string,
    disabled: boolean,
    disabledTitle: string,
  ) {
    const confirming =
      pendingDeleteTransition?.transitionId === transitionId &&
      pendingDeleteTransition.anchorKey === anchorKey

    return (
      <div className="relative flex-none">
        <button
          aria-label="Delete transition"
          className="flex h-7 w-7 items-center justify-center rounded border border-white/10 text-white/60 transition hover:border-rose-300/40 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={disabled}
          onClick={() => requestDeleteTransition(transitionId, anchorKey)}
          title={disabled ? disabledTitle : "Delete transition"}
          type="button"
        >
          <TrashIcon />
        </button>
        {confirming ? (
          <div className="absolute right-0 top-full z-30 mt-2 w-44 rounded border border-rose-300/30 bg-zinc-950/98 p-2 shadow-[0_12px_28px_rgba(0,0,0,0.42)]">
            <div className="text-xs text-white/75">Delete this transition?</div>
            <div className="mt-2 flex justify-end gap-2">
              <button
                className="rounded border border-white/10 px-2 py-1 text-[11px] text-white/70 transition hover:border-white/20 hover:text-white"
                onClick={() => setPendingDeleteTransition(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded border border-rose-300/30 bg-rose-300/10 px-2 py-1 text-[11px] text-rose-100 transition hover:border-rose-200/50 hover:bg-rose-300/15"
                onClick={() => confirmDeleteTransition(transitionId)}
                type="button"
              >
                Delete
              </button>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  function updateCurrentFrame(
    updater: (frame: StoryboardFrameRecord) => StoryboardFrameRecord,
  ) {
    if (!document || !selected || selected.kind !== "frame") {
      return
    }
    setDocument(
      updateStory(document, selected.storyId, (story) => {
        if (selected.branchId) {
          return {
            ...story,
            branches: (story.branches ?? []).map((branch) =>
              branch.id === selected.branchId
                ? {
                    ...branch,
                    frames: branch.frames.map((frame) =>
                      frame.id === selected.frameId ? updater(frame) : frame,
                    ),
                  }
                : branch,
            ),
          }
        }
        return {
          ...story,
          frames: story.frames.map((frame) =>
            frame.id === selected.frameId ? updater(frame) : frame,
          ),
        }
      }),
    )
  }

  function updateCurrentTransition(
    transitionId: string,
    updater: (
      transition: StoryboardTransitionRecord,
    ) => StoryboardTransitionRecord,
  ) {
    updateCurrentFrame((frame) => ({
      ...frame,
      transitions: (frame.transitions ?? []).map((transition) =>
        transition.id === transitionId ? updater(transition) : transition,
      ),
    }))
  }

  function updateStoryboardDefaultRunTarget(rawUrl: string) {
    const url = rawUrl.trim()
    setDocument((current) => {
      if (!current) {
        return current
      }
      return {
        ...current,
        runTarget: url
          ? ({ kind: "web", url } satisfies StoryboardRunTargetWeb)
          : undefined,
      }
    })
  }

  function updateCaptureSizeWebUrl(
    captureSetId: string,
    outputVariantId: OutputVariantId,
    rawUrl: string,
  ) {
    if (!document) {
      return
    }
    const url = rawUrl.trim()
    const captureSets = { ...(document.captureSets ?? {}) }
    const captureSet = { ...(captureSets[captureSetId] ?? {}) }
    const sizes = { ...(captureSet.sizes ?? {}) }
    const currentSize = { ...(sizes[outputVariantId] ?? {}) }
    if (url) {
      sizes[outputVariantId] = {
        ...currentSize,
        runTarget: {
          kind: "web",
          url,
        },
      }
    } else {
      const { runTarget: _runTarget, ...rest } = currentSize
      if (Object.keys(rest).length > 0) {
        sizes[outputVariantId] = rest
      } else {
        delete sizes[outputVariantId]
      }
    }
    captureSets[captureSetId] = {
      ...captureSet,
      sizes,
    }
    setDocument({
      ...document,
      captureSets,
    })
  }

  function addCaptureSet() {
    if (!document || !selected || selected.kind !== "frame" || !selectedFrame) {
      return
    }
    const nextId = nextCaptureSetId(selectedFrame)
    setDocument({
      ...updateStory(document, selected.storyId, (story) => {
        const updateFrame = (frame: StoryboardFrameRecord) =>
          frame.id === selected.frameId
            ? {
                ...frame,
                captureSets: {
                  ...(frame.captureSets ?? {}),
                  [nextId]: {
                    screenshots: {},
                  },
                },
                screenshots: undefined,
              }
            : frame
        if (selected.branchId) {
          return {
            ...story,
            branches: (story.branches ?? []).map((branch) =>
              branch.id === selected.branchId
                ? { ...branch, frames: branch.frames.map(updateFrame) }
                : branch,
            ),
          }
        }
        return {
          ...story,
          frames: story.frames.map(updateFrame),
        }
      }),
      captureSets: {
        ...(document.captureSets ?? {}),
        [nextId]: { label: nextId, sizes: {} },
      },
    })
    setActiveCaptureSetId(nextId)
  }

  function renameActiveCaptureSet(nextIdRaw: string) {
    if (!selectedFrame) {
      return
    }
    const nextId = nextIdRaw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
    if (!nextId || nextId === activeCaptureSetId) {
      return
    }
    if (selectedFrameCaptureSetIds.includes(nextId)) {
      return
    }
    updateCurrentFrame((frame) => {
      const captureSets = { ...(frame.captureSets ?? {}) }
      const current = captureSets[activeCaptureSetId]
      if (!current) {
        return frame
      }
      delete captureSets[activeCaptureSetId]
      const reordered = Object.fromEntries([
        ...Object.entries(captureSets),
        [nextId, current],
      ])
      return {
        ...frame,
        captureSets: reordered,
        screenshots: undefined,
      }
    })
    setDocument((current) => {
      if (!current?.captureSets?.[activeCaptureSetId]) return current
      const captureSets = { ...current.captureSets }
      const currentCaptureSet = captureSets[activeCaptureSetId]
      delete captureSets[activeCaptureSetId]
      return {
        ...current,
        captureSets: Object.fromEntries([
          ...Object.entries(captureSets),
          [nextId, currentCaptureSet],
        ]),
      }
    })
    setActiveCaptureSetId(nextId)
  }

  function removeActiveCaptureSet() {
    if (!selectedFrame || selectedFrameCaptureSetIds.length <= 1) {
      return
    }
    const remainingIds = selectedFrameCaptureSetIds.filter(
      (id) => id !== activeCaptureSetId,
    )
    updateCurrentFrame((frame) => {
      const captureSets = { ...(frame.captureSets ?? {}) }
      delete captureSets[activeCaptureSetId]
      return {
        ...frame,
        captureSets,
        screenshots: undefined,
      }
    })
    setDocument((current) => {
      if (!current?.captureSets?.[activeCaptureSetId]) return current
      const captureSets = { ...current.captureSets }
      delete captureSets[activeCaptureSetId]
      return {
        ...current,
        captureSets,
      }
    })
    setActiveCaptureSetId(
      remainingIds.includes("default")
        ? "default"
        : (remainingIds[0] ?? "default"),
    )
  }

  function updateCurrentBranchLabel(value: string) {
    if (
      !document ||
      !selected ||
      selected.kind !== "frame" ||
      !selected.branchId
    ) {
      return
    }
    setDocument(
      updateStory(document, selected.storyId, (story) => ({
        ...story,
        branches: (story.branches ?? []).map((branch) =>
          branch.id === selected.branchId
            ? { ...branch, label: value }
            : branch,
        ),
      })),
    )
  }

  function addTransition() {
    if (!document || !selected || selected.kind !== "frame" || !selectedFrame) {
      return
    }

    const currentRowFrames =
      selectedBranch?.frames ?? selectedStory?.frames ?? []
    const sourceIndex = currentRowFrames.findIndex(
      (frame) => frame.id === selected.frameId,
    )
    const inlineNextFrameId =
      sourceIndex >= 0 ? currentRowFrames[sourceIndex + 1]?.id : undefined
    const primaryTargetFrameId = selectedFrameTransitions[0]?.targetFrameId
    const hasInlineNext =
      !!inlineNextFrameId && primaryTargetFrameId === inlineNextFrameId

    if (!hasInlineNext) {
      const targetFrameId = storyboardRecordId(`${selectedFrame.id}-next-frame`)
      const transitionId = storyboardRecordId(`${selectedFrame.id}-transition`)
      setDocument(
        updateStory(document, selected.storyId, (story) => {
          if (selected.branchId) {
            return {
              ...story,
              branches: (story.branches ?? []).map((branch) => {
                if (branch.id !== selected.branchId) {
                  return branch
                }

                const sourceIndex = branch.frames.findIndex(
                  (frame) => frame.id === selected.frameId,
                )
                const nextFrames = [...branch.frames]
                nextFrames.splice(sourceIndex + 1, 0, {
                  id: targetFrameId,
                  title: "New next frame",
                  description:
                    "Describe the resulting state for this transition.",
                  transitions: [],
                })

                return {
                  ...branch,
                  frames: nextFrames.map((frame) =>
                    frame.id === selected.frameId
                      ? {
                          ...frame,
                          transitions: [
                            {
                              id: transitionId,
                              label: "Next",
                              kind: "user",
                              targetFrameId,
                            },
                            ...(frame.transitions ?? []),
                          ],
                        }
                      : frame,
                  ),
                }
              }),
            }
          }

          const sourceIndex = story.frames.findIndex(
            (frame) => frame.id === selected.frameId,
          )
          const nextFrames = [...story.frames]
          nextFrames.splice(sourceIndex + 1, 0, {
            id: targetFrameId,
            title: "New next frame",
            description: "Describe the resulting state for this transition.",
            transitions: [],
          })

          return {
            ...story,
            frames: nextFrames.map((frame) =>
              frame.id === selected.frameId
                ? {
                    ...frame,
                    transitions: [
                      {
                        id: transitionId,
                        label: "Next",
                        kind: "user",
                        targetFrameId,
                      },
                      ...(frame.transitions ?? []),
                    ],
                  }
                : frame,
            ),
          }
        }),
      )
      return
    }

    const branchLabel = `Branch ${selectedFrameTransitions.length}`
    const targetFrameId = storyboardRecordId(`${selectedFrame.id}-branch-frame`)
    const branchId = storyboardRecordId(`${selectedFrame.id}-branch`)
    const transitionId = storyboardRecordId(`${selectedFrame.id}-transition`)

    setDocument(
      updateStory(document, selected.storyId, (story) => {
        const nextTransitions = [
          ...(selectedFrame.transitions ?? []),
          {
            id: transitionId,
            label: branchLabel,
            kind: "user" as const,
            targetFrameId,
          },
        ]

        const nextStory = selected.branchId
          ? {
              ...story,
              branches: (story.branches ?? []).map((branch) =>
                branch.id === selected.branchId
                  ? {
                      ...branch,
                      frames: branch.frames.map((frame) =>
                        frame.id === selected.frameId
                          ? { ...frame, transitions: nextTransitions }
                          : frame,
                      ),
                    }
                  : branch,
              ),
            }
          : {
              ...story,
              frames: story.frames.map((frame) =>
                frame.id === selected.frameId
                  ? { ...frame, transitions: nextTransitions }
                  : frame,
              ),
            }

        return {
          ...nextStory,
          branches: [
            ...(nextStory.branches ?? []),
            {
              id: branchId,
              label: branchLabel,
              sourceFrameId: selected.frameId,
              frames: [
                {
                  id: targetFrameId,
                  title: "New branch frame",
                  description: "Describe the resulting state for this branch.",
                  transitions: [],
                },
              ],
            },
          ],
        }
      }),
    )
  }

  function deleteTransition(transitionId: string) {
    if (!document || !selected || selected.kind !== "frame" || !selectedFrame) {
      return
    }

    const transitionIndex = selectedFrameTransitions.findIndex(
      (entry) => entry.id === transitionId,
    )
    const transition = selectedFrameTransitions[transitionIndex]
    if (!transition) {
      return
    }
    if (transitionIndex === 0 && selectedFrameTransitions.length > 1) {
      return
    }

    setDocument(
      updateStory(document, selected.storyId, (story) => {
        const nextStory = selected.branchId
          ? {
              ...story,
              branches: (story.branches ?? []).map((branch) =>
                branch.id === selected.branchId
                  ? {
                      ...branch,
                      frames: branch.frames.map((frame) =>
                        frame.id === selected.frameId
                          ? {
                              ...frame,
                              transitions: (frame.transitions ?? []).filter(
                                (entry) => entry.id !== transitionId,
                              ),
                            }
                          : frame,
                      ),
                    }
                  : branch,
              ),
            }
          : {
              ...story,
              frames: story.frames.map((frame) =>
                frame.id === selected.frameId
                  ? {
                      ...frame,
                      transitions: (frame.transitions ?? []).filter(
                        (entry) => entry.id !== transitionId,
                      ),
                    }
                  : frame,
              ),
            }

        return removeTransitionSubtree(nextStory, transition.targetFrameId)
      }),
    )

    if (focusedTransitionId === transitionId) {
      setFocusedTransitionId(null)
    }
  }

  function resolveTransitionSelection(
    sourceFrameId: string,
    label: string,
  ): TransitionSelection | null {
    for (const story of document?.stories ?? []) {
      const storyFrame = story.frames.find(
        (frame) => frame.id === sourceFrameId,
      )
      if (storyFrame) {
        const transitions = storyFrame.transitions ?? []
        const transition =
          transitions.find((entry) => entry.label === label) ?? transitions[0]
        return transition
          ? {
              transitionId: transition.id,
              selected: {
                kind: "frame",
                storyId: story.id,
                frameId: storyFrame.id,
              },
            }
          : null
      }

      for (const branch of story.branches ?? []) {
        const branchFrame = branch.frames.find(
          (frame) => frame.id === sourceFrameId,
        )
        if (!branchFrame) {
          continue
        }
        const transitions = branchFrame.transitions ?? []
        const transition =
          transitions.find((entry) => entry.label === label) ?? transitions[0]
        return transition
          ? {
              transitionId: transition.id,
              selected: {
                kind: "frame",
                storyId: story.id,
                frameId: branchFrame.id,
                branchId: branch.id,
              },
            }
          : null
      }
    }

    return null
  }

  useEffect(() => {
    if (!focusedTransitionId) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      transitionRefs.current[focusedTransitionId]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [focusedTransitionId, selectedFrameTransitions])

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-black text-white"
      data-storyboard-debug-capture-root="true"
    >
      <header className="flex flex-none flex-col gap-2 border-b border-white/10 bg-zinc-950 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-white/40">
            Storyboard URL
          </div>
          <input
            className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-cyan-100 outline-none focus:border-cyan-400"
            onChange={(event) =>
              setDraftStoryboardUrl(event.currentTarget.value)
            }
            placeholder="Storyboard URL"
            value={draftStoryboardUrl}
          />
          <button
            aria-label="Connect storyboard URL"
            className="flex h-8 w-8 items-center justify-center rounded border border-white/15 text-white/80 transition hover:border-cyan-300/70 hover:text-cyan-100"
            onClick={() =>
              setConnectedStoryboardUrl(
                draftStoryboardUrl.trim() || source.storyboardUrl,
              )
            }
            title="Connect storyboard URL"
            type="button"
          >
            <ArrowRightIcon />
          </button>
        </div>
        {isConnected ? (
          <div className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
              <div className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-white/40">
                Storyboard editor
              </div>
              <div className="text-[11px] text-white/50">
                {isAccessServerRootMode
                  ? `${storyboardList.length} storyboards`
                  : `${storyCount} stories · ${frameCount} frames`}
              </div>
              {headerStatus ? (
                <div className="text-[11px] text-amber-200/80">
                  {headerStatus}
                </div>
              ) : null}
              <div
                className="rounded border border-amber-200/20 bg-amber-300/10 px-2 py-1 text-[11px] text-amber-100"
                data-run-queue-indicator="true"
              >
                Run queue:{" "}
                {runQueue
                  ? `${runQueue.active} running · ${runQueue.queued} queued`
                  : `${activeVariantRunStates.length} pending`}
              </div>
              {!isAccessServerRootMode ? (
                <a
                  className={`rounded border px-2 py-1 text-[11px] ${storyboardHealthStatusClass(storyboardHealthBadge.status)}`}
                  data-storyboard-health-badge="true"
                  href={storyboardHealthViewHref(connectedStoryboardUrl)}
                  title={
                    storyboardHealthBadge.error ??
                    `Last checked ${storyboardHealthBadge.checkedAt ?? "never"}`
                  }
                >
                  Health:{" "}
                  {storyboardHealthBadge.loading
                    ? "checking…"
                    : storyboardHealthBadge.status}{" "}
                  ·{" "}
                  {storyboardHealthCheckedLabel(
                    storyboardHealthBadge.checkedAt,
                  )}{" "}
                  · View in Health
                </a>
              ) : null}
              {visibleVariantRunStates.length > 0 ? (
                <div
                  className="flex max-w-full flex-wrap gap-1"
                  data-run-queue-list="true"
                >
                  {visibleVariantRunStates.map((state) => (
                    <span
                      className="rounded border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-white/65"
                      key={state.key}
                    >
                      {state.outputVariantId} {humanRunStatus(state.status)}{" "}
                      {state.jobId ? state.jobId : "pending"}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {!isAccessServerRootMode ? (
                <button
                  className="rounded border border-white/15 px-2.5 py-1.5 text-xs text-white/80 transition hover:border-cyan-300/70 hover:text-cyan-100"
                  onClick={() => {
                    const accessServerUrl = storyboardAccessServerUrl(
                      connectedStoryboardUrl,
                    )
                    if (!accessServerUrl) {
                      return
                    }
                    setDraftStoryboardUrl(accessServerUrl)
                    setConnectedStoryboardUrl(accessServerUrl)
                  }}
                  type="button"
                >
                  Storyboards
                </button>
              ) : null}
              <button
                className="rounded border border-white/15 px-2.5 py-1.5 text-xs text-white/80 transition hover:border-cyan-300/70 hover:text-cyan-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30"
                disabled={!isConnected}
                onClick={() => void loadDocument()}
                type="button"
              >
                Reload
              </button>
              {!isAccessServerRootMode ? (
                <>
                  <button
                    className="rounded border border-white/15 px-2.5 py-1.5 text-xs text-white/80 transition hover:border-cyan-300/70 hover:text-cyan-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30"
                    disabled={!isConnected}
                    onClick={() => void importMarkdown()}
                    type="button"
                  >
                    Import markdown
                  </button>
                  <button
                    className="rounded border border-white/15 px-2.5 py-1.5 text-xs text-white/80 transition hover:border-cyan-300/70 hover:text-cyan-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30"
                    disabled={!document || !isConnected}
                    onClick={() =>
                      document ? void persistDocument(document) : undefined
                    }
                    type="button"
                  >
                    {saveState === "saving"
                      ? "Saving…"
                      : saveState === "saved"
                        ? "Saved"
                        : "Save now"}
                  </button>
                  <button
                    className="rounded border border-white/15 px-2.5 py-1.5 text-xs text-white/80 transition hover:border-cyan-300/70 hover:text-cyan-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30"
                    disabled={!isConnected}
                    onClick={() => void requestSnapshotRun()}
                    type="button"
                  >
                    Run snapshots
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>

      {markdownImportError ? (
        <div className="flex items-start justify-between gap-3 border-b border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
          <div className="min-w-0 whitespace-pre-wrap">
            {markdownImportError}
          </div>
          <button
            aria-label="Copy markdown import error"
            className={
              markdownImportCopyState === "copied"
                ? "shrink-0 rounded border border-emerald-300/40 px-2 py-1 text-xs text-emerald-100"
                : markdownImportCopyState === "failed"
                  ? "shrink-0 rounded border border-rose-200/50 px-2 py-1 text-xs text-rose-100"
                  : "shrink-0 rounded border border-white/15 px-2 py-1 text-xs text-white/80 transition hover:border-cyan-300/70 hover:text-cyan-100"
            }
            onClick={() => void copyMarkdownImportError()}
            type="button"
          >
            {markdownImportCopyState === "copied"
              ? "Copied"
              : markdownImportCopyState === "failed"
                ? "Copy failed"
                : "Copy error"}
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {!isConnected ? (
          <div className="h-full w-full overflow-auto bg-zinc-950 p-6">
            <div className="mx-auto w-full max-w-5xl space-y-4 text-sm text-white/80">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                {isRemoteScenario
                  ? "Remote storyboard"
                  : "Storyboard connection"}
              </div>
              <div className="text-lg text-cyan-100">
                Connect a storyboard access server
              </div>
              <p className="leading-6 text-white/65">
                Start the Bun storyboard access server on a worker machine, then
                paste the returned storyboard URL above and click{" "}
                <span className="text-white">Connect</span>.
              </p>
              <div className="rounded border border-white/10 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">
                    Paste into worker agent chat
                  </div>
                  <button
                    aria-label="Copy worker agent prompt"
                    className={`flex h-8 w-8 items-center justify-center rounded border transition ${
                      workerPromptCopyState === "copied"
                        ? "border-emerald-300/40 text-emerald-100"
                        : workerPromptCopyState === "failed"
                          ? "border-rose-300/40 text-rose-100"
                          : "border-white/15 text-white/75 hover:border-cyan-300/70 hover:text-cyan-100"
                    }`}
                    onClick={() => void copyWorkerPrompt()}
                    title={
                      workerPromptCopyState === "copied"
                        ? "Copied prompt"
                        : workerPromptCopyState === "failed"
                          ? "Copy failed"
                          : "Copy worker prompt"
                    }
                    type="button"
                  >
                    {workerPromptCopyState === "copied" ? (
                      <CheckIcon />
                    ) : (
                      <CopyIcon />
                    )}
                  </button>
                </div>
                <pre className="mt-3 whitespace-pre-wrap text-sm leading-7 text-cyan-100">
                  {remoteStoryboardWorkerPrompt}
                </pre>
              </div>
              <div className="rounded border border-white/10 bg-black/30 p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">
                  Server command
                </div>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-sm leading-7 text-cyan-100">
                  bun scripts/storyboard-access-server.ts --root
                  /absolute/path/to/&lt;storyboard-name&gt; --port 8798
                </pre>
              </div>
              <div className="rounded border border-white/10 bg-black/30 p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">
                  Expected reply
                </div>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-sm leading-7 text-cyan-100">
                  Storyboard URL:
                  http://&lt;worker-host&gt;:8798/&lt;storyboard-name&gt;
                </pre>
              </div>
            </div>
          </div>
        ) : isAccessServerRootMode ? (
          <div className="h-full w-full overflow-auto bg-zinc-950 p-6">
            <div className="mx-auto w-full max-w-5xl space-y-4 text-sm text-white/80">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                    Storyboard access server
                  </div>
                  <div className="mt-1 text-lg text-cyan-100">
                    Available storyboards
                  </div>
                </div>
                {storyboardListRootDir ? (
                  <div className="max-w-[32rem] text-right text-xs leading-5 text-white/45">
                    {storyboardListRootDir}
                  </div>
                ) : null}
              </div>
              {storyboardListError ? (
                <div className="rounded border border-rose-300/30 bg-rose-300/10 p-4 text-sm text-rose-100">
                  {storyboardListError}
                </div>
              ) : null}
              {storyboardList.length === 0 ? (
                <div className="rounded border border-white/10 bg-black/30 p-6 text-sm text-white/60">
                  No storyboards were listed by this access server.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {storyboardList.map((storyboard) => (
                    <button
                      key={storyboard.storyboardUrl}
                      className="flex min-h-[9rem] flex-col rounded border border-white/10 bg-black/30 p-4 text-left transition hover:border-cyan-300/40 hover:bg-black/40"
                      onClick={() => {
                        setDraftStoryboardUrl(storyboard.storyboardUrl)
                        setConnectedStoryboardUrl(storyboard.storyboardUrl)
                      }}
                      type="button"
                    >
                      <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">
                        Storyboard
                      </div>
                      <div className="mt-2 text-base text-cyan-100">
                        {storyboard.name}
                      </div>
                      <div className="mt-3 text-xs leading-5 text-white/45">
                        {storyboard.storyboardUrl}
                      </div>
                      <div className="mt-auto flex flex-wrap gap-2 pt-4 text-[11px] uppercase tracking-[0.14em] text-white/45">
                        <span
                          className={
                            storyboard.hasStoryboardJson
                              ? "text-emerald-200/80"
                              : "text-white/30"
                          }
                        >
                          json
                        </span>
                        <span
                          className={
                            storyboard.hasStoryboardMarkdown
                              ? "text-emerald-200/80"
                              : "text-white/30"
                          }
                        >
                          md
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <PanelLayout
            className="h-full bg-zinc-950"
            contentClassName="p-4"
            panelClassName="bg-zinc-950"
            panels={[navigatorPanel, inspectorPanel]}
            storageKeyPrefix="storyboard.debug.editor"
          >
            {isEmptyStoryboard ? (
              <div className="flex h-full w-full items-center justify-center bg-zinc-950 p-8">
                <div className="w-full max-w-2xl rounded border border-white/10 bg-black/30 p-6 text-center">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                    Empty storyboard
                  </div>
                  <div className="mt-3 text-lg text-cyan-100">
                    This storyboard URL is connected but not initialized
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/65">
                    Create a starter storyboard document in this remote location
                    so you can begin editing stories, frames, and transitions.
                  </p>
                  <div className="mt-6 flex justify-center">
                    <button
                      className="rounded border border-cyan-300/40 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100 transition hover:border-cyan-300/70 hover:bg-cyan-300/15"
                      onClick={() => void initializeStoryboard()}
                      type="button"
                    >
                      Initialize storyboard
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="h-full w-full"
                onClick={(event) => {
                  const target = event.target
                  const interactiveStoryboardElement =
                    target instanceof Element
                      ? target.closest(
                          "[data-storyboard-frame-shell],[data-storyboard-next],[data-storyboard-transition],[data-storyboard-sequence-title],button,input,textarea,select,[role=button]",
                        )
                      : null
                  if (!interactiveStoryboardElement) {
                    setFocusedTransitionId(null)
                    setSelected({ kind: "storyboard" })
                  }
                }}
              >
                <PanZoomContainer
                  className="h-full"
                  fitKey={`${sourceQuery}:${path || "loading"}`}
                  ref={panZoomRef}
                >
                  <div
                    className="min-w-max bg-[#546072] p-8"
                    style={{
                      width: estimateGridWidth(
                        sequences,
                        editorFrameWidth,
                        editorActionWidth,
                      ),
                      height: estimateGridHeight(
                        sequences,
                        editorFrameHeight,
                        editorNextHeight,
                      ),
                    }}
                  >
                    <StoryboardGrid
                      actionColumnWidth={editorActionWidth}
                      onSequenceTitleClick={(sequence) => {
                        const story = (document?.stories ?? []).find(
                          (entry) => entry.id === sequence.id,
                        )
                        if (story) {
                          setFocusedTransitionId(null)
                          setSelected({ kind: "story", storyId: story.id })
                        }
                      }}
                      onTransitionClick={(transition) => {
                        const resolved = resolveTransitionSelection(
                          transition.sourceFrameId,
                          transition.label,
                        )
                        if (!resolved) {
                          return
                        }
                        setSelected(resolved.selected)
                        setFocusedTransitionId(resolved.transitionId)
                      }}
                      onFrameClick={(frame) => {
                        for (const story of document?.stories ?? []) {
                          if (
                            story.frames.some((entry) => entry.id === frame.id)
                          ) {
                            setFocusedTransitionId(null)
                            setSelected({
                              kind: "frame",
                              storyId: story.id,
                              frameId: frame.id,
                            })
                            return
                          }
                          for (const branch of story.branches ?? []) {
                            if (
                              branch.frames.some(
                                (entry) => entry.id === frame.id,
                              )
                            ) {
                              setFocusedTransitionId(null)
                              setSelected({
                                kind: "frame",
                                storyId: story.id,
                                frameId: frame.id,
                                branchId: branch.id,
                              })
                              return
                            }
                          }
                        }
                      }}
                      renderFrame={(frame) =>
                        renderEditorFrame(
                          frame as StoryboardGridFrame &
                            Partial<StoryboardFrameRecord>,
                          connectedStoryboardUrl,
                          activeCaptureSetId,
                          runVariantActionsForFrame(
                            frame as StoryboardGridFrame &
                              Partial<StoryboardFrameRecord>,
                          ),
                          runVariantAssetCacheKeysForFrame(
                            frame as StoryboardGridFrame &
                              Partial<StoryboardFrameRecord>,
                          ),
                          runVariantAssetsForFrame(
                            frame as StoryboardGridFrame &
                              Partial<StoryboardFrameRecord>,
                          ),
                        )
                      }
                      renderFrameHeaderControls={() =>
                        availableCaptureSetIds.length > 1 ? (
                          <select
                            aria-label="Capture set"
                            className="nopan nowheel rounded border border-white/10 bg-black/30 px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-white/75 outline-none focus:border-cyan-400"
                            onChange={(event) =>
                              setActiveCaptureSetId(event.currentTarget.value)
                            }
                            value={activeCaptureSetId}
                          >
                            {availableCaptureSetIds.map((captureSetId) => (
                              <option key={captureSetId} value={captureSetId}>
                                {captureSetId}
                              </option>
                            ))}
                          </select>
                        ) : null
                      }
                      storyboardUrl={connectedStoryboardUrl}
                      frameHeight={editorFrameHeight}
                      frameWidth={editorFrameWidth}
                      nextCellHeight={editorNextHeight}
                      selectedFrameId={selectedFrameId}
                      selectedSequenceId={
                        selected?.kind === "story"
                          ? selected.storyId
                          : selected?.kind === "frame"
                            ? selected.storyId
                            : undefined
                      }
                      sequences={sequences}
                    />
                  </div>
                </PanZoomContainer>
              </div>
            )}
          </PanelLayout>
        )}
      </div>
    </div>
  )
}

export function RemoteStoryboardEditorScreen() {
  return <StoryboardEditorFixture source={{ storyboardUrl: "" }} />
}

function StoryboardEditorPreview() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-white">
      <div className="w-[85%] rounded border border-white/10 bg-zinc-900 p-4">
        <div className="mb-3 text-sm font-semibold">Storyboard editor</div>
        <div className="space-y-2 text-xs text-white/55">
          <div>Load canonical `*.storyboard.json`</div>
          <div>Edit the storyboard through the grid inspector</div>
          <div>Persist changes through the storyboard server</div>
        </div>
      </div>
    </div>
  )
}

function configDraftFromTarget(
  target: RunTargetProviderTarget | null | undefined,
) {
  const draft: Record<string, string> = {}
  for (const field of target?.configFields ?? []) {
    draft[field.key] =
      field.value === undefined || field.value === null
        ? ""
        : String(field.value)
  }
  return draft
}

function targetPanelState(
  target: RunTargetProviderTarget,
  checks: RunTargetHealthCheck[] = [],
  owner?: string,
): RunTargetHealthPanelState {
  return {
    open: true,
    runTargetId: target.id,
    runTargetLabel: runTargetDisplayName(target),
    target,
    configDraft: configDraftFromTarget(target),
    configSaveState: "idle",
    configSaveMessage: null,
    checks,
    owner: owner ?? target.owner,
    loading: false,
    error: null,
  }
}

export function StoryboardRunTargetHealthScreen() {
  const initialUrl =
    typeof window === "undefined"
      ? ""
      : readStoryboardEditorQuery(window.location.search).storyboardUrl
  const [draftStoryboardUrl, setDraftStoryboardUrl] = useState(initialUrl)
  const [connectedStoryboardUrl, setConnectedStoryboardUrl] =
    useState(initialUrl)
  const [targets, setTargets] = useState<RunTargetProviderTarget[]>([])
  const [selectedTargetId, setSelectedTargetId] = useState("")
  const [panelState, setPanelState] = useState<RunTargetHealthPanelState>(
    emptyRunTargetHealthState,
  )
  const [loadingTargets, setLoadingTargets] = useState(false)
  const [targetError, setTargetError] = useState<string | null>(null)

  const selectedTarget =
    targets.find((target) => target.id === selectedTargetId) ?? null

  async function loadRunTargets(storyboardUrl = connectedStoryboardUrl) {
    const normalizedUrl = storyboardUrl.trim()
    if (!normalizedUrl) {
      setTargetError(
        "Enter a storyboardUrl to load provider-named run targets.",
      )
      return
    }
    setLoadingTargets(true)
    setTargetError(null)
    try {
      const params = new URLSearchParams({ storyboardUrl: normalizedUrl })
      const response = await fetch(
        `${apiRoot}/run-targets?${params.toString()}`,
      )
      const payload = await response.json().catch(() => null)
      if (
        !response.ok ||
        (payload &&
          typeof payload === "object" &&
          (payload as { ok?: boolean }).ok === false)
      ) {
        const message =
          payload &&
          typeof payload === "object" &&
          typeof (payload as { message?: unknown }).message === "string"
            ? (payload as { message: string }).message
            : `Provider run-target API returned HTTP ${response.status}`
        throw new Error(message)
      }
      const nextTargets = normalizeRunTargets(payload)
      setTargets(nextTargets)
      const nextSelected = nextTargets[0]?.id ?? ""
      setSelectedTargetId(nextSelected)
      setPanelState(
        nextTargets[0]
          ? targetPanelState(
              nextTargets[0],
              [],
              (payload as { owner?: string } | null)?.owner,
            )
          : emptyRunTargetHealthState,
      )
      if (nextTargets[0]) {
        void requestRunTargetHealth(
          nextTargets[0].id,
          "list",
          undefined,
          nextTargets[0],
          normalizedUrl,
        )
      }
    } catch (error) {
      setTargets([])
      setSelectedTargetId("")
      setPanelState(emptyRunTargetHealthState)
      setTargetError(
        `Provider run-target API unavailable or unsupported: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      setLoadingTargets(false)
    }
  }

  async function requestRunTargetHealth(
    runTargetId: string,
    action: "list" | "check" | "check-all" = "list",
    key?: string,
    targetOverride?: RunTargetProviderTarget | null,
    storyboardUrl = connectedStoryboardUrl,
  ) {
    const target =
      targetOverride ??
      targets.find((entry) => entry.id === runTargetId) ??
      selectedTarget
    if (!storyboardUrl.trim() || !runTargetId) return
    setPanelState((current) => ({
      ...current,
      open: true,
      runTargetId,
      runTargetLabel: target ? runTargetDisplayName(target) : runTargetId,
      target: target ?? current.target,
      configDraft:
        current.runTargetId === runTargetId
          ? current.configDraft
          : configDraftFromTarget(target),
      loading: true,
      runningKey:
        action === "check-all" ? "*" : action === "check" ? key : undefined,
      error: null,
    }))
    try {
      const params = new URLSearchParams({ storyboardUrl, runTargetId })
      const init: RequestInit =
        action === "list"
          ? { method: "GET" }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                storyboardUrl,
                runTargetId,
                ...(key ? { key } : {}),
              }),
            }
      const path =
        action === "list"
          ? "run-target-health"
          : action === "check"
            ? "run-target-health/check"
            : "run-target-health/check-all"
      const response = await fetch(
        `${apiRoot}/${path}?${params.toString()}`,
        init,
      )
      const payload = await response.json().catch(() => null)
      const payloadChecks = normalizeRunTargetHealthChecks(payload)
      if (
        !response.ok ||
        (payloadChecks.length === 0 &&
          payload &&
          typeof payload === "object" &&
          (payload as { ok?: boolean }).ok === false)
      ) {
        const message =
          payload &&
          typeof payload === "object" &&
          typeof (payload as { message?: unknown }).message === "string"
            ? (payload as { message: string }).message
            : `Provider Run Target Health API returned HTTP ${response.status}`
        throw new Error(message)
      }
      const health = normalizeRunTargetHealthPayload(payload)
      const nextTarget = health.target ?? target
      setPanelState((current) => ({
        ...current,
        open: true,
        runTargetId,
        runTargetLabel: nextTarget
          ? runTargetDisplayName(nextTarget)
          : runTargetId,
        target: nextTarget ?? current.target,
        configDraft:
          current.configDraft && current.runTargetId === runTargetId
            ? current.configDraft
            : configDraftFromTarget(nextTarget),
        checks: health.checks,
        owner: health.owner ?? nextTarget?.owner ?? current.owner,
        loading: false,
        runningKey: undefined,
        error: null,
        updatedAt: new Date().toISOString(),
      }))
    } catch (error) {
      setPanelState((current) => ({
        ...current,
        open: true,
        loading: false,
        runningKey: undefined,
        error: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString(),
      }))
    }
  }

  function selectTarget(target: RunTargetProviderTarget) {
    setSelectedTargetId(target.id)
    setPanelState(targetPanelState(target))
    void requestRunTargetHealth(target.id, "list", undefined, target)
  }

  async function saveConfig() {
    if (!panelState.runTargetId || !connectedStoryboardUrl.trim()) return
    setPanelState((current) => ({
      ...current,
      configSaveState: "saving",
      configSaveMessage: null,
    }))
    try {
      const response = await fetch(`${apiRoot}/run-targets/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyboardUrl: connectedStoryboardUrl,
          runTargetId: panelState.runTargetId,
          values: panelState.configDraft ?? {},
        }),
      })
      const payload = await response.json().catch(() => null)
      if (
        !response.ok ||
        (payload &&
          typeof payload === "object" &&
          (payload as { ok?: boolean }).ok === false)
      ) {
        const unsupported =
          payload &&
          typeof payload === "object" &&
          Boolean((payload as { unsupported?: unknown }).unsupported)
        const message =
          payload &&
          typeof payload === "object" &&
          typeof (payload as { message?: unknown }).message === "string"
            ? (payload as { message: string }).message
            : `Provider config-save API returned HTTP ${response.status}`
        setPanelState((current) => ({
          ...current,
          configSaveState: unsupported ? "unsupported" : "error",
          configSaveMessage: unsupported
            ? `Provider config save is unsupported/read-only for this storyboard source: ${message}`
            : `Provider config save failed: ${message}`,
        }))
        return
      }
      const nextTargets = normalizeRunTargets(payload)
      if (nextTargets.length > 0) {
        setTargets(nextTargets)
      }
      const nextTarget =
        normalizeRunTarget(payload) ??
        nextTargets.find((target) => target.id === panelState.runTargetId) ??
        panelState.target
      setPanelState((current) => ({
        ...current,
        target: nextTarget,
        configDraft: configDraftFromTarget(nextTarget),
        configSaveState: "saved",
        configSaveMessage: "Provider config saved.",
      }))
      void requestRunTargetHealth(
        panelState.runTargetId,
        "list",
        undefined,
        nextTarget,
      )
    } catch (error) {
      setPanelState((current) => ({
        ...current,
        configSaveState: "error",
        configSaveMessage: `Provider config save unavailable: ${error instanceof Error ? error.message : String(error)}`,
      }))
    }
  }

  useEffect(() => {
    if (connectedStoryboardUrl) {
      void loadRunTargets(connectedStoryboardUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-black text-white"
      data-storyboard-run-target-health-root="true"
    >
      <header className="flex flex-none flex-col gap-3 border-b border-white/10 bg-zinc-950 px-4 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-100/60">
            Standalone Run Target Health
          </div>
          <div className="mt-1 text-lg font-semibold text-white">
            Provider-owned run targets, config, and health checks
          </div>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-white/55">
            Paste a single storyboardUrl. DEV Storyboard lists provider-named
            run targets, then opens a dedicated Run Target panel for
            provider-defined config and health checks. Dashboard code renders
            the contract generically.
          </p>
        </div>
        <div className="flex min-w-0 gap-2">
          <input
            className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-cyan-100 outline-none focus:border-cyan-400"
            onChange={(event) =>
              setDraftStoryboardUrl(event.currentTarget.value)
            }
            placeholder="http://10.0.0.239:8898/onboarding"
            value={draftStoryboardUrl}
          />
          <button
            className="rounded border border-cyan-300/35 bg-cyan-300/10 px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30"
            disabled={loadingTargets}
            onClick={() => {
              const next = draftStoryboardUrl.trim()
              setConnectedStoryboardUrl(next)
              void loadRunTargets(next)
            }}
            type="button"
          >
            {loadingTargets ? "Loading…" : "Load targets"}
          </button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] bg-zinc-950/70">
        <aside className="min-h-0 overflow-auto border-r border-white/10 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">
              Provider-named targets
            </div>
            <button
              className="rounded border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/55 hover:border-cyan-300/40 hover:text-cyan-100"
              onClick={() => void loadRunTargets()}
              type="button"
            >
              Refresh
            </button>
          </div>
          {targetError ? (
            <div className="rounded border border-amber-300/35 bg-amber-300/10 p-3 text-xs text-amber-100">
              {targetError}
            </div>
          ) : null}
          {targets.length === 0 && !targetError ? (
            <div className="rounded border border-dashed border-white/10 p-4 text-sm text-white/40">
              No run targets loaded yet.
            </div>
          ) : null}
          <div className="space-y-2">
            {targets.map((target) => (
              <button
                className={`w-full rounded border p-3 text-left transition ${target.id === selectedTargetId ? "border-cyan-300/45 bg-cyan-300/10" : "border-white/10 bg-black/25 hover:border-cyan-300/35"}`}
                key={target.id}
                onClick={() => selectTarget(target)}
                type="button"
              >
                <div className="font-semibold text-white">
                  {runTargetDisplayName(target)}
                </div>
                <div className="mt-1 break-all font-mono text-[11px] text-white/45">
                  {target.id}
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-[10px] uppercase tracking-[0.12em] text-white/45">
                  {target.kind ? (
                    <span className="rounded border border-white/10 px-1.5 py-0.5">
                      {target.kind}
                    </span>
                  ) : null}
                  <span className="rounded border border-white/10 px-1.5 py-0.5">
                    {target.configFields.length} config
                  </span>
                  <span className="rounded border border-white/10 px-1.5 py-0.5">
                    {target.healthCheckKeys.length} checks
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>
        <main className="min-h-0 overflow-auto p-4">
          {panelState.open ? (
            <RunTargetHealthPanel
              state={panelState}
              onConfigValueChange={(key, value) =>
                setPanelState((current) => ({
                  ...current,
                  configDraft: { ...(current.configDraft ?? {}), [key]: value },
                  configSaveState: "idle",
                  configSaveMessage: null,
                }))
              }
              onRefresh={() =>
                void requestRunTargetHealth(panelState.runTargetId)
              }
              onRunAll={() =>
                void requestRunTargetHealth(panelState.runTargetId, "check-all")
              }
              onRunOne={(key) =>
                void requestRunTargetHealth(
                  panelState.runTargetId,
                  "check",
                  key,
                )
              }
              onSaveConfig={() => void saveConfig()}
            />
          ) : (
            <div className="rounded border border-dashed border-white/10 p-8 text-sm text-white/45">
              Select a provider-named run target to open the dedicated Run
              Target Health panel.
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export const storyboardEditorDebugDefinition: StoryboardDebugComponentDefinition =
  {
    slug: "storyboardEditor",
    label: "storyboardEditor",
    description:
      "Grid-backed storyboard editor backed by the canonical storyboard server.",
    defaultScenarioSlug: "default-storyboard",
    scenarios: [
      {
        slug: "default-storyboard",
        label: "default-storyboard",
        description:
          "Edit the bundled default storyboard template through the storyboard access server.",
        render: () => (
          <StoryboardEditorFixture
            source={{ storyboardUrl: bundledDefaultStoryboardUrl }}
          />
        ),
        renderPreview: () => <StoryboardEditorPreview />,
      },
      {
        slug: "test-storyboard-json",
        label: "test-storyboard-json",
        description:
          "Edit the canonical test.storyboard.json fixture through the storyboard server.",
        render: () => (
          <StoryboardEditorFixture
            source={{ storyboardUrl: testFixtureStoryboardUrl }}
          />
        ),
        renderPreview: () => <StoryboardEditorPreview />,
      },
      {
        slug: "remote-storyboard",
        label: "remote-storyboard",
        description:
          "Connect the editor to a storyboard access server running on a remote worker.",
        render: () => (
          <StoryboardEditorFixture source={{ storyboardUrl: "" }} />
        ),
        renderPreview: () => <StoryboardEditorPreview />,
      },
    ],
  }
