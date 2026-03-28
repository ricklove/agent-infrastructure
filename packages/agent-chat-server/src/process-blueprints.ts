import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export type ProcessStepBundle = {
  id: string;
  title: string | null;
  steps: ProcessBlueprintStep[];
};

export type ProcessBlueprintDecisionOption = {
  id: string;
  title: string;
  goto: string | null;
  next: boolean;
  block: boolean;
  complete: boolean;
  steps: ProcessBlueprintStep[];
};

export type ProcessBlueprintStep = {
  id: string;
  title: string;
  kind: "task" | "wait" | "decision";
  doneToken: string | null;
  blockedToken: string | null;
  steps: ProcessBlueprintStep[];
  decision: {
    prompt: string;
    options: ProcessBlueprintDecisionOption[];
  } | null;
};

type BaseProcessBlueprint = {
  id: string;
  title: string;
  catalogOrder: number;
  expectation: string;
  companionPath: string | null;
};

export type ModeProcessBlueprint = BaseProcessBlueprint & {
  kind: "mode";
};

export type ProceduralProcessBlueprint = BaseProcessBlueprint & {
  kind: "procedural";
  idlePrompt: string;
  completionMode: "exact_reply";
  completionToken: string;
  blockedToken: string;
  stopConditions: string[];
  steps: ProcessBlueprintStep[];
  watchdog: {
    enabled: boolean;
    idleTimeoutSeconds: number;
    maxNudgesPerIdleEpisode: number;
  };
};

export type ProcessBlueprint = ModeProcessBlueprint | ProceduralProcessBlueprint;

type RawProcessBlueprintDecisionOption = {
  id?: unknown;
  title?: unknown;
  goto?: unknown;
  next?: unknown;
  block?: unknown;
  complete?: unknown;
  steps?: unknown;
};

type RawProcessBlueprintStep = {
  use?: unknown;
  id?: unknown;
  title?: unknown;
  kind?: unknown;
  doneToken?: unknown;
  blockedToken?: unknown;
  steps?: unknown;
  decision?: {
    prompt?: unknown;
    options?: unknown;
  };
};

type RawProcessStepBundle = {
  id?: unknown;
  title?: unknown;
  steps?: unknown;
};

type RawProcessBlueprint = {
  id?: unknown;
  title?: unknown;
  catalogOrder?: unknown;
  expectation?: unknown;
  idlePrompt?: unknown;
  completionMode?: unknown;
  completionToken?: unknown;
  blockedToken?: unknown;
  stopConditions?: unknown;
  steps?: unknown;
  watchdog?: {
    enabled?: unknown;
    idleTimeoutSeconds?: unknown;
    maxNudgesPerIdleEpisode?: unknown;
  };
};

function defaultBlueprintsDir() {
  return resolve(import.meta.dir, "../../../blueprints/process-blueprints");
}

function defaultProcessStepsDir() {
  return resolve(import.meta.dir, "../../../blueprints/process-steps");
}

function normalizeProcessStepBundles(processStepsDir?: string) {
  const stepsDir = processStepsDir?.trim() || defaultProcessStepsDir();
  const bundleMap = new Map<string, RawProcessStepBundle>();
  if (!existsSync(stepsDir)) {
    return bundleMap;
  }

  for (const entry of readdirSync(stepsDir)) {
    if (!entry.endsWith(".process-steps.json")) {
      continue;
    }
    const path = join(stepsDir, entry);
    const raw = JSON.parse(readFileSync(path, "utf8")) as RawProcessStepBundle;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!id) {
      throw new Error(`Invalid process step bundle: ${path}`);
    }
    bundleMap.set(id, raw);
  }
  return bundleMap;
}

function normalizeProcessBlueprintDecisionOptions(
  rawOptions: unknown,
  bundles: Map<string, RawProcessStepBundle>,
  importStack: string[] = [],
): ProcessBlueprintDecisionOption[] {
  if (!Array.isArray(rawOptions)) {
    return [];
  }

  return rawOptions
    .map((entry) => {
      const raw = entry as RawProcessBlueprintDecisionOption;
      const id = typeof raw.id === "string" ? raw.id.trim() : "";
      const title = typeof raw.title === "string" ? raw.title.trim() : "";
      if (!id || !title) {
        return null;
      }
      return {
        id,
        title,
        goto: typeof raw.goto === "string" && raw.goto.trim() ? raw.goto.trim() : null,
        next: raw.next === true,
        block: raw.block === true,
        complete: raw.complete === true,
        steps: normalizeProcessBlueprintSteps(raw.steps, bundles, importStack),
      } satisfies ProcessBlueprintDecisionOption;
    })
    .filter((entry): entry is ProcessBlueprintDecisionOption => entry !== null);
}

