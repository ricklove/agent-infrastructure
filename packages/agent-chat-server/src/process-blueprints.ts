import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"

export type ProcessStepBundle = {
  id: string
  title: string | null
  steps: ProcessBlueprintStep[]
}

export type ProcessBlueprintDecisionOption = {
  id: string
  title: string
  goto: string | null
  next: boolean
  block: boolean
  complete: boolean
  steps: ProcessBlueprintStep[]
}

export type ProcessBlueprintStep = {
  id: string
  title: string
  kind: "task" | "wait" | "decision"
  doneToken: string | null
  blockedToken: string | null
  steps: ProcessBlueprintStep[]
  decision: {
    prompt: string
    options: ProcessBlueprintDecisionOption[]
  } | null
}

type BaseProcessBlueprint = {
  id: string
  title: string
  catalogOrder: number
  expectation: string
  companionPath: string | null
}

export type ModeProcessBlueprint = BaseProcessBlueprint & {
  kind: "mode"
}

export type ProceduralProcessBlueprint = BaseProcessBlueprint & {
  kind: "procedural"
  idlePrompt: string
  completionMode: "exact_reply"
  completionToken: string
  blockedToken: string
  stopConditions: string[]
  steps: ProcessBlueprintStep[]
  watchdog: {
    enabled: boolean
    idleTimeoutSeconds: number
    maxNudgesPerIdleEpisode: number
  }
}

export type ProcessBlueprint = ModeProcessBlueprint | ProceduralProcessBlueprint

type RawProcessBlueprintDecisionOption = {
  id?: unknown
  title?: unknown
  goto?: unknown
  next?: unknown
  block?: unknown
  complete?: unknown
  steps?: unknown
}

type RawProcessBlueprintStep = {
  use?: unknown
  id?: unknown
  title?: unknown
  kind?: unknown
  doneToken?: unknown
  blockedToken?: unknown
  steps?: unknown
  decision?: {
    prompt?: unknown
    options?: unknown
  }
}

type RawProcessStepBundle = {
  id?: unknown
  title?: unknown
  steps?: unknown
}

type RawProcessBlueprint = {
  id?: unknown
  title?: unknown
  catalogOrder?: unknown
  expectation?: unknown
  template?: unknown
  variables?: unknown
  idlePrompt?: unknown
  completionMode?: unknown
  completionToken?: unknown
  blockedToken?: unknown
  stopConditions?: unknown
  steps?: unknown
  watchdog?: {
    enabled?: unknown
    idleTimeoutSeconds?: unknown
    maxNudgesPerIdleEpisode?: unknown
  }
}

type RawProcessTemplate = {
  id?: unknown
  title?: unknown
  variables?: unknown
  blueprint?: unknown
}

export type ProcessBlueprintCatalogLoadOptions = {
  processBlueprintDirs?: string[]
  processTemplateDirs?: string[]
  processStepDirs?: string[]
}

function defaultBlueprintsDir() {
  return resolve(import.meta.dir, "../../../blueprints/process-blueprints")
}

function defaultProcessTemplatesDir() {
  return resolve(import.meta.dir, "../../../blueprints/process-templates")
}

function defaultProcessStepsDir() {
  return resolve(import.meta.dir, "../../../blueprints/process-steps")
}

function normalizeDirectoryList(
  dirs: string[] | undefined,
  fallbackDir: string,
) {
  const resolved = (dirs ?? [fallbackDir])
    .map((value) => value.trim())
    .filter(Boolean)
  if (resolved.length === 0) {
    resolved.push(fallbackDir)
  }
  return [...new Set(resolved)]
}

function normalizeProcessStepBundles(processStepDirs?: string[]) {
  const stepsDirs = normalizeDirectoryList(
    processStepDirs,
    defaultProcessStepsDir(),
  )
  const bundleMap = new Map<string, RawProcessStepBundle>()

  for (const stepsDir of stepsDirs) {
    if (!existsSync(stepsDir)) {
      continue
    }

    for (const entry of readdirSync(stepsDir).sort()) {
      if (!entry.endsWith(".process-steps.json")) {
        continue
      }
      const path = join(stepsDir, entry)
      const raw = JSON.parse(readFileSync(path, "utf8")) as RawProcessStepBundle
      const id = typeof raw.id === "string" ? raw.id.trim() : ""
      if (!id) {
        throw new Error(`Invalid process step bundle: ${path}`)
      }
      bundleMap.set(id, raw)
    }
  }

  return bundleMap
}

