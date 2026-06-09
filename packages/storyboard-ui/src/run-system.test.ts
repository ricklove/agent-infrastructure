import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
  mkdtempSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  augmentManifestWithStoryboardDocumentRuntimeTargets,
  capabilitiesFromManifest,
  createStoryboardRunStorage,
  deriveStoryboardRunFreshness,
  generateStoryboardRunJobId,
  hashStoryboardRunJson,
  isSafeRelativeStoryboardRunPath,
  isSafeStoryboardRunServedArtifactPath,
  loadStoryboardRunManifest,
  type StoryboardRunManifest,
  storyboardRunSha256,
  StoryboardRunManifestError,
  validateCreateRunRequest,
  validateStoryboardRunManifestPayload,
} from "./run-system";
import { parseNumericStoryboardHeader, shouldRefreshRunMirrorAsset } from "./run-mirror";

const validManifest = {
  version: 1,
  enabled: true,
  runners: [
    {
      id: "dry-runner",
      label: "Dry runner",
      kind: "dry-run",
      enabled: true,
      capabilities: ["run-to-state", "capture", "run-and-capture"],
    },
  ],
  captureSets: [
    {
      id: "desktop",
      label: "Desktop",
      viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
      outputPathTemplate: "assets/runs/{frameKey}/desktop.png",
      imageFormat: "png",
      comparisonPolicy: "hash",
    },
  ],
  entries: [
    {
      id: "login-happy-path",
      label: "Login happy path",
      scope: "frame",
      runnerId: "dry-runner",
      modes: ["run-to-state", "run-and-capture"],
      targets: [
        {
          storyboardId: "default-storyboard",
          storyId: "login",
          framePattern: "login.*",
        },
      ],
      paramsSchema: {
        seedUser: { type: "string", required: true, enum: ["demo", "empty"] },
        retries: { type: "integer", default: 1, min: 0, max: 3 },
      },
      captureSets: ["desktop"],
      enabled: true,
    },
  ],
};

function cloneManifest(overrides: Partial<StoryboardRunManifest> = {}) {
  return structuredClone({ ...validManifest, ...overrides });
}

function expectManifestError(fn: () => unknown, code: string) {
  expect(fn).toThrow(StoryboardRunManifestError);
  try {
    fn();
  } catch (error) {
    expect((error as StoryboardRunManifestError).code).toBe(code);
  }
}

