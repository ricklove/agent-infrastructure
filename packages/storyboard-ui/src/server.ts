import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { formatStoryboardDocument, frameCaptureSet, normalizeStoryboardDocument, isStoryboardDocument, type StoryboardDocument, type StoryboardFrameRecord, type StoryboardStoryRecord, type StoryboardTransitionRecord } from "./storyboard-document.js"
import { parseNumericStoryboardHeader, shouldRefreshRunMirrorAsset } from "./run-mirror.js"
import { normalizeWebRunTargetUrl, runTargetHealthApiPath, runTargetProviderApiPath } from "./run-target-health.js"

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
  `http://127.0.0.1:${defaultAccessPort}/default-storyboard`
const testFixtureStoryboardUrl =
  process.env.STORYBOARD_TEST_FIXTURE_URL?.trim() ||
  `http://127.0.0.1:${testFixtureAccessPort}/test-storyboard`
const runMirrorRoot = resolve(stateDir, "storyboard-run-mirrors")
const storyboardRunTargetConfigPath = resolve(
  process.env.STORYBOARD_RUN_TARGET_CONFIG?.trim() ||
    join(repoRoot, "packages/storyboard-ui/storyboard-run-targets.json"),
)

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

type AccessServerStoryboardSummary = {
  name: string
  root?: string
  hasStoryboardJson?: boolean
  hasStoryboardMarkdown?: boolean
  storyboardUrl: string
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

function storyboardMarkdownUrl(storyboardUrl: string) {
  const normalized = normalizeStoryboardBaseUrl(storyboardUrl)
  return normalized.endsWith("/storyboard.md") ? normalized : `${normalized}/storyboard.md`
}

function storyboardFilesApiUrl(storyboardUrl: string, relativePath: string) {
  const root = new URL(normalizeStoryboardBaseUrl(storyboardUrl))
  return new URL(`/api/storyboard-access/files?path=${encodeURIComponent(relativePath)}`, `${root.origin}/`).toString()
}

function storyboardAccessServerUrl(storyboardUrl: string) {
  const root = new URL(normalizeStoryboardBaseUrl(storyboardUrl))
  return root.origin
}

function formatMarkdownBullets(value: string | undefined) {
  if (!value?.trim()) {
    return []
  }
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `  - ${line}`)
}

function formatMarkdownAssetPath(value: string | undefined) {
  if (!value) {
    return ""
  }
  return value.startsWith("./") ? value : `./${value.replace(/^\/+/u, "")}`
}

function flattenBranchFrames(story: StoryboardStoryRecord) {
  return (story.branches ?? []).flatMap((branch) => branch.frames)
}

function formatStoryboardMarkdown(document: StoryboardDocument) {
  const normalized = normalizeStoryboardDocument(document)
  const lines = [
    "# Storyboard",
    "",
    "## Meta",
    `- Title: ${normalized.title}`,
  ]

  if (normalized.runTarget?.kind === "web" && normalized.runTarget.url.trim()) {
    lines.push(`- Run target: ${normalized.runTarget.url.trim()}`)
  }

  const captureSetRunTargets = Object.entries(normalized.captureSets ?? {})
    .map(([captureSetId, captureSet]) => {
      const sizes = Object.entries(captureSet.sizes ?? {}).filter((entry) => {
        const size = entry[1]
        return size?.runTarget?.kind === "web" && !!size.runTarget.url.trim()
      })
      return { captureSetId, sizes }
    })
    .filter((entry) => entry.sizes.length > 0)

  if (captureSetRunTargets.length > 0) {
    lines.push("- Capture set run targets:")
    for (const { captureSetId, sizes } of captureSetRunTargets) {
      lines.push(`  - ${captureSetId}:`)
      for (const [sizeId, size] of sizes) {
        const runTarget = size.runTarget
        if (runTarget?.kind !== "web" || !runTarget.url.trim()) continue
        lines.push(`    - ${sizeId}: ${runTarget.url.trim()}`)
      }
    }
  }

  for (const story of normalized.stories) {
    lines.push("", `## Story: ${story.id}`, `- Title: ${story.title}`)
    if (story.notes !== undefined) {
      lines.push("- Notes:")
      lines.push(...formatMarkdownBullets(story.notes))
    }
    const storyFrames = [...story.frames, ...flattenBranchFrames(story)]
    for (const frame of storyFrames) {
      lines.push("", `### Frame: ${frame.id}`, `- Title: ${frame.title}`)
      lines.push("- Description:")
      lines.push(...formatMarkdownBullets(frame.description))
      lines.push("- Capture sets:")
      const captureSetIds = Object.keys(frame.captureSets ?? {})
      for (const captureSetId of captureSetIds) {
        const capture = frameCaptureSet(frame, captureSetId)
        lines.push(`  - ${captureSetId}:`)
        lines.push(`    - desktop: ${formatMarkdownAssetPath(capture.screenshots?.desktop)}`)
        lines.push(`    - mobile: ${formatMarkdownAssetPath(capture.screenshots?.mobile)}`)
        lines.push(`    - square: ${formatMarkdownAssetPath(capture.screenshots?.square)}`)
      }
      lines.push("- Transitions:")
      if ((frame.transitions ?? []).length === 0) {
        lines.push("  - End")
      } else {
        for (const transition of frame.transitions ?? []) {
          lines.push(`  - ${transition.label} -> ${transition.targetFrameId}`)
        }
      }
      lines.push("- Notes:")
      lines.push(...formatMarkdownBullets(frame.notes))
    }
  }

  return `${lines.join("\n")}\n`
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
    document: normalizeStoryboardDocument(parsed),
    mtimeMs: stats.mtimeMs,
  }
}

