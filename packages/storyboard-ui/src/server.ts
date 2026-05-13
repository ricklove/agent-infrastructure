import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { randomUUID } from "node:crypto"
import { formatStoryboardDocument, isStoryboardDocument, type StoryboardDocument } from "./storyboard-document.js"

const port = Number.parseInt(process.env.STORYBOARD_PORT ?? "8797", 10)
const workspaceRoot = process.env.AGENT_WORKSPACE_DIR?.trim() || "/home/ec2-user/workspace"
const stateDir = process.env.AGENT_STATE_DIR?.trim() || "/home/ec2-user/state"
const logPath = process.env.STORYBOARD_LOG_PATH?.trim() || `${stateDir}/logs/storyboard-server.log`
const repoRoot = process.cwd()
const testFixturePath = resolve(repoRoot, "packages/storyboard-ui/fixtures/test.storyboard.json")

type SnapshotJob = {
  id: string
  storyboardPath: string | null
  status: "queued" | "running" | "succeeded" | "failed"
  command: string[]
  startedAt: string
  finishedAt?: string
  exitCode?: number
  stdout?: string
  stderr?: string
}

const snapshotJobs = new Map<string, SnapshotJob>()

mkdirSync(dirname(logPath), { recursive: true })

function log(message: string) {
  appendFileSync(logPath, `[${new Date().toISOString()}:storyboard-server] ${message}\n`)
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

function ensureAllowedPath(pathValue: string) {
  const resolved = resolve(pathValue)
  const inWorkspace = resolved.startsWith(`${workspaceRoot}/`) || resolved === workspaceRoot
  if (!inWorkspace) {
    throw new Error(`path must stay under ${workspaceRoot}`)
  }
  if (!resolved.endsWith(".storyboard.json")) {
    throw new Error("path must point to a .storyboard.json file")
  }
  return resolved
}

function resolveStoryboardPath(url: URL) {
  const fixture = url.searchParams.get("fixture")?.trim()
  if (fixture === "test-storyboard") {
    return testFixturePath
  }
  const pathValue = url.searchParams.get("path")?.trim()
  if (!pathValue) {
    throw new Error("missing storyboard path")
  }
  return ensureAllowedPath(pathValue)
}

function readStoryboardDocument(path: string) {
  if (!existsSync(path)) {
    throw new Error(`storyboard file not found: ${path}`)
  }
  const raw = readFileSync(path, "utf8")
  const parsed = JSON.parse(raw) as unknown
  if (!isStoryboardDocument(parsed)) {
    throw new Error(`invalid storyboard document: ${path}`)
  }
  const stats = statSync(path)
  return {
    path,
    document: parsed,
    mtimeMs: stats.mtimeMs,
  }
}

function writeStoryboardDocument(path: string, document: StoryboardDocument) {
  writeFileSync(path, formatStoryboardDocument(document), "utf8")
  const stats = statSync(path)
  return {
    path,
    document,
    mtimeMs: stats.mtimeMs,
  }
}

function startSnapshotJob(storyboardPath: string | null) {
  const id = randomUUID()
  const job: SnapshotJob = {
    id,
    storyboardPath,
    status: "queued",
    command: ["bun", "run", "--filter", "@agent-infrastructure/storyboard-ui", "test:debug-fixtures"],
    startedAt: new Date().toISOString(),
  }
  snapshotJobs.set(id, job)

  const subprocess = Bun.spawn(job.command, {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  })

  job.status = "running"
  void subprocess.exited.then(async (exitCode: number) => {
    const stdout = await new Response(subprocess.stdout).text()
    const stderr = await new Response(subprocess.stderr).text()
    snapshotJobs.set(id, {
      ...job,
      status: exitCode === 0 ? "succeeded" : "failed",
      finishedAt: new Date().toISOString(),
      exitCode,
      stdout,
      stderr,
    })
    log(`snapshot job ${id} finished with exit code ${exitCode}`)
  })

  log(`snapshot job ${id} started for ${storyboardPath ?? "(unspecified storyboard)"}`)
  return job
}

console.log(JSON.stringify({ ok: true, event: "storyboard_server_started", port }))

Bun.serve({
  port,
  async fetch(request: Request) {
    const url = new URL(request.url)
    const pathname = url.pathname

    if (pathname === "/api/storyboard/health") {
      return jsonResponse({ ok: true })
    }

    if (pathname === "/api/storyboard/document" && request.method === "GET") {
      try {
        return jsonResponse({ ok: true, ...readStoryboardDocument(resolveStoryboardPath(url)) })
      } catch (error) {
        return textError(error instanceof Error ? error.message : String(error), 404)
      }
    }

    if (pathname === "/api/storyboard/document" && request.method === "PUT") {
      try {
        const path = resolveStoryboardPath(url)
        const body = (await request.json()) as unknown
        if (!isStoryboardDocument(body)) {
          return textError("invalid storyboard document payload", 400)
        }
        return jsonResponse({ ok: true, ...writeStoryboardDocument(path, body) })
      } catch (error) {
        return textError(error instanceof Error ? error.message : String(error), 400)
      }
    }

    if (pathname === "/api/storyboard/snapshot-jobs" && request.method === "POST") {
      try {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as { storyboardPath?: string | null }
        const storyboardPath = body.storyboardPath?.trim() ? ensureAllowedPath(body.storyboardPath) : null
        return jsonResponse({ ok: true, job: startSnapshotJob(storyboardPath) }, 202)
      } catch (error) {
        return textError(error instanceof Error ? error.message : String(error), 400)
      }
    }

    if (pathname.startsWith("/api/storyboard/snapshot-jobs/") && request.method === "GET") {
      const id = pathname.slice("/api/storyboard/snapshot-jobs/".length)
      const job = snapshotJobs.get(id)
      if (!job) {
        return textError(`unknown job ${id}`, 404)
      }
      return jsonResponse({ ok: true, job })
    }

    return textError("Not found", 404)
  },
})
