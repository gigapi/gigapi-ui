import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useReducer,
  type ReactNode,
} from "react";
import axios from "axios";
import { toast } from "sonner";
import type {
  QueryResult,
  QueryHistoryEntry,
} from "@/types";
import {
  handleQueryError,
  checkForTimeVariables,
  processQueryWithTimeVariables,
  validateTimeVariableContext,
  safeLocalStorage,
  STORAGE_KEYS,
} from "@/lib/";
import { useConnection } from "@/contexts/ConnectionContext";
import { useDatabase } from "@/contexts/DatabaseContext";
import { useTime } from "@/contexts/TimeContext";
import { v4 as uuid4 } from "uuid";

// Define state shape for better organization
interface QueryState {
  query: string;
  results: QueryResult[] | null;
  rawJson: any;
  isLoading: boolean;
  error: string | null;
  queryErrorDetail: string | null;
  startTime: number | null;
  executionTime: number | null;
  responseSize: number | null;
  performanceMetrics: any;
  actualExecutedQuery: string | null;
  isInitializing: boolean;
}

// Action types for reducer
type QueryAction =
  | { type: "SET_QUERY"; payload: string }
  | { type: "START_EXECUTION"; payload: number }
  | {
      type: "SET_RESULTS";
      payload: { results: QueryResult[]; rawJson: any; metrics: any };
    }
  | { type: "SET_ERROR"; payload: { error: string; detail?: string } }
  | { type: "SET_EXECUTION_TIME"; payload: number }
  | { type: "SET_ACTUAL_QUERY"; payload: string }
  | { type: "FINISH_INITIALIZING" }
  | { type: "CLEAR_QUERY" }
  | { type: "RESET_STATE" };

const initialQueryState: QueryState = {
  query: safeLocalStorage.getItem(STORAGE_KEYS.LAST_QUERY) || "",
  results: null,
  rawJson: null,
  isLoading: false,
  error: null,
  queryErrorDetail: null,
  startTime: null,
  executionTime: null,
  responseSize: null,
  performanceMetrics: null,
  actualExecutedQuery: null,
  isInitializing: true,
};

function queryReducer(state: QueryState, action: QueryAction): QueryState {
  switch (action.type) {
    case "SET_QUERY":
      return { ...state, query: action.payload };

    case "START_EXECUTION":
      return {
        ...state,
        isLoading: true,
        error: null,
        queryErrorDetail: null,
        results: null,
        rawJson: null,
        startTime: action.payload,
      };

    case "SET_RESULTS":
      return {
        ...state,
        isLoading: false,
        results: action.payload.results,
        rawJson: action.payload.rawJson,
        performanceMetrics: action.payload.metrics,
      };

    case "SET_ERROR":
      return {
        ...state,
        isLoading: false,
        error: action.payload.error,
        queryErrorDetail: action.payload.detail || null,
      };

    case "SET_EXECUTION_TIME":
      return { ...state, executionTime: action.payload };

    case "SET_ACTUAL_QUERY":
      return { ...state, actualExecutedQuery: action.payload };

    case "CLEAR_QUERY":
      return {
        ...state,
        query: "",
        results: null,
        rawJson: null,
        error: null,
        queryErrorDetail: null,
        executionTime: null,
        responseSize: null,
      };

    case "FINISH_INITIALIZING":
      return { ...state, isInitializing: false };

    case "RESET_STATE":
      return { ...initialQueryState };

    default:
      return state;
  }
}

export interface QueryContextType {
  // Query execution
  query: string;
  setQuery: (query: string) => void;
  executeQuery: () => Promise<void>;
  clearQuery: () => void;

  // App initialization state
  isInitializing: boolean;
  finishInitializing: () => void;

  // Results
  results: QueryResult[] | null;
  rawJson: any;
  isLoading: boolean;
  error: string | null;
  queryErrorDetail: string | null;

  // Performance metrics
  startTime: number | null;
  executionTime: number | null;
  responseSize: number | null;
  performanceMetrics: any;
  actualExecutedQuery: string | null;

  // Query history
  queryHistory: QueryHistoryEntry[];
  addToQueryHistory: (
    entry: Omit<QueryHistoryEntry, "id" | "timestamp">
  ) => void;
  clearQueryHistory: () => void;
  getShareableUrlForQuery: (query: string) => string;
}

const QueryContext = createContext<QueryContextType | undefined>(undefined);

