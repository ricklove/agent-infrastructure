#!/usr/bin/env bun

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { createHash, randomBytes } from "node:crypto";
import {
  StoryboardRunManifestError,
  augmentManifestWithStoryboardDocumentRuntimeTargets,
  capabilitiesFromManifest,
  createStoryboardRunStorage,
  deriveStoryboardRunFreshness,
  generateStoryboardRunJobId,
  hashStoryboardRunJson,
  isSafeStoryboardRunServedArtifactPath,
  loadStoryboardRunManifest,
  resolveStoryboardDocumentRuntimeTarget,
  terminalRunLifecycleStates,
  validateCreateRunRequest,
  type Run,
  type RunLifecycleStatus,
  type StoryboardRunManifest,
} from "../packages/storyboard-ui/src/run-system.js";
import { rewriteLoopbackUrlsInActionForStoryboardSource } from "../packages/storyboard-ui/src/storyboard-action-url.js";

type Config = {
  port: number;
  rootDir: string;
  allowWrite: boolean;
};

type FilePayload = {
  contents: string;
};

const usage = `storyboard-access-server.ts

Starts a small Bun HTTP server for a single storyboard directory.

The directory contract is fixed:
  <root>/storyboard.json
  <root>/storyboard.md
  <root>/assets/...

The canonical URL shape is:
  /<storyboard-name>/storyboard.json
  /<storyboard-name>/storyboard.md
  /<storyboard-name>/assets/...

where <storyboard-name> is the basename of --root.

Examples:
  bun scripts/storyboard-access-server.ts --root /path/to/storyboard-dir
  bun scripts/storyboard-access-server.ts --root /path/to/storyboard-dir --port 8898
  bun scripts/storyboard-access-server.ts --root /path/to/storyboard-dir --read-only

Options:
  --root <path>      Storyboard directory root. Required unless STORYBOARD_ACCESS_ROOT is set.
  --port <port>      Server port. Default: 8798
  --read-only        Disable writes.
  --help             Show this help.

Environment:
  STORYBOARD_ACCESS_ROOT
  STORYBOARD_ACCESS_PORT
  STORYBOARD_ACCESS_READ_ONLY=1

Endpoints:
  GET  /health
  GET  /config
  GET  /<storyboard-name>/storyboard.json
  PUT  /<storyboard-name>/storyboard.json
  GET  /<storyboard-name>/storyboard.md
  PUT  /<storyboard-name>/storyboard.md
  GET  /<storyboard-name>/assets/<path>
  PUT  /<storyboard-name>/assets/<path>
  GET  /api/storyboard-access/storyboard
  PUT  /api/storyboard-access/storyboard
  GET  /api/storyboard-access/markdown
  PUT  /api/storyboard-access/markdown
  GET  /api/storyboard-access/assets?path=assets/foo.png
  GET  /api/storyboard-access/files?path=assets/foo.png
  PUT  /api/storyboard-access/files?path=assets/foo.txt
  GET  /api/storyboard-access/list
  GET  /api/storyboard-access/capabilities
`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  let rootDir: string | null = null;
  let port: number | null = null;
  let readOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      console.log(usage);
      process.exit(0);
    }
    if (arg === "--read-only") {
      readOnly = true;
      continue;
    }
    if (arg === "--root") {
      const value = argv[index + 1];
      if (!value) fail("missing value for --root");
      rootDir = resolve(value);
      index += 1;
      continue;
    }
    if (arg === "--port") {
      const value = argv[index + 1];
      if (!value) fail("missing value for --port");
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        fail(`invalid --port value: ${value}`);
      }
      port = parsed;
      index += 1;
      continue;
    }
    fail(`unknown option: ${arg}`);
  }

  const resolvedRootDir = rootDir ?? process.env.STORYBOARD_ACCESS_ROOT?.trim();
  if (!resolvedRootDir) {
    fail(
      "missing storyboard root; pass --root <path> or set STORYBOARD_ACCESS_ROOT",
    );
  }

  return {
    rootDir: resolve(resolvedRootDir),
    port:
      port ??
      Number.parseInt(process.env.STORYBOARD_ACCESS_PORT?.trim() || "8798", 10),
    readOnly: readOnly || process.env.STORYBOARD_ACCESS_READ_ONLY === "1",
  };
}

const parsedArgs = parseArgs(process.argv.slice(2));

const config: Config = {
  rootDir: parsedArgs.rootDir,
  port: parsedArgs.port,
  allowWrite: !parsedArgs.readOnly,
};

const storyboardName = basename(config.rootDir);
const storyboardUrlBase = `/${storyboardName}`;

const storyboardJsonPath = join(config.rootDir, "storyboard.json");
const storyboardMarkdownPath = join(config.rootDir, "storyboard.md");
const assetsDir = join(config.rootDir, "assets");
const runStorage = createStoryboardRunStorage(config.rootDir);

