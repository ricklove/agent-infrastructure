import { describe, expect, test } from "bun:test"
import { shouldProcessCodexNotification } from "./codex-provider.js"

describe("shouldProcessCodexNotification", () => {
  test("accepts events for the active thread and turn", () => {
    expect(
      shouldProcessCodexNotification("thread-a", "turn-a", {
        method: "item/agentMessage/delta",
        params: {
          threadId: "thread-a",
          turnId: "turn-a",
          itemId: "item-1",
          delta: "ok",
        },
      }),
    ).toBe(true)
  })

  test("rejects events from another thread", () => {
    expect(
      shouldProcessCodexNotification("thread-a", "turn-a", {
        method: "item/agentMessage/delta",
        params: {
          threadId: "thread-b",
          turnId: "turn-a",
          itemId: "item-1",
          delta: "leak",
        },
      }),
    ).toBe(false)
  })

  test("rejects events from another turn on the same thread", () => {
    expect(
      shouldProcessCodexNotification("thread-a", "turn-a", {
        method: "item/started",
        params: {
          threadId: "thread-a",
          turnId: "turn-b",
          item: { type: "commandExecution", id: "cmd-1" },
        },
      }),
    ).toBe(false)
  })

  test("uses completed turn id fallback when turnId is nested", () => {
    expect(
      shouldProcessCodexNotification("thread-a", "turn-a", {
        method: "turn/completed",
        params: {
          threadId: "thread-a",
          turn: { id: "turn-b" },
        },
      }),
    ).toBe(false)
  })
})
