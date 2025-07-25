/**
 * Storage utilities for dashboard export/import
 */

import type {
  Dashboard,
  PanelConfig,
  PanelLayout,
} from "@/types/dashboard.types";
import { v4 as uuidv4 } from "uuid";

export const getStorageImplementation = () => {
  return {
    exportDashboard: async (dashboardId: string): Promise<string> => {
      // Get dashboard from localStorage
      const dashboardsJson = localStorage.getItem("gigapi_dashboards");
      if (!dashboardsJson) throw new Error("No dashboards found");

      const dashboards: Dashboard[] = JSON.parse(dashboardsJson);
      const dashboard = dashboards.find((d) => d.id === dashboardId);
      if (!dashboard) throw new Error("Dashboard not found");

      // Panels are now embedded in the dashboard
      const exportData = {
        dashboard: {
          ...dashboard,
          metadata: {
            ...dashboard.metadata,
            createdAt: new Date(dashboard.metadata.createdAt),
            updatedAt: new Date(dashboard.metadata.updatedAt),
          },
        },
        exportedAt: new Date().toISOString(),
        version: "2.0",
      };

      return JSON.stringify(exportData, null, 2);
    },

    importDashboard: async (jsonData: string): Promise<string> => {
      const importData = JSON.parse(jsonData);
      const { dashboard } = importData;

      const newId = uuidv4();

      // Handle both old format (separate panels) and new format (embedded panels)
      let panels: PanelConfig[] = [];
      if (importData.version === "2.0" || dashboard.panels) {
        // New format - panels are embedded
        panels = dashboard.panels || [];
      } else if (importData.panels) {
        // Old format - panels were separate
        panels = importData.panels;
      }

      // Create a mapping of old panel IDs to new panel IDs
      const panelIdMap = new Map<string, string>();
      const newPanels = panels.map((panel: PanelConfig) => {
        const newPanelId = uuidv4();
        panelIdMap.set(panel.id, newPanelId);
        return {
          ...panel,
          id: newPanelId,
        };
      });

      // Update layout to use new panel IDs
      const newLayout = {
        ...dashboard.layout,
        panels: dashboard.layout.panels.map((panelLayout: PanelLayout) => ({
          ...panelLayout,
          panelId: panelIdMap.get(panelLayout.panelId) || panelLayout.panelId,
        })),
      };

      // Create new dashboard with new ID and embedded panels
      const newDashboard: Dashboard = {
        ...dashboard,
        id: newId,
        name: `${dashboard.name} (Imported)`,
        panels: newPanels,
        layout: newLayout,
        metadata: {
          ...dashboard.metadata,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      // Save dashboard
      const dashboardsJson = localStorage.getItem("gigapi_dashboards");
      const dashboards: Dashboard[] = dashboardsJson
        ? JSON.parse(dashboardsJson)
        : [];
      dashboards.push(newDashboard);
      localStorage.setItem("gigapi_dashboards", JSON.stringify(dashboards));

      return newId;
    },
  };
};
