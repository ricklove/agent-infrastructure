import {
  dashboardEnterStyleHint,
  readDashboardPreferences,
  subscribeDashboardPreferences,
  writeDashboardPreferences,
  type DashboardEnterStyle,
  type DashboardVisibilityMode,
} from "@agent-infrastructure/dashboard-plugin"
import { type ReactNode, useEffect, useState } from "react"

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

  useEffect(() => {
    return subscribeDashboardPreferences(() => {
      setPreferences(readDashboardPreferences())
    })
  }, [])

  function updateDashboardMode(dashboardMode: DashboardVisibilityMode) {
    setPreferences(writeDashboardPreferences({ dashboardMode }))
  }

  function updateEnterStyle(enterStyle: DashboardEnterStyle) {
    setPreferences(writeDashboardPreferences({ enterStyle }))
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
            <p className="mt-4 text-sm text-slate-400">
              Current behavior: {dashboardEnterStyleHint(preferences.enterStyle)}
            </p>
          </SettingsCard>
        </div>
      </div>
    </div>
  )
}
