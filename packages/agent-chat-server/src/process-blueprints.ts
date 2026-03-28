import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

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
  id?: unknown;
  title?: unknown;
  kind?: unknown;
  doneToken?: unknown;
  blockedToken?: unknown;
  decision?: {
    prompt?: unknown;
    options?: unknown;
  };
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

function normalizeProcessBlueprintDecisionOptions(
  rawOptions: unknown,
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
        steps: normalizeProcessBlueprintSteps(raw.steps),
      } satisfies ProcessBlueprintDecisionOption;
    })
    .filter((entry): entry is ProcessBlueprintDecisionOption => entry !== null);
}

function normalizeProcessBlueprintSteps(rawSteps: unknown): ProcessBlueprintStep[] {
  if (!Array.isArray(rawSteps)) {
    return [];
  }

  return rawSteps
    .map((entry) => {
      const raw = entry as RawProcessBlueprintStep;
      const id = typeof raw.id === "string" ? raw.id.trim() : "";
      const title = typeof raw.title === "string" ? raw.title.trim() : "";
      if (!id || !title) {
        return null;
      }
      const kind = raw.kind === "wait" || raw.kind === "decision" ? raw.kind : "task";
      const decision =
        kind === "decision" && raw.decision && typeof raw.decision === "object"
          ? {
              prompt:
                typeof raw.decision.prompt === "string" && raw.decision.prompt.trim()
                  ? raw.decision.prompt.trim()
                  : title,
              options: normalizeProcessBlueprintDecisionOptions(raw.decision.options),
            }
          : null;
      return {
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
        decision,
      } satisfies ProcessBlueprintStep;
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

function normalizeProcessBlueprint(raw: RawProcessBlueprint, jsonPath: string): ProcessBlueprint {
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

  const steps = normalizeProcessBlueprintSteps(raw.steps);
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

export function loadProcessBlueprintCatalog(blueprintsDir?: string): ProcessBlueprint[] {
  const processBlueprintDir = blueprintsDir?.trim() || defaultBlueprintsDir();
  if (!existsSync(processBlueprintDir)) {
    return [];
  }

  return readdirSync(processBlueprintDir)
    .filter((entry) => entry.endsWith(".process-blueprint.json"))
    .map((entry) => join(processBlueprintDir, entry))
    .map((path) =>
      normalizeProcessBlueprint(
        JSON.parse(readFileSync(path, "utf8")) as RawProcessBlueprint,
        path,
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
