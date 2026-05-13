import type { ReactNode } from "react"
import { forwardRef, useEffect, useRef, useState } from "react"
import { PanZoomViewport, type PanZoomViewportHandle } from "./PanZoomViewport"

type StoryKey = "connect-destination-page" | "review-top-past-posts"
type ViewportKey = "Wide desktop" | "Medium" | "Mobile"

type StoryboardFrame = {
  title: string
  note: string
  actionToNext?: string
  canvas: ReactNode
}

type StoryboardSection = {
  viewport: ViewportKey
  frames: StoryboardFrame[]
}

const storyboardViewportBox = {
  width: 360,
  height: 250,
} as const

const canonicalViewportSize: Record<ViewportKey, { width: number; height: number }> = {
  "Wide desktop": { width: 960, height: 620 },
  Medium: { width: 760, height: 620 },
  Mobile: { width: 320, height: 700 },
}

export function ContentCreationStoryboardGallery(props: { story: StoryKey }) {
  const spec = props.story === "connect-destination-page" ? connectDestinationSpec : reviewTopPastPostsSpec
  const viewportRef = useRef<PanZoomViewportHandle | null>(null)
  const [containerMode, setContainerMode] = useState<"panzoom" | "scroll">("panzoom")
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = "hidden"
    document.documentElement.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-zinc-950">
      <div className="flex h-8 items-center justify-between gap-1 border-b border-zinc-800 bg-zinc-950 px-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setContainerMode("panzoom")}
            className={["rounded-md border px-2 py-1 text-[11px]", containerMode === "panzoom" ? "border-cyan-500/70 text-cyan-300" : "border-zinc-700 text-zinc-300"].join(" ")}
          >
            Pan
          </button>
          <button
            type="button"
            onClick={() => setContainerMode("scroll")}
            className={["rounded-md border px-2 py-1 text-[11px]", containerMode === "scroll" ? "border-cyan-500/70 text-cyan-300" : "border-zinc-700 text-zinc-300"].join(" ")}
          >
            Scroll
          </button>
        </div>
        <div className="flex items-center gap-1">
          {containerMode === "panzoom" ? (
            <>
              <button type="button" onClick={() => viewportRef.current?.zoomOut()} className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300">-</button>
              <div className="min-w-[52px] text-center text-[11px] text-zinc-400">{Math.round(scale * 100)}%</div>
              <button type="button" onClick={() => viewportRef.current?.zoomIn()} className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300">+</button>
            </>
          ) : null}
        </div>
      </div>
      {containerMode === "panzoom" ? (
        <PanZoomViewport
          ref={viewportRef}
          fitKey={`storyboard:${props.story}`}
          initialPadding={12}
          onScaleChange={setScale}
        >
          <StoryboardBoard spec={spec} />
        </PanZoomViewport>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto bg-zinc-950 p-1">
          <StoryboardBoard spec={spec} />
        </div>
      )}
    </div>
  )
}

const StoryboardBoard = forwardRef<HTMLDivElement, { spec: { sections: StoryboardSection[] } }>(
  function StoryboardBoard(props, ref) {
    return (
      <div ref={ref} className="flex min-w-[1790px] flex-col gap-1.5 p-1">
        {props.spec.sections.map((section) => (
          <StoryboardRow key={section.viewport} section={section} />
        ))}
      </div>
    )
  },
)

function StoryboardRow(props: { section: StoryboardSection }) {
  const frameCount = props.section.frames.length
  const gridTemplateColumns = ["76px"]
  for (let index = 0; index < frameCount; index += 1) {
    gridTemplateColumns.push("360px")
    if (index < frameCount - 1) {
      gridTemplateColumns.push("88px")
    }
  }

  return (
    <section
      data-storyboard-row
      data-viewport={props.section.viewport}
      className="grid items-start gap-1"
      style={{ gridTemplateColumns: gridTemplateColumns.join(" ") }}
    >
      <div className="px-0.5 pt-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">{props.section.viewport}</div>
      </div>
      {props.section.frames.map((frame, index) => (
        <>
          <StoryboardFrameCard
            key={`${props.section.viewport}-${frame.title}`}
            index={index + 1}
            title={frame.title}
            note={frame.note}
            viewport={props.section.viewport}
          >
            {frame.canvas}
          </StoryboardFrameCard>
          {index < props.section.frames.length - 1 ? (
            <StoryboardAction
              key={`${props.section.viewport}-${frame.title}-action`}
              action={frame.actionToNext ?? ""}
            />
          ) : null}
        </>
      ))}
    </section>
  )
}

