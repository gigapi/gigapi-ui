import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useMemo,
} from "react";
import { v4 as uuidv4 } from "uuid";
import {
  type Dashboard,
  type PanelConfig,
  type PanelData,
  type PanelLayout,
  type DashboardContextType,
  type TimeRange,
} from "@/types/dashboard.types";
import { dashboardStorage } from "@/lib/dashboard/storage";
import QueryProcessor, { DataTransformer } from "@/lib/query-processor";
import { useDashboardQuery } from "@/hooks/useDashboardQuery";
import { toast } from "sonner";

const DashboardContext = createContext<DashboardContextType | null>(null);


export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    console.error("useDashboard called outside of DashboardProvider");
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return context;
}

// Add a hook to safely check if dashboard context is available
export function useDashboardSafely() {
  const context = useContext(DashboardContext);
  return context; // Returns null if not in provider
}

interface DashboardProviderProps {
  children: React.ReactNode;
}

/**
 * Provides dashboard and panel management state and functionality.
 * This includes creating, loading, updating, and deleting dashboards and their panels,
 * as well as managing panel data, layout, and UI state like edit mode.
 */
export function DashboardProvider({ children }: DashboardProviderProps) {
  const [currentDashboard, setCurrentDashboard] = useState<Dashboard | null>(
    null
  );
  const [panels, setPanels] = useState<Map<string, PanelConfig>>(new Map());
  const [panelData, setPanelData] = useState<Map<string, PanelData>>(new Map());
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [isConfigSidebarOpen, setIsConfigSidebarOpen] = useState(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [originalTimeRange, setOriginalTimeRange] = useState<TimeRange | null>(null);

  const { executeQuery: executeDashboardQuery } = useDashboardQuery();

  const clearCurrentDashboard = useCallback(() => {
    setCurrentDashboard(null);
    setPanels(new Map());
    setPanelData(new Map());
    setIsEditMode(false);
    setSelectedPanelId(null);
    // setError(null); // Optionally reset error state
    // setLoading(false); // Optionally reset loading state
  }, []);

  // --- Dashboard Operations ---

  /**
   * Creates a new dashboard, saves it to storage, and sets it as the current dashboard.
   * @param dashboardData - The initial data for the new dashboard (name, description, etc.).
   * @returns A promise that resolves to the newly created Dashboard object.
   */
  const createDashboard = useCallback(
    async (
      dashboardData: Omit<Dashboard, "id" | "metadata">
    ): Promise<Dashboard> => {
      setLoading(true);
      setError(null);
      const newDashboard: Dashboard = {
        ...dashboardData,
        id: uuidv4(),
        // Ensure dashboard has a default time range if not provided
        timeRange: dashboardData.timeRange || {
          type: "relative" as const,
          from: "1h",
          to: "now" as const,
        },
        timeZone: dashboardData.timeZone || "UTC",
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          tags: [],
        },
      };

      try {
        await dashboardStorage.saveDashboard(newDashboard);
        setCurrentDashboard(newDashboard);
        setPanels(new Map());
        setPanelData(new Map());
        toast.success("Dashboard created successfully");
        setLoading(false);
        return newDashboard;
      } catch (err) {
        console.error("Failed to create dashboard:", err);
        toast.error("Failed to create dashboard");
        setError(err instanceof Error ? err.message : "Failed to create dashboard");
        setLoading(false);
        throw err;
      }
    },
    []
  );

  /**
   * Updates the currently loaded dashboard with new data.
   * @param id - The ID of the dashboard to update. Must match the current dashboard.
   * @param updates - An object containing the properties of the dashboard to update.
   */
  const updateDashboard = useCallback(
    async (id: string, updates: Partial<Dashboard>) => {
      if (!currentDashboard || currentDashboard.id !== id) {
        // setError("Cannot update a dashboard that is not currently loaded."); // Optionally set error
        throw new Error(
          "Cannot update a dashboard that is not currently loaded."
        );
      }
      // No setLoading(true) here as it might be too frequent for minor updates
      // setError(null); // Clear previous errors before attempting update

      const updatedDashboard: Dashboard = {
        ...currentDashboard,
        ...updates,
        metadata: {
          ...currentDashboard.metadata,
          ...updates.metadata,
          updatedAt: new Date(),
        },
      };

      try {
        await dashboardStorage.saveDashboard(updatedDashboard);
        setCurrentDashboard(updatedDashboard);
        toast.success("Dashboard updated");
      } catch (err) {
        console.error("Failed to update dashboard:", err);
        toast.error("Failed to update dashboard");
        // setError(err instanceof Error ? err.message : "Failed to update dashboard"); // Optionally set error
        throw err;
      }
    },
    [currentDashboard]
  );

  /**
   * Deletes a dashboard from storage. If it's the currently loaded one, it clears the state.
   * @param id - The ID of the dashboard to delete.
   */
  const deleteDashboard = useCallback(
    async (id: string) => {
      try {
        await dashboardStorage.deleteDashboard(id);

        if (currentDashboard?.id === id) {
          clearCurrentDashboard(); // Use the new clear function
        }
        toast.success("Dashboard deleted");
      } catch (err) {
        console.error(`Failed to delete dashboard with ID ${id}:`, err);
        toast.error("Failed to delete dashboard");
        throw err;
      }
    },
    [currentDashboard, clearCurrentDashboard]
  );

  /**
   * Loads a dashboard and its associated panels from storage.
   * @param id - The ID of the dashboard to load.
   * @throws Will throw an error if the dashboard is not found in storage.
   */
  const loadDashboard = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const dashboard = await dashboardStorage.getDashboard(id);
      if (!dashboard) {
        const errMsg = `Dashboard with ID "${id}" not found.`;
        toast.error(errMsg);
        setError(errMsg);
        setLoading(false);
        clearCurrentDashboard(); 
        throw new Error(errMsg);
      }

      // Ensure loaded dashboard has time range and timezone
      const dashboardWithDefaults = {
        ...dashboard,
        timeRange: dashboard.timeRange || {
          type: "relative" as const,
          from: "1h",
          to: "now" as const,
        },
        timeZone: dashboard.timeZone || "UTC",
      };
      
      // Save with defaults if they were missing
      if (!dashboard.timeRange || !dashboard.timeZone) {
        await dashboardStorage.saveDashboard(dashboardWithDefaults);
      }
      
      setCurrentDashboard(dashboardWithDefaults);
      // Set original time range for reset functionality
      setOriginalTimeRange(dashboardWithDefaults.timeRange);
      const panelsArray = await dashboardStorage.getPanelsForDashboard(id);
      const panelsMap = new Map<string, PanelConfig>();
      panelsArray.forEach((panel) => panelsMap.set(panel.id, panel));
      setPanels(panelsMap);
      setPanelData(new Map()); // Data fetched by panel components or auto-execution
      setLoading(false);
    } catch (err) {
      console.error("Failed to load dashboard:", err);
      const errMsg = err instanceof Error ? err.message : "An error occurred while loading the dashboard.";
      if (!errMsg.includes("not found")) { 
          toast.error("An error occurred while loading the dashboard.");
      }
      setError(errMsg);
      setLoading(false);
      if (!currentDashboard) clearCurrentDashboard(); 

      throw err;
    }
  }, [clearCurrentDashboard]); 

  const getPanelById = useCallback(
    (panelId: string): PanelConfig | undefined => {
      return panels.get(panelId);
    },
    [panels]
  );

  /**
   * Saves the current state of the loaded dashboard to storage.
   */
  const saveDashboard = useCallback(async () => {
    if (!currentDashboard) {
      toast.error("No dashboard is loaded to save.");
      setError("No dashboard to save");
      throw new Error("No dashboard to save");
    }
    try {
      await updateDashboard(currentDashboard.id, currentDashboard);
    } catch (err) {
      throw err;
    }
  }, [currentDashboard, updateDashboard]);

  // --- Panel Operations ---

  /**
   * Adds a new panel to the current dashboard.
   * @param panelData - The configuration for the new panel, excluding the 'id'.
   * @returns A promise that resolves to the new panel's ID.
   */
  const addPanel = useCallback(
    async (panelData: Omit<PanelConfig, "id">): Promise<string> => {
      if (!currentDashboard) {
        toast.error("Cannot add a panel without a loaded dashboard.");
        throw new Error("Cannot add panel: No dashboard is loaded.");
      }

      const panelId = uuidv4();
      const newPanel: PanelConfig = { ...panelData, id: panelId };

      await dashboardStorage.savePanel({
        ...newPanel,
        dashboardId: currentDashboard.id,
      });
      setPanels((prev) => new Map(prev.set(panelId, newPanel)));

      const newLayout: PanelLayout = {
        panelId,
        x: 0,
        y: 0,
        w: 6,
        h: 8,
        minW: 3,
        minH: 4,
      };

      await updateDashboard(currentDashboard.id, {
        layout: {
          ...currentDashboard.layout,
          panels: [...currentDashboard.layout.panels, newLayout],
        },
      });

      toast.success("Panel added");
      return panelId;
    },
    [currentDashboard, updateDashboard]
  );

  /**
   * Updates an existing panel's configuration.
   * @param id - The ID of the panel to update.
   * @param updates - An object with the panel properties to change.
   */
  const updatePanel = useCallback(
    async (id: string, updates: Partial<PanelConfig>) => {
      const existingPanel = panels.get(id);
      if (!existingPanel || !currentDashboard)
        throw new Error("Panel not found or dashboard not loaded.");

      const updatedPanel: PanelConfig = { ...existingPanel, ...updates };

      await dashboardStorage.savePanel({
        ...updatedPanel,
        dashboardId: currentDashboard.id,
      });
      setPanels((prev) => new Map(prev.set(id, updatedPanel)));
    },
    [panels, currentDashboard]
  );

  /**
   * Deletes a panel from the dashboard and storage.
   * @param id - The ID of the panel to delete.
   */
  const deletePanel = useCallback(
    async (id: string) => {
      if (!currentDashboard) throw new Error("Dashboard not loaded.");

      await dashboardStorage.deletePanel(id);

      setPanels((prev) => {
        const newPanels = new Map(prev);
        newPanels.delete(id);
        return newPanels;
      });

      setPanelData((prev) => {
        const newData = new Map(prev);
        newData.delete(id);
        return newData;
      });

      await updateDashboard(currentDashboard.id, {
        layout: {
          ...currentDashboard.layout,
          panels: currentDashboard.layout.panels.filter(
            (p) => p.panelId !== id
          ),
        },
      });

      if (selectedPanelId === id) setSelectedPanelId(null);
      toast.success("Panel deleted");
    },
    [currentDashboard, selectedPanelId, updateDashboard]
  );

  /**
   * Duplicates an existing panel.
   * @param id - The ID of the panel to duplicate.
   * @returns A promise that resolves to the duplicated panel's ID.
   */
  const duplicatePanel = useCallback(
    async (id: string): Promise<string> => {
      const existingPanel = panels.get(id);
      if (!existingPanel) throw new Error("Panel not found");

      const duplicatedPanel: Omit<PanelConfig, "id"> = {
        type: existingPanel.type,
        title: `${existingPanel.title} (Copy)`,
        query: existingPanel.query,
        fieldConfig: existingPanel.fieldConfig,
        options: existingPanel.options,
        database: existingPanel.database,
        gridPos: existingPanel.gridPos,
        maxDataPoints: existingPanel.maxDataPoints,
        intervalMs: existingPanel.intervalMs,
        timeOverride: existingPanel.timeOverride,
        useParentTimeFilter: existingPanel.useParentTimeFilter,
        links: existingPanel.links,
      };

      return await addPanel(duplicatedPanel);
    },
    [panels, addPanel]
  );

  // --- Layout Operations ---

  /**
   * Updates the layout of panels on the dashboard.
   * @param layouts - An array of PanelLayout objects representing the new grid positions.
   */
  const updateLayout = useCallback(
    (layouts: PanelLayout[]) => {
      if (!currentDashboard) return;
      updateDashboard(currentDashboard.id, {
        layout: { ...currentDashboard.layout, panels: layouts },
      });
    },
    [currentDashboard, updateDashboard]
  );

  // --- Data Operations ---

  /**
   * Fetches and updates the data for a single panel with a specific time range.
   * @param panelId - The ID of the panel to refresh.
   * @param overrideTimeRange - Time range to use instead of dashboard's current time range.
   */
  const refreshPanelDataWithTimeRange = useCallback(
    async (panelId: string, overrideTimeRange: TimeRange) => {
      const panel = panels.get(panelId);
      if (!panel || !panel.query?.trim()) return;

      // Use panel's database or fall back to a default
      const panelDatabase = panel.database;
      if (!panelDatabase) {
        console.warn(`Panel ${panelId} has no database specified, skipping query execution`);
        return;
      }

      try {
        // Determine effective time range based on panel settings
        const timeRange = panel.useParentTimeFilter 
          ? overrideTimeRange 
          : (panel.timeOverride || overrideTimeRange);
        const timeZone = currentDashboard?.timeZone || "UTC";
        
        console.log(`Processing panel ${panelId} with OVERRIDE timeRange:`, {
          query: panel.query,
          timeRange,
          timeZone,
          database: panelDatabase
        });
        
        // Use simplified query processor
        const processedResult = QueryProcessor.process({
          database: panelDatabase,
          query: panel.query,
          timeRange,
          timeZone,
          maxDataPoints: panel.maxDataPoints || 1000
        });
        
        const processedQuery = processedResult.query;
        
        console.log(`Processed query for panel ${panelId}:`, processedQuery);
        console.log(`Original query had $__timeFilter:`, panel.query.includes('$__timeFilter'));
        console.log(`Processed query has $__timeFilter:`, processedQuery.includes('$__timeFilter'));
        
        // Execute the query with the panel's specific database
        const result = await executeDashboardQuery(processedQuery, panelDatabase);
        
        if (result.error) {
          console.error(`Query error for panel ${panelId}:`, result.error);
          throw new Error(result.error);
        }

        console.log(`Query result for panel ${panelId}:`, result);

        // Use unified NDJSON parsing utility
        const { records, errors } = DataTransformer.parseNDJSON(result.data || '');
        if (errors.length > 0) {
          console.warn(`NDJSON parsing errors for panel ${panelId}:`, errors);
        }

        setPanelData(
          (prev) =>
            new Map(
              prev.set(panelId, {
                panelId,
                data: records,
                lastUpdated: new Date(),
              })
            )
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error(`Failed to refresh panel ${panelId}:`, error);
        setPanelData(
          (prev) =>
            new Map(
              prev.set(panelId, {
                panelId,
                data: [],
                lastUpdated: new Date(),
                error: errorMessage,
              })
            )
        );
      }
    },
    [panels, executeDashboardQuery, currentDashboard]
  );

  /**
   * Fetches and updates the data for a single panel.
   * @param panelId - The ID of the panel to refresh.
   */
  const refreshPanelData = useCallback(
    async (panelId: string) => {
      const panel = panels.get(panelId);
      if (!panel || !panel.query?.trim()) return;

      // Use panel's database or fall back to a default
      const panelDatabase = panel.database;
      if (!panelDatabase) {
        console.warn(`Panel ${panelId} has no database specified, skipping query execution`);
        return;
      }

      try {
        // Determine effective time range based on panel settings
        const timeRange = panel.useParentTimeFilter 
          ? (currentDashboard?.timeRange || {
              type: "relative" as const,
              from: "1h", 
              to: "now" as const
            })
          : (panel.timeOverride || currentDashboard?.timeRange || {
              type: "relative" as const,
              from: "1h",
              to: "now" as const
            });
        const timeZone = currentDashboard?.timeZone || "UTC";
        
        console.log(`Processing panel ${panelId}:`, {
          query: panel.query,
          timeRange,
          timeZone,
          database: panelDatabase
        });
        
        // Use simplified query processor
        const processedResult = QueryProcessor.process({
          database: panelDatabase,
          query: panel.query,
          timeRange,
          timeZone,
          maxDataPoints: panel.maxDataPoints || 1000
        });
        
        const processedQuery = processedResult.query;
        
        console.log(`Processed query for panel ${panelId}:`, processedQuery);
        
        // Execute the query with the panel's specific database
        const result = await executeDashboardQuery(processedQuery, panelDatabase);
        
        if (result.error) {
          console.error(`Query error for panel ${panelId}:`, result.error);
          throw new Error(result.error);
        }

        console.log(`Query result for panel ${panelId}:`, result);

        // Use unified NDJSON parsing utility
        const { records, errors } = DataTransformer.parseNDJSON(result.data || '');
        if (errors.length > 0) {
          console.warn(`NDJSON parsing errors for panel ${panelId}:`, errors);
        }

        setPanelData(
          (prev) =>
            new Map(
              prev.set(panelId, {
                panelId,
                data: records,
                lastUpdated: new Date(),
              })
            )
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error(`Failed to refresh panel ${panelId}:`, error);
        setPanelData(
          (prev) =>
            new Map(
              prev.set(panelId, {
                panelId,
                data: [],
                lastUpdated: new Date(),
                error: errorMessage,
              })
            )
        );
      }
    },
    [panels, executeDashboardQuery, currentDashboard]
  );

  /**
   * Refreshes the data for all panels on the current dashboard.
   */
  const refreshAllPanels = useCallback(async () => {
    try {
      // Refresh panels in parallel for much better performance
      const panelIds = Array.from(panels.keys());
      if (panelIds.length === 0) return;
      
      console.log(`Refreshing ${panelIds.length} panels in parallel`);
      await Promise.all(panelIds.map(panelId => refreshPanelData(panelId)));
      
      toast.success("All panels refreshed");
    } catch (error) {
      console.error("Failed to refresh all panels:", error);
      toast.error("Failed to refresh panels");
      throw error;
    }
  }, [panels, refreshPanelData]);

  // --- UI Operations ---

  const setEditMode = useCallback((enabled: boolean) => {
    setIsEditMode(enabled);
    if (!enabled) {
      setSelectedPanelId(null);
      setIsConfigSidebarOpen(false);
    }
  }, []);

  const setSelectedPanel = useCallback(
    (panelId: string | null) => {
      setSelectedPanelId(panelId);
      setIsConfigSidebarOpen(!!panelId && isEditMode);
    },
    [isEditMode]
  );

  const setConfigSidebarOpen = useCallback((open: boolean) => {
    setIsConfigSidebarOpen(open);
    if (!open) setSelectedPanelId(null);
  }, []);


  useEffect(() => {
    if (
      !currentDashboard?.refreshInterval ||
      currentDashboard.refreshInterval <= 0
    ) {
      return;
    }
    const interval = setInterval(
      refreshAllPanels,
      currentDashboard.refreshInterval * 1000
    );
    return () => clearInterval(interval);
  }, [currentDashboard?.refreshInterval, refreshAllPanels]);

  // Auto-execute queries for panels when a dashboard is loaded.
  useEffect(() => {
    if (panels.size > 0) {
      const timer = setTimeout(async () => {
        const panelsToRefresh = Array.from(panels.values()).filter(
          (p) => p.query && p.database && !panelData.has(p.id) // Only include panels with database configured
        );

        if (panelsToRefresh.length > 0) {
          console.log(`Auto-executing queries for ${panelsToRefresh.length} panels`);
          // Refresh panels in parallel for better performance
          await Promise.all(panelsToRefresh.map(panel => refreshPanelData(panel.id)));
        }
      }, 200);

      return () => clearTimeout(timer);
    }
  }, [panels, refreshPanelData]); // Removed panelData dependency to prevent infinite loops

  // --- Time Filter Operations ---

  const updateDashboardTimeRange = useCallback(async (timeRange: TimeRange) => {
    if (!currentDashboard) return;

    const updatedDashboard = { ...currentDashboard, timeRange };
    
    try {
      // Update state and storage in parallel
      await Promise.all([
        dashboardStorage.saveDashboard(updatedDashboard),
        Promise.resolve(setCurrentDashboard(updatedDashboard)) // This is synchronous but wrapped for consistency
      ]);

      // Refresh all panels in parallel for much better performance
      console.log("Refreshing panels with new time range:", timeRange);
      const panelIds = Array.from(panels.keys());
      await Promise.all(panelIds.map(panelId => 
        refreshPanelDataWithTimeRange(panelId, timeRange)
      ));
      
      toast.success("Time range updated");
    } catch (error) {
      console.error("Failed to update dashboard time range:", error);
      toast.error("Failed to update time range");
      throw error;
    }
  }, [currentDashboard, panels, refreshPanelDataWithTimeRange]);

  // Reset time range to original value
  const resetDashboardTimeRange = useCallback(async () => {
    if (!currentDashboard || !originalTimeRange) return;
    
    console.log('Resetting time range to original:', originalTimeRange);
    await updateDashboardTimeRange(originalTimeRange);
  }, [currentDashboard, originalTimeRange, updateDashboardTimeRange]);

  const updateDashboardTimeZone = useCallback(async (timeZone: string) => {
    if (!currentDashboard) return;

    const updatedDashboard = { ...currentDashboard, timeZone };
    setCurrentDashboard(updatedDashboard);
    
    // Save to storage
    await dashboardStorage.saveDashboard(updatedDashboard);
    
    // Refresh all panels with current time range (timezone affects processing)
    console.log("Refreshing panels with new timezone:", timeZone);
    for (const panelId of panels.keys()) {
      await refreshPanelDataWithTimeRange(panelId, currentDashboard.timeRange || {
        type: "relative" as const,
        from: "1h",
        to: "now" as const,
      });
    }
    
    toast.success("Timezone updated");
  }, [currentDashboard, panels]);

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    currentDashboard,
    panels,
    panelData,
    isEditMode,
    selectedPanelId,
    isConfigSidebarOpen,
    loading,
    error,
    createDashboard,
    updateDashboard,
    deleteDashboard,
    loadDashboard,
    saveDashboard,
    clearCurrentDashboard,
    addPanel,
    updatePanel,
    deletePanel,
    duplicatePanel,
    getPanelById,
    updateLayout,
    refreshPanelData,
    refreshAllPanels,
    setEditMode,
    setSelectedPanel,
    setConfigSidebarOpen,
    updateDashboardTimeRange,
    resetDashboardTimeRange,
    updateDashboardTimeZone,
  }), [
    currentDashboard,
    panels,
    panelData,
    isEditMode,
    selectedPanelId,
    isConfigSidebarOpen,
    loading,
    error,
    createDashboard,
    updateDashboard,
    deleteDashboard,
    loadDashboard,
    saveDashboard,
    clearCurrentDashboard,
    addPanel,
    updatePanel,
    deletePanel,
    duplicatePanel,
    getPanelById,
    updateLayout,
    refreshPanelData,
    refreshAllPanels,
    setEditMode,
    setSelectedPanel,
    setConfigSidebarOpen,
    updateDashboardTimeRange,
    resetDashboardTimeRange,
    updateDashboardTimeZone,
  ]);

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}