function writeStoryboardDocument(path: string, document: StoryboardDocument) {
  const normalized = normalizeStoryboardDocument(document)
  writeFileSync(path, formatStoryboardDocument(normalized), "utf8")
  const stats = statSync(path)
  return {
    path,
    document: normalized,
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

async function proxyStoryboardAccessServerList(storyboardUrl: string) {
  const accessServerUrl = storyboardAccessServerUrl(storyboardUrl)
  const response = await fetch(new URL("/api/storyboard-access/list", `${accessServerUrl}/`))
  if (!response.ok) {
    throw new Error(await response.text())
  }
  const payload = (await response.json()) as {
    rootDir?: string
    storyboards?: Array<{
      name?: string
      root?: string
      hasStoryboardJson?: boolean
      hasStoryboardMarkdown?: boolean
    }>
  }
  const storyboards = Array.isArray(payload.storyboards)
    ? payload.storyboards
        .filter((storyboard) => typeof storyboard?.name === "string" && storyboard.name.length > 0)
        .map((storyboard) => ({
          name: storyboard.name as string,
          root: storyboard.root,
          hasStoryboardJson: storyboard.hasStoryboardJson,
          hasStoryboardMarkdown: storyboard.hasStoryboardMarkdown,
          storyboardUrl: new URL(`/${storyboard.name}`, `${accessServerUrl}/`).toString().replace(/\/$/, ""),
        }))
    : []

  return {
    accessServerUrl,
    rootDir: payload.rootDir ?? null,
    storyboards,
  }
}

function storyboardAccessApiUrl(storyboardUrl: string, pathAndSearch: string) {
  const accessServerUrl = storyboardAccessServerUrl(storyboardUrl)
  return new URL(pathAndSearch, `${accessServerUrl}/`).toString()
}

async function proxyStoryboardAccessJson(storyboardUrl: string, pathAndSearch: string, init?: RequestInit) {
  const response = await fetch(storyboardAccessApiUrl(storyboardUrl, pathAndSearch), init)
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return await response.json()
}

async function proxyProviderJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  const contentType = response.headers.get("Content-Type") ?? ""
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : { message: await response.text().catch(() => "") }
  if (!response.ok) {
    return {
      status: response.status,
      payload: {
        ok: false,
        unsupported: response.status === 404 || response.status === 405,
        unavailable: response.status >= 500,
        message:
          typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
            ? payload.message
            : `Provider API returned HTTP ${response.status}`,
      },
    }
  }
  return { status: response.status, payload }
}

function providerJsonIsUnsupported(result: { status: number; payload: unknown }) {
  return result.status === 404 || result.status === 405 || (typeof result.payload === "object" && result.payload !== null && Boolean((result.payload as { unsupported?: unknown }).unsupported))
}

async function proxyRunTargetHealthJson(storyboardUrl: string, path: string, runTargetId: string, init?: RequestInit) {
  const response = await fetch(runTargetHealthApiPath(storyboardUrl, path, runTargetId), init)
  const contentType = response.headers.get("Content-Type") ?? ""
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : { message: await response.text().catch(() => "") }
  if (!response.ok) {
    return {
      status: response.status,
      payload: {
        ok: false,
        unsupported: response.status === 404 || response.status === 405,
        unavailable: response.status >= 500,
        message:
          typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
            ? payload.message
            : `Provider Run Target Health API returned HTTP ${response.status}`,
      },
    }
  }
  return { status: response.status, payload }
}

type RunMirror = { root: string; port: number; baseUrl: string; documentMtimeMs: number | null; process?: ReturnType<typeof Bun.spawn> }
const runMirrors = new Map<string, RunMirror>()

function runMirrorKey(storyboardUrl: string) {
  return createHash("sha256").update(normalizeStoryboardBaseUrl(storyboardUrl)).digest("hex").slice(0, 12)
}

function runMirrorPort(key: string) {
  return 8900 + (Number.parseInt(key.slice(0, 4), 16) % 700)
}

type StoryboardRunTargetConfigEntry = {
  storyboardUrl?: string
  storyboardUrlPattern?: string
  storyboardId?: string
  storyId?: string
  frameKey?: string
  runtimeTarget: {
    id: string
    label?: string
    appUrl: string
    appOrigin?: string
    apiRoot?: string
    apiMode?: "real" | "stub" | "mock" | "unknown"
    apiStubInfo?: string
  }
}

function wildcardMatch(pattern: string | undefined, value: string) {
  if (!pattern) return true
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/gu, "\\$&"))
    .join(".*")
  return new RegExp(`^${escaped}$`, "u").test(value)
}

function readStoryboardRunTargetConfig() {
  if (!existsSync(storyboardRunTargetConfigPath)) return [] as StoryboardRunTargetConfigEntry[]
  const payload = JSON.parse(readFileSync(storyboardRunTargetConfigPath, "utf8")) as unknown
  if (Array.isArray(payload)) return payload as StoryboardRunTargetConfigEntry[]
  if (payload && typeof payload === "object" && Array.isArray((payload as { targets?: unknown }).targets)) {
    return (payload as { targets: StoryboardRunTargetConfigEntry[] }).targets
  }
  return [] as StoryboardRunTargetConfigEntry[]
}

function runtimeTargetFromWebUrl(
  url: string | undefined,
  id: string,
  label: string,
  fallback?: StoryboardRunTargetConfigEntry["runtimeTarget"],
): StoryboardRunTargetConfigEntry["runtimeTarget"] | undefined {
  const appUrl = normalizeWebRunTargetUrl(url)
  if (!appUrl) return undefined
  let appOrigin = fallback?.appOrigin
  try {
    appOrigin = new URL(appUrl).origin
  } catch {
    // Leave appOrigin from the fallback, if any; validation happens when the runner opens appUrl.
  }
  return {
    ...fallback,
    id,
    label,
    appUrl,
    ...(appOrigin ? { appOrigin } : {}),
  }
}

