import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { query } from "@anthropic-ai/claude-agent-sdk";

const repoRoot = resolve(import.meta.dir, "..");
const blueprintsRoot = join(repoRoot, "blueprints");
const reportsRoot = join(blueprintsRoot, "agentish-quality-reports");
const outputSchemaPath = join(reportsRoot, "_schema.json");
const rollupPath = join(reportsRoot, "index.json");

type FileClass =
  | "language_root"
  | "shared_meta"
  | "product_ideal"
  | "implementation_resolved"
  | "blueprint_state"
  | "process_guide"
  | "exploratory_companion";

type Recommendation = "keep" | "revise" | "pair" | "archive" | "delete";
type Rating = "strong" | "good" | "mixed" | "weak";

type EvaluationReport = {
  target_file: string;
  file_class: FileClass;
  evaluation_modes: string[];
  allowed_companion_context: string[];
  dimension_ratings: {
    self_description?: Rating;
    semantic_density?: Rating;
    causal_clarity?: Rating;
    local_recoverability?: Rating;
    abstraction_discipline?: Rating;
    interpretive_slack?: Rating;
    corpus_fit?: Rating;
    layer_correctness?: Rating;
    live_use_evidence?: Rating;
    obsolescence_risk?: Rating;
  };
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendation: Recommendation;
  confidence: "high" | "medium" | "low";
};

const reportSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "target_file",
    "file_class",
    "evaluation_modes",
    "allowed_companion_context",
    "dimension_ratings",
    "summary",
    "strengths",
    "weaknesses",
    "recommendation",
    "confidence",
  ],
  properties: {
    target_file: { type: "string" },
    file_class: {
      type: "string",
      enum: [
        "language_root",
        "shared_meta",
        "product_ideal",
        "implementation_resolved",
        "blueprint_state",
        "process_guide",
        "exploratory_companion",
      ],
    },
    evaluation_modes: {
      type: "array",
      items: {
        type: "string",
        enum: ["standalone", "layer_relative", "corpus_usefulness"],
      },
      minItems: 1,
    },
    allowed_companion_context: {
      type: "array",
      items: { type: "string" },
    },
    dimension_ratings: {
      type: "object",
      additionalProperties: false,
      required: [
        "self_description",
        "semantic_density",
        "causal_clarity",
        "local_recoverability",
        "abstraction_discipline",
        "interpretive_slack",
        "corpus_fit",
        "layer_correctness",
        "live_use_evidence",
        "obsolescence_risk",
      ],
      properties: {
        self_description: { type: "string", enum: ["strong", "good", "mixed", "weak"] },
        semantic_density: { type: "string", enum: ["strong", "good", "mixed", "weak"] },
        causal_clarity: { type: "string", enum: ["strong", "good", "mixed", "weak"] },
        local_recoverability: { type: "string", enum: ["strong", "good", "mixed", "weak"] },
        abstraction_discipline: { type: "string", enum: ["strong", "good", "mixed", "weak"] },
        interpretive_slack: { type: "string", enum: ["strong", "good", "mixed", "weak"] },
        corpus_fit: { type: "string", enum: ["strong", "good", "mixed", "weak"] },
        layer_correctness: { type: "string", enum: ["strong", "good", "mixed", "weak"] },
        live_use_evidence: { type: "string", enum: ["strong", "good", "mixed", "weak"] },
        obsolescence_risk: { type: "string", enum: ["strong", "good", "mixed", "weak"] },
      },
    },
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" }, minItems: 1 },
    weaknesses: { type: "array", items: { type: "string" }, minItems: 1 },
    recommendation: { type: "string", enum: ["keep", "revise", "pair", "archive", "delete"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
} as const;

function listTargetFiles(root: string): string[] {
  const results: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const abs = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "agentish-quality-reports") {
          continue;
        }
        stack.push(abs);
        continue;
      }
      const rel = relative(root, abs);
      if (
        rel.endsWith(".agentish.ts") ||
        rel.endsWith(".agentish.md") ||
        (rel.endsWith(".ts") &&
          !rel.endsWith(".d.ts") &&
          !rel.endsWith("tsconfig.json") &&
          !rel.includes("process-blueprints/"))
      ) {
        results.push(rel);
      }
    }
  }
  return results.sort();
}

