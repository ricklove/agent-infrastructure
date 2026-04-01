import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AgentChatStore } from "./store.js"

const createdDirs: string[] = []

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

function createStore() {
  const dataDir = mkdtempSync(join(tmpdir(), "agent-chat-store-"))
  createdDirs.push(dataDir)
  return new AgentChatStore({ dataDir })
}

describe("AgentChatStore multi-agent delivery", () => {
  test("queued delivery follows the active provider participant", () => {
    const store = createStore()
    const session = store.createSession({
      title: "Queue routing",
      providerKind: "codex-app-server",
      modelRef: "openai-codex/gpt-5.4",
      cwd: "/home/ec2-user/workspace",
      authProfile: "chatgpt",
    })

    const userMessage = store.appendMessage(session.id, {
      role: "user",
      providerSeenAtMs: null,
      content: [{ type: "text", text: "hello @all from user" }],
    })

    expect(
      store.listQueuedMessages(session.id).map((message) => message.id),
    ).toEqual([userMessage.id])

    store.markMessagesSeen(
      session.id,
      [userMessage.id],
      userMessage.createdAtMs + 1,
    )

    const codexSeenMessage = store
      .listMessages(session.id)
      .find((message) => message.id === userMessage.id)
    expect(codexSeenMessage?.deliveryRecords).toEqual([
      expect.objectContaining({
        recipientParticipantId: "agent:codex-app-server:manager",
        status: "seen",
      }),
      expect.objectContaining({
        recipientParticipantId: "agent:claude-agent-sdk:manager",
        status: "pending",
      }),
    ])
    expect(store.listQueuedMessages(session.id)).toHaveLength(0)

    store.updateSessionProviderSettings(session.id, {
      providerKind: "claude-agent-sdk",
      modelRef: "claude-sonnet-4-20250514",
      authProfile: "chatgpt",
      imageModelRef: null,
      clearProviderThread: true,
    })

    expect(
      store.listQueuedMessages(session.id).map((message) => message.id),
    ).toEqual([userMessage.id])

    const peerMessage = store.appendMessage(session.id, {
      role: "assistant",
      authorParticipantId: "agent:codex-app-server:manager",
      defaultVisibility: {
        type: "participant_list",
        participantIds: ["agent:claude-agent-sdk:manager"],
      },
      providerSeenAtMs: null,
      content: [{ type: "text", text: "peer handoff from codex" }],
    })

    expect(
      store.listQueuedUserMessages(session.id).map((message) => message.id),
    ).toEqual([userMessage.id, peerMessage.id])
  })
})