function documentRuntimeTargetForFrame(
  storyboard: StoryboardDocument,
  fallback?: StoryboardRunTargetConfigEntry["runtimeTarget"],
) {
  const captureSetRunTarget = storyboard.captureSets?.default?.sizes?.desktop?.runTarget
  return (
    runtimeTargetFromWebUrl(captureSetRunTarget?.url, "storyboard:default:desktop", "Storyboard default desktop web", fallback) ??
    runtimeTargetFromWebUrl(storyboard.runTarget?.url, "storyboard:default", "Storyboard default web", fallback)
  )
}

function configuredRuntimeTargetForFrame(
  storyboardUrl: string,
  storyboard: StoryboardDocument,
  storyId?: string,
  frameKey?: string,
) {
  const normalizedUrl = normalizeStoryboardBaseUrl(storyboardUrl)
  return readStoryboardRunTargetConfig().find((entry) => {
    if (entry.storyboardUrl && normalizeStoryboardBaseUrl(entry.storyboardUrl) !== normalizedUrl) return false
    if (entry.storyboardUrlPattern && !wildcardMatch(entry.storyboardUrlPattern, normalizedUrl)) return false
    if (entry.storyboardId && entry.storyboardId !== storyboard.id) return false
    if (entry.storyId && storyId && entry.storyId !== storyId) return false
    if (entry.storyId && !storyId) return false
    if (entry.frameKey && frameKey && entry.frameKey !== frameKey) return false
    if (entry.frameKey && !frameKey) return false
    return true
  })?.runtimeTarget
}

function documentRunTargetOverride(storyboardUrl: string, storyboard: StoryboardDocument) {
  const runtimeTarget = configuredRuntimeTargetForFrame(storyboardUrl, storyboard)
  return runtimeTarget?.appUrl ? { kind: "web" as const, url: runtimeTarget.appUrl } : undefined
}

function runtimeTargetForFrame(storyboardUrl: string, storyboard: StoryboardDocument, storyId: string, frameKey: string) {
  return configuredRuntimeTargetForFrame(storyboardUrl, storyboard, storyId, frameKey) ?? documentRuntimeTargetForFrame(storyboard)
}

function runManifestEntryId(storyId: string, frameKey: string) {
  const suffix = `${storyId}-${frameKey}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180)
  return suffix ? `agent-browser-run-to-state-${suffix}` : "agent-browser-run-to-state-frame"
}

function allDocumentFrames(storyboard: StoryboardDocument) {
  return storyboard.stories.flatMap((story) => [
    ...story.frames.map((frame) => ({ story, frame })),
    ...(story.branches ?? []).flatMap((branch) => branch.frames.map((frame) => ({ story, frame }))),
  ])
}

function firstFrameAsset(frame: StoryboardFrameRecord) {
  const captureSets = frame.captureSets ?? {}
  for (const captureSet of Object.values(captureSets)) {
    const screenshots = captureSet.screenshots ?? {}
    for (const asset of [screenshots.desktop, screenshots.mobile, screenshots.square, ...Object.values(screenshots)]) {
      if (asset) return asset
    }
  }
  return undefined
}

async function writeRunMirrorFiles(
  storyboardUrl: string,
  root: string,
  providedDocumentPayload?: Awaited<ReturnType<typeof proxyStoryboardUrlDocument>>,
) {
  const documentPayload = providedDocumentPayload ?? await proxyStoryboardUrlDocument(storyboardUrl)
  const storyboard = normalizeStoryboardDocument(documentPayload.document)
  const runTargetOverride = documentRunTargetOverride(storyboardUrl, storyboard)
  if (runTargetOverride) {
    storyboard.runTarget = runTargetOverride
  }
  mkdirSync(join(root, "assets"), { recursive: true })
  writeFileSync(join(root, "storyboard.json"), `${JSON.stringify(storyboard, null, 2)}\n`)
  try {
    const markdown = await (await fetch(storyboardMarkdownUrl(storyboardUrl))).text()
    writeFileSync(join(root, "storyboard.md"), markdown)
  } catch {
    writeFileSync(join(root, "storyboard.md"), formatStoryboardDocument(storyboard))
  }
  for (const { frame } of allDocumentFrames(storyboard).slice(0, 12)) {
    const asset = firstFrameAsset(frame)
    if (!asset) continue
    try {
      const response = await fetch(`${normalizeStoryboardBaseUrl(storyboardUrl)}/${asset.replace(/^\/+/, "")}`)
      if (!response.ok) continue
      const outputPath = join(root, asset)
      mkdirSync(dirname(outputPath), { recursive: true })
      writeFileSync(outputPath, new Uint8Array(await response.arrayBuffer()))
    } catch {
      // Asset copying is best-effort; run-to-state can still proceed with the mirrored storyboard spec.
    }
  }
  const entries = allDocumentFrames(storyboard)
    .map(({ story, frame }) => {
      const runtimeTarget = runtimeTargetForFrame(storyboardUrl, storyboard, story.id, frame.id)
      return {
        id: runManifestEntryId(story.id, frame.id),
        label: "agent-browser run/capture",
        scope: "frame",
        runnerId: "agent-browser",
        modes: ["run-to-state", "capture", "run-and-capture"],
        targets: [{ storyboardId: storyboard.id, storyId: story.id, frameKey: frame.id }],
        paramsSchema: {},
        captureSets: ["default"],
        scriptId: runManifestEntryId(story.id, frame.id),
        ...(runtimeTarget ? { runtimeTarget } : {}),
        enabled: true,
      }
    })
  const manifest = {
    version: 1,
    enabled: true,
    runners: [{ id: "agent-browser", label: "agent-browser", kind: "browser", enabled: true, capabilities: ["run-to-state", "capture", "run-and-capture"] }],
    captureSets: [{ id: "default", label: "Default", viewport: { width: 1440, height: 900, deviceScaleFactor: 1 }, outputPathTemplate: "assets/{frameKey}.{outputVariantId}.png", imageFormat: "png", comparisonPolicy: "manual" }],
    entries,
  }
  writeFileSync(join(root, "storyboard.run.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  return { documentMtimeMs: documentPayload.mtimeMs }
}

async function ensureRunMirror(storyboardUrl: string) {
  const key = runMirrorKey(storyboardUrl)
  const existing = runMirrors.get(key)
  if (existing) {
    const documentPayload = await proxyStoryboardUrlDocument(storyboardUrl)
    if (documentPayload.mtimeMs === null || documentPayload.mtimeMs <= (existing.documentMtimeMs ?? 0)) {
      return existing
    }
    const refreshed = await writeRunMirrorFiles(storyboardUrl, existing.root, documentPayload)
    existing.documentMtimeMs = refreshed.documentMtimeMs
    return existing
  }
  const root = join(runMirrorRoot, key)
  const port = runMirrorPort(key)
  mkdirSync(root, { recursive: true })
  const written = await writeRunMirrorFiles(storyboardUrl, root)
  const proc = Bun.spawn(["bun", "scripts/storyboard-access-server.ts", "--root", root, "--port", String(port)], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      STORYBOARD_RUN_ALLOW_ASSET_FALLBACK: "1",
      STORYBOARD_RUN_SOURCE_URL: storyboardUrl,
      STORYBOARD_AGENT_BROWSER_SESSION_NAME: `storyboard-ui-${key}`,
    },
  })
  const mirror = { root, port, baseUrl: `http://127.0.0.1:${port}`, documentMtimeMs: written.documentMtimeMs, process: proc }
  runMirrors.set(key, mirror)
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`${mirror.baseUrl}/health`)
      if (response.ok) return mirror
    } catch {
      // Keep polling briefly below.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150))
  }
  return mirror
}

