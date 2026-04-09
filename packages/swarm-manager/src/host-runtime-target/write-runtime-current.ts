import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import {
  DEFAULT_BOOTSTRAP_CONTEXT_PATH,
  DEFAULT_RUNTIME_TARGET_PATH,
} from "../paths.js"

type RuntimeTarget = {
  role?: string
  runtimeSource?: {
    refKind?: string
    ref?: string
  }
}

type BootstrapContext = {
  runtimeRepoRef?: string
}

type WriteRuntimeCurrentOptions = {
  runtimeDir: string
  stateDir: string
  requestedRole: string
  runtimeTargetPath?: string
  bootstrapContextPath?: string
  setupStatus: "succeeded" | "failed" | "mismatched"
  setupExitCode?: number
  mismatchSummary?: string
}

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) {
    return null
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as T
  } catch {
    return null
  }
}

function commandOutput(command: string[], cwd?: string): string {
  const result = Bun.spawnSync(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  })

  if (result.exitCode !== 0) {
    return ""
  }

  return result.stdout.toString("utf8").trim()
}

export function writeResolvedRuntimeState(
  options: WriteRuntimeCurrentOptions,
): void {
  const observedAt = new Date().toISOString()
  const runtimeTarget = readJsonFile<RuntimeTarget>(
    options.runtimeTargetPath ?? DEFAULT_RUNTIME_TARGET_PATH,
  )
  const bootstrapContext = readJsonFile<BootstrapContext>(
    options.bootstrapContextPath ?? DEFAULT_BOOTSTRAP_CONTEXT_PATH,
  )
  const requestedRefKind =
    runtimeTarget?.runtimeSource?.refKind?.trim() || "branch"
  const requestedRef =
    runtimeTarget?.runtimeSource?.ref?.trim() ||
    bootstrapContext?.runtimeRepoRef?.trim() ||
    "development"
  const materializedRevision =
    commandOutput(["git", "rev-parse", "HEAD"], options.runtimeDir) || "unknown"
  const contentsDigest =
    commandOutput(["git", "rev-parse", "HEAD^{tree}"], options.runtimeDir) ||
    undefined
  const record = {
    observedAt,
    materializationTransport: "git",
    requestedRole: runtimeTarget?.role?.trim() || options.requestedRole,
    requestedRefKind,
    requestedRef,
    materializedRevision,
    ...(contentsDigest ? { contentsDigest } : {}),
    setupStatus: options.setupStatus,
    ...(typeof options.setupExitCode === "number"
      ? { setupExitCode: options.setupExitCode }
      : {}),
    setupObservedAt: observedAt,
    ...(options.mismatchSummary
      ? { mismatchSummary: options.mismatchSummary }
      : {}),
  }
  const resolvedRuntimeStatePath = `${options.stateDir}/runtime-current.json`
  mkdirSync(dirname(resolvedRuntimeStatePath), { recursive: true })
  writeFileSync(
    resolvedRuntimeStatePath,
    `${JSON.stringify(record, null, 2)}\n`,
    { mode: 0o600 },
  )
}
