import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, extname, join, relative, resolve } from "node:path"
import { randomUUID } from "node:crypto"
import { formatStoryboardDocument, isStoryboardDocument, type StoryboardDocument } from "./storyboard-document.js"

const port = Number.parseInt(process.env.STORYBOARD_PORT ?? "8797", 10)
const workspaceRoot = process.env.AGENT_WORKSPACE_DIR?.trim() || "/home/ec2-user/workspace"
const stateDir = process.env.AGENT_STATE_DIR?.trim() || "/home/ec2-user/state"
const logPath = process.env.STORYBOARD_LOG_PATH?.trim() || `${stateDir}/logs/storyboard-server.log`
const repoRoot = process.cwd()
const testFixturePath = resolve(repoRoot, "packages/storyboard-ui/fixtures/test.storyboard.json")
const defaultStoryboardDir = resolve(repoRoot, "packages/storyboard-ui/templates/default-storyboard")
const defaultStoryboardJsonPath = resolve(defaultStoryboardDir, "storyboard.json")
const defaultStoryboardMarkdownPath = resolve(defaultStoryboardDir, "storyboard.md")
const defaultStoryboardAssetsDir = resolve(defaultStoryboardDir, "assets")
const testFixtureStoryboardDir = resolve(repoRoot, "packages/storyboard-ui/fixtures/test-storyboard")
const defaultAccessPort = Number.parseInt(process.env.STORYBOARD_DEFAULT_ACCESS_PORT ?? "8798", 10)
const testFixtureAccessPort = Number.parseInt(process.env.STORYBOARD_TEST_FIXTURE_ACCESS_PORT ?? "8799", 10)
const defaultStoryboardUrl =
  process.env.STORYBOARD_DEFAULT_URL?.trim() ||
  process.env.STORYBOARD_DEFAULT_ACCESS_URL?.trim() ||
  `http://127.0.0.1:${defaultAccessPort}/default-storyboard/storyboard.json`
const testFixtureStoryboardUrl =
  process.env.STORYBOARD_TEST_FIXTURE_URL?.trim() ||
  `http://127.0.0.1:${testFixtureAccessPort}/test-storyboard/storyboard.json`

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

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

function normalizeStoryboardBaseUrl(value: string) {
  return value.replace(/\/$/, "")
}

function storyboardDocumentUrl(storyboardUrl: string) {
  const normalized = normalizeStoryboardBaseUrl(storyboardUrl)
  return normalized.endsWith("/storyboard.json") ? normalized : `${normalized}/storyboard.json`
}

function fileContentType(pathValue: string) {
  const ext = extname(pathValue).toLowerCase()
  switch (ext) {
    case ".png":
      return "image/png"
    case ".jpg":
    case ".jpeg":
      return "image/jpeg"
    case ".webp":
      return "image/webp"
    case ".gif":
      return "image/gif"
    case ".svg":
      return "image/svg+xml"
    case ".html":
      return "text/html; charset=utf-8"
    case ".md":
      return "text/markdown; charset=utf-8"
    case ".json":
      return "application/json; charset=utf-8"
    default:
      return "application/octet-stream"
  }
}

function log(message: string) {
  appendFileSync(logPath, `[${new Date().toISOString()}:storyboard-server] ${message}\n`)
}

function startBundledAccessServer(rootDir: string, accessPort: number) {
  log(`starting bundled storyboard access server for ${rootDir} on ${accessPort}`)
  const child = Bun.spawn(
    ["bun", "scripts/storyboard-access-server.ts", "--root", rootDir, "--port", String(accessPort)],
    {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    },
  )

  void new Response(child.stdout).text().then((output) => {
    if (output.trim()) {
      log(`bundled access server stdout: ${output.trim()}`)
    }
  })
  void new Response(child.stderr).text().then((output) => {
    if (output.trim()) {
      log(`bundled access server stderr: ${output.trim()}`)
    }
  })
  void child.exited.then((exitCode) => {
    log(`bundled access server exited with code ${exitCode}`)
  })
}

