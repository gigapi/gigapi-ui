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
export const timeRangeAtom = atomWithStorage<TimeRange>(
  "gigapi_time_range",
  {
    type: "relative",
    from: "now-5m",
    to: "now",
  }
);
export const selectedTimeZoneAtom = atomWithStorage<string>(
  "gigapi_timezone",
  "UTC",
  {
    getItem: (key) => localStorage.getItem(key) || "UTC",
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
  }
);

// Available time fields (derived from schema)
export const availableTimeFieldsAtom = atom<string[]>([]);

// Time variables detection
export const hasTimeVariablesAtom = atom<boolean>(false);

// Setter for time variables detection
export const setHasTimeVariablesAtom = atom(
  null,
  (get, set, hasTimeVars: boolean) => {
    const current = get(hasTimeVariablesAtom);
    console.log("🔥 SET HAS TIME VARIABLES ATOM:", { from: current, to: hasTimeVars, changed: current !== hasTimeVars, timestamp: new Date().toISOString() });
    set(hasTimeVariablesAtom, hasTimeVars);
  }
);

// Actions
export const setTimeRangeAtom = atom(
  null,
  (_get, set, timeRange: TimeRange) => {
    console.log('🔥 [Time] Setting time range:', timeRange);
    set(timeRangeAtom, timeRange);
  }
);

export const setSelectedTimeFieldAtom = atom(
  null,
  (get, set, field: string) => {
    console.log('🔥 [Time] Setting selected time field:', field);
    set(selectedTimeFieldAtom, field);

    // Update time range to include the field
    const currentRange = get(timeRangeAtom);
    if (currentRange) {
      const newRange = {
        ...currentRange,
        field,
      };
      console.log('🔥 [Time] Updating time range with field:', newRange);
      set(timeRangeAtom, newRange);
    }
  }
);

// Time field detection utilities
export const detectTimeFieldsAtom = atom((_get) => {
  return (schema: any[]) => {
    if (!schema || !Array.isArray(schema)) return [];

    return schema
      .filter((column) => {
        const type = column.type?.toLowerCase() || "";
        const name =
          column.name?.toLowerCase() || column.columnName?.toLowerCase() || "";

        // Common time field patterns
        return (
          type.includes("timestamp") ||
          type.includes("datetime") ||
          type.includes("date") ||
          name.includes("time") ||
          name.includes("date") ||
          name.includes("created") ||
          name.includes("updated") ||
          name === "ts" ||
          name === "dt"
        );
      })
      .map((column) => column.name || column.columnName)
      .filter(Boolean);
  };
});

// Time variables generation
export const timeVariablesAtom = atom((get) => {
  const timeRange = get(timeRangeAtom);
  const timeField = get(selectedTimeFieldAtom);

  if (!timeRange || !timeField) {
    return {};
  }

  return {
    $__timeFilter: `${timeField} BETWEEN '${timeRange.from}' AND '${timeRange.to}'`,
    $__timeField: timeField,
    $__timeFrom: timeRange.from,
    $__timeTo: timeRange.to,
  };
});

// Common time range presets
export const timeRangePresetsAtom = atom(() => [
  {
    label: "Last 15 minutes",
    value: { type: "relative" as const, from: "now-15m", to: "now" },
  },
  {
    label: "Last 30 minutes",
    value: { type: "relative" as const, from: "now-30m", to: "now" },
  },
  {
    label: "Last 1 hour",
    value: { type: "relative" as const, from: "now-1h", to: "now" },
  },
  {
    label: "Last 3 hours",
    value: { type: "relative" as const, from: "now-3h", to: "now" },
  },
  {
    label: "Last 6 hours",
    value: { type: "relative" as const, from: "now-6h", to: "now" },
  },
  {
    label: "Last 12 hours",
    value: { type: "relative" as const, from: "now-12h", to: "now" },
  },
  {
    label: "Last 24 hours",
    value: { type: "relative" as const, from: "now-24h", to: "now" },
  },
  {
    label: "Last 7 days",
    value: { type: "relative" as const, from: "now-7d", to: "now" },
  },
  {
    label: "Last 30 days",
    value: { type: "relative" as const, from: "now-30d", to: "now" },
  },
]);
