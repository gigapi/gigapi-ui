import { atomWithStorage } from "jotai/utils";

// UI preferences - localStorage persisted
export const themeAtom = atomWithStorage<"light" | "dark" | "system">("gigapi_theme", "dark");
export const sidebarStateAtom = atomWithStorage<"expanded" | "collapsed">("gigapi_sidebar_state", "expanded");
// Query editor preferences - Fixed to not add extra quotes
export const queryEditorThemeAtom = atomWithStorage<string>("gigapi_query_editor_theme", "vs-dark", {
  getItem: (key) => localStorage.getItem(key) || "vs-dark",
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
});
export const queryEditorFontSizeAtom = atomWithStorage<number>("gigapi_query_editor_font_size", 14);
export const queryEditorWordWrapAtom = atomWithStorage<boolean>("gigapi_query_editor_word_wrap", false);

// Dashboard preferences
export const dashboardAutoRefreshAtom = atomWithStorage<boolean>("gigapi_dashboard_auto_refresh", false);
export const dashboardRefreshIntervalAtom = atomWithStorage<number>("gigapi_dashboard_refresh_interval", 30000);

