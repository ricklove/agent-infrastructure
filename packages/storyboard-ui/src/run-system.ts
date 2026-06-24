import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { createHash, randomBytes } from "node:crypto";

export const storyboardRunScopes = ["frame", "story", "storyboard"] as const;
export type RunScope = (typeof storyboardRunScopes)[number];

export const storyboardRunModes = [
  "run-to-state",
  "capture",
  "run-and-capture",
] as const;
export type RunMode = (typeof storyboardRunModes)[number];

export const storyboardRunLifecycleStates = [
  "queued",
  "pending",
  "running",
  "capturing",
  "succeeded",
  "failed",
  "skipped",
  "cancelled",
  "expired",
  "recovered",
] as const;
export type RunLifecycleStatus = (typeof storyboardRunLifecycleStates)[number];
export type FrameRunStatus = "not-runnable" | "unchanged" | "stale";
export type Freshness = FrameRunStatus;

export const terminalRunLifecycleStates: readonly RunLifecycleStatus[] = [
  "succeeded",
  "failed",
  "skipped",
  "cancelled",
  "expired",
  "recovered",
];

export type RunnerKind = "dry-run" | "browser" | "device" | "app" | "custom";
export type ParamPrimitiveType = "string" | "number" | "boolean" | "integer";
export type ParamValue = string | number | boolean | null;
export type ParamValues = Record<string, ParamValue>;

export type StoryboardRunTarget = {
  storyboardId?: string;
  storyId?: string;
  frameKey?: string;
  outputVariantId?: string;
  screenSizeId?: string;
};

export type RunError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type LiveSessionHandle = {
  type: "browser" | "device" | "simulator" | "app" | "custom";
  id: string;
  url?: string;
  ttlSeconds: number;
  owner: "runner" | "agent" | "user" | "system" | string;
  capabilities: Array<
    "attach" | "observe" | "interact" | "capture" | "revoke" | string
  >;
  cleanup: "auto-expire" | "revoke-required" | "runner-managed";
};

export type RunProgress = {
  currentFrameKey?: string;
  completedFrames?: number;
  totalFrames?: number;
};

export type RuntimeTarget = {
  id: string;
  label?: string;
  appUrl: string;
  configuredRunTargetUrl?: string;
  appOrigin?: string;
  apiRoot?: string;
  apiMode?: "real" | "stub" | "mock" | "unknown";
  apiStubInfo?: string;
};

export type AutomationDriver = {
  runnerId: string;
  runnerKind: RunnerKind;
  manifestEntryId: string;
  scriptId: string;
  stepId: string;
  command: string;
  fullyAutomated: boolean;
  stateTarget: {
    storyboardId: string;
    storyId: string;
    frameKey: string;
    captureSetId: string;
    outputVariantId: string;
    mode?: RunMode;
  };
  disabledReason: string | null;
};

export type Run = {
  jobId: string;
  scope: RunScope;
  mode: RunMode;
  status: RunLifecycleStatus;
  target: StoryboardRunTarget;
  manifestEntryId: string;
  captureSetId?: string;
  outputVariantId?: string;
  screenSizeId?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  params: ParamValues;
  provenanceWrites: string[];
  liveSessionHandle?: LiveSessionHandle;
  progress?: RunProgress;
  error?: RunError;
};

export type ParamDefinition = {
  type: ParamPrimitiveType;
  label?: string;
  description?: string;
  required?: boolean;
  default?: ParamValue;
  enum?: ParamValue[];
  min?: number;
  max?: number;
};

export type CaptureSet = {
  id: string;
  label?: string;
  viewport?: {
    width: number;
    height: number;
    deviceScaleFactor?: number;
    isMobile?: boolean;
  };
  device?: string;
  profile?: string;
  outputPathTemplate: string;
  imageFormat: "png" | "jpg" | "jpeg" | "webp";
  comparisonPolicy?: "none" | "pixel" | "hash" | "manual";
  options?: Record<string, ParamValue>;
};

export type Runner = {
  id: string;
  label?: string;
  kind: RunnerKind;
  enabled: boolean;
  capabilities: RunMode[];
  command?: never;
  shell?: never;
  args?: never;
};

export type ManifestTargetSelector = {
  storyboardId?: string;
  storyId?: string;
  frameKey?: string;
  storyPattern?: string;
  framePattern?: string;
};

export type ManifestEntry = {
  id: string;
  label: string;
  scope: RunScope;
  runnerId: string;
  modes: RunMode[];
  targets: ManifestTargetSelector[];
  paramsSchema: Record<string, ParamDefinition>;
  captureSets: string[];
  runtimeTarget?: RuntimeTarget;
  scriptId?: string;
  enabled: boolean;
};

export type StoryboardRunManifest = {
  version: 1;
  enabled: boolean;
  runners: Runner[];
  entries: ManifestEntry[];
  captureSets: CaptureSet[];
};

export type Provenance = {
  storyboardId: string;
  frameKey: string;
  manifestHash: string;
  manifestEntryId: string;
  runnerId: string;
  runnerHash?: string;
  appBuildId?: string;
  captureSetId: string;
  storyboardSpecHash: string;
  frameSpecHash: string;
  captureSetHash?: string;
  outputVariantId?: string;
  screenSizeId?: string;
  outputAsset: string;
  outputAssetHash?: string;
  runtimeTarget?: RuntimeTarget;
  completedAt: string;
  key?: string;
  path?: string;
  summary?: string;
};

export type StoryboardRunCapabilitiesDto = {
  runApi: boolean;
  manifestLoaded: boolean;
  queue?: { type: "fifo"; maxActive: number; cancel: boolean };
  modes?: RunMode[];
  lifecycleStates?: RunLifecycleStatus[];
  freshnessStates?: FrameRunStatus[];
  manifestEntries: Array<
    Pick<ManifestEntry, "id" | "label" | "scope" | "modes" | "captureSets"> & { runtimeTarget?: RuntimeTarget; automationDriver?: AutomationDriver }
  >;
};

export type FrameRunStateDto = {
  storyboardId: string;
  storyId: string;
  frameKey: string;
  freshness: Freshness;
  runnable: boolean;
  disabledReason: string | null;
  manifestEntryIds: string[];
  runtimeTarget?: RuntimeTarget;
  automationDriver?: AutomationDriver;
  currentJob?: {
    jobId: string;
    status: RunLifecycleStatus;
    queuePosition?: number;
  };
  latestJob?: {
    jobId: string;
    status: RunLifecycleStatus;
    completedAt?: string;
  };
  provenance?: Provenance;
};

export type StoryboardRunAutomationMatrixRow = {
  frameKey: string;
  storyId: string;
  captureSetId: string;
  outputVariantId: string;
  runtimeTarget?: RuntimeTarget;
  automationDriver?: AutomationDriver;
  fullyAutomated: boolean;
  runnable: boolean;
  disabledReason: string | null;
};

export type StoryboardRunStateDto = {
  storyboardId: string;
  generatedAt: string;
  runApi: boolean;
  queue: { maxActive: number; active: number; queued: number };
  frames: FrameRunStateDto[];
  automationMatrix?: StoryboardRunAutomationMatrixRow[];
};

export type CreateRunRequestDto = {
  scope: RunScope;
  mode: RunMode;
  target: StoryboardRunTarget;
  manifestEntryId: string;
  captureSetId?: string;
  outputVariantId?: string;
  screenSizeId?: string;
  params?: ParamValues;
};

export type CreateRunResponseDto = {
  jobId: string;
  status: "queued";
  queuePosition: number;
  links: {
    job: string;
    logs: string;
    cancel: string;
  };
};

export type RunLogRecordDto = {
  ts: string;
  level: "debug" | "info" | "warn" | "error";
  event: string;
  context?: Record<string, unknown>;
};

export type CancelRunRequestDto = {
  reason?: string;
};

export type CancelRunResponseDto = {
  jobId: string;
  status: "cancelled";
  cancelledAt: string;
};

export class StoryboardRunManifestError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "StoryboardRunManifestError";
    this.code = code;
    this.details = details;
  }
}

export type LoadStoryboardRunManifestResult =
  | { loaded: true; path: string; manifest: StoryboardRunManifest }
  | {
      loaded: false;
      path: string | null;
      manifest: null;
      reason: "missing" | "disabled";
    };

const scalarIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/u;
const safePattern = /^[a-zA-Z0-9][a-zA-Z0-9_.:/@*-]{0,255}$/u;
const allowedTopLevelKeys = new Set([
  "version",
  "enabled",
  "runners",
  "entries",
  "captureSets",
]);
const allowedRunnerKeys = new Set([
  "id",
  "label",
  "kind",
  "enabled",
  "capabilities",
]);
const rejectedRunnerKeys = new Set([
  "command",
  "commands",
  "cmd",
  "shell",
  "script",
  "scripts",
  "args",
  "argv",
  "exec",
  "env",
  "cwd",
]);
const allowedEntryKeys = new Set([
  "id",
  "label",
  "scope",
  "runnerId",
  "modes",
  "targets",
  "paramsSchema",
  "captureSets",
  "runtimeTarget",
  "scriptId",
  "enabled",
]);
const allowedTargetKeys = new Set([
  "storyboardId",
  "storyId",
  "frameKey",
  "storyPattern",
  "framePattern",
]);
const allowedParamKeys = new Set([
  "type",
  "label",
  "description",
  "required",
  "default",
  "enum",
  "min",
  "max",
]);
const allowedCaptureSetKeys = new Set([
  "id",
  "label",
  "viewport",
  "device",
  "profile",
  "outputPathTemplate",
  "imageFormat",
  "comparisonPolicy",
  "options",
]);
const allowedViewportKeys = new Set([
  "width",
  "height",
  "deviceScaleFactor",
  "isMobile",
]);
const allowedRuntimeTargetKeys = new Set([
  "id",
  "label",
  "appUrl",
  "configuredRunTargetUrl",
  "appOrigin",
  "apiRoot",
  "apiMode",
  "apiStubInfo",
]);

