type DashboardPreferencesStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

type DashboardPreferencesWindow = {
  localStorage?: DashboardPreferencesStorage
  addEventListener?(type: string, listener: () => void): void
  removeEventListener?(type: string, listener: () => void): void
  dispatchEvent?(event: { type: string }): boolean
}

declare const Event: {
  new (type: string): { type: string }
}

export type DashboardVisibilityMode = "basic" | "advanced"
export type DashboardEnterStyle = "enter-to-send" | "mod-enter-to-send"

export type DashboardPreferences = {
  dashboardMode: DashboardVisibilityMode
  enterStyle: DashboardEnterStyle
}

export type DashboardComposerKeyEvent = {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}

const dashboardPreferencesStorageKey =
  "agent-infrastructure.dashboard.preferences"
const dashboardPreferencesChangedEvent =
  "agent-infrastructure.dashboard.preferences.changed"

const defaultDashboardPreferences: DashboardPreferences = {
  dashboardMode: "advanced",
  enterStyle: "mod-enter-to-send",
}

export const dashboardBasicFeatureIds = [
  "chat",
  "chat-v2",
  "swarm",
  "projects",
  "settings",
] as const

export const dashboardFeatureOrder = [
  "chat",
  "chat-v2",
  "swarm",
  "workbench",
  "design",
  "debug",
  "graph",
  "terminal",
  "projects",
  "settings",
] as const

function preferencesWindow(): DashboardPreferencesWindow | undefined {
  return (globalThis as { window?: DashboardPreferencesWindow }).window
}

function normalizeDashboardMode(value: unknown): DashboardVisibilityMode {
  return value === "basic" ? "basic" : "advanced"
}

function normalizeEnterStyle(value: unknown): DashboardEnterStyle {
  return value === "enter-to-send" ? "enter-to-send" : "mod-enter-to-send"
}

export function readDashboardPreferences(): DashboardPreferences {
  const storedValue =
    preferencesWindow()?.localStorage?.getItem(
      dashboardPreferencesStorageKey,
    ) ?? ""
  if (!storedValue) {
    return defaultDashboardPreferences
  }

  try {
    const parsed = JSON.parse(storedValue) as Partial<DashboardPreferences>
    return {
      dashboardMode: normalizeDashboardMode(parsed.dashboardMode),
      enterStyle: normalizeEnterStyle(parsed.enterStyle),
    }
  } catch {
    return defaultDashboardPreferences
  }
}

export function writeDashboardPreferences(
  nextPreferences: Partial<DashboardPreferences>,
): DashboardPreferences {
  const mergedPreferences: DashboardPreferences = {
    ...readDashboardPreferences(),
    ...nextPreferences,
  }
  const normalizedPreferences: DashboardPreferences = {
    dashboardMode: normalizeDashboardMode(mergedPreferences.dashboardMode),
    enterStyle: normalizeEnterStyle(mergedPreferences.enterStyle),
  }

  preferencesWindow()?.localStorage?.setItem(
    dashboardPreferencesStorageKey,
    JSON.stringify(normalizedPreferences),
  )
  preferencesWindow()?.dispatchEvent?.(
    new Event(dashboardPreferencesChangedEvent),
  )

  return normalizedPreferences
}

export function subscribeDashboardPreferences(
  listener: () => void,
): () => void {
  const nextWindow = preferencesWindow()
  nextWindow?.addEventListener?.(dashboardPreferencesChangedEvent, listener)
  nextWindow?.addEventListener?.("storage", listener)
  return () => {
    nextWindow?.removeEventListener?.(
      dashboardPreferencesChangedEvent,
      listener,
    )
    nextWindow?.removeEventListener?.("storage", listener)
  }
}

export function isDashboardFeatureVisible(
  featureId: string,
  dashboardMode: DashboardVisibilityMode,
): boolean {
  return (
    dashboardMode === "advanced" ||
    dashboardBasicFeatureIds.includes(
      featureId as (typeof dashboardBasicFeatureIds)[number],
    )
  )
}

export function isDashboardSendShortcut(
  event: DashboardComposerKeyEvent,
  enterStyle: DashboardEnterStyle,
): boolean {
  if (event.key !== "Enter" || event.altKey) {
    return false
  }

  if (enterStyle === "enter-to-send") {
    return !event.shiftKey && !event.ctrlKey && !event.metaKey
  }

  return !event.shiftKey && (event.ctrlKey || event.metaKey)
}

export function dashboardEnterStyleShortLabel(
  enterStyle: DashboardEnterStyle,
): string {
  return enterStyle === "enter-to-send"
    ? "Enter submits"
    : "Ctrl/Cmd+Enter submits"
}

export function dashboardEnterStyleHint(
  enterStyle: DashboardEnterStyle,
): string {
  return enterStyle === "enter-to-send"
    ? "Enter to send, Shift+Enter for newline"
    : "Ctrl/Cmd+Enter to send, Enter for newline"
}
