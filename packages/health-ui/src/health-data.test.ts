import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, test } from "bun:test"
import { loadHealthDashboardPayload } from "./health-data.js"

describe("loadHealthDashboardPayload", () => {
  test("loads profile and check definition files from workspace/health", () => {
    const root = mkdtempSync(join(tmpdir(), "health-dashboard-"))
    mkdirSync(join(root, "workspace/health/profiles"), { recursive: true })
    mkdirSync(join(root, "workspace/health/checks"), { recursive: true })
    writeFileSync(
      join(root, "workspace/health/profiles/example.health-profile.json"),
      JSON.stringify({
        id: "example_profile",
        title: "Example Profile",
        description: "Example profile description",
        params: { targetPath: "{{targetPath}}" },
        checks: [
          {
            id: "target_reachable",
            checkId: "work_at_target_reachable",
            title: "Target reachable",
            severity: "blocking",
            repairHint: "Register the target.",
          },
        ],
      }),
    )
    writeFileSync(
      join(root, "workspace/health/checks/example.health-check.json"),
      JSON.stringify({
        id: "work_at_target_reachable",
        title: "work-at target reachable",
        description: "Checks target reachability.",
        timeoutMs: 1000,
      }),
    )

    const payload = loadHealthDashboardPayload(root)

    expect(payload.profiles).toHaveLength(1)
    expect(payload.profiles[0].checks[0]).toMatchObject({
      id: "target_reachable",
      checkId: "work_at_target_reachable",
      severity: "blocking",
    })
    expect(payload.checkDefinitions).toHaveLength(1)
    expect(payload.checkDefinitions[0].sourcePath).toBe(
      "workspace/health/checks/example.health-check.json",
    )
  })
})
