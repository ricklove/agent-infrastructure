import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export type ProcessBlueprintStep = {
  id: string;
  title: string;
  doneToken: string | null;
  blockedToken: string | null;
};

export type ProcessBlueprint = {
  id: string;
  title: string;
  catalogOrder: number;
  expectation: string;
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
  companionPath: string | null;
};

type RawProcessBlueprintStep = {
  id?: unknown;
  title?: unknown;
  doneToken?: unknown;
  blockedToken?: unknown;
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
      return {
        id,
        title,
        doneToken:
          typeof raw.doneToken === "string" && raw.doneToken.trim()
            ? raw.doneToken.trim()
            : null,
        blockedToken:
          typeof raw.blockedToken === "string" && raw.blockedToken.trim()
            ? raw.blockedToken.trim()
            : null,
      } satisfies ProcessBlueprintStep;
    })
    .filter((entry): entry is ProcessBlueprintStep => entry !== null);
}

function normalizeProcessBlueprint(raw: RawProcessBlueprint, jsonPath: string): ProcessBlueprint {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const catalogOrder = Number(raw.catalogOrder);
  const expectation = typeof raw.expectation === "string" ? raw.expectation.trim() : "";
  const idlePrompt = typeof raw.idlePrompt === "string" ? raw.idlePrompt.trim() : "";
  const completionToken =
    typeof raw.completionToken === "string" ? raw.completionToken.trim() : "";
  const blockedToken = typeof raw.blockedToken === "string" ? raw.blockedToken.trim() : "";
  const completionMode = raw.completionMode === "exact_reply" ? "exact_reply" : null;
  const steps = normalizeProcessBlueprintSteps(raw.steps);

  if (!id || !title || !expectation || !idlePrompt || !completionToken || !blockedToken || !completionMode) {
    throw new Error(`Invalid process blueprint: ${jsonPath}`);
  }

  const watchDogEnabled = raw.watchdog?.enabled !== false;
  const idleTimeoutSeconds = Number(raw.watchdog?.idleTimeoutSeconds);
  const maxNudgesPerIdleEpisode = Number(raw.watchdog?.maxNudgesPerIdleEpisode);
  const basePath = jsonPath.replace(/\.process-blueprint\.json$/u, "");
  const companionPath = `${basePath}.agentish.ts`;

  return {
    id,
    title,
    catalogOrder:
      Number.isFinite(catalogOrder) && catalogOrder >= 0 ? catalogOrder : Number.MAX_SAFE_INTEGER,
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
