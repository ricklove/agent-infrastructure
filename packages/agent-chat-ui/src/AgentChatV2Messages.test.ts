import { describe, expect, test } from "bun:test"
import { textImageReferences } from "./AgentChatV2Messages"

describe("textImageReferences", () => {
  test("detects a bulleted markdown image link", () => {
    expect(
      textImageReferences(
        "- [maps-tailwind-live-check.png](/home/ec2-user/workspace/maps-tailwind-live-check.png)",
      ),
    ).toEqual([
      {
        altText: "maps-tailwind-live-check.png",
        sourceUrl: "/home/ec2-user/workspace/maps-tailwind-live-check.png",
      },
    ])
  })

  test("detects a labeled bulleted markdown image link", () => {
    expect(
      textImageReferences(
        "- desktop create form: [maps-create-desktop-current.png](/home/ec2-user/workspace/maps-create-desktop-current.png)",
      ),
    ).toEqual([
      {
        altText: "maps-create-desktop-current.png",
        sourceUrl: "/home/ec2-user/workspace/maps-create-desktop-current.png",
      },
    ])
  })

  test("detects an inline markdown image", () => {
    expect(
      textImageReferences(
        "Current capture ![Temp validation](/api/agent-chat/sessions/test/attachments/example.png) is attached.",
      ),
    ).toEqual([
      {
        altText: "Temp validation",
        sourceUrl: "/api/agent-chat/sessions/test/attachments/example.png",
      },
    ])
  })

  test("detects an inline markdown image link", () => {
    expect(
      textImageReferences(
        "View result at [Temp validation](/api/agent-chat/sessions/test/attachments/example.png) in the summary.",
      ),
    ).toEqual([
      {
        altText: "Temp validation",
        sourceUrl: "/api/agent-chat/sessions/test/attachments/example.png",
      },
    ])
  })

  test("detects a backticked image path", () => {
    expect(
      textImageReferences(
        "Use `/tmp/worker-setup-direct-development-test/output/direct-dashboard.png` for validation.",
      ),
    ).toEqual([
      {
        altText: "Linked image",
        sourceUrl: "/tmp/worker-setup-direct-development-test/output/direct-dashboard.png",
      },
    ])
  })

  test("detects a raw image path line", () => {
    expect(
      textImageReferences(
        "/home/ec2-user/temp/bc-ops-dashboard-vite-dev.png",
      ),
    ).toEqual([
      {
        altText: "Linked image",
        sourceUrl: "/home/ec2-user/temp/bc-ops-dashboard-vite-dev.png",
      },
    ])
  })
})