function normalizeProcessBlueprintSteps(
  rawSteps: unknown,
  bundles: Map<string, RawProcessStepBundle>,
  importStack: string[] = [],
): ProcessBlueprintStep[] {
  if (!Array.isArray(rawSteps)) {
    return [];
  }

  return rawSteps
    .flatMap((entry) => {
      const raw = entry as RawProcessBlueprintStep;
      const use = typeof raw.use === "string" ? raw.use.trim() : "";
      if (use) {
        const bundle = bundles.get(use);
        if (!bundle) {
          throw new Error(`Unknown process step bundle: ${use}`);
        }
        if (importStack.includes(use)) {
          throw new Error(`Circular process step bundle import: ${[...importStack, use].join(" -> ")}`);
        }
        return normalizeProcessBlueprintSteps(bundle.steps, bundles, [...importStack, use]);
      }

      const id = typeof raw.id === "string" ? raw.id.trim() : "";
      const title = typeof raw.title === "string" ? raw.title.trim() : "";
      if (!id || !title) {
        return [];
      }
      const kind = raw.kind === "wait" || raw.kind === "decision" ? raw.kind : "task";
      const decision =
        kind === "decision" && raw.decision && typeof raw.decision === "object"
          ? {
              prompt:
                typeof raw.decision.prompt === "string" && raw.decision.prompt.trim()
                  ? raw.decision.prompt.trim()
                  : title,
              options: normalizeProcessBlueprintDecisionOptions(
                raw.decision.options,
                bundles,
                importStack,
              ),
            }
          : null;
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
          steps: normalizeProcessBlueprintSteps(raw.steps, bundles, importStack),
          decision,
        } satisfies ProcessBlueprintStep,
      ];
    })
    .filter((entry): entry is ProcessBlueprintStep => entry !== null);
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
  );
}

function normalizeProcessBlueprint(
  raw: RawProcessBlueprint,
  jsonPath: string,
  bundles: Map<string, RawProcessStepBundle>,
): ProcessBlueprint {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const catalogOrder = Number(raw.catalogOrder);
  const expectation = typeof raw.expectation === "string" ? raw.expectation.trim() : "";
  const basePath = jsonPath.replace(/\.process-blueprint\.json$/u, "");
  const companionPath = `${basePath}.agentish.ts`;
  const normalizedCatalogOrder =
    Number.isFinite(catalogOrder) && catalogOrder >= 0 ? catalogOrder : Number.MAX_SAFE_INTEGER;

  if (!id || !title || !expectation) {
    throw new Error(`Invalid process blueprint: ${jsonPath}`);
  }

  if (!hasProceduralFields(raw)) {
    return {
      kind: "mode",
      id,
      title,
      catalogOrder: normalizedCatalogOrder,
      expectation,
      companionPath: existsSync(companionPath) ? companionPath : null,
    };
  }

  const idlePrompt = typeof raw.idlePrompt === "string" ? raw.idlePrompt.trim() : "";
  const completionToken =
    typeof raw.completionToken === "string" ? raw.completionToken.trim() : "";
  const blockedToken = typeof raw.blockedToken === "string" ? raw.blockedToken.trim() : "";
  const completionMode = raw.completionMode === "exact_reply" ? "exact_reply" : null;

  if (
    !idlePrompt ||
    !completionToken ||
    !blockedToken ||
    !completionMode ||
    raw.steps === undefined ||
    raw.watchdog === undefined
  ) {
    throw new Error(`Invalid procedural process blueprint: ${jsonPath}`);
  }

  const steps = normalizeProcessBlueprintSteps(raw.steps, bundles);
  const watchDogEnabled = raw.watchdog?.enabled !== false;
  const idleTimeoutSeconds = Number(raw.watchdog?.idleTimeoutSeconds);
  const maxNudgesPerIdleEpisode = Number(raw.watchdog?.maxNudgesPerIdleEpisode);

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
    stopConditions: Array.isArray(raw.stopConditions)
      ? raw.stopConditions
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter(Boolean)
      : [],
    steps,
    watchdog: {
      enabled: watchDogEnabled,
      idleTimeoutSeconds:
        Number.isFinite(idleTimeoutSeconds) && idleTimeoutSeconds > 0 ? idleTimeoutSeconds : 90,
      maxNudgesPerIdleEpisode:
        Number.isFinite(maxNudgesPerIdleEpisode) && maxNudgesPerIdleEpisode >= 0
          ? maxNudgesPerIdleEpisode
          : 1,
    },
    companionPath: existsSync(companionPath) ? companionPath : null,
  };
}

export function isProceduralProcessBlueprint(
  processBlueprint: ProcessBlueprint | null | undefined,
): processBlueprint is ProceduralProcessBlueprint {
  return processBlueprint?.kind === "procedural";
}

export function loadProcessBlueprintCatalog(
  blueprintsDir?: string,
  processStepsDir?: string,
): ProcessBlueprint[] {
  const processBlueprintDir = blueprintsDir?.trim() || defaultBlueprintsDir();
  if (!existsSync(processBlueprintDir)) {
    return [];
  }

  const bundles = normalizeProcessStepBundles(processStepsDir);

  return readdirSync(processBlueprintDir)
    .filter((entry) => entry.endsWith(".process-blueprint.json"))
    .map((entry) => join(processBlueprintDir, entry))
    .map((path) =>
      normalizeProcessBlueprint(
        JSON.parse(readFileSync(path, "utf8")) as RawProcessBlueprint,
        path,
        bundles,
      ),
    )
    .sort((left, right) => {
      if (left.catalogOrder !== right.catalogOrder) {
        return left.catalogOrder - right.catalogOrder;
      }
      return left.title.localeCompare(right.title);
    });
}

export function processBlueprintLabel(processBlueprint: ProcessBlueprint | null | undefined) {
  if (!processBlueprint) {
    return null;
  }
  return processBlueprint.title || basename(processBlueprint.id);
}