function StoryboardAction(props: { action: string }) {
  return (
    <div className="flex w-[88px] shrink-0 flex-col items-center gap-1 pt-[124px]">
      <div className="h-px w-full bg-zinc-700" />
      <div className="rounded border border-zinc-700 bg-zinc-950/90 px-2 py-0.5 text-center text-[10px] font-medium uppercase tracking-[0.12em] text-cyan-300/85">
        {props.action}
      </div>
      <div className="h-px w-full bg-zinc-700" />
    </div>
  )
}

function StoryboardFrameCard(props: {
  index: number
  title: string
  note: string
  viewport: ViewportKey
  children: ReactNode
}) {
  return (
    <div
      data-storyboard-frame
      data-frame-title={props.title}
      className="flex w-[360px] shrink-0 flex-col border"
      style={{ borderColor: "#3f3f46", backgroundColor: "#2a2f36" }}
    >
      <div className="px-1 pt-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">{props.index}. {props.title}</div>
      </div>
      <ScaledViewportFrame viewport={props.viewport}>{props.children}</ScaledViewportFrame>
      <div className="px-1 pb-1 pt-1 text-[11px] leading-5 text-zinc-500">{props.note}</div>
    </div>
  )
}

function ScaledViewportFrame(props: { viewport: ViewportKey; children: ReactNode }) {
  const size = canonicalViewportSize[props.viewport]
  const scale = Math.min(
    storyboardViewportBox.width / size.width,
    storyboardViewportBox.height / size.height,
  )
  const scaledWidth = size.width * scale
  const scaledHeight = size.height * scale

  return (
    <div
      className="flex w-full items-center justify-center overflow-hidden"
      style={{
        height: storyboardViewportBox.height,
        backgroundColor: "#111418",
      }}
    >
      <div className="relative shrink-0" style={{ width: scaledWidth, height: scaledHeight }}>
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ width: size.width, height: size.height, transform: `scale(${scale})`, transformOrigin: "0 0" }}
        >
          {props.children}
        </div>
      </div>
    </div>
  )
}

