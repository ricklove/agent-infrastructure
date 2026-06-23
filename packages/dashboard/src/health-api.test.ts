import { mkdtempSync, readFileSync, rmSync } from "node:fs"
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
        (profile) => profile.id === "work_at_dashboard_app_quick_tunnel_surface",
      ),
    ).toBe(true)
    expect(payload.profiles.every((profile) => profile.checkCount > 0)).toBe(true)
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
    expect(payload.result.profileId).toBe("work_at_dashboard_app_live_dev_surface")
    expect(payload.result.runId).toStartWith("health_")
    expect(payload.result.checks.length).toBeGreaterThan(0)
    expect(
      payload.result.checks.some((check) => check.id === "target_live_dev_surface_ok"),
    ).toBe(true)

    const latestResponse = await api.handle(
      new Request(
        "http://dashboard.local/api/health/latest?profileId=work_at_dashboard_app_live_dev_surface",
      ),
    )
    expect(latestResponse?.status).toBe(200)
    const latest = (await latestResponse?.json()) as { result: { runId: string } }
    expect(latest.result.runId).toBe(payload.result.runId)

    const persisted = JSON.parse(
      readFileSync(
        join(stateRoot, "health/latest/work_at_dashboard_app_live_dev_surface.json"),
        "utf8",
      ),
    ) as { runId: string }
    expect(persisted.runId).toBe(payload.result.runId)
  })
})