function classifyFile(relPath: string): FileClass {
  const base = relPath.split("/").pop() ?? relPath;
  if (relPath === "_agentish.ts") {
    return "language_root";
  }
  if (
    relPath === "agentish-system-layers.ts" ||
    relPath === "agentish-quality-evaluation.agentish.ts" ||
    relPath === "tech-stack.agentish.ts" ||
    relPath === "coding-standards.agentish.ts" ||
    relPath === "process-blueprints.agentish.ts"
  ) {
    return "shared_meta";
  }
  if (base.includes(".blueprint-state.") || base.includes("-blueprint-state.")) {
    return "blueprint_state";
  }
  if (relPath.startsWith("process-blueprints/") && relPath.endsWith(".agentish.ts")) {
    return "process_guide";
  }
  if (
    base.includes("dashboard-implementation") ||
    base.includes("code-architecture") ||
    base.includes("operational-behavior") ||
    base.includes("contracts") ||
    base.includes("scenarios")
  ) {
    return "implementation_resolved";
  }
  if (relPath === "_merge-repairs.agentish.ts" || relPath.endsWith(".agentish.md") || base === "summary.md") {
    return "exploratory_companion";
  }
  return "product_ideal";
}

function allowedCompanionContext(relPath: string, fileClass: FileClass): string[] {
  const companions = ["_agentish.ts", "agentish-quality-evaluation.agentish.ts"];
  if (fileClass === "blueprint_state") {
    const fileName = relPath.split("/").pop() ?? relPath;
    const base = fileName.replace(/(\.|-)?blueprint-state\.agentish\.ts$/, "");
    const dir = dirname(relPath);
    const ideal = join(dir, `${base}.agentish.ts`).replaceAll("\\", "/");
    const impl = join(dir, `${base}-dashboard-implementation.agentish.ts`).replaceAll("\\", "/");
    for (const candidate of [ideal, impl, "development-process.agentish.ts"]) {
      if (candidate !== relPath) {
        companions.push(candidate);
      }
    }
  } else if (fileClass === "process_guide") {
    const jsonCompanion = relPath
      .replace(/\.agentish\.ts$/, ".process-blueprint.json")
      .replaceAll("\\", "/");
    companions.push("process-blueprints.agentish.ts", jsonCompanion);
  } else if (fileClass === "implementation_resolved") {
    if (relPath.startsWith("agentish-graph.")) {
      companions.push("agentish-graph.concept.ts", "agentish-graph.scenarios.ts");
    }
  }
  return [...new Set(companions)];
}

function outputPathFor(relPath: string): string {
  const normalized = relPath.replace(/\.(agentish\.ts|agentish\.md|ts|md)$/, "");
  return join(reportsRoot, `${normalized}.report.json`);
}

function buildPrompt(
  relPath: string,
  fileClass: FileClass,
  companions: string[],
  targetText: string,
  companionTexts: { path: string; text: string }[],
  qualityBlueprintText: string,
  languageRootText: string,
): string {
  const contextBlocks = companionTexts
    .map((entry) => `FILE: ${entry.path}\n<<<\n${entry.text}\n>>>`)
    .join("\n\n");
  const modes =
    fileClass === "blueprint_state"
      ? "layer_relative, corpus_usefulness"
      : fileClass === "process_guide"
        ? "layer_relative, corpus_usefulness"
        : fileClass === "implementation_resolved"
          ? "layer_relative, corpus_usefulness"
          : "standalone, corpus_usefulness";
  return `Evaluate one Agentish file using the repository's Agentish quality blueprint.

You must judge this file fairly, not against generic writing taste.
The key fairness rules:
- Use fresh context only from this prompt.
- Separate intrinsic writing quality from corpus-role concerns.
- Do not punish intentionally partial files for lacking truth owned by another file class.
- Obsolescence risk is separate from intrinsic quality.

TARGET FILE: ${relPath}
FILE CLASS: ${fileClass}
EVALUATION MODES: ${modes}
ALLOWED COMPANION CONTEXT:
${companions.map((path) => `- ${path}`).join("\n")}

LANGUAGE ROOT
<<<
${languageRootText}
>>>

QUALITY EVALUATION BLUEPRINT
<<<
${qualityBlueprintText}
>>>

TARGET FILE CONTENT
<<<
${targetText}
>>>

COMPANION CONTEXT
${contextBlocks || "<<<\n(none)\n>>>"}

Return only a JSON object matching the schema.
Dimension ratings should be qualitative: strong, good, mixed, or weak.
For obsolescence_risk, strong means high evidence of obsolescence risk; weak means low obsolescence risk.
Keep summary concise and concrete.`;
}

function buildPromptMessage(prompt: string) {
  return (async function* () {
    yield {
      type: "user" as const,
      message: {
        role: "user" as const,
        content: [{ type: "text" as const, text: prompt }],
      },
      parent_tool_use_id: null,
      session_id: randomUUID(),
    };
  })();
}