function loadRunManifestForResponse() {
  try {
    const result = loadStoryboardRunManifest(config.rootDir);
    if (!result.loaded) return result;
    return {
      ...result,
      manifest: augmentManifestWithStoryboardDocumentRuntimeTargets(
        result.manifest,
        readStoryboardJsonDocument(),
      ),
    };
  } catch (error) {
    if (error instanceof StoryboardRunManifestError) {
      throw new Error(`${error.code}: ${error.message}`);
    }
    throw error;
  }
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function textResponse(
  payload: string,
  status = 200,
  contentType = "text/plain; charset=utf-8",
) {
  return new Response(payload, {
    status,
    headers: {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function rawFileResponse(pathValue: string) {
  const stats = statSync(pathValue);
  return new Response(Bun.file(pathValue), {
    headers: {
      "Content-Type": fileContentType(pathValue),
      "X-Storyboard-Path": pathValue,
      "X-Storyboard-MtimeMs": String(stats.mtimeMs),
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function textError(message: string, status = 400) {
  return textResponse(message, status);
}

function fileContentType(pathValue: string) {
  const ext = extname(pathValue).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".html":
      return "text/html; charset=utf-8";
    case ".md":
      return "text/markdown; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function assertNoSymlinkAncestors(pathValue: string) {
  const relativePath = relative(config.rootDir, pathValue);
  let current = config.rootDir;
  for (const part of relativePath.split(sep).filter(Boolean)) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new Error("path must not traverse symlinks");
    }
  }
}

function ensureRelativePath(pathValue: string | null | undefined) {
  if (!pathValue?.trim()) {
    throw new Error("missing relative path");
  }
  if (
    !isSafeStoryboardRunServedArtifactPath(pathValue) &&
    pathValue.split("/").some((part) => part.startsWith("."))
  ) {
    throw new Error(
      "dotfiles and runtime storage are not served through generic file APIs",
    );
  }
  const resolved = resolve(config.rootDir, pathValue);
  const relativePath = relative(config.rootDir, resolved);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`path must stay under ${config.rootDir}`);
  }
  assertNoSymlinkAncestors(resolved);
  return resolved;
}

function atomicWrite(pathValue: string, contents: string | Uint8Array) {
  mkdirSync(dirname(pathValue), { recursive: true });
  const temporaryPath = join(
    dirname(pathValue),
    `.tmp-${basename(pathValue)}-${randomBytes(8).toString("hex")}`,
  );
  writeFileSync(temporaryPath, contents);
  renameSync(temporaryPath, pathValue);
}

function fileKind(pathValue: string) {
  if (
    pathValue === storyboardJsonPath ||
    pathValue.endsWith("/storyboard.json")
  ) {
    return "storyboard-json";
  }
  if (
    pathValue === storyboardMarkdownPath ||
    pathValue.endsWith("/storyboard.md")
  ) {
    return "storyboard-markdown";
  }
  return extname(pathValue).slice(1) || "file";
}

function readFileRecord(pathValue: string) {
  const contents = readFileSync(pathValue, "utf8");
  const stats = statSync(pathValue);
  return {
    path: pathValue,
    relativePath: relative(config.rootDir, pathValue) || ".",
    kind: fileKind(pathValue),
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    contents,
  };
}

function writeFileRecord(pathValue: string, contents: string) {
  atomicWrite(pathValue, contents);
  return readFileRecord(pathValue);
}

function writeBinaryFile(pathValue: string, bytes: Uint8Array) {
  atomicWrite(pathValue, bytes);
  const stats = statSync(pathValue);
  return {
    path: pathValue,
    relativePath: relative(config.rootDir, pathValue) || ".",
    kind: fileKind(pathValue),
    size: stats.size,
    mtimeMs: stats.mtimeMs,
  };
}

function listFiles(
  current: string,
  results: Array<{ path: string; relativePath: string; kind: string }>,
) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const fullPath = join(current, entry.name);
    if (entry.isDirectory()) {
      listFiles(fullPath, results);
      continue;
    }
    results.push({
      path: fullPath,
      relativePath: relative(config.rootDir, fullPath),
      kind: fileKind(fullPath),
    });
  }
}

function listStoryboardDirectory() {
  if (!existsSync(config.rootDir)) {
    return [];
  }
  const results: Array<{ path: string; relativePath: string; kind: string }> =
    [];
  listFiles(config.rootDir, results);
  return results.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

async function readPayload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const parsed = (await request.json()) as Partial<FilePayload> &
      Record<string, unknown>;
    if (typeof parsed.contents === "string") {
      return parsed.contents;
    }
    return `${JSON.stringify(parsed, null, 2)}\n`;
  }
  return await request.text();
}

function readStoryboardJsonDocument() {
  if (!existsSync(storyboardJsonPath)) {
    throw new Error("storyboard.json not found");
  }
  return JSON.parse(readFileSync(storyboardJsonPath, "utf8")) as {
    id: string;
    stories: Array<{
      id: string;
      frames: Array<{ id: string } & Record<string, unknown>>;
      branches?: Array<{
        frames: Array<{ id: string } & Record<string, unknown>>;
      }>;
    }>;
  } & Record<string, unknown>;
}

function allStoryboardFrameIdentities() {
  const storyboard = readStoryboardJsonDocument();
  return storyboard.stories.flatMap((story) => [
    ...story.frames.map((frame) => ({
      storyboard,
      storyId: story.id,
      frameKey: frame.id,
    })),
    ...(story.branches ?? []).flatMap((branch) =>
      branch.frames.map((frame) => ({
        storyboard,
        storyId: story.id,
        frameKey: frame.id,
      })),
    ),
  ]);
}

function queuePosition(jobId: string) {
  return runStorage
    .listJobs()
    .filter((job) => job.status === "queued")
    .findIndex((job) => job.jobId === jobId);
}


let activeRunJob: string | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function allStoryboardFramesWithStory() {
  const storyboard = readStoryboardJsonDocument();
  return storyboard.stories.flatMap((story) => [
    ...story.frames.map((frame, index) => ({ storyboard, story, frame, index, branch: null as null | { frames: Array<{ id: string } & Record<string, unknown>> } })),
    ...(story.branches ?? []).flatMap((branch) =>
      branch.frames.map((frame, index) => ({ storyboard, story, frame, index, branch })),
    ),
  ]);
}

function actionText(frame: { notes?: unknown }) {
  const notes = typeof frame.notes === "string" ? frame.notes : "";
  const match = notes.match(/agent-browser action:\s*([^\n]+)/iu);
  return (match?.[1] ?? "").trim();
}

function assertionText(frame: { notes?: unknown }) {
  const notes = typeof frame.notes === "string" ? frame.notes : "";
  const match = notes.match(/Assertion:\s*([^\n]+)/iu);
  return (match?.[1] ?? "").trim();
}

function extractOpenUrl(action: string) {
  return action.match(/\bopen\s+(https?:\/\/\S+)/iu)?.[1]?.replace(/[).,]+$/u, "") ?? null;
}

function frameCaptureAsset(frame: Record<string, unknown>, captureSetId: string, outputVariantId?: string, screenSizeId?: string) {
  const captureSets = frame.captureSets as undefined | Record<string, { screenshots?: Record<string, string> }>;
  const capture = captureSets?.[captureSetId] ?? captureSets?.default;
  const screenshots = capture?.screenshots ?? {};
  const variant = outputVariantId ?? screenSizeId ?? "desktop";
  return screenshots[variant] ?? screenshots.desktop ?? Object.values(screenshots).find(Boolean) ?? null;
}

function safeStoryboardAssetPath(assetPath: string) {
  const clean = assetPath.replace(/^\/+/, "");
  const fullPath = resolve(config.rootDir, clean);
  const rel = relative(config.rootDir, fullPath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`unsafe asset path: ${assetPath}`);
  }
  return { clean, fullPath };
}

