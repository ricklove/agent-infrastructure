import { useEffect, useMemo, useRef, useState } from "react"

import { PanZoomContainer, type PanZoomContainerHandle } from "../PanZoomContainer"
import { PanelLayout, type PanelLayoutPanel } from "../PanelLayout"
import {
  StoryboardGrid,
  TitleOnlyStoryboardFrame,
  type StoryboardGridFrame,
  type StoryboardGridSequence,
} from "../StoryboardGrid"
import {
  type StoryboardBranchRecord,
  type StoryboardDocument,
  type StoryboardStoryRecord,
  type StoryboardTransitionRecord,
  type StoryboardFrameRecord,
} from "../storyboard-document"
import type { StoryboardDebugComponentDefinition } from "./types"

type DocumentResponse = {
  ok: true
  path: string
  document: StoryboardDocument
  mtimeMs: number
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

type SelectedTarget =
  | { kind: "story"; storyId: string }
  | { kind: "frame"; storyId: string; frameId: string; branchId?: string }

type TransitionSelection = {
  transitionId: string
  selected: SelectedTarget
}

const apiRoot = "/api/storyboard"
const frameSize = 220
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

function findFrameRecord(document: StoryboardDocument | null, selected: SelectedTarget | null) {
  if (!document || !selected || selected.kind !== "frame") {
    return { story: null, branch: null, frame: null }
  }
  const story = findStory(document, selected.storyId)
  const branch = findBranch(story, selected.branchId)
  const frames = branch ? branch.frames : story?.frames ?? []
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

function frameNextLabel(frame: StoryboardGridFrame & { transitions?: StoryboardTransitionRecord[] }) {
  return frame.transitions?.[0]?.label ?? frame.nextLabel
}

function documentToSequences(document: StoryboardDocument): StoryboardGridSequence[] {
  return document.stories.flatMap((story) => {
    const mainRow: StoryboardGridSequence = {
      id: story.id,
      title: story.title,
      frames: story.frames.map((frame) => ({
        ...frame,
        nextLabel: frameNextLabel(frame),
      })),
    }

    const branchRows = (story.branches ?? []).map((branch) => {
      const sourceIndex = story.frames.findIndex(
        (frame) => frame.id === branch.sourceFrameId,
      )
      return {
        id: branch.id,
        title: `Branch: ${branch.label}`,
        sourceFrameId: branch.sourceFrameId,
        startColumn:
          sourceIndex >= 0
            ? sourceIndex + 1
            : Math.max(story.frames.length - 1, 0),
        startLabel: branch.label,
        frames: branch.frames.map((frame) => ({
          ...frame,
          nextLabel: frameNextLabel(frame),
        })),
      } satisfies StoryboardGridSequence
    })

    return [mainRow, ...branchRows]
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

function StoryboardEditorFixture({ fixtureName }: { fixtureName: string }) {
  const [path, setPath] = useState("")
  const [mtimeMs, setMtimeMs] = useState<number | null>(null)
  const [document, setDocument] = useState<StoryboardDocument | null>(null)
  const [status, setStatus] = useState("Loading storyboard…")
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [snapshotJob, setSnapshotJob] = useState<SnapshotJob | null>(null)
  const [selected, setSelected] = useState<SelectedTarget | null>(null)
  const [focusedTransitionId, setFocusedTransitionId] = useState<string | null>(null)
  const panZoomRef = useRef<PanZoomContainerHandle>(null)
  const saveTimeoutRef = useRef<number | undefined>(undefined)
  const skipAutosaveRef = useRef(true)
  const saveInFlightRef = useRef(false)
  const pendingSaveRef = useRef<StoryboardDocument | null>(null)
  const lastSavedRef = useRef("")
  const transitionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  async function loadDocument() {
    setStatus("Loading storyboard…")
    const response = await fetch(
      `${apiRoot}/document?fixture=${encodeURIComponent(fixtureName)}`,
    )
    if (!response.ok) {
      setStatus(await response.text())
      return
    }
    const payload = (await response.json()) as DocumentResponse
    skipAutosaveRef.current = true
    pendingSaveRef.current = null
    lastSavedRef.current = JSON.stringify(payload.document)
    setPath(payload.path)
    setMtimeMs(payload.mtimeMs)
    setDocument(payload.document)
    setSelected(
      payload.document.stories[0]
        ? { kind: "story", storyId: payload.document.stories[0].id }
        : null,
    )
    setStatus("Loaded")
    setSaveState("idle")
  }

  useEffect(() => {
    void loadDocument()
  }, [fixtureName])

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
    const response = await fetch(
      `${apiRoot}/document?fixture=${encodeURIComponent(fixtureName)}`,
      {
        method: "PUT" ,
        headers: {
          "Content-Type": "application/json",
        },
        body: serialized,
      },
    )
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
    setDocument(payload.document)
    setPath(payload.path)
    setMtimeMs(payload.mtimeMs)
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
  }, [document, fixtureName])

  async function requestSnapshotRun() {
    setStatus("Requesting snapshot run…")
    const response = await fetch(`${apiRoot}/snapshot-jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ storyboardPath: path || null }),
    })
    if (!response.ok) {
      setStatus(await response.text())
      return
    }
    const payload = (await response.json()) as { ok: true; job: SnapshotJob }
    setSnapshotJob(payload.job)
    setStatus(`Snapshot job ${payload.job.id} started`)
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

  const storyCount = document?.stories.length ?? 0
  const frameCount =
    document?.stories.reduce((total, story) => {
      const branchFrames = (story.branches ?? []).reduce(
        (branchTotal, branch) => branchTotal + branch.frames.length,
        0,
      )
      return total + story.frames.length + branchFrames
    }, 0) ?? 0
  const sequences = useMemo(
    () => (document ? documentToSequences(document) : []),
    [document],
  )
  const selectedFrameId = selected?.kind === "frame" ? selected.frameId : undefined
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
  const storyFrameOptions = selectedStory
    ? [
        ...selectedStory.frames.map((frame) => ({ id: frame.id, title: frame.title })),
        ...(selectedStory.branches ?? []).flatMap((branch) =>
          branch.frames.map((frame) => ({ id: frame.id, title: frame.title })),
        ),
      ]
    : []

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
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded border border-white/10 bg-white/5 p-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                Stories
              </div>
              <div className="mt-2 text-xl font-semibold text-cyan-100">
                {storyCount}
              </div>
            </div>
            <div className="rounded border border-white/10 bg-white/5 p-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                Frames
              </div>
              <div className="mt-2 text-xl font-semibold text-cyan-100">
                {frameCount}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded border border-white/10 bg-black/30 p-3 text-xs text-white/65">
            <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-white/40">
              Stories
            </div>
            <div className="space-y-3">
              {(document?.stories ?? []).map((story) => (
                <button
                  className={`block w-full rounded border px-3 py-2 text-left ${
                    selected?.kind === "story" && selected.storyId === story.id
                      ? "border-cyan-300/50 bg-cyan-200/10 text-cyan-100"
                      : "border-white/10 bg-white/5 text-white/70"
                  }`}
                  key={story.id}
                  onClick={() => {
                    setFocusedTransitionId(null)
                    setSelected({ kind: "story", storyId: story.id })
                  }}
                  type="button"
                >
                  <div className="font-medium">{story.title}</div>
                  <div className="mt-1 text-white/45">
                    {story.frames.length} main frames, {(story.branches ?? []).length} branches
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ),
    }),
    [document?.stories, frameCount, selected, storyCount],
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
            <div className="mt-2 text-sm text-white/55">
              {selected?.kind === "story"
                ? "Editing story metadata"
                : selected?.kind === "frame"
                  ? "Editing frame content"
                  : "Select a story or frame"}
            </div>
          </div>

          {selected?.kind === "story" && selectedStory ? (
            <div className="space-y-4">
              <label className="block">
                <div className="mb-2 text-xs uppercase tracking-[0.14em] text-white/45">
                  Story title
                </div>
                <input
                  className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                  onChange={(event) => updateCurrentStoryTitle(event.currentTarget.value)}
                  value={selectedStory.title}
                />
              </label>
              <div className="rounded border border-white/10 bg-white/5 p-3 text-xs text-white/55">
                {selectedStory.frames.length} main frames, {(selectedStory.branches ?? []).length} branch rows
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

              {selectedBranch ? (
                <label className="block">
                  <div className="mb-2 text-xs uppercase tracking-[0.14em] text-white/45">
                    Branch label
                  </div>
                  <input
                    className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                    onChange={(event) => updateCurrentBranchLabel(event.currentTarget.value)}
                    value={selectedBranch.label}
                  />
                </label>
              ) : null}

              <div className="space-y-3 rounded border border-white/10 bg-white/5 p-3">
                <div className="text-xs uppercase tracking-[0.14em] text-white/45">
                  Transitions
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
                      <div className="text-[11px] uppercase tracking-[0.14em] text-white/35">
                        {index === 0 ? "Primary transition" : `Side transition ${index}`}
                      </div>
                      <label className="block">
                        <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-white/40">
                          Label
                        </div>
                        <input
                          className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                          onChange={(event) =>
                            updateCurrentTransition(transition.id, (current) => ({
                              ...current,
                              label: event.currentTarget.value,
                            }))
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
                              updateCurrentTransition(transition.id, (current) => ({
                                ...current,
                                kind: event.currentTarget.value as StoryboardTransitionRecord["kind"],
                              }))
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
                              updateCurrentTransition(transition.id, (current) => ({
                                ...current,
                                targetFrameId: event.currentTarget.value,
                              }))
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
                  <div className="text-sm text-white/45">No transitions yet for this frame.</div>
                )}
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
    [selected, selectedBranch, selectedFrame, selectedFrameTransitions, selectedStory, snapshotJob, storyFrameOptions],
  )

  function updateCurrentStoryTitle(value: string) {
    if (!document || !selected || selected.kind !== "story") {
      return
    }
    setDocument(
      updateStory(document, selected.storyId, (story) => ({
        ...story,
        title: value,
      })),
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
    updater: (transition: StoryboardTransitionRecord) => StoryboardTransitionRecord,
  ) {
    updateCurrentFrame((frame) => ({
      ...frame,
      transitions: (frame.transitions ?? []).map((transition) =>
        transition.id === transitionId ? updater(transition) : transition,
      ),
    }))
  }

  function updateCurrentBranchLabel(value: string) {
    if (!document || !selected || selected.kind !== "frame" || !selected.branchId) {
      return
    }
    setDocument(
      updateStory(document, selected.storyId, (story) => ({
        ...story,
        branches: (story.branches ?? []).map((branch) =>
          branch.id === selected.branchId ? { ...branch, label: value } : branch,
        ),
      })),
    )
  }

  function resolveTransitionSelection(sourceFrameId: string, label: string): TransitionSelection | null {
    for (const story of document?.stories ?? []) {
      const storyFrame = story.frames.find((frame) => frame.id === sourceFrameId)
      if (storyFrame) {
        const transitions = storyFrame.transitions ?? []
        const transition =
          transitions.find((entry) => entry.label === label) ?? transitions[0]
        return transition
          ? {
              transitionId: transition.id,
              selected: { kind: "frame", storyId: story.id, frameId: storyFrame.id },
            }
          : null
      }

      for (const branch of story.branches ?? []) {
        const branchFrame = branch.frames.find((frame) => frame.id === sourceFrameId)
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
      <header className="flex flex-none items-center justify-between border-b border-white/10 bg-zinc-950 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
            Storyboard editor
          </div>
          <div className="mt-1 truncate text-sm text-cyan-100">
            {path || "fixture: test-storyboard"}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/55">
          <span>{storyCount} stories</span>
          <span>{frameCount} frames</span>
          <span>{status}</span>
          <span>
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : "Ready"}
          </span>
          {mtimeMs ? <span>{new Date(mtimeMs).toISOString()}</span> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded border border-white/15 px-3 py-2 text-sm text-white/80 hover:border-cyan-300/70 hover:text-cyan-100"
            onClick={() => void loadDocument()}
            type="button"
          >
            Reload
          </button>
          <button
            className="rounded border border-white/15 px-3 py-2 text-sm text-white/80 hover:border-cyan-300/70 hover:text-cyan-100"
            onClick={() => (document ? void persistDocument(document) : undefined)}
            type="button"
          >
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : "Save now"}
          </button>
          <button
            className="rounded border border-white/15 px-3 py-2 text-sm text-white/80 hover:border-cyan-300/70 hover:text-cyan-100"
            onClick={() => void requestSnapshotRun()}
            type="button"
          >
            Run snapshots
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <PanelLayout
          className="h-full bg-zinc-950"
          contentClassName="p-4"
          panelClassName="bg-zinc-950"
          panels={[navigatorPanel, inspectorPanel]}
          storageKeyPrefix="storyboard.debug.editor"
        >
          <PanZoomContainer
            className="h-full"
            fitKey={`${fixtureName}:${path || "loading"}`}
            ref={panZoomRef}
          >
            <div className="min-w-max bg-[#546072] p-8" style={{ width: estimateContentWidth(sequences), height: estimateContentHeight(sequences) }}>
              <StoryboardGrid
                onSequenceTitleClick={(sequence) => {
                  const story = (document?.stories ?? []).find((entry) => entry.id === sequence.id)
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
                    if (story.frames.some((entry) => entry.id === frame.id)) {
                      setFocusedTransitionId(null)
                      setSelected({ kind: "frame", storyId: story.id, frameId: frame.id })
                      return
                    }
                    for (const branch of story.branches ?? []) {
                      if (branch.frames.some((entry) => entry.id === frame.id)) {
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
                renderFrame={(frame) => (
                  <TitleOnlyStoryboardFrame frame={frame} height={frameSize} width={frameSize} />
                )}
                selectedFrameId={selectedFrameId}
                selectedSequenceId={selected?.kind === "story" ? selected.storyId : selected?.storyId}
                sequences={sequences}
              />
            </div>
          </PanZoomContainer>
        </PanelLayout>
      </div>
    </div>
  )
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

export const storyboardEditorDebugDefinition: StoryboardDebugComponentDefinition = {
  slug: "storyboardEditor",
  label: "storyboardEditor",
  description: "Grid-backed storyboard editor backed by the canonical storyboard server.",
  defaultScenarioSlug: "test-storyboard-json",
  scenarios: [
    {
      slug: "test-storyboard-json",
      label: "test-storyboard-json",
      description: "Edit the canonical test.storyboard.json fixture through the storyboard server.",
      render: () => <StoryboardEditorFixture fixtureName="test-storyboard" />,
      renderPreview: () => <StoryboardEditorPreview />,
    },
  ],
}
