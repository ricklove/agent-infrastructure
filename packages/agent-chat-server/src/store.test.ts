import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { appendFileSync, mkdtempSync, rmSync, unlinkSync } from "node:fs"
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

function createStoreContext() {
  const dataDir = mkdtempSync(join(tmpdir(), "agent-chat-store-"))
  createdDirs.push(dataDir)
  return {
    dataDir,
    store: new AgentChatStore({ dataDir }),
  }
}

describe("AgentChatStore multi-agent delivery", () => {
  test("persists provider bindings on durable chat agents", () => {
    const store = createStore()
    const session = store.createSession({
      title: "Provider binding persistence",
      providerKind: "codex-app-server",
      modelRef: "openai-codex/gpt-5.4",
      cwd: "/home/ec2-user/workspace",
      authProfile: "chatgpt",
    })

    const codexParticipant = session.participants.find(
      (participant) =>
        participant.participantId === "agent:codex-app-server:manager",
    )
    const claudeParticipant = session.participants.find(
      (participant) =>
        participant.participantId === "agent:claude-agent-sdk:manager",
    )

    expect(codexParticipant).toEqual(
      expect.objectContaining({
        agentId: "agent:codex-app-server:manager",
        providerKind: "codex-app-server",
        providerBinding: expect.objectContaining({
          providerKind: "codex-app-server",
          status: "attached",
          executionTarget: expect.objectContaining({
            targetKind: "manager",
            host: "manager",
          }),
        }),
      }),
    )
    expect(claudeParticipant).toEqual(
      expect.objectContaining({
        agentId: "agent:claude-agent-sdk:manager",
        providerKind: "claude-agent-sdk",
        providerBinding: expect.objectContaining({
          providerKind: "claude-agent-sdk",
          status: "attached",
          executionTarget: expect.objectContaining({
            targetKind: "manager",
            host: "manager",
          }),
        }),
      }),
    )
  })

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

  test("queues unseen ticket events for provider work", () => {
    const store = createStore()
    const session = store.createSession({
      title: "Ticket event queue routing",
      providerKind: "codex-app-server",
      modelRef: "openai-codex/gpt-5.4",
      cwd: "/home/ec2-user/workspace",
      authProfile: "chatgpt",
    })

    const ticketEvent = store.appendMessage(session.id, {
      role: "system",
      kind: "ticketEvent",
      providerSeenAtMs: null,
      content: [{ type: "text", text: "Ticket step completed: Final" }],
    })

    expect(
      store.listQueuedMessages(session.id).map((message) => message.id),
    ).toEqual([ticketEvent.id])
    expect(
      store.listQueuedUserMessages(session.id).map((message) => message.id),
    ).toEqual([ticketEvent.id])
  })

  test("keeps seen ticket events out of provider work queue", () => {
    const store = createStore()
    const session = store.createSession({
      title: "Terminal ticket event queue routing",
      providerKind: "codex-app-server",
      modelRef: "openai-codex/gpt-5.4",
      cwd: "/home/ec2-user/workspace",
      authProfile: "chatgpt",
    })

    const ticketEvent = store.appendMessage(session.id, {
      role: "system",
      kind: "ticketEvent",
      providerSeenAtMs: Date.now(),
      content: [{ type: "text", text: "Ticket completed" }],
    })

    expect(store.listMessages(session.id).map((message) => message.id)).toEqual(
      [ticketEvent.id],
    )
    expect(store.listQueuedMessages(session.id)).toHaveLength(0)
    expect(store.listQueuedUserMessages(session.id)).toHaveLength(0)
  })

  test("ignores corrupt message lines instead of failing session load", () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => {})
    const { dataDir, store } = createStoreContext()
    const session = store.createSession({
      title: "Corrupt line recovery",
      providerKind: "codex-app-server",
      modelRef: "openai-codex/gpt-5.4",
      cwd: "/home/ec2-user/workspace",
      authProfile: "chatgpt",
    })

    const first = store.appendMessage(session.id, {
      role: "user",
      content: [{ type: "text", text: "first" }],
    })
    const second = store.appendMessage(session.id, {
      role: "assistant",
      content: [{ type: "text", text: "second" }],
    })
    const messagesPath = join(dataDir, "sessions", session.id, "messages.jsonl")
    appendFileSync(messagesPath, '{"id":"broken"\n')
    rmSync(join(dataDir, "agent-chat-cache.sqlite"), { force: true })
    rmSync(join(dataDir, "agent-chat-cache.sqlite-shm"), { force: true })
    rmSync(join(dataDir, "agent-chat-cache.sqlite-wal"), { force: true })

    const reloadedStore = new AgentChatStore({ dataDir })

    expect(
      reloadedStore
        .listMessages(session.id)
        .map((message) => message.id)
        .sort(),
    ).toEqual([first.id, second.id].sort())
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(
        `[agent-chat-store] skipped unreadable message line sessionId=${session.id}`,
      ),
    )
    consoleError.mockRestore()
  })

  test("serves startup summaries from the sqlite cache before message hydration", () => {
    const { dataDir, store } = createStoreContext()
    const session = store.createSession({
      title: "Cached startup summary",
      providerKind: "codex-app-server",
      modelRef: "openai-codex/gpt-5.4",
      cwd: "/home/ec2-user/workspace",
      authProfile: "chatgpt",
    })
    store.appendMessage(session.id, {
      role: "assistant",
      content: [{ type: "text", text: "cached summary preview" }],
    })

    unlinkSync(join(dataDir, "sessions", session.id, "messages.jsonl"))

    const reloadedStore = new AgentChatStore({ dataDir })
    const [cachedSession] = reloadedStore.listSessions()

    expect(cachedSession).toEqual(
      expect.objectContaining({
        id: session.id,
        preview: "cached summary preview",
        messageCount: 1,
      }),
    )
  })
})