async function runClaudeEvaluation(prompt: string, outputPath: string): Promise<EvaluationReport> {
  rmSync(outputPath, { force: true });
  const run = query({
    prompt: buildPromptMessage(prompt),
    options: {
      cwd: repoRoot,
      permissionMode: "plan",
      persistSession: false,
      outputFormat: {
        type: "json_schema",
        schema: reportSchema as unknown as Record<string, unknown>,
      },
    },
  });

  let structuredOutput: EvaluationReport | null = null;

  try {
    for await (const message of run) {
      if (message.type !== "result") {
        continue;
      }
      if (message.subtype === "error" || message.is_error) {
        throw new Error(String(message.error || message.result || "Claude Agent SDK evaluation failed"));
      }
      if (message.structured_output) {
        structuredOutput = message.structured_output as EvaluationReport;
      }
    }
  } catch (error) {
    rmSync(outputPath, { force: true });
    throw error;
  } finally {
    try {
      await run.return();
    } catch {
      // Best-effort SDK cleanup only.
    }
  }

  if (!structuredOutput) {
    rmSync(outputPath, { force: true });
    throw new Error("Claude Agent SDK evaluation returned no structured output");
  }

  writeFileSync(outputPath, `${JSON.stringify(structuredOutput)}\n`);
  return structuredOutput;
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  return values.reduce(
    (acc, value) => {
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    },
    {} as Record<T, number>,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const requestedFiles = args
    .flatMap((arg) => (arg.startsWith("--files=") ? arg.slice("--files=".length).split(",") : []))
    .map((value) => value.trim())
    .filter(Boolean);
  const concurrencyArg = args.find((arg) => arg.startsWith("--concurrency="));
  const parsedConcurrency = Number.parseInt(concurrencyArg?.slice("--concurrency=".length) ?? "4", 10);
  const concurrency = Number.isFinite(parsedConcurrency) && parsedConcurrency > 0 ? parsedConcurrency : 4;
  mkdirSync(reportsRoot, { recursive: true });
  rmSync(reportsRoot, { recursive: true, force: true });
  mkdirSync(reportsRoot, { recursive: true });
  writeFileSync(outputSchemaPath, `${JSON.stringify(reportSchema, null, 2)}\n`);

  const languageRootPath = join(blueprintsRoot, "_agentish.ts");
  const qualityBlueprintPath = join(blueprintsRoot, "agentish-quality-evaluation.agentish.ts");
  const languageRootText = readFileSync(languageRootPath, "utf8");
  const qualityBlueprintText = readFileSync(qualityBlueprintPath, "utf8");

  const allTargets = listTargetFiles(blueprintsRoot);
  const targets =
    requestedFiles.length > 0
      ? allTargets.filter((relPath) => requestedFiles.includes(relPath))
      : allTargets;
  const reportsByFile = new Map<string, EvaluationReport>();
  let nextIndex = 0;

  async function evaluateOne(relPath: string) {
    const fileClass = classifyFile(relPath);
    const companions = allowedCompanionContext(relPath, fileClass).filter((path) => path !== relPath);
    const targetText = readFileSync(join(blueprintsRoot, relPath), "utf8");
    const companionTexts = companions
      .filter((path) => {
        try {
          readFileSync(join(blueprintsRoot, path), "utf8");
          return true;
        } catch {
          return false;
        }
      })
      .map((path) => ({
        path,
        text: readFileSync(join(blueprintsRoot, path), "utf8"),
      }));
    const prompt = buildPrompt(
      relPath,
      fileClass,
      companions,
      targetText,
      companionTexts,
      qualityBlueprintText,
      languageRootText,
    );
    const outputPath = outputPathFor(relPath);
    mkdirSync(dirname(outputPath), { recursive: true });
    const report = await runClaudeEvaluation(prompt, outputPath);
    reportsByFile.set(relPath, report);
    process.stdout.write(`evaluated ${relPath}\n`);
  }

  async function worker() {
    while (nextIndex < targets.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await evaluateOne(targets[currentIndex]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()),
  );

  const reports = targets.map((relPath) => reportsByFile.get(relPath)!);

  const rollup = {
    generated_at: new Date().toISOString(),
    source_root: "blueprints/",
    reports_root: "blueprints/agentish-quality-reports/",
    file_count: reports.length,
    by_file_class: countBy(reports.map((report) => report.file_class)),
    recommendations: countBy(reports.map((report) => report.recommendation)),
    confidence: countBy(reports.map((report) => report.confidence)),
    reports: reports.map((report) => ({
      target_file: report.target_file,
      file_class: report.file_class,
      recommendation: report.recommendation,
      confidence: report.confidence,
      summary: report.summary,
    })),
  };
  writeFileSync(rollupPath, `${JSON.stringify(rollup, null, 2)}\n`);
}

await main();
