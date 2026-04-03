import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { relative, resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type HmrContext, type Plugin } from "vite"

const versionModuleId = "virtual:dashboard-app-version"
const resolvedVersionModuleId = `\0${versionModuleId}`
const dashboardDevServerPort = Number.parseInt(
  process.env.DASHBOARD_DEV_SERVER_PORT ?? "3300",
  10,
)
const frontendRoots = [
  resolve(__dirname, "src"),
  resolve(__dirname, "index.html"),
  resolve(__dirname, "../../packages/dashboard-ui/src"),
  resolve(__dirname, "../../packages/agent-swarm-ui/src"),
  resolve(__dirname, "../../packages/agent-chat-ui/src"),
  resolve(__dirname, "../../packages/agent-graph-ui/src"),
]

function collectFiles(root: string): string[] {
  const stats = statSync(root)
  if (stats.isFile()) {
    return [root]
  }

  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => collectFiles(resolve(root, entry.name)))
    .sort((left, right) => left.localeCompare(right))
}

function computeFrontendVersion(): string {
  try {
    const gitHead = execFileSync("git", ["rev-parse", "--short=10", "HEAD"], {
      cwd: resolve(__dirname, "../.."),
      encoding: "utf8",
    }).trim()
    if (gitHead) {
      return `dashboard-${gitHead}`
    }
  } catch {}

  const hash = createHash("sha256")
  const files = frontendRoots.flatMap((root) => collectFiles(root))

  for (const file of files) {
    hash.update(relative(__dirname, file))
    hash.update("\n")
    hash.update(readFileSync(file))
    hash.update("\n")
  }

  return `dashboard-${hash.digest("hex").slice(0, 10)}`
}

function versionPlugin(): Plugin {
  return {
    name: "dashboard-app-version",
    resolveId(id: string) {
      if (id === versionModuleId) {
        return resolvedVersionModuleId
      }
      return null
    },
    load(id: string) {
      if (id === resolvedVersionModuleId) {
        return `export const DASHBOARD_APP_VERSION = ${JSON.stringify(computeFrontendVersion())};`
      }
      return null
    },
    handleHotUpdate(ctx: HmrContext) {
      const normalizedFile = resolve(ctx.file)
      const touchesFrontend = frontendRoots.some(
        (root) =>
          normalizedFile === root || normalizedFile.startsWith(`${root}/`),
      )
      if (!touchesFrontend) {
        return
      }

      const versionModule = ctx.server.moduleGraph.getModuleById(
        resolvedVersionModuleId,
      )
      if (!versionModule) {
        return
      }

      ctx.server.moduleGraph.invalidateModule(versionModule)
      return [versionModule]
    },
  }
}

export default defineConfig({
  plugins: [versionPlugin(), react(), tailwindcss()],
  server: {
    allowedHosts: true,
    port: 5173,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${dashboardDevServerPort}`,
        changeOrigin: true,
      },
      "/ws": {
        target: `ws://127.0.0.1:${dashboardDevServerPort}`,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
})