export function QueryProvider({ children }: { children: ReactNode }) {
  const { apiUrl } = useConnection();
  const { selectedDb, selectedTable, getColumnsForTable } = useDatabase();
  const {
    setHasTimeVariables,
    selectedTimeField,
    selectedTimeFieldDetails,
    timeRange,
    updateSelectedTimeFieldDetails,
  } = useTime();

  // Use reducer for complex state management
  const [state, dispatch] = useReducer(queryReducer, initialQueryState);

  // Query history state
  const [queryHistory, setQueryHistory] = useState<QueryHistoryEntry[]>(() => {
    return safeLocalStorage.getJSON(STORAGE_KEYS.QUERY_HISTORY, []);
  });

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);

  // Finishes initialization
  const finishInitializing = useCallback(() => {
    dispatch({ type: "FINISH_INITIALIZING" });
  }, []);

  // Reset state when API URL changes
  useEffect(() => {
    dispatch({ type: "RESET_STATE" });
  }, [apiUrl]);

  // Update selected time field details when dependencies change
  useEffect(() => {
    if (selectedTimeField && selectedTable) {
      const columns = getColumnsForTable(selectedTable);
      if (columns) {
        const fieldDetails = columns.find(
          (col) => col.columnName === selectedTimeField
        );
        updateSelectedTimeFieldDetails(fieldDetails || null);
      } else {
        updateSelectedTimeFieldDetails(null);
      }
    } else {
      updateSelectedTimeFieldDetails(null);
    }
  }, [
    selectedTimeField,
    selectedTable,
    getColumnsForTable,
    updateSelectedTimeFieldDetails,
  ]);

  // Query setter with time variable detection and persistence
  const setQuery = useCallback(
    (newQuery: string) => {
      dispatch({ type: "SET_QUERY", payload: newQuery });
      setHasTimeVariables(checkForTimeVariables(newQuery));
      safeLocalStorage.setItem(STORAGE_KEYS.LAST_QUERY, newQuery);
    },
    [setHasTimeVariables]
  );

  // Add to query history
  const addToQueryHistory = useCallback(
    (entry: Omit<QueryHistoryEntry, "id" | "timestamp">) => {
      const newEntry: QueryHistoryEntry = {
        ...entry,
        id: uuid4(),
        timestamp: new Date().toISOString(),
      };

      setQueryHistory((prev) => {
        const newHistory = [newEntry, ...prev].slice(0, 50);
        safeLocalStorage.setJSON(STORAGE_KEYS.QUERY_HISTORY, newHistory);
        return newHistory;
      });
    },
    []
  );

  // Execute query with comprehensive error handling
  const executeQuery = useCallback(async () => {
    if (!selectedDb) {
      toast.error("Please select a database first");
      return;
    }

    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const queryStartTime = performance.now();
    dispatch({ type: "START_EXECUTION", payload: queryStartTime });

    // Process time variables if needed
    const hasVars = checkForTimeVariables(state.query);
    setHasTimeVariables(hasVars);

    let processedQuery = state.query;
    if (hasVars) {
      const validation = validateTimeVariableContext(
        state.query,
        selectedTimeField,
        timeRange
      );

      if (!validation.isValid) {
        dispatch({
          type: "SET_ERROR",
          payload: {
            error: "Cannot process time variables",
            detail: validation.errors.join(". "),
          },
        });
        toast.error("Cannot process time variables", {
          description: validation.errors.join(". "),
        });
        return;
      }

      const result = processQueryWithTimeVariables(
        state.query,
        selectedTimeField,
        timeRange,
        selectedTimeFieldDetails,
        "UTC"
      );

      if (result.error) {
        dispatch({
          type: "SET_ERROR",
          payload: {
            error: "Error processing time variables",
            detail: result.error,
          },
        });
        toast.error("Error processing time variables", {
          description: result.error,
        });
        return;
      }

      processedQuery = result.processedQuery;
    }

    dispatch({ type: "SET_ACTUAL_QUERY", payload: processedQuery });

    try {
      const fetchStartTime = performance.now();
      const response = await axios.post(
        `${apiUrl}?db=${encodeURIComponent(selectedDb)}&format=ndjson`,
        { query: processedQuery },
        {
          responseType: "text",
          signal: controller.signal,
        }
      );
      const fetchEndTime = performance.now();
      const apiResponseTime = fetchEndTime - fetchStartTime;

      if (response.status >= 400) {
        const queryError = handleQueryError({ response }, state.query);
        dispatch({
          type: "SET_ERROR",
          payload: {
            error: queryError.message,
            detail: queryError.detail || undefined,
          },
        });
        return;
      }

      // Process successful response
      const textData = response.data;
      const lines = textData.split("\n").filter((line: string) => line.trim());
      const streamedResults: any[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          streamedResults.push(JSON.parse(line));
        } catch (e) {
          console.error("Error parsing NDJSON line:", e);
        }
      }

      const metrics = {
        _metric_gigapi_ui: {
          queryTime: 0,
          rowCount: streamedResults.length,
          apiResponseTime,
        },
      };

      dispatch({
        type: "SET_RESULTS",
        payload: {
          results: streamedResults,
          rawJson: textData,
          metrics,
        },
      });

      // Add successful query to history
      addToQueryHistory({
        query: state.query,
        rowCount: streamedResults.length,
        executionTime: performance.now() - queryStartTime,
        db: selectedDb,
        table: selectedTable || null,
        timeField: hasVars ? (selectedTimeField || null) : null,
        timeRange: hasVars ? timeRange : null,
        success: true,
      });
    } catch (err: any) {
      if (err.name === "AbortError" || err.name === "CanceledError") {
        console.debug("Request canceled:", err.message);
        return;
      }

      console.error("Query execution error:", err);

      const statusCode = err.response?.status;
      const errorTitle = statusCode
        ? `Request failed with status code ${statusCode}`
        : "Error executing query";

      let detailedMessage: string | undefined;
      if (err.response?.data) {
        if (typeof err.response.data.error === "string") {
          detailedMessage = err.response.data.error;
        } else if (typeof err.response.data.message === "string") {
          detailedMessage = err.response.data.message;
        } else if (typeof err.response.data === "string") {
          detailedMessage = err.response.data;
        }
      }

      dispatch({
        type: "SET_ERROR",
        payload: {
          error: errorTitle,
          detail: detailedMessage,
        },
      });
    } finally {
      dispatch({
        type: "SET_EXECUTION_TIME",
        payload: performance.now() - queryStartTime,
      });
    }
  }, [
    state.query,
    selectedDb,
    selectedTable,
    apiUrl,
    selectedTimeField,
    selectedTimeFieldDetails,
    timeRange,
    setHasTimeVariables,
    addToQueryHistory,
  ]);

  // Clear query and related state
  const clearQuery = useCallback(() => {
    dispatch({ type: "CLEAR_QUERY" });
    safeLocalStorage.removeItem(STORAGE_KEYS.LAST_QUERY);
  }, []);

  // Clear query history
  const clearQueryHistory = useCallback(() => {
    setQueryHistory([]);
    safeLocalStorage.removeItem(STORAGE_KEYS.QUERY_HISTORY);
  }, []);

  // Generate shareable URL for query
  const getShareableUrlForQuery = useCallback(
    (queryText: string) => {
      const params = new URLSearchParams({
        query: queryText,
        db: selectedDb,
        ...(selectedTable && { table: selectedTable }),
      });
      return `${window.location.origin}${
        window.location.pathname
      }#${params.toString()}`;
    },
    [selectedDb, selectedTable]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // Create context value without memoization
  const contextValue: QueryContextType = {
    // Query state
    query: state.query,
    setQuery,
    executeQuery,
    clearQuery,

    // App initialization state
    isInitializing: state.isInitializing,
    finishInitializing,

    // Results
    results: state.results,
    rawJson: state.rawJson,
    isLoading: state.isLoading,
    error: state.error,
    queryErrorDetail: state.queryErrorDetail,

    // Performance
    startTime: state.startTime,
    executionTime: state.executionTime,
    responseSize: state.responseSize,
    performanceMetrics: state.performanceMetrics,
    actualExecutedQuery: state.actualExecutedQuery,

    // History
    queryHistory,
    addToQueryHistory,
    clearQueryHistory,
    getShareableUrlForQuery,
  };

  return (
    <QueryContext.Provider value={contextValue}>
      {children}
    </QueryContext.Provider>
  );
}

export function useQuery() {
  const context = useContext(QueryContext);
  if (context === undefined) {
    throw new Error("useQuery must be used within a QueryProvider");
  }
  return context;
}
