import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { StoryboardDebugIndexScreen } from "./DebugCatalog"
import {
  RunTargetHealthPanel,
  StoryboardRunTargetHealthScreen,
  buildRunAssetCacheKey,
  documentToSequences,
  findSelectionForFrameId,
  readStoryboardEditorQuery,
} from "./storyboardEditorScenarios"
import {
  rewriteLoopbackUrlForStoryboardSource,
  rewriteLoopbackUrlsInActionForStoryboardSource,
} from "../storyboard-action-url"
import type { StoryboardDocument } from "../storyboard-document"

const bcn814Storyboard: StoryboardDocument = {
  id: "bcn-814-group-delete-real-app",
  title: "BCN-814: easier group deletion real app flow",
  stories: [
    {
      id: "story-a-successful-empty-subgroup-delete",
      title: "Admin deletes an empty subgroup",
      frames: [
        {
          id: "story-a-empty-subgroup-confirm-delete",
          title: "Admin confirms the normal delete prompt",
          captureSets: {
            default: {
              screenshots: {
                desktop:
                  "assets/agent-browser-user-stories/story-a-02-empty-subgroup-confirm-delete.desktop.png",
              },
            },
          },
          transitions: [],
        },
      ],
      branches: [],
    },
    {
      id: "story-b-blocked-non-empty-subgroup-delete",
      title: "Admin cannot delete a non-empty subgroup",
      frames: [
        {
          id: "story-b-non-empty-subgroup-blocked-error-remains",
          title: "Blocked delete shows why and the group remains visible",
          captureSets: {
            default: {
              screenshots: {
                desktop:
                  "assets/agent-browser-user-stories/story-b-02-non-empty-subgroup-blocked-error-remains.desktop.png",
              },
            },
          },
          transitions: [],
        },
      ],
      branches: [],
    },
    {
      id: "story-c-manager-successful-empty-subgroup-delete",
      title: "Group admin manager deletes an empty subgroup",
      frames: [
        {
          id: "story-c-manager-empty-subgroup-confirm-delete",
          title: "Manager confirms the normal delete prompt",
          captureSets: {
            default: {
              screenshots: {
                desktop:
                  "assets/agent-browser-user-stories/story-c-02-manager-empty-subgroup-confirm-delete.desktop.png",
              },
            },
          },
          transitions: [],
        },
      ],
      branches: [],
    },
  ],
}

describe("RunTargetHealthPanel", () => {
  test("renders provider-owned health checks with status rows and controls", () => {
    const html = renderToStaticMarkup(
      createElement(RunTargetHealthPanel, {
        state: {
          open: true,
          runTargetId: "storyboard:default",
          runTargetLabel: "Storyboard default run target",
          runTargetUrl: "http://10.0.0.239:8086/",
          owner: "bc-storyboard",
          loading: false,
          error: null,
          checks: [
            {
              key: "app-entrypoint",
              status: "pass",
              label: "App entrypoint reachable",
              detail: "Loaded the app entrypoint.",
              owner: "provider",
              evidence: { url: "http://10.0.0.239:8086/" },
            },
            {
              key: "backend-api",
              status: "warn",
              detail: "Backend is reachable but reports stale fixtures.",
              suggestedAction: "Restart the provider-owned backend.",
            },
          ],
        },
      }),
    )

    expect(html).toContain("Run Target Health")
    expect(html).toContain("Provider-owned checks make sure")
    expect(html).toContain("Provider:")
    expect(html).toContain("bc-storyboard")
    expect(html).toContain("Refresh status")
    expect(html).toContain("Run all checks")
    expect(html).toContain("app-entrypoint")
    expect(html).toContain("pass: 1")
    expect(html).toContain("warn: 1")
    expect(html).toContain("Suggested action: Restart the provider-owned backend.")
  })

  test("renders unsupported health API state distinctly from run failure", () => {
    const html = renderToStaticMarkup(
      createElement(RunTargetHealthPanel, {
        state: {
          open: true,
          runTargetId: "storyboard:default",
          runTargetLabel: "Storyboard default run target",
          loading: false,
          error: "Provider Run Target Health API returned HTTP 404",
          checks: [],
        },
      }),
    )

    expect(html).toContain("Health API unavailable or unsupported")
    expect(html).toContain("Provider Run Target Health API returned HTTP 404")
    expect(html).not.toContain("Run failed")
  })
})

