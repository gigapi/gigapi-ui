import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

// Time range types
export interface TimeRange {
  type: "relative" | "absolute";
  from: string;
  to: string;
  field?: string;
  display?: string;
}

// Time selection atoms - Fixed to not add extra quotes
export const selectedTimeFieldAtom = atomWithStorage<string>(
  "gigapi_selected_time_field",
  "",
  {
    getItem: (key) => localStorage.getItem(key) || "",
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
  }
);
export const timeRangeAtom = atomWithStorage<TimeRange>("gigapi_time_range", {
  type: "relative",
  from: "now-5m",
  to: "now",
});
export const selectedTimeZoneAtom = atomWithStorage<string>(
  "gigapi_timezone",
  "UTC",
  {
    getItem: (key) => localStorage.getItem(key) || "UTC",
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
  }
);

// Time variables detection
export const hasTimeVariablesAtom = atom<boolean>(false);

// Setter for time variables detection
export const setHasTimeVariablesAtom = atom(
  null,
  (get, set, hasTimeVars: boolean) => {
    set(hasTimeVariablesAtom, hasTimeVars);
  }
);

// Actions
export const setTimeRangeAtom = atom(
  null,
  (_get, set, timeRange: TimeRange) => {
    set(timeRangeAtom, timeRange);
  }
);

export const setSelectedTimeFieldAtom = atom(
  null,
  (get, set, field: string) => {
    set(selectedTimeFieldAtom, field);

    // Update time range to include the field
    const currentRange = get(timeRangeAtom);
    if (currentRange) {
      const newRange = {
        ...currentRange,
        field,
      };
      set(timeRangeAtom, newRange);
    }
  }
);
