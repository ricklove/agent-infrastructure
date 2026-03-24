import { query, type ModelInfo } from "@anthropic-ai/claude-agent-sdk";

const defaultSessionDirectory =
  process.env.AGENT_WORKSPACE_DIR?.trim() || "/home/ec2-user/workspace";
const claudeModelCatalogTtlMs = 5 * 60 * 1000;
const defaultRefreshTimeoutMs = 2500;

type ClaudeAccountProvider = "firstParty" | "bedrock" | "vertex" | "foundry" | null;

type ClaudeModelRecord = {
  modelRef: string;
  sdkValue: string;
  displayName: string;
  description: string;
};

type ClaudeModelCatalogSnapshot = {
  modelOptions: string[];
  defaultModelRef: string;
  modelsByRef: Record<string, ClaudeModelRecord>;
  source: "fallback" | "sdk";
  fetchedAtMs: number | null;
  accountApiProvider: ClaudeAccountProvider;
  lastError: string | null;
};

const fallbackClaudeModels: ClaudeModelRecord[] = [
  {
    modelRef: "anthropic/claude-opus-4-6-1m",
    sdkValue: "default",
    displayName: "Claude Opus 4.6 (1M)",
    description: "Most capable for complex work",
  },
  {
    modelRef: "anthropic/claude-sonnet-4-6",
    sdkValue: "sonnet",
    displayName: "Claude Sonnet 4.6",
    description: "Best for everyday tasks",
  },
  {
    modelRef: "anthropic/claude-sonnet-4-6-1m",
    sdkValue: "sonnet[1m]",
    displayName: "Claude Sonnet 4.6 (1M)",
    description: "Sonnet with 1M context",
  },
  {
    modelRef: "anthropic/claude-haiku-4-5",
    sdkValue: "haiku",
    displayName: "Claude Haiku 4.5",
    description: "Fastest for quick answers",
  },
];

function buildCatalogSnapshot(
  models: ClaudeModelRecord[],
  metadata: Pick<ClaudeModelCatalogSnapshot, "source" | "fetchedAtMs" | "accountApiProvider" | "lastError">,
): ClaudeModelCatalogSnapshot {
  const modelsByRef = Object.fromEntries(models.map((model) => [model.modelRef, model]));
  return {
    modelOptions: models.map((model) => model.modelRef),
    defaultModelRef: models[0]?.modelRef ?? fallbackClaudeModels[0]!.modelRef,
    modelsByRef,
    ...metadata,
  };
}

let cachedClaudeModelCatalog: ClaudeModelCatalogSnapshot = buildCatalogSnapshot(
  fallbackClaudeModels,
  {
    source: "fallback",
    fetchedAtMs: null,
    accountApiProvider: null,
    lastError: null,
  },
);
let inflightClaudeRefresh: Promise<ClaudeModelCatalogSnapshot> | null = null;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function normalizeDisplayName(displayName: string) {
  return displayName.replace(/\s+/g, " ").trim();
}

function inferExplicitClaudeModelRef(model: ModelInfo) {
  const sdkValue = model.value.trim();
  const displayName = normalizeDisplayName(model.displayName);

  if (sdkValue === "default" || displayName.startsWith("Default")) {
    return "anthropic/claude-opus-4-6-1m";
  }
  if (sdkValue === "sonnet") {
    return "anthropic/claude-sonnet-4-6";
  }
  if (sdkValue === "sonnet[1m]") {
    return "anthropic/claude-sonnet-4-6-1m";
  }
  if (sdkValue === "haiku") {
    return "anthropic/claude-haiku-4-5";
  }
  if (sdkValue.startsWith("claude-")) {
    return `anthropic/${sdkValue}`;
  }
  return sdkValue.includes("/") ? sdkValue : `anthropic/${sdkValue}`;
}

function normalizeClaudeModels(models: ModelInfo[]) {
  const seen = new Set<string>();
  const records: ClaudeModelRecord[] = [];

  for (const model of models) {
    const sdkValue = model.value.trim();
    if (!sdkValue) {
      continue;
    }
    const modelRef = inferExplicitClaudeModelRef(model);
    if (!modelRef || seen.has(modelRef)) {
      continue;
    }
    seen.add(modelRef);
    records.push({
      modelRef,
      sdkValue,
      displayName: normalizeDisplayName(model.displayName),
      description: model.description.trim(),
    });
  }

  return records;
}