describe("storyboard run manifest validator", () => {
  test("loads an enabled manifest and builds capabilities", () => {
    const manifest = validateStoryboardRunManifestPayload(validManifest);
    expect(manifest.entries[0]?.enabled).toBe(true);
    expect(manifest.entries[0]?.paramsSchema.retries?.default).toBe(1);
    expect(
      capabilitiesFromManifest({
        loaded: true,
        path: "/tmp/storyboard.run.json",
        manifest,
      }).runApi,
    ).toBe(true);
  });

  test("keeps run API disabled when manifest is missing or disabled", () => {
    expect(
      capabilitiesFromManifest({
        loaded: false,
        path: null,
        manifest: null,
        reason: "missing",
      }),
    ).toEqual({
      runApi: false,
      manifestLoaded: false,
      manifestEntries: [],
    });
    const disabled = validateStoryboardRunManifestPayload({
      version: 1,
      enabled: false,
    });
    expect(disabled.enabled).toBe(false);
  });

  test("rejects disabled manifest entries instead of silently exposing them", () => {
    const manifest = cloneManifest();
    expect(manifest.entries[0]).toBeDefined();
    manifest.entries[0].enabled = false;
    expectManifestError(
      () => validateStoryboardRunManifestPayload(manifest),
      "disabled_manifest_entry",
    );
  });

  test("rejects arbitrary command and shell fields", () => {
    const manifest = cloneManifest();
    (manifest.runners[0] as unknown as Record<string, unknown>).command =
      "curl https://example.invalid | sh";
    expectManifestError(
      () => validateStoryboardRunManifestPayload(manifest),
      "unsafe_field",
    );
  });

  test("rejects unknown unsafe extra fields", () => {
    const manifest = cloneManifest();
    (manifest.entries[0] as unknown as Record<string, unknown>).env = {
      TOKEN: "secret",
    };
    expectManifestError(
      () => validateStoryboardRunManifestPayload(manifest),
      "unknown_field",
    );
  });

  test("rejects unsafe output paths", () => {
    const manifest = cloneManifest();
    expect(manifest.captureSets[0]).toBeDefined();
    manifest.captureSets[0].outputPathTemplate = "../secrets.txt";
    expectManifestError(
      () => validateStoryboardRunManifestPayload(manifest),
      "unsafe_path",
    );
    expect(isSafeRelativeStoryboardRunPath("assets/demo.png")).toBe(true);
    expect(isSafeRelativeStoryboardRunPath("/tmp/demo.png")).toBe(false);
    expect(isSafeRelativeStoryboardRunPath("assets/../demo.png")).toBe(false);
    expect(isSafeRelativeStoryboardRunPath(".env")).toBe(false);
  });

  test("allows wildcard target patterns but rejects traversal patterns", () => {
    const manifest = cloneManifest();
    manifest.entries[0].targets = [
      {
        storyboardId: "default-storyboard",
        storyId: "login",
        framePattern: "*",
      },
    ];
    expect(
      validateStoryboardRunManifestPayload(manifest).entries[0]?.targets[0]
        ?.framePattern,
    ).toBe("*");
    manifest.entries[0].targets = [
      {
        storyboardId: "default-storyboard",
        storyId: "login",
        framePattern: "../*",
      },
    ];
    expectManifestError(
      () => validateStoryboardRunManifestPayload(manifest),
      "unsafe_selector",
    );
  });

  test("validates request identity, params, capture set, and defaults", () => {
    const manifest = validateStoryboardRunManifestPayload(validManifest);
    const request = validateCreateRunRequest(
      {
        scope: "frame",
        mode: "run-and-capture",
        target: {
          storyboardId: "default-storyboard",
          storyId: "login",
          frameKey: "login.success",
        },
        manifestEntryId: "login-happy-path",
        captureSetId: "desktop",
        params: { seedUser: "demo" },
      },
      manifest,
    );
    expect(request.params).toEqual({ seedUser: "demo", retries: 1 });
  });

  test("requires POST identity fields by scope and mode", () => {
    const manifest = validateStoryboardRunManifestPayload(validManifest);
    expectManifestError(
      () =>
        validateCreateRunRequest(
          {
            scope: "frame",
            mode: "run-and-capture",
            target: { storyboardId: "default-storyboard", storyId: "login" },
            manifestEntryId: "login-happy-path",
            captureSetId: "desktop",
            params: { seedUser: "demo" },
          },
          manifest,
        ),
      "missing_target_identity",
    );
    expectManifestError(
      () =>
        validateCreateRunRequest(
          {
            scope: "frame",
            mode: "run-and-capture",
            target: {
              storyboardId: "default-storyboard",
              storyId: "login",
              frameKey: "login.success",
            },
            manifestEntryId: "login-happy-path",
            params: { seedUser: "demo" },
          },
          manifest,
        ),
      "missing_capture_set",
    );
  });

  test("rejects unknown params and invalid enum values", () => {
    const manifest = validateStoryboardRunManifestPayload(validManifest);
    expectManifestError(
      () =>
        validateCreateRunRequest(
          {
            scope: "frame",
            mode: "run-to-state",
            target: {
              storyboardId: "default-storyboard",
              storyId: "login",
              frameKey: "login.success",
            },
            manifestEntryId: "login-happy-path",
            params: { seedUser: "admin" },
          },
          manifest,
        ),
      "invalid_enum",
    );
    expectManifestError(
      () =>
        validateCreateRunRequest(
          {
            scope: "frame",
            mode: "run-to-state",
            target: {
              storyboardId: "default-storyboard",
              storyId: "login",
              frameKey: "login.success",
            },
            manifestEntryId: "login-happy-path",
            params: { seedUser: "demo", shell: "whoami" },
          },
          manifest,
        ),
      "unknown_param",
    );
  });

  test("requires browser run targets to carry runtime/server config before queuing", () => {
    const manifestPayload = cloneManifest();
    manifestPayload.runners[0].kind = "browser";
    manifestPayload.runners[0].id = "agent-browser";
    manifestPayload.entries[0].runnerId = "agent-browser";
    const manifest = validateStoryboardRunManifestPayload(manifestPayload);
    const capabilities = capabilitiesFromManifest({ loaded: true, path: "/tmp/storyboard.run.json", manifest });
    expect(capabilities.manifestEntries[0]?.runtimeTarget).toBeUndefined();
    expectManifestError(
      () =>
        validateCreateRunRequest(
          {
            scope: "frame",
            mode: "run-and-capture",
            target: {
              storyboardId: "default-storyboard",
              storyId: "login",
              frameKey: "login.success",
            },
            manifestEntryId: "login-happy-path",
            captureSetId: "desktop",
            params: { seedUser: "demo" },
          },
          manifest,
        ),
      "missing_runtime_target",
    );
  });

  test("exposes configured runtime/server targets in run capabilities", () => {
    const manifestPayload = cloneManifest();
    manifestPayload.runners[0].kind = "browser";
    manifestPayload.runners[0].id = "agent-browser";
    manifestPayload.entries[0].runnerId = "agent-browser";
    (manifestPayload.entries[0] as Record<string, unknown>).runtimeTarget = {
      id: "baseconnect-onboarding-user-verification",
      label: "BaseConnect onboarding dev desktop",
      appUrl: "http://10.0.0.239:8086/user-verification",
      appOrigin: "http://10.0.0.239:8086",
      apiRoot: "http://10.0.0.49:8808",
      apiMode: "stub",
      apiStubInfo: "POST /api/v3/public/user-verification/email -> 204",
    };
    const manifest = validateStoryboardRunManifestPayload(manifestPayload);
    const capabilities = capabilitiesFromManifest({ loaded: true, path: "/tmp/storyboard.run.json", manifest });
    expect(capabilities.manifestEntries[0]?.runtimeTarget?.appUrl).toBe("http://10.0.0.239:8086/user-verification");
    expect(
      validateCreateRunRequest(
        {
          scope: "frame",
          mode: "run-and-capture",
          target: {
            storyboardId: "default-storyboard",
            storyId: "login",
            frameKey: "login.success",
          },
          manifestEntryId: "login-happy-path",
          captureSetId: "desktop",
          params: { seedUser: "demo" },
        },
        manifest,
      ).manifestEntryId,
    ).toBe("login-happy-path");
  });

  test("loadStoryboardRunManifest rejects symlink manifests", () => {
    const root = mkdtempSync(join(tmpdir(), "storyboard-run-manifest-"));
    const outside = join(
      tmpdir(),
      `storyboard-run-manifest-outside-${Date.now()}.json`,
    );
    writeFileSync(outside, JSON.stringify(validManifest), "utf8");
    symlinkSync(outside, join(root, "storyboard.run.json"));
    expectManifestError(() => loadStoryboardRunManifest(root), "unsafe_path");
  });

  test("loadStoryboardRunManifest reads a real storyboard.run.json", () => {
    const root = mkdtempSync(join(tmpdir(), "storyboard-run-manifest-"));
    writeFileSync(
      join(root, "storyboard.run.json"),
      `${JSON.stringify(validManifest, null, 2)}\n`,
      "utf8",
    );
    const result = loadStoryboardRunManifest(root);
    expect(result.loaded).toBe(true);
    expect(result.loaded ? result.manifest.entries[0]?.id : null).toBe(
      "login-happy-path",
    );
  });
});

