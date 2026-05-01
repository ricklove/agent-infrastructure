import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, extname, resolve } from "node:path"
import type { StoredMessage } from "./store.js"

type StoredAttachmentReader = (url: string) => {
  attachment: { mediaType: string; path: string }
  bytes: Buffer
} | null

type SessionMessagesReader = (sessionId: string) => StoredMessage[]

type WorkAtTarget = {
  host: string
  path: string
  shell: string
}

type WorkAtRegistryFile = {
  targets?: Record<string, Partial<WorkAtTarget> | undefined>
}

export type ResolvedImageSource = {
  normalizedSource: string
  provenance: "attachment" | "temp" | "external" | "worker"
  mediaType: string
  bytes: Uint8Array
}

type ImageSourceResolverOptions = {
  approvedTempImageDir: string
  mediaCacheDir: string
  workAtRegistryPath?: string
  readAttachmentBytes: StoredAttachmentReader
  listMessages: SessionMessagesReader
  remoteFileReader?: (host: string, filePath: string) => Promise<Uint8Array | null>
}

const workAtPattern = /\bwork-at\s+([a-z][a-z0-9._-]*)\b/g

function resolveWorkAtRegistryPath(explicitPath?: string) {
  const trimmedPath = explicitPath?.trim()
  if (trimmedPath) {
    return trimmedPath
  }
  const stateDir = process.env.AGENT_STATE_DIR?.trim() || "/home/ec2-user/state"
  return `${stateDir}/work-at/registry.json`
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

function defaultRemoteFileReader(host: string, filePath: string) {
  return new Promise<Uint8Array | null>((resolveRead, rejectRead) => {
    execFile(
      "ssh",
      [host, `test -f ${shellQuote(filePath)} && cat ${shellQuote(filePath)}`],
      {
        encoding: "buffer",
        maxBuffer: 32 * 1024 * 1024,
      },
      (error, stdout) => {
        if (!error) {
          resolveRead(new Uint8Array(stdout))
          return
        }
        const exitCode =
          typeof (error as NodeJS.ErrnoException & { code?: unknown }).code ===
          "number"
            ? Number((error as NodeJS.ErrnoException & { code?: unknown }).code)
            : null
        if (exitCode === 1) {
          resolveRead(null)
          return
        }
        rejectRead(error)
      },
    )
  })
}

export function normalizeImageSource(sourceUrl: string) {
  const trimmed = sourceUrl.trim()
  if (!trimmed) {
    return ""
  }
  if (trimmed.startsWith("~/")) {
    return resolve("/home/ec2-user", trimmed.slice(2))
  }
  return trimmed
}

export function isLikelyLocalImagePath(sourceUrl: string) {
  return /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(sourceUrl)
}

export function inferImageMediaType(
  sourceUrl: string,
  fallback: string | null = null,
) {
  const normalizedFallback = fallback?.split(";")[0]?.trim() || ""
  if (normalizedFallback.startsWith("image/")) {
    return normalizedFallback
  }

  const lowerSource = sourceUrl.toLowerCase()
  if (lowerSource.endsWith(".jpg") || lowerSource.endsWith(".jpeg")) {
    return "image/jpeg"
  }
  if (lowerSource.endsWith(".gif")) {
    return "image/gif"
  }
  if (lowerSource.endsWith(".webp")) {
    return "image/webp"
  }
  if (lowerSource.endsWith(".svg")) {
    return "image/svg+xml"
  }
  return "image/png"
}

function isApprovedTempImagePath(path: string, approvedTempImageDir: string) {
  const resolvedPath = resolve(path)
  return (
    resolvedPath === approvedTempImageDir ||
    resolvedPath.startsWith(`${approvedTempImageDir}/`)
  )
}

function messageText(message: StoredMessage) {
  return message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n")
}

function lastWorkAtTargetInText(text: string) {
  const matches = [...text.matchAll(workAtPattern)]
  const lastMatch = matches.at(-1)
  return lastMatch?.[1]?.trim() || null
}

export function inferWorkAtTargetName(
  messages: StoredMessage[],
  normalizedSource: string,
) {
  const candidateIndexes: number[] = []

  for (let index = 0; index < messages.length; index += 1) {
    if (messageText(messages[index] ?? ({} as StoredMessage)).includes(normalizedSource)) {
      candidateIndexes.push(index)
    }
  }

  const searchStartIndexes =
    candidateIndexes.length > 0 ? candidateIndexes.reverse() : [messages.length - 1]

  for (const startIndex of searchStartIndexes) {
    for (let index = startIndex; index >= 0; index -= 1) {
      const targetName = lastWorkAtTargetInText(messageText(messages[index]!))
      if (targetName) {
        return targetName
      }
    }
  }

  return null
}

function readWorkAtRegistry(workAtRegistryPath: string) {
  if (!existsSync(workAtRegistryPath)) {
    return {}
  }
  const parsed = JSON.parse(
    readFileSync(workAtRegistryPath, "utf8"),
  ) as WorkAtRegistryFile
  return parsed.targets ?? {}
}

function resolveWorkAtTarget(
  workAtRegistryPath: string,
  targetName: string,
): WorkAtTarget | null {
  const target = readWorkAtRegistry(workAtRegistryPath)[targetName]
  if (!target) {
    return null
  }
  const host = String(target.host ?? "").trim()
  const path = String(target.path ?? "").trim()
  const shell = String(target.shell ?? "/bin/bash").trim() || "/bin/bash"
  if (!host || !path) {
    return null
  }
  return { host, path, shell }
}

function cachePathForRemoteImage(
  mediaCacheDir: string,
  host: string,
  normalizedSource: string,
) {
  const extension = extname(normalizedSource).toLowerCase() || ".png"
  const digest = createHash("sha256")
    .update(`${host}:${normalizedSource}`)
    .digest("hex")
  return resolve(mediaCacheDir, `${digest}${extension}`)
}

async function readRemoteImageToCache(
  host: string,
  normalizedSource: string,
  mediaCacheDir: string,
  remoteFileReader: (host: string, filePath: string) => Promise<Uint8Array | null>,
) {
  const cachePath = cachePathForRemoteImage(mediaCacheDir, host, normalizedSource)
  if (existsSync(cachePath)) {
    return new Uint8Array(readFileSync(cachePath))
  }
  const bytes = await remoteFileReader(host, normalizedSource)
  if (!bytes) {
    return null
  }
  mkdirSync(dirname(cachePath), { recursive: true })
  writeFileSync(cachePath, bytes)
  return bytes
}

export class ImageSourceResolver {
  private readonly remoteFileReader: (
    host: string,
    filePath: string,
  ) => Promise<Uint8Array | null>
  private readonly workAtRegistryPath: string

  constructor(private readonly options: ImageSourceResolverOptions) {
    this.remoteFileReader =
      options.remoteFileReader ?? defaultRemoteFileReader
    this.workAtRegistryPath = resolveWorkAtRegistryPath(
      options.workAtRegistryPath,
    )
  }

  async readImageSource(
    sessionId: string | null,
    sourceUrl: string,
  ): Promise<ResolvedImageSource> {
    const normalizedSource = normalizeImageSource(sourceUrl)
    if (!normalizedSource) {
      throw new Error("Image source required.")
    }

    const attachment = this.options.readAttachmentBytes(normalizedSource)
    if (attachment) {
      return {
        normalizedSource,
        provenance: "attachment",
        mediaType: attachment.attachment.mediaType,
        bytes: attachment.bytes,
      }
    }

    if (
      isApprovedTempImagePath(normalizedSource, this.options.approvedTempImageDir)
    ) {
      if (!existsSync(normalizedSource)) {
        throw new Error("Temporary image not found.")
      }
      const file = Bun.file(normalizedSource)
      return {
        normalizedSource,
        provenance: "temp",
        mediaType: inferImageMediaType(normalizedSource, file.type),
        bytes: new Uint8Array(await file.arrayBuffer()),
      }
    }

    if (normalizedSource.startsWith("/") && existsSync(normalizedSource)) {
      if (!isLikelyLocalImagePath(normalizedSource)) {
        throw new Error("Unsupported local image source.")
      }
      const file = Bun.file(normalizedSource)
      return {
        normalizedSource,
        provenance: "external",
        mediaType: inferImageMediaType(normalizedSource, file.type),
        bytes: new Uint8Array(await file.arrayBuffer()),
      }
    }

    if (
      sessionId &&
      normalizedSource.startsWith("/") &&
      isLikelyLocalImagePath(normalizedSource)
    ) {
      const targetName = inferWorkAtTargetName(
        this.options.listMessages(sessionId),
        normalizedSource,
      )
      if (targetName) {
        const target = resolveWorkAtTarget(
          this.workAtRegistryPath,
          targetName,
        )
        if (target && !["local", "localhost", "manager"].includes(target.host)) {
          const bytes = await readRemoteImageToCache(
            target.host,
            normalizedSource,
            this.options.mediaCacheDir,
            this.remoteFileReader,
          )
          if (bytes) {
            return {
              normalizedSource,
              provenance: "worker",
              mediaType: inferImageMediaType(normalizedSource),
              bytes,
            }
          }
        }
      }

      throw new Error("Image not found on manager or inferred worker target.")
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(normalizedSource)
    } catch {
      throw new Error("Unsupported image source.")
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error("External images must use http or https URLs.")
    }

    const response = await fetch(parsedUrl)
    if (!response.ok) {
      throw new Error(
        `External image request failed with status ${response.status}.`,
      )
    }

    return {
      normalizedSource,
      provenance: "external",
      mediaType: inferImageMediaType(
        normalizedSource,
        response.headers.get("content-type"),
      ),
      bytes: new Uint8Array(await response.arrayBuffer()),
    }
  }
}