function shouldFallbackToRunMirror(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes("storyboard not found: api") ||
    message.includes("storyboard.run.json") ||
    message.includes("not found") ||
    message.includes("Unable to connect")
  )
}

async function proxyStoryboardAccessJsonWithRunMirrorFallback(storyboardUrl: string, pathAndSearch: string, init?: RequestInit) {
  try {
    return await proxyStoryboardAccessJson(storyboardUrl, pathAndSearch, init)
  } catch (error) {
    if (!shouldFallbackToRunMirror(error)) throw error
    const mirror = await ensureRunMirror(storyboardUrl)
    const response = await fetch(new URL(pathAndSearch, `${mirror.baseUrl}/`), init)
    if (!response.ok) throw new Error(await response.text())
    return await response.json()
  }
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
    document: normalizeStoryboardDocument(payload),
    mtimeMs: Number.parseFloat(response.headers.get("X-Storyboard-MtimeMs") ?? "0") || null,
  }
}

async function proxyStoryboardAsset(storyboardUrl: string, assetPath: string, preferRunMirror = false) {
  const sourceUrl = new URL(assetPath, `${normalizeStoryboardBaseUrl(storyboardUrl)}/`)
  if (preferRunMirror) {
    const mirror = runMirrors.get(runMirrorKey(storyboardUrl))
    if (mirror) {
      const clean = assetPath.replace(/^\/+/, "")
      const mirrorPath = resolve(mirror.root, clean)
      const rel = relative(mirror.root, mirrorPath)
      if (!rel.startsWith("..") && !isAbsolute(rel) && existsSync(mirrorPath)) {
        const mirrorStat = statSync(mirrorPath)
        const sourceResponse = await fetch(sourceUrl)
        if (sourceResponse.ok) {
          const sourceMtimeMs = parseNumericStoryboardHeader(sourceResponse.headers.get("X-Storyboard-MtimeMs"))
          if (shouldRefreshRunMirrorAsset(sourceMtimeMs, mirrorStat.mtimeMs)) {
            const sourceBytes = new Uint8Array(await sourceResponse.arrayBuffer())
            mkdirSync(dirname(mirrorPath), { recursive: true })
            writeFileSync(mirrorPath, sourceBytes)
            return new Response(sourceBytes, {
              headers: {
                "Content-Type": sourceResponse.headers.get("Content-Type") ?? contentTypeForAssetPath(mirrorPath),
                "X-Storyboard-Run-Mirror": "refreshed-from-source",
                "X-Storyboard-Run-Mirror-MtimeMs": String(statSync(mirrorPath).mtimeMs),
                "X-Storyboard-Source-MtimeMs": String(sourceMtimeMs),
              },
            })
          }
        }
        return new Response(Bun.file(mirrorPath), {
          headers: {
            "Content-Type": contentTypeForAssetPath(mirrorPath),
            "X-Storyboard-Run-Mirror": "1",
            "X-Storyboard-Run-Mirror-MtimeMs": String(mirrorStat.mtimeMs),
            ...(sourceResponse.ok && parseNumericStoryboardHeader(sourceResponse.headers.get("X-Storyboard-MtimeMs")) !== null
              ? { "X-Storyboard-Source-MtimeMs": String(parseNumericStoryboardHeader(sourceResponse.headers.get("X-Storyboard-MtimeMs"))) }
              : {}),
          },
        })
      }
    }
  }
  const response = await fetch(sourceUrl)
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response
}

