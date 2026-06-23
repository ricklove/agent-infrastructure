import { useEffect, useMemo, useState } from "react"
import type {
  HealthCheckDefinition,
  HealthDashboardPayload,
  HealthProfile,
  HealthProfileCheck,
} from "./types.js"

type HealthDashboardScreenProps = {
  apiRootUrl?: string
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; payload: HealthDashboardPayload }
  | { status: "error"; message: string }

const severityStyles: Record<string, { background: string; color: string }> = {
  blocking: { background: "#fee2e2", color: "#991b1b" },
  warn: { background: "#fef3c7", color: "#92400e" },
  info: { background: "#dbeafe", color: "#1e40af" },
}

function stylesForSeverity(severity: string) {
  return severityStyles[severity] ?? { background: "#e5e7eb", color: "#374151" }
}

function ProfileList({
  profiles,
  selectedProfileId,
  onSelect,
}: {
  profiles: HealthProfile[]
  selectedProfileId: string | null
  onSelect: (profileId: string) => void
}) {
  return (
    <nav style={{ display: "grid", gap: 8 }} aria-label="Health profiles">
      {profiles.map((profile) => {
        const selected = profile.id === selectedProfileId
        return (
          <button
            key={profile.id}
            type="button"
            onClick={() => onSelect(profile.id)}
            style={{
              textAlign: "left",
              border: selected ? "1px solid #2563eb" : "1px solid #d1d5db",
              background: selected ? "#eff6ff" : "#fff",
              borderRadius: 10,
              padding: "10px 12px",
              cursor: "pointer",
            }}
          >
            <strong style={{ display: "block", color: "#111827" }}>{profile.title}</strong>
            <span style={{ color: "#6b7280", fontSize: 12 }}>{profile.id}</span>
            <span style={{ color: "#4b5563", fontSize: 12, display: "block", marginTop: 4 }}>
              {profile.checks.length} checks
            </span>
          </button>
        )
      })}
    </nav>
  )
}

function DefinitionSummary({ definitions }: { definitions: HealthCheckDefinition[] }) {
  return (
    <section style={panelStyle}>
      <h2 style={sectionHeadingStyle}>Check definitions</h2>
      <p style={mutedStyle}>
        {definitions.length} reusable check definitions loaded from workspace/health/checks.
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        {definitions.map((definition) => (
          <div key={definition.id} style={definitionCardStyle}>
            <strong>{definition.title}</strong>
            <code style={codeStyle}>{definition.id}</code>
            {definition.description ? <p style={mutedStyle}>{definition.description}</p> : null}
          </div>
        ))}
      </div>
    </section>
  )
}

