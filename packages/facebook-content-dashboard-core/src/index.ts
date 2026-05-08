export type ContentWorkflowStep = {
  id: string
  label: string
  note: string
}

export type SourcePostRecord = {
  id: string
  title: string
  sourcePage: string
  publishDate: string
  postUrl: string | null
  sourceUrl: string | null
  likes: number
  comments: number
  shares: number
  score: number
  pattern: string
  angle: string
  hook: string
  whyItWorked: string
  adaptationRule: string
  caution: string
  status: "new" | "drafted" | "approved"
}

export type DraftRecord = {
  id: string
  sourceId: string
  title: string
  format: "image" | "story" | "quote"
  stage: "draft" | "review" | "approved"
  positioning: string
  captionPreview: string
  goal: string
  originality: string
  tone: string
  note: string
}

export type ScheduledPostRecord = {
  id: string
  pageName: string
  creative: string
  scheduledFor: string
  stage: "needs review" | "approved" | "scheduled"
}

export type LearningRecord = {
  id: string
  label: string
  value: string
  note: string
}

export type ContentDashboardSnapshot = {
  workflowSteps: ContentWorkflowStep[]
  sourcePosts: SourcePostRecord[]
  drafts: DraftRecord[]
  scheduledPosts: ScheduledPostRecord[]
  learningSignals: LearningRecord[]
}

export type ContentDashboardSnapshotResponse = {
  ok: boolean
  snapshot?: ContentDashboardSnapshot
  mode?: "sample" | "snapshot-file"
  source?: string
  error?: string
}

