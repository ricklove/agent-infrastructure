import { ScreenshotFrameCell } from "../ScreenshotFrameCell"
import type { StoryboardDebugComponentDefinition } from "./types"

function ComponentFixture({
  title,
  desktop,
  mobile,
  square,
}: {
  title?: string
  desktop?: JSX.Element
  mobile?: JSX.Element
  square?: JSX.Element
}) {
  return (
    <div
      className="flex h-full min-h-0 items-center justify-center bg-black p-8"
      data-storyboard-debug-capture-root="true"
    >
      <ScreenshotFrameCell
        desktop={desktop}
        mobile={mobile}
        square={square}
        title={title}
      />
    </div>
  )
}

function MockScreen({
  accent,
  body,
}: {
  accent: string
  body: string[]
}) {
  return (
    <div className="flex h-full w-full flex-col bg-[#0b1018] text-white">
      <div className="flex items-center justify-end border-b border-white/10 px-4 py-3">
        <div className="h-2 w-12 rounded-full" style={{ backgroundColor: accent }} />
      </div>
      <div className="flex-1 space-y-3 p-4">
        {body.map((line) => (
          <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/75" key={line}>
            {line}
          </div>
        ))}
      </div>
    </div>
  )
}

function ArtifactImage({ src, alt }: { src: string; alt: string }) {
  return <img alt={alt} className="h-full w-full object-contain bg-zinc-950" src={src} />
}

function previewFrame(title: string) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-black p-2">
      <div className="flex h-full w-full items-center justify-center border border-white/10 bg-zinc-900 text-center text-[9px] uppercase tracking-[0.16em] text-white/55">
        {title}
      </div>
    </div>
  )
}

export const screenshotFrameCellDebugDefinition: StoryboardDebugComponentDefinition = {
  slug: "screenshotFrameCell",
  label: "screenshotFrameCell",
  description: "Composite screenshot storyboard frame with desktop, mobile, and square panes.",
  defaultScenarioSlug: "empty-placeholders",
  scenarios: [
    {
      slug: "empty-placeholders",
      label: "empty-placeholders",
      description: "All three panes rendered as empty placeholders.",
      render: () => <ComponentFixture title="Empty placeholder frame" />,
      renderPreview: () => previewFrame("Empty"),
    },
    {
      slug: "mixed-static-screens",
      label: "mixed-static-screens",
      description: "All three panes filled with static mock screens.",
      render: () => (
        <ComponentFixture
          desktop={<MockScreen accent="#67e8f9" body={["Inbox", "Pinned chats", "Compose"]} />}
          mobile={<MockScreen accent="#f59e0b" body={["Chat list", "New message"]} />}
          square={<MockScreen accent="#a78bfa" body={["Media grid", "Shared files"]} />}
          title="Mixed static screens"
        />
      ),
      renderPreview: () => previewFrame("Static"),
    },
    {
      slug: "desktop-only",
      label: "desktop-only",
      description: "Desktop pane only, lower panes use placeholders.",
      render: () => (
        <ComponentFixture
          desktop={<MockScreen accent="#22c55e" body={["Workspace", "Mentions", "Team inbox"]} />}
          title="Desktop only"
        />
      ),
      renderPreview: () => previewFrame("Desktop"),
    },
    {
      slug: "mobile-only",
      label: "mobile-only",
      description: "Mobile pane only, other panes use placeholders.",
      render: () => (
        <ComponentFixture
          mobile={<MockScreen accent="#ef4444" body={["Voice note", "Camera", "Payments"]} />}
          title="Mobile only"
        />
      ),
      renderPreview: () => previewFrame("Mobile"),
    },
    {
      slug: "square-only",
      label: "square-only",
      description: "Square pane only, other panes use placeholders.",
      render: () => (
        <ComponentFixture
          square={<MockScreen accent="#3b82f6" body={["Gallery", "Pins", "Search"]} />}
          title="Square only"
        />
      ),
      renderPreview: () => previewFrame("Square"),
    },
    {
      slug: "long-title-with-all-three",
      label: "long-title-with-all-three",
      description: "All three panes with a long frame title.",
      render: () => (
        <ComponentFixture
          desktop={<MockScreen accent="#67e8f9" body={["Home", "Threads", "Calls"]} />}
          mobile={<MockScreen accent="#f59e0b" body={["Composer", "Camera"]} />}
          square={<MockScreen accent="#a78bfa" body={["Profile", "Media"]} />}
          title="Long title frame showing the responsive screenshot composite layout for one storyboard step"
        />
      ),
      renderPreview: () => previewFrame("Long title"),
    },
    {
      slug: "artifact-backed-previews",
      label: "artifact-backed-previews",
      description: "Uses generated PNG debug artifacts as pane content.",
      render: () => (
        <ComponentFixture
          desktop={<ArtifactImage alt="desktop artifact" src="/storyboard-debug/storyboardGrid/chat-app-large-grid.png" />}
          mobile={<ArtifactImage alt="mobile artifact" src="/storyboard-debug/panZoomContainer/red-green-blue-squares-fit.png" />}
          square={<ArtifactImage alt="square artifact" src="/storyboard-debug/panZoomContainer/simple-react-component.png" />}
          title="Artifact backed previews"
        />
      ),
      renderPreview: () => previewFrame("Artifacts"),
    },
  ],
}
