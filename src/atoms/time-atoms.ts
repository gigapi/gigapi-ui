import { atom } from "jotai";
import type { TimeRange } from "@/types/tab.types";
import { currentTabTimeFieldAtom, currentTabTimeRangeAtom, currentTabTimeZoneAtom } from "./tab-atoms";


// Time selection atoms - now use tab-aware versions
export const selectedTimeFieldAtom = currentTabTimeFieldAtom;
export const timeRangeAtom = currentTabTimeRangeAtom;
export const selectedTimeZoneAtom = currentTabTimeZoneAtom;

// Time variables detection
export const hasTimeVariablesAtom = atom<boolean>(false);

// Setter for time variables detection
export const setHasTimeVariablesAtom = atom(
  null,
  (_, set, hasTimeVars: boolean) => {
    set(hasTimeVariablesAtom, hasTimeVars);
  }
);

// Actions
export const setTimeRangeAtom = atom(
  null,
  (_, set, timeRange: TimeRange) => {
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
