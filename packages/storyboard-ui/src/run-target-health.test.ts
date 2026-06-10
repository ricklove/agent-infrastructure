import { describe, expect, test } from "bun:test"

import {
  normalizeRunTargetHealthChecks,
  normalizeWebRunTargetUrl,
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

  test("builds provider health URLs under the storyboard source URL", () => {
    expect(runTargetHealthApiPath("http://10.0.0.239:8898/onboarding", "run-target-health", "storyboard:default")).toBe(
      "http://10.0.0.239:8898/onboarding/run-target-health?runTargetId=storyboard%3Adefault",
    )
    expect(normalizeWebRunTargetUrl('{"kind":"web","url":" http://10.0.0.239:8086/ "}')).toBe("http://10.0.0.239:8086/")
  })
})