function loadRawProcessBlueprints(processBlueprintDirs?: string[]) {
  const blueprintDirs = normalizeDirectoryList(
    processBlueprintDirs,
    defaultBlueprintsDir(),
  )
  const blueprintMap = new Map<
    string,
    { raw: RawProcessBlueprint; path: string }
  >()

  for (const processBlueprintDir of blueprintDirs) {
    if (!existsSync(processBlueprintDir)) {
      continue
    }

    for (const entry of readdirSync(processBlueprintDir).sort()) {
      if (!entry.endsWith(".process-blueprint.json")) {
        continue
      }
      const path = join(processBlueprintDir, entry)
      const raw = JSON.parse(readFileSync(path, "utf8")) as RawProcessBlueprint
      const id = typeof raw.id === "string" ? raw.id.trim() : ""
      if (!id) {
        throw new Error(`Invalid process blueprint: ${path}`)
      }
      blueprintMap.set(id, { raw, path })
    }
  }

  return [...blueprintMap.values()]
}

function loadRawProcessTemplates(processTemplateDirs?: string[]) {
  const templateDirs = normalizeDirectoryList(
    processTemplateDirs,
    defaultProcessTemplatesDir(),
  )
  const templateMap = new Map<string, { raw: RawProcessTemplate; path: string }>()

  for (const processTemplateDir of templateDirs) {
    if (!existsSync(processTemplateDir)) {
      continue
    }

    for (const entry of readdirSync(processTemplateDir).sort()) {
      if (!entry.endsWith(".process-template.json")) {
        continue
      }
      const path = join(processTemplateDir, entry)
      const raw = JSON.parse(readFileSync(path, "utf8")) as RawProcessTemplate
      const id = typeof raw.id === "string" ? raw.id.trim() : ""
      if (!id) {
        throw new Error(`Invalid process template: ${path}`)
      }
      templateMap.set(id, { raw, path })
    }
  }

  return templateMap
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function deepMerge<T>(base: T, overlay: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(overlay)) {
    return (overlay as T) ?? base
  }

  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    const current = merged[key]
    if (isPlainObject(current) && isPlainObject(value)) {
      merged[key] = deepMerge(current, value)
      continue
    }
    merged[key] = value
  }
  return merged as T
}

function normalizeTemplateVariables(rawVariables: unknown, contextPath: string) {
  if (!isPlainObject(rawVariables)) {
    return new Map<string, string>()
  }

  const variables = new Map<string, string>()
  for (const [key, value] of Object.entries(rawVariables)) {
    const normalizedKey = key.trim()
    const normalizedValue = typeof value === "string" ? value.trim() : ""
    if (!normalizedKey || !normalizedValue) {
      throw new Error(`Invalid process template variable in ${contextPath}`)
    }
    variables.set(normalizedKey, normalizedValue)
  }
  return variables
}

function substituteTemplateVariables<T>(
  value: T,
  variables: Map<string, string>,
  contextPath: string,
): T {
  if (typeof value === "string") {
    return value.replace(/\{\{([a-zA-Z0-9_]+)\}\}/gu, (_match, key) => {
      const replacement = variables.get(key)
      if (!replacement) {
        throw new Error(
          `Missing process template variable '${key}' in ${contextPath}`,
        )
      }
      return replacement
    }) as T
  }

  if (Array.isArray(value)) {
    return value.map((entry) =>
      substituteTemplateVariables(entry, variables, contextPath),
    ) as T
  }

  if (isPlainObject(value)) {
    const substitutedEntries = Object.entries(value).map(([key, entry]) => [
      key,
      substituteTemplateVariables(entry, variables, contextPath),
    ])
    return Object.fromEntries(substitutedEntries) as T
  }

  return value
}

function normalizeRequiredTemplateVariableNames(
  rawTemplate: RawProcessTemplate,
  templatePath: string,
) {
  if (rawTemplate.variables === undefined) {
    return []
  }
  if (!Array.isArray(rawTemplate.variables)) {
    throw new Error(`Invalid process template variables: ${templatePath}`)
  }
  return rawTemplate.variables
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
}

