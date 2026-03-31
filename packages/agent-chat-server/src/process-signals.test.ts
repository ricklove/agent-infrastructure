import { describe, expect, test } from "bun:test"
import { findStandaloneSignalLine } from "./process-signals.js"

describe("findStandaloneSignalLine", () => {
  test("matches a standalone token line anywhere in the message", () => {
    const result = findStandaloneSignalLine(
      [
        "Created the worker worktree and verified the build path.",
        "",
        "done: setup_worker_surface",
        "",
        "Next I can continue with the following step.",
      ].join("\n"),
      ["done: setup_worker_surface"],
    )

    expect(result.signalText).toBe("done: setup_worker_surface")
    expect(result.visibleText).toBe(
      [
        "Created the worker worktree and verified the build path.",
        "",
        "",
        "Next I can continue with the following step.",
      ]
        .join("\n")
        .trim(),
    )
  })

  test("uses the last matching standalone token line when multiple are present", () => {
    const result = findStandaloneSignalLine(
      ["done: first", "context", "done: second"].join("\n"),
      ["done: first", "done: second"],
    )

    expect(result.signalText).toBe("done: second")
    expect(result.visibleText).toBe(["done: first", "context"].join("\n"))
  })

  test("does not match a token embedded inside prose", () => {
    const result = findStandaloneSignalLine(
      "I finished it with done: setup_worker_surface in the middle of this sentence.",
      ["done: setup_worker_surface"],
    )

    expect(result.signalText).toBeNull()
    expect(result.visibleText).toBe(
      "I finished it with done: setup_worker_surface in the middle of this sentence.",
    )
  })
})
