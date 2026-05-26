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
})