function manifestError(path: string, code: string, message: string): never {
  throw new StoryboardRunManifestError(code, `${path}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNoUnknownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      manifestError(path, "unknown_field", `unknown field ${key}`);
    }
  }
}

function assertNoRejectedKeys(
  value: Record<string, unknown>,
  rejected: Set<string>,
  path: string,
) {
  for (const key of Object.keys(value)) {
    if (rejected.has(key)) {
      manifestError(path, "unsafe_field", `unsafe field ${key} is not allowed`);
    }
  }
}

function requireRecord(value: unknown, path: string) {
  if (!isRecord(value)) {
    manifestError(path, "invalid_type", "expected object");
  }
  return value;
}

function requireString(value: unknown, path: string) {
  if (typeof value !== "string" || value.trim() === "") {
    manifestError(path, "invalid_type", "expected non-empty string");
  }
  return value.trim();
}

function optionalString(value: unknown, path: string) {
  if (value === undefined) return undefined;
  return requireString(value, path);
}

function requireBoolean(value: unknown, path: string) {
  if (typeof value !== "boolean") {
    manifestError(path, "invalid_type", "expected boolean");
  }
  return value;
}

function requireNumber(value: unknown, path: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    manifestError(path, "invalid_type", "expected finite number");
  }
  return value;
}

function requireInteger(value: unknown, path: string) {
  const numberValue = requireNumber(value, path);
  if (!Number.isInteger(numberValue)) {
    manifestError(path, "invalid_type", "expected integer");
  }
  return numberValue;
}

function requireId(value: unknown, path: string) {
  const id = requireString(value, path);
  if (!scalarIdPattern.test(id)) {
    manifestError(path, "invalid_id", "expected safe identifier");
  }
  return id;
}

function requireSafeSelector(value: unknown, path: string) {
  const selector = requireString(value, path);
  if (
    selector.includes("..") ||
    selector.startsWith("/") ||
    selector.includes("\\") ||
    !safePattern.test(selector)
  ) {
    manifestError(path, "unsafe_selector", "expected safe relative selector");
  }
  return selector;
}

function requireSafePattern(value: unknown, path: string) {
  const pattern = requireString(value, path);
  if (
    pattern.includes("..") ||
    pattern.startsWith("/") ||
    pattern.includes("\\") ||
    !/^[a-zA-Z0-9*@][a-zA-Z0-9_.:/@*-]{0,255}$/u.test(pattern)
  ) {
    manifestError(
      path,
      "unsafe_selector",
      "expected safe relative selector pattern",
    );
  }
  return pattern;
}

export function isSafeRelativeStoryboardRunPath(pathValue: string) {
  if (
    !pathValue ||
    isAbsolute(pathValue) ||
    pathValue.includes("\\") ||
    pathValue.includes("\0")
  ) {
    return false;
  }
  const parts = pathValue.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    return false;
  }
  if (
    parts.some((part) => part.startsWith(".") && part !== ".storyboard-runs")
  ) {
    return false;
  }
  return true;
}

function requireSafeRelativePath(value: unknown, path: string) {
  const pathValue = requireString(value, path);
  if (!isSafeRelativeStoryboardRunPath(pathValue)) {
    manifestError(path, "unsafe_path", "expected safe relative path");
  }
  return pathValue;
}

function requireEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  path: string,
): T[number] {
  const stringValue = requireString(value, path);
  if (!allowed.includes(stringValue)) {
    manifestError(
      path,
      "invalid_enum",
      `expected one of ${allowed.join(", ")}`,
    );
  }
  return stringValue;
}

function requireStringArray<T extends string>(
  value: unknown,
  path: string,
  item: (value: unknown, path: string) => T,
) {
  if (!Array.isArray(value) || value.length === 0) {
    manifestError(path, "invalid_type", "expected non-empty array");
  }
  return value.map((entry, index) => item(entry, `${path}[${index}]`));
}

function normalizeParamValue(
  value: unknown,
  definition: ParamDefinition,
  path: string,
): ParamValue {
  if (value === null) return null;
  if (definition.type === "string") return requireString(value, path);
  if (definition.type === "boolean") {
    if (typeof value !== "boolean")
      manifestError(path, "invalid_type", "expected boolean");
    return value;
  }
  if (definition.type === "number") return requireNumber(value, path);
  if (definition.type === "integer") return requireInteger(value, path);
  manifestError(path, "invalid_enum", "unsupported param type");
}

function parseParamDefinition(value: unknown, path: string): ParamDefinition {
  const record = requireRecord(value, path);
  assertNoUnknownKeys(record, allowedParamKeys, path);
  const type = requireEnum(
    record.type,
    ["string", "number", "boolean", "integer"] as const,
    `${path}.type`,
  );
  const definition: ParamDefinition = {
    type,
    label: optionalString(record.label, `${path}.label`),
    description: optionalString(record.description, `${path}.description`),
    required:
      record.required === undefined
        ? undefined
        : requireBoolean(record.required, `${path}.required`),
    min:
      record.min === undefined
        ? undefined
        : requireNumber(record.min, `${path}.min`),
    max:
      record.max === undefined
        ? undefined
        : requireNumber(record.max, `${path}.max`),
  };
  if (record.default !== undefined) {
    definition.default = normalizeParamValue(
      record.default,
      definition,
      `${path}.default`,
    );
  }
  if (record.enum !== undefined) {
    if (!Array.isArray(record.enum) || record.enum.length === 0) {
      manifestError(`${path}.enum`, "invalid_type", "expected non-empty array");
    }
    definition.enum = record.enum.map((item, index) =>
      normalizeParamValue(item, definition, `${path}.enum[${index}]`),
    );
    if (
      definition.default !== undefined &&
      !definition.enum.includes(definition.default)
    ) {
      manifestError(
        `${path}.default`,
        "invalid_default",
        "default must be in enum",
      );
    }
  }
  return definition;
}

function parseParamsSchema(value: unknown, path: string) {
  const record = value === undefined ? {} : requireRecord(value, path);
  const result: Record<string, ParamDefinition> = {};
  for (const [key, definition] of Object.entries(record)) {
    if (!scalarIdPattern.test(key)) {
      manifestError(`${path}.${key}`, "invalid_id", "expected safe param name");
    }
    result[key] = parseParamDefinition(definition, `${path}.${key}`);
  }
  return result;
}

function parseTargets(value: unknown, scope: RunScope, path: string) {
  if (!Array.isArray(value) || value.length === 0) {
    manifestError(
      path,
      "invalid_type",
      "expected non-empty target selector array",
    );
  }
  return value.map((entry, index) => {
    const targetPath = `${path}[${index}]`;
    const record = requireRecord(entry, targetPath);
    assertNoUnknownKeys(record, allowedTargetKeys, targetPath);
    const parsed: ManifestTargetSelector = {
      storyboardId: optionalString(
        record.storyboardId,
        `${targetPath}.storyboardId`,
      ),
      storyId: optionalString(record.storyId, `${targetPath}.storyId`),
      frameKey: optionalString(record.frameKey, `${targetPath}.frameKey`),
      storyPattern: optionalString(
        record.storyPattern,
        `${targetPath}.storyPattern`,
      ),
      framePattern: optionalString(
        record.framePattern,
        `${targetPath}.framePattern`,
      ),
    };
    for (const [key, item] of Object.entries(parsed)) {
      if (item !== undefined) {
        parsed[key as keyof ManifestTargetSelector] = key.endsWith("Pattern")
          ? requireSafePattern(item, `${targetPath}.${key}`)
          : requireSafeSelector(item, `${targetPath}.${key}`);
      }
    }
    if (scope === "frame" && !parsed.frameKey && !parsed.framePattern) {
      manifestError(
        targetPath,
        "missing_target_identity",
        "frame scope target requires frameKey or framePattern",
      );
    }
    if (
      (scope === "frame" || scope === "story") &&
      !parsed.storyId &&
      !parsed.storyPattern
    ) {
      manifestError(
        targetPath,
        "missing_target_identity",
        `${scope} scope target requires storyId or storyPattern`,
      );
    }
    if (
      !parsed.storyboardId &&
      !parsed.storyId &&
      !parsed.frameKey &&
      !parsed.storyPattern &&
      !parsed.framePattern
    ) {
      manifestError(
        targetPath,
        "missing_target_identity",
        "target selector cannot be empty",
      );
    }
    return parsed;
  });
}

function parseRunner(value: unknown, path: string): Runner {
  const record = requireRecord(value, path);
  assertNoRejectedKeys(record, rejectedRunnerKeys, path);
  assertNoUnknownKeys(record, allowedRunnerKeys, path);
  const runner: Runner = {
    id: requireId(record.id, `${path}.id`),
    label: optionalString(record.label, `${path}.label`),
    kind: requireEnum(
      record.kind,
      ["dry-run", "browser", "device", "app", "custom"] as const,
      `${path}.kind`,
    ),
    enabled: requireBoolean(record.enabled, `${path}.enabled`),
    capabilities: requireStringArray(
      record.capabilities,
      `${path}.capabilities`,
      (item, itemPath) => requireEnum(item, storyboardRunModes, itemPath),
    ),
  };
  if (!runner.enabled) {
    manifestError(
      `${path}.enabled`,
      "disabled_runner",
      "runner entries must be explicitly enabled or removed",
    );
  }
  return runner;
}

function parseCaptureSet(value: unknown, path: string): CaptureSet {
  const record = requireRecord(value, path);
  assertNoUnknownKeys(record, allowedCaptureSetKeys, path);
  const viewport =
    record.viewport === undefined
      ? undefined
      : requireRecord(record.viewport, `${path}.viewport`);
  if (viewport)
    assertNoUnknownKeys(viewport, allowedViewportKeys, `${path}.viewport`);
  return {
    id: requireId(record.id, `${path}.id`),
    label: optionalString(record.label, `${path}.label`),
    viewport: viewport
      ? {
          width: requireInteger(viewport.width, `${path}.viewport.width`),
          height: requireInteger(viewport.height, `${path}.viewport.height`),
          deviceScaleFactor:
            viewport.deviceScaleFactor === undefined
              ? undefined
              : requireNumber(
                  viewport.deviceScaleFactor,
                  `${path}.viewport.deviceScaleFactor`,
                ),
          isMobile:
            viewport.isMobile === undefined
              ? undefined
              : requireBoolean(viewport.isMobile, `${path}.viewport.isMobile`),
        }
      : undefined,
    device: optionalString(record.device, `${path}.device`),
    profile: optionalString(record.profile, `${path}.profile`),
    outputPathTemplate: requireSafeRelativePath(
      record.outputPathTemplate,
      `${path}.outputPathTemplate`,
    ),
    imageFormat: requireEnum(
      record.imageFormat,
      ["png", "jpg", "jpeg", "webp"] as const,
      `${path}.imageFormat`,
    ),
    comparisonPolicy:
      record.comparisonPolicy === undefined
        ? undefined
        : requireEnum(
            record.comparisonPolicy,
            ["none", "pixel", "hash", "manual"] as const,
            `${path}.comparisonPolicy`,
          ),
    options:
      record.options === undefined
        ? undefined
        : parseParamValues(record.options, {}, `${path}.options`, true),
  };
}

function parseRuntimeTarget(value: unknown, path: string): RuntimeTarget {
  const record = requireRecord(value, path);
  assertNoUnknownKeys(record, allowedRuntimeTargetKeys, path);
  const appUrl = requireString(record.appUrl, `${path}.appUrl`);
  let parsedAppUrl: URL;
  try {
    parsedAppUrl = new URL(appUrl);
  } catch {
    manifestError(`${path}.appUrl`, "invalid_url", "appUrl must be an absolute http(s) URL");
  }
  if (parsedAppUrl.protocol !== "http:" && parsedAppUrl.protocol !== "https:") {
    manifestError(`${path}.appUrl`, "invalid_url", "appUrl must be an absolute http(s) URL");
  }
  const appOrigin = optionalString(record.appOrigin, `${path}.appOrigin`);
  if (appOrigin !== undefined) {
    try {
      const origin = new URL(appOrigin);
      if (origin.protocol !== "http:" && origin.protocol !== "https:") {
        manifestError(`${path}.appOrigin`, "invalid_url", "appOrigin must be an absolute http(s) origin");
      }
    } catch {
      manifestError(`${path}.appOrigin`, "invalid_url", "appOrigin must be an absolute http(s) origin");
    }
  }
  const apiRoot = optionalString(record.apiRoot, `${path}.apiRoot`);
  if (apiRoot !== undefined) {
    try {
      const api = new URL(apiRoot);
      if (api.protocol !== "http:" && api.protocol !== "https:") {
        manifestError(`${path}.apiRoot`, "invalid_url", "apiRoot must be an absolute http(s) URL");
      }
    } catch {
      manifestError(`${path}.apiRoot`, "invalid_url", "apiRoot must be an absolute http(s) URL");
    }
  }
  return {
    id: requireId(record.id, `${path}.id`),
    label: optionalString(record.label, `${path}.label`),
    appUrl,
    configuredRunTargetUrl: optionalString(record.configuredRunTargetUrl, `${path}.configuredRunTargetUrl`),
    appOrigin,
    apiRoot,
    apiMode: record.apiMode === undefined ? undefined : requireEnum(record.apiMode, ["real", "stub", "mock", "unknown"] as const, `${path}.apiMode`),
    apiStubInfo: optionalString(record.apiStubInfo, `${path}.apiStubInfo`),
  };
}

function parseEntry(value: unknown, path: string): ManifestEntry {
  const record = requireRecord(value, path);
  assertNoUnknownKeys(record, allowedEntryKeys, path);
  const scope = requireEnum(record.scope, storyboardRunScopes, `${path}.scope`);
  const enabled = requireBoolean(record.enabled, `${path}.enabled`);
  if (!enabled) {
    manifestError(
      `${path}.enabled`,
      "disabled_manifest_entry",
      "manifest entries must be explicitly enabled or removed",
    );
  }
  return {
    id: requireId(record.id, `${path}.id`),
    label: requireString(record.label, `${path}.label`),
    scope,
    runnerId: requireId(record.runnerId, `${path}.runnerId`),
    modes: requireStringArray(record.modes, `${path}.modes`, (item, itemPath) =>
      requireEnum(item, storyboardRunModes, itemPath),
    ),
    targets: parseTargets(record.targets, scope, `${path}.targets`),
    paramsSchema: parseParamsSchema(
      record.paramsSchema,
      `${path}.paramsSchema`,
    ),
    captureSets:
      record.captureSets === undefined
        ? []
        : requireStringArray(
            record.captureSets,
            `${path}.captureSets`,
            (item, itemPath) => requireId(item, itemPath),
          ),
    runtimeTarget: record.runtimeTarget === undefined ? undefined : parseRuntimeTarget(record.runtimeTarget, `${path}.runtimeTarget`),
    scriptId: optionalString(record.scriptId, `${path}.scriptId`),
    enabled,
  };
}

export function parseParamValues(
  value: unknown,
  schema: Record<string, ParamDefinition>,
  path = "params",
  allowUnknown = false,
): ParamValues {
  const record = value === undefined ? {} : requireRecord(value, path);
  const result: ParamValues = {};
  for (const [key, item] of Object.entries(record)) {
    if (!allowUnknown && schema[key] === undefined) {
      manifestError(`${path}.${key}`, "unknown_param", "unknown parameter");
    }
    const definition = schema[key];
    if (definition) {
      const parsed = normalizeParamValue(item, definition, `${path}.${key}`);
      if (definition.enum && !definition.enum.includes(parsed)) {
        manifestError(
          `${path}.${key}`,
          "invalid_enum",
          "param value is not in enum",
        );
      }
      result[key] = parsed;
    } else if (
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean" ||
      item === null
    ) {
      result[key] = item;
    } else {
      manifestError(
        `${path}.${key}`,
        "invalid_type",
        "expected primitive option value",
      );
    }
  }
  for (const [key, definition] of Object.entries(schema)) {
    if (result[key] === undefined && definition.default !== undefined) {
      result[key] = definition.default;
    } else if (result[key] === undefined && definition.required) {
      manifestError(
        `${path}.${key}`,
        "missing_required_param",
        "missing required parameter",
      );
    }
  }
  return result;
}

function hasDuplicates(values: string[]) {
  return new Set(values).size !== values.length;
}

export function validateStoryboardRunManifestPayload(
  payload: unknown,
): StoryboardRunManifest {
  const record = requireRecord(payload, "manifest");
  assertNoUnknownKeys(record, allowedTopLevelKeys, "manifest");
  const version = requireInteger(record.version, "manifest.version");
  if (version !== 1) {
    manifestError(
      "manifest.version",
      "unsupported_version",
      "expected version 1",
    );
  }
  const enabled = requireBoolean(record.enabled, "manifest.enabled");
  if (!enabled) {
    return {
      version: 1,
      enabled: false,
      runners: [],
      entries: [],
      captureSets: [],
    };
  }
  if (!Array.isArray(record.runners) || record.runners.length === 0) {
    manifestError(
      "manifest.runners",
      "invalid_type",
      "expected non-empty runner array",
    );
  }
  if (!Array.isArray(record.entries) || record.entries.length === 0) {
    manifestError(
      "manifest.entries",
      "invalid_type",
      "expected non-empty entry array",
    );
  }
  const runners = record.runners.map((runner, index) =>
    parseRunner(runner, `manifest.runners[${index}]`),
  );
  const entries = record.entries.map((entry, index) =>
    parseEntry(entry, `manifest.entries[${index}]`),
  );
  const captureSets = (
    Array.isArray(record.captureSets) ? record.captureSets : []
  ).map((captureSet, index) =>
    parseCaptureSet(captureSet, `manifest.captureSets[${index}]`),
  );
  if (record.captureSets !== undefined && !Array.isArray(record.captureSets)) {
    manifestError("manifest.captureSets", "invalid_type", "expected array");
  }
  const runnerIds = runners.map((runner) => runner.id);
  const entryIds = entries.map((entry) => entry.id);
  const captureSetIds = captureSets.map((captureSet) => captureSet.id);
  if (hasDuplicates(runnerIds))
    manifestError("manifest.runners", "duplicate_id", "duplicate runner id");
  if (hasDuplicates(entryIds))
    manifestError(
      "manifest.entries",
      "duplicate_id",
      "duplicate manifest entry id",
    );
  if (hasDuplicates(captureSetIds))
    manifestError(
      "manifest.captureSets",
      "duplicate_id",
      "duplicate capture set id",
    );
  const runnerIdSet = new Set(runnerIds);
  const captureSetIdSet = new Set(captureSetIds);
  for (const entry of entries) {
    if (!runnerIdSet.has(entry.runnerId)) {
      manifestError(
        `manifest.entries.${entry.id}.runnerId`,
        "unknown_runner",
        "manifest entry references unknown runner",
      );
    }
    const runner = runners.find((candidate) => candidate.id === entry.runnerId);
    for (const mode of entry.modes) {
      if (!runner?.capabilities.includes(mode)) {
        manifestError(
          `manifest.entries.${entry.id}.modes`,
          "unsupported_mode",
          "manifest entry mode is not supported by runner",
        );
      }
    }
    const captureMode = entry.modes.some(
      (mode) => mode === "capture" || mode === "run-and-capture",
    );
    if (captureMode && entry.captureSets.length === 0) {
      manifestError(
        `manifest.entries.${entry.id}.captureSets`,
        "missing_capture_set",
        "capture-capable entries require captureSets",
      );
    }
    for (const captureSetId of entry.captureSets) {
      if (!captureSetIdSet.has(captureSetId)) {
        manifestError(
          `manifest.entries.${entry.id}.captureSets`,
          "unknown_capture_set",
          "manifest entry references unknown capture set",
        );
      }
    }
  }
  return { version: 1, enabled, runners, entries, captureSets };
}

export function validateCreateRunRequest(
  payload: unknown,
  manifest: StoryboardRunManifest,
  hasCurrentStoryboardContext = false,
): CreateRunRequestDto {
  if (!manifest.enabled) {
    manifestError("request", "run_api_disabled", "run API is disabled");
  }
  const record = requireRecord(payload, "request");
  assertNoUnknownKeys(
    record,
    new Set([
      "scope",
      "mode",
      "target",
      "manifestEntryId",
      "captureSetId",
      "outputVariantId",
      "screenSizeId",
      "params",
    ]),
    "request",
  );
  const scope = requireEnum(record.scope, storyboardRunScopes, "request.scope");
  const mode = requireEnum(record.mode, storyboardRunModes, "request.mode");
  const manifestEntryId = requireId(
    record.manifestEntryId,
    "request.manifestEntryId",
  );
  const manifestEntry = manifest.entries.find(
    (entry) => entry.id === manifestEntryId && entry.enabled,
  );
  if (!manifestEntry) {
    manifestError(
      "request.manifestEntryId",
      "manifest_entry_not_found",
      "Manifest entry is not enabled for this target.",
    );
  }
  if (manifestEntry.scope !== scope) {
    manifestError(
      "request.scope",
      "scope_mismatch",
      "request scope must match manifest entry scope",
    );
  }
  if (!manifestEntry.modes.includes(mode)) {
    manifestError(
      "request.mode",
      "mode_not_enabled",
      "request mode is not enabled for manifest entry",
    );
  }
  const requestRunner = manifest.runners.find((candidate) => candidate.id === manifestEntry.runnerId);
  if (entryRequiresRuntimeTarget(requestRunner, manifestEntry) && !manifestEntry.runtimeTarget) {
    manifestError(
      "request.manifestEntryId",
      "missing_runtime_target",
      "missing runtime/server config",
    );
  }
  const target = requireRecord(record.target, "request.target");
  assertNoUnknownKeys(
    target,
    new Set([
      "storyboardId",
      "storyId",
      "frameKey",
      "outputVariantId",
      "screenSizeId",
    ]),
    "request.target",
  );
  const requestTarget: StoryboardRunTarget = {
    storyboardId: optionalString(
      target.storyboardId,
      "request.target.storyboardId",
    ),
    storyId: optionalString(target.storyId, "request.target.storyId"),
    frameKey: optionalString(target.frameKey, "request.target.frameKey"),
    outputVariantId: optionalString(
      target.outputVariantId,
      "request.target.outputVariantId",
    ),
    screenSizeId: optionalString(
      target.screenSizeId,
      "request.target.screenSizeId",
    ),
  };
  for (const [key, item] of Object.entries(requestTarget)) {
    if (item !== undefined) {
      requestTarget[key as keyof StoryboardRunTarget] = requireSafeSelector(
        item,
        `request.target.${key}`,
      );
    }
  }
  if (!requestTarget.storyboardId && !hasCurrentStoryboardContext) {
    manifestError(
      "request.target.storyboardId",
      "missing_target_identity",
      "storyboardId is required without an explicit current storyboard context",
    );
  }
  if ((scope === "frame" || scope === "story") && !requestTarget.storyId) {
    manifestError(
      "request.target.storyId",
      "missing_target_identity",
      `${scope} scope requires storyId`,
    );
  }
  if (scope === "frame" && !requestTarget.frameKey) {
    manifestError(
      "request.target.frameKey",
      "missing_target_identity",
      "frame scope requires frameKey",
    );
  }
  const outputVariantId =
    record.outputVariantId === undefined
      ? requestTarget.outputVariantId
      : requireId(record.outputVariantId, "request.outputVariantId");
  const screenSizeId =
    record.screenSizeId === undefined
      ? requestTarget.screenSizeId
      : requireId(record.screenSizeId, "request.screenSizeId");
  const params = parseParamValues(
    record.params,
    manifestEntry.paramsSchema,
    "request.params",
  );
  const captureSetId =
    record.captureSetId === undefined
      ? undefined
      : requireId(record.captureSetId, "request.captureSetId");
  if ((mode === "capture" || mode === "run-and-capture") && !captureSetId) {
    manifestError(
      "request.captureSetId",
      "missing_capture_set",
      "capture mode requires captureSetId",
    );
  }
  if (captureSetId && !manifestEntry.captureSets.includes(captureSetId)) {
    manifestError(
      "request.captureSetId",
      "capture_set_not_enabled",
      "captureSetId is not enabled for manifest entry",
    );
  }
  return {
    scope,
    mode,
    target: requestTarget,
    manifestEntryId,
    captureSetId,
    outputVariantId,
    screenSizeId,
    params,
  };
}

function assertManifestPathSafe(storyboardRoot: string, manifestPath: string) {
  const rootReal = realpathSync(storyboardRoot);
  const parentReal = realpathSync(dirname(manifestPath));
  const name = relative(parentReal, manifestPath);
  if (name !== "storyboard.run.json") {
    manifestError(
      "manifestPath",
      "unsafe_path",
      "manifest path must be storyboard.run.json",
    );
  }
  const relativeParent = relative(rootReal, parentReal);
  if (
    relativeParent !== "" &&
    (relativeParent.startsWith("..") ||
      relativeParent.includes(`..${sep}`) ||
      isAbsolute(relativeParent))
  ) {
    manifestError(
      "manifestPath",
      "unsafe_path",
      "manifest path must stay under storyboard root",
    );
  }
  if (lstatSync(manifestPath).isSymbolicLink()) {
    manifestError(
      "manifestPath",
      "unsafe_path",
      "manifest file must not be a symlink",
    );
  }
}

export function loadStoryboardRunManifest(
  storyboardRoot: string,
): LoadStoryboardRunManifestResult {
  const root = resolve(storyboardRoot);
  const manifestPath = resolve(root, "storyboard.run.json");
  if (!existsSync(manifestPath)) {
    return {
      loaded: false,
      path: manifestPath,
      manifest: null,
      reason: "missing",
    };
  }
  if (!statSync(root).isDirectory()) {
    manifestError(
      "storyboardRoot",
      "invalid_type",
      "storyboard root must be a directory",
    );
  }
  assertManifestPathSafe(root, manifestPath);
  const manifest = validateStoryboardRunManifestPayload(
    JSON.parse(readFileSync(manifestPath, "utf8")),
  );
  if (!manifest.enabled) {
    return {
      loaded: false,
      path: manifestPath,
      manifest: null,
      reason: "disabled",
    };
  }
  return { loaded: true, path: manifestPath, manifest };
}

export function capabilitiesFromManifest(
  result: LoadStoryboardRunManifestResult,
): StoryboardRunCapabilitiesDto {
  if (!result.loaded) {
    return { runApi: false, manifestLoaded: false, manifestEntries: [] };
  }
  return {
    runApi: true,
    manifestLoaded: true,
    queue: { type: "fifo", maxActive: 1, cancel: true },
    modes: [...storyboardRunModes],
    lifecycleStates: [...storyboardRunLifecycleStates],
    freshnessStates: ["not-runnable", "unchanged", "stale"],
    manifestEntries: result.manifest.entries.map((entry) => {
      const automationDriver = manifestEntryAutomationDriver(
        result.manifest,
        entry,
        {
          storyboardId: entry.targets[0]?.storyboardId ?? "*",
          storyId: entry.targets[0]?.storyId ?? entry.targets[0]?.storyPattern ?? "*",
          frameKey: entry.targets[0]?.frameKey ?? entry.targets[0]?.framePattern ?? "*",
          captureSetId: entry.captureSets[0] ?? "default",
          outputVariantId: "default",
        },
        entry.runtimeTarget,
      );
      return {
        id: entry.id,
        label: entry.label,
        scope: entry.scope,
        modes: entry.modes,
        captureSets: entry.captureSets,
        ...(entry.runtimeTarget ? { runtimeTarget: entry.runtimeTarget } : {}),
        ...(automationDriver ? { automationDriver } : {}),
      };
    }),
  };
}

export type StoryboardRunStorage = ReturnType<
  typeof createStoryboardRunStorage
>;
export type RestartRecoveredStatus = "failed" | "expired" | "recovered";

export type FreshnessDerivationInput = {
  storyboardRoot: string;
  storyboard: {
    id: string;
    stories: Array<{
      id: string;
      frames: Array<{ id: string } & Record<string, unknown>>;
      branches?: Array<{
        frames: Array<{ id: string } & Record<string, unknown>>;
      }>;
    }>;
  } & Record<string, unknown>;
  storyId: string;
  frameKey: string;
  manifest: StoryboardRunManifest | null;
  manifestHash?: string;
  manifestEntryId?: string;
  captureSetId?: string;
  outputVariantId?: string;
  screenSizeId?: string;
  mode?: RunMode;
  runnerHashes?: Record<string, string | undefined>;
  appBuildId?: string;
};

const storyboardRunsDirName = ".storyboard-runs";
const nonTerminalStatusSet = new Set<RunLifecycleStatus>(
  storyboardRunLifecycleStates.filter(
    (status) => !terminalRunLifecycleStates.includes(status),
  ),
);

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function storyboardRunSha256(value: string | Uint8Array) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function hashStoryboardRunJson(value: unknown) {
  return storyboardRunSha256(stableJson(value));
}

export function generateStoryboardRunJobId() {
  return `job_${randomBytes(18).toString("base64url")}`;
}

function assertUnderRoot(root: string, pathValue: string) {
  const resolvedRoot = resolve(root);
  const resolved = resolve(pathValue);
  const relativePath = relative(resolvedRoot, resolved);
  if (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  )
    return resolved;
  manifestError("path", "unsafe_path", "path must stay under storyboard root");
}

function assertNoSymlinkAncestors(root: string, pathValue: string) {
  const resolvedRoot = resolve(root);
  const resolved = assertUnderRoot(resolvedRoot, pathValue);
  const relativePath = relative(resolvedRoot, resolved);
  let current = resolvedRoot;
  if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
    manifestError(
      "path",
      "unsafe_path",
      "storyboard root must not be a symlink",
    );
  }
  for (const part of relativePath.split(sep).filter(Boolean)) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      manifestError(
        "path",
        "unsafe_path",
        "storyboard run path must not traverse a symlink",
      );
    }
  }
}

function atomicWriteUtf8(pathValue: string, contents: string) {
  mkdirSync(dirname(pathValue), { recursive: true });
  const temporaryPath = join(
    dirname(pathValue),
    `.tmp-${basename(pathValue)}-${randomBytes(8).toString("hex")}`,
  );
  writeFileSync(temporaryPath, contents, "utf8");
  renameSync(temporaryPath, pathValue);
}

function parseJsonFile<T>(pathValue: string): T {
  return JSON.parse(readFileSync(pathValue, "utf8")) as T;
}

function sanitizePathPart(value: string) {
  if (!scalarIdPattern.test(value))
    manifestError("path", "invalid_id", "expected safe storage key");
  return value.replace(/:/gu, "_");
}

export function isSafeStoryboardRunServedArtifactPath(pathValue: string) {
  return (
    isSafeRelativeStoryboardRunPath(pathValue) &&
    !pathValue
      .split("/")
      .some(
        (part) =>
          part.startsWith(".") ||
          /(?:secret|token|credential|private[-_]?key|\.env)/iu.test(part),
      )
  );
}

export function createStoryboardRunStorage(storyboardRoot: string) {
  const root = resolve(storyboardRoot);
  const runsRoot = join(root, storyboardRunsDirName);
  const jobsDir = join(runsRoot, "jobs");
  const logsDir = join(runsRoot, "logs");
  const provenanceDir = join(runsRoot, "provenance");
  const transientDir = join(runsRoot, "transient");

  function safeStoragePath(relativePath: string) {
    if (!isSafeRelativeStoryboardRunPath(relativePath)) {
      manifestError(
        "path",
        "unsafe_path",
        "expected safe storyboard run relative path",
      );
    }
    const fullPath = assertUnderRoot(root, join(root, relativePath));
    assertNoSymlinkAncestors(root, fullPath);
    return fullPath;
  }

  function jobPath(jobId: string) {
    return safeStoragePath(
      `${storyboardRunsDirName}/jobs/${sanitizePathPart(jobId)}.json`,
    );
  }

  function logPath(jobId: string) {
    return safeStoragePath(
      `${storyboardRunsDirName}/logs/${sanitizePathPart(jobId)}.jsonl`,
    );
  }

  function provenanceRelativePath(
    provenance: Pick<
      Provenance,
      | "storyboardId"
      | "frameKey"
      | "captureSetId"
      | "manifestEntryId"
      | "runnerId"
    > & { outputVariantId?: string; screenSizeId?: string },
  ) {
    const variant =
      provenance.outputVariantId ?? provenance.screenSizeId ?? "default";
    return [
      storyboardRunsDirName,
      "provenance",
      sanitizePathPart(provenance.storyboardId),
      sanitizePathPart(provenance.frameKey),
      sanitizePathPart(provenance.captureSetId),
      sanitizePathPart(variant),
      sanitizePathPart(provenance.manifestEntryId),
      `${sanitizePathPart(provenance.runnerId)}.json`,
    ].join("/");
  }

  function writeJob(job: Run) {
    const normalized: Run = {
      ...job,
      updatedAt: job.updatedAt || new Date().toISOString(),
    };
    atomicWriteUtf8(
      jobPath(normalized.jobId),
      `${JSON.stringify(normalized, null, 2)}\n`,
    );
    return normalized;
  }

  function readJob(jobId: string) {
    return parseJsonFile<Run>(jobPath(jobId));
  }

  function listJobs() {
    if (!existsSync(jobsDir)) return [] as Run[];
    return readdirSync(jobsDir)
      .filter((name) => name.endsWith(".json") && !name.startsWith("."))
      .map((name) => parseJsonFile<Run>(join(jobsDir, name)))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  function appendLog(
    jobId: string,
    record: Omit<RunLogRecordDto, "ts"> & { ts?: string },
  ) {
    const logRecord: RunLogRecordDto = {
      ts: record.ts ?? new Date().toISOString(),
      level: record.level,
      event: record.event,
      ...(record.context ? { context: record.context } : {}),
    };
    mkdirSync(logsDir, { recursive: true });
    appendFileSync(logPath(jobId), `${JSON.stringify(logRecord)}\n`, "utf8");
    return logRecord;
  }

  function readLogs(jobId: string) {
    const pathValue = logPath(jobId);
    if (!existsSync(pathValue)) return [] as RunLogRecordDto[];
    return readFileSync(pathValue, "utf8")
      .split(/\n/u)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RunLogRecordDto);
  }

  function writeProvenance(provenance: Provenance) {
    const relativePath = provenanceRelativePath(provenance);
    const enriched: Provenance = {
      ...provenance,
      key: relativePath
        .slice(`${storyboardRunsDirName}/provenance/`.length)
        .replace(/\.json$/u, ""),
      path: relativePath,
    };
    atomicWriteUtf8(
      safeStoragePath(relativePath),
      `${JSON.stringify(enriched, null, 2)}\n`,
    );
    return enriched;
  }

  function readProvenance(
    identity: Parameters<typeof provenanceRelativePath>[0],
  ) {
    const relativePath = provenanceRelativePath(identity);
    const fullPath = safeStoragePath(relativePath);
    if (!existsSync(fullPath)) return null;
    return parseJsonFile<Provenance>(fullPath);
  }

  function transientArtifactPath(jobId: string, relativeArtifactPath: string) {
    if (!isSafeStoryboardRunServedArtifactPath(relativeArtifactPath)) {
      manifestError(
        "artifact",
        "unsafe_path",
        "expected safe non-dotfile relative artifact path",
      );
    }
    return safeStoragePath(
      `${storyboardRunsDirName}/transient/${sanitizePathPart(jobId)}/${relativeArtifactPath}`,
    );
  }

  function markNonTerminalJobsOnRestart(
    status: RestartRecoveredStatus = "failed",
  ) {
    const recovered: Run[] = [];
    for (const job of listJobs()) {
      if (!nonTerminalStatusSet.has(job.status)) continue;
      const now = new Date().toISOString();
      const updated: Run = {
        ...job,
        status,
        updatedAt: now,
        completedAt: job.completedAt ?? now,
        error:
          status === "failed"
            ? {
                code: "server_restarted",
                message: "Job was non-terminal during access-server restart.",
              }
            : job.error,
      };
      writeJob(updated);
      appendLog(job.jobId, {
        level: "warn",
        event: "job_recovered_on_restart",
        context: { status },
      });
      recovered.push(updated);
    }
    return recovered;
  }

  mkdirSync(jobsDir, { recursive: true });
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(provenanceDir, { recursive: true });
  mkdirSync(transientDir, { recursive: true });

  return {
    root,
    runsRoot,
    jobsDir,
    logsDir,
    provenanceDir,
    transientDir,
    jobPath,
    logPath,
    provenanceRelativePath,
    writeJob,
    readJob,
    listJobs,
    appendLog,
    readLogs,
    writeProvenance,
    readProvenance,
    transientArtifactPath,
    markNonTerminalJobsOnRestart,
  };
}

function allStoryboardFrames(
  storyboard: FreshnessDerivationInput["storyboard"],
) {
  return storyboard.stories.flatMap((story) => [
    ...story.frames.map((frame) => ({ story, frame })),
    ...(story.branches ?? []).flatMap((branch) =>
      branch.frames.map((frame) => ({ story, frame })),
    ),
  ]);
}

function selectorMatches(
  selector: ManifestTargetSelector,
  storyboardId: string,
  storyId: string,
  frameKey: string,
) {
  const wildcard = (pattern: string | undefined, value: string) => {
    if (pattern === undefined) return true;
    const escaped = pattern
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/gu, "\\$&"))
      .join(".*");
    return new RegExp(`^${escaped}$`, "u").test(value);
  };
  return (
    (selector.storyboardId === undefined ||
      selector.storyboardId === storyboardId) &&
    (selector.storyId === undefined || selector.storyId === storyId) &&
    (selector.frameKey === undefined || selector.frameKey === frameKey) &&
    wildcard(selector.storyPattern, storyId) &&
    wildcard(selector.framePattern, frameKey)
  );
}

function renderOutputPath(
  template: string,
  values: Record<string, string | undefined>,
) {
  return template.replace(
    /\{([a-zA-Z0-9_.:-]+)\}/gu,
    (_match, key: string) => values[key] ?? "",
  );
}

function entryRequiresRuntimeTarget(runner: Runner | undefined, entry: ManifestEntry) {
  return runner?.kind === "browser" && entry.modes.some((mode) => mode === "run-to-state" || mode === "run-and-capture");
}

function automationDriverCommand(runner: Runner) {
  if (runner.kind === "browser") return "agent-browser run-to-state";
  if (runner.kind === "dry-run") return "dry-run";
  return `${runner.kind}:${runner.id} run-to-state`;
}

function manifestEntryAutomationDriver(
  manifest: StoryboardRunManifest,
  entry: ManifestEntry,
  target: AutomationDriver["stateTarget"],
  runtimeTarget?: RuntimeTarget,
  disabledReason: string | null = null,
): AutomationDriver | undefined {
  const runner = manifest.runners.find((candidate) => candidate.id === entry.runnerId);
  if (!runner) return undefined;
  const supportsRunToState = runner.enabled && entry.enabled && runner.capabilities.includes("run-to-state");
  const missingRuntime = entryRequiresRuntimeTarget(runner, entry) && !runtimeTarget;
  const automationDisabledReason = disabledReason ?? (supportsRunToState && !missingRuntime ? null : `missing automation driver: ${entry.id}`);
  const scriptId = entry.scriptId ?? entry.id;
  const stepParts = [scriptId, target.storyId, target.frameKey, target.captureSetId, target.outputVariantId].filter(Boolean);
  return {
    runnerId: runner.id,
    runnerKind: runner.kind,
    manifestEntryId: entry.id,
    scriptId,
    stepId: stepParts.join("::"),
    command: automationDriverCommand(runner),
    fullyAutomated: supportsRunToState && !missingRuntime && !automationDisabledReason,
    stateTarget: target,
    disabledReason: automationDisabledReason,
  };
}

function storyboardFrameOutputAsset(
  frame: Record<string, unknown>,
  captureSetId: string,
  outputVariantId: string | undefined,
  screenSizeId?: string,
) {
  const captureSets = frame.captureSets;
  if (!captureSets || typeof captureSets !== "object" || Array.isArray(captureSets)) return undefined;
  const captureSet = (captureSets as Record<string, unknown>)[captureSetId];
  if (!captureSet || typeof captureSet !== "object" || Array.isArray(captureSet)) return undefined;
  const screenshots = (captureSet as Record<string, unknown>).screenshots;
  if (!screenshots || typeof screenshots !== "object" || Array.isArray(screenshots)) return undefined;
  const variants = screenshots as Record<string, unknown>;
  const candidate =
    variants[screenSizeId ?? ""] ??
    variants[outputVariantId ?? ""] ??
    variants.desktop ??
    variants.mobile ??
    variants.square;
  return typeof candidate === "string" && candidate.trim() ? candidate : undefined;
}

function documentRuntimeTarget(
  storyboard: Record<string, unknown>,
  captureSetId: string,
  outputVariantId: string | undefined,
): RuntimeTarget | undefined {
  const runTargetToRuntimeTarget = (
    runTarget: unknown,
    id: string,
    label: string,
  ): RuntimeTarget | undefined => {
    if (!runTarget || typeof runTarget !== "object" || Array.isArray(runTarget)) return undefined;
    const kind = (runTarget as Record<string, unknown>).kind;
    const url = (runTarget as Record<string, unknown>).url;
    if (kind !== "web" || typeof url !== "string" || url.trim().length === 0) return undefined;
    return { id, label, appUrl: url.trim() };
  };
  const captureSets = storyboard.captureSets;
  if (captureSets && typeof captureSets === "object" && !Array.isArray(captureSets)) {
    const captureSet = (captureSets as Record<string, unknown>)[captureSetId];
    if (captureSet && typeof captureSet === "object" && !Array.isArray(captureSet)) {
      const sizes = (captureSet as Record<string, unknown>).sizes;
      if (sizes && typeof sizes === "object" && !Array.isArray(sizes)) {
        const size = (sizes as Record<string, unknown>)[outputVariantId ?? "desktop"];
        if (size && typeof size === "object" && !Array.isArray(size)) {
          const sizeTarget = runTargetToRuntimeTarget(
            (size as Record<string, unknown>).runTarget,
            `storyboard:${captureSetId}:${outputVariantId ?? "desktop"}`,
            `${captureSetId} ${outputVariantId ?? "desktop"} web`,
          );
          if (sizeTarget) return sizeTarget;
        }
      }
    }
  }
  return runTargetToRuntimeTarget(
    storyboard.runTarget,
    "storyboard:default",
    "Storyboard default web",
  );
}

export function resolveStoryboardDocumentRuntimeTarget(
  storyboard: Record<string, unknown>,
  captureSetId: string,
  outputVariantId: string | undefined,
  fallback?: RuntimeTarget,
): RuntimeTarget | undefined {
  const documentTarget = documentRuntimeTarget(storyboard, captureSetId, outputVariantId);
  if (!documentTarget) return fallback;
  if (!fallback) return documentTarget;
  return {
    ...fallback,
    id: documentTarget.id,
    label: documentTarget.label,
    configuredRunTargetUrl: documentTarget.appUrl,
  };
}

export function augmentManifestWithStoryboardDocumentRuntimeTargets(
  manifest: StoryboardRunManifest,
  storyboard: Record<string, unknown>,
): StoryboardRunManifest {
  return {
    ...manifest,
    entries: manifest.entries.map((entry) => ({
      ...entry,
      runtimeTarget:
        entry.captureSets
          .map((captureSetId) =>
            resolveStoryboardDocumentRuntimeTarget(storyboard, captureSetId, "desktop", entry.runtimeTarget) ??
            resolveStoryboardDocumentRuntimeTarget(storyboard, captureSetId, "mobile", entry.runtimeTarget) ??
            resolveStoryboardDocumentRuntimeTarget(storyboard, captureSetId, "square", entry.runtimeTarget),
          )
          .find((target): target is RuntimeTarget => !!target) ??
        entry.runtimeTarget,
    })),
  };
}

export function deriveStoryboardRunFreshness(
  input: FreshnessDerivationInput,
): FrameRunStateDto {
  const storyboardId = input.storyboard.id;
  const match = allStoryboardFrames(input.storyboard).find(
    ({ story, frame }) =>
      story.id === input.storyId && frame.id === input.frameKey,
  );
  const storage = createStoryboardRunStorage(input.storyboardRoot);
  if (!input.manifest?.enabled || !match) {
    return {
      storyboardId,
      storyId: input.storyId,
      frameKey: input.frameKey,
      freshness: "not-runnable",
      runnable: false,
      disabledReason: !input.manifest?.enabled
        ? "run_api_disabled"
        : "frame_not_found",
      manifestEntryIds: [],
    };
  }
  const entries = input.manifest.entries.filter(
    (entry) =>
      entry.enabled &&
      (!input.manifestEntryId || entry.id === input.manifestEntryId) &&
      (!input.mode || entry.modes.includes(input.mode)) &&
      entry.targets.some((selector) =>
        selectorMatches(selector, storyboardId, input.storyId, input.frameKey),
      ) &&
      (!input.captureSetId || entry.captureSets.includes(input.captureSetId)),
  );
  if (entries.length === 0) {
    return {
      storyboardId,
      storyId: input.storyId,
      frameKey: input.frameKey,
      freshness: "not-runnable",
      runnable: false,
      disabledReason: "no_manifest_entry",
      manifestEntryIds: [],
    };
  }
  const entry = entries[0];
  const captureSetId = input.captureSetId ?? entry.captureSets[0] ?? "default";
  const outputVariantId =
    input.outputVariantId ?? input.screenSizeId ?? captureSetId;
  const runtimeTarget = resolveStoryboardDocumentRuntimeTarget(
    input.storyboard,
    captureSetId,
    outputVariantId,
    entry.runtimeTarget,
  );
  const runner = input.manifest.runners.find(
    (candidate) => candidate.id === entry.runnerId,
  );
  const driverTarget = {
    storyboardId,
    storyId: input.storyId,
    frameKey: input.frameKey,
    captureSetId,
    outputVariantId,
    mode: input.mode,
  };
  if (!runner) {
    return {
      storyboardId,
      storyId: input.storyId,
      frameKey: input.frameKey,
      freshness: "not-runnable",
      runnable: false,
      disabledReason: `missing automation driver: runner ${entry.runnerId}`,
      manifestEntryIds: entries.map((candidate) => candidate.id),
    };
  }
  if (!runner.capabilities.includes("run-to-state")) {
    return {
      storyboardId,
      storyId: input.storyId,
      frameKey: input.frameKey,
      freshness: "not-runnable",
      runnable: false,
      disabledReason: `missing automation driver: ${entry.id}`,
      manifestEntryIds: entries.map((candidate) => candidate.id),
      automationDriver: manifestEntryAutomationDriver(input.manifest, entry, driverTarget, runtimeTarget, `missing automation driver: ${entry.id}`),
    };
  }
  if (entryRequiresRuntimeTarget(runner, entry) && !runtimeTarget) {
    return {
      storyboardId,
      storyId: input.storyId,
      frameKey: input.frameKey,
      freshness: "not-runnable",
      runnable: false,
      disabledReason: "missing runtime/server config",
      manifestEntryIds: entries.map((candidate) => candidate.id),
      automationDriver: manifestEntryAutomationDriver(input.manifest, entry, driverTarget, runtimeTarget, "missing runtime/server config"),
    };
  }
  const captureSet = input.manifest.captureSets.find(
    (candidate) => candidate.id === captureSetId,
  );
  const frameOutputAsset = storyboardFrameOutputAsset(
    match.frame,
    captureSetId,
    outputVariantId,
    input.screenSizeId,
  );
  const outputAsset = frameOutputAsset ?? (captureSet?.outputPathTemplate
    ? renderOutputPath(captureSet.outputPathTemplate, {
        storyboardId,
        storyId: input.storyId,
        frameKey: input.frameKey,
        captureSetId,
        outputVariantId,
        screenSizeId: input.screenSizeId ?? outputVariantId,
        mode: input.mode,
      })
    : "");
  const outputPath = outputAsset ? join(input.storyboardRoot, outputAsset) : "";
  const outputAssetHash =
    outputPath && existsSync(outputPath) && statSync(outputPath).isFile()
      ? storyboardRunSha256(readFileSync(outputPath))
      : undefined;
  const expected = {
    manifestHash: input.manifestHash ?? hashStoryboardRunJson(input.manifest),
    manifestEntryId: entry.id,
    runnerId: entry.runnerId,
    runnerHash:
      input.runnerHashes?.[entry.runnerId] ??
      (runner ? hashStoryboardRunJson(runner) : undefined),
    appBuildId: input.appBuildId,
    captureSetId,
    captureSetHash: captureSet ? hashStoryboardRunJson(captureSet) : undefined,
    outputVariantId,
    screenSizeId: input.screenSizeId,
    outputAsset,
    outputAssetHash,
    runtimeTarget,
    storyboardSpecHash: hashStoryboardRunJson(input.storyboard),
    frameSpecHash: hashStoryboardRunJson(match.frame),
  };
  const provenance = storage.readProvenance({
    storyboardId,
    frameKey: input.frameKey,
    captureSetId,
    outputVariantId,
    screenSizeId: input.screenSizeId,
    manifestEntryId: entry.id,
    runnerId: entry.runnerId,
  });
  const staleReasons: string[] = [];
  if (!provenance) staleReasons.push("missing provenance");
  if (outputAsset && !outputAssetHash)
    staleReasons.push("output asset missing");
  if (provenance) {
    for (const key of [
      "manifestHash",
      "manifestEntryId",
      "runnerId",
      "runnerHash",
      "appBuildId",
      "captureSetId",
      "captureSetHash",
      "outputVariantId",
      "screenSizeId",
      "outputAsset",
      "outputAssetHash",
      "runtimeTarget",
      "storyboardSpecHash",
      "frameSpecHash",
    ] as const) {
      const provenanceValue = (provenance as Record<string, unknown>)[key];
      const expectedValue = (expected as Record<string, unknown>)[key];
      const matches =
        key === "runtimeTarget"
          ? stableJson(provenanceValue) === stableJson(expectedValue)
          : provenanceValue === expectedValue;
      if (!matches) staleReasons.push(`${key} changed`);
    }
  }
  const latestJob = storage
    .listJobs()
    .filter(
      (job) =>
        job.target.storyboardId === storyboardId &&
        job.target.storyId === input.storyId &&
        job.target.frameKey === input.frameKey &&
        job.manifestEntryId === entry.id &&
        job.captureSetId === captureSetId &&
        (job.outputVariantId ?? job.target.outputVariantId ?? captureSetId) ===
          outputVariantId,
    )
    .at(-1);
  const currentJob =
    latestJob && !terminalRunLifecycleStates.includes(latestJob.status)
      ? {
          jobId: latestJob.jobId,
          status: latestJob.status,
          queuePosition: latestJob.status === "queued" ? 0 : undefined,
        }
      : undefined;
  return {
    storyboardId,
    storyId: input.storyId,
    frameKey: input.frameKey,
    freshness: staleReasons.length === 0 ? "unchanged" : "stale",
    runnable: true,
    disabledReason: null,
    manifestEntryIds: entries.map((candidate) => candidate.id),
    ...(runtimeTarget ? { runtimeTarget } : {}),
    ...(manifestEntryAutomationDriver(input.manifest, entry, driverTarget, runtimeTarget)
      ? { automationDriver: manifestEntryAutomationDriver(input.manifest, entry, driverTarget, runtimeTarget) }
      : {}),
    ...(currentJob ? { currentJob } : {}),
    ...(latestJob
      ? {
          latestJob: {
            jobId: latestJob.jobId,
            status: latestJob.status,
            completedAt: latestJob.completedAt,
          },
        }
      : {}),
    ...(provenance
      ? {
          provenance: {
            ...provenance,
            summary:
              staleReasons.length === 0 ? "unchanged" : staleReasons.join(", "),
          },
        }
      : {}),
  };
}

export type StoryboardRunnerFastHealthResult = {
  ok: boolean;
  status: "ok" | "degraded" | "unavailable";
  elapsedMs: number;
  runnerId: string;
  runnerKind: RunnerKind;
  components: Array<{
    component: string;
    status: "ok" | "warn" | "error";
    elapsedMs: number;
    severity?: "info" | "warn" | "error";
    owner?: "agent" | "human" | "runner" | "system" | string;
    actionTarget?: string;
    humanActionRequired?: boolean;
    nextAction?: string;
  }>;
};

export type StoryboardRunAuditEventDto = {
  ts: string;
  event: string;
  jobId?: string;
  parentJobId?: string;
  context?: Record<string, unknown>;
};

export type StoryboardDryRunQueueOptions = {
  storyboardRoot: string;
  storyboard: FreshnessDerivationInput["storyboard"];
  manifest: StoryboardRunManifest;
  maxActive?: 1;
  now?: () => Date;
  jobIdFactory?: () => string;
  ttlMs?: number;
};

export type StoryboardDryRunEnqueueResult = CreateRunResponseDto & {
  childJobIds?: string[];
};

const redactedPlaceholder = "[REDACTED]";
const redactedKeyPattern = /(?:secret|token|password|passwd|credential|private[-_]?key|api[-_]?key|authorization|cookie)/iu;

function redactStoryboardRunValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactStoryboardRunValue);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = redactedKeyPattern.test(key)
        ? redactedPlaceholder
        : redactStoryboardRunValue(item);
    }
    return result;
  }
  if (typeof value === "string") {
    return value.replace(
      /(bearer\s+)[a-z0-9._~+/=-]+|([?&](?:token|api_key|key|secret|password)=)[^\s&]+/giu,
      (_match, bearerPrefix: string | undefined, queryPrefix: string | undefined) =>
        `${bearerPrefix ?? queryPrefix ?? ""}${redactedPlaceholder}`,
    );
  }
  return value;
}

export function redactStoryboardRunContext<T extends Record<string, unknown>>(
  context: T,
): T {
  return redactStoryboardRunValue(context) as T;
}

export function storyboardDryRunFastHealth(
  runner: Runner,
): StoryboardRunnerFastHealthResult {
  const componentStatus =
    runner.kind === "dry-run" && runner.enabled ? "ok" : "error";
  return {
    ok: componentStatus === "ok",
    status: componentStatus === "ok" ? "ok" : "unavailable",
    elapsedMs: 0,
    runnerId: runner.id,
    runnerKind: runner.kind,
    components: [
      {
        component: "dry-run-runner",
        status: componentStatus,
        elapsedMs: 0,
        severity: componentStatus === "ok" ? "info" : "error",
        owner: "agent",
        actionTarget: "storyboard-runner",
        humanActionRequired: false,
        nextAction:
          componentStatus === "ok"
            ? "run deterministic dry-run job"
            : "enable a dry-run runner in storyboard.run.json",
      },
    ],
  };
}

function terminalAgeMs(job: Run, now: Date) {
  const timestamp = job.completedAt ?? job.updatedAt ?? job.createdAt;
  return now.getTime() - new Date(timestamp).getTime();
}

function runnableFramesForRequest(
  storyboard: FreshnessDerivationInput["storyboard"],
  request: CreateRunRequestDto,
) {
  const storyboardId = request.target.storyboardId ?? storyboard.id;
  return allStoryboardFrames(storyboard)
    .filter(({ story, frame }) => {
      if (request.scope === "frame") {
        return story.id === request.target.storyId && frame.id === request.target.frameKey;
      }
      if (request.scope === "story") {
        return story.id === request.target.storyId;
      }
      return true;
    })
    .map(({ story, frame }) => ({ storyboardId, storyId: story.id, frame }));
}

function runnerForRequest(manifest: StoryboardRunManifest, request: Pick<CreateRunRequestDto, "manifestEntryId"> | Run) {
  const entry = manifest.entries.find((candidate) => candidate.id === request.manifestEntryId);
  const runner = entry
    ? manifest.runners.find((candidate) => candidate.id === entry.runnerId)
    : undefined;
  if (!entry || !runner) {
    manifestError("request.manifestEntryId", "manifest_entry_not_found", "Manifest entry is not enabled for this target.");
  }
  return { entry, runner };
}

export function createStoryboardDryRunQueue(options: StoryboardDryRunQueueOptions) {
  const storage = createStoryboardRunStorage(options.storyboardRoot);
  const maxActive = 1;
  const ttlMs = options.ttlMs ?? 15 * 60 * 1000;
  const now = () => (options.now ? options.now() : new Date());
  const jobIdFactory = options.jobIdFactory ?? generateStoryboardRunJobId;
  const active = new Set<string>();

  function stamp() {
    return now().toISOString();
  }

  function appendAudit(record: Omit<StoryboardRunAuditEventDto, "ts"> & { ts?: string }) {
    const auditRecord: StoryboardRunAuditEventDto = {
      ts: record.ts ?? stamp(),
      event: record.event,
      ...(record.jobId ? { jobId: record.jobId } : {}),
      ...(record.parentJobId ? { parentJobId: record.parentJobId } : {}),
      ...(record.context ? { context: redactStoryboardRunContext(record.context) } : {}),
    };
    mkdirSync(join(storage.runsRoot, "audit"), { recursive: true });
    appendFileSync(
      join(storage.runsRoot, "audit", "events.jsonl"),
      `${JSON.stringify(auditRecord)}\n`,
      "utf8",
    );
    return auditRecord;
  }

  function readAudit() {
    const pathValue = join(storage.runsRoot, "audit", "events.jsonl");
    if (!existsSync(pathValue)) return [] as StoryboardRunAuditEventDto[];
    return readFileSync(pathValue, "utf8")
      .split(/\n/u)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as StoryboardRunAuditEventDto);
  }

  function writeJob(job: Run) {
    return storage.writeJob({ ...job, updatedAt: stamp() });
  }

  function log(jobId: string, event: string, context?: Record<string, unknown>, level: RunLogRecordDto["level"] = "info") {
    return storage.appendLog(jobId, {
      ts: stamp(),
      level,
      event,
      ...(context ? { context: redactStoryboardRunContext(context) } : {}),
    });
  }

  function queuePosition(jobId: string) {
    return storage
      .listJobs()
      .filter((job) => job.status === "queued")
      .findIndex((job) => job.jobId === jobId);
  }

  function removeTransient(jobId: string) {
    rmSync(join(storage.transientDir, sanitizePathPart(jobId)), {
      recursive: true,
      force: true,
    });
  }

  function transition(job: Run, status: RunLifecycleStatus, extra: Partial<Run> = {}) {
    const terminal = terminalRunLifecycleStates.includes(status);
    const updated = writeJob({
      ...job,
      ...extra,
      status,
      ...(status === "running" || status === "capturing" ? { startedAt: job.startedAt ?? stamp() } : {}),
      ...(terminal ? { completedAt: extra.completedAt ?? job.completedAt ?? stamp() } : {}),
    });
    log(job.jobId, `job_${status}`, { status });
    appendAudit({ event: `job_${status}`, jobId: job.jobId, context: { status } });
    if (terminal) {
      active.delete(job.jobId);
      if (status === "cancelled" || status === "expired") removeTransient(job.jobId);
    }
    return updated;
  }

  function outputForJob(job: Run) {
    const captureSet = options.manifest.captureSets.find(
      (candidate) => candidate.id === job.captureSetId,
    );
    const outputVariantId = job.outputVariantId ?? job.screenSizeId ?? job.captureSetId ?? "default";
    const outputAsset = captureSet?.outputPathTemplate
      ? renderOutputPath(captureSet.outputPathTemplate, {
          storyboardId: job.target.storyboardId ?? options.storyboard.id,
          storyId: job.target.storyId,
          frameKey: job.target.frameKey,
          captureSetId: job.captureSetId,
          outputVariantId,
          screenSizeId: job.screenSizeId ?? outputVariantId,
          mode: job.mode,
        })
      : "";
    return { captureSet, outputVariantId, outputAsset };
  }

  function writeCaptureArtifacts(job: Run) {
    const { entry, runner } = runnerForRequest(options.manifest, job);
    const { captureSet, outputVariantId, outputAsset } = outputForJob(job);
    if (!job.target.frameKey || !job.captureSetId || !captureSet || !outputAsset) return job;
    const outputPath = join(options.storyboardRoot, outputAsset);
    const assetBody = `dry-run:${job.jobId}:${job.target.storyboardId ?? options.storyboard.id}:${job.target.storyId}:${job.target.frameKey}:${job.captureSetId}:${outputVariantId}:${job.mode}\n`;
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, assetBody, "utf8");
    const frame = allStoryboardFrames(options.storyboard).find(
      (candidate) =>
        candidate.story.id === job.target.storyId && candidate.frame.id === job.target.frameKey,
    )?.frame;
    const provenance = storage.writeProvenance({
      storyboardId: job.target.storyboardId ?? options.storyboard.id,
      frameKey: job.target.frameKey,
      manifestHash: hashStoryboardRunJson(options.manifest),
      manifestEntryId: entry.id,
      runnerId: runner.id,
      runnerHash: hashStoryboardRunJson(runner),
      captureSetId: job.captureSetId,
      captureSetHash: hashStoryboardRunJson(captureSet),
      outputVariantId,
      screenSizeId: job.screenSizeId,
      storyboardSpecHash: hashStoryboardRunJson(options.storyboard),
      frameSpecHash: hashStoryboardRunJson(frame ?? { id: job.target.frameKey }),
      outputAsset,
      outputAssetHash: storyboardRunSha256(assetBody),
      ...(entry.runtimeTarget ? { runtimeTarget: entry.runtimeTarget } : {}),
      completedAt: stamp(),
    });
    log(job.jobId, "provenance_written", {
      path: provenance.path,
      token: "must-not-leak",
    });
    return writeJob({ ...job, provenanceWrites: [...job.provenanceWrites, provenance.path ?? provenance.key ?? ""] });
  }

  function runLeafJob(job: Run) {
    const { runner } = runnerForRequest(options.manifest, job);
    const health = storyboardDryRunFastHealth(runner);
    log(job.jobId, "runner_fast_health", { health });
    appendAudit({ event: "runner_fast_health", jobId: job.jobId, context: { health } });
    if (!health.ok) {
      return transition(job, "failed", {
        error: { code: "runner_unavailable", message: "Dry-run runner fast health failed." },
      });
    }
    let current = transition(job, "running");
    if (job.mode === "capture" || job.mode === "run-and-capture") {
      current = transition(current, "capturing");
      current = writeCaptureArtifacts(current);
    }
    return transition(current, "succeeded");
  }

  function maybeCompleteParent(parent: Run) {
    const children = storage.listJobs().filter(
      (job) => (job.params.parentJobId as string | undefined) === parent.jobId,
    );
    if (children.length === 0) return parent;
    if (!children.every((child) => terminalRunLifecycleStates.includes(child.status))) {
      return parent;
    }
    const failed = children.find((child) => child.status === "failed");
    const cancelled = children.find((child) => child.status === "cancelled");
    if (failed || cancelled) {
      return transition(parent, failed ? "failed" : "cancelled", {
        error: failed?.error ?? cancelled?.error,
        progress: {
          completedFrames: children.filter((child) => child.status === "succeeded").length,
          totalFrames: children.length,
        },
      });
    }
    return transition(parent, "succeeded", {
      progress: { completedFrames: children.length, totalFrames: children.length },
    });
  }

  function processNext() {
    if (active.size >= maxActive) return null;
    const next = storage.listJobs().find((job) => job.status === "queued");
    if (!next) return null;
    active.add(next.jobId);
    const completed = runLeafJob(next);
    const parentId = completed.params.parentJobId as string | undefined;
    if (parentId) {
      maybeCompleteParent(storage.readJob(parentId));
    }
    return completed;
  }

  function drain() {
    const completed: Run[] = [];
    while (active.size < maxActive) {
      const result = processNext();
      if (!result) break;
      completed.push(result);
    }
    return completed;
  }

  function createJob(request: CreateRunRequestDto, status: RunLifecycleStatus, parentJobId?: string): Run {
    const createdAt = stamp();
    return {
      jobId: jobIdFactory(),
      scope: request.scope,
      mode: request.mode,
      status,
      target: {
        ...request.target,
        storyboardId: request.target.storyboardId ?? options.storyboard.id,
        outputVariantId: request.outputVariantId ?? request.target.outputVariantId,
        screenSizeId: request.screenSizeId ?? request.target.screenSizeId,
      },
      manifestEntryId: request.manifestEntryId,
      captureSetId: request.captureSetId,
      outputVariantId: request.outputVariantId ?? request.target.outputVariantId,
      screenSizeId: request.screenSizeId ?? request.target.screenSizeId,
      createdAt,
      updatedAt: createdAt,
      params: parentJobId ? { ...(request.params ?? {}), parentJobId } : (request.params ?? {}),
      provenanceWrites: [],
    };
  }

  function enqueue(request: CreateRunRequestDto): StoryboardDryRunEnqueueResult {
    runnerForRequest(options.manifest, request);
    if (request.scope === "frame") {
      const job = storage.writeJob(createJob(request, "queued"));
      log(job.jobId, "job_queued", { request, authorization: "Bearer should-redact" });
      appendAudit({ event: "job_queued", jobId: job.jobId, context: { request } });
      return {
        jobId: job.jobId,
        status: "queued",
        queuePosition: Math.max(queuePosition(job.jobId), 0),
        links: {
          job: `/api/storyboard/runs/${job.jobId}`,
          logs: `/api/storyboard/runs/${job.jobId}/logs`,
          cancel: `/api/storyboard/runs/${job.jobId}/cancel`,
        },
      };
    }
    const parent = storage.writeJob(createJob(request, "running"));
    log(parent.jobId, "parent_job_running", { scope: request.scope });
    appendAudit({ event: "parent_job_running", jobId: parent.jobId, context: { scope: request.scope } });
    const frames = runnableFramesForRequest(options.storyboard, request);
    if (frames.length === 0) {
      transition(parent, "skipped", {
        error: { code: "no_matching_frames", message: "No frames matched the parent run target." },
      });
      return {
        jobId: parent.jobId,
        status: "queued",
        queuePosition: 0,
        childJobIds: [],
        links: {
          job: `/api/storyboard/runs/${parent.jobId}`,
          logs: `/api/storyboard/runs/${parent.jobId}/logs`,
          cancel: `/api/storyboard/runs/${parent.jobId}/cancel`,
        },
      };
    }
    const childJobIds = frames.map(({ storyboardId, storyId, frame }) => {
      const child = storage.writeJob(
        createJob(
          {
            ...request,
            scope: "frame",
            target: {
              ...request.target,
              storyboardId,
              storyId,
              frameKey: frame.id,
            },
          },
          "pending",
          parent.jobId,
        ),
      );
      log(child.jobId, "child_job_pending", { parentJobId: parent.jobId });
      appendAudit({ event: "child_job_pending", jobId: child.jobId, parentJobId: parent.jobId });
      return child.jobId;
    });
    for (const childId of childJobIds) {
      const child = storage.readJob(childId);
      transition(child, "queued", {
        progress: { currentFrameKey: child.target.frameKey },
      });
    }
    return {
      jobId: parent.jobId,
      status: "queued",
      queuePosition: 0,
      childJobIds,
      links: {
        job: `/api/storyboard/runs/${parent.jobId}`,
        logs: `/api/storyboard/runs/${parent.jobId}/logs`,
        cancel: `/api/storyboard/runs/${parent.jobId}/cancel`,
      },
    };
  }

  function cancel(jobId: string, reason = "cancelled") {
    const job = storage.readJob(jobId);
    if (terminalRunLifecycleStates.includes(job.status)) {
      if (job.status === "cancelled") {
        return { jobId, status: "cancelled", cancelledAt: job.completedAt ?? stamp() } as CancelRunResponseDto;
      }
      manifestError("job", "job_terminal", "terminal jobs cannot be cancelled");
    }
    const cancelled = transition(job, "cancelled", {
      error: { code: "cancelled", message: reason },
    });
    for (const child of storage.listJobs().filter((candidate) => (candidate.params.parentJobId as string | undefined) === jobId)) {
      if (!terminalRunLifecycleStates.includes(child.status)) {
        transition(child, "cancelled", { error: { code: "parent_cancelled", message: reason } });
      }
    }
    appendAudit({ event: "job_cancel_requested", jobId, context: { reason } });
    return { jobId, status: "cancelled", cancelledAt: cancelled.completedAt ?? stamp() } as CancelRunResponseDto;
  }

  function cleanupExpired(nowOverride = now()) {
    const expired: Run[] = [];
    for (const job of storage.listJobs()) {
      if (terminalRunLifecycleStates.includes(job.status)) {
        if (terminalAgeMs(job, nowOverride) > ttlMs) removeTransient(job.jobId);
        continue;
      }
      if (terminalAgeMs(job, nowOverride) <= ttlMs) continue;
      expired.push(transition(job, "expired", {
        error: { code: "ttl_expired", message: "Job expired before completion." },
      }));
    }
    if (expired.length > 0) {
      appendAudit({ event: "ttl_cleanup", context: { expiredJobIds: expired.map((job) => job.jobId) } });
    }
    return expired;
  }

  function state() {
    const jobs = storage.listJobs();
    return {
      maxActive,
      active: jobs.filter((job) => job.status === "running" || job.status === "capturing").length,
      queued: jobs.filter((job) => job.status === "queued").length,
      jobs,
    };
  }

  return {
    storage,
    enqueue,
    drain,
    processNext,
    cancel,
    cleanupExpired,
    state,
    readAudit,
  };
}
