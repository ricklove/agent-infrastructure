import type {
  WorkbenchDocumentRecord,
  WorkbenchSnapshotResponse,
} from "@agent-infrastructure/agent-workbench-protocol"
import {
  ensureDefaultWorkbench,
  readWorkbench,
  writeWorkbench,
} from "./workbench-store.js"

const port = Number.parseInt(process.env.AGENT_WORKBENCH_PORT ?? "8792", 10)

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  })
}

function textError(message: string, status = 400) {
  return new Response(message, { status })
}

await ensureDefaultWorkbench()
console.log(
  JSON.stringify({
    ok: true,
    event: "agent_workbench_server_started",
    port,
  }),
)

Bun.serve({
  port,
  async fetch(request: Request) {
    const url = new URL(request.url)
    const pathname = url.pathname

    if (pathname === "/api/agent-workbench/health") {
      return jsonResponse({ ok: true })
    }

    if (
      pathname === "/api/agent-workbench/workbench" &&
      request.method === "GET"
    ) {
      try {
        const snapshot = await readWorkbench(
          url.searchParams.get("id") ?? undefined,
        )
        return jsonResponse({
          ok: true,
          workbench: snapshot.workbench,
          availableWorkbenches: snapshot.summaries,
        } satisfies WorkbenchSnapshotResponse)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(
          JSON.stringify({
            ok: false,
            event: "agent_workbench_load_failed",
            error: message,
          }),
        )
        return textError(message, 404)
      }
    }

    if (
      pathname === "/api/agent-workbench/workbench" &&
      request.method === "PUT"
    ) {
      try {
        const body = (await request.json()) as WorkbenchDocumentRecord
        const previousId = url.searchParams.get("previousId") ?? undefined
        await writeWorkbench(body, { previousId })
        const snapshot = await readWorkbench(body.id)
        return jsonResponse({
          ok: true,
          workbench: snapshot.workbench,
          availableWorkbenches: snapshot.summaries,
        } satisfies WorkbenchSnapshotResponse)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(
          JSON.stringify({
            ok: false,
            event: "agent_workbench_save_failed",
            error: message,
          }),
        )
        return textError(message, 400)
      }
    }

    return textError("Not found", 404)
  },
})