describe("storyboard run storage", () => {
  test("round-trips jobs, logs, provenance and recovers non-terminal jobs", () => {
    const root = mkdtempSync(join(tmpdir(), "storyboard-run-storage-"));
    const storage = createStoryboardRunStorage(root);
    const jobId = generateStoryboardRunJobId();
    expect(jobId).toMatch(/^job_[A-Za-z0-9_-]{20,}$/);

    const job = storage.writeJob({
      jobId,
      scope: "frame",
      mode: "run-and-capture",
      status: "running",
      target: {
        storyboardId: "default-storyboard",
        storyId: "login",
        frameKey: "login.success",
        outputVariantId: "desktop",
      },
      manifestEntryId: "login-happy-path",
      captureSetId: "desktop",
      outputVariantId: "desktop",
      createdAt: "2026-06-05T21:00:00.000Z",
      updatedAt: "2026-06-05T21:00:00.000Z",
      params: { seedUser: "demo" },
      provenanceWrites: [],
    });

    expect(storage.readJob(jobId)).toEqual(job);
    expect(
      storage.appendLog(jobId, { level: "info", event: "queued" }).event,
    ).toBe("queued");
    expect(storage.readLogs(jobId)).toHaveLength(1);

    const provenance = storage.writeProvenance({
      storyboardId: "default-storyboard",
      frameKey: "login.success",
      manifestHash: "sha256:manifest",
      manifestEntryId: "login-happy-path",
      runnerId: "dry-runner",
      runnerHash: "sha256:runner",
      appBuildId: "git:test",
      captureSetId: "desktop",
      captureSetHash: "sha256:capture",
      outputVariantId: "desktop",
      storyboardSpecHash: "sha256:storyboard",
      frameSpecHash: "sha256:frame",
      outputAsset: "assets/runs/login.success/desktop.png",
      outputAssetHash: "sha256:asset",
      completedAt: "2026-06-05T21:00:10.000Z",
    });
    expect(provenance.path).toBe(
      ".storyboard-runs/provenance/default-storyboard/login.success/desktop/desktop/login-happy-path/dry-runner.json",
    );
    expect(storage.readProvenance(provenance)?.outputVariantId).toBe("desktop");

    const recovered = storage.markNonTerminalJobsOnRestart();
    expect(recovered).toHaveLength(1);
    expect(storage.readJob(jobId).status).toBe("failed");
    expect(storage.readJob(jobId).error?.code).toBe("server_restarted");
  });

  test("rejects unsafe artifact paths and keeps transient state out of storyboard.json", () => {
    const root = mkdtempSync(join(tmpdir(), "storyboard-run-storage-"));
    const storage = createStoryboardRunStorage(root);
    writeFileSync(
      join(root, "storyboard.json"),
      JSON.stringify({ id: "s", title: "S", stories: [] }, null, 2),
      "utf8",
    );
    expect(isSafeStoryboardRunServedArtifactPath("assets/result.png")).toBe(
      true,
    );
    expect(isSafeStoryboardRunServedArtifactPath(".env")).toBe(false);
    expect(isSafeStoryboardRunServedArtifactPath("assets/.secret")).toBe(false);
    expect(isSafeStoryboardRunServedArtifactPath("assets/api-token.txt")).toBe(
      false,
    );
    expect(() => storage.transientArtifactPath("../bad", "result.png")).toThrow(
      StoryboardRunManifestError,
    );
    const artifact = storage.transientArtifactPath(
      "job_safe",
      "frames/result.png",
    );
    mkdirSync(join(artifact, ".."), { recursive: true });
    writeFileSync(artifact, "fake", "utf8");
    expect(existsSync(artifact)).toBe(true);
    const storyboardJson = readFileSync(join(root, "storyboard.json"), "utf8");
    expect(storyboardJson).not.toContain("job_safe");
    expect(storyboardJson).not.toContain(".storyboard-runs");
  });
});

