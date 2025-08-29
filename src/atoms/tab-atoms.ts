import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { v4 as uuidv4 } from "uuid";
import type { QueryTab, TabsState, TimeRange } from "@/types/tab.types";
import type { PanelConfig } from "@/types/dashboard.types";
import PanelFactory from "@/lib/dashboard/panel-factory";

// ============================================================================
// Migration Utilities
// ============================================================================

function createDefaultPanelConfig(): PanelConfig {
  const config = PanelFactory.createPanel({
    type: "line",
    title: "Query Panel",
    database: "",
    query: "",
  });
  // Clear field mapping to allow smart defaults to work
  config.fieldMapping = {};
  return config;
}

function migrateOldData(): TabsState {
  // Check if tabs already exist
  const existingTabs = localStorage.getItem("gigapi_tabs");
  if (existingTabs) {
    try {
      return JSON.parse(existingTabs);
    } catch (e) {
      console.error("Failed to parse existing tabs:", e);
    }
  }

  // Migrate old data to first tab
  const defaultTab: QueryTab = {
    id: uuidv4(),
    name: "Query 1",
    database: localStorage.getItem("gigapi_selected_db") || "",
    table: localStorage.getItem("gigapi_selected_table") || "",
    timeField: localStorage.getItem("gigapi_selected_time_field") || "",
    timeRange: (() => {
      const stored = localStorage.getItem("gigapi_time_range");
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return { type: "relative", from: "now-5m", to: "now" };
        }
      }
      return { type: "relative", from: "now-5m", to: "now" };
    })(),
    timeZone: localStorage.getItem("gigapi_timezone") || "UTC",
    query: localStorage.getItem("gigapi_current_query") || "",
    queryHistory: (() => {
      const stored = localStorage.getItem("gigapi_query_history");
      if (stored) {
        try {
          const history = JSON.parse(stored);
          // Take only the last 20 items per tab
          return Array.isArray(history) ? history.slice(0, 20) : [];
        } catch {
          return [];
        }
      }
      return [];
    })(),
    // Query execution state
    queryResults: null,
    queryError: null,
    queryLoading: false,
    queryExecutionTime: 0,
    queryMetrics: {
      executionTime: 0,
      rowCount: 0,
      size: 0,
      processedRows: 0,
    },
    rawQueryResponse: "",
    processedQuery: "",
    // Panel configuration
    panelConfig: createDefaultPanelConfig(),
    userModifiedFields: {},
    availableFields: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    tabs: [defaultTab],
    activeTabId: defaultTab.id,
  };
}

// ============================================================================
// Runtime State Types
// ============================================================================

interface TabRuntimeData {
  queryResults: any[] | null;
  rawQueryResponse: string;
}

interface TabsRuntimeState {
  [tabId: string]: TabRuntimeData;
}

// ============================================================================
// Base Atoms
// ============================================================================

// Runtime state for large data (not persisted to localStorage)
const tabsRuntimeStateAtom = atom<TabsRuntimeState>({});

// Main tabs state stored in localStorage (excludes large data fields)
const tabsStateAtom = atomWithStorage<TabsState>(
  "gigapi_tabs",
  migrateOldData(),
  {
    getItem: (key) => {
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // Ensure large fields are null when loading from storage
          if (parsed.tabs) {
            parsed.tabs = parsed.tabs.map((tab: any) => ({
              ...tab,
              queryResults: null,
              rawQueryResponse: "",
            }));
          }
          return parsed;
        } catch (e) {
          console.error("Failed to parse tabs state:", e);
          return migrateOldData();
        }
      }
      return migrateOldData();
    },
    setItem: (key, value) => {
      // Strip out large data fields before saving to localStorage
      const valueToStore = {
        ...value,
        tabs: value.tabs.map((tab) => ({
          ...tab,
          queryResults: null,
          rawQueryResponse: "",
        })),
      };
      localStorage.setItem(key, JSON.stringify(valueToStore));
    },
    removeItem: (key) => {
      localStorage.removeItem(key);
    },
  }
);

// ============================================================================
// Derived Atoms
// ============================================================================

// Get list of tabs
export const tabsAtom = atom((get) => get(tabsStateAtom).tabs);

