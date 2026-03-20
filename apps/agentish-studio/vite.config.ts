import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { defineConfig, type HmrContext, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const versionModuleId = "virtual:agent-graph-app-version";
const resolvedVersionModuleId = `\0${versionModuleId}`;
const frontendRoots = [
  resolve(__dirname, "src"),
  resolve(__dirname, "index.html"),
  resolve(__dirname, "../../packages/agent-graph-ui/src"),
];

function collectFiles(root: string): string[] {
  const stats = statSync(root);
  if (stats.isFile()) {
    return [root];
  }

  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => collectFiles(resolve(root, entry.name)))
    .sort((left, right) => left.localeCompare(right));
}

function computeFrontendVersion(): string {
  const hash = createHash("sha256");
  const files = frontendRoots.flatMap((root) => collectFiles(root));

  for (const file of files) {
    hash.update(relative(__dirname, file));
    hash.update("\n");
    hash.update(readFileSync(file));
    hash.update("\n");
  }

  return `frontend-${hash.digest("hex").slice(0, 10)}`;
}

function versionPlugin(): Plugin {
  return {
    name: "agent-graph-app-version",
    resolveId(id: string) {
      if (id === versionModuleId) {
        return resolvedVersionModuleId;
      }
      return null;
    },
    load(id: string) {
      if (id === resolvedVersionModuleId) {
        return `export const AGENT_GRAPH_APP_VERSION = ${JSON.stringify(computeFrontendVersion())};`;
      }
      return null;
    },
    handleHotUpdate(ctx: HmrContext) {
      const normalizedFile = resolve(ctx.file);
      const touchesFrontend = frontendRoots.some((root) => normalizedFile === root || normalizedFile.startsWith(`${root}/`));
      if (!touchesFrontend) {
        return;
      }

      const versionModule = ctx.server.moduleGraph.getModuleById(resolvedVersionModuleId);
      if (!versionModule) {
        return;
      }

      ctx.server.moduleGraph.invalidateModule(versionModule);
      return [versionModule];
    },
  };
}

export default defineConfig({
  plugins: [versionPlugin(), react(), tailwindcss()],
  server: {
    port: 5174,
  },
  preview: {
    port: 4174,
  },
});
