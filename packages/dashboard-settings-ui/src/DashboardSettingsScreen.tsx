import {
  dashboardSessionFetch,
  readDashboardPreferences,
  subscribeDashboardPreferences,
  writeDashboardPreferences,
  type DashboardEnterStyle,
  type DashboardVisibilityMode,
} from "@agent-infrastructure/dashboard-plugin"
import { type ReactNode, useEffect, useState } from "react"

type RuntimeReleaseRecord = {
  tag: string
  version: string | null
}

type RuntimeReleaseStatus = {
  ok: true
  currentVersion: string
  currentReleaseTag: string | null
  latestReleaseTag: string | null
  latestVersion: string | null
  updateAvailable: boolean
  recentReleaseTags: RuntimeReleaseRecord[]
}

function SettingsCard(props: {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur">
      <div className="mb-5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300/80">
          {props.eyebrow}
        </div>
        <h2 className="mt-2 text-xl font-semibold text-white">{props.title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
          {props.description}
        </p>
      </div>
      {props.children}
    </section>
  )
}

function OptionButton<T extends string>(props: {
  name: string
  value: T
  currentValue: T
  title: string
  description: string
  onChange(nextValue: T): void
}) {
  const checked = props.value === props.currentValue

  return (
    <label
      className={[
        "flex cursor-pointer items-start gap-4 rounded-3xl border px-4 py-4 transition",
        checked
          ? "border-cyan-300/50 bg-cyan-300/10 text-white"
          : "border-white/10 bg-slate-950/70 text-slate-200 hover:border-white/20 hover:bg-white/[0.03]",
      ].join(" ")}
    >
      <input
        type="radio"
        name={props.name}
        value={props.value}
        checked={checked}
        onChange={() => props.onChange(props.value)}
        className="mt-1 h-4 w-4 accent-cyan-300"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{props.title}</span>
        <span className="mt-1 block text-sm leading-6 text-slate-400">
          {props.description}
        </span>
      </span>
    </label>
  )
}

export function DashboardSettingsScreen() {
  const [preferences, setPreferences] = useState(() => readDashboardPreferences())
  const [runtimeReleaseStatus, setRuntimeReleaseStatus] =
    useState<RuntimeReleaseStatus | null>(null)
  const [runtimeReleaseError, setRuntimeReleaseError] = useState("")
  const [runtimeActionMessage, setRuntimeActionMessage] = useState("")
  const [selectedReleaseTag, setSelectedReleaseTag] = useState("")
  const [runtimeActionPending, setRuntimeActionPending] = useState(false)

  useEffect(() => {
    return subscribeDashboardPreferences(() => {
      setPreferences(readDashboardPreferences())
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadRuntimeReleaseStatus() {
      try {
        setRuntimeReleaseError("")
        const response = (await dashboardSessionFetch(
          "/api/runtime-release",
        )) as Response
        if (!response.ok) {
          throw new Error("failed to load runtime release status")
        }

        const payload = (await response.json()) as RuntimeReleaseStatus
        if (cancelled) {
          return
        }

        setRuntimeReleaseStatus(payload)
        setSelectedReleaseTag((currentValue) =>
          currentValue || payload.latestReleaseTag || payload.recentReleaseTags[0]?.tag || "",
        )
      } catch (nextError) {
        if (!cancelled) {
          setRuntimeReleaseError(
            nextError instanceof Error
              ? nextError.message
              : "failed to load runtime release status",
          )
        }
      }
    }

    void loadRuntimeReleaseStatus()
    return () => {
      cancelled = true
    }
  }, [])

  function updateDashboardMode(dashboardMode: DashboardVisibilityMode) {
    setPreferences(writeDashboardPreferences({ dashboardMode }))
  }

  function updateEnterStyle(enterStyle: DashboardEnterStyle) {
    setPreferences(writeDashboardPreferences({ enterStyle }))
  }

  async function requestRuntimeDeploy(
    payload: { target: "latest" } | { target: "tag"; tag: string },
  ) {
    try {
      setRuntimeActionPending(true)
      setRuntimeActionMessage("")
      setRuntimeReleaseError("")
      const response = (await dashboardSessionFetch(
        "/api/runtime-release/deploy",
        {
          method: "POST",
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
          body: JSON.stringify(payload),
        },
      )) as Response
      if (!response.ok && response.status !== 202) {
        throw new Error("failed to request deploy")
      }

      setRuntimeActionMessage(
        payload.target === "latest"
          ? "Latest release deploy requested. The dashboard may reconnect while the manager restarts."
          : `Deploy requested for ${payload.tag}. The dashboard may reconnect while the manager restarts.`,
      )
    } catch (nextError) {
      setRuntimeReleaseError(
        nextError instanceof Error
          ? nextError.message
          : "failed to request deploy",
      )
    } finally {
      setRuntimeActionPending(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_28%),linear-gradient(180deg,_#0b1220_0%,_#020617_100%)] px-4 py-6 text-slate-100 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 max-w-3xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
            Dashboard Settings
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Tune the dashboard for focus or full access.
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            These preferences apply across the shared dashboard shell and its
            message composers on this browser.
          </p>
        </div>

        <div className="space-y-6">
          <SettingsCard
            eyebrow="Visibility"
            title="Basic or Advanced"
            description="Basic keeps the shell trimmed to the core workflow. Advanced restores every first-party plugin."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <OptionButton
                name="dashboard-mode"
                value="basic"
                currentValue={preferences.dashboardMode}
                title="Basic"
                description="Only show Chat, Swarm, Projects, and Settings."
                onChange={updateDashboardMode}
              />
              <OptionButton
                name="dashboard-mode"
                value="advanced"
                currentValue={preferences.dashboardMode}
                title="Advanced"
                description="Show Chat, Swarm, the rest of the plugins, Projects, and Settings."
                onChange={updateDashboardMode}
              />
            </div>
          </SettingsCard>

          <SettingsCard
            eyebrow="Composer"
            title="Enter Style"
            description="Choose how multi-line chat inputs treat the Enter key across dashboard message composers."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <OptionButton
                name="enter-style"
                value="enter-to-send"
                currentValue={preferences.enterStyle}
                title="Enter to Send"
                description="Press Enter to send. Use Shift+Enter when you need a new line."
                onChange={updateEnterStyle}
              />
              <OptionButton
                name="enter-style"
                value="mod-enter-to-send"
                currentValue={preferences.enterStyle}
                title="Ctrl/Cmd+Enter to Send"
                description="Press Enter for a new line. Use Ctrl+Enter on Windows/Linux or Cmd+Enter on macOS to send."
                onChange={updateEnterStyle}
              />
            </div>
          </SettingsCard>

          <SettingsCard
            eyebrow="Release"
            title="Runtime Release"
            description="Check the deployed dashboard release, compare it with the latest visible release tag, and deploy the latest release or a specific existing release tag."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-slate-950/70 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Current
                </div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {runtimeReleaseStatus?.currentReleaseTag ?? "Untagged runtime"}
                </div>
                <div className="mt-2 text-sm text-slate-400">
                  {runtimeReleaseStatus?.currentVersion ?? "Loading version..."}
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-slate-950/70 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Latest
                </div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {runtimeReleaseStatus?.latestReleaseTag ?? "No release tags found"}
                </div>
                <div className="mt-2 text-sm text-slate-400">
                  {runtimeReleaseStatus?.latestVersion ?? "No canonical release version yet"}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void requestRuntimeDeploy({ target: "latest" })}
                disabled={runtimeActionPending}
                className="inline-flex items-center justify-center rounded-full border border-cyan-300/35 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Deploy Latest
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">
                  Specific release tag
                </span>
                <select
                  value={selectedReleaseTag}
                  onChange={(event) => setSelectedReleaseTag(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/50"
                >
                  {runtimeReleaseStatus?.recentReleaseTags.length ? (
                    runtimeReleaseStatus.recentReleaseTags.map((release) => (
                      <option key={release.tag} value={release.tag}>
                        {release.tag}
                      </option>
                    ))
                  ) : (
                    <option value="">No release tags available</option>
                  )}
                </select>
              </label>
              <button
                type="button"
                onClick={() =>
                  selectedReleaseTag
                    ? void requestRuntimeDeploy({
                        target: "tag",
                        tag: selectedReleaseTag,
                      })
                    : undefined
                }
                disabled={runtimeActionPending || !selectedReleaseTag}
                className="self-end inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Deploy Selected
              </button>
            </div>

            {runtimeReleaseStatus?.updateAvailable ? (
              <p className="mt-4 text-sm text-amber-200">
                A newer visible release tag is available than the one currently deployed.
              </p>
            ) : null}
            {runtimeActionMessage ? (
              <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm leading-6 text-cyan-100">
                {runtimeActionMessage}
              </div>
            ) : null}
            {runtimeReleaseError ? (
              <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm leading-6 text-rose-100">
                {runtimeReleaseError}
              </div>
            ) : null}
          </SettingsCard>
        </div>
      </div>
    </div>
  )
}