// Get active tab ID
export const activeTabIdAtom = atom((get) => get(tabsStateAtom).activeTabId);

// Get active tab
const activeTabAtom = atom((get) => {
  const state = get(tabsStateAtom);
  return state.tabs.find((tab) => tab.id === state.activeTabId) || null;
});

// ============================================================================
// Tab-specific Atoms
// ============================================================================

// Get tab by ID
export const getTabByIdAtom = atom((get) => (tabId: string) => {
  const state = get(tabsStateAtom);
  return state.tabs.find((tab) => tab.id === tabId) || null;
});

// Current tab's database
export const currentTabDatabaseAtom = atom(
  (get) => get(activeTabAtom)?.database || "",
  (get, set, database: string) => {
    const state = get(tabsStateAtom);
    const activeTab = get(activeTabAtom);
    if (!activeTab) return;

    const updatedTabs = state.tabs.map((tab) =>
      tab.id === activeTab.id
        ? { ...tab, database, table: "", updatedAt: new Date().toISOString() }
        : tab
    );

    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// Current tab's table
export const currentTabTableAtom = atom(
  (get) => get(activeTabAtom)?.table || "",
  (get, set, table: string) => {
    const state = get(tabsStateAtom);
    const activeTab = get(activeTabAtom);
    if (!activeTab) return;

    const updatedTabs = state.tabs.map((tab) =>
      tab.id === activeTab.id
        ? { ...tab, table, updatedAt: new Date().toISOString() }
        : tab
    );

    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// Current tab's time field
export const currentTabTimeFieldAtom = atom(
  (get) => get(activeTabAtom)?.timeField || "",
  (get, set, timeField: string) => {
    const state = get(tabsStateAtom);
    const activeTab = get(activeTabAtom);
    if (!activeTab) return;

    const updatedTabs = state.tabs.map((tab) =>
      tab.id === activeTab.id
        ? { ...tab, timeField, updatedAt: new Date().toISOString() }
        : tab
    );

    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// Current tab's time range
export const currentTabTimeRangeAtom = atom(
  (get) =>
    get(activeTabAtom)?.timeRange || {
      type: "relative" as const,
      from: "now-5m",
      to: "now",
    },
  (get, set, timeRange: TimeRange) => {
    const state = get(tabsStateAtom);
    const activeTab = get(activeTabAtom);
    if (!activeTab) return;

    const updatedTabs = state.tabs.map((tab) =>
      tab.id === activeTab.id
        ? { ...tab, timeRange, updatedAt: new Date().toISOString() }
        : tab
    );

    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// Current tab's time zone
export const currentTabTimeZoneAtom = atom(
  (get) => get(activeTabAtom)?.timeZone || "UTC",
  (get, set, timeZone: string) => {
    const state = get(tabsStateAtom);
    const activeTab = get(activeTabAtom);
    if (!activeTab) return;

    const updatedTabs = state.tabs.map((tab) =>
      tab.id === activeTab.id
        ? { ...tab, timeZone, updatedAt: new Date().toISOString() }
        : tab
    );

    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// Current tab's query
export const currentTabQueryAtom = atom(
  (get) => get(activeTabAtom)?.query || "",
  (get, set, query: string) => {
    const state = get(tabsStateAtom);
    const activeTab = get(activeTabAtom);
    if (!activeTab) return;

    const updatedTabs = state.tabs.map((tab) =>
      tab.id === activeTab.id
        ? { ...tab, query, updatedAt: new Date().toISOString() }
        : tab
    );

    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// Current tab's query history
export const currentTabQueryHistoryAtom = atom(
  (get) => get(activeTabAtom)?.queryHistory || []
);

// ============================================================================
// Action Atoms
// ============================================================================

// Create new tab
export const createTabAtom = atom(null, (get, set, name?: string) => {
  const state = get(tabsStateAtom);
  const tabCount = state.tabs.length;

  const newTab: QueryTab = {
    id: uuidv4(),
    name: name || `Query ${tabCount + 1}`,
    database: "",
    table: "",
    timeField: "",
    timeRange: { type: "relative", from: "now-5m", to: "now" },
    timeZone: "UTC",
    query: "",
    queryHistory: [],
    // Query execution state
    queryResults: null,
    queryError: null,
    queryLoading: false,
    queryExecutionTime: 0,
    queryMetrics: {
      executionTime: 0,
      rowCount: 0,
      size: 0,
      processedRows: 0,
    },
    rawQueryResponse: "",
    processedQuery: "",
    // Panel configuration
    panelConfig: createDefaultPanelConfig(),
    userModifiedFields: {},
    availableFields: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  set(tabsStateAtom, {
    tabs: [...state.tabs, newTab],
    activeTabId: newTab.id,
  });

  return newTab.id;
});

// Switch to tab
export const switchTabAtom = atom(null, (get, set, tabId: string) => {
  const state = get(tabsStateAtom);
  if (state.tabs.some((tab) => tab.id === tabId)) {
    set(tabsStateAtom, { ...state, activeTabId: tabId });
  }
});

// Close tab
export const closeTabAtom = atom(null, (get, set, tabId: string) => {
  const state = get(tabsStateAtom);

  // Don't close if it's the only tab
  if (state.tabs.length <= 1) return;

  const tabIndex = state.tabs.findIndex((tab) => tab.id === tabId);
  if (tabIndex === -1) return;

  const newTabs = state.tabs.filter((tab) => tab.id !== tabId);
  let newActiveTabId = state.activeTabId;

  // If closing the active tab, switch to another
  if (state.activeTabId === tabId) {
    // Try to switch to the tab to the right, otherwise to the left
    if (tabIndex < state.tabs.length - 1) {
      newActiveTabId = state.tabs[tabIndex + 1].id;
    } else if (tabIndex > 0) {
      newActiveTabId = state.tabs[tabIndex - 1].id;
    } else {
      newActiveTabId = newTabs[0]?.id || null;
    }
  }

  set(tabsStateAtom, {
    tabs: newTabs,
    activeTabId: newActiveTabId,
  });

  // Clean up runtime state for the closed tab
  const runtimeState = get(tabsRuntimeStateAtom);
  const newRuntimeState = { ...runtimeState };
  delete newRuntimeState[tabId];
  set(tabsRuntimeStateAtom, newRuntimeState);

  // Remove from running queries if present
  set(removeRunningQueryAtom, tabId);
});

// Rename tab
export const renameTabAtom = atom(
  null,
  (get, set, { tabId, name }: { tabId: string; name: string }) => {
    const state = get(tabsStateAtom);
    const updatedTabs = state.tabs.map((tab) =>
      tab.id === tabId
        ? { ...tab, name, updatedAt: new Date().toISOString() }
        : tab
    );

    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// Clear current tab's query history
export const clearTabQueryHistoryAtom = atom(null, (get, set) => {
  const state = get(tabsStateAtom);
  const activeTab = get(activeTabAtom);
  if (!activeTab) return;

  const updatedTabs = state.tabs.map((tab) =>
    tab.id === activeTab.id
      ? { ...tab, queryHistory: [], updatedAt: new Date().toISOString() }
      : tab
  );

  set(tabsStateAtom, { ...state, tabs: updatedTabs });
});

// Duplicate tab
export const duplicateTabAtom = atom(null, (get, set, tabId: string) => {
  const state = get(tabsStateAtom);
  const tabToDuplicate = state.tabs.find((tab) => tab.id === tabId);
  if (!tabToDuplicate) return;
  const newTab: QueryTab = {
    ...tabToDuplicate,
    id: uuidv4(),
    name: `${tabToDuplicate.name} (Copy)`,
    queryHistory: [], // Start with fresh history
    // Reset query execution state for the new tab
    queryResults: null,
    queryError: null,
    queryLoading: false,
    queryExecutionTime: 0,
    queryMetrics: {
      executionTime: 0,
      rowCount: 0,
      size: 0,
      processedRows: 0,
    },
    rawQueryResponse: "",
    processedQuery: "",
    // Copy panel config but reset field mappings and user modified flags
    panelConfig: {
      ...tabToDuplicate.panelConfig,
      fieldMapping: {}, // Reset to allow smart defaults
    },
    userModifiedFields: {}, // Reset user modifications
    availableFields: [], // Reset available fields
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  set(tabsStateAtom, {
    tabs: [...state.tabs, newTab],
    activeTabId: newTab.id,
  });

  return newTab.id;
});

// ============================================================================
// Migration Cleanup
// ============================================================================

export const cleanupOldLocalStorageAtom = atom(null, (_get, _set) => {
  // Remove old keys that are now managed by tabs
  const keysToRemove = [
    "gigapi_selected_db",
    "gigapi_selected_table",
    "gigapi_selected_time_field",
    "gigapi_time_range",
    "gigapi_timezone",
    "gigapi_current_query",
    "gigapi_query_history",
  ];

  keysToRemove.forEach((key) => {
    localStorage.removeItem(key);
  });

  console.log("🧹 Cleaned up old localStorage keys");
});

// ============================================================================
// Helper Functions for External Access
// ============================================================================

// ============================================================================
// Query Result Atoms - Tab-aware
// ============================================================================

// Current tab's query results (stored in runtime state)
export const currentTabQueryResultsAtom = atom(
  (get) => {
    const activeTab = get(activeTabAtom);
    if (!activeTab) return null;
    const runtimeState = get(tabsRuntimeStateAtom);
    return runtimeState[activeTab.id]?.queryResults || null;
  },
  (get, set, results: any[] | null) => {
    const activeTab = get(activeTabAtom);
    if (!activeTab) return;

    // Update runtime state
    const runtimeState = get(tabsRuntimeStateAtom);
    set(tabsRuntimeStateAtom, {
      ...runtimeState,
      [activeTab.id]: {
        ...runtimeState[activeTab.id],
        queryResults: results,
      },
    });

    // Update the updatedAt timestamp in persistent state
    const state = get(tabsStateAtom);
    const updatedTabs = state.tabs.map((tab) =>
      tab.id === activeTab.id
        ? { ...tab, updatedAt: new Date().toISOString() }
        : tab
    );
    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// Current tab's query error
export const currentTabQueryErrorAtom = atom(
  (get) => get(activeTabAtom)?.queryError || null,
  (get, set, error: string | null) => {
    const state = get(tabsStateAtom);
    const activeTab = get(activeTabAtom);
    if (!activeTab) return;

    const updatedTabs = state.tabs.map((tab) =>
      tab.id === activeTab.id
        ? { ...tab, queryError: error, updatedAt: new Date().toISOString() }
        : tab
    );

    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// Current tab's query loading state
export const currentTabQueryLoadingAtom = atom(
  (get) => get(activeTabAtom)?.queryLoading || false,
  (get, set, loading: boolean) => {
    const state = get(tabsStateAtom);
    const activeTab = get(activeTabAtom);
    if (!activeTab) return;

    const updatedTabs = state.tabs.map((tab) =>
      tab.id === activeTab.id
        ? { ...tab, queryLoading: loading, updatedAt: new Date().toISOString() }
        : tab
    );

    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// currentTabQueryExecutionTimeAtom removed - unused

// Current tab's query metrics
export const currentTabQueryMetricsAtom = atom(
  (get) =>
    get(activeTabAtom)?.queryMetrics || {
      executionTime: 0,
      rowCount: 0,
      size: 0,
      processedRows: 0,
    },
  (get, set, metrics: any) => {
    const state = get(tabsStateAtom);
    const activeTab = get(activeTabAtom);
    if (!activeTab) return;

    const updatedTabs = state.tabs.map((tab) =>
      tab.id === activeTab.id
        ? { ...tab, queryMetrics: metrics, updatedAt: new Date().toISOString() }
        : tab
    );

    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// Current tab's raw query response (stored in runtime state)
export const currentTabRawQueryResponseAtom = atom(
  (get) => {
    const activeTab = get(activeTabAtom);
    if (!activeTab) return "";
    const runtimeState = get(tabsRuntimeStateAtom);
    return runtimeState[activeTab.id]?.rawQueryResponse || "";
  },
  (get, set, response: string) => {
    const activeTab = get(activeTabAtom);
    if (!activeTab) return;

    // Update runtime state
    const runtimeState = get(tabsRuntimeStateAtom);
    set(tabsRuntimeStateAtom, {
      ...runtimeState,
      [activeTab.id]: {
        ...runtimeState[activeTab.id],
        rawQueryResponse: response,
      },
    });

    // Update the updatedAt timestamp in persistent state
    const state = get(tabsStateAtom);
    const updatedTabs = state.tabs.map((tab) =>
      tab.id === activeTab.id
        ? { ...tab, updatedAt: new Date().toISOString() }
        : tab
    );
    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// Current tab's processed query
export const currentTabProcessedQueryAtom = atom(
  (get) => get(activeTabAtom)?.processedQuery || "",
  (get, set, query: string) => {
    const state = get(tabsStateAtom);
    const activeTab = get(activeTabAtom);
    if (!activeTab) return;

    const updatedTabs = state.tabs.map((tab) =>
      tab.id === activeTab.id
        ? { ...tab, processedQuery: query, updatedAt: new Date().toISOString() }
        : tab
    );

    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// Current tab's panel configuration
export const currentTabPanelConfigAtom = atom(
  (get) => get(activeTabAtom)?.panelConfig || createDefaultPanelConfig(),
  (get, set, config: PanelConfig) => {
    const state = get(tabsStateAtom);
    const activeTab = get(activeTabAtom);
    if (!activeTab) return;

    const updatedTabs = state.tabs.map((tab) =>
      tab.id === activeTab.id
        ? { ...tab, panelConfig: config, updatedAt: new Date().toISOString() }
        : tab
    );

    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// Current tab's user modified fields
export const currentTabUserModifiedFieldsAtom = atom(
  (get) => get(activeTabAtom)?.userModifiedFields || {},
  (
    get,
    set,
    fields: { xField?: boolean; yField?: boolean; seriesField?: boolean }
  ) => {
    const state = get(tabsStateAtom);
    const activeTab = get(activeTabAtom);
    if (!activeTab) return;

    const updatedTabs = state.tabs.map((tab) =>
      tab.id === activeTab.id
        ? {
            ...tab,
            userModifiedFields: fields,
            updatedAt: new Date().toISOString(),
          }
        : tab
    );

    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// Current tab's available fields
export const currentTabAvailableFieldsAtom = atom(
  (get) => get(activeTabAtom)?.availableFields || [],
  (get, set, fields: string[]) => {
    const state = get(tabsStateAtom);
    const activeTab = get(activeTabAtom);
    if (!activeTab) return;

    const updatedTabs = state.tabs.map((tab) =>
      tab.id === activeTab.id
        ? {
            ...tab,
            availableFields: fields,
            updatedAt: new Date().toISOString(),
          }
        : tab
    );

    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// ============================================================================
// Query Execution Tracking
// ============================================================================

// Track which tabs have running queries
export const runningQueriesAtom = atom<Set<string>>(new Set<string>());

// Add a tab to running queries
export const addRunningQueryAtom = atom(null, (get, set, tabId: string) => {
  const running = new Set(get(runningQueriesAtom));
  running.add(tabId);
  set(runningQueriesAtom, running);
});

// Remove a tab from running queries
export const removeRunningQueryAtom = atom(null, (get, set, tabId: string) => {
  const running = new Set(get(runningQueriesAtom));
  running.delete(tabId);
  set(runningQueriesAtom, running);
});

// ============================================================================
// Tab-specific Update Atoms (by ID, not current tab)
// ============================================================================

// Update specific tab's query results by ID (stored in runtime state)
export const updateTabQueryResultsByIdAtom = atom(
  null,
  (get, set, { tabId, results }: { tabId: string; results: any[] | null }) => {
    // Update runtime state
    const runtimeState = get(tabsRuntimeStateAtom);
    set(tabsRuntimeStateAtom, {
      ...runtimeState,
      [tabId]: {
        ...runtimeState[tabId],
        queryResults: results,
      },
    });

    // Update the updatedAt timestamp in persistent state
    const state = get(tabsStateAtom);
    const updatedTabs = state.tabs.map((tab) =>
      tab.id === tabId ? { ...tab, updatedAt: new Date().toISOString() } : tab
    );
    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// Update specific tab's query error by ID
export const updateTabQueryErrorByIdAtom = atom(
  null,
  (get, set, { tabId, error }: { tabId: string; error: string | null }) => {
    const state = get(tabsStateAtom);
    const updatedTabs = state.tabs.map((tab) =>
      tab.id === tabId
        ? { ...tab, queryError: error, updatedAt: new Date().toISOString() }
        : tab
    );
    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// Update specific tab's query loading state by ID
export const updateTabQueryLoadingByIdAtom = atom(
  null,
  (get, set, { tabId, loading }: { tabId: string; loading: boolean }) => {
    const state = get(tabsStateAtom);
    const updatedTabs = state.tabs.map((tab) =>
      tab.id === tabId
        ? { ...tab, queryLoading: loading, updatedAt: new Date().toISOString() }
        : tab
    );
    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// Update specific tab's query metrics by ID
export const updateTabQueryMetricsByIdAtom = atom(
  null,
  (get, set, { tabId, metrics }: { tabId: string; metrics: any }) => {
    const state = get(tabsStateAtom);
    const updatedTabs = state.tabs.map((tab) =>
      tab.id === tabId
        ? {
            ...tab,
            queryMetrics: metrics,
            queryExecutionTime: metrics.executionTime,
            updatedAt: new Date().toISOString(),
          }
        : tab
    );
    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// Update specific tab's raw response by ID (stored in runtime state)
export const updateTabRawResponseByIdAtom = atom(
  null,
  (get, set, { tabId, response }: { tabId: string; response: string }) => {
    // Update runtime state
    const runtimeState = get(tabsRuntimeStateAtom);
    set(tabsRuntimeStateAtom, {
      ...runtimeState,
      [tabId]: {
        ...runtimeState[tabId],
        rawQueryResponse: response,
      },
    });

    // Update the updatedAt timestamp in persistent state
    const state = get(tabsStateAtom);
    const updatedTabs = state.tabs.map((tab) =>
      tab.id === tabId ? { ...tab, updatedAt: new Date().toISOString() } : tab
    );
    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// Update specific tab's processed query by ID
export const updateTabProcessedQueryByIdAtom = atom(
  null,
  (get, set, { tabId, query }: { tabId: string; query: string }) => {
    const state = get(tabsStateAtom);
    const updatedTabs = state.tabs.map((tab) =>
      tab.id === tabId
        ? { ...tab, processedQuery: query, updatedAt: new Date().toISOString() }
        : tab
    );
    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// Add to specific tab's query history by ID
export const addToTabQueryHistoryByIdAtom = atom(
  null,
  (get, set, { tabId, historyItem }: { tabId: string; historyItem: any }) => {
    const state = get(tabsStateAtom);
    const updatedTabs = state.tabs.map((tab) => {
      if (tab.id === tabId) {
        const newHistory = [historyItem, ...tab.queryHistory].slice(0, 50);
        return {
          ...tab,
          queryHistory: newHistory,
          updatedAt: new Date().toISOString(),
        };
      }
      return tab;
    });
    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// ============================================================================
// Reset Atoms for Connection Switching
// ============================================================================

// Reset all tabs' database-related selections when switching connections
export const resetAllTabsDatabaseSelectionsAtom = atom(null, (get, set) => {
  const state = get(tabsStateAtom);
  
  // Reset database, table, and timeField for all tabs
  const updatedTabs = state.tabs.map((tab) => ({
    ...tab,
    database: "",
    table: "",
    timeField: "",
    // Also reset panel config to default
    panelConfig: {
      ...tab.panelConfig,
      database: "",
      table: "",
      fieldMapping: {}, // Reset field mappings
    },
    userModifiedFields: {}, // Reset user modifications
    availableFields: [], // Clear available fields
    updatedAt: new Date().toISOString(),
  }));

  set(tabsStateAtom, { ...state, tabs: updatedTabs });
  
  // Also clear runtime state for all tabs
  set(tabsRuntimeStateAtom, {});
  
  console.log("[Tab Reset] Cleared all tabs' database selections for connection switch");
});

// ============================================================================
// Helper Functions for External Access
// ============================================================================

// Get current tab data from localStorage directly (for use outside React)
export function getCurrentTabData() {
  const stored = localStorage.getItem("gigapi_tabs");
  if (!stored) return null;

  try {
    const state: TabsState = JSON.parse(stored);
    const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
    return activeTab || null;
  } catch (e) {
    console.error("Failed to get current tab data:", e);
    return null;
  }
}