function contentTypeForAssetPath(pathname: string) {
  const ext = extname(pathname).toLowerCase()
  if (ext === ".png") return "image/png"
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg"
  if (ext === ".webp") return "image/webp"
  if (ext === ".svg") return "image/svg+xml"
  return "application/octet-stream"
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

async function readRemoteStoryboardMarkdown(storyboardUrl: string) {
  const response = await fetch(storyboardMarkdownUrl(storyboardUrl))
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return await response.text()
}

async function writeRemoteStoryboardMarkdown(
  storyboardUrl: string,
  document: StoryboardDocument,
) {
  await putRemoteStoryboardFile(
    storyboardUrl,
    "storyboard.md",
    formatStoryboardMarkdown(document),
    "text/markdown; charset=utf-8",
  )
}

async function archiveRemoteStoryboardFailure(
  storyboardUrl: string,
  markdown: string,
) {
  for (let index = 1; index < 10_000; index += 1) {
    const relativePath = `storyboard.fail-${String(index).padStart(4, "0")}.md`
    const fileUrl = storyboardFilesApiUrl(storyboardUrl, relativePath)
    const probe = await fetch(fileUrl)
    if (probe.status === 404) {
      const response = await fetch(fileUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
        },
        body: markdown,
      })
      if (!response.ok) {
        throw new Error(`failed to archive broken markdown: ${await response.text()}`)
      }
      return relativePath
    }
  }
  throw new Error("could not allocate storyboard failure path")
}

