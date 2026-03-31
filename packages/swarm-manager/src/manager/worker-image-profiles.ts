import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { DEFAULT_STATE_DIR } from "../paths.js"

export type WorkerImageProfileRecord = {
  profile: string
  workflow: string
  imageId: string
  imageName?: string
  promotedAtMs: number
}

type WorkerImageProfileStore = {
  profiles: Record<string, WorkerImageProfileRecord>
}

export const defaultWorkerImageProfileStorePath =
  process.env.SWARM_WORKER_IMAGE_PROFILE_STORE_PATH?.trim() ||
  `${DEFAULT_STATE_DIR}/worker-image-profiles.json`

export function readWorkerImageProfileStore(
  path = defaultWorkerImageProfileStorePath,
): WorkerImageProfileStore {
  if (!existsSync(path)) {
    return { profiles: {} }
  }

  try {
    const parsed = JSON.parse(
      readFileSync(path, "utf8"),
    ) as Partial<WorkerImageProfileStore>
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.profiles ||
      typeof parsed.profiles !== "object"
    ) {
      return { profiles: {} }
    }
    return {
      profiles: parsed.profiles as Record<string, WorkerImageProfileRecord>,
    }
  } catch {
    return { profiles: {} }
  }
}

export function writeWorkerImageProfileStore(
  store: WorkerImageProfileStore,
  path = defaultWorkerImageProfileStorePath,
): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(store, null, 2))
}

export function promoteWorkerImageProfile(
  record: WorkerImageProfileRecord,
  path = defaultWorkerImageProfileStorePath,
): WorkerImageProfileRecord {
  const store = readWorkerImageProfileStore(path)
  store.profiles[record.profile] = record
  writeWorkerImageProfileStore(store, path)
  return record
}

export function getWorkerImageProfile(
  profile: string,
  path = defaultWorkerImageProfileStorePath,
): WorkerImageProfileRecord | null {
  const store = readWorkerImageProfileStore(path)
  return store.profiles[profile] ?? null
}
