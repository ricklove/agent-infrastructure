import { dashboardSessionFetch } from "@agent-infrastructure/dashboard-plugin"
import type {
  DraftRecord,
  GenerateImageDraftRequest,
  GenerateImageDraftResponse,
  GenerateTextDraftsRequest,
  GenerateTextDraftsResponse,
  ContentDashboardSnapshot,
  ContentDashboardSnapshotResponse,
} from "./content-dashboard-contract"

export type ContentDashboardClientOptions = {
  apiRootUrl?: string
}

export type ContentDashboardClientSnapshot = {
  snapshot: ContentDashboardSnapshot
  mode: "sample" | "snapshot-file"
  source: string
}

function normalizeApiRootUrl(apiRootUrl?: string): string {
  const trimmed = apiRootUrl?.trim() || "/api/facebook-content-dashboard"
  return trimmed.replace(/\/+$/u, "")
}

export async function fetchContentDashboardSnapshot(
  options: ContentDashboardClientOptions = {},
): Promise<ContentDashboardClientSnapshot> {
  const apiRootUrl = normalizeApiRootUrl(options.apiRootUrl)
  const response = (await dashboardSessionFetch(
    `${apiRootUrl}/snapshot`,
  )) as Response
  const payload = (await response.json()) as ContentDashboardSnapshotResponse

  if (!response.ok || !payload.ok || !payload.snapshot) {
    throw new Error(payload.error ?? "Content dashboard snapshot failed to load.")
  }

  return {
    snapshot: payload.snapshot,
    mode: payload.mode ?? "sample",
    source: payload.source ?? "unknown",
  }
}

export async function generateContentDashboardTextDrafts(
  request: GenerateTextDraftsRequest,
  options: ContentDashboardClientOptions = {},
): Promise<DraftRecord[]> {
  const apiRootUrl = normalizeApiRootUrl(options.apiRootUrl)
  const response = (await dashboardSessionFetch(`${apiRootUrl}/generate-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  })) as Response
  const payload = (await response.json()) as GenerateTextDraftsResponse

  if (!response.ok || !payload.ok || !payload.drafts) {
    throw new Error(payload.error ?? "Text generation failed.")
  }

  return payload.drafts
}

export async function generateContentDashboardImageDraft(
  request: GenerateImageDraftRequest,
  options: ContentDashboardClientOptions = {},
): Promise<GenerateImageDraftResponse> {
  const apiRootUrl = normalizeApiRootUrl(options.apiRootUrl)
  const response = (await dashboardSessionFetch(`${apiRootUrl}/generate-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  })) as Response
  const payload = (await response.json()) as GenerateImageDraftResponse

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Image generation failed.")
  }

  return payload
}
