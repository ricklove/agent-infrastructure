import { appendFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import type {
  WorkbenchDocumentRecord,
  WorkbenchSnapshotResponse,
} from "@agent-infrastructure/agent-workbench-protocol"
import {
  ensureDefaultWorkbench,
  readWorkbench,
  writeWorkbench,
} from "./workbench-store.js"

const stateDir = process.env.AGENT_STATE_DIR?.trim() || "/home/ec2-user/state"
const logPath =
  process.env.AGENT_WORKBENCH_LOG_PATH?.trim() ||
  `${stateDir}/logs/agent-workbench-server.log`
const port = Number.parseInt(process.env.AGENT_WORKBENCH_PORT ?? "8792", 10)

mkdirSync(dirname(logPath), { recursive: true })

function log(message: string) {
  appendFileSync(
    logPath,
    `[${new Date().toISOString()}:agent-workbench-server] ${message}\n`,
  )
}

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
log(`starting on :${port}`)

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
        log(`load failed: ${message}`)
        return textError(message, 404)
      }
    }

    if (
      pathname === "/api/agent-workbench/workbench" &&
      request.method === "PUT"
    ) {
      try {
        const body = (await request.json()) as WorkbenchDocumentRecord
        await writeWorkbench(body)
        const snapshot = await readWorkbench(body.id)
        return jsonResponse({
          ok: true,
          workbench: snapshot.workbench,
          availableWorkbenches: snapshot.summaries,
        } satisfies WorkbenchSnapshotResponse)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log(`save failed: ${message}`)
        return textError(message, 400)
      }
    }

    return textError("Not found", 404)
  },
})
