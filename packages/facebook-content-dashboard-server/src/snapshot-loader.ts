import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  seedSnapshot,
  type ContentDashboardSnapshot,
  type ContentDashboardSnapshotResponse,
  type DraftRecord,
  type LearningRecord,
  type ScheduledPostRecord,
  type SourcePostRecord,
} from "@agent-infrastructure/facebook-content-dashboard-core"

type BrightDataSummaryItem = {
  post_id?: string
  url?: string
  date_posted?: string
  likes?: number
  comments?: number
  shares?: number
  weighted_engagement?: number
  page_name?: string
  content_preview?: string
  content?: string
}

type BrightDataSummaryFile = {
  source_page?: string
  snapshot_id?: string
  generated_at?: string
  total_posts?: number
  top_10_by_weighted_engagement?: BrightDataSummaryItem[]
}

type LoadedSnapshot = {
  snapshot: ContentDashboardSnapshot
  mode: "sample" | "snapshot-file"
  source: string
}

const defaultSnapshotCandidates = [
  process.env.FACEBOOK_CONTENT_DASHBOARD_SUMMARY_PATH?.trim() || "",
  "/home/ec2-user/workspace/tmp/brightdata-facebook-eval-100/summary.json",
].filter(Boolean)

function sourceMediaPath(rank: number): string | null {
  const path = `/home/ec2-user/workspace/tmp/brightdata-facebook-eval-100/images/rank-${String(rank).padStart(2, "0")}.jpg`
  return existsSync(path) ? path : null
}

function summarizePreview(item: BrightDataSummaryItem): string {
  const preview = `${item.content_preview ?? item.content ?? ""}`.trim()
  if (!preview) {
    return "High-engagement post with limited content preview available."
  }

  if (preview.startsWith("http://") || preview.startsWith("https://")) {
    return "External or reposted Facebook content that performed strongly on shares."
  }

  return preview.replace(/\s+/gu, " ").slice(0, 180)
}

function inferPattern(item: BrightDataSummaryItem): string {
  const preview = `${item.content_preview ?? item.content ?? ""}`.toLowerCase()
  if (preview.includes("rest in peace")) {
    return "memorial tribute"
  }
  if (preview.startsWith("http://") || preview.startsWith("https://")) {
    return "repost link / curated source"
  }
  if (preview.includes("share it") || preview.includes("if this hits you")) {
    return "story-led awareness post"
  }
  return "high-engagement facebook post"
}

function inferAngle(item: BrightDataSummaryItem): string {
  const preview = `${item.content_preview ?? item.content ?? ""}`.toLowerCase()
  if (preview.includes("rest in peace")) {
    return "grief + solidarity + honor"
  }
  if (preview.startsWith("http://") || preview.startsWith("https://")) {
    return "identity + curation + social proof"
  }
  return "support + urgency + community"
}

function inferWhyItWorked(item: BrightDataSummaryItem): string {
  const shares = item.shares ?? 0
  const comments = item.comments ?? 0

  if (shares >= comments * 2) {
    return "Shares carried this post. The content appears easy to re-transmit as a signal of identity or support."
  }

  if ((item.content_preview ?? "").toLowerCase().includes("rest in peace")) {
    return "Memorial framing created strong emotional alignment and comment participation from a highly sympathetic audience."
  }

  return "The post combined a clear emotional hook with low-friction audience agreement, producing above-baseline engagement."
}

function inferAdaptationRule(item: BrightDataSummaryItem): string {
  const preview = `${item.content_preview ?? item.content ?? ""}`.toLowerCase()
  if (preview.startsWith("http://") || preview.startsWith("https://")) {
    return "Reuse the support pattern, but transform the creative and copy enough that the new post stands alone."
  }
  if (preview.includes("rest in peace")) {
    return "Keep the respectful tone, but avoid templated memorial phrasing if the goal is a reusable evergreen creative."
  }
  return "Preserve the hook and clarity, but rewrite the message with a more brand-specific point of view."
}

function inferCaution(item: BrightDataSummaryItem): string {
  const preview = `${item.content_preview ?? item.content ?? ""}`.toLowerCase()
  if (preview.startsWith("http://") || preview.startsWith("https://")) {
    return "Do not simply repost the same linked content without checking originality, rights, and page fatigue."
  }
  if (preview.includes("rest in peace")) {
    return "Handle tragedy carefully. These posts can perform well while still carrying higher review risk."
  }
  return "Avoid engagement-bait phrasing and keep the derivative grounded in real, supportable claims."
}

function inferSourceUrl(item: BrightDataSummaryItem): string | null {
  const content = `${item.content ?? ""}`.trim()
  if (content.startsWith("http://") || content.startsWith("https://")) {
    return content
  }
  return null
}

function buildSourcePosts(items: BrightDataSummaryItem[]): SourcePostRecord[] {
  return items.slice(0, 10).map((item, index) => ({
    id: `src-${index + 1}`,
    title: summarizePreview(item),
    sourcePage: item.page_name?.trim() || "Unknown page",
    publishDate: item.date_posted?.trim() || "Unknown date",
    postUrl: item.url?.trim() || null,
    sourceUrl: inferSourceUrl(item),
    likes: item.likes ?? 0,
    comments: item.comments ?? 0,
    shares: item.shares ?? 0,
    score: item.weighted_engagement ?? 0,
    pattern: inferPattern(item),
    angle: inferAngle(item),
    hook: summarizePreview(item),
    whyItWorked: inferWhyItWorked(item),
    adaptationRule: inferAdaptationRule(item),
    caution: inferCaution(item),
    mediaPath: sourceMediaPath(index + 1),
    status: index === 0 ? "approved" : index < 3 ? "drafted" : "new",
  }))
}