function parseStoryboardMarkdown(markdown: string, fallbackId = "storyboard") {
  const lines = markdown.replace(/\r/g, "").split("\n")
  const document: StoryboardDocument = {
    id: fallbackId,
    title: "Untitled storyboard",
    stories: [],
  }
  const parsedStories: Array<{ id: string; title: string; notes?: string; frames: StoryboardFrameRecord[] }> = []
  let currentStory: { id: string; title: string; notes?: string; frames: StoryboardFrameRecord[] } | null = null
  let currentFrame: StoryboardFrameRecord | null = null
  let currentSection: "description" | "notes" | "transitions" | "capture-sets" | "screenshots" | "document-capture-run-targets" | null = null
  let currentCaptureSetId: string | null = null
  let currentDocumentCaptureSetId: string | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }
    if (trimmed.startsWith("## Story: ")) {
      currentStory = {
        id: trimmed.slice("## Story: ".length).trim(),
        title: "Untitled story",
        frames: [],
      }
      parsedStories.push(currentStory)
      currentFrame = null
      currentSection = null
      currentCaptureSetId = null
      currentDocumentCaptureSetId = null
      continue
    }
    if (trimmed.startsWith("### Frame: ")) {
      if (!currentStory) {
        throw new Error(`Frame declared before story at line ${index + 1}`)
      }
      currentFrame = {
        id: trimmed.slice("### Frame: ".length).trim(),
        title: "Untitled frame",
        transitions: [],
      }
      currentStory.frames.push(currentFrame)
      currentSection = null
      currentCaptureSetId = null
      currentDocumentCaptureSetId = null
      continue
    }
    if (!currentStory && trimmed.startsWith("- Run target: ")) {
      const value = trimmed.slice("- Run target: ".length).trim()
      document.runTarget = value ? { kind: "web", url: value } : undefined
      continue
    }
    if (!currentStory && trimmed === "- Capture set run targets:") {
      currentSection = "document-capture-run-targets"
      currentDocumentCaptureSetId = null
      continue
    }
    if (trimmed.startsWith("- Title: ")) {
      const value = trimmed.slice("- Title: ".length)
      if (currentFrame) {
        currentFrame.title = value
      } else if (currentStory) {
        currentStory.title = value
      } else {
        document.title = value
      }
      continue
    }
    if (trimmed === "- Description:") {
      currentSection = "description"
      continue
    }
    if (trimmed === "- Notes:") {
      currentSection = "notes"
      continue
    }
    if (trimmed === "- Transitions:") {
      currentSection = "transitions"
      continue
    }
    if (trimmed === "- Capture sets:") {
      currentSection = "capture-sets"
      currentCaptureSetId = null
      continue
    }
    if (trimmed === "- Screenshots:") {
      currentSection = "screenshots"
      currentCaptureSetId = "default"
      continue
    }
    if (trimmed.startsWith("- Outcome:")) {
      continue
    }
    if (line.startsWith("  - ") && currentSection === "description") {
      if (!currentFrame) {
        throw new Error(`Description found before frame at line ${index + 1}`)
      }
      currentFrame.description = [currentFrame.description, line.slice(4).trim()].filter(Boolean).join("\n")
      continue
    }
    if (line.startsWith("  - ") && currentSection === "notes") {
      const value = line.slice(4).trim()
      if (currentFrame) {
        currentFrame.notes = [currentFrame.notes, value].filter(Boolean).join("\n")
      } else if (currentStory) {
        currentStory.notes = [currentStory.notes, value].filter(Boolean).join("\n")
      }
      continue
    }
    if (line.startsWith("  - ") && currentSection === "transitions") {
      if (!currentFrame) {
        throw new Error(`Transitions found before frame at line ${index + 1}`)
      }
      const value = line.slice(4).trim()
      if (value !== "End") {
        const match = value.match(/^(.*?)\s*->\s*(.+)$/)
        if (!match) {
          throw new Error(`Invalid transition syntax at line ${index + 1}: ${value}`)
        }
        currentFrame.transitions = [
          ...(currentFrame.transitions ?? []),
          {
            id: `${currentFrame.id}-transition-${(currentFrame.transitions?.length ?? 0) + 1}`,
            label: match[1].trim(),
            kind: "user",
            targetFrameId: match[2].trim(),
          },
        ]
      }
      continue
    }
    if (line.startsWith("  - ") && currentSection === "capture-sets") {
      if (!currentFrame) {
        throw new Error(`Capture set found before frame at line ${index + 1}`)
      }
      const value = line.slice(4).trim()
      if (!value.endsWith(":")) {
        throw new Error(`Invalid capture set syntax at line ${index + 1}: ${value}`)
      }
      currentCaptureSetId = value.slice(0, -1).trim()
      currentFrame.captureSets = {
        ...(currentFrame.captureSets ?? {}),
        [currentCaptureSetId]: currentFrame.captureSets?.[currentCaptureSetId] ?? { screenshots: {} },
      }
      continue
    }
    if (line.startsWith("  - ") && currentSection === "document-capture-run-targets") {
      const value = line.slice(4).trim()
      if (!value.endsWith(":")) {
        throw new Error(`Invalid document capture-set run target syntax at line ${index + 1}: ${value}`)
      }
      currentDocumentCaptureSetId = value.slice(0, -1).trim()
      document.captureSets = {
        ...(document.captureSets ?? {}),
        [currentDocumentCaptureSetId]: document.captureSets?.[currentDocumentCaptureSetId] ?? {},
      }
      continue
    }
    if (line.startsWith("  - ") && currentSection === "screenshots") {
      if (!currentFrame) {
        throw new Error(`Screenshots found before frame at line ${index + 1}`)
      }
      currentCaptureSetId = "default"
      const match = line.slice(4).trim().match(/^(desktop|mobile|square):\s*(.*)$/)
      if (!match) {
        throw new Error(`Invalid screenshot syntax at line ${index + 1}: ${line.trim()}`)
      }
      currentFrame.captureSets = {
        ...(currentFrame.captureSets ?? {}),
        default: {
          ...(currentFrame.captureSets?.default ?? {}),
          screenshots: {
            ...(currentFrame.captureSets?.default?.screenshots ?? {}),
            [match[1]]: match[2].trim().replace(/^\.\//, "") || undefined,
          },
        },
      }
      continue
    }
    if (line.startsWith("    - ") && currentSection === "capture-sets") {
      if (!currentFrame || !currentCaptureSetId) {
        throw new Error(`Screenshot found before capture set at line ${index + 1}`)
      }
      const match = line.slice(6).trim().match(/^(desktop|mobile|square):\s*(.*)$/)
      if (!match) {
        throw new Error(`Invalid screenshot syntax at line ${index + 1}: ${line.trim()}`)
      }
      currentFrame.captureSets = {
        ...(currentFrame.captureSets ?? {}),
        [currentCaptureSetId]: {
          ...(currentFrame.captureSets?.[currentCaptureSetId] ?? {}),
          screenshots: {
            ...(currentFrame.captureSets?.[currentCaptureSetId]?.screenshots ?? {}),
            [match[1]]: match[2].trim().replace(/^\.\//, "") || undefined,
          },
        },
      }
      continue
    }
    if (line.startsWith("    - ") && currentSection === "document-capture-run-targets") {
      if (!currentDocumentCaptureSetId) {
        throw new Error(`Run target found before document capture set at line ${index + 1}`)
      }
      const match = line.slice(6).trim().match(/^(desktop|mobile|square):\s*(.*)$/)
      if (!match) {
        throw new Error(`Invalid document capture-set run target syntax at line ${index + 1}: ${line.trim()}`)
      }
      const url = match[2].trim()
      if (!url) continue
      const currentCaptureSet = document.captureSets?.[currentDocumentCaptureSetId] ?? {}
      const sizeKey = match[1] as "desktop" | "mobile" | "square"
      document.captureSets = {
        ...(document.captureSets ?? {}),
        [currentDocumentCaptureSetId]: {
          ...currentCaptureSet,
          sizes: {
            ...(currentCaptureSet.sizes ?? {}),
            [sizeKey]: {
              ...(currentCaptureSet.sizes?.[sizeKey] ?? {}),
              runTarget: { kind: "web", url },
            },
          },
        },
      }
      continue
    }
  }

  function buildRow(frameMap: Map<string, StoryboardFrameRecord>, startId: string, visited: Set<string>) {
    const frames: StoryboardFrameRecord[] = []
    let currentId: string | undefined = startId
    while (currentId && frameMap.has(currentId) && !visited.has(currentId)) {
      visited.add(currentId)
      const frame = frameMap.get(currentId)
      if (!frame) break
      frames.push(frame)
      currentId = frame.transitions?.[0]?.targetFrameId
    }
    return frames
  }

  function buildBranchesForRow(
    storyId: string,
    rowFrames: StoryboardFrameRecord[],
    frameMap: Map<string, StoryboardFrameRecord>,
    visited: Set<string>,
  ) {
    const branches: NonNullable<StoryboardStoryRecord["branches"]> = []
    for (const frame of rowFrames) {
      const sideTransitions = (frame.transitions ?? []).slice(1)
      sideTransitions.forEach((transition, index) => {
        const branchFrames = buildRow(frameMap, transition.targetFrameId, visited)
        if (branchFrames.length === 0) {
          return
        }
        branches.push({
          id: `${storyId}-${frame.id}-branch-${index + 1}`,
          label: transition.label,
          sourceFrameId: frame.id,
          frames: branchFrames,
        })
        branches.push(...buildBranchesForRow(storyId, branchFrames, frameMap, visited))
      })
    }
    return branches
  }

  document.stories = parsedStories.map((story) => {
    const normalizedStory = normalizeStoryboardDocument({
      id: fallbackId,
      title: document.title,
      stories: [
        {
          id: story.id,
          title: story.title,
          ...(story.notes ? { notes: story.notes } : {}),
          frames: story.frames,
        },
      ],
    }).stories[0]
    const frameMap = new Map(normalizedStory.frames.map((frame) => [frame.id, frame]))
    const visited = new Set<string>()
    const mainFrames = normalizedStory.frames.length > 0
      ? buildRow(frameMap, normalizedStory.frames[0].id, visited)
      : []
    const branches = buildBranchesForRow(story.id, mainFrames, frameMap, visited)
    return {
      id: story.id,
      title: story.title,
      ...(story.notes ? { notes: story.notes } : {}),
      frames: mainFrames,
      ...(branches.length > 0 ? { branches } : {}),
    }
  })

  return normalizeStoryboardDocument(document)
}