function resolveTemplateBlueprint(
  raw: RawProcessBlueprint,
  jsonPath: string,
  templates: Map<string, { raw: RawProcessTemplate; path: string }>,
) {
  const templateId =
    typeof raw.template === "string" ? raw.template.trim() : ""
  if (!templateId) {
    return raw
  }

  const templateEntry = templates.get(templateId)
  if (!templateEntry) {
    throw new Error(`Unknown process template: ${templateId}`)
  }
  if (!isPlainObject(templateEntry.raw.blueprint)) {
    throw new Error(`Invalid process template blueprint: ${templateEntry.path}`)
  }

  const requiredVariables = normalizeRequiredTemplateVariableNames(
    templateEntry.raw,
    templateEntry.path,
  )
  const variables = normalizeTemplateVariables(raw.variables, jsonPath)
  for (const variableName of requiredVariables) {
    if (!variables.has(variableName)) {
      throw new Error(
        `Missing required process template variable '${variableName}' in ${jsonPath}`,
      )
    }
  }

  const instantiatedTemplate = substituteTemplateVariables(
    templateEntry.raw.blueprint,
    variables,
    templateEntry.path,
  ) as RawProcessBlueprint
  const instanceOverrides = { ...raw }
  delete instanceOverrides.template
  delete instanceOverrides.variables

  return substituteTemplateVariables(
    deepMerge(instantiatedTemplate, instanceOverrides),
    variables,
    jsonPath,
  )
}

function normalizeProcessBlueprintDecisionOptions(
  rawOptions: unknown,
  bundles: Map<string, RawProcessStepBundle>,
  importStack: string[] = [],
): ProcessBlueprintDecisionOption[] {
  if (!Array.isArray(rawOptions)) {
    return []
  }

  return rawOptions
    .map((entry) => {
      const raw = entry as RawProcessBlueprintDecisionOption
      const id = typeof raw.id === "string" ? raw.id.trim() : ""
      const title = typeof raw.title === "string" ? raw.title.trim() : ""
      if (!id || !title) {
        return null
      }
      return {
        id,
        title,
        goto:
          typeof raw.goto === "string" && raw.goto.trim()
            ? raw.goto.trim()
            : null,
        next: raw.next === true,
        block: raw.block === true,
        complete: raw.complete === true,
        steps: normalizeProcessBlueprintSteps(raw.steps, bundles, importStack),
      } satisfies ProcessBlueprintDecisionOption
    })
    .filter((entry): entry is ProcessBlueprintDecisionOption => entry !== null)
}

function normalizeProcessBlueprintSteps(
  rawSteps: unknown,
  bundles: Map<string, RawProcessStepBundle>,
  importStack: string[] = [],
): ProcessBlueprintStep[] {
  if (!Array.isArray(rawSteps)) {
    return []
  }

  return rawSteps
    .flatMap((entry) => {
      const raw = entry as RawProcessBlueprintStep
      const use = typeof raw.use === "string" ? raw.use.trim() : ""
      if (use) {
        const bundle = bundles.get(use)
        if (!bundle) {
          throw new Error(`Unknown process step bundle: ${use}`)
        }
        if (importStack.includes(use)) {
          throw new Error(
            `Circular process step bundle import: ${[...importStack, use].join(" -> ")}`,
          )
        }
        return normalizeProcessBlueprintSteps(bundle.steps, bundles, [
          ...importStack,
          use,
        ])
      }

      const id = typeof raw.id === "string" ? raw.id.trim() : ""
      const title = typeof raw.title === "string" ? raw.title.trim() : ""
      if (!id || !title) {
        return []
      }
      const kind =
        raw.kind === "wait" || raw.kind === "decision" ? raw.kind : "task"
      const decision =
        kind === "decision" && raw.decision && typeof raw.decision === "object"
          ? {
              prompt:
                typeof raw.decision.prompt === "string" &&
                raw.decision.prompt.trim()
                  ? raw.decision.prompt.trim()
                  : title,
              options: normalizeProcessBlueprintDecisionOptions(
                raw.decision.options,
                bundles,
                importStack,
              ),
            }
          : null
      return [
        {
          id,
          title,
          kind,
          doneToken:
            typeof raw.doneToken === "string" && raw.doneToken.trim()
              ? raw.doneToken.trim()
              : null,
          blockedToken:
            typeof raw.blockedToken === "string" && raw.blockedToken.trim()
              ? raw.blockedToken.trim()
              : null,
          steps: normalizeProcessBlueprintSteps(
            raw.steps,
            bundles,
            importStack,
          ),
          decision,
        } satisfies ProcessBlueprintStep,
      ]
    })
    .filter((entry): entry is ProcessBlueprintStep => entry !== null)
}

function hasProceduralFields(raw: RawProcessBlueprint) {
  return (
    raw.idlePrompt !== undefined ||
    raw.completionMode !== undefined ||
    raw.completionToken !== undefined ||
    raw.blockedToken !== undefined ||
    raw.stopConditions !== undefined ||
    raw.steps !== undefined ||
    raw.watchdog !== undefined
  )
}