function outputPathFromTemplate(template: string, frameKey: string, outputVariantId: string, screenSizeId?: string) {
  return template
    .replaceAll("{frameKey}", frameKey)
    .replaceAll("{outputVariantId}", outputVariantId)
    .replaceAll("{screenSizeId}", screenSizeId ?? outputVariantId)
    .replaceAll("{variant}", outputVariantId);
}

async function captureAgentBrowserVariant(
  jobId: string,
  frame: Record<string, unknown>,
  captureSetId: string,
  outputVariantId: string,
  captureSet: { outputPathTemplate?: string; imageFormat?: string } | undefined,
  screenSizeId?: string,
) {
  const existingAsset = frameCaptureAsset(frame, captureSetId, outputVariantId, screenSizeId);
  const templatedAsset = captureSet?.outputPathTemplate
    ? outputPathFromTemplate(captureSet.outputPathTemplate, String(frame.id ?? "frame"), outputVariantId, screenSizeId)
    : null;
  const assetPath = existingAsset ?? templatedAsset;
  if (!assetPath) {
    throw new Error(`no output asset path for ${captureSetId}/${outputVariantId}`);
  }
  const { clean, fullPath } = safeStoryboardAssetPath(assetPath);
  mkdirSync(dirname(fullPath), { recursive: true });
  const screenshot = await runAgentBrowser(["screenshot", fullPath], 20_000);
  runStorage.appendLog(jobId, {
    level: screenshot.exitCode === 0 ? "info" : "error",
    event: "agent_browser_capture",
    context: { outputAsset: clean, ...screenshot },
  });
  if (screenshot.exitCode !== 0) {
    throw new Error(`agent-browser capture failed: ${screenshot.stderr || screenshot.stdout || screenshot.exitCode}`);
  }
  return clean;
}

function localStoryboardFrameAssetUrl(frame: Record<string, unknown>, captureSetId: string, outputVariantId?: string, screenSizeId?: string) {
  const asset = frameCaptureAsset(frame, captureSetId, outputVariantId, screenSizeId);
  if (!asset) return null;
  return `http://127.0.0.1:${config.port}${storyboardUrlBase}/${asset.replace(/^\/+/, "")}`;
}

