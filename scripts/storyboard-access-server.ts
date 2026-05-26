#!/usr/bin/env bun

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, extname, join, relative, resolve } from "node:path"

type Config = {
  port: number
  roots: string[]
  defaultStoryboardPath: string | null
  allowWrite: boolean
}

type FilePayload = {
  contents: string
}

const usage = `storyboard-access-server.ts

Starts a small Bun HTTP server for remote storyboard file access.

Examples:
  bun scripts/storyboard-access-server.ts --root /path/to/project
  bun scripts/storyboard-access-server.ts --root /path/to/project --default-storyboard /path/to/project/storyboards/foo.storyboard.json
  bun scripts/storyboard-access-server.ts --root /path/to/project --port 8898

Options:
  --root <path>                Allowed root path. May be repeated.
  --default-storyboard <path>  Optional default storyboard file path.
  --port <port>                Server port. Default: 8798
  --read-only                  Disable writes.
  --help                       Show this help.

Environment:
  STORYBOARD_ACCESS_ROOT
  STORYBOARD_ACCESS_ROOTS
  STORYBOARD_DEFAULT_PATH
  STORYBOARD_ACCESS_PORT
  STORYBOARD_ACCESS_READ_ONLY=1
`

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function parseArgs(argv: string[]) {
  const roots: string[] = []
  let defaultStoryboardPath: string | null = null
  let port: number | null = null
  let readOnly = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--help") {
      console.log(usage)
      process.exit(0)
    }
    if (arg === "--read-only") {
      readOnly = true
      continue
    }
    if (arg === "--root") {
      const value = argv[index + 1]
      if (!value) fail("missing value for --root")
      roots.push(resolve(value))
      index += 1
      continue
    }
    if (arg === "--default-storyboard") {
      const value = argv[index + 1]
      if (!value) fail("missing value for --default-storyboard")
      defaultStoryboardPath = resolve(value)
      index += 1
      continue
    }
    if (arg === "--port") {
      const value = argv[index + 1]
      if (!value) fail("missing value for --port")
      const parsed = Number.parseInt(value, 10)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        fail(`invalid --port value: ${value}`)
      }
      port = parsed
      index += 1
      continue
    }
    fail(`unknown option: ${arg}`)
  }

  const envRoots = [
    process.env.STORYBOARD_ACCESS_ROOT?.trim(),
    ...(process.env.STORYBOARD_ACCESS_ROOTS?.split(":").map((value) => value.trim()) ?? []),
  ].filter((value): value is string => !!value)

  const resolvedRoots = [...roots, ...envRoots.map((value) => resolve(value))]
  const dedupedRoots = Array.from(new Set(resolvedRoots))

  const resolvedDefaultStoryboardPath =
    defaultStoryboardPath ??
    (process.env.STORYBOARD_DEFAULT_PATH?.trim()
      ? resolve(process.env.STORYBOARD_DEFAULT_PATH.trim())
      : null)

  const resolvedPort =
    port ??
    Number.parseInt(process.env.STORYBOARD_ACCESS_PORT?.trim() || "8798", 10)

  return {
    roots: dedupedRoots.length > 0 ? dedupedRoots : [process.cwd()],
    defaultStoryboardPath: resolvedDefaultStoryboardPath,
    port: resolvedPort,
    readOnly: readOnly || process.env.STORYBOARD_ACCESS_READ_ONLY === "1",
  }
}

const parsedArgs = parseArgs(process.argv.slice(2))

const config: Config = {
  roots: parsedArgs.roots,
  defaultStoryboardPath: parsedArgs.defaultStoryboardPath,
  port: parsedArgs.port,
  allowWrite: !parsedArgs.readOnly,
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  })
}

function textError(message: string, status = 400) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  })
}

function isAllowedPath(pathValue: string) {
  return config.roots.some(
    (root) => pathValue === root || pathValue.startsWith(`${root}/`),
  )
}

function resolveAllowedPath(pathValue: string | null | undefined) {
  if (!pathValue?.trim()) {
    throw new Error("missing path")
  }
  const resolved = resolve(pathValue)
  if (!isAllowedPath(resolved)) {
    throw new Error(`path must stay under one of: ${config.roots.join(", ")}`)
  }
  return resolved
}

function fileKind(pathValue: string) {
  if (pathValue.endsWith(".storyboard.json")) return "storyboard-json"
  if (pathValue.endsWith(".storyboard.md")) return "storyboard-markdown"
  return extname(pathValue).slice(1) || "file"
}

