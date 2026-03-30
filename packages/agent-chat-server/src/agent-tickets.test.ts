import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentTicketStore } from "./agent-tickets.js";
import type { ProcessBlueprint } from "./process-blueprints.js";

const createdDirs: string[] = [];

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function createStore() {
  const dataDir = mkdtempSync(join(tmpdir(), "agent-ticket-store-"));
  createdDirs.push(dataDir);
  return new AgentTicketStore({ dataDir });
}

function createBlueprint(
  overrides: Partial<Pick<ProcessBlueprint, "id" | "title">> = {},
): ProcessBlueprint {
  return {
    id: overrides.id ?? "test-blueprint",
    title: overrides.title ?? "Test Blueprint",
    catalogOrder: 1,
    expectation: "Do the current step.",
    companionPath: null,
    kind: "procedural",
    idlePrompt: "resume",
    completionMode: "exact_reply",
    completionToken: "done: test-blueprint",
    blockedToken: "blocked: test-blueprint",
    stopConditions: [],
    watchdog: { enabled: true, idleTimeoutSeconds: 90, maxNudgesPerIdleEpisode: 0 },
    steps: [
      {
        id: "prepare",
        title: "Prepare the thing",
        kind: "task",
        doneToken: null,
        blockedToken: null,
        steps: [],
        decision: null,
      },
    ],
  };
}

describe("AgentTicketStore", () => {
  test("marks the active ticket blocked when the assistant blocks the current step", () => {
    const store = createStore();
    const ticket = store.createOrReplaceSessionTicket("session-1", createBlueprint());

    const transition = store.resolveStepFromAssistantText("session-1", "blocked: prepare");

    expect(transition?.kind).toBe("stepBlocked");
    expect(transition?.ticket.id).toBe(ticket.id);
    expect(transition?.ticket.status).toBe("blocked");
    expect(transition?.ticket.blockedSource).toBe("agent");
    expect(transition?.ticket.sameStepAttemptCount).toBe(0);
    expect(transition?.ticket.currentStepId).toBe(ticket.currentStepId);
  });

  test("resumes the same blocked ticket and clears blocked bookkeeping on the next user turn", () => {
    const store = createStore();
    store.createOrReplaceSessionTicket("session-1", createBlueprint());
    store.incrementSameStepAttemptCount("session-1");
    store.incrementSameStepAttemptCount("session-1");
    store.blockActiveTicketBySystem("session-1", "Auto-blocked after 3 attempts");

    const resumed = store.resumeBlockedActiveTicket("session-1");

    expect(resumed).not.toBeNull();
    expect(resumed?.status).toBe("active");
    expect(resumed?.blockedSource).toBeNull();
    expect(resumed?.sameStepAttemptCount).toBe(0);
  });

  test("tracks repeated same-step attempts before a system block", () => {
    const store = createStore();
    const created = store.createOrReplaceSessionTicket("session-1", createBlueprint());

    const first = store.incrementSameStepAttemptCount("session-1");
    const second = store.incrementSameStepAttemptCount("session-1");
    const third = store.incrementSameStepAttemptCount("session-1");
    const blocked = store.blockActiveTicketBySystem("session-1", "Auto-blocked after 3 attempts");

    expect(first?.sameStepAttemptCount).toBe(1);
    expect(second?.sameStepAttemptCount).toBe(2);
    expect(third?.sameStepAttemptCount).toBe(3);
    expect(blocked?.status).toBe("blocked");
    expect(blocked?.blockedSource).toBe("system");
    expect(blocked?.currentStepId).toBe(created.currentStepId);
  });


  test("lists unfinished session tickets and resumes a selected blocked ticket", () => {
    const store = createStore();
    const first = store.createOrReplaceSessionTicket(
      "session-1",
      createBlueprint({ id: "first-blueprint", title: "First Ticket" }),
    );
    store.resolveActiveTicket("session-1", "blocked", "Waiting for user input");

    const second = store.createOrReplaceSessionTicket(
      "session-1",
      createBlueprint({ id: "second-blueprint", title: "Second Ticket" }),
    );

    const listed = store.listTicketsForSession("session-1", {
      unfinishedOnly: true,
    });
    expect(listed.map((ticket) => ticket.id)).toEqual([second.id, first.id]);

    const resumed = store.activateTicketForSession("session-1", first.id);
    expect(resumed?.id).toBe(first.id);
    expect(resumed?.status).toBe("active");
    expect(resumed?.blockedSource).toBeNull();
    expect(store.getActiveTicketForSession("session-1")?.id).toBe(first.id);
  });
});
