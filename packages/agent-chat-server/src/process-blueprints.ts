import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export type ProcessBlueprint = {
  id: string;
  title: string;
  expectation: string;
  idlePrompt: string;
  completionMode: "exact_reply";
  completionToken: string;
  blockedToken: string;
  stopConditions: string[];
  watchdog: {
    enabled: boolean;
    idleTimeoutSeconds: number;
    maxNudgesPerIdleEpisode: number;
  };
  companionPath: string | null;
};

type RawProcessBlueprint = {
  id?: unknown;
  title?: unknown;
  expectation?: unknown;
  idlePrompt?: unknown;
  completionMode?: unknown;
  completionToken?: unknown;
  blockedToken?: unknown;
  stopConditions?: unknown;
  watchdog?: {
    enabled?: unknown;
    idleTimeoutSeconds?: unknown;
    maxNudgesPerIdleEpisode?: unknown;
  };
};

function defaultBlueprintsDir() {
  return resolve(import.meta.dir, "../../../blueprints/process-blueprints");
}

function normalizeProcessBlueprint(raw: RawProcessBlueprint, jsonPath: string): ProcessBlueprint {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const expectation = typeof raw.expectation === "string" ? raw.expectation.trim() : "";
  const idlePrompt = typeof raw.idlePrompt === "string" ? raw.idlePrompt.trim() : "";
  const completionToken =
    typeof raw.completionToken === "string" ? raw.completionToken.trim() : "";
  const blockedToken = typeof raw.blockedToken === "string" ? raw.blockedToken.trim() : "";
  const completionMode =
    raw.completionMode === "exact_reply" ? "exact_reply" : null;

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
    .sort((left, right) => left.title.localeCompare(right.title))
}

export function processBlueprintLabel(processBlueprint: ProcessBlueprint | null | undefined) {
  if (!processBlueprint) {
    return null;
  }
  return processBlueprint.title || basename(processBlueprint.id);
}
