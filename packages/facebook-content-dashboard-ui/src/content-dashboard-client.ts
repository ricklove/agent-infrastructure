import { dashboardSessionFetch } from "@agent-infrastructure/dashboard-plugin"
import type {
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