export const seedSnapshot: ContentDashboardSnapshot = {
  workflowSteps: [
    {
      id: "discover",
      label: "Discover",
      note: "Rank external and historical winners by share intent, identity fit, and freshness.",
    },
    {
      id: "create",
      label: "Create",
      note: "Generate several derivatives from one proven pattern instead of one-off AI output.",
    },
    {
      id: "review",
      label: "Review",
      note: "Check source lineage, originality, tone, and policy risk before anything can ship.",
    },
    {
      id: "schedule",
      label: "Schedule",
      note: "Assign page, time, and queue slot in one uninterrupted approval flow.",
    },
    {
      id: "learn",
      label: "Learn",
      note: "Feed publish results back into the pattern library and prompt templates.",
    },
  ],
  sourcePosts: [
    {
      id: "src-1",
      title: "Identity-first support graphic",
      sourcePage: "Support Law Enforcement",
      publishDate: "2026-04-26",
      postUrl: null,
      sourceUrl: null,
      likes: 2229,
      comments: 157,
      shares: 885,
      score: 5198,
      pattern: "high-share support graphic",
      angle: "pride + tribe + confrontation",
      hook: "Instantly legible, identity-led statement people can share without context.",
      whyItWorked:
        "The post compresses affiliation, certainty, and conflict into one glance. Shares do most of the work because followers use it to signal belonging.",
      adaptationRule:
        "Keep the speed and clarity, but soften the confrontational edge so the derivative can travel farther without becoming engagement bait.",
      caution:
        "Do not copy the headline structure too closely. Rebuild the message around support, presence, and community trust.",
      status: "approved",
    },
    {
      id: "src-2",
      title: "Short native support statement",
      sourcePage: "Support Law Enforcement",
      publishDate: "2026-04-20",
      postUrl: null,
      sourceUrl: null,
      likes: 721,
      comments: 62,
      shares: 129,
      score: 1232,
      pattern: "concise solidarity post",
      angle: "certainty + gratitude",
      hook: "Low-friction copy that readers can agree with in under two seconds.",
      whyItWorked:
        "It feels direct and authentic, and it gives supporters a low-cost way to publicly align with the page without asking them to process a long story.",
      adaptationRule:
        "Use the same brevity for caption variants and build stronger art direction around the text so the new post feels intentional.",
      caution:
        "Short statements can become generic fast. Each variant needs a distinct emotional point of view.",
      status: "drafted",
    },
    {
      id: "src-3",
      title: "Road-safety consequence story",
      sourcePage: "Support Law Enforcement",
      publishDate: "2026-04-17",
      postUrl: null,
      sourceUrl: null,
      likes: 174,
      comments: 10,
      shares: 108,
      score: 518,
      pattern: "story-led awareness post",
      angle: "fear + empathy + urgency",
      hook: "Narrative setup that moves from lived consequence to public-safety takeaway.",
      whyItWorked:
        "This post earns shares with a moral and practical payload. It feels useful, not just partisan, so it reaches beyond the core base.",
      adaptationRule:
        "Translate the same public-service energy into family-safe visuals and captions that feel protective instead of alarmist.",
      caution:
        "Keep claims grounded and avoid synthetic realism that could be mistaken for a real event photo.",
      status: "new",
    },
  ],
  drafts: [
    {
      id: "draft-1",
      sourceId: "src-1",
      title: "Community-first support graphic",
      format: "image",
      stage: "review",
      positioning: "Supportive, not combative",
      captionPreview:
        "Support looks like showing up for the officers who show up for our neighborhoods every day.",
      goal: "High-share evergreen graphic",
      originality: "72% transformed",
      tone: "confident, warm, civic",
      note:
        "Preserves the one-glance clarity of the original winner but swaps confrontation for community trust.",
    },
    {
      id: "draft-2",
      sourceId: "src-1",
      title: "Officer and children community scene",
      format: "image",
      stage: "draft",
      positioning: "Positive engagement",
      captionPreview:
        "Behind every badge is a person protecting families, mentoring kids, and building safer streets.",
      goal: "Comments and saves from family-focused followers",
      originality: "84% transformed",
      tone: "hopeful, visual, local",
      note:
        "Uses the same support signal as the source post, but anchors it in service and human presence.",
    },
    {
      id: "draft-3",
      sourceId: "src-2",
      title: "Back the people behind the badge",
      format: "quote",
      stage: "approved",
      positioning: "Minimal copy, stronger brand voice",
      captionPreview:
        "We back the people who step forward on the hardest days. Respect the service. Honor the sacrifice.",
      goal: "Fast-scrolling agreement post",
      originality: "68% transformed",
      tone: "brief, respectful, declarative",
      note:
        "Still simple, but more branded and more reusable in the long-term content queue.",
    },
    {
      id: "draft-4",
      sourceId: "src-3",
      title: "Slow down, someone wants them home",
      format: "story",
      stage: "draft",
      positioning: "Public-safety empathy",
      captionPreview:
        "Traffic stops are never routine for the families waiting on the other side of the shift. Give officers room to work safely.",
      goal: "Shareable safety PSA",
      originality: "88% transformed",
      tone: "protective, useful, grounded",
      note:
        "A direct adaptation of the awareness pattern into a practical message with broader audience fit.",
    },
  ],
  scheduledPosts: [
    {
      id: "sched-1",
      pageName: "Thin Blue Line Supporters",
      creative: "Officer and children community scene",
      scheduledFor: "2026-05-08 14:00 UTC",
      stage: "needs review",
    },
    {
      id: "sched-2",
      pageName: "Support Law Enforcement",
      creative: "Back the people behind the badge",
      scheduledFor: "2026-05-09 18:30 UTC",
      stage: "approved",
    },
    {
      id: "sched-3",
      pageName: "Thin Blue Line Supporters",
      creative: "Community-first support graphic",
      scheduledFor: "2026-05-10 15:00 UTC",
      stage: "scheduled",
    },
  ],
  learningSignals: [
    {
      id: "learn-1",
      label: "Share-led wins",
      value: "68%",
      note: "The best source posts win because they travel, not because they collect comments.",
    },
    {
      id: "learn-2",
      label: "Best tone shift",
      value: "Pride -> service",
      note: "Positive civic framing should keep identity energy while reducing needless friction.",
    },
    {
      id: "learn-3",
      label: "Review friction",
      value: "1 checkpoint",
      note: "One approval gate before scheduling is enough for speed without making this an autoposter.",
    },
  ],
}