function AppShellMock(props: {
  left?: ReactNode
  main: ReactNode
  right?: ReactNode
  mobile?: boolean
}) {
  if (props.mobile) {
    return (
      <div className="mx-auto flex h-full w-full max-w-[286px] overflow-hidden rounded-[28px] border border-zinc-700 bg-zinc-950 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
        <div className="flex h-full w-full flex-col">{props.main}</div>
      </div>
    )
  }

  const hasLeft = Boolean(props.left)
  const hasRight = Boolean(props.right)
  const columns = [hasLeft ? "220px" : null, "minmax(0,1fr)", hasRight ? "220px" : null]
    .filter(Boolean)
    .join(" ")

  return (
    <div className="flex h-full w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
      <div className="grid h-full w-full min-h-[340px] gap-0" style={{ gridTemplateColumns: columns }}>
        {hasLeft ? (
          <div className="flex h-full border-r border-zinc-800 bg-zinc-900/55">
            <div className="flex h-full w-full p-2">{props.left}</div>
          </div>
        ) : null}
        <div className={["flex h-full bg-zinc-950", hasRight ? "border-r border-zinc-800" : ""].join(" ")}>
          <div className="flex h-full w-full p-2">{props.main}</div>
        </div>
        {hasRight ? (
          <div className="flex h-full bg-zinc-900/35">
            <div className="flex h-full w-full p-2">{props.right}</div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Surface(props: { title?: string; children: ReactNode; subtle?: boolean; fill?: boolean }) {
  return (
    <div className={[
      "border p-2",
      props.fill ? "flex h-full w-full flex-col" : "",
      props.subtle ? "border-zinc-800 bg-zinc-900/55" : "border-zinc-700 bg-zinc-900/85",
    ].join(" ")}>
      {props.title ? <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{props.title}</div> : null}
      <div className={["space-y-3", props.fill ? "flex-1" : ""].join(" ")}>{props.children}</div>
    </div>
  )
}

function PageChoice(props: { title: string; meta: string; active?: boolean }) {
  return (
    <div className={["rounded-xl border px-3 py-3", props.active ? "border-cyan-500/50 bg-cyan-500/10" : "border-zinc-800 bg-zinc-950/75"].join(" ")}>
      <div className="text-sm font-medium text-zinc-100">{props.title}</div>
      <div className="mt-1 text-xs text-zinc-500">{props.meta}</div>
    </div>
  )
}

function PostPreviewCard(props: { title: string; body: string; meta: string; selected?: boolean; compact?: boolean }) {
  return (
    <div className={["rounded-xl border overflow-hidden", props.selected ? "border-cyan-500/50 bg-zinc-900" : "border-zinc-800 bg-zinc-950/70"].join(" ")}>
      <div className="px-3 py-2.5">
        <div className="text-sm font-medium text-zinc-100">{props.title}</div>
        <div className="mt-2 line-clamp-3 text-xs leading-5 text-zinc-400">{props.body}</div>
      </div>
      <div className={["mx-3 mb-3 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900", props.compact ? "aspect-square" : "aspect-[1.18/1]"].join(" ")}>
        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.22),_transparent_45%),linear-gradient(135deg,_rgba(24,24,27,1),_rgba(39,39,42,1))] text-[11px] uppercase tracking-[0.14em] text-zinc-400">Media</div>
      </div>
      <div className="flex items-center justify-between border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-500">
        <span>{props.meta}</span>
        {props.selected ? <span className="text-cyan-300">Selected</span> : null}
      </div>
    </div>
  )
}

function ActionButton(props: { label: string; secondary?: boolean }) {
  return (
    <div className={["inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-medium", props.secondary ? "border border-zinc-700 bg-zinc-950 text-zinc-300" : "bg-cyan-400 text-zinc-950"].join(" ")}>
      {props.label}
    </div>
  )
}

const connectDestinationSpec = {
  title: "Connect Destination Page",
  summary:
    "Ideal first-run destination flow: existing pages visible immediately, add-page available in the same surface, selected page collapses into a trusted context card, and the next branch becomes obvious without extra explanation text.",
  sections: [
    {
      viewport: "Wide desktop" as const,
      frames: [
        {
          title: "Immediate entry",
          note: "Existing pages and add-page action appear together in the left setup rail.",
          actionToNext: "Select page",
          canvas: (
            <AppShellMock
              left={
                <Surface title="Publish to">
                  <PageChoice title="Support Law Enforcement" meta="10 top posts" />
                  <PageChoice title="Community Safety Update" meta="6 top posts" />
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/75 px-3 py-3 text-sm text-zinc-500">Page name or URL</div>
                  <ActionButton label="Add page" />
                </Surface>
              }
              main={<Surface subtle title="Next step"><div className="text-sm text-zinc-500">Select a page to continue.</div></Surface>}
              right={<Surface subtle title="Preview rail"><div className="text-sm text-zinc-600">Inactive until a page is selected.</div></Surface>}
            />
          ),
        },
        {
          title: "Destination selected",
          note: "The chosen page becomes active and the chooser de-emphasizes.",
          actionToNext: "Confirm context",
          canvas: (
            <AppShellMock
              left={
                <div className="space-y-3">
                  <Surface title="Selected destination">
                    <PageChoice title="Support Law Enforcement" meta="10 top posts" active />
                  </Surface>
                  <Surface subtle title="Other pages">
                    <PageChoice title="Community Safety Update" meta="6 top posts" />
                  </Surface>
                </div>
              }
              main={<Surface title="Page context"><div className="text-sm text-zinc-300">Support Law Enforcement is now the publishing context.</div></Surface>}
              right={<Surface subtle title="Next branch"><ActionButton label="Review top past posts" /></Surface>}
            />
          ),
        },
        {
          title: "Context locked",
          note: "The selected page persists while the workflow narrows to the next branch.",
          actionToNext: "Reopen if wrong",
          canvas: (
            <AppShellMock
              left={<Surface title="Publishing page"><PageChoice title="Support Law Enforcement" meta="10 top posts · selected" active /></Surface>}
              main={<Surface title="Choose a starting point"><div className="grid gap-3"><PageChoice title="Your past winners" meta="Use proven posts from this page" /><PageChoice title="Outside inspiration" meta="Add another page if you need more source material" /></div></Surface>}
              right={<Surface subtle title="Why this helps"><div className="text-sm leading-6 text-zinc-400">The user can verify the destination before deciding whether to begin from page history or outside inspiration.</div></Surface>}
            />
          ),
        },
        {
          title: "Safe reopen",
          note: "The user can reopen destination selection without a refresh and without hidden state traps.",
          canvas: (
            <AppShellMock
              left={<Surface title="Publishing page"><PageChoice title="Support Law Enforcement" meta="selected · click to change" active /></Surface>}
              main={<Surface title="Destination chooser reopened"><div className="grid gap-3"><PageChoice title="Support Law Enforcement" meta="10 top posts" active /><PageChoice title="Community Safety Update" meta="6 top posts" /><div className="rounded-xl border border-zinc-800 bg-zinc-950/75 px-3 py-3 text-sm text-zinc-500">Page name or URL</div></div></Surface>}
              right={<Surface subtle title="State behavior"><div className="text-sm text-zinc-400">Downstream source and draft state reset safely.</div></Surface>}
            />
          ),
        },
      ],
    },
    {
      viewport: "Medium" as const,
      frames: [
        { title: "Immediate entry", note: "One vertical start surface with pages first, add-page second.", canvas: <MediumConnectFrame mode="entry" /> },
        { title: "Destination selected", note: "Selected page stays above the next step, not off to a side rail.", actionToNext: "Confirm context", canvas: <MediumConnectFrame mode="selected" /> },
        { title: "Context locked", note: "The next branch appears directly beneath the selected page context.", actionToNext: "Reopen if wrong", canvas: <MediumConnectFrame mode="context" /> },
        { title: "Safe reopen", note: "Reopening returns to the chooser in place.", canvas: <MediumConnectFrame mode="reopen" /> },
      ],
    },
    {
      viewport: "Mobile" as const,
      frames: [
        { title: "Immediate entry", note: "One obvious starting area: select or add a page.", actionToNext: "Select page", canvas: <MobileConnectFrame mode="entry" /> },
        { title: "Destination selected", note: "The selected page collapses into a compact trusted card.", actionToNext: "Confirm context", canvas: <MobileConnectFrame mode="selected" /> },
        { title: "Context locked", note: "The next branch appears directly beneath the selected page.", actionToNext: "Reopen if wrong", canvas: <MobileConnectFrame mode="context" /> },
        { title: "Safe reopen", note: "User can reopen destination without losing the session.", canvas: <MobileConnectFrame mode="reopen" /> },
      ],
    },
  ],
}

const reviewTopPastPostsSpec = {
  title: "Review Top Past Posts",
  summary:
    "Ideal source-selection flow: winner previews feel like real posts, one source becomes explicit, draft generation is the next clear step, and source switching does not destroy continuity.",
  sections: [
    {
      viewport: "Wide desktop" as const,
      frames: [
        {
          title: "Winner list",
          note: "Top posts are visible as believable post previews, not raw metadata rows.",
          actionToNext: "Choose winner",
          canvas: (
            <AppShellMock
              left={<Surface title="Publishing page"><PageChoice title="Support Law Enforcement" meta="10 top posts · selected" active /></Surface>}
              main={<Surface title="Top past posts"><div className="grid gap-3 xl:grid-cols-2"><PostPreviewCard title="Neighborhood watch turnout doubles" body="A practical recap post with a clear local result and photo evidence." meta="2.3K likes · 310 comments" /><PostPreviewCard title="Officer mentorship night" body="A warmer community-facing post that still anchors in an event people attended." meta="1.8K likes · 205 comments" compact /></div></Surface>}
              right={<Surface subtle title="Next action"><div className="text-sm text-zinc-500">Choose one post to start generating from.</div></Surface>}
            />
          ),
        },
        {
          title: "Source selected",
          note: "One winner becomes the active source and gets a richer preview treatment.",
          actionToNext: "Generate draft",
          canvas: (
            <AppShellMock
              left={<Surface title="Publishing page"><PageChoice title="Support Law Enforcement" meta="10 top posts · selected" active /></Surface>}
              main={<Surface title="Active source"><PostPreviewCard title="Neighborhood watch turnout doubles" body="A practical recap post with a clear local result and photo evidence." meta="2.3K likes · 310 comments" selected /></Surface>}
              right={<Surface subtle title="Source list"><div className="space-y-3"><PageChoice title="Officer mentorship night" meta="Alternate winning source" /><PageChoice title="7 more winners" meta="Expand list" /></div></Surface>}
            />
          ),
        },
        {
          title: "Generate path visible",
          note: "The source-to-draft step becomes obvious without hiding the chosen source.",
          actionToNext: "Change source",
          canvas: (
            <AppShellMock
              left={<Surface title="Active source"><PostPreviewCard title="Neighborhood watch turnout doubles" body="A practical recap post with a clear local result and photo evidence." meta="Selected source" selected compact /></Surface>}
              main={<Surface title="Generate from this source"><div className="space-y-3 text-sm text-zinc-300"><div>The chosen post stays visible while the user moves into generation.</div><ActionButton label="Generate first draft" /></div></Surface>}
              right={<Surface subtle title="Why this works"><div className="text-sm leading-6 text-zinc-400">The draft is clearly tied to the selected post instead of appearing from nowhere.</div></Surface>}
            />
          ),
        },
        {
          title: "Source change",
          note: "The user can swap sources without losing destination or workflow context.",
          canvas: (
            <AppShellMock
              left={<Surface title="Active source"><PostPreviewCard title="Officer mentorship night" body="A warmer community-facing post that still anchors in an event people attended." meta="Selected source" selected compact /></Surface>}
              main={<Surface title="Generate from this source"><div className="space-y-3 text-sm text-zinc-300"><div>The generation path updates to the new source.</div><ActionButton label="Generate first draft" /></div></Surface>}
              right={<Surface subtle title="Continuity"><div className="text-sm text-zinc-400">Destination stays fixed; only the source changes.</div></Surface>}
            />
          ),
        },
      ],
    },
    {
      viewport: "Medium" as const,
      frames: [
        { title: "Winner list", note: "Compact browsing with previews visible before long scrolling starts.", actionToNext: "Choose winner", canvas: <MediumWinnersFrame mode="list" /> },
        { title: "Source selected", note: "Selected source remains above the generation path.", actionToNext: "Generate draft", canvas: <MediumWinnersFrame mode="selected" /> },
        { title: "Generate path visible", note: "Source and generation stay in one nearby reading path.", actionToNext: "Change source", canvas: <MediumWinnersFrame mode="generate" /> },
        { title: "Source change", note: "Source switching happens in place.", canvas: <MediumWinnersFrame mode="change" /> },
      ],
    },
    {
      viewport: "Mobile" as const,
      frames: [
        { title: "Short winner list", note: "Initial list stays short and scan-friendly.", actionToNext: "Choose winner", canvas: <MobileWinnersFrame mode="list" /> },
        { title: "Source selected", note: "Selected source collapses but remains recognizable.", actionToNext: "Generate draft", canvas: <MobileWinnersFrame mode="selected" /> },
        { title: "Generate path visible", note: "Draft generation appears directly beneath the chosen source.", actionToNext: "Change source", canvas: <MobileWinnersFrame mode="generate" /> },
        { title: "Source change", note: "User can reopen the winner list without losing destination context.", canvas: <MobileWinnersFrame mode="change" /> },
      ],
    },
  ],
}

function MediumConnectFrame(props: { mode: "entry" | "selected" | "context" | "reopen" }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
      <div className="space-y-4 p-4">
        <Surface title="Publish to">
          <PageChoice title="Support Law Enforcement" meta="10 top posts" active={props.mode !== "entry" && props.mode !== "reopen"} />
          {props.mode !== "context" ? <PageChoice title="Community Safety Update" meta="6 top posts" /> : null}
          {props.mode === "entry" || props.mode === "reopen" ? <div className="rounded-xl border border-zinc-800 bg-zinc-950/75 px-3 py-3 text-sm text-zinc-500">Page name or URL</div> : null}
        </Surface>
        <Surface title="Next step" subtle>
          <div className="text-sm text-zinc-400">
            {props.mode === "entry" ? "Select a page to continue." : props.mode === "selected" ? "Support Law Enforcement is the active publishing page." : props.mode === "context" ? "Choose whether to begin from your own winners or outside inspiration." : "Destination chooser reopened in place."}
          </div>
        </Surface>
      </div>
    </div>
  )
}

