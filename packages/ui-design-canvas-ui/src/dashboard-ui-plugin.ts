import type { DashboardFeatureUiPlugin } from "@agent-infrastructure/dashboard-plugin"
import { uiDesignCanvasDashboardPlugin } from "./dashboard-plugin"

export const uiDesignCanvasDashboardUiPlugin: DashboardFeatureUiPlugin = {
  ...uiDesignCanvasDashboardPlugin,
  loadScreen: async () => ({
    default: (await import("./UiDesignCanvasScreen.js")).UiDesignCanvasScreen,
  }),
}