startBundledAccessServer(defaultStoryboardDir, defaultAccessPort)
startBundledAccessServer(testFixtureStoryboardDir, testFixtureAccessPort)

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
  const storyboardUrl = url.searchParams.get("storyboardUrl")?.trim()
  if (storyboardUrl) {
    throw new Error("storyboardUrl-backed documents must be resolved through the proxy flow")
  }
  const fixture = url.searchParams.get("fixture")?.trim()
  if (fixture === "default-storyboard") {
    throw new Error("default-storyboard fixture is access-server-backed and must be resolved through the proxy flow")
  }
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

function resolveStoryboardUrl(url: URL, requestUrl: string) {
  const storyboardUrl = url.searchParams.get("storyboardUrl")?.trim()
  if (!storyboardUrl) {
    return null
  }
  const resolved = new URL(storyboardUrl, requestUrl).toString()
  if (!isHttpUrl(resolved)) {
    throw new Error("storyboardUrl must resolve to an absolute http(s) URL")
  }
  return normalizeStoryboardBaseUrl(resolved)
}

async function proxyStoryboardUrlDocument(storyboardUrl: string, init?: RequestInit) {
  const response = await fetch(storyboardDocumentUrl(storyboardUrl), init)
  if (!response.ok) {
    throw new Error(await response.text())
  }
  const payload = (await response.json()) as unknown
  if (!isStoryboardDocument(payload)) {
    throw new Error("invalid storyboard document payload from storyboard URL")
  }
  return {
    path: response.headers.get("X-Storyboard-Path") ?? storyboardUrl,
    document: payload,
    mtimeMs: Number.parseFloat(response.headers.get("X-Storyboard-MtimeMs") ?? "0") || null,
  }
}

async function proxyStoryboardAsset(storyboardUrl: string, assetPath: string) {
  const response = await fetch(new URL(assetPath, `${normalizeStoryboardBaseUrl(storyboardUrl)}/`))
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response
}

function listTemplateAssetFiles(currentDir: string, results: string[] = []) {
  if (!existsSync(currentDir)) {
    return results
  }
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    const fullPath = join(currentDir, entry.name)
    if (entry.isDirectory()) {
      listTemplateAssetFiles(fullPath, results)
      continue
    }
    results.push(relative(defaultStoryboardDir, fullPath))
  }
  return results.sort((left, right) => left.localeCompare(right))
}

async function putRemoteStoryboardFile(
  storyboardUrl: string,
  relativePath: string,
  body: BodyInit,
  contentType: string,
) {
  const response = await fetch(new URL(relativePath, `${normalizeStoryboardBaseUrl(storyboardUrl)}/`), {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body,
  })
  if (!response.ok) {
    throw new Error(`failed to write ${relativePath}: ${await response.text()}`)
  }
}

async function initializeRemoteStoryboard(storyboardUrl: string) {
  const templateDocument = readStoryboardDocument(defaultStoryboardJsonPath).document
  const templateMarkdown = readFileSync(defaultStoryboardMarkdownPath, "utf8")
  await putRemoteStoryboardFile(
    storyboardUrl,
    "storyboard.json",
    formatStoryboardDocument(templateDocument),
    "application/json; charset=utf-8",
  )
  await putRemoteStoryboardFile(
    storyboardUrl,
    "storyboard.md",
    templateMarkdown,
    "text/markdown; charset=utf-8",
  )
  for (const relativeTemplatePath of listTemplateAssetFiles(defaultStoryboardAssetsDir)) {
    const fullPath = join(defaultStoryboardDir, relativeTemplatePath)
    await putRemoteStoryboardFile(
      storyboardUrl,
      relativeTemplatePath,
      readFileSync(fullPath),
      fileContentType(fullPath),
    )
  }
  return proxyStoryboardUrlDocument(storyboardUrl)
}

function resolveBundledAccessProxyTarget(pathname: string) {
  if (pathname.startsWith("/api/storyboard/access/default-storyboard/")) {
    return `http://127.0.0.1:${defaultAccessPort}${pathname.slice("/api/storyboard/access".length)}`
  }
  if (pathname.startsWith("/api/storyboard/access/test-storyboard/")) {
    return `http://127.0.0.1:${testFixtureAccessPort}${pathname.slice("/api/storyboard/access".length)}`
  }
  return null
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

function rawStoryboardDocumentResponse(path: string) {
  const { document, mtimeMs } = readStoryboardDocument(path)
  return new Response(formatStoryboardDocument(document), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Storyboard-Path": path,
      "X-Storyboard-MtimeMs": String(mtimeMs),
    },
  })
}