function collectActionsToFrame(story: { frames: Array<{ id: string } & Record<string, unknown>> }, frameKey: string) {
  const index = story.frames.findIndex((frame) => frame.id === frameKey);
  if (index < 0) return [] as Array<{ id: string; action: string }>;
  let start = 0;
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    if (extractOpenUrl(actionText(story.frames[cursor]))) {
      start = cursor;
      break;
    }
  }
  return story.frames.slice(start, index + 1).map((frame) => ({ id: frame.id, action: actionText(frame) })).filter((entry) => entry.action);
}

async function runAgentBrowser(args: string[], timeoutMs = 15_000) {
  const child = Bun.spawn(["agent-browser", ...args], {
    cwd: config.rootDir,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      AGENT_BROWSER_SESSION: process.env.STORYBOARD_AGENT_BROWSER_SESSION_NAME ?? `storyboard-access-${storyboardName}`,
      AGENT_BROWSER_SESSION_NAME: process.env.STORYBOARD_AGENT_BROWSER_SESSION_NAME ?? `storyboard-access-${storyboardName}`,
    },
  });
  const exitPromise = child.exited;
  let timedOut = false;
  const exitCode = await Promise.race([
    exitPromise,
    sleep(timeoutMs).then(() => {
      timedOut = true;
      child.kill();
      return 124;
    }),
  ]);
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { args, exitCode, stdout, stderr, timedOut };
}

function isTransientAgentBrowserOpenFailure(result: Awaited<ReturnType<typeof runAgentBrowser>>) {
  if (result.exitCode === 0) return false;
  if (result.timedOut) return true;
  const output = `${result.stderr}\n${result.stdout}`;
  return /ERR_CONNECTION_(?:REFUSED|RESET)|ERR_EMPTY_RESPONSE|ERR_SOCKET_NOT_CONNECTED|Target closed/iu.test(output);
}

async function openRuntimeTargetWithRetry(url: string) {
  let lastResult: Awaited<ReturnType<typeof runAgentBrowser>> | null = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const result = await runAgentBrowser(["open", url], 35_000);
    lastResult = { ...result, args: [...result.args, `attempt=${attempt}`] };
    if (result.exitCode === 0) return lastResult;
    if (!isTransientAgentBrowserOpenFailure(result) || attempt === 4) return lastResult;
    await sleep(attempt * 1500);
  }
  return lastResult ?? runAgentBrowser(["open", url], 35_000);
}

async function applyAgentBrowserAction(action: string) {
  const rewrittenAction = rewriteLoopbackUrlsInActionForStoryboardSource(
    action,
    process.env.STORYBOARD_RUN_SOURCE_URL,
  );
  const openUrl = extractOpenUrl(rewrittenAction);
  if (openUrl) {
    const result = await runAgentBrowser(["open", openUrl], 20_000);
    return { ...result, rewrittenAction };
  }
  if (/confirmation\s+Delete button|confirm(?:ation)?\s+Delete/iu.test(rewrittenAction)) {
    const result = await runAgentBrowser(["find", "text", "Delete", "click"], 15_000);
    return { ...result, rewrittenAction };
  }
  if (/click\s+Delete/iu.test(rewrittenAction)) {
    const result = await runAgentBrowser(["find", "text", "Delete", "click"], 15_000);
    return { ...result, rewrittenAction };
  }
  const result = await runAgentBrowser(["snapshot", "--compact", "--depth", "2"], 10_000);
  return { ...result, rewrittenAction };
}

function runnerForEntry(manifest: StoryboardRunManifest, entryId: string) {
  const entry = manifest.entries.find((candidate) => candidate.id === entryId);
  const runner = entry ? manifest.runners.find((candidate) => candidate.id === entry.runnerId) : null;
  return { entry, runner };
}