describe("storyboard run freshness derivation", () => {
  function writeFreshStoryboard(root: string) {
    mkdirSync(join(root, "assets/runs/login.success"), { recursive: true });
    const assetPath = join(root, "assets/runs/login.success/desktop.png");
    writeFileSync(assetPath, "asset-v1", "utf8");
    const storyboard = {
      id: "default-storyboard",
      title: "Default",
      stories: [
        {
          id: "login",
          title: "Login",
          frames: [
            {
              id: "login.success",
              title: "Success",
              description: "Logged in",
              captureSets: {
                desktop: {
                  screenshots: {
                    desktop: "assets/runs/login.success/desktop.png",
                  },
                },
              },
            },
          ],
        },
      ],
    };
    return { storyboard, assetPath };
  }

  test("derives not-runnable, stale, unchanged and changed-input stale states", () => {
    const root = mkdtempSync(join(tmpdir(), "storyboard-run-freshness-"));
    const { storyboard } = writeFreshStoryboard(root);
    const manifest = validateStoryboardRunManifestPayload(validManifest);

    expect(
      deriveStoryboardRunFreshness({
        storyboardRoot: root,
        storyboard,
        storyId: "login",
        frameKey: "missing",
        manifest,
      }).freshness,
    ).toBe("not-runnable");

    const browserManifestPayload = cloneManifest();
    browserManifestPayload.runners[0].kind = "browser";
    browserManifestPayload.runners[0].id = "agent-browser";
    browserManifestPayload.entries[0].runnerId = "agent-browser";
    const browserManifestWithoutRuntime = validateStoryboardRunManifestPayload(browserManifestPayload);
    const missingRuntime = deriveStoryboardRunFreshness({
      storyboardRoot: root,
      storyboard,
      storyId: "login",
      frameKey: "login.success",
      manifest: browserManifestWithoutRuntime,
      captureSetId: "desktop",
      outputVariantId: "desktop",
    });
    expect(missingRuntime.runnable).toBe(false);
    expect(missingRuntime.disabledReason).toBe("missing runtime/server config");

    const defaultTargetRuntime = deriveStoryboardRunFreshness({
      storyboardRoot: root,
      storyboard: {
        ...storyboard,
        runTarget: { kind: "web", url: "https://app.example.test/default" },
      },
      storyId: "login",
      frameKey: "login.success",
      manifest: browserManifestWithoutRuntime,
      captureSetId: "desktop",
      outputVariantId: "desktop",
    });
    expect(defaultTargetRuntime.runnable).toBe(true);
    expect(defaultTargetRuntime.runtimeTarget).toEqual({
      id: "storyboard:default",
      label: "Storyboard default web",
      appUrl: "https://app.example.test/default",
    });

    const runtimeTarget = {
      id: "baseconnect-onboarding-user-verification",
      label: "BaseConnect onboarding dev desktop",
      appUrl: "http://10.0.0.239:8086/user-verification",
      appOrigin: "http://10.0.0.239:8086",
      apiRoot: "http://10.0.0.49:8808",
      apiMode: "stub" as const,
      apiStubInfo: "POST /api/v3/public/user-verification/email -> 204",
    };
    const browserManifestWithRuntime = validateStoryboardRunManifestPayload({
      ...browserManifestPayload,
      entries: [
        {
          ...browserManifestPayload.entries[0],
          runtimeTarget,
        },
      ],
    });
    const configuredRuntime = deriveStoryboardRunFreshness({
      storyboardRoot: root,
      storyboard,
      storyId: "login",
      frameKey: "login.success",
      manifest: browserManifestWithRuntime,
      captureSetId: "desktop",
      outputVariantId: "desktop",
    });
    expect(configuredRuntime.runnable).toBe(true);
    expect(configuredRuntime.disabledReason).toBeNull();
    expect(configuredRuntime.runtimeTarget).toEqual(runtimeTarget);

    const manifestWithDocumentTarget = augmentManifestWithStoryboardDocumentRuntimeTargets(
      browserManifestWithRuntime,
      {
        ...storyboard,
        runTarget: { kind: "web", url: "https://app.example.test/persisted-default" },
      },
    );
    expect(manifestWithDocumentTarget.entries[0]?.runtimeTarget).toEqual({
      ...runtimeTarget,
      id: "storyboard:default",
      label: "Storyboard default web",
      configuredRunTargetUrl: "https://app.example.test/persisted-default",
    });
    const documentTargetOverridesManifestFallback = deriveStoryboardRunFreshness({
      storyboardRoot: root,
      storyboard: {
        ...storyboard,
        runTarget: { kind: "web", url: "https://app.example.test/persisted-default" },
      },
      storyId: "login",
      frameKey: "login.success",
      manifest: manifestWithDocumentTarget,
      captureSetId: "desktop",
      outputVariantId: "desktop",
    });
    expect(documentTargetOverridesManifestFallback.runtimeTarget?.appUrl).toBe(
      "http://10.0.0.239:8086/user-verification",
    );
    expect(documentTargetOverridesManifestFallback.runtimeTarget?.configuredRunTargetUrl).toBe(
      "https://app.example.test/persisted-default",
    );

    const staleMissing = deriveStoryboardRunFreshness({
      storyboardRoot: root,
      storyboard,
      storyId: "login",
      frameKey: "login.success",
      manifest,
      captureSetId: "desktop",
      outputVariantId: "desktop",
      appBuildId: "git:a",
    });
    expect(staleMissing.freshness).toBe("stale");

    const storage = createStoryboardRunStorage(root);
    const entry = manifest.entries[0];
    const runner = manifest.runners[0];
    const captureSet = manifest.captureSets[0];
    storage.writeProvenance({
      storyboardId: "default-storyboard",
      frameKey: "login.success",
      manifestHash: hashStoryboardRunJson(manifest),
      manifestEntryId: entry.id,
      runnerId: entry.runnerId,
      runnerHash: hashStoryboardRunJson(runner),
      appBuildId: "git:a",
      captureSetId: "desktop",
      captureSetHash: hashStoryboardRunJson(captureSet),
      outputVariantId: "desktop",
      storyboardSpecHash: hashStoryboardRunJson(storyboard),
      frameSpecHash: hashStoryboardRunJson(storyboard.stories[0].frames[0]),
      outputAsset: "assets/runs/login.success/desktop.png",
      outputAssetHash: storyboardRunSha256("asset-v1"),
      completedAt: "2026-06-05T21:00:10.000Z",
    });

    const unchanged = deriveStoryboardRunFreshness({
      storyboardRoot: root,
      storyboard,
      storyId: "login",
      frameKey: "login.success",
      manifest,
      captureSetId: "desktop",
      outputVariantId: "desktop",
      appBuildId: "git:a",
    });
    expect(unchanged.freshness).toBe("unchanged");

    expect(
      deriveStoryboardRunFreshness({
        storyboardRoot: root,
        storyboard,
        storyId: "login",
        frameKey: "login.success",
        manifest,
        captureSetId: "desktop",
        outputVariantId: "desktop",
        appBuildId: "git:b",
      }).freshness,
    ).toBe("stale");

    writeFileSync(
      join(root, "assets/runs/login.success/desktop.png"),
      "asset-v2",
      "utf8",
    );
    expect(
      deriveStoryboardRunFreshness({
        storyboardRoot: root,
        storyboard,
        storyId: "login",
        frameKey: "login.success",
        manifest,
        captureSetId: "desktop",
        outputVariantId: "desktop",
        appBuildId: "git:a",
      }).freshness,
    ).toBe("stale");
  });
});


describe("storyboard run mirror asset freshness", () => {
  test("refreshes stale mirror assets only when the source asset is newer", () => {
    expect(parseNumericStoryboardHeader("1781015029084.3096")).toBe(1781015029084.3096);
    expect(parseNumericStoryboardHeader("not-a-number")).toBeNull();
    expect(parseNumericStoryboardHeader(null)).toBeNull();

    expect(shouldRefreshRunMirrorAsset(1781015029084.3096, 1781014000000)).toBe(true);
    expect(shouldRefreshRunMirrorAsset(1781015029084.3096, 1781015029084.0)).toBe(false);
    expect(shouldRefreshRunMirrorAsset(null, 1781014000000)).toBe(false);
  });
});