function ParamsTable({ params }: { params?: Record<string, string> }) {
  const entries = Object.entries(params ?? {})
  if (entries.length === 0) {
    return <p style={mutedStyle}>No default params declared.</p>
  }
  return (
    <table style={tableStyle}>
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key}>
            <th style={paramKeyStyle}>{key}</th>
            <td style={cellStyle}><code style={codeStyle}>{value}</code></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function groupChecksBySeverity(checks: HealthProfileCheck[]) {
  return checks.reduce<Record<string, HealthProfileCheck[]>>((groups, check) => {
    groups[check.severity] = [...(groups[check.severity] ?? []), check]
    return groups
  }, {})
}

function CheckTable({ checks }: { checks: HealthProfileCheck[] }) {
  const groupedChecks = groupChecksBySeverity(checks)
  const severities = Object.keys(groupedChecks).sort((a, b) => {
    const order = ["blocking", "warn", "info"]
    const aIndex = order.indexOf(a)
    const bIndex = order.indexOf(b)
    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex) || a.localeCompare(b)
  })

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {severities.map((severity) => (
        <section key={severity}>
          <h3 style={groupHeadingStyle}>{severity} checks</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={headerCellStyle}>ID</th>
                  <th style={headerCellStyle}>Title</th>
                  <th style={headerCellStyle}>Severity</th>
                  <th style={headerCellStyle}>Check ID</th>
                  <th style={headerCellStyle}>Repair hint</th>
                </tr>
              </thead>
              <tbody>
                {groupedChecks[severity].map((check) => {
                  const severityStyle = stylesForSeverity(check.severity)
                  return (
                    <tr key={check.id}>
                      <td style={cellStyle}><code style={codeStyle}>{check.id}</code></td>
                      <td style={cellStyle}>{check.title}</td>
                      <td style={cellStyle}>
                        <span style={{ ...pillStyle, ...severityStyle }}>{check.severity}</span>
                      </td>
                      <td style={cellStyle}><code style={codeStyle}>{check.checkId}</code></td>
                      <td style={{ ...cellStyle, minWidth: 260 }}>{check.repairHint ?? "—"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}

export function HealthDashboardScreen({ apiRootUrl = "/api/health-dashboard" }: HealthDashboardScreenProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setState({ status: "loading" })
    fetch(`${apiRootUrl}/profiles`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Health API returned HTTP ${response.status}`)
        }
        return (await response.json()) as HealthDashboardPayload
      })
      .then((payload) => {
        if (cancelled) return
        setState({ status: "ready", payload })
        setSelectedProfileId((current) => current ?? payload.profiles[0]?.id ?? null)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Failed to load health profiles",
        })
      })
    return () => {
      cancelled = true
    }
  }, [apiRootUrl])

  const selectedProfile = useMemo(() => {
    if (state.status !== "ready") return null
    return state.payload.profiles.find((profile) => profile.id === selectedProfileId) ?? state.payload.profiles[0] ?? null
  }, [selectedProfileId, state])

  if (state.status === "loading") {
    return <main style={screenStyle}>Loading health profiles…</main>
  }

  if (state.status === "error") {
    return (
      <main style={screenStyle}>
        <section style={panelStyle}>
          <h1 style={titleStyle}>Health Dashboard</h1>
          <p style={{ color: "#991b1b" }}>{state.message}</p>
          <p style={mutedStyle}>Expected API root: <code style={codeStyle}>{apiRootUrl}</code></p>
        </section>
      </main>
    )
  }

  return (
    <main style={screenStyle}>
      <header style={{ marginBottom: 20 }}>
        <p style={eyebrowStyle}>Dashboard feature plugin</p>
        <h1 style={titleStyle}>Health Dashboard</h1>
        <p style={mutedStyle}>
          Universal health profile browser for worker surface checks. Target execution and profile run controls are intentionally represented as placeholders for the next API milestone.
        </p>
      </header>

      <section style={contextPanelStyle}>
        <div>
          <strong>Target context</strong>
          <p style={mutedStyle}>Future run API: choose work target, resolve profile params, execute selected profile, stream machine-readable results.</p>
        </div>
        <div><code style={codeStyle}>{state.payload.context.profilesRoot}</code></div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 320px) 1fr", gap: 20, alignItems: "start" }}>
        <section style={panelStyle}>
          <h2 style={sectionHeadingStyle}>Profiles</h2>
          <ProfileList profiles={state.payload.profiles} selectedProfileId={selectedProfile?.id ?? null} onSelect={setSelectedProfileId} />
        </section>

        <div style={{ display: "grid", gap: 20 }}>
          {selectedProfile ? (
            <section style={panelStyle}>
              <p style={eyebrowStyle}>{selectedProfile.id}</p>
              <h2 style={sectionHeadingStyle}>{selectedProfile.title}</h2>
              {selectedProfile.description ? <p style={mutedStyle}>{selectedProfile.description}</p> : null}
              <h3 style={groupHeadingStyle}>Profile params</h3>
              <ParamsTable params={selectedProfile.params} />
              <h3 style={groupHeadingStyle}>Grouped checks</h3>
              <CheckTable checks={selectedProfile.checks} />
            </section>
          ) : (
            <section style={panelStyle}>No health profiles found.</section>
          )}
          <DefinitionSummary definitions={state.payload.checkDefinitions} />
        </div>
      </div>
    </main>
  )
}

const screenStyle: React.CSSProperties = {
  minHeight: "100%",
  background: "#f8fafc",
  color: "#111827",
  padding: 24,
  boxSizing: "border-box",
}

const panelStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 18,
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
}

const contextPanelStyle: React.CSSProperties = {
  ...panelStyle,
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 16,
  alignItems: "center",
  marginBottom: 20,
}

const titleStyle: React.CSSProperties = { fontSize: 34, margin: "0 0 8px" }
const sectionHeadingStyle: React.CSSProperties = { fontSize: 22, margin: "0 0 12px" }
const groupHeadingStyle: React.CSSProperties = { fontSize: 15, margin: "18px 0 8px", color: "#374151", textTransform: "uppercase", letterSpacing: "0.04em" }
const eyebrowStyle: React.CSSProperties = { color: "#2563eb", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }
const mutedStyle: React.CSSProperties = { color: "#6b7280", lineHeight: 1.5, margin: "6px 0" }
const codeStyle: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12, background: "#f3f4f6", padding: "2px 5px", borderRadius: 6 }
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 }
const headerCellStyle: React.CSSProperties = { textAlign: "left", borderBottom: "1px solid #d1d5db", padding: "8px 10px", color: "#4b5563" }
const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "9px 10px", verticalAlign: "top" }
const paramKeyStyle: React.CSSProperties = { ...cellStyle, textAlign: "left", width: 180, color: "#374151" }
const pillStyle: React.CSSProperties = { borderRadius: 999, padding: "3px 8px", fontSize: 12, fontWeight: 700 }
const definitionCardStyle: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, display: "grid", gap: 4 }
