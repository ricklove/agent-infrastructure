#!/usr/bin/env bun

import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = process.argv.includes("--source")
  ? process.argv[process.argv.indexOf("--source") + 1]
  : "http://10.0.0.239:8898/bcn-814-group-delete-real-app";
const port = Number.parseInt(process.env.STORYBOARD_SMOKE_ACCESS_PORT ?? "8897", 10);
const startedAt = Date.now();
const result: Record<string, unknown> = {
  ok: false,
  source,
  port,
  cwd: process.cwd(),
  blocker: null,
};

function finish(ok: boolean, extra: Record<string, unknown> = {}) {
  Object.assign(result, extra, { ok, elapsed_ms: Date.now() - startedAt });
  console.log(JSON.stringify(result, null, 2));
  process.exit(ok ? 0 : 1);
}

async function fetchJson(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status} ${await response.text()}`);
  return await response.json();
}

async function fetchText(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status} ${await response.text()}`);
  return await response.text();
}

function allFrames(storyboard: any) {
  return (storyboard.stories ?? []).flatMap((story: any) => [
    ...(story.frames ?? []).map((frame: any) => ({ story, frame })),
    ...(story.branches ?? []).flatMap((branch: any) => (branch.frames ?? []).map((frame: any) => ({ story, frame }))),
  ]);
}

function assetFor(frame: any) {
  const screenshots = frame.captureSets?.default?.screenshots ?? frame.screenshots ?? {};
  return screenshots.desktop ?? screenshots.mobile ?? screenshots.square ?? Object.values(screenshots)[0];
}

async function waitJob(baseUrl: string, jobId: string) {
  let last: any = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const payload: any = await fetchJson(`${baseUrl}/api/storyboard-access/runs/${jobId}`);
    last = payload.job;
    if (["succeeded", "failed", "skipped", "cancelled", "expired", "recovered"].includes(last.status)) return last;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return last;
}

