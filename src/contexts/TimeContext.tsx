import {
  createContext,
  useContext,
  useCallback,
  useReducer,
  type ReactNode,
} from "react";
import type { TimeRange, ColumnSchema } from "@/types";
import {
  detectTimeFieldsFromSchema,
  safeLocalStorage,
  STORAGE_KEYS,
  processQueryWithTimeVariables,
} from "@/lib/";

// Define state shape for time-related data
interface TimeState {
  timeRange: TimeRange;
  timeFields: string[];
  selectedTimeField: string | undefined;
  selectedTimeZone: string;
  hasTimeVariables: boolean;
  detectableTimeFields: boolean;
  selectedTimeFieldDetails: ColumnSchema | null;
}

// Action types for reducer
type TimeAction =
  | { type: "SET_TIME_RANGE"; payload: TimeRange }
  | { type: "SET_TIME_FIELDS"; payload: string[] }
  | { type: "SET_SELECTED_TIME_FIELD"; payload: string | undefined }
  | { type: "SET_SELECTED_TIME_ZONE"; payload: string }
  | { type: "SET_HAS_TIME_VARIABLES"; payload: boolean }
  | { type: "SET_DETECTABLE_TIME_FIELDS"; payload: boolean }
  | { type: "SET_SELECTED_TIME_FIELD_DETAILS"; payload: ColumnSchema | null }
  | {
      type: "UPDATE_FROM_SCHEMA";
      payload: { fields: string[]; currentField?: string };
    };