function MobileConnectFrame(props: { mode: "entry" | "selected" | "context" | "reopen" }) {
  return (
    <AppShellMock
      mobile
      main={
        <>
          <Surface title="Publish to">
            <PageChoice title="Support Law Enforcement" meta="10 top posts" active={props.mode !== "entry" && props.mode !== "reopen"} />
            {props.mode !== "selected" && props.mode !== "context" ? <div className="rounded-xl border border-zinc-800 bg-zinc-950/75 px-3 py-3 text-sm text-zinc-500">Page name or URL</div> : null}
            {props.mode === "entry" || props.mode === "reopen" ? <ActionButton label="Add page" /> : null}
          </Surface>
          <Surface title="Next" subtle>
            <div className="text-sm text-zinc-400">
              {props.mode === "entry" ? "Choose a destination page." : props.mode === "selected" ? "The selected page collapses into a compact top card." : props.mode === "context" ? "Your past winners or outside inspiration appears next." : "Reopening returns to the chooser in the same session."}
            </div>
          </Surface>
        </>
      }
    />
  )
}

function MediumWinnersFrame(props: { mode: "list" | "selected" | "generate" | "change" }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
      <div className="space-y-4 p-4">
        <Surface title="Selected page"><PageChoice title="Support Law Enforcement" meta="10 top posts · selected" active /></Surface>
        <Surface title={props.mode === "list" ? "Top past posts" : "Selected source"}>
          {props.mode === "list" ? (
            <div className="grid gap-3"><PostPreviewCard title="Neighborhood watch turnout doubles" body="A practical recap post with a clear local result and photo evidence." meta="2.3K likes · 310 comments" compact /><PostPreviewCard title="Officer mentorship night" body="A warmer community-facing post that still anchors in an event people attended." meta="1.8K likes · 205 comments" compact /></div>
          ) : (
            <PostPreviewCard title={props.mode === "change" ? "Officer mentorship night" : "Neighborhood watch turnout doubles"} body="The selected post remains visible above the generation path." meta="Selected source" selected compact />
          )}
        </Surface>
        <Surface title="Next" subtle>
          <div className="text-sm text-zinc-400">{props.mode === "list" ? "Choose a winning post to start from." : props.mode === "selected" ? "The source is now explicit." : props.mode === "generate" ? "Generate first draft is the next clear step." : "Source can change in place without resetting the whole session."}</div>
        </Surface>
      </div>
    </div>
  )
}

