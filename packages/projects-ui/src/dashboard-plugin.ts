import type { DashboardFeaturePlugin } from "@agent-infrastructure/dashboard-plugin";

export const projectsDashboardPlugin: DashboardFeaturePlugin = {
  id: "projects",
  label: "Projects",
  route: "/projects",
  description: "Manage private repos, GitHub App access, and project integration settings.",
  icon: "projects",
  screen: {
    getProps: ({ windowOrigin }) => ({
      apiRootUrl: `${windowOrigin}/api/projects`,
    }),
  },
  backend: {
    id: "projects",
    apiBasePath: "/api/projects",
    defaultBaseUrl: "http://127.0.0.1:8791",
    healthPath: "/api/projects/health",
    startupPolicy: "lazy",
    startup: {
      kind: "bun-entry",
      entry: "packages/projects-server/src/index.ts",
      logFileName: "projects-server.log",
    },
  },
};