try {
  const storyboard: any = await fetchJson(`${source.replace(/\/$/, "")}/storyboard.json`);
  const markdown = await fetchText(`${source.replace(/\/$/, "")}/storyboard.md`).catch(() => "# Storyboard\n");
  const frames = allFrames(storyboard);
  result.storyboardId = storyboard.id;
  result.storyCount = storyboard.stories?.length ?? 0;
  result.frameCount = frames.length;
  if (frames.length < 2) finish(false, { blocker: "source_has_fewer_than_two_frames" });

  const root = mkdtempSync(join(tmpdir(), "storyboard-agent-browser-run-"));
  mkdirSync(join(root, "assets"), { recursive: true });
  writeFileSync(join(root, "storyboard.json"), `${JSON.stringify(storyboard, null, 2)}\n`);
  writeFileSync(join(root, "storyboard.md"), markdown);
  const preferredFrameIds = [
    "story-a-empty-subgroup-confirm-delete",
    "story-c-manager-empty-subgroup-confirm-delete",
    "story-b-non-empty-subgroup-blocked-error-remains",
  ];
  const targetFrames = preferredFrameIds
    .map((frameId) => frames.find(({ frame }: any) => frame.id === frameId))
    .filter(Boolean);
  const smokeFrames = targetFrames.length >= 2 ? targetFrames : frames.slice(0, 2);

  const framesToMirror = new Map<string, any>();
  for (const item of [...frames.slice(0, 4), ...smokeFrames]) {
    if (item?.frame?.id) framesToMirror.set(item.frame.id, item.frame);
  }
  for (const frame of framesToMirror.values()) {
    const asset = assetFor(frame);
    if (!asset || typeof asset !== "string") continue;
    const response = await fetch(`${source.replace(/\/$/, "")}/${asset.replace(/^\/+/, "")}`);
    if (!response.ok) continue;
    const out = join(root, asset);
    mkdirSync(out.split("/").slice(0, -1).join("/"), { recursive: true });
    writeFileSync(out, new Uint8Array(await response.arrayBuffer()));
  }

  const manifest = {
    version: 1,
    enabled: true,
    runners: [{ id: "agent-browser", label: "agent-browser", kind: "browser", enabled: true, capabilities: ["run-to-state", "capture", "run-and-capture"] }],
    captureSets: [{ id: "default", label: "Default", viewport: { width: 1440, height: 900, deviceScaleFactor: 1 }, outputPathTemplate: "assets/{frameKey}.{outputVariantId}.png", imageFormat: "png", comparisonPolicy: "manual" }],
    entries: [{ id: "agent-browser-run-to-state", label: "agent-browser run/capture", scope: "frame", runnerId: "agent-browser", modes: ["run-to-state", "capture", "run-and-capture"], targets: [{ storyboardId: storyboard.id, storyPattern: "*", framePattern: "*" }], paramsSchema: {}, captureSets: ["default"], enabled: true }],
  };
  writeFileSync(join(root, "storyboard.run.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const server = Bun.spawn(["bun", "scripts/storyboard-access-server.ts", "--root", root, "--port", String(port)], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      STORYBOARD_RUN_ALLOW_ASSET_FALLBACK: "1",
      STORYBOARD_RUN_SOURCE_URL: source,
      STORYBOARD_AGENT_BROWSER_SESSION_NAME: `storyboard-smoke-${Date.now()}`,
    },
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try { await fetchJson(`${baseUrl}/health`); break; } catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }

  const capabilities: any = await fetchJson(`${baseUrl}/api/storyboard-access/capabilities`);
  const jobs = [] as any[];
  for (const { story, frame } of smokeFrames) {
    const response = await fetch(`${baseUrl}/api/storyboard-access/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: "frame",
        mode: "run-and-capture",
        target: { storyboardId: storyboard.id, storyId: story.id, frameKey: frame.id, outputVariantId: "desktop" },
        manifestEntryId: "agent-browser-run-to-state",
        captureSetId: "default",
        outputVariantId: "desktop",
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    const payload: any = await response.json();
    const terminal = await waitJob(baseUrl, payload.jobId);
    const logs: any = await fetchJson(`${baseUrl}/api/storyboard-access/runs/${payload.jobId}/logs`);
    const captureLog = logs.logs?.find((entry: any) => entry.event === "agent_browser_capture");
    const snapshotLog = logs.logs?.find((entry: any) => entry.event === "agent_browser_snapshot");
    const actionLogs = logs.logs?.filter((entry: any) => entry.event === "agent_browser_action") ?? [];
    const captureAsset = captureLog?.context?.outputAsset ? join(root, captureLog.context.outputAsset) : null;
    const captureStats = captureAsset && existsSync(captureAsset) ? statSync(captureAsset) : null;
    const snapshotText = String(snapshotLog?.context?.stdout ?? "");
    const expectedConfirmPromptVisible = /confirm-delete/iu.test(frame.id)
      ? /Are you sure you want to delete this group\?/iu.test(snapshotText)
      : undefined;
    jobs.push({
      jobId: payload.jobId,
      frameKey: frame.id,
      storyId: story.id,
      status: terminal.status,
      expectedConfirmPromptVisible,
      rewrittenActions: actionLogs.map((entry: any) => entry.context?.rewrittenAction).filter(Boolean),
      provenanceWrites: terminal.provenanceWrites,
      logs: logs.logs?.map((entry: any) => entry.event),
      capturedAsset: captureStats ? { path: captureAsset, bytes: captureStats.size, mtimeMs: captureStats.mtimeMs } : null,
    });
  }
  const state: any = await fetchJson(`${baseUrl}/api/storyboard-access/state?captureSetId=default&outputVariantId=desktop`);
  server.kill();
  const parityChecks = jobs.filter((job) => /confirm-delete/iu.test(job.frameKey));
  const sourceHost = new URL(source).hostname;
  const ok = jobs.every((job) => job.status === "succeeded")
    && parityChecks.length >= 2
    && parityChecks.every((job) => job.expectedConfirmPromptVisible === true)
    && jobs.some((job) => String(job.rewrittenActions?.join("\n") ?? "").includes(`http://${sourceHost}:19041/`));
  finish(ok, {
    sourceReachable: true,
    routeCount: storyboard.stories?.length ?? 0,
    frameCount: frames.length,
    runCapabilities: capabilities,
    runJobs: jobs,
    terminalStatuses: jobs.map((job) => job.status),
    stateFrameCount: state.frames?.length ?? 0,
    logsRoot: join(root, ".storyboard-runs", "logs"),
    provenanceRoot: join(root, ".storyboard-runs", "provenance"),
    uiRoute: "/storyboard/debug/storyboardEditor/remote-storyboard/",
  });
} catch (error) {
  finish(false, { blocker: "smoke_failed", error: error instanceof Error ? error.message : String(error) });
}
