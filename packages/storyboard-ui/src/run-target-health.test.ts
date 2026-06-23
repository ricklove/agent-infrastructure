import { describe, expect, test } from "bun:test"

import {
  normalizeRunTargetHealthChecks,
  normalizeRunTargets,
  normalizeWebRunTargetUrl,
  runTargetHealthAggregateOk,
  runTargetHealthApiPath,
  runTargetHealthSummary,
} from "./run-target-health"

describe("run target health provider payload parsing", () => {
  test("normalizes provider check lists, status values, and optional evidence fields", () => {
    const checks = normalizeRunTargetHealthChecks({
      ok: true,
      owner: "provider-owned",
      checks: [
        {
          key: "app-entrypoint",
          status: "pass",
          label: "App entrypoint reachable",
          detail: "Loaded /user-verification",
          owner: "provider",
          evidence: { url: "https://app.example.test/user-verification" },
          suggestedAction: "Keep app running",
        },
        {
          key: "backend-api",
          status: "warn",
          detail: "API is reachable but stale",
        },
        {
          key: "unknown-status",
          status: "mystery",
        },
        { status: "pass" },
      ],
    })

    expect(checks).toEqual([
      {
        key: "app-entrypoint",
        status: "pass",
        label: "App entrypoint reachable",
        detail: "Loaded /user-verification",
        owner: "provider",
        evidence: { url: "https://app.example.test/user-verification" },
        suggestedAction: "Keep app running",
      },
      {
        key: "backend-api",
        status: "warn",
        detail: "API is reachable but stale",
      },
      {
        key: "unknown-status",
        status: "unknown",
      },
    ])
    expect(runTargetHealthSummary(checks)).toEqual({ pass: 1, warn: 1, fail: 0, unknown: 1 })
  })

  test("normalizes single-check provider responses", () => {
    expect(
      normalizeRunTargetHealthChecks({
        ok: true,
        runTargetId: "storyboard:default",
        check: {
          key: "source-valid",
          status: "fail",
          detail: "storyboard.json is missing",
          suggestedAction: "Regenerate storyboard.json before running frames",
        },
      }),
    ).toEqual([
      {
        key: "source-valid",
        status: "fail",
        detail: "storyboard.json is missing",
        suggestedAction: "Regenerate storyboard.json before running frames",
      },
    ])
  })

  test("normalizes provider-named targets with generic config definitions", () => {
    const targets = normalizeRunTargets({
      ok: true,
      runTargets: [
        {
          id: "baseconnect-frontend-web",
          name: "baseconnect frontend web",
          kind: "web-app",
          owner: "bc-storyboard",
          configFields: [
            { key: "frontendWebUrl", label: "Frontend web URL", type: "url", required: true, status: "configured", value: "http://10.0.0.239:8086/" },
          ],
          healthCheckKeys: ["frontend-web-configured", "app-root-reachable"],
        },
      ],
    })
    expect(targets[0]?.id).toBe("baseconnect-frontend-web")
    expect(targets[0]?.configFields[0]?.key).toBe("frontendWebUrl")
    expect(targets[0]?.configFields[0]?.status).toBe("configured")
    expect(targets[0]?.healthCheckKeys).toEqual(["frontend-web-configured", "app-root-reachable"])
  })

  test("treats provider ok=true as not ready when any provider check fails", () => {
    const payload = {
      ok: true,
      checks: [
        { key: "app-entrypoint", status: "pass" },
        {
          key: "story-a-01-account-email-screenshot-semantic",
          status: "fail",
          label: "Blank canonical screenshot",
          detail: "The provider rejected the current PNG as blank/synthetic.",
          evidence: { sha256: "938030cfd33887f6b73b7cca2f54c4534e044c0f7efdcac37b4bbbb629d22b91", bytes: 6490 },
          remediation: "Regenerate the real-browser capture before advertising Run readiness.",
          checkedAt: "2026-06-11T00:00:00.000Z",
        },
      ],
    }

    const checks = normalizeRunTargetHealthChecks(payload)
    expect(runTargetHealthSummary(checks)).toEqual({ pass: 1, warn: 0, fail: 1, unknown: 0 })
    expect(runTargetHealthAggregateOk(payload)).toBe(false)
  })

  test("builds provider health URLs under the storyboard source URL", () => {
    expect(runTargetHealthApiPath("http://10.0.0.239:8898/onboarding", "run-target-health", "storyboard:default")).toBe(
      "http://10.0.0.239:8898/onboarding/run-target-health?runTargetId=storyboard%3Adefault",
    )
    expect(normalizeWebRunTargetUrl('{"kind":"web","url":" http://10.0.0.239:8086/ "}')).toBe("http://10.0.0.239:8086/")
  })
})
