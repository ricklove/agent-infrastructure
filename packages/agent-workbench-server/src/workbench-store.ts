import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type {
  WorkbenchDocumentRecord,
  WorkbenchSummary,
} from "@agent-infrastructure/agent-workbench-protocol"

const sourceDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(sourceDir, "../../..")
const workspaceRoot =
  process.env.AGENT_WORKSPACE_DIR?.trim() || "/home/ec2-user/workspace"
const workbenchRoot =
  process.env.AGENT_WORKBENCH_DATA_DIR?.trim() ||
  resolve(workspaceRoot, "data", "workbench")
const legacyWorkbenchRoot = resolve(repoRoot, "workspace", "workbenches")
const defaultWorkbenchId = "agent-workbench"

const defaultWorkbench: WorkbenchDocumentRecord = {
  id: defaultWorkbenchId,
  title: "Agent Workbench",
  nodes: [],
  edges: [],
  handles: [],
  viewport: {
    x: 0,
    y: 0,
    zoom: 1,
  },
}

function workbenchFilePath(id: string) {
  return join(workbenchRoot, `${id}.workbench.ts`)
}

function serializeWorkbench(record: WorkbenchDocumentRecord) {
  return [
    "// Agent Workbench document",
    `const workbench = ${JSON.stringify(record, null, 2)} as const;`,
    "",
    "export default workbench;",
    "",
  ].join("\n")
}

function loadWorkbenchModule(filePath: string) {
  const source = readFileSync(filePath, "utf8")
  const match = source.match(
    /const workbench = (.*) as const;\n\nexport default workbench;/s,
  )
  if (!match?.[1]) {
    throw new Error(
      `Workbench file did not contain a parsable record: ${filePath}`,
    )
  }
  return JSON.parse(match[1]) as WorkbenchDocumentRecord
}

export function ensureWorkbenchRoot() {
  mkdirSync(workbenchRoot, { recursive: true })
}

function workbenchRootsInReadOrder() {
  return [workbenchRoot, legacyWorkbenchRoot]
}

function resolveExistingWorkbenchPath(id: string) {
  for (const root of workbenchRootsInReadOrder()) {
    const candidate = join(root, `${id}.workbench.ts`)
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return workbenchFilePath(id)
}

export async function ensureDefaultWorkbench() {
  ensureWorkbenchRoot()
  const targetPath = workbenchFilePath(defaultWorkbenchId)
  if (
    !existsSync(targetPath) &&
    !existsSync(resolveExistingWorkbenchPath(defaultWorkbenchId))
  ) {
    writeFileSync(targetPath, serializeWorkbench(defaultWorkbench))
  }
  return resolveExistingWorkbenchPath(defaultWorkbenchId)
}

export async function listWorkbenches(): Promise<WorkbenchSummary[]> {
  await ensureDefaultWorkbench()
  const summariesById = new Map<string, WorkbenchSummary>()

  for (const root of workbenchRootsInReadOrder()) {
    if (!existsSync(root)) {
      continue
    }
    for (const entry of readdirSync(root)) {
      if (!entry.endsWith(".workbench.ts")) {
        continue
      }
      const filePath = join(root, entry)
      const stats = statSync(filePath)
      const id = basename(entry, ".workbench.ts")
      if (summariesById.has(id)) {
        continue
      }
      summariesById.set(id, {
        id,
        title: id,
        path: filePath,
        updatedAtMs: stats.mtimeMs,
      })
    }
  }

  return [...summariesById.values()].sort(
    (left: WorkbenchSummary, right: WorkbenchSummary) =>
      right.updatedAtMs - left.updatedAtMs,
  )
}

export async function readWorkbench(id?: string) {
  const summaries = await listWorkbenches()
  const selectedId = id?.trim() || summaries[0]?.id || defaultWorkbenchId
  const filePath = resolveExistingWorkbenchPath(selectedId)
  if (!existsSync(filePath)) {
    throw new Error(`Workbench not found: ${selectedId}`)
  }
  const workbench = await loadWorkbenchModule(filePath)
  const matchingSummary = summaries.find((summary) => summary.id === selectedId)
  return {
    workbench,
    summaries:
      matchingSummary == null
        ? summaries
        : summaries.map((summary) =>
            summary.id === selectedId
              ? {
                  ...summary,
                  title: workbench.title,
                }
              : summary,
          ),
    filePath,
  }
}

export async function writeWorkbench(record: WorkbenchDocumentRecord) {
  ensureWorkbenchRoot()
  const normalizedId = record.id.trim() || defaultWorkbenchId
  const normalizedRecord: WorkbenchDocumentRecord = {
    ...record,
    id: normalizedId,
    title: record.title.trim() || defaultWorkbenchId,
  }
  const filePath = workbenchFilePath(normalizedId)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, serializeWorkbench(normalizedRecord))
  return normalizedRecord
}