function normalizeProcessBlueprint(
  raw: RawProcessBlueprint,
  jsonPath: string,
  templates: Map<string, { raw: RawProcessTemplate; path: string }>,
  bundles: Map<string, RawProcessStepBundle>,
): ProcessBlueprint {
  const resolvedRaw = resolveTemplateBlueprint(raw, jsonPath, templates)
  const id = typeof resolvedRaw.id === "string" ? resolvedRaw.id.trim() : ""
  const title =
    typeof resolvedRaw.title === "string" ? resolvedRaw.title.trim() : ""
  const catalogOrder = Number(resolvedRaw.catalogOrder)
  const expectation =
    typeof resolvedRaw.expectation === "string"
      ? resolvedRaw.expectation.trim()
      : ""
  const basePath = jsonPath.replace(/\.process-blueprint\.json$/u, "")
  const companionPath = `${basePath}.agentish.ts`
  const normalizedCatalogOrder =
    Number.isFinite(catalogOrder) && catalogOrder >= 0
      ? catalogOrder
      : Number.MAX_SAFE_INTEGER

  if (!id || !title || !expectation) {
    throw new Error(`Invalid process blueprint: ${jsonPath}`)
  }

  if (!hasProceduralFields(resolvedRaw)) {
    return {
      kind: "mode",
      id,
      title,
      catalogOrder: normalizedCatalogOrder,
      expectation,
      companionPath: existsSync(companionPath) ? companionPath : null,
    }
  }

  const idlePrompt =
    typeof resolvedRaw.idlePrompt === "string"
      ? resolvedRaw.idlePrompt.trim()
      : ""
  const completionToken =
    typeof resolvedRaw.completionToken === "string"
      ? resolvedRaw.completionToken.trim()
      : ""
  const blockedToken =
    typeof resolvedRaw.blockedToken === "string"
      ? resolvedRaw.blockedToken.trim()
      : ""
  const completionMode =
    resolvedRaw.completionMode === "exact_reply" ? "exact_reply" : null

  if (
    !idlePrompt ||
    !completionToken ||
    !blockedToken ||
    !completionMode ||
    resolvedRaw.steps === undefined ||
    resolvedRaw.watchdog === undefined
  ) {
    throw new Error(`Invalid procedural process blueprint: ${jsonPath}`)
  }

  const steps = normalizeProcessBlueprintSteps(resolvedRaw.steps, bundles)
  const watchDogEnabled = resolvedRaw.watchdog?.enabled !== false
  const idleTimeoutSeconds = Number(resolvedRaw.watchdog?.idleTimeoutSeconds)
  const maxNudgesPerIdleEpisode = Number(
    resolvedRaw.watchdog?.maxNudgesPerIdleEpisode,
  )

  return {
    kind: "procedural",
    id,
    title,
    catalogOrder: normalizedCatalogOrder,
    expectation,
    idlePrompt,
    completionMode,
    completionToken,
    blockedToken,
    stopConditions: Array.isArray(resolvedRaw.stopConditions)
      ? resolvedRaw.stopConditions
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter(Boolean)
      : [],
    steps,
    watchdog: {
      enabled: watchDogEnabled,
      idleTimeoutSeconds:
        Number.isFinite(idleTimeoutSeconds) && idleTimeoutSeconds > 0
          ? idleTimeoutSeconds
          : 90,
      maxNudgesPerIdleEpisode:
        Number.isFinite(maxNudgesPerIdleEpisode) && maxNudgesPerIdleEpisode >= 0
          ? maxNudgesPerIdleEpisode
          : 1,
    },
    companionPath: existsSync(companionPath) ? companionPath : null,
  }
}

export function isProceduralProcessBlueprint(
  processBlueprint: ProcessBlueprint | null | undefined,
): processBlueprint is ProceduralProcessBlueprint {
  return processBlueprint?.kind === "procedural"
}

export function loadProcessBlueprintCatalog(
  options: ProcessBlueprintCatalogLoadOptions = {},
): ProcessBlueprint[] {
  const bundles = normalizeProcessStepBundles(options.processStepDirs)
  const templates = loadRawProcessTemplates(options.processTemplateDirs)

  return loadRawProcessBlueprints(options.processBlueprintDirs)
    .map(({ raw, path }) =>
      normalizeProcessBlueprint(raw, path, templates, bundles),
    )
    .sort((left, right) => {
      if (left.catalogOrder !== right.catalogOrder) {
        return left.catalogOrder - right.catalogOrder
      }
      return left.title.localeCompare(right.title)
    })
}

export function processBlueprintLabel(
  processBlueprint: ProcessBlueprint | null | undefined,
) {
  if (!processBlueprint) {
    return null
  }
  return processBlueprint.title || basename(processBlueprint.id)
}
