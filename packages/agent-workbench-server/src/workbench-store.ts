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

function legacyWorkbenchFilePath(id: string) {
  return join(legacyWorkbenchRoot, `${id}.workbench.ts`)
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

function normalizeWorkbenchRecord(record: WorkbenchDocumentRecord) {
  const normalizedId = record.id.trim() || defaultWorkbenchId
  return {
    ...record,
    id: normalizedId,
    title: record.title.trim() || normalizedId,
  } satisfies WorkbenchDocumentRecord
}

function writeWorkbenchFile(filePath: string, record: WorkbenchDocumentRecord) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, serializeWorkbench(normalizeWorkbenchRecord(record)))
}

function summarizeWorkbenchFile(filePath: string): WorkbenchSummary {
  const stats = statSync(filePath)
  const id = basename(filePath, ".workbench.ts")
  let title = id
  try {
    title = loadWorkbenchModule(filePath).title.trim() || id
  } catch {
    title = id
  }
  return {
    id,
    title,
    path: filePath,
    updatedAtMs: stats.mtimeMs,
  }
}

function migrateLegacyWorkbench(id: string) {
  const canonicalPath = workbenchFilePath(id)
  if (existsSync(canonicalPath)) {
    return canonicalPath
  }

  const legacyPath = legacyWorkbenchFilePath(id)
  if (!existsSync(legacyPath)) {
    return canonicalPath
  }

  const legacyRecord = loadWorkbenchModule(legacyPath)
  writeWorkbenchFile(canonicalPath, legacyRecord)
  return canonicalPath
}

function migrateLegacyWorkbenches() {
  ensureWorkbenchRoot()
  if (!existsSync(legacyWorkbenchRoot)) {
    return
  }

  for (const entry of readdirSync(legacyWorkbenchRoot)) {
    if (!entry.endsWith(".workbench.ts")) {
      continue
    }
    const id = basename(entry, ".workbench.ts")
    migrateLegacyWorkbench(id)
  }
}

export function ensureWorkbenchRoot() {
  mkdirSync(workbenchRoot, { recursive: true })
}

export async function ensureDefaultWorkbench() {
  migrateLegacyWorkbenches()
  const targetPath = workbenchFilePath(defaultWorkbenchId)
  if (!existsSync(targetPath)) {
    writeWorkbenchFile(targetPath, defaultWorkbench)
  }
  return targetPath
}

export async function listWorkbenches(): Promise<WorkbenchSummary[]> {
  await ensureDefaultWorkbench()
  const summaries: WorkbenchSummary[] = []

  for (const entry of readdirSync(workbenchRoot)) {
    if (!entry.endsWith(".workbench.ts")) {
      continue
    }
    summaries.push(summarizeWorkbenchFile(join(workbenchRoot, entry)))
  }

  return summaries.sort(
    (left: WorkbenchSummary, right: WorkbenchSummary) =>
      right.updatedAtMs - left.updatedAtMs,
  )
}

export async function readWorkbench(id?: string) {
  await ensureDefaultWorkbench()
  if (id?.trim()) {
    migrateLegacyWorkbench(id.trim())
  }

  const summaries = await listWorkbenches()
  const selectedId = id?.trim() || summaries[0]?.id || defaultWorkbenchId
  const filePath = workbenchFilePath(selectedId)
  if (!existsSync(filePath)) {
    throw new Error(`Workbench not found: ${selectedId}`)
  }
  const workbench = loadWorkbenchModule(filePath)
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
  const normalizedRecord = normalizeWorkbenchRecord(record)
  const filePath = workbenchFilePath(normalizedRecord.id)
  writeWorkbenchFile(filePath, normalizedRecord)
  return normalizedRecord
}
