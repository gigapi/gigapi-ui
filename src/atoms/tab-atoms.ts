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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    tabs: [defaultTab],
    activeTabId: defaultTab.id,
  };
}

// ============================================================================
// Base Atoms
// ============================================================================

// Main tabs state stored in localStorage
export const tabsStateAtom = atomWithStorage<TabsState>(
  "gigapi_tabs",
  migrateOldData(),
  {
    getItem: (key) => {
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error("Failed to parse tabs state:", e);
          return migrateOldData();
        }
      }
      return migrateOldData();
    },
    setItem: (key, value) => {
      localStorage.setItem(key, JSON.stringify(value));
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
export const activeTabAtom = atom((get) => {
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

// Add to current tab's query history
export const addToTabQueryHistoryAtom = atom(
  null,
  (get, set, historyItem: any) => {
    const state = get(tabsStateAtom);
    const activeTab = get(activeTabAtom);
    if (!activeTab) return;

    const updatedTabs = state.tabs.map((tab) => {
      if (tab.id === activeTab.id) {
        const newHistory = [historyItem, ...tab.queryHistory].slice(0, 50); // Keep last 50 per tab
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

  const tabCount = state.tabs.length;
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

// Current tab's query results
export const currentTabQueryResultsAtom = atom(
  (get) => get(activeTabAtom)?.queryResults || null,
  (get, set, results: any[] | null) => {
    const state = get(tabsStateAtom);
    const activeTab = get(activeTabAtom);
    if (!activeTab) return;

    const updatedTabs = state.tabs.map((tab) =>
      tab.id === activeTab.id
        ? { ...tab, queryResults: results, updatedAt: new Date().toISOString() }
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

// Current tab's query execution time
export const currentTabQueryExecutionTimeAtom = atom(
  (get) => get(activeTabAtom)?.queryExecutionTime || 0,
  (get, set, time: number) => {
    const state = get(tabsStateAtom);
    const activeTab = get(activeTabAtom);
    if (!activeTab) return;

    const updatedTabs = state.tabs.map((tab) =>
      tab.id === activeTab.id
        ? { ...tab, queryExecutionTime: time, updatedAt: new Date().toISOString() }
        : tab
    );

    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// Current tab's query metrics
export const currentTabQueryMetricsAtom = atom(
  (get) => get(activeTabAtom)?.queryMetrics || {
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

// Current tab's raw query response
export const currentTabRawQueryResponseAtom = atom(
  (get) => get(activeTabAtom)?.rawQueryResponse || "",
  (get, set, response: string) => {
    const state = get(tabsStateAtom);
    const activeTab = get(activeTabAtom);
    if (!activeTab) return;

    const updatedTabs = state.tabs.map((tab) =>
      tab.id === activeTab.id
        ? { ...tab, rawQueryResponse: response, updatedAt: new Date().toISOString() }
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
  (get, set, fields: { xField?: boolean; yField?: boolean; seriesField?: boolean }) => {
    const state = get(tabsStateAtom);
    const activeTab = get(activeTabAtom);
    if (!activeTab) return;

    const updatedTabs = state.tabs.map((tab) =>
      tab.id === activeTab.id
        ? { ...tab, userModifiedFields: fields, updatedAt: new Date().toISOString() }
        : tab
    );

    set(tabsStateAtom, { ...state, tabs: updatedTabs });
  }
);

// ============================================================================
// Helper Functions for External Access
// ============================================================================

// Get current tab data from localStorage directly (for use outside React)
export function getCurrentTabData() {
  const stored = localStorage.getItem("gigapi_tabs");
  if (!stored) return null;
  
  try {
    const state: TabsState = JSON.parse(stored);
    const activeTab = state.tabs.find(tab => tab.id === state.activeTabId);
    return activeTab || null;
  } catch (e) {
    console.error("Failed to get current tab data:", e);
    return null;
  }
}