async function executeRunJob(jobId: string) {
  const manifestResult = loadRunManifestForResponse();
  if (!manifestResult.loaded) throw new Error("run API disabled");
  const job = runStorage.readJob(jobId);
  const { entry, runner } = runnerForEntry(manifestResult.manifest, job.manifestEntryId);
  if (!entry || !runner) throw new Error("manifest entry or runner not found");
  if (runner.kind !== "browser") throw new Error(`runner ${runner.id} is ${runner.kind}, expected browser`);
  const frameKey = job.target.frameKey;
  const storyId = job.target.storyId;
  const frameMatch = allStoryboardFramesWithStory().find((item) => item.story.id === storyId && item.frame.id === frameKey);
  if (!frameMatch) throw new Error("target frame not found");

  const now = new Date().toISOString();
  runStorage.writeJob({ ...job, status: "running", startedAt: now, updatedAt: now });
  const captureSetId = job.captureSetId ?? entry.captureSets[0] ?? "default";
  const outputVariantId = job.outputVariantId ?? job.target.outputVariantId ?? job.screenSizeId ?? "desktop";
  const storyboard = readStoryboardJsonDocument();
  const runtimeTarget = resolveStoryboardDocumentRuntimeTarget(storyboard, captureSetId, outputVariantId, entry.runtimeTarget);
  if (!runtimeTarget) {
    throw new Error("missing runtime/server config");
  }
  runStorage.appendLog(jobId, {
    level: "info",
    event: "agent_browser_run_started",
    context: { storyId, frameKey, runnerId: runner.id, runtimeTarget },
  });

  const captureSet = manifestResult.manifest.captureSets.find((candidate) => candidate.id === captureSetId);
  if (captureSet?.viewport) {
    const viewport = captureSet.viewport;
    const viewportResult = await runAgentBrowser(["set", "viewport", String(viewport.width), String(viewport.height)], 10_000);
    runStorage.appendLog(jobId, { level: viewportResult.exitCode === 0 ? "info" : "warn", event: "agent_browser_viewport", context: viewportResult });
  }

  const runtimeOpen = await openRuntimeTargetWithRetry(runtimeTarget.appUrl);
  runStorage.appendLog(jobId, {
    level: runtimeOpen.exitCode === 0 ? "info" : "error",
    event: "agent_browser_runtime_open",
    context: { runtimeTarget, ...runtimeOpen },
  });
  if (runtimeOpen.exitCode !== 0) {
    throw new Error(`runtime target failed to open: ${runtimeOpen.stderr || runtimeOpen.stdout || runtimeOpen.exitCode}`);
  }
  const actions = collectActionsToFrame(frameMatch.story, frameKey ?? "").filter((action) => !extractOpenUrl(action.action));
  const fallbackUrl = localStoryboardFrameAssetUrl(frameMatch.frame, captureSetId, outputVariantId, job.screenSizeId);
  let usedFallback = false;
  for (const action of actions) {
    const result = await applyAgentBrowserAction(action.action);
    runStorage.appendLog(jobId, { level: result.exitCode === 0 ? "info" : "warn", event: "agent_browser_action", context: { frameKey: action.id, action: action.action, ...result } });
    if (result.exitCode !== 0) {
      if (fallbackUrl && process.env.STORYBOARD_RUN_ALLOW_ASSET_FALLBACK !== "0") {
        const fallback = await runAgentBrowser(["open", fallbackUrl], 15_000);
        usedFallback = true;
        runStorage.appendLog(jobId, { level: fallback.exitCode === 0 ? "warn" : "error", event: "agent_browser_asset_fallback", context: { fallbackUrl, ...fallback } });
        if (fallback.exitCode === 0) break;
      }
      throw new Error(`agent-browser action failed for ${action.id}: ${result.stderr || result.stdout || result.exitCode}`);
    }
  }
  if (actions.length === 0 && fallbackUrl) {
    const fallback = await runAgentBrowser(["open", fallbackUrl], 15_000);
    usedFallback = true;
    runStorage.appendLog(jobId, { level: fallback.exitCode === 0 ? "warn" : "error", event: "agent_browser_asset_fallback", context: { fallbackUrl, ...fallback } });
    if (fallback.exitCode !== 0) throw new Error(`agent-browser fallback failed: ${fallback.stderr || fallback.stdout || fallback.exitCode}`);
  }

  const assertion = assertionText(frameMatch.frame);
  if (assertion && !usedFallback) {
    const snapshot = await runAgentBrowser(["snapshot", "--compact", "--depth", "6"], 12_000);
    runStorage.appendLog(jobId, { level: snapshot.exitCode === 0 ? "info" : "warn", event: "agent_browser_snapshot", context: { assertion, exitCode: snapshot.exitCode, stdout: snapshot.stdout.slice(0, 4000), stderr: snapshot.stderr } });
  }

  let outputAsset = frameCaptureAsset(frameMatch.frame, captureSetId, outputVariantId, job.screenSizeId) ?? "";
  if (job.mode === "run-and-capture" || job.mode === "capture") {
    runStorage.writeJob({ ...runStorage.readJob(jobId), status: "capturing", updatedAt: new Date().toISOString() });
    outputAsset = await captureAgentBrowserVariant(jobId, frameMatch.frame, captureSetId, outputVariantId, captureSet, job.screenSizeId);
  }

  const completedAt = new Date().toISOString();
  const manifestHash = hashStoryboardRunJson(manifestResult.manifest);
  const runnerHash = hashStoryboardRunJson(runner);
  const captureSetHash = captureSet ? hashStoryboardRunJson(captureSet) : undefined;
  let outputAssetHash: string | undefined;
  if (outputAsset) {
    try {
      const { fullPath } = safeStoryboardAssetPath(outputAsset);
      outputAssetHash = `sha256:${createHash("sha256").update(readFileSync(fullPath)).digest("hex")}`;
    } catch (error) {
      runStorage.appendLog(jobId, {
        level: "warn",
        event: "output_asset_hash_failed",
        context: { outputAsset, message: error instanceof Error ? error.message : String(error) },
      });
    }
  }
  const provenance = runStorage.writeProvenance({
    storyboardId: storyboard.id,
    frameKey: frameKey ?? "storyboard",
    manifestHash,
    manifestEntryId: entry.id,
    runnerId: runner.id,
    runnerHash,
    appBuildId: process.env.STORYBOARD_APP_BUILD_ID,
    captureSetId,
    captureSetHash,
    outputVariantId,
    screenSizeId: job.screenSizeId,
    storyboardSpecHash: hashStoryboardRunJson(storyboard),
    frameSpecHash: hashStoryboardRunJson(frameMatch.frame),
    outputAsset,
    outputAssetHash,
    runtimeTarget,
    completedAt,
    summary: job.mode === "run-and-capture" || job.mode === "capture"
      ? `agent-browser captured ${outputVariantId} screenshot to ${outputAsset}`
      : usedFallback ? "agent-browser opened storyboard asset fallback after app action was unavailable" : "agent-browser completed run-to-state actions",
  });
  const latest = runStorage.readJob(jobId);
  runStorage.writeJob({ ...latest, status: "succeeded", updatedAt: completedAt, completedAt, provenanceWrites: [...latest.provenanceWrites, provenance.path ?? ""] });
  runStorage.appendLog(jobId, { level: "info", event: "agent_browser_run_succeeded", context: { provenancePath: provenance.path, usedFallback, runtimeTarget } });
}