// Get initial timezone safely
function getInitialTimeZone(): string {
  const saved = safeLocalStorage.getItem(STORAGE_KEYS.SELECTED_TIME_ZONE);
  if (saved) return saved;

  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const initialTimeState: TimeState = {
  timeRange: safeLocalStorage.getJSON(STORAGE_KEYS.TIME_RANGE, {
    from: "now-5m",
    to: "now",
    display: "Last 5 minutes",
    enabled: true,
  }),
  timeFields: safeLocalStorage.getJSON(STORAGE_KEYS.TIME_FIELDS, []),
  selectedTimeField:
    safeLocalStorage.getItem(STORAGE_KEYS.SELECTED_TIME_FIELD) ?? undefined,
  selectedTimeZone: getInitialTimeZone(),
  hasTimeVariables: false,
  detectableTimeFields: false,
  selectedTimeFieldDetails: null,
};

function timeReducer(state: TimeState, action: TimeAction): TimeState {
  switch (action.type) {
    case "SET_TIME_RANGE":
      return { ...state, timeRange: action.payload };

    case "SET_TIME_FIELDS":
      return {
        ...state,
        timeFields: action.payload,
        detectableTimeFields: action.payload.length > 0,
      };

    case "SET_SELECTED_TIME_FIELD":
      return { ...state, selectedTimeField: action.payload };

    case "SET_SELECTED_TIME_ZONE":
      return { ...state, selectedTimeZone: action.payload };

    case "SET_HAS_TIME_VARIABLES":
      return { ...state, hasTimeVariables: action.payload };

    case "SET_DETECTABLE_TIME_FIELDS":
      return { ...state, detectableTimeFields: action.payload };

    case "SET_SELECTED_TIME_FIELD_DETAILS":
      return { ...state, selectedTimeFieldDetails: action.payload };

    case "UPDATE_FROM_SCHEMA":
      const { fields, currentField } = action.payload;
      return {
        ...state,
        timeFields: fields,
        detectableTimeFields: fields.length > 0,
        // Reset selected field if it's no longer available
        selectedTimeField:
          currentField && fields.includes(currentField)
            ? currentField
            : undefined,
      };

    default:
      return state;
  }
}

interface TimeContextType {
  // Time range management
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;

  // Time fields management
  timeFields: string[];
  selectedTimeField: string | undefined;
  setSelectedTimeField: (field: string | undefined) => void;
  selectedTimeFieldDetails: ColumnSchema | null;

  // Persistent time field management per database/table
  getPersistedTimeField: (database: string, table: string) => string | null;
  setPersistedTimeField: (
    database: string,
    table: string,
    timeField: string | null
  ) => void;

  // Time zone management
  selectedTimeZone: string;
  setSelectedTimeZone: (tz: string) => void;

  // Time variables
  hasTimeVariables: boolean;
  setHasTimeVariables: (has: boolean) => void;
  replaceTimeVariables: (
    query: string,
    fieldDetails?: ColumnSchema | null
  ) => string;

  // Utilities
  detectableTimeFields: boolean;
  setDetectableTimeFields: (detectable: boolean) => void;
  updateTimeFieldsFromSchema: (columns: ColumnSchema[]) => void;
  updateSelectedTimeFieldDetails: (details: ColumnSchema | null) => void;
}

const TimeContext = createContext<TimeContextType | undefined>(undefined);

export function TimeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(timeReducer, initialTimeState);

  // Time range management with persistence
  const setTimeRange = (range: TimeRange) => {
    dispatch({ type: "SET_TIME_RANGE", payload: range });
    safeLocalStorage.setJSON(STORAGE_KEYS.TIME_RANGE, range);
  };

  // Time field selection with persistence
  const setSelectedTimeField = (field: string | undefined) => {
    dispatch({ type: "SET_SELECTED_TIME_FIELD", payload: field });

    if (field) {
      safeLocalStorage.setItem(STORAGE_KEYS.SELECTED_TIME_FIELD, field);
    } else {
      safeLocalStorage.removeItem(STORAGE_KEYS.SELECTED_TIME_FIELD);
    }
  };

  // Get persisted time field for specific database/table combination
  const getPersistedTimeField = useCallback(
    (database: string, table: string): string | null => {
      try {
        const stored = safeLocalStorage.getJSON(
          STORAGE_KEYS.QUERY_VARIABLES,
          {}
        );
        if (stored && typeof stored === "object") {
          const key = `${database}.${table}`;
          return (stored as Record<string, any>)[key]?.timeField || null;
        }
      } catch (error) {
        console.warn("Failed to get persisted time field:", error);
      }
      return null;
    },
    []
  );

  // Set persisted time field for specific database/table combination
  const setPersistedTimeField = useCallback(
    (database: string, table: string, timeField: string | null) => {
      try {
        const stored = safeLocalStorage.getJSON(
          STORAGE_KEYS.QUERY_VARIABLES,
          {}
        );
        const key = `${database}.${table}`;

        if (timeField) {
          (stored as Record<string, any>)[key] = { timeField };
        } else {
          delete (stored as Record<string, any>)[key];
        }

        safeLocalStorage.setJSON(STORAGE_KEYS.QUERY_VARIABLES, stored);
      } catch (error) {
        console.warn("Failed to set persisted time field:", error);
      }
    },
    []
  );

  // Time zone management with persistence
  const setSelectedTimeZone = useCallback((tz: string) => {
    dispatch({ type: "SET_SELECTED_TIME_ZONE", payload: tz });
    safeLocalStorage.setItem(STORAGE_KEYS.SELECTED_TIME_ZONE, tz);
  }, []);

  // Time variables management
  const setHasTimeVariables = useCallback((has: boolean) => {
    dispatch({ type: "SET_HAS_TIME_VARIABLES", payload: has });
  }, []);

  // Detectable time fields management
  const setDetectableTimeFields = useCallback((detectable: boolean) => {
    dispatch({ type: "SET_DETECTABLE_TIME_FIELDS", payload: detectable });
  }, []);

  // Update time field details
  const updateSelectedTimeFieldDetails = useCallback(
    (details: ColumnSchema | null) => {
      dispatch({ type: "SET_SELECTED_TIME_FIELD_DETAILS", payload: details });
    },
    []
  );

  // Update time fields from schema with smart field selection
  const updateTimeFieldsFromSchema = useCallback(
    (columns: ColumnSchema[]) => {
      const fields = detectTimeFieldsFromSchema(columns);

      dispatch({
        type: "UPDATE_FROM_SCHEMA",
        payload: {
          fields,
          currentField: state.selectedTimeField,
        },
      });

      // Persist the detected fields
      safeLocalStorage.setJSON(STORAGE_KEYS.TIME_FIELDS, fields);

      // Clear selected field from storage if it's no longer valid
      if (
        state.selectedTimeField &&
        !fields.includes(state.selectedTimeField)
      ) {
        safeLocalStorage.removeItem(STORAGE_KEYS.SELECTED_TIME_FIELD);
      }
    },
    [state.selectedTimeField]
  );

  // Replace time variables in query with comprehensive error handling
  const replaceTimeVariables = useCallback(
    (query: string, fieldDetails?: ColumnSchema | null): string => {
      try {
        const result = processQueryWithTimeVariables(
          query,
          state.selectedTimeField,
          state.timeRange,
          fieldDetails || state.selectedTimeFieldDetails,
          state.selectedTimeZone
        );

        if (result.error) {
          console.error("Error processing time variables:", result.error);
          return query; // Return original query if processing fails
        }

        return result.processedQuery;
      } catch (error) {
        console.error("Unexpected error in replaceTimeVariables:", error);
        return query; // Fallback to original query
      }
    },
    [
      state.selectedTimeField,
      state.timeRange,
      state.selectedTimeZone,
      state.selectedTimeFieldDetails,
    ]
  );

  // Create context value without memoization
  const contextValue: TimeContextType = {
    // Time range
    timeRange: state.timeRange,
    setTimeRange,

    // Time fields
    timeFields: state.timeFields,
    selectedTimeField: state.selectedTimeField,
    setSelectedTimeField,
    selectedTimeFieldDetails: state.selectedTimeFieldDetails,

    // Persistence
    getPersistedTimeField,
    setPersistedTimeField,

    // Time zone
    selectedTimeZone: state.selectedTimeZone,
    setSelectedTimeZone,

    // Time variables
    hasTimeVariables: state.hasTimeVariables,
    setHasTimeVariables,
    replaceTimeVariables,

    // Utilities
    detectableTimeFields: state.detectableTimeFields,
    setDetectableTimeFields,
    updateTimeFieldsFromSchema,
    updateSelectedTimeFieldDetails,
  };

  return (
    <TimeContext.Provider value={contextValue}>{children}</TimeContext.Provider>
  );
}

export function useTime() {
  const context = useContext(TimeContext);
  if (context === undefined) {
    throw new Error("useTime must be used within a TimeProvider");
  }
  return context;
}