function writeRawStoryboardDocumentResponse(path: string, document: StoryboardDocument) {
  const result = writeStoryboardDocument(path, document)
  return new Response(formatStoryboardDocument(result.document), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Storyboard-Path": path,
      "X-Storyboard-MtimeMs": String(result.mtimeMs),
    },
  })
}

Bun.serve({
  port,
  async fetch(request: Request) {
    const url = new URL(request.url)
    const pathname = url.pathname

    const bundledAccessProxyTarget = resolveBundledAccessProxyTarget(pathname)
    if (bundledAccessProxyTarget) {
      try {
        const upstreamUrl = new URL(bundledAccessProxyTarget)
        upstreamUrl.search = url.search
        const upstreamResponse = await fetch(upstreamUrl, {
          method: request.method,
          headers: request.headers,
          body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        })
        return new Response(upstreamResponse.body, {
          status: upstreamResponse.status,
          headers: upstreamResponse.headers,
        })
      } catch (error) {
        return textError(error instanceof Error ? error.message : String(error), 502)
      }
    }

    if (pathname === "/api/storyboard/health") {
      return jsonResponse({ ok: true, defaultStoryboardUrl })
    }

    if (pathname === "/api/storyboard/document" && request.method === "GET") {
      try {
        const storyboardUrl = resolveStoryboardUrl(url, request.url)
        if (storyboardUrl) {
          return jsonResponse({ ok: true, ...(await proxyStoryboardUrlDocument(storyboardUrl)) })
        }
        return jsonResponse({ ok: true, ...readStoryboardDocument(resolveStoryboardPath(url)) })
      } catch (error) {
        return textError(error instanceof Error ? error.message : String(error), 404)
      }
    }

    if (pathname === "/api/storyboard/document" && request.method === "PUT") {
      try {
        const body = (await request.json()) as unknown
        if (!isStoryboardDocument(body)) {
          return textError("invalid storyboard document payload", 400)
        }
        const storyboardUrl = resolveStoryboardUrl(url, request.url)
        if (storyboardUrl) {
          return jsonResponse({
            ok: true,
            ...(await proxyStoryboardUrlDocument(storyboardUrl, {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(body),
            })),
          })
        }
        const path = resolveStoryboardPath(url)
        return jsonResponse({ ok: true, ...writeStoryboardDocument(path, body) })
      } catch (error) {
        return textError(error instanceof Error ? error.message : String(error), 400)
      }
    }

    if (pathname === "/api/storyboard/initialize" && request.method === "POST") {
      try {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as { storyboardUrl?: string }
        const storyboardUrl = body.storyboardUrl?.trim()
        if (!storyboardUrl) {
          return textError("missing storyboardUrl", 400)
        }
        const resolvedUrl = new URL(storyboardUrl, request.url)
        if (!isHttpUrl(resolvedUrl.toString())) {
          return textError("storyboardUrl must resolve to an absolute http(s) URL", 400)
        }
        return jsonResponse({ ok: true, ...(await initializeRemoteStoryboard(normalizeStoryboardBaseUrl(resolvedUrl.toString()))) })
      } catch (error) {
        return textError(error instanceof Error ? error.message : String(error), 400)
      }
    }

    if (pathname === "/api/storyboard/access-asset" && request.method === "GET") {
      try {
        const storyboardUrl = resolveStoryboardUrl(url, request.url)
        if (!storyboardUrl) {
          return textError("missing storyboardUrl", 400)
        }
        const assetPath = url.searchParams.get("path")?.trim()
        if (!assetPath) {
          return textError("missing asset path", 400)
        }
        const response = await proxyStoryboardAsset(storyboardUrl, assetPath)
        return new Response(response.body, {
          status: response.status,
          headers: {
            "Content-Type": response.headers.get("Content-Type") ?? "application/octet-stream",
            "Cache-Control": "no-cache",
          },
        })
      } catch (error) {
        return textError(error instanceof Error ? error.message : String(error), 404)
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