async function loadClaudeModelCatalogFromSdk(): Promise<ClaudeModelCatalogSnapshot> {
  async function* emptyPrompt() {}

  const sdkQuery = query({
    prompt: emptyPrompt(),
    options: {
      cwd: defaultSessionDirectory,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      persistSession: false,
    },
  });

  try {
    const [models, account] = await Promise.all([
      sdkQuery.supportedModels(),
      sdkQuery.accountInfo().catch(() => null),
    ]);
    const normalizedModels = normalizeClaudeModels(models);
    if (normalizedModels.length === 0) {
      throw new Error("Claude SDK reported no supported models");
    }

    return buildCatalogSnapshot(normalizedModels, {
      source: "sdk",
      fetchedAtMs: Date.now(),
      accountApiProvider: account?.apiProvider ?? null,
      lastError: null,
    });
  } finally {
    try {
      await sdkQuery.return();
    } catch {
      // Best-effort SDK cleanup only.
    }
  }
}

export function getClaudeModelCatalogSnapshot() {
  return {
    ...cachedClaudeModelCatalog,
    modelOptions: [...cachedClaudeModelCatalog.modelOptions],
    modelsByRef: { ...cachedClaudeModelCatalog.modelsByRef },
  };
}

export function resolveClaudeSdkModelValue(modelRef: string) {
  const trimmed = modelRef.trim();
  if (!trimmed) {
    return fallbackClaudeModels[0]!.sdkValue;
  }

  const cachedMatch = cachedClaudeModelCatalog.modelsByRef[trimmed];
  if (cachedMatch) {
    return cachedMatch.sdkValue;
  }

  const fallbackMatch = fallbackClaudeModels.find((model) => model.modelRef === trimmed);
  if (fallbackMatch) {
    return fallbackMatch.sdkValue;
  }

  const legacyAlias = trimmed.split("/").at(-1) || trimmed;
  return legacyAlias;
}

export function normalizeClaudeSessionModelRef(modelRef: string) {
  const trimmed = modelRef.trim();
  if (!trimmed) {
    return cachedClaudeModelCatalog.defaultModelRef;
  }

  if (cachedClaudeModelCatalog.modelsByRef[trimmed]) {
    return trimmed;
  }

  const fallbackMatch = fallbackClaudeModels.find(
    (model) => model.modelRef === trimmed || model.sdkValue === trimmed || trimmed === `anthropic/${model.sdkValue}`,
  );
  if (fallbackMatch) {
    return fallbackMatch.modelRef;
  }

  if (trimmed === "anthropic/default") {
    return "anthropic/claude-opus-4-6-1m";
  }
  if (trimmed === "anthropic/sonnet") {
    return "anthropic/claude-sonnet-4-6";
  }
  if (trimmed === "anthropic/sonnet[1m]") {
    return "anthropic/claude-sonnet-4-6-1m";
  }
  if (trimmed === "anthropic/haiku") {
    return "anthropic/claude-haiku-4-5";
  }

  return trimmed;
}

export async function refreshClaudeModelCatalog(options?: {
  force?: boolean;
  timeoutMs?: number;
}) {
  const force = options?.force ?? false;
  const timeoutMs = options?.timeoutMs ?? defaultRefreshTimeoutMs;
  const now = Date.now();

  if (
    !force &&
    cachedClaudeModelCatalog.fetchedAtMs !== null &&
    now - cachedClaudeModelCatalog.fetchedAtMs < claudeModelCatalogTtlMs
  ) {
    return getClaudeModelCatalogSnapshot();
  }

  if (!inflightClaudeRefresh) {
    inflightClaudeRefresh = withTimeout(
      loadClaudeModelCatalogFromSdk(),
      timeoutMs,
      "Claude model discovery",
    )
      .then((snapshot) => {
        cachedClaudeModelCatalog = snapshot;
        return getClaudeModelCatalogSnapshot();
      })
      .catch((error) => {
        cachedClaudeModelCatalog = {
          ...cachedClaudeModelCatalog,
          lastError: error instanceof Error ? error.message : String(error),
        };
        return getClaudeModelCatalogSnapshot();
      })
      .finally(() => {
        inflightClaudeRefresh = null;
      });
  }

  return inflightClaudeRefresh;
}

export function primeClaudeModelCatalogRefresh() {
  void refreshClaudeModelCatalog();
}