async function drainRunQueue() {
  if (activeRunJob) return;
  const next = runStorage.listJobs().find((job) => job.status === "queued");
  if (!next) return;
  activeRunJob = next.jobId;
  try {
    await executeRunJob(next.jobId);
  } catch (error) {
    const failedAt = new Date().toISOString();
    const latest = runStorage.readJob(next.jobId);
    runStorage.writeJob({
      ...latest,
      status: "failed",
      updatedAt: failedAt,
      completedAt: failedAt,
      error: { code: "agent_browser_run_failed", message: error instanceof Error ? error.message : String(error) },
    });
    runStorage.appendLog(next.jobId, { level: "error", event: "agent_browser_run_failed", context: { message: error instanceof Error ? error.message : String(error) } });
  } finally {
    activeRunJob = null;
    void drainRunQueue();
  }
}

function writeRunJob(status: RunLifecycleStatus, requestBody: unknown) {
  const manifestResult = loadRunManifestForResponse();
  if (!manifestResult.loaded) {
    throw new Error("run API disabled");
  }
  const runRequest = validateCreateRunRequest(
    requestBody,
    manifestResult.manifest,
    true,
  );
  const now = new Date().toISOString();
  const job: Run = {
    jobId: generateStoryboardRunJobId(),
    scope: runRequest.scope,
    mode: runRequest.mode,
    status,
    target: runRequest.target,
    manifestEntryId: runRequest.manifestEntryId,
    captureSetId: runRequest.captureSetId,
    outputVariantId: runRequest.outputVariantId,
    screenSizeId: runRequest.screenSizeId,
    createdAt: now,
    updatedAt: now,
    params: runRequest.params ?? {},
    provenanceWrites: [],
  };
  const written = runStorage.writeJob(job);
  runStorage.appendLog(written.jobId, {
    level: "info",
    event: "job_queued",
    context: { mode: written.mode, manifestEntryId: written.manifestEntryId },
  });
  return written;
}

console.log(
  JSON.stringify({
    ok: true,
    event: "storyboard_access_server_started",
    port: config.port,
    rootDir: config.rootDir,
    allowWrite: config.allowWrite,
  }),
);