function readFileRecord(pathValue: string) {
  const contents = readFileSync(pathValue, "utf8")
  const stats = statSync(pathValue)
  return {
    path: pathValue,
    kind: fileKind(pathValue),
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    contents,
  }
}

function writeFileRecord(pathValue: string, contents: string) {
  mkdirSync(dirname(pathValue), { recursive: true })
  writeFileSync(pathValue, contents, "utf8")
  return readFileRecord(pathValue)
}

function listStoryboardFiles(root: string) {
  const results: Array<{ path: string; kind: string }> = []

  function walk(current: string) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") {
        continue
      }
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }
      if (
        fullPath.endsWith(".storyboard.json") ||
        fullPath.endsWith(".storyboard.md")
      ) {
        results.push({ path: fullPath, kind: fileKind(fullPath) })
      }
    }
  }

  walk(root)
  return results.sort((left, right) => left.path.localeCompare(right.path))
}

async function readPayload(request: Request) {
  const contentType = request.headers.get("content-type") ?? ""
  if (contentType.includes("application/json")) {
    const parsed = (await request.json()) as Partial<FilePayload> & Record<string, unknown>
    if (typeof parsed.contents === "string") {
      return parsed.contents
    }
    return JSON.stringify(parsed, null, 2) + "\n"
  }
  return await request.text()
}

console.log(
  JSON.stringify({
    ok: true,
    event: "storyboard_access_server_started",
    port: config.port,
    roots: config.roots,
    defaultStoryboardPath: config.defaultStoryboardPath,
    allowWrite: config.allowWrite,
  }),
)

Bun.serve({
  port: config.port,
  async fetch(request: Request) {
    const url = new URL(request.url)
    const pathname = url.pathname

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      })
    }

    try {
      if (pathname === "/health") {
        return jsonResponse({ ok: true })
      }

      if (pathname === "/config") {
        return jsonResponse({
          ok: true,
          port: config.port,
          roots: config.roots,
          defaultStoryboardPath: config.defaultStoryboardPath,
          allowWrite: config.allowWrite,
        })
      }

      if (pathname === "/api/storyboard-access/files" && request.method === "GET") {
        const pathValue = resolveAllowedPath(
          url.searchParams.get("path") ?? config.defaultStoryboardPath,
        )
        return jsonResponse({ ok: true, ...readFileRecord(pathValue) })
      }

      if (pathname === "/api/storyboard-access/files" && request.method === "PUT") {
        if (!config.allowWrite) {
          return textError("server is read-only", 403)
        }
        const pathValue = resolveAllowedPath(
          url.searchParams.get("path") ?? config.defaultStoryboardPath,
        )
        const contents = await readPayload(request)
        return jsonResponse({ ok: true, ...writeFileRecord(pathValue, contents) })
      }

      if (pathname === "/api/storyboard-access/storyboard" && request.method === "GET") {
        const pathValue = resolveAllowedPath(
          url.searchParams.get("path") ?? config.defaultStoryboardPath,
        )
        const file = readFileRecord(pathValue)
        if (!pathValue.endsWith(".storyboard.json")) {
          return textError("path must point to a .storyboard.json file", 400)
        }
        return jsonResponse({
          ok: true,
          path: pathValue,
          kind: file.kind,
          mtimeMs: file.mtimeMs,
          size: file.size,
          document: JSON.parse(file.contents),
        })
      }

      if (pathname === "/api/storyboard-access/storyboard" && request.method === "PUT") {
        if (!config.allowWrite) {
          return textError("server is read-only", 403)
        }
        const pathValue = resolveAllowedPath(
          url.searchParams.get("path") ?? config.defaultStoryboardPath,
        )
        if (!pathValue.endsWith(".storyboard.json")) {
          return textError("path must point to a .storyboard.json file", 400)
        }
        const body = (await request.json()) as Record<string, unknown>
        const contents = `${JSON.stringify(body, null, 2)}\n`
        const file = writeFileRecord(pathValue, contents)
        return jsonResponse({
          ok: true,
          path: pathValue,
          kind: file.kind,
          mtimeMs: file.mtimeMs,
          size: file.size,
          document: body,
        })
      }

      if (pathname === "/api/storyboard-access/list" && request.method === "GET") {
        const root = resolveAllowedPath(
          url.searchParams.get("root") ?? config.roots[0],
        )
        const files = listStoryboardFiles(root).map((entry) => ({
          ...entry,
          relativePath: relative(root, entry.path),
        }))
        return jsonResponse({ ok: true, root, files })
      }
    } catch (error) {
      return textError(error instanceof Error ? error.message : String(error), 400)
    }

    return textError("Not found", 404)
  },
})
