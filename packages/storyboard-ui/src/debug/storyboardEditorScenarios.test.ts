import { describe, expect, test } from "bun:test"

import {
  buildRunAssetCacheKey,
  findSelectionForFrameId,
  readStoryboardEditorQuery,
} from "./storyboardEditorScenarios"
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
  ],
}

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
})