describe("Storyboard debug index", () => {
  test("links to the standalone Run Target Health work surface", () => {
    const html = renderToStaticMarkup(createElement(StoryboardDebugIndexScreen))
    expect(html).toContain("Run Target Health")
    expect(html).toContain("/storyboard/debug/storyboardRunTargetHealth/")
    expect(html).toContain("Standalone provider-named run target config and health check tool")
  })
})

describe("StoryboardRunTargetHealthScreen", () => {
  test("renders as a standalone dedicated run target health work surface", () => {
    const html = renderToStaticMarkup(createElement(StoryboardRunTargetHealthScreen))
    expect(html).toContain("Standalone Run Target Health")
    expect(html).toContain("Provider-owned run targets, config, and health checks")
    expect(html).toContain("Provider-named targets")
    expect(html).toContain("Select a provider-named run target")
  })
})

describe("remote storyboard deep links", () => {
  test("reads storyboardUrl and frameId from the exact /storyboard query shape", () => {
    expect(
      readStoryboardEditorQuery(
        "?storyboardUrl=http%3A%2F%2F10.0.0.239%3A8898%2Fbcn-814-group-delete-real-app&frameId=story-a-empty-subgroup-confirm-delete",
      ),
    ).toEqual({
      storyboardUrl: "http://10.0.0.239:8898/bcn-814-group-delete-real-app",
      frameId: "story-a-empty-subgroup-confirm-delete",
    })
  })

  test("maps the bcn-814 story-a and story-b frameIds to their own stories", () => {
    expect(
      findSelectionForFrameId(
        bcn814Storyboard,
        "story-a-empty-subgroup-confirm-delete",
      ),
    ).toEqual({
      kind: "frame",
      storyId: "story-a-successful-empty-subgroup-delete",
      frameId: "story-a-empty-subgroup-confirm-delete",
    })

    expect(
      findSelectionForFrameId(
        bcn814Storyboard,
        "story-b-non-empty-subgroup-blocked-error-remains",
      ),
    ).toEqual({
      kind: "frame",
      storyId: "story-b-blocked-non-empty-subgroup-delete",
      frameId: "story-b-non-empty-subgroup-blocked-error-remains",
    })
  })

  test("uses job/provenance in screenshot cache-busting keys", () => {
    expect(
      buildRunAssetCacheKey({
        jobId: "job-story-a-desktop-123",
        completedAt: "2026-06-08T21:20:00.000Z",
        outputAssetHash: "sha256:new-image-bytes",
      }),
    ).toBe("job-story-a-desktop-123::2026-06-08T21:20:00.000Z::sha256:new-image-bytes")

    expect(
      buildRunAssetCacheKey({
        completedAt: "2026-06-08T21:20:00.000Z",
      }),
    ).toBe("2026-06-08T21:20:00.000Z")
  })

  test("rewrites loopback run-script URLs to the remote storyboard host for bcn-814 story-a/story-c parity", () => {
    expect(
      rewriteLoopbackUrlForStoryboardSource(
        "http://127.0.0.1:19041/groups/manage/group/729520f0-a002-4897-ad14-f7b5b557db41",
        "http://10.0.0.239:8898/bcn-814-group-delete-real-app",
      ),
    ).toBe("http://10.0.0.239:19041/groups/manage/group/729520f0-a002-4897-ad14-f7b5b557db41")

    expect(
      rewriteLoopbackUrlsInActionForStoryboardSource(
        "open http://127.0.0.1:19041/groups/manage/group/c30d5ebe-d9af-40e2-8de8-8bc61b60f748 while logged in",
        "http://10.0.0.239:8898/bcn-814-group-delete-real-app",
      ),
    ).toContain("http://10.0.0.239:19041/groups/manage/group/c30d5ebe-d9af-40e2-8de8-8bc61b60f748")
  })

  test("maps the bcn-814 story-a and story-c confirmation frames to distinct confirm-delete controls", () => {
    expect(
      findSelectionForFrameId(
        bcn814Storyboard,
        "story-a-empty-subgroup-confirm-delete",
      ),
    ).toEqual({
      kind: "frame",
      storyId: "story-a-successful-empty-subgroup-delete",
      frameId: "story-a-empty-subgroup-confirm-delete",
    })

    expect(
      findSelectionForFrameId(
        bcn814Storyboard,
        "story-c-manager-empty-subgroup-confirm-delete",
      ),
    ).toEqual({
      kind: "frame",
      storyId: "story-c-manager-successful-empty-subgroup-delete",
      frameId: "story-c-manager-empty-subgroup-confirm-delete",
    })
  })

  test("lays out transition targets as a deterministic depth-first tree", () => {
    const document: StoryboardDocument = {
      id: "transition-tree",
      title: "Transition tree",
      stories: [
        {
          id: "story-a",
          title: "Story A",
          frames: [
            {
              id: "start",
              title: "Start",
              transitions: [
                { id: "primary", label: "Primary", kind: "user", targetFrameId: "primary-1" },
                { id: "alternate", label: "Alternate", kind: "user", targetFrameId: "alternate-1" },
              ],
            },
            {
              id: "primary-1",
              title: "Primary 1",
              transitions: [
                { id: "continue", label: "Continue", kind: "user", targetFrameId: "primary-2" },
                { id: "nested", label: "Nested alternate", kind: "user", targetFrameId: "nested-1" },
              ],
            },
            { id: "primary-2", title: "Primary 2", transitions: [] },
            { id: "alternate-1", title: "Alternate 1", transitions: [] },
            { id: "nested-1", title: "Nested 1", transitions: [] },
          ],
          branches: [],
        },
      ],
    }

    const sequences = documentToSequences(document)

    expect(sequences.map((sequence) => sequence.frames.map((frame) => frame.id))).toEqual([
      ["start", "primary-1", "primary-2"],
      ["nested-1"],
      ["alternate-1"],
    ])
    expect(sequences[1]).toMatchObject({ sourceFrameId: "primary-1", startColumn: 2, startLabel: "Nested alternate" })
    expect(sequences[2]).toMatchObject({ sourceFrameId: "start", startColumn: 1, startLabel: "Alternate" })
  })

  test("keeps onboarding invalid email validation as the email-step error branch even if frame order changes", () => {
    const document: StoryboardDocument = {
      id: "onboarding",
      title: "Onboarding",
      stories: [
        {
          id: "story-a-account-verification-entry",
          title: "Prospective account user starts verification and sees eligibility branches",
          frames: [
            { id: "story-a-02-invalid-email-validation", title: "Invalid civilian email is blocked", transitions: [] },
            {
              id: "story-a-01-account-email-step",
              title: "User reaches the email eligibility decision",
              transitions: [
                {
                  id: "account-path",
                  label: "Account path: submit eligible address and proceed to SMS Program unchecked/disabled contract",
                  kind: "user",
                  targetFrameId: "story-a-03-sms-program-unchecked-disabled",
                },
                {
                  id: "invalid-email-branch",
                  label: "Invalid email branch: submit non-eligible email and stay blocked",
                  kind: "user",
                  targetFrameId: "story-a-02-invalid-email-validation",
                },
              ],
            },
            {
              id: "story-a-03-sms-program-unchecked-disabled",
              title: "SMS Program unchecked: Continue is disabled",
              transitions: [
                {
                  id: "sms-program-accepted",
                  label: "SMS Program required checkboxes accepted",
                  kind: "user",
                  targetFrameId: "story-a-04-sms-program-checked-enabled",
                },
              ],
            },
            { id: "story-a-04-sms-program-checked-enabled", title: "SMS Program checked: Continue is enabled", transitions: [] },
          ],
          branches: [],
        },
      ],
    }

    const sequences = documentToSequences(document)

    expect(sequences.map((sequence) => sequence.frames.map((frame) => frame.id))).toEqual([
      ["story-a-01-account-email-step", "story-a-03-sms-program-unchecked-disabled", "story-a-04-sms-program-checked-enabled"],
      ["story-a-02-invalid-email-validation"],
    ])
    expect(sequences[1]).toMatchObject({
      sourceFrameId: "story-a-01-account-email-step",
      startColumn: 1,
      startLabel: "Invalid email branch: submit non-eligible email and stay blocked",
    })
  })
})
