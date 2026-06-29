import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import { createHealthApi } from "./health-api.js"

const repoRoot = resolve(import.meta.dir, "../../..")
const stateRoots: string[] = []

function tempStateRoot(): string {
  const path = mkdtempSync(join(tmpdir(), "dashboard-health-api-"))
  stateRoots.push(path)
  return path
}

function writeRuntimeSettings(
  stateRoot: string,
  relativePath: string,
  values: Record<string, unknown>,
  updatedAtUtc = new Date().toISOString(),
): void {
  const path = join(stateRoot, "runtime-settings", relativePath)
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, `${JSON.stringify({ updatedAtUtc, ...values }, null, 2)}\n`)
}

afterEach(() => {
  while (stateRoots.length > 0) {
    const path = stateRoots.pop()
    if (path) {
      rmSync(path, { force: true, recursive: true })
    }
  }
})

describe("dashboard health API", () => {
  test("lists health profiles from workspace definitions", async () => {
    const api = createHealthApi({ repoRoot, stateRoot: tempStateRoot() })
    const response = await api.handle(
      new Request("http://dashboard.local/api/health/profiles"),
    )

    expect(response?.status).toBe(200)
    const payload = (await response?.json()) as {
      ok: boolean
      profiles: Array<{ id: string; checkCount: number }>
    }
    expect(payload.ok).toBe(true)
    expect(
      payload.profiles.some(
        (profile) =>
          profile.id === "work_at_dashboard_app_quick_tunnel_surface",
      ),
    ).toBe(true)
    expect(
      payload.profiles.some(
        (profile) =>
          profile.id === "bc_storyboard_dev_dashboard_staging_backend",
      ),
    ).toBe(true)
    expect(
      payload.profiles.some(
        (profile) =>
          profile.id === "bc_storyboard_dev_dashboard_docker_backend",
      ),
    ).toBe(true)
    expect(payload.profiles.every((profile) => profile.checkCount > 0)).toBe(
      true,
    )
  })

  test("runs staging and docker storyboard profiles through the shared cold-start template", async () => {
    const stateRoot = tempStateRoot()
    writeRuntimeSettings(stateRoot, "bc-storyboard/onboarding.json", {
      storyboardUrl: "http://127.0.0.1:1/onboarding",
    })
    writeRuntimeSettings(stateRoot, "bc-frontend/staging.json", {
      frontendUrl: "http://127.0.0.1:1",
      bcFrontendQuickTunnelUrl: "",
      bcFrontendQuickTunnelStateUrl: "",
    })
    writeRuntimeSettings(stateRoot, "bc-frontend/docker.json", {
      frontendUrl: "http://127.0.0.1:1",
      backendApiUrl: "http://127.0.0.1:1",
      bcFrontendQuickTunnelUrl: "",
      bcFrontendQuickTunnelStateUrl: "",
    })
    const api = createHealthApi({ repoRoot, stateRoot })
    async function run(profileId: string) {
      const response = await api.handle(
        new Request("http://dashboard.local/api/health/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profileId,
            targetId: "local",
            params: {
              storyboardUrl: "http://127.0.0.1:1/onboarding",
              frontendUrl: "http://127.0.0.1:1",
              backendApiUrl: "http://127.0.0.1:1",
              localDashboardUrl: "http://127.0.0.1:1",
              publicDashboardUrl: "http://127.0.0.1:1",
              viteUrl: "http://127.0.0.1:1",
              bcFrontendQuickTunnelUrl: "",
              bcFrontendQuickTunnelStateUrl: "",
              timeoutSeconds: "1",
            },
          }),
        }),
      )
      expect(response?.status).toBe(202)
      return (await response?.json()) as {
        result: {
          profileId: string
          runId: string
          status: string
          root?: { status?: string }
          checks: Array<{
            status: string
            contractVersion?: string
            nodeKind?: string
            correlationId?: string
            dispatchPath?: string[]
            target?: { profileId?: string }
            evidence: {
              backendMode: string
              profileComposition: { template: string }
              children: Array<{ title: string }>
              providerRows: Array<{
                key: string
                label: string
                group: string
                status: string
                detail?: string
                owner?: string
                evidence?: Record<string, unknown>
              }>
            }
            children: Array<{
              title: string
              templateId?: string
              instanceId?: string
              target?: { profileId?: string }
              children?: Array<{ title: string }>
            }>
          }>
        }
      }
    }

    const staging = await run("bc_storyboard_dev_dashboard_staging_backend")
    const docker = await run("bc_storyboard_dev_dashboard_docker_backend")
    const stagingCheck = staging.result.checks[0]
    const dockerCheck = docker.result.checks[0]

    expect(staging.result.status).toBe("fail")
    expect(staging.result.root?.status).toBe("FAIL")
    expect(docker.result.status).toBe("fail")
    expect(docker.result.root?.status).toBe("FAIL")
    expect(stagingCheck?.status).toBe("FAIL")
    expect(dockerCheck?.status).toBe("FAIL")

    expect(stagingCheck?.evidence.profileComposition.template).toBe(
      "storyboard-cold-start-dev-dashboard-backend.v1",
    )
    expect(dockerCheck?.evidence.profileComposition.template).toBe(
      "storyboard-cold-start-dev-dashboard-backend.v1",
    )
    expect(stagingCheck?.evidence.backendMode).toBe("staging")
    expect(dockerCheck?.evidence.backendMode).toBe("docker")
    expect(stagingCheck?.children.map((child) => child.title)).toContain(
      "BaseConnect web app is running with the staging backend",
    )
    expect(dockerCheck?.children.map((child) => child.title)).toContain(
      "BaseConnect web app is running with the Docker backend",
    )
    expect(stagingCheck?.children.map((child) => child.title)).not.toContain(
      "BaseConnect web app is running with the Docker backend",
    )
    expect(stagingCheck?.children.map((child) => child.title)).toContain(
      "Public BC web app tunnel is available",
    )
    const quickTunnelRows = stagingCheck?.evidence.providerRows.filter(
      (row) => row.group === "bc-frontend web app quick tunnel",
    )
    expect(quickTunnelRows?.length).toBeGreaterThanOrEqual(3)
    expect(quickTunnelRows?.some((row) => row.owner === "bc-frontend")).toBe(
      true,
    )
    expect(
      quickTunnelRows?.some(
        (row) =>
          row.key === "bc-frontend-public-quick-tunnel-url-present" &&
          row.status === "fail" &&
          row.detail?.includes("bcFrontendQuickTunnelUrl"),
      ),
    ).toBe(true)
    expect(
      quickTunnelRows?.some(
        (row) =>
          row.key === "bc-frontend-quick-tunnel-staging-backend-proof" &&
          row.status === "fail" &&
          row.evidence?.backendApiUrl ===
            "https://api-staging.baseconnect-app.com",
      ),
    ).toBe(true)
    const stagingFailure = stagingCheck as
      | ({ failure?: { message?: string } } & typeof stagingCheck)
      | undefined
    const userFacingText = [
      stagingFailure?.failure?.message,
      stagingCheck?.children.map((child) => child.title).join("\n"),
      stagingCheck?.evidence.providerRows
        .map((row) => `${row.label}\n${row.group}\n${row.detail ?? ""}`)
        .join("\n"),
    ].join("\n")
    expect(userFacingText).not.toContain("10.0.0.239")
    expect(userFacingText).not.toContain("printing-nova-schema-parcel")
    expect(userFacingText).not.toContain("t_913b64c0")
    expect(stagingCheck?.contractVersion).toBe("health-node-result.v1")
    expect(stagingCheck?.nodeKind).toBe("check")
    expect(stagingCheck?.correlationId).toBe(staging.result.runId)
    expect(stagingCheck?.target?.profileId).toBe(
      "bc_storyboard_dev_dashboard_staging_backend",
    )
    expect(stagingCheck?.dispatchPath).toContain(
      "bc_storyboard_dev_dashboard_staging_backend_cold_start",
    )
    const stagingSource = stagingCheck?.children.find(
      (child) => child.title === "Storyboard source is reachable and valid",
    )
    const dockerSource = dockerCheck?.children.find(
      (child) => child.title === "Storyboard source is reachable and valid",
    )
    expect(stagingSource?.templateId).toBe(
      "storyboard-cold-start-dev-dashboard-backend.v1",
    )
    expect(dockerSource?.templateId).toBe(
      "storyboard-cold-start-dev-dashboard-backend.v1",
    )
    expect(stagingSource?.instanceId).not.toBe(dockerSource?.instanceId)
    expect(stagingSource?.target?.profileId).toBe(
      "bc_storyboard_dev_dashboard_staging_backend",
    )
    expect(dockerSource?.target?.profileId).toBe(
      "bc_storyboard_dev_dashboard_docker_backend",
    )
  })

  test("runtime settings reject stale state, override defaults, and fail clearly when missing", async () => {
    const freshStateRoot = tempStateRoot()
    writeRuntimeSettings(freshStateRoot, "bc-storyboard/onboarding.json", {
      storyboardUrl: "http://127.0.0.1:1/fresh-storyboard",
    })
    writeRuntimeSettings(freshStateRoot, "bc-frontend/staging.json", {
      frontendUrl: "http://127.0.0.1:2",
      bcFrontendQuickTunnelUrl: "https://fresh-bc.example.test",
    })
    const freshApi = createHealthApi({ repoRoot, stateRoot: freshStateRoot })
    const freshResponse = await freshApi.handle(
      new Request("http://dashboard.local/api/health/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profileId: "bc_storyboard_dev_dashboard_staging_backend",
          targetId: "local",
          params: {
            storyboardUrl: "http://stale-profile-default.example/onboarding",
            frontendUrl: "http://stale-profile-default.example",
            localDashboardUrl: "http://127.0.0.1:1",
            publicDashboardUrl: "http://127.0.0.1:1",
            viteUrl: "http://127.0.0.1:1",
            timeoutSeconds: "1",
          },
        }),
      }),
    )
    expect(freshResponse?.status).toBe(202)
    const freshPayload = (await freshResponse?.json()) as {
      result: { params: Record<string, unknown>; checks: Array<{ checkId: string }> }
    }
    expect(freshPayload.result.params.storyboardUrl).toBe(
      "http://127.0.0.1:1/fresh-storyboard",
    )
    expect(freshPayload.result.params.frontendUrl).toBe("http://127.0.0.1:2")
    expect(freshPayload.result.checks[0]?.checkId).toBe(
      "storyboard_cold_start_dev_dashboard_backend",
    )

    const staleStateRoot = tempStateRoot()
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    writeRuntimeSettings(
      staleStateRoot,
      "bc-storyboard/onboarding.json",
      { storyboardUrl: "http://127.0.0.1:1/onboarding" },
      old,
    )
    writeRuntimeSettings(
      staleStateRoot,
      "bc-frontend/staging.json",
      { frontendUrl: "http://127.0.0.1:1" },
      old,
    )
    const staleApi = createHealthApi({ repoRoot, stateRoot: staleStateRoot })
    const staleResponse = await staleApi.handle(
      new Request("http://dashboard.local/api/health/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profileId: "bc_storyboard_dev_dashboard_staging_backend",
          targetId: "local",
          params: { timeoutSeconds: "1" },
        }),
      }),
    )
    const stalePayload = (await staleResponse?.json()) as {
      result: { checks: Array<{ status: string; failure?: { class?: string } }> }
    }
    expect(stalePayload.result.checks[0]?.status).toBe("BLOCKED")
    expect(stalePayload.result.checks[0]?.failure?.class).toBe("CONFIG_STALE")

    const missingApi = createHealthApi({ repoRoot, stateRoot: tempStateRoot() })
    const missingResponse = await missingApi.handle(
      new Request("http://dashboard.local/api/health/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profileId: "bc_storyboard_dev_dashboard_staging_backend",
          targetId: "local",
          params: { timeoutSeconds: "1" },
        }),
      }),
    )
    const missingPayload = (await missingResponse?.json()) as {
      result: { checks: Array<{ status: string; failure?: { class?: string; message?: string }; evidence?: Record<string, unknown> }> }
    }
    expect(missingPayload.result.checks[0]?.status).toBe("BLOCKED")
    expect(missingPayload.result.checks[0]?.failure?.class).toBe("CONFIG_MISSING")
    expect(missingPayload.result.checks[0]?.evidence?.humanActionRequired).toBe(true)
  })

  test("BC frontend health profiles do not hard-code ephemeral URLs", () => {
    for (const profilePath of [
      "workspace/health/profiles/bc-storyboard-dev-dashboard-staging-backend.health-profile.json",
      "workspace/health/profiles/bc-storyboard-dev-dashboard-docker-backend.health-profile.json",
    ]) {
      const text = readFileSync(join(repoRoot, profilePath), "utf8")
      expect(text).not.toContain("10.0.0.")
      expect(text).not.toContain("trycloudflare.com")
      expect(text).toContain("runtimeSettings")
    }
  })

  test("runs a profile and persists the latest result", async () => {
    const stateRoot = tempStateRoot()
    const api = createHealthApi({ repoRoot, stateRoot })
    const response = await api.handle(
      new Request("http://dashboard.local/api/health/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profileId: "work_at_dashboard_app_live_dev_surface",
          targetId: "local",
          params: {
            appPath: `${repoRoot}/apps/dashboard-app`,
            localDevUrl: "http://127.0.0.1:1/storyboard/debug/",
            liveDevUrl: "http://127.0.0.1:1/storyboard/debug/",
            liveDevMustContain: "@vite/client",
          },
        }),
      }),
    )

    expect(response?.status).toBe(202)
    const payload = (await response?.json()) as {
      ok: boolean
      result: {
        runId: string
        profileId: string
        status: string
        checks: Array<{ id: string; status: string; failure: unknown }>
      }
    }
    expect(payload.ok).toBe(true)
    expect(payload.result.profileId).toBe(
      "work_at_dashboard_app_live_dev_surface",
    )
    expect(payload.result.runId).toStartWith("health_")
    expect(payload.result.checks.length).toBeGreaterThan(0)
    expect(
      payload.result.checks.some(
        (check) => check.id === "target_live_dev_surface_ok",
      ),
    ).toBe(true)

    const latestResponse = await api.handle(
      new Request(
        "http://dashboard.local/api/health/latest?profileId=work_at_dashboard_app_live_dev_surface",
      ),
    )
    expect(latestResponse?.status).toBe(200)
    const latest = (await latestResponse?.json()) as {
      result: { runId: string }
    }
    expect(latest.result.runId).toBe(payload.result.runId)

    const persisted = JSON.parse(
      readFileSync(
        join(
          stateRoot,
          "health/latest/work_at_dashboard_app_live_dev_surface.json",
        ),
        "utf8",
      ),
    ) as { runId: string }
    expect(persisted.runId).toBe(payload.result.runId)
  })
})