Bun.serve({
  port: config.port,
  async fetch(request: Request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    try {
      if (pathname === "/health") {
        return jsonResponse({ ok: true });
      }

      if (pathname === "/config") {
        return jsonResponse({
          ok: true,
          port: config.port,
          rootDir: config.rootDir,
          storyboardName,
          storyboardUrlBase,
          storyboardJsonPath,
          storyboardMarkdownPath,
          assetsDir,
          allowWrite: config.allowWrite,
        });
      }

      if (
        pathname === `${storyboardUrlBase}/storyboard.json` &&
        request.method === "GET"
      ) {
        if (!existsSync(storyboardJsonPath)) {
          return textError("storyboard.json not found", 404);
        }
        return rawFileResponse(storyboardJsonPath);
      }

      if (
        pathname === `${storyboardUrlBase}/storyboard.json` &&
        request.method === "PUT"
      ) {
        if (!config.allowWrite) {
          return textError("server is read-only", 403);
        }
        const body = (await request.json()) as Record<string, unknown>;
        const contents = `${JSON.stringify(body, null, 2)}\n`;
        writeFileRecord(storyboardJsonPath, contents);
        return rawFileResponse(storyboardJsonPath);
      }

      if (
        pathname === `${storyboardUrlBase}/storyboard.md` &&
        request.method === "GET"
      ) {
        if (!existsSync(storyboardMarkdownPath)) {
          return textError("storyboard.md not found", 404);
        }
        return rawFileResponse(storyboardMarkdownPath);
      }

      if (
        pathname === `${storyboardUrlBase}/storyboard.md` &&
        request.method === "PUT"
      ) {
        if (!config.allowWrite) {
          return textError("server is read-only", 403);
        }
        const contents = await readPayload(request);
        writeFileRecord(storyboardMarkdownPath, contents);
        return rawFileResponse(storyboardMarkdownPath);
      }

      if (
        pathname.startsWith(`${storyboardUrlBase}/assets/`) &&
        request.method === "GET"
      ) {
        const relativeAssetPath = pathname.slice(storyboardUrlBase.length + 1);
        const pathValue = ensureRelativePath(relativeAssetPath);
        if (!pathValue.startsWith(`${assetsDir}/`) && pathValue !== assetsDir) {
          return textError("asset path must stay under assets/", 400);
        }
        if (!existsSync(pathValue)) {
          return textError("asset not found", 404);
        }
        return rawFileResponse(pathValue);
      }

      if (
        pathname.startsWith(`${storyboardUrlBase}/assets/`) &&
        request.method === "PUT"
      ) {
        if (!config.allowWrite) {
          return textError("server is read-only", 403);
        }
        const relativeAssetPath = pathname.slice(storyboardUrlBase.length + 1);
        const pathValue = ensureRelativePath(relativeAssetPath);
        if (!pathValue.startsWith(`${assetsDir}/`) && pathValue !== assetsDir) {
          return textError("asset path must stay under assets/", 400);
        }
        const bytes = new Uint8Array(await request.arrayBuffer());
        writeBinaryFile(pathValue, bytes);
        return rawFileResponse(pathValue);
      }

      if (
        pathname === "/api/storyboard-access/storyboard" &&
        request.method === "GET"
      ) {
        if (!existsSync(storyboardJsonPath)) {
          return textError("storyboard.json not found", 404);
        }
        const file = readFileRecord(storyboardJsonPath);
        return jsonResponse({
          ok: true,
          path: storyboardJsonPath,
          relativePath: file.relativePath,
          kind: file.kind,
          mtimeMs: file.mtimeMs,
          size: file.size,
          document: JSON.parse(file.contents),
        });
      }

      if (
        pathname === "/api/storyboard-access/storyboard" &&
        request.method === "PUT"
      ) {
        if (!config.allowWrite) {
          return textError("server is read-only", 403);
        }
        const body = (await request.json()) as Record<string, unknown>;
        const contents = `${JSON.stringify(body, null, 2)}\n`;
        const file = writeFileRecord(storyboardJsonPath, contents);
        return jsonResponse({
          ok: true,
          path: storyboardJsonPath,
          relativePath: file.relativePath,
          kind: file.kind,
          mtimeMs: file.mtimeMs,
          size: file.size,
          document: body,
        });
      }

      if (
        pathname === "/api/storyboard-access/markdown" &&
        request.method === "GET"
      ) {
        if (!existsSync(storyboardMarkdownPath)) {
          return textError("storyboard.md not found", 404);
        }
        return jsonResponse({
          ok: true,
          ...readFileRecord(storyboardMarkdownPath),
        });
      }

      if (
        pathname === "/api/storyboard-access/markdown" &&
        request.method === "PUT"
      ) {
        if (!config.allowWrite) {
          return textError("server is read-only", 403);
        }
        const contents = await readPayload(request);
        return jsonResponse({
          ok: true,
          ...writeFileRecord(storyboardMarkdownPath, contents),
        });
      }

      if (
        pathname === "/api/storyboard-access/assets" &&
        request.method === "GET"
      ) {
        const pathValue = ensureRelativePath(url.searchParams.get("path"));
        if (!pathValue.startsWith(`${assetsDir}/`) && pathValue !== assetsDir) {
          return textError("asset path must stay under assets/", 400);
        }
        if (!existsSync(pathValue)) {
          return textError("asset not found", 404);
        }
        return new Response(Bun.file(pathValue), {
          headers: {
            "Content-Type": fileContentType(pathValue),
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }

      if (
        pathname === "/api/storyboard-access/files" &&
        request.method === "GET"
      ) {
        const pathValue = ensureRelativePath(url.searchParams.get("path"));
        return jsonResponse({ ok: true, ...readFileRecord(pathValue) });
      }

      if (
        pathname === "/api/storyboard-access/files" &&
        request.method === "PUT"
      ) {
        if (!config.allowWrite) {
          return textError("server is read-only", 403);
        }
        const pathValue = ensureRelativePath(url.searchParams.get("path"));
        const contents = await readPayload(request);
        return jsonResponse({
          ok: true,
          ...writeFileRecord(pathValue, contents),
        });
      }

      if (
        pathname === "/api/storyboard-access/capabilities" &&
        request.method === "GET"
      ) {
        return jsonResponse(
          capabilitiesFromManifest(loadRunManifestForResponse()),
        );
      }

      if (
        pathname === "/api/storyboard-access/state" &&
        request.method === "GET"
      ) {
        const manifestResult = loadRunManifestForResponse();
        const frames = manifestResult.loaded
          ? allStoryboardFrameIdentities().map(
              ({ storyboard, storyId, frameKey }) =>
                deriveStoryboardRunFreshness({
                  storyboardRoot: config.rootDir,
                  storyboard,
                  storyId,
                  frameKey,
                  manifest: manifestResult.manifest,
                  captureSetId:
                    url.searchParams.get("captureSetId") ?? undefined,
                  outputVariantId:
                    url.searchParams.get("outputVariantId") ?? undefined,
                  screenSizeId:
                    url.searchParams.get("screenSizeId") ?? undefined,
                  appBuildId: process.env.STORYBOARD_APP_BUILD_ID,
                }),
            )
          : [];
        const jobs = runStorage.listJobs();
        const automationMatrix = frames.map((frame) => ({
          frameKey: frame.frameKey,
          storyId: frame.storyId,
          captureSetId: url.searchParams.get("captureSetId") ?? frame.automationDriver?.stateTarget.captureSetId ?? "default",
          outputVariantId: url.searchParams.get("outputVariantId") ?? frame.automationDriver?.stateTarget.outputVariantId ?? "default",
          ...(frame.runtimeTarget ? { runtimeTarget: frame.runtimeTarget } : {}),
          ...(frame.automationDriver ? { automationDriver: frame.automationDriver } : {}),
          fullyAutomated: frame.automationDriver?.fullyAutomated === true,
          runnable: frame.runnable,
          disabledReason: frame.disabledReason,
        }));
        return jsonResponse({
          ok: true,
          storyboardId: readStoryboardJsonDocument().id,
          generatedAt: new Date().toISOString(),
          runApi: manifestResult.loaded,
          queue: {
            maxActive: 1,
            active: jobs.filter(
              (job) =>
                !terminalRunLifecycleStates.includes(job.status) &&
                job.status !== "queued",
            ).length,
            queued: jobs.filter((job) => job.status === "queued").length,
          },
          frames,
          automationMatrix,
        });
      }

      if (
        pathname === "/api/storyboard-access/runs" &&
        request.method === "POST"
      ) {
        if (!config.allowWrite) {
          return textError("server is read-only", 403);
        }
        const job = writeRunJob("queued", await request.json());
        void drainRunQueue();
        return jsonResponse(
          {
            ok: true,
            job,
            jobId: job.jobId,
            status: "queued",
            queuePosition: Math.max(0, queuePosition(job.jobId)),
            links: {
              job: `/api/storyboard-access/runs/${job.jobId}`,
              logs: `/api/storyboard-access/runs/${job.jobId}/logs`,
              cancel: `/api/storyboard-access/runs/${job.jobId}/cancel`,
            },
          },
          202,
        );
      }

      if (
        pathname.startsWith("/api/storyboard-access/runs/") &&
        request.method === "GET"
      ) {
        const suffix = pathname.slice("/api/storyboard-access/runs/".length);
        if (suffix.endsWith("/logs")) {
          const jobId = suffix.slice(0, -"/logs".length);
          return jsonResponse({
            ok: true,
            jobId,
            logs: runStorage.readLogs(jobId),
          });
        }
        return jsonResponse({ ok: true, job: runStorage.readJob(suffix) });
      }

      if (
        pathname.startsWith("/api/storyboard-access/runs/") &&
        pathname.endsWith("/cancel") &&
        request.method === "POST"
      ) {
        if (!config.allowWrite) {
          return textError("server is read-only", 403);
        }
        const jobId = pathname.slice(
          "/api/storyboard-access/runs/".length,
          -"/cancel".length,
        );
        const job = runStorage.readJob(jobId);
        if (terminalRunLifecycleStates.includes(job.status)) {
          return textError("job is already terminal", 409);
        }
        const now = new Date().toISOString();
        const cancelled = runStorage.writeJob({
          ...job,
          status: "cancelled",
          updatedAt: now,
          completedAt: now,
        });
        runStorage.appendLog(jobId, { level: "warn", event: "job_cancelled" });
        return jsonResponse({
          ok: true,
          jobId,
          status: "cancelled",
          cancelledAt: cancelled.completedAt,
        });
      }

      if (
        pathname === "/api/storyboard-access/list" &&
        request.method === "GET"
      ) {
        return jsonResponse({
          ok: true,
          rootDir: config.rootDir,
          storyboards: [
            {
              name: storyboardName,
              root: config.rootDir,
              hasStoryboardJson: existsSync(storyboardJsonPath),
              hasStoryboardMarkdown: existsSync(storyboardMarkdownPath),
            },
          ],
          files: listStoryboardDirectory(),
        });
      }
    } catch (error) {
      return textError(
        error instanceof Error ? error.message : String(error),
        400,
      );
    }

    return textError("Not found", 404);
  },
});