function buildDrafts(sourcePosts: SourcePostRecord[]): DraftRecord[] {
  return sourcePosts.slice(0, 4).map((sourcePost, index) => ({
    id: `draft-${index + 1}`,
    sourceId: sourcePost.id,
    title:
      index === 0
        ? "Community-first support graphic"
        : index === 1
          ? "Officer and children community scene"
          : index === 2
            ? "Respect the people behind the badge"
            : "Public-safety empathy remix",
    format: index === 2 ? "quote" : index === 3 ? "story" : "image",
    stage: index === 2 ? "approved" : index === 0 ? "review" : "draft",
    positioning:
      index === 0
        ? "Supportive, not combative"
        : index === 1
          ? "Positive engagement"
          : index === 2
            ? "Minimal copy, stronger brand voice"
            : "Public-safety empathy",
    captionPreview:
      index === 0
        ? "Support looks like showing up for the officers who show up for our neighborhoods every day."
        : index === 1
          ? "Behind every badge is a person protecting families, mentoring kids, and building safer streets."
          : index === 2
            ? "We back the people who step forward on the hardest days. Respect the service. Honor the sacrifice."
            : "Use the original emotional payload, but recast it as a practical message families would want to share.",
    goal:
      index === 0
        ? "High-share evergreen graphic"
        : index === 1
          ? "Comments and saves from family-focused followers"
          : index === 2
            ? "Fast-scrolling agreement post"
            : "Shareable PSA",
    originality:
      index === 0 ? "72% transformed" : index === 1 ? "84% transformed" : index === 2 ? "68% transformed" : "88% transformed",
    tone:
      index === 0
        ? "confident, warm, civic"
        : index === 1
          ? "hopeful, visual, local"
          : index === 2
            ? "brief, respectful, declarative"
            : "protective, useful, grounded",
    note: `Derivative concept generated from ${sourcePost.pattern}.`,
    previewMediaPath: sourcePost.mediaPath,
  }))
}

function buildScheduledPosts(drafts: DraftRecord[]): ScheduledPostRecord[] {
  return drafts.slice(0, 3).map((draft, index) => ({
    id: `sched-${index + 1}`,
    pageName:
      index === 1 ? "Support Law Enforcement" : "Thin Blue Line Supporters",
    creative: draft.title,
    scheduledFor:
      index === 0
        ? "2026-05-08 14:00 UTC"
        : index === 1
          ? "2026-05-09 18:30 UTC"
          : "2026-05-10 15:00 UTC",
    stage: index === 0 ? "needs review" : index === 1 ? "approved" : "scheduled",
  }))
}

function buildLearningSignals(items: BrightDataSummaryItem[]): LearningRecord[] {
  const shareDrivenCount = items.filter(
    (item) => (item.shares ?? 0) > (item.comments ?? 0),
  ).length
  const shareDrivenPercent =
    items.length > 0 ? Math.round((shareDrivenCount / items.length) * 100) : 0

  return [
    {
      id: "learn-1",
      label: "Share-led wins",
      value: `${shareDrivenPercent}%`,
      note: "The strongest imported posts are still driven more by redistribution than by discussion depth.",
    },
    {
      id: "learn-2",
      label: "Top snapshot size",
      value: `${items.length} posts`,
      note: "This view is currently derived from the imported Bright Data summary instead of a live crawl.",
    },
    {
      id: "learn-3",
      label: "Review friction",
      value: "1 checkpoint",
      note: "The editorial flow still assumes one human review gate before scheduling.",
    },
  ]
}

function mapSummaryToSnapshot(summary: BrightDataSummaryFile): ContentDashboardSnapshot {
  const items = summary.top_10_by_weighted_engagement ?? []
  const sourcePosts = buildSourcePosts(items)
  const drafts = buildDrafts(sourcePosts)
  const scheduledPosts = buildScheduledPosts(drafts)
  const learningSignals = buildLearningSignals(items)

  return {
    ...seedSnapshot,
    sourcePosts,
    drafts,
    scheduledPosts,
    learningSignals,
  }
}

function tryLoadSnapshotFromFile(path: string): LoadedSnapshot | null {
  const resolvedPath = resolve(path)
  if (!existsSync(resolvedPath)) {
    return null
  }

  const parsed = JSON.parse(readFileSync(resolvedPath, "utf8")) as BrightDataSummaryFile
  const items = parsed.top_10_by_weighted_engagement
  if (!Array.isArray(items) || items.length === 0) {
    return null
  }

  return {
    snapshot: mapSummaryToSnapshot(parsed),
    mode: "snapshot-file",
    source: resolvedPath,
  }
}

export function loadContentDashboardSnapshot(): LoadedSnapshot {
  for (const candidate of defaultSnapshotCandidates) {
    try {
      const loaded = tryLoadSnapshotFromFile(candidate)
      if (loaded) {
        return loaded
      }
    } catch {}
  }

  return {
    snapshot: seedSnapshot,
    mode: "sample",
    source: "seedSnapshot",
  }
}

export function buildSnapshotResponse(): ContentDashboardSnapshotResponse {
  const loaded = loadContentDashboardSnapshot()
  return {
    ok: true,
    snapshot: loaded.snapshot,
    mode: loaded.mode,
    source: loaded.source,
  }
}