async function initializeRemoteStoryboard(storyboardUrl: string) {
  const templateDocument = readStoryboardDocument(defaultStoryboardJsonPath).document
  const templateMarkdown = formatStoryboardMarkdown(templateDocument)
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

    if (pathname === "/api/storyboard/list" && request.method === "GET") {
      try {
        const storyboardUrl = resolveStoryboardUrl(url, request.url)
        if (!storyboardUrl) {
          return textError("missing storyboardUrl", 400)
        }
        return jsonResponse({ ok: true, ...(await proxyStoryboardAccessServerList(storyboardUrl)) })
      } catch (error) {
        return textError(error instanceof Error ? error.message : String(error), 404)
      }
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
        const normalizedBody = normalizeStoryboardDocument(body)
        const storyboardUrl = resolveStoryboardUrl(url, request.url)
        if (storyboardUrl) {
          await writeRemoteStoryboardMarkdown(storyboardUrl, normalizedBody)
          return jsonResponse({
            ok: true,
            ...(await proxyStoryboardUrlDocument(storyboardUrl, {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(normalizedBody),
            })),
          })
        }
        const path = resolveStoryboardPath(url)
        const result = writeStoryboardDocument(path, normalizedBody)
        writeFileSync(join(dirname(path), "storyboard.md"), formatStoryboardMarkdown(result.document), "utf8")
        return jsonResponse({ ok: true, ...result })
      } catch (error) {
        return textError(error instanceof Error ? error.message : String(error), 400)
      }
    }

    if (pathname === "/api/storyboard/import-markdown" && request.method === "POST") {
      try {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as { storyboardUrl?: string }
        const storyboardUrl = body.storyboardUrl?.trim()
        if (!storyboardUrl) {
          return textError("missing storyboardUrl", 400)
        }
        const resolvedUrl = normalizeStoryboardBaseUrl(new URL(storyboardUrl, request.url).toString())
        const current = await proxyStoryboardUrlDocument(resolvedUrl)
        const markdown = await readRemoteStoryboardMarkdown(resolvedUrl)
        try {
          const parsed = parseStoryboardMarkdown(markdown, current.document.id)
          await writeRemoteStoryboardMarkdown(resolvedUrl, parsed)
          return jsonResponse({
            ok: true,
            ...(await proxyStoryboardUrlDocument(resolvedUrl, {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(parsed),
            })),
          })
        } catch (error) {
          const failurePath = await archiveRemoteStoryboardFailure(resolvedUrl, markdown)
          await writeRemoteStoryboardMarkdown(resolvedUrl, current.document)
          const message = [
            "The storyboard markdown import failed.",
            "",
            `Storyboard URL: ${resolvedUrl}`,
            `Failure file: ${failurePath}`,
            "Restored file: storyboard.md was reset to the canonical markdown generated from storyboard.json.",
            "",
            `Import error: ${error instanceof Error ? error.message : String(error)}`,
            "",
            "Please compare the failure file against storyboard.md, fix the markdown format while preserving the intended content, then save storyboard.md again.",
          ].join("\n")
          return jsonResponse(
            {
              ok: false,
              failurePath,
              restoredPath: "storyboard.md",
              message,
            },
            409,
          )
        }
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
        const response = await proxyStoryboardAsset(storyboardUrl, assetPath, url.searchParams.get("preferRunMirror") === "1")
        const headers = new Headers({
          "Content-Type": response.headers.get("Content-Type") ?? "application/octet-stream",
          "Cache-Control": "no-cache",
        })
        for (const headerName of ["X-Storyboard-Run-Mirror", "X-Storyboard-Run-Mirror-MtimeMs", "X-Storyboard-Source-MtimeMs"]) {
          const value = response.headers.get(headerName)
          if (value) headers.set(headerName, value)
        }
        return new Response(response.body, {
          status: response.status,
          headers,
        })
      } catch (error) {
        return textError(error instanceof Error ? error.message : String(error), 404)
      }
    }


    if (pathname === "/api/storyboard/run-capabilities" && request.method === "GET") {
      try {
        const storyboardUrl = resolveStoryboardUrl(url, request.url)
        if (!storyboardUrl) {
          return textError("missing storyboardUrl", 400)
        }
        return jsonResponse({ ok: true, ...(await proxyStoryboardAccessJsonWithRunMirrorFallback(storyboardUrl, "/api/storyboard-access/capabilities")) })
      } catch (error) {
        return textError(error instanceof Error ? error.message : String(error), 400)
      }
    }

    if (pathname === "/api/storyboard/run-state" && request.method === "GET") {
      try {
        const storyboardUrl = resolveStoryboardUrl(url, request.url)
        if (!storyboardUrl) {
          return textError("missing storyboardUrl", 400)
        }
        const upstream = new URL("/api/storyboard-access/state", `${storyboardAccessServerUrl(storyboardUrl)}/`)
        for (const key of ["captureSetId", "outputVariantId", "screenSizeId"]) {
          const value = url.searchParams.get(key)
          if (value) upstream.searchParams.set(key, value)
        }
        return jsonResponse({ ok: true, ...((await proxyStoryboardAccessJsonWithRunMirrorFallback(storyboardUrl, `${upstream.pathname}${upstream.search}`)) as Record<string, unknown>) })
      } catch (error) {
        return textError(error instanceof Error ? error.message : String(error), 400)
      }
    }

    if (pathname === "/api/storyboard/run-targets" && request.method === "GET") {
      try {
        const storyboardUrl = resolveStoryboardUrl(url, request.url)
        if (!storyboardUrl) return textError("missing storyboardUrl", 400)
        const { status, payload } = await proxyProviderJson(runTargetProviderApiPath(storyboardUrl, "run-targets"))
        return jsonResponse(payload, status)
      } catch (error) {
        return jsonResponse({ ok: false, unavailable: true, message: error instanceof Error ? error.message : String(error) }, 502)
      }
    }

    if (pathname === "/api/storyboard/run-targets/config" && (request.method === "PUT" || request.method === "POST")) {
      try {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as { storyboardUrl?: string; runTargetId?: string; values?: Record<string, unknown> }
        const storyboardUrl = body.storyboardUrl?.trim()
        const runTargetId = body.runTargetId?.trim()
        if (!storyboardUrl) return textError("missing storyboardUrl", 400)
        if (!runTargetId) return textError("missing runTargetId", 400)
        const values = body.values ?? {}
        const method = request.method
        const headers = { "Content-Type": "application/json" }
        const legacyResult = await proxyProviderJson(runTargetProviderApiPath(storyboardUrl, "run-target-config"), {
          method,
          headers,
          body: JSON.stringify({ runTargetId, config: values }),
        })
        if (!providerJsonIsUnsupported(legacyResult)) {
          return jsonResponse(legacyResult.payload, legacyResult.status)
        }
        const genericResult = await proxyProviderJson(runTargetProviderApiPath(storyboardUrl, "run-targets/config"), {
          method,
          headers,
          body: JSON.stringify({ runTargetId, values }),
        })
        return jsonResponse(genericResult.payload, genericResult.status)
      } catch (error) {
        return jsonResponse({ ok: false, unavailable: true, message: error instanceof Error ? error.message : String(error) }, 502)
      }
    }

    if (pathname === "/api/storyboard/run-target-health" && request.method === "GET") {
      try {
        const storyboardUrl = resolveStoryboardUrl(url, request.url)
        const runTargetId = url.searchParams.get("runTargetId")?.trim()
        if (!storyboardUrl) return textError("missing storyboardUrl", 400)
        if (!runTargetId) return textError("missing runTargetId", 400)
        const { status, payload } = await proxyRunTargetHealthJson(storyboardUrl, "run-target-health", runTargetId)
        return jsonResponse(payload, status)
      } catch (error) {
        return jsonResponse({ ok: false, unavailable: true, message: error instanceof Error ? error.message : String(error) }, 502)
      }
    }

    if ((pathname === "/api/storyboard/run-target-health/check" || pathname === "/api/storyboard/run-target-health/check-all") && request.method === "POST") {
      try {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as { storyboardUrl?: string; runTargetId?: string; key?: string }
        const storyboardUrl = body.storyboardUrl?.trim()
        const runTargetId = body.runTargetId?.trim()
        const key = body.key?.trim()
        if (!storyboardUrl) return textError("missing storyboardUrl", 400)
        if (!runTargetId) return textError("missing runTargetId", 400)
        const isCheckAll = pathname === "/api/storyboard/run-target-health/check-all"
        if (!isCheckAll && !key) return textError("missing health check key", 400)
        const { status, payload } = await proxyRunTargetHealthJson(
          storyboardUrl,
          isCheckAll ? "run-target-health/check-all" : "run-target-health/check",
          runTargetId,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runTargetId, ...(key ? { key } : {}) }),
          },
        )
        return jsonResponse(payload, status)
      } catch (error) {
        return jsonResponse({ ok: false, unavailable: true, message: error instanceof Error ? error.message : String(error) }, 502)
      }
    }

    if (pathname === "/api/storyboard/runs" && request.method === "POST") {
      try {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as { storyboardUrl?: string } & Record<string, unknown>
        const storyboardUrl = body.storyboardUrl?.trim()
        if (!storyboardUrl) {
          return textError("missing storyboardUrl", 400)
        }
        const { storyboardUrl: _storyboardUrl, ...runRequest } = body
        let payload: unknown
        if (runRequest.mode === "run-and-capture" || runRequest.mode === "capture") {
          const mirror = await ensureRunMirror(storyboardUrl)
          const response = await fetch(new URL("/api/storyboard-access/runs", `${mirror.baseUrl}/`), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(runRequest),
          })
          if (!response.ok) throw new Error(await response.text())
          payload = await response.json()
        } else {
          payload = await proxyStoryboardAccessJsonWithRunMirrorFallback(storyboardUrl, "/api/storyboard-access/runs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(runRequest),
          })
        }
        return jsonResponse(payload, 202)
      } catch (error) {
        return textError(error instanceof Error ? error.message : String(error), 400)
      }
    }

    if (pathname.startsWith("/api/storyboard/runs/") && request.method === "GET") {
      try {
        const storyboardUrl = resolveStoryboardUrl(url, request.url)
        if (!storyboardUrl) {
          return textError("missing storyboardUrl", 400)
        }
        const suffix = pathname.slice("/api/storyboard/runs/".length)
        return jsonResponse(await proxyStoryboardAccessJsonWithRunMirrorFallback(storyboardUrl, `/api/storyboard-access/runs/${suffix}`))
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
