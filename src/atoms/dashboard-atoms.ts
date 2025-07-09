import { atom } from "jotai";
import { useAtom, useSetAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { Dashboard, DashboardListItem, PanelConfig, PanelLayout } from "@/types/dashboard.types";
import { apiUrlAtom } from "@/atoms/connection";

// Dashboard state atoms - now using localStorage with embedded panels
export const currentDashboardAtom = atom<Dashboard | null>(null);

// Panel data loading states
export const panelDataAtom = atom<Map<string, { data: any[]; error?: string }>>(new Map());
export const panelLoadingStatesAtom = atom<Map<string, boolean>>(new Map());

// Internal atom for raw dashboard data
const dashboardListBaseAtom = atomWithStorage<Dashboard[]>("gigapi_dashboards", [], {
  getItem: (key) => {
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    
    const dashboards = JSON.parse(stored);
    
    // Migration: If dashboards don't have panels, try to load from old structure
    const panelsData = localStorage.getItem("gigapi_dashboard_panels");
    if (panelsData && dashboards.some((d: any) => !d.panels)) {
      const allPanels = JSON.parse(panelsData);
      return dashboards.map((dashboard: any) => ({
        ...dashboard,
        panels: allPanels[dashboard.id] || [],
        metadata: {
          ...dashboard.metadata,
          createdAt: new Date(dashboard.metadata.createdAt),
          updatedAt: new Date(dashboard.metadata.updatedAt),
        },
      }));
    }
    
    // Normal case: parse dates
    return dashboards.map((d: any) => ({
      ...d,
      panels: d.panels || [],
      metadata: {
        ...d.metadata,
        createdAt: new Date(d.metadata.createdAt),
        updatedAt: new Date(d.metadata.updatedAt),
      },
    }));
  },
  setItem: (key, value) => {
    const serialized = value.map(d => ({
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
});

// Public atom that always returns an array (not a Promise)
export const dashboardListAtom = atom(
  (get) => {
    const dashboards = get(dashboardListBaseAtom);
    // If it's a Promise (during initial load), return empty array
    return Array.isArray(dashboards) ? dashboards : [];
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
export const clearCurrentDashboardAtom = atom(
  null,
  (_get, set) => {
    set(currentDashboardAtom, null);
  }
);

// Dashboard actions
export const loadDashboardAtom = atom(
  null,
  async (get, set, dashboardId: string) => {
    set(dashboardLoadingAtom, true);
    set(dashboardErrorAtom, null);

    try {
      const dashboards = get(dashboardListAtom);
      const dashboard = dashboards.find((d: Dashboard) => d.id === dashboardId);

      if (dashboard) {
        set(currentDashboardAtom, dashboard);
        console.log(`[Dashboard] Loaded dashboard: ${dashboard.name}`);
      } else {
        set(dashboardErrorAtom, "Dashboard not found");
      }
    } catch (error) {
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
  async (get, set, dashboard: Dashboard) => {
    try {
      const dashboards = get(dashboardListAtom);
      const existingIndex = dashboards.findIndex(d => d.id === dashboard.id);
      
      const updatedDashboard = {
        ...dashboard,
        metadata: {
          ...dashboard.metadata,
          updatedAt: new Date()
        }
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
      console.log(`[Dashboard] Saved dashboard: ${dashboard.name}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to save dashboard";
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
      const updatedList = currentList.filter((d: Dashboard) => d.id !== dashboardId);
      set(dashboardListAtom, updatedList);

      // Clear current if it was deleted
      const current = get(currentDashboardAtom);
      if (current?.id === dashboardId) {
        set(currentDashboardAtom, null);
      }

      console.log(`[Dashboard] Deleted dashboard: ${dashboardId}`);
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
        id: crypto.randomUUID(),
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

      console.log(`[Dashboard] Created dashboard: ${newDashboard.name}`);
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
    { panelData, dashboardId }: { panelData: Partial<PanelConfig>; dashboardId: string }
  ) => {
    try {
      const panelWithId: PanelConfig = {
        ...panelData,
        id: panelData.id || crypto.randomUUID(),
      } as PanelConfig;

      // Get current dashboards
      const dashboards = get(dashboardListAtom);
      const dashboardIndex = dashboards.findIndex((d: Dashboard) => d.id === dashboardId);
      
      if (dashboardIndex === -1) {
        throw new Error("Dashboard not found");
      }
      
      // Add panel to dashboard
      const updatedDashboards = [...dashboards];
      const dashboard = updatedDashboards[dashboardIndex];
      
      // Calculate position for new panel in grid
      const existingPanels = dashboard.layout?.panels || [];
      const newPanelLayout = {
        panelId: panelWithId.id,
        x: 0,
        y: existingPanels.length > 0 
          ? Math.max(...existingPanels.map(p => p.y + p.h)) 
          : 0,
        w: 6, // Half width
        h: 8, // Default height (8 * 60 = 480px)
        minW: 2,
        minH: 2,
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

      console.log(`[Dashboard] Added panel to dashboard ${dashboardId}: ${panelWithId.title}`);
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
  async (get, set, { panelId, dashboardId }: { panelId: string; dashboardId: string }) => {
    try {
      // Get current dashboards
      const dashboards = get(dashboardListAtom);
      const dashboardIndex = dashboards.findIndex((d: Dashboard) => d.id === dashboardId);
      
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
          panels: dashboard.layout.panels.filter((p: PanelLayout) => p.panelId !== panelId),
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

      console.log(`[Dashboard] Removed panel ${panelId} from dashboard ${dashboardId}`);
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
  
  return dashboards.map((dashboard: Dashboard) => ({
    id: dashboard.id,
    name: dashboard.name,
    description: dashboard.description,
    tags: dashboard.metadata?.tags || [],
    createdAt: dashboard.metadata.createdAt,
    updatedAt: dashboard.metadata.updatedAt,
    panelCount: dashboard.panels?.length || 0,
  })).sort((a: DashboardListItem, b: DashboardListItem) => b.updatedAt.getTime() - a.updatedAt.getTime());
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
export const refreshPanelDataAtom = atom(
  null,
  async (get, set, { panelId, config }: { panelId: string; config: PanelConfig }) => {
    const apiUrl = get(apiUrlAtom);
    const currentDashboard = get(currentDashboardAtom);
    
    console.log('🔥 [Panel] Refreshing panel data for:', panelId);
    console.log('🔥 [Panel] Config:', config);
    console.log('🔥 [Panel] API URL:', apiUrl);
    console.log('🔥 [Panel] Current dashboard:', !!currentDashboard);
    
    if (!apiUrl || !currentDashboard) {
      console.error('🔥 [Panel] No API URL or dashboard available', { apiUrl, currentDashboard: !!currentDashboard });
      return;
    }
    
    // Update loading state
    const loadingStates = new Map(get(panelLoadingStatesAtom));
    loadingStates.set(panelId, true);
    set(panelLoadingStatesAtom, loadingStates);
    
    try {
      // Import here to avoid circular dependency
      const { QueryProcessor } = await import('@/lib/query-processor');
      const axios = (await import('axios')).default;
      
      // Process the query with time variables
      const processedResult = QueryProcessor.process({
        database: config.database || '',
        query: config.query || '',
        timeRange: currentDashboard.timeRange,
        timeZone: currentDashboard.timeZone || 'UTC',
        maxDataPoints: config.maxDataPoints || 1000,
        timeField: config.timeField,
        table: config.table,
      });
      
      const response = await axios.post(
        `${apiUrl}?db=${encodeURIComponent(config.database || '')}&format=ndjson`,
        { query: processedResult.query },
        {
          responseType: 'text',
          headers: {
            'Content-Type': 'application/x-ndjson',
            Accept: 'application/x-ndjson',
          },
        }
      );
      
      // Parse NDJSON response
      const lines = response.data.split('\n').filter((line: string) => line.trim());
      const results: any[] = [];
      
      for (const line of lines) {
        try {
          results.push(JSON.parse(line));
        } catch (e) {
          console.error('Error parsing NDJSON line:', e);
        }
      }
      
      // Update panel data
      const panelData = new Map(get(panelDataAtom));
      panelData.set(panelId, { data: results });
      set(panelDataAtom, panelData);
      
    } catch (error: any) {
      console.error('🔥 [Panel] Failed to refresh panel', panelId, ':', error);
      
      // Update panel data with error
      const panelData = new Map(get(panelDataAtom));
      panelData.set(panelId, { 
        data: [], 
        error: error.message || 'Failed to load panel data' 
      });
      set(panelDataAtom, panelData);
    } finally {
      // Update loading state
      const loadingStates = new Map(get(panelLoadingStatesAtom));
      loadingStates.set(panelId, false);
      set(panelLoadingStatesAtom, loadingStates);
    }
  }
);

// Action atom to refresh all panels
export const refreshAllPanelsAtom = atom(
  null,
  async (get, set) => {
    const currentDashboard = get(currentDashboardAtom);
    if (!currentDashboard || !currentDashboard.panels) return;
    
    // Refresh all panels in parallel
    const refreshPromises = currentDashboard.panels.map(panel => 
      set(refreshPanelDataAtom, { panelId: panel.id, config: panel })
    );
    
    await Promise.all(refreshPromises);
  }
);

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
  const updateDashboard = async (dashboardId: string, updates: Partial<Dashboard>) => {
    if (!currentDashboard || currentDashboard.id !== dashboardId) return;
    
    const updatedDashboard = {
      ...currentDashboard,
      ...updates,
      metadata: {
        ...currentDashboard.metadata,
        ...updates.metadata,
        updatedAt: new Date()
      }
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
      timeRange: { type: "relative", from: "5m", to: "now" }
    });
  };
  
  const updateDashboardTimeZone = (timeZone: string) => {
    if (!currentDashboard) return;
    updateDashboard(currentDashboard.id, { timeZone });
  };
  
  // Panel management
  const getPanelById = (panelId: string): PanelConfig | undefined => {
    if (!currentDashboard) return undefined;
    return currentDashboard.panels.find(p => p.id === panelId);
  };
  
  const updatePanel = async (panelId: string, updates: Partial<PanelConfig>) => {
    if (!currentDashboard) return;
    
    const panelIndex = currentDashboard.panels.findIndex(p => p.id === panelId);
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
    if (!currentDashboard) return;
    const panel = currentDashboard.panels.find(p => p.id === panelId);
    if (!panel) {
      console.error(`Panel ${panelId} not found`);
      return;
    }
    await refreshPanelDataAction({ panelId, config: panel });
  };
  
  const deletePanel = async (panelId: string) => {
    if (!currentDashboard) return;
    await removePanel({ panelId, dashboardId: currentDashboard.id });
  };
  
  const duplicatePanel = async (panelId: string) => {
    if (!currentDashboard || !panels) return;
    const panelToDuplicate = panels.find(p => p.id === panelId);
    if (!panelToDuplicate) return;
    
    const newPanel = {
      ...panelToDuplicate,
      id: crypto.randomUUID(),
      title: `${panelToDuplicate.title} (Copy)`,
    };
    
    await addPanel({ panelData: newPanel, dashboardId: currentDashboard.id });
  };
  
  const isPanelLoading = (panelId: string) => panelLoadingStates.get(panelId) || false;
  const panelData = panelDataMap;
  
  // Layout management
  const updateLayout = (layouts: any) => {
    console.log("Updating layout", layouts);
    // Implementation would update panel layouts
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
    panelData,
    
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