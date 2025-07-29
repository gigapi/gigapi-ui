import { atom } from "jotai";
import { useAtom, useSetAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type {
  Dashboard,
  DashboardListItem,
  PanelConfig,
  PanelLayout,
} from "@/types/dashboard.types";
import { v4 as uuidv4 } from "uuid";

// Re-export types that other modules need
export type { Dashboard, PanelConfig } from "@/types/dashboard.types";

// Dashboard state atoms - now using localStorage with embedded panels
export const currentDashboardAtom = atom<Dashboard | null>(null);

// Panel data loading states
export const panelDataAtom = atom<
  Map<string, { data: any[]; error?: string; _refreshRequested?: number }>
>(new Map());
export const panelLoadingStatesAtom = atom<Map<string, boolean>>(new Map());

// Internal atom for raw dashboard data
const dashboardListBaseAtom = atomWithStorage<Dashboard[]>(
  "gigapi_dashboards",
  [],
  {
    getItem: (key) => {
      const stored = localStorage.getItem(key);
      if (!stored) {
        return [];
      }

      const parsed = JSON.parse(stored);
      // Convert date strings back to Date objects
      const dashboards = parsed.map((d: any) => ({
        ...d,
        metadata: {
          ...d.metadata,
          createdAt: new Date(d.metadata.createdAt),
          updatedAt: new Date(d.metadata.updatedAt),
        },
      }));
      return dashboards;
    },
    setItem: (key, value) => {
      const serialized = value.map((d) => ({
        ...d,
        metadata: {
          ...d.metadata,
          createdAt: d.metadata.createdAt.toISOString(),
          updatedAt: d.metadata.updatedAt.toISOString(),
        },
      }));
      localStorage.setItem(key, JSON.stringify(serialized));
    },
    removeItem: (key) => {
      localStorage.removeItem(key);
    },
  }
);

// Public atom that always returns an array (not a Promise)
export const dashboardListAtom = atom(
  (get) => {
    const dashboards = get(dashboardListBaseAtom);
    // If it's a Promise (during initial load), return empty array
    const result = Array.isArray(dashboards) ? dashboards : [];
    return result;
  },
  (_get, set, newValue: Dashboard[]) => {
    set(dashboardListBaseAtom, newValue);
  }
);

export const dashboardLoadingAtom = atom<boolean>(false);
export const dashboardErrorAtom = atom<string | null>(null);

// Edit mode atoms - defined outside the hook
export const isEditModeAtom = atom<boolean>(false);
export const selectedPanelIdAtom = atom<string | null>(null);

// Clear current dashboard atom
export const clearCurrentDashboardAtom = atom(null, (_get, set) => {
  set(currentDashboardAtom, null);
});

// Dashboard actions
export const loadDashboardAtom = atom(
  null,
  async (get, set, dashboardId: string) => {
    set(dashboardLoadingAtom, true);
    set(dashboardErrorAtom, null);

    try {
      // Wait a bit for localStorage to be ready on page reload
      await new Promise((resolve) => setTimeout(resolve, 100));

      const dashboards = get(dashboardListAtom);

      // If no dashboards loaded yet, try to get from localStorage directly
      if (dashboards.length === 0) {
        const stored = localStorage.getItem("gigapi_dashboards");
        if (stored) {
          const parsed = JSON.parse(stored);

          // Convert dates and set the atom
          const convertedDashboards = parsed.map((d: any) => ({
            ...d,
            metadata: {
              ...d.metadata,
              createdAt: new Date(d.metadata.createdAt),
              updatedAt: new Date(d.metadata.updatedAt),
            },
          }));
          set(dashboardListAtom, convertedDashboards);
          // Try to find the dashboard again
          const dashboard = convertedDashboards.find(
            (d: Dashboard) => d.id === dashboardId
          );
          if (dashboard) {
            set(currentDashboardAtom, dashboard);
            return;
          }
        }
      }

      const dashboard = dashboards.find((d: Dashboard) => d.id === dashboardId);

      if (dashboard) {
        set(currentDashboardAtom, dashboard);
      } else {
        console.error("[Dashboard Atoms] Dashboard not found:", dashboardId);
        set(dashboardErrorAtom, "Dashboard not found");
      }
    } catch (error) {
      console.error("[Dashboard Atoms] Error loading dashboard:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load dashboard";
      set(dashboardErrorAtom, errorMessage);
    } finally {
      set(dashboardLoadingAtom, false);
    }
  }
);

export const saveDashboardAtom = atom(
  null,
  async (get, set, dashboard?: Dashboard) => {
    try {
      const dashboardToSave = dashboard || get(currentDashboardAtom);
      if (!dashboardToSave) {
        throw new Error("No dashboard to save");
      }

      const dashboards = get(dashboardListAtom);
      const existingIndex = dashboards.findIndex(
        (d) => d.id === dashboardToSave.id
      );

      const updatedDashboard = {
        ...dashboardToSave,
        metadata: {
          ...dashboardToSave.metadata,
          updatedAt: new Date(),
        },
      };

      let updatedDashboards;
      if (existingIndex >= 0) {
        // Update existing dashboard
        updatedDashboards = [...dashboards];
        updatedDashboards[existingIndex] = updatedDashboard;
      } else {
        // Add new dashboard
        updatedDashboards = [...dashboards, updatedDashboard];
      }

      set(dashboardListAtom, updatedDashboards);
      set(currentDashboardAtom, updatedDashboard);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to save dashboard";
      set(dashboardErrorAtom, errorMessage);
      throw error;
    }
  }
);

// Action atom to update dashboard
export const updateDashboardAtom = atom(
  null,
  async (
    get,
    set,
    {
      dashboardId,
      updates,
    }: { dashboardId: string; updates: Partial<Dashboard> }
  ) => {
    try {
      const dashboards = get(dashboardListAtom);
      const dashboardIndex = dashboards.findIndex((d) => d.id === dashboardId);

      if (dashboardIndex === -1) {
        throw new Error("Dashboard not found");
      }

      const currentDashboard = dashboards[dashboardIndex];
      const updatedDashboard = {
        ...currentDashboard,
        ...updates,
        metadata: {
          ...currentDashboard.metadata,
          ...updates.metadata,
          updatedAt: new Date(),
        },
      };

      // Update in list
      const updatedDashboards = [...dashboards];
      updatedDashboards[dashboardIndex] = updatedDashboard;
      set(dashboardListAtom, updatedDashboards);

      // Update current dashboard if it's the one being modified
      const current = get(currentDashboardAtom);
      if (current?.id === dashboardId) {
        set(currentDashboardAtom, updatedDashboard);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update dashboard";
      set(dashboardErrorAtom, errorMessage);
      throw error;
    }
  }
);

export const deleteDashboardAtom = atom(
  null,
  async (get, set, dashboardId: string) => {
    try {
      // Remove from list
      const currentList = get(dashboardListAtom);
      const updatedList = currentList.filter(
        (d: Dashboard) => d.id !== dashboardId
      );
      set(dashboardListAtom, updatedList);

      // Clear current if it was deleted
      const current = get(currentDashboardAtom);
      if (current?.id === dashboardId) {
        set(currentDashboardAtom, null);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete dashboard";
      set(dashboardErrorAtom, errorMessage);
      throw error;
    }
  }
);

export const createDashboardAtom = atom(
  null,
  async (get, set, dashboardData: Partial<Dashboard>) => {
    try {
      const newDashboard: Dashboard = {
        ...dashboardData,
        id: uuidv4(),
        panels: dashboardData.panels || [],
        metadata: {
          ...dashboardData.metadata,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      } as Dashboard;

      // Add to list
      const currentList = get(dashboardListAtom);
      set(dashboardListAtom, [newDashboard, ...currentList]);
      return newDashboard;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create dashboard";
      set(dashboardErrorAtom, errorMessage);
      throw error;
    }
  }
);

export const addPanelAtom = atom(
  null,
  async (
    get,
    set,
    {
      panelData,
      dashboardId,
    }: { panelData: Partial<PanelConfig>; dashboardId: string }
  ) => {
    try {
      const panelWithId: PanelConfig = {
        ...panelData,
        id: panelData.id || uuidv4(),
      } as PanelConfig;

      // Get current dashboards
      const dashboards = get(dashboardListAtom);
      const dashboardIndex = dashboards.findIndex(
        (d: Dashboard) => d.id === dashboardId
      );

      if (dashboardIndex === -1) {
        throw new Error("Dashboard not found");
      }

      // Add panel to dashboard
      const updatedDashboards = [...dashboards];
      const dashboard = updatedDashboards[dashboardIndex];

      // Calculate position for new panel in grid
      const existingPanels = dashboard.layout?.panels || [];
      
      // Use provided layout dimensions or defaults
      const layoutFromPanelData = (panelData as any).layout;
      const width = layoutFromPanelData?.w || 6; // Half width default
      const height = layoutFromPanelData?.h || 8; // Default height (8 * 60 = 480px)
      const minWidth = layoutFromPanelData?.minW || 2;
      const minHeight = layoutFromPanelData?.minH || 2;
      
      const newPanelLayout = {
        panelId: panelWithId.id,
        x: 0,
        y:
          existingPanels.length > 0
            ? Math.max(...existingPanels.map((p) => p.y + p.h))
            : 0,
        w: width,
        h: height,
        minW: minWidth,
        minH: minHeight,
      };

      updatedDashboards[dashboardIndex] = {
        ...dashboard,
        panels: [...(dashboard.panels || []), panelWithId],
        layout: {
          ...dashboard.layout,
          panels: [...existingPanels, newPanelLayout],
        },
        metadata: {
          ...dashboard.metadata,
          updatedAt: new Date(),
        },
      };

      set(dashboardListAtom, updatedDashboards);

      // Update current dashboard if it's the one being modified
      const currentDashboard = get(currentDashboardAtom);
      if (currentDashboard?.id === dashboardId) {
        set(currentDashboardAtom, updatedDashboards[dashboardIndex]);
      }
      return panelWithId;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to add panel";
      set(dashboardErrorAtom, errorMessage);
      throw error;
    }
  }
);

export const removePanelAtom = atom(
  null,
  async (
    get,
    set,
    { panelId, dashboardId }: { panelId: string; dashboardId: string }
  ) => {
    try {
      // Get current dashboards
      const dashboards = get(dashboardListAtom);
      const dashboardIndex = dashboards.findIndex(
        (d: Dashboard) => d.id === dashboardId
      );

      if (dashboardIndex === -1) {
        throw new Error("Dashboard not found");
      }

      // Remove panel from dashboard
      const updatedDashboards = [...dashboards];
      const dashboard = updatedDashboards[dashboardIndex];

      updatedDashboards[dashboardIndex] = {
        ...dashboard,
        panels: dashboard.panels.filter((p: PanelConfig) => p.id !== panelId),
        layout: {
          ...dashboard.layout,
          panels: dashboard.layout.panels.filter(
            (p: PanelLayout) => p.panelId !== panelId
          ),
        },
        metadata: {
          ...dashboard.metadata,
          updatedAt: new Date(),
        },
      };

      set(dashboardListAtom, updatedDashboards);

      // Update current dashboard if it's the one being modified
      const currentDashboard = get(currentDashboardAtom);
      if (currentDashboard?.id === dashboardId) {
        set(currentDashboardAtom, updatedDashboards[dashboardIndex]);
      }

      // Clean up panel data for deleted panel
      const panelData = get(panelDataAtom);
      const loadingStates = get(panelLoadingStatesAtom);
      const newPanelData = new Map(panelData);
      const newLoadingStates = new Map(loadingStates);

      // Remove all entries for this panel ID
      for (const [key] of newPanelData) {
        if (key === panelId || key.startsWith(panelId + "-")) {
          newPanelData.delete(key);
          newLoadingStates.delete(key);
        }
      }

      set(panelDataAtom, newPanelData);
      set(panelLoadingStatesAtom, newLoadingStates);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to remove panel";
      set(dashboardErrorAtom, errorMessage);
      throw error;
    }
  }
);

// Derived atoms
export const dashboardListItemsAtom = atom((get): DashboardListItem[] => {
  const dashboards = get(dashboardListAtom);

  return dashboards
    .map((dashboard: Dashboard) => ({
      id: dashboard.id,
      name: dashboard.name,
      description: dashboard.description,
      tags: dashboard.metadata?.tags || [],
      createdAt: dashboard.metadata.createdAt,
      updatedAt: dashboard.metadata.updatedAt,
      panelCount: dashboard.panels?.length || 0,
    }))
    .sort(
      (a: DashboardListItem, b: DashboardListItem) =>
        b.updatedAt.getTime() - a.updatedAt.getTime()
    );
});

export const currentDashboardPanelsAtom = atom((get): PanelConfig[] => {
  const currentDashboard = get(currentDashboardAtom);

  if (!currentDashboard) return [];
  return currentDashboard.panels || [];
});

// useDashboardSafely hook - returns dashboard context with currentDashboard as null if not loaded
export function useDashboardSafely() {
  // Simply return the dashboard context - currentDashboard will be null if not in a dashboard view
  return useDashboard();
}

// Action atom to refresh panel data
// This now acts as a trigger - actual query execution happens in components via usePanelQuery hook
export const refreshPanelDataAtom = atom(
  null,
  async (get, set, { panelId }: { panelId: string; config?: PanelConfig }) => {
    // Mark panel data as stale to trigger refresh in components
    const panelData = new Map(get(panelDataAtom));
    const currentData = panelData.get(panelId);

    // Add a refresh timestamp to trigger re-render in components watching this data
    panelData.set(panelId, {
      ...(currentData || { data: [] }),
      _refreshRequested: Date.now(),
    });
    set(panelDataAtom, panelData);
  }
);

// Action atom to refresh all panels - triggers refresh in components
export const refreshAllPanelsAtom = atom(null, async (get, set) => {
  const currentDashboard = get(currentDashboardAtom);
  if (!currentDashboard || !currentDashboard.panels) {
    return;
  }

  // Simply mark all panels as needing refresh
  const panelData = new Map(get(panelDataAtom));
  currentDashboard.panels.forEach((panel) => {
    const current = panelData.get(panel.id);
    panelData.set(panel.id, {
      ...(current || { data: [] }),
      _refreshRequested: Date.now(),
    });
  });
  set(panelDataAtom, panelData);
});

// useDashboard hook - provides all dashboard functionality

export function useDashboard() {
  const [currentDashboard] = useAtom(currentDashboardAtom);
  const [dashboardList] = useAtom(dashboardListItemsAtom);
  const [panels] = useAtom(currentDashboardPanelsAtom);
  const [loading] = useAtom(dashboardLoadingAtom);
  const [error] = useAtom(dashboardErrorAtom);
  const [panelDataMap] = useAtom(panelDataAtom);
  const [panelLoadingStates] = useAtom(panelLoadingStatesAtom);

  const loadDashboard = useSetAtom(loadDashboardAtom);
  const saveDashboard = useSetAtom(saveDashboardAtom);
  const deleteDashboard = useSetAtom(deleteDashboardAtom);
  const createDashboard = useSetAtom(createDashboardAtom);
  const addPanel = useSetAtom(addPanelAtom);
  const removePanel = useSetAtom(removePanelAtom);
  const refreshPanelDataAction = useSetAtom(refreshPanelDataAtom);
  const refreshAllPanelsAction = useSetAtom(refreshAllPanelsAtom);

  // Edit mode state - use the atoms defined outside
  const [isEditMode, setEditMode] = useAtom(isEditModeAtom);
  const [selectedPanelId, setSelectedPanel] = useAtom(selectedPanelIdAtom);

  // Clear current dashboard - create a proper atom outside
  const clearCurrentDashboard = useSetAtom(clearCurrentDashboardAtom);

  // Update dashboard
  const updateDashboard = async (
    dashboardId: string,
    updates: Partial<Dashboard>
  ) => {
    if (!currentDashboard || currentDashboard.id !== dashboardId) return;

    const updatedDashboard = {
      ...currentDashboard,
      ...updates,
      metadata: {
        ...currentDashboard.metadata,
        ...updates.metadata,
        updatedAt: new Date(),
      },
    };

    await saveDashboard(updatedDashboard);
  };

  // Time range management
  const updateDashboardTimeRange = (timeRange: any) => {
    if (!currentDashboard) return;
    updateDashboard(currentDashboard.id, { timeRange });
  };

  const resetDashboardTimeRange = () => {
    if (!currentDashboard) return;
    updateDashboard(currentDashboard.id, {
      timeRange: { type: "relative", from: "5m", to: "now" },
    });
  };

  const updateDashboardTimeZone = (timeZone: string) => {
    if (!currentDashboard) return;
    updateDashboard(currentDashboard.id, { timeZone });
  };

  // Panel management
  const getPanelById = (panelId: string): PanelConfig | undefined => {
    if (!currentDashboard) return undefined;
    return currentDashboard.panels.find((p) => p.id === panelId);
  };

  const updatePanel = async (
    panelId: string,
    updates: Partial<PanelConfig>
  ) => {
    if (!currentDashboard) return;

    const panelIndex = currentDashboard.panels.findIndex(
      (p) => p.id === panelId
    );
    if (panelIndex === -1) return;

    const updatedPanels = [...currentDashboard.panels];
    updatedPanels[panelIndex] = {
      ...updatedPanels[panelIndex],
      ...updates,
    };

    await updateDashboard(currentDashboard.id, { panels: updatedPanels });
  };

  const refreshAllPanels = async () => {
    await refreshAllPanelsAction();
  };

  const refreshPanelData = async (panelId: string) => {
    // Just trigger refresh - actual execution happens in components
    await refreshPanelDataAction({ panelId });
  };

  const deletePanel = async (panelId: string) => {
    if (!currentDashboard) return;
    await removePanel({ panelId, dashboardId: currentDashboard.id });
  };

  const duplicatePanel = async (panelId: string) => {
    if (!currentDashboard || !panels) return;
    const panelToDuplicate = panels.find((p) => p.id === panelId);
    if (!panelToDuplicate) return;

    // Find the layout information for the panel being duplicated
    const originalLayout = currentDashboard.layout?.panels?.find(
      (layout) => layout.panelId === panelId
    );

    const newPanelId = uuidv4();
    const newPanel = {
      ...panelToDuplicate,
      id: newPanelId,
      title: `${panelToDuplicate.title} (Copy)`,
    };

    // Include layout information if available
    const panelDataWithLayout = originalLayout
      ? {
          ...newPanel,
          layout: {
            w: originalLayout.w,
            h: originalLayout.h,
            minW: originalLayout.minW,
            minH: originalLayout.minH,
          },
        }
      : newPanel;

    await addPanel({ panelData: panelDataWithLayout, dashboardId: currentDashboard.id });
  };

  const isPanelLoading = (panelId: string) =>
    panelLoadingStates.get(panelId) || false;

  // Layout management
  const updateLayout = async (layouts: PanelLayout[]) => {
    if (!currentDashboard) return;

    // Update the layout in the current dashboard
    const updatedDashboard = {
      ...currentDashboard,
      layout: {
        ...currentDashboard.layout,
        panels: layouts,
      },
    };

    // Save the updated dashboard
    await saveDashboard(updatedDashboard);
  };

  return {
    // State
    currentDashboard,
    dashboardList,
    panels,
    loading,
    error,
    isEditMode,
    selectedPanelId,
    panelData: panelDataMap,

    // Actions
    loadDashboard,
    saveDashboard,
    deleteDashboard,
    createDashboard,
    updateDashboard,
    clearCurrentDashboard,

    // Edit mode
    setEditMode,
    setSelectedPanel,

    // Time management
    updateDashboardTimeRange,
    resetDashboardTimeRange,
    updateDashboardTimeZone,

    // Panel management
    addPanel,
    removePanel,
    refreshAllPanels,
    refreshPanelData,
    deletePanel,
    duplicatePanel,
    isPanelLoading,
    updateLayout,
    getPanelById,
    updatePanel,
  };
}
