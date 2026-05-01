import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { StoredMessage } from "./store.js"
import {
  ImageSourceResolver,
  inferWorkAtTargetName,
  normalizeImageSource,
} from "./image-source-resolver.js"

const createdDirs: string[] = []

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

function createTempDir(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  createdDirs.push(dir)
  return dir
}

function textMessage(text: string): StoredMessage {
  const createdAtMs = Date.now()
  return {
    id: `message-${createdAtMs}-${Math.random()}`,
    sessionId: "session-1",
    role: "assistant",
    kind: "chat",
    replyToMessageId: null,
    ticketId: null,
    authorParticipantId: "agent:codex-app-server:manager",
    authorHost: "manager",
    defaultVisibility: "none",
    visibilityTags: [],
    visibilityResolution: {
      audienceParticipantIds: [],
      tagOverrides: [],
      resolvedFromDefaultVisibility: "none",
      resolvedAtMs: createdAtMs,
    },
    deliveryRecords: [],
    providerSeenAtMs: createdAtMs,
    content: [{ type: "text", text }],
    createdAtMs,
  }
}

describe("inferWorkAtTargetName", () => {
  test("uses the nearest earlier work-at target for a source path mention", () => {
    const sourcePath = "/home/ec2-user/workspace/maps-fit-wide-proof-3.png"
    const messages = [
      textMessage("Command started: work-at bc-fullstack git status --short"),
      textMessage("Command started: work-at bc-app-new node patch.js"),
      textMessage(`Current proof: [maps-fit-wide-proof-3.png](${sourcePath})`),
    ]

    expect(inferWorkAtTargetName(messages, sourcePath)).toBe("bc-app-new")
  })
})

describe("ImageSourceResolver", () => {
  test("returns manager-local bytes for an existing absolute image path", async () => {
    const root = createTempDir("agent-chat-image-resolver-")
    const approvedTempImageDir = join(root, "temp")
    const mediaCacheDir = join(approvedTempImageDir, "agent-chat-media-cache")
    mkdirSync(approvedTempImageDir, { recursive: true })
    const imagePath = join(root, "proof.png")
    writeFileSync(imagePath, Buffer.from([1, 2, 3, 4]))

    const resolver = new ImageSourceResolver({
      approvedTempImageDir,
      mediaCacheDir,
      workAtRegistryPath: join(root, "registry.json"),
      readAttachmentBytes: () => null,
      listMessages: () => [],
    })

    const result = await resolver.readImageSource("session-1", imagePath)
    expect(result.provenance).toBe("external")
    expect([...result.bytes]).toEqual([1, 2, 3, 4])
  })

  test("falls back to the inferred work-at target and caches the worker copy", async () => {
    const root = createTempDir("agent-chat-image-resolver-")
    const approvedTempImageDir = join(root, "temp")
    const mediaCacheDir = join(approvedTempImageDir, "agent-chat-media-cache")
    const registryPath = join(root, "registry.json")
    mkdirSync(approvedTempImageDir, { recursive: true })
    writeFileSync(
      registryPath,
      JSON.stringify({
        targets: {
          "bc-app-new": {
            host: "agent-swarm-worker-i-test",
            path: "/home/ec2-user/workspace",
            shell: "/bin/bash",
          },
        },
      }),
    )

    const sourcePath = normalizeImageSource(
      "/home/ec2-user/workspace/worker-only/maps-chip-proof-fixed.png",
    )
    let remoteReadCount = 0

    const resolver = new ImageSourceResolver({
      approvedTempImageDir,
      mediaCacheDir,
      workAtRegistryPath: registryPath,
      readAttachmentBytes: () => null,
      listMessages: () => [
        textMessage("Command started: work-at bc-app-new node patch.js"),
        textMessage(
          `Manager-local proof: [maps-chip-proof-fixed.png](${sourcePath})`,
        ),
      ],
      remoteFileReader: async (host, filePath) => {
        remoteReadCount += 1
        expect(host).toBe("agent-swarm-worker-i-test")
        expect(filePath).toBe(sourcePath)
        return new Uint8Array([9, 8, 7])
      },
    })

    const first = await resolver.readImageSource("session-1", sourcePath)
    expect(first.provenance).toBe("worker")
    expect([...first.bytes]).toEqual([9, 8, 7])

    const second = await resolver.readImageSource("session-1", sourcePath)
    expect(second.provenance).toBe("worker")
    expect([...second.bytes]).toEqual([9, 8, 7])
    expect(remoteReadCount).toBe(1)
  })
})
