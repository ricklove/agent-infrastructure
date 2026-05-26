import { PanZoomContainer } from "../PanZoomContainer"
import { StoryboardGrid, type StoryboardGridSequence } from "../StoryboardGrid"
import type { StoryboardDebugComponentDefinition } from "./types"

const singleSequenceDataset: StoryboardGridSequence[] = [
  {
    id: "sequence-a",
    title: "Sequence A",
    frames: [
      { id: "a1", title: "Frame A1", nextLabel: "Next" },
      { id: "a2", title: "Frame A2", nextLabel: "Next" },
      { id: "a3", title: "Frame A3", nextLabel: "Next" },
      { id: "a4", title: "Frame A4" },
    ],
  },
]

const twoSequenceDataset: StoryboardGridSequence[] = [
  {
    id: "sequence-a",
    title: "Sequence A",
    frames: [
      { id: "a1", title: "A1", nextLabel: "Next" },
      { id: "a2", title: "A2", nextLabel: "Next" },
      { id: "a3", title: "A3", nextLabel: "Next" },
      { id: "a4", title: "A4" },
    ],
  },
  {
    id: "sequence-b",
    title: "Sequence B",
    frames: [
      { id: "b1", title: "B1", nextLabel: "Next" },
      { id: "b2", title: "B2", nextLabel: "Next" },
      { id: "b3", title: "B3", nextLabel: "Next" },
      { id: "b4", title: "B4" },
    ],
  },
]

const mixedTitleDataset: StoryboardGridSequence[] = [
  {
    id: "sequence-a",
    title: "Sequence A",
    frames: [
      { id: "a1", title: "Short", nextLabel: "Next" },
      { id: "a2", title: "Medium length title", nextLabel: "Next" },
      {
        id: "a3",
        title: "Very long frame title that should wrap cleanly inside the cell",
        nextLabel: "Next",
      },
      { id: "a4", title: "End" },
    ],
  },
  {
    id: "sequence-b",
    title: "Sequence B",
    frames: [
      { id: "b1", title: "B1", nextLabel: "Next" },
      { id: "b2", title: "B2", nextLabel: "Next" },
      { id: "b3", title: "B3", nextLabel: "Next" },
      { id: "b4", title: "B4" },
    ],
  },
]

function StoryboardGridFixture({
  sequences,
  scenarioSlug,
}: {
  sequences: StoryboardGridSequence[]
  scenarioSlug: string
}) {
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-black text-white"
      data-storyboard-debug-capture-root="true"
    >
      <PanZoomContainer className="flex-1" fitKey={`storyboard-grid-${scenarioSlug}`}>
        <div
          className="min-w-max p-10"
          style={{ backgroundColor: "#5f6775" }}
        >
          <StoryboardGrid sequences={sequences} />
        </div>
      </PanZoomContainer>
    </div>
  )
}

function StoryboardGridPreview({
  sequences,
}: {
  sequences: StoryboardGridSequence[]
}) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-black p-3">
      <div className="flex w-full flex-col gap-2">
        {sequences.slice(0, 3).map((sequence) => (
          <div className="flex items-center gap-1.5" key={sequence.id}>
            {sequence.frames.slice(0, 4).map((frame, index) => (
              <div className="flex items-center gap-1.5" key={frame.id}>
                <div className="flex h-8 w-12 items-center justify-center bg-zinc-800 text-[9px] text-white/70">
                  {frame.title}
                </div>
                {index < sequence.frames.length - 1 ? (
                  <div className="text-[9px] uppercase tracking-[0.14em] text-white/40">
                    &gt;
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export const storyboardGridDebugDefinition: StoryboardDebugComponentDefinition =
  {
    slug: "storyboardGrid",
    label: "storyboardGrid",
    description: "Title-only storyboard grid sequences",
    defaultScenarioSlug: "single-sequence",
    scenarios: [
      {
        slug: "single-sequence",
        label: "single-sequence",
        render: () => (
          <StoryboardGridFixture
            scenarioSlug="single-sequence"
            sequences={singleSequenceDataset}
          />
        ),
        renderPreview: () => (
          <StoryboardGridPreview sequences={singleSequenceDataset} />
        ),
      },
      {
        slug: "two-sequences",
        label: "two-sequences",
        render: () => (
          <StoryboardGridFixture
            scenarioSlug="two-sequences"
            sequences={twoSequenceDataset}
          />
        ),
        renderPreview: () => (
          <StoryboardGridPreview sequences={twoSequenceDataset} />
        ),
      },
      {
        slug: "mixed-title-lengths",
        label: "mixed-title-lengths",
        render: () => (
          <StoryboardGridFixture
            scenarioSlug="mixed-title-lengths"
            sequences={mixedTitleDataset}
          />
        ),
        renderPreview: () => (
          <StoryboardGridPreview sequences={mixedTitleDataset} />
        ),
      },
    ],
  }