function MobileWinnersFrame(props: { mode: "list" | "selected" | "generate" | "change" }) {
  return (
    <AppShellMock
      mobile
      main={
        <>
          <Surface title="Publishing page"><PageChoice title="Support Law Enforcement" meta="10 top posts · selected" active /></Surface>
          <Surface title={props.mode === "list" ? "Top past posts" : "Selected source"}>
            {props.mode === "list" ? (
              <div className="space-y-3"><PostPreviewCard title="Neighborhood watch turnout doubles" body="A practical recap post with a clear local result and photo evidence." meta="2.3K likes" compact /><PostPreviewCard title="Officer mentorship night" body="A warmer community-facing post that still anchors in an event people attended." meta="1.8K likes" compact /><div className="rounded-xl border border-zinc-800 bg-zinc-950/75 px-3 py-2 text-xs text-zinc-500">7 more winners</div></div>
            ) : (
              <PostPreviewCard title={props.mode === "change" ? "Officer mentorship night" : "Neighborhood watch turnout doubles"} body="The selected source stays recognizable and near the next action." meta="Selected source" selected compact />
            )}
          </Surface>
          <Surface title="Next" subtle>
            <div className="text-sm text-zinc-400">{props.mode === "list" ? "Short list first." : props.mode === "selected" ? "The list collapses after selection." : props.mode === "generate" ? "Generate first draft appears directly beneath." : "User can reopen the winner list without losing the destination."}</div>
          </Surface>
        </>
      }
    />
  )
}
