import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import axios from "axios";
import { toast } from "sonner";
import type { 
  TimeRange, 
  Database, 
  ColumnSchema, 
  TableSchema, 
  SchemaInfo, 
  QueryResult, 
  QueryHistoryEntry,
  ConnectionState,
} from "@/types";
import {
  extractTableName,
  isAbsoluteDate,
  formatDateForSql,
} from "@/lib/time-range-utils";
import HashQueryUtils from "@/lib/hash-query-utils";
import {
  resolveTimeRangeToDates,
  convertDateToScaledEpoch,
} from "@/lib/utils";
import {
  handleQueryError,
  handleConnectionError,
  showSuccessToast,
} from "@/lib/error-utils";
import {
  checkForTimeVariables,
  generateQueryId,
} from "@/lib/query-utils";

// Storage keys
const STORAGE_KEYS = {
  CONNECTION: "gigapi_connection",
  TIME_RANGE: "gigapi_time_range",
  SELECTED_TABLE: "gigapi_selected_table",
  QUERY_HISTORY: "gigapi_query_history",
  SELECTED_TIME_ZONE: "gigapi_selected_time_zone",
  API_URL: "apiUrl",
  SELECTED_DB: "selectedDb",
  LAST_QUERY: "lastQuery",
} as const;

// Action types for state reducer
type AppStateAction = 
  | { type: 'SET_DATABASES'; payload: Database[] }
  | { type: 'SET_SELECTED_DB'; payload: string }
  | { type: 'SET_SELECTED_TABLE'; payload: string | null }
  | { type: 'SET_AVAILABLE_TABLES'; payload: string[] }
  | { type: 'SET_QUERY'; payload: string }
  | { type: 'SET_RESULTS'; payload: { results: QueryResult[] | null; rawJson: any } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: { error: string | null; detail: string | null } }
  | { type: 'SET_SCHEMA'; payload: { db: string; schema: TableSchema[] } }
  | { type: 'SET_TIME_FIELDS'; payload: { fields: string[]; selectedField: string | null } }
  | { type: 'SET_CONNECTION_STATE'; payload: { state: 'connected' | 'connecting' | 'error' | 'idle' | 'empty'; error: string | null } }
  | { type: 'RESET_STATE' };

// Main application state
interface AppState {
  databases: Database[];
  selectedDb: string;
  selectedTable: string | null;
  availableTables: string[];
  query: string;
  results: QueryResult[] | null;
  rawJson: any;
  isLoading: boolean;
  error: string | null;
  queryErrorDetail: string | null;
  schema: SchemaInfo;
  timeFields: string[];
  selectedTimeField: string | null;
  connectionState: 'connected' | 'connecting' | 'error' | 'idle' | 'empty';
  connectionError: string | null;
}

// Initial state
const initialAppState: AppState = {
  databases: [],
  selectedDb: '',
  selectedTable: null,
  availableTables: [],
  query: '',
  results: null,
  rawJson: null,
  isLoading: false,
  error: null,
  queryErrorDetail: null,
  schema: {},
  timeFields: [],
  selectedTimeField: null,
  connectionState: 'idle',
  connectionError: null,
};

// State reducer
function appStateReducer(state: AppState, action: AppStateAction): AppState {
  switch (action.type) {
    case 'SET_DATABASES':
      return { ...state, databases: action.payload };
    case 'SET_SELECTED_DB':
      return { 
        ...state, 
        selectedDb: action.payload,
        selectedTable: null,
        availableTables: [],
        timeFields: [],
        selectedTimeField: null
      };
    case 'SET_SELECTED_TABLE':
      return { ...state, selectedTable: action.payload };
    case 'SET_AVAILABLE_TABLES':
      return { ...state, availableTables: action.payload };
    case 'SET_QUERY':
      return { ...state, query: action.payload };
    case 'SET_RESULTS':
      return { 
        ...state, 
        results: action.payload.results, 
        rawJson: action.payload.rawJson,
        error: null,
        queryErrorDetail: null
      };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { 
        ...state, 
        error: action.payload.error, 
        queryErrorDetail: action.payload.detail,
        results: null
      };
    case 'SET_SCHEMA':
      return { 
        ...state, 
        schema: { ...state.schema, [action.payload.db]: action.payload.schema }
      };
    case 'SET_TIME_FIELDS':
      return { 
        ...state, 
        timeFields: action.payload.fields,
        selectedTimeField: action.payload.selectedField
      };
    case 'SET_CONNECTION_STATE':
      return { 
        ...state, 
        connectionState: action.payload.state,
        connectionError: action.payload.error
      };
    case 'RESET_STATE':
      return { 
        ...initialAppState,
        query: state.query
      };
    default:
      return state;
  }
}

interface QueryContextType {
  selectedDb: string;
  setSelectedDb: (db: string) => void;
  selectedTable: string | null;
  setSelectedTable: (table: string | null) => void;
  availableTables: string[];
  query: string;
  setQuery: (query: string) => void;
  results: QueryResult[] | null;
  rawJson: any;
  isLoading: boolean;
  error: string | null;
  queryErrorDetail: string | null;
  executeQuery: () => Promise<void>;
  clearQuery: () => void;
  databases: Database[];
  loadDatabases: () => Promise<void>;
  apiUrl: string;
  setApiUrl: (url: string) => void;
  startTime: number | null;
  executionTime: number | null;
  responseSize: number | null;
  schema: SchemaInfo;
  isLoadingSchema: boolean;
  loadSchemaForDb: (dbName: string) => Promise<void>;
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
  timeFields: string[];
  selectedTimeField: string | null;
  setSelectedTimeField: (field: string | null) => void;
  detectableTimeFields: boolean;
  getColumnsForTable: (tableName: string) => ColumnSchema[] | null;
  queryHistory: QueryHistoryEntry[];
  addToQueryHistory: (
    entry: Omit<QueryHistoryEntry, "id" | "timestamp">
  ) => void;
  clearQueryHistory: () => void;
  getShareableUrlForQuery: (query: string) => string;
  connectionState: ConnectionState;
  connectionError: string | null;
  selectedTimeZone: string;
  setSelectedTimeZone: (tz: string) => void;
  selectedTimeFieldDetails: ColumnSchema | null;
  performanceMetrics: any;
  hasTimeVariables: boolean;
  actualExecutedQuery: string | null;
}

const QueryContext = createContext<QueryContextType | undefined>(undefined);

// Export the context directly so it can be imported if needed
export { QueryContext };

export function QueryProvider({ children }: { children: ReactNode }) {
  // Main app state using reducer
  const [appState, dispatch] = useReducer(appStateReducer, initialAppState);
  
  // Separate state for non-core functionality
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);

  // Performance metrics
  const [startTime, setStartTime] = useState<number | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [responseSize, setResponseSize] = useState<number | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<any>(null);

  // API configuration
  const [apiUrl, setApiUrlState] = useState(() => {
    const savedUrl = localStorage.getItem(STORAGE_KEYS.API_URL);
    if (savedUrl) return savedUrl;

    const protocol = window.location.protocol || "http:";
    const hostname = window.location.hostname;
    const port = window.location.port;

    return port
      ? `${protocol}//${hostname}:${port}/query`
      : `${protocol}//${hostname}/query`;
  });

  // Extract frequently used state values for cleaner code
  const {
    databases,
    selectedDb,
    selectedTable,
    availableTables,
    query,
    results,
    rawJson,
    isLoading,
    error,
    queryErrorDetail,
    schema,
    timeFields,
    selectedTimeField,
    connectionState,
    connectionError,
  } = appState;

  // Time range state
  const [timeRange, setTimeRangeInternal] = useState<TimeRange>(() => {
    try {
      const savedTimeRange = localStorage.getItem(STORAGE_KEYS.TIME_RANGE);
      if (savedTimeRange) {
        return JSON.parse(savedTimeRange);
      }
    } catch (e) {
      console.error("Failed to parse saved time range", e);
    }
    return {
      from: "now-24h",
      to: "now",
      display: "Last 24 hours",
      enabled: true,
    };
  });

  const [detectableTimeFields, setDetectableTimeFields] =
    useState<boolean>(false);

  // Query history state
  const [queryHistory, setQueryHistory] = useState<QueryHistoryEntry[]>(() => {
    try {
      const savedHistory = localStorage.getItem(STORAGE_KEYS.QUERY_HISTORY);
      if (savedHistory) {
        return JSON.parse(savedHistory);
      }
    } catch (e) {
      console.error("Failed to parse saved query history", e);
    }
    return [];
  });

  // Refs for state values needed in callbacks without causing dep cycles
  const connectionStateRef = useRef(connectionState);
  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  const databasesRef = useRef(databases);
  useEffect(() => {
    databasesRef.current = databases;
  }, [databases]);

  // Helper function to get columns for a specific table
  const getColumnsForTable = useCallback(
    (tableName: string): ColumnSchema[] | null => {
      if (!selectedDb || !schema || !schema[selectedDb]) return null;

      const tableSchema = schema[selectedDb].find(
        (table) => table.tableName === tableName
      );
      return tableSchema?.columns || null;
    },
    [selectedDb, schema]
  );

  // Calculate selectedTimeFieldDetails
  const selectedTimeFieldDetails = useMemo(() => {
    if (!selectedDb || !selectedTimeField || !schema[selectedDb]) {
      return null;
    }
    // Determine the table to look into: either explicitly selected or extracted from query
    const currentTable =
      selectedTable || (query ? extractTableName(query) : null);
    if (!currentTable) {
      return null;
    }

    const tableSchema = schema[selectedDb].find(
      (table) => table.tableName === currentTable
    );
    if (!tableSchema || !tableSchema.columns) {
      return null;
    }
    return (
      tableSchema.columns.find((col) => col.columnName === selectedTimeField) ||
      null
    );
  }, [selectedDb, selectedTimeField, selectedTable, query, schema]);

  // Time zone state
  const [selectedTimeZone, setSelectedTimeZoneState] = useState<string>(() => {
    const savedTz = localStorage.getItem(STORAGE_KEYS.SELECTED_TIME_ZONE);
    if (savedTz) return savedTz;
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch (e) {
      return "UTC"; // Fallback if Intl API fails or not available
    }
  });

  // Add new state for tracking time variables and actual executed query
  const [hasTimeVariables, setHasTimeVariables] = useState(false);
  const [actualExecutedQuery, setActualExecutedQuery] = useState<string | null>(
    null
  );

  // Replaces the variables in the query with the actual values
  const replaceQueryVariables = useCallback(
    (rawQuery: string) => {
      // Exit early if we don't have a query or time field
      if (!rawQuery || !selectedTimeField) {
        return rawQuery;
      }

      // Calculate actual time range values
      const { fromDate: startTime, toDate: endTime } = resolveTimeRangeToDates(
        { from: timeRange.from, to: timeRange.to },
        selectedTimeZone,
        isAbsoluteDate
      );

      // Replace all variables in the query
      let processedQuery = rawQuery;

      // Replace timeField variable with the actual field name
      if (processedQuery.includes("$__timeField")) {
        processedQuery = processedQuery.replace(
          /\$__timeField/g,
          selectedTimeField
        );
      }

      // Replace timeFilter variable with the actual WHERE condition
      if (processedQuery.includes("$__timeFilter")) {
        // Get field details to determine type and format
        const fieldDetails = getColumnsForTable(selectedTable || "")?.find(
          (col) => col.columnName === selectedTimeField
        );

        let timeType = "timestamp"; // Default to timestamp
        if (fieldDetails) {
          const dataType = fieldDetails.dataType.toLowerCase();
          if (dataType.includes("int") || dataType.includes("long")) {
            timeType = "epoch";
            // Use timeUnit if available
            if (fieldDetails.timeUnit) {
              timeType = `epoch_${fieldDetails.timeUnit}`;
            }
          }
        }

        let timeCondition = "";
        // Format dates based on timeType
        if (timeType === "timestamp") {
          // Use SQL format for timestamps
          timeCondition = `${selectedTimeField} BETWEEN ${
            isAbsoluteDate(timeRange.from)
              ? `${formatDateForSql(startTime)}`
              : `${formatDateForSql(startTime)}`
          } AND ${
            isAbsoluteDate(timeRange.to)
              ? `${formatDateForSql(endTime)}`
              : `${formatDateForSql(endTime)}`
          }`;
        } else if (timeType.startsWith("epoch")) {
          // For epoch time, convert to seconds, milliseconds, etc.
          const startEpoch = convertDateToScaledEpoch(
            startTime,
            fieldDetails?.timeUnit
          );
          const endEpoch = convertDateToScaledEpoch(
            endTime,
            fieldDetails?.timeUnit
          );
          timeCondition = `${selectedTimeField} BETWEEN ${startEpoch} AND ${endEpoch}`;
        }

        processedQuery = processedQuery.replace(
          /\$__timeFilter/g,
          timeCondition
        );
      }

      // Replace timeFrom and timeTo variables with actual values
      if (processedQuery.includes("$__timeFrom")) {
        const fromStr = isAbsoluteDate(timeRange.from)
          ? `'${formatDateForSql(startTime)}'`
          : `'${formatDateForSql(startTime)}'`;
        processedQuery = processedQuery.replace(/\$__timeFrom/g, fromStr);
      }

      if (processedQuery.includes("$__timeTo")) {
        const toStr = isAbsoluteDate(timeRange.to)
          ? `'${formatDateForSql(endTime)}'`
          : `'${formatDateForSql(endTime)}'`;
        processedQuery = processedQuery.replace(/\$__timeTo/g, toStr);
      }

      return processedQuery;
    },
    [
      selectedTimeField,
      timeRange,
      selectedTable,
      getColumnsForTable,
      selectedTimeZone,
      isAbsoluteDate,
    ]
  );

  // Replaces the variables in the query with the actual values
  const replaceQueryVariablesCallback = useCallback(
    (rawQuery: string) => {
      // Use the internal replaceQueryVariables function instead of the utility
      return replaceQueryVariables(rawQuery);
    },
    [replaceQueryVariables]
  );

  // Helper functions - using imported utilities
  const setQueryWithCheck = useCallback(
    (newQuery: string) => {
      dispatch({ type: 'SET_QUERY', payload: newQuery });
      setHasTimeVariables(checkForTimeVariables(newQuery));
    },
    []
  );

  // Move addToQueryHistory function above the executeQuery function
  const saveQueryHistory = useCallback((history: QueryHistoryEntry[]) => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.QUERY_HISTORY,
        JSON.stringify(history.slice(0, 50))
      );
    } catch (e) {
      console.error("Failed to save query history", e);
    }
  }, []);

  const addToQueryHistory = useCallback(
    (entry: Omit<QueryHistoryEntry, "id" | "timestamp">) => {
      const newEntry: QueryHistoryEntry = {
        ...entry,
        id: generateQueryId(),
        timestamp: new Date().toISOString(),
      };
      setQueryHistory((prev) => {
        const newHistory = [newEntry, ...prev].slice(0, 50);
        saveQueryHistory(newHistory);
        return newHistory;
      });
    },
    [saveQueryHistory]
  );

  // Add a ref to store the current AbortController
  const abortControllerRef = useRef<AbortController | null>(null);

  // Modified executeQuery function to use the abort controller ref
  const executeQuery = useCallback(async () => {
    if (!selectedDb) {
      toast.error("Please select a database first");
      return;
    }

    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create a new AbortController
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    const queryStartTime = performance.now();
    setStartTime(queryStartTime);
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: { error: null, detail: null } });
    dispatch({ type: 'SET_RESULTS', payload: { results: null, rawJson: null } });

    // Always store the last query
    localStorage.setItem(STORAGE_KEYS.LAST_QUERY, query);

    // Check if query contains time variables
    const hasVars = checkForTimeVariables(query);
    setHasTimeVariables(hasVars);

    // Process variables in the query if there are any
    let processedQuery = query;
    if (hasVars) {
      if (!selectedTimeField) {
        toast.warning(
          "Query contains time variables, but no time field is selected",
          {
            description: "Please select a time field to use time variables",
          }
        );
        dispatch({ type: 'SET_LOADING', payload: false });
        return;
      }

      processedQuery = replaceQueryVariablesCallback(query);

      // If time variables couldn't be replaced (e.g., no time field selected)
      if (processedQuery === query && hasVars) {
        toast.error("Could not process time variables", {
          description: "Please check your time field selection and time range",
        });
        dispatch({ type: 'SET_LOADING', payload: false });
        return;
      }
    }

    // Store the actual query that will be executed
    setActualExecutedQuery(processedQuery);

    try {
      // Execute the query with NDJSON format
      const fetchStartTime = performance.now();
      const response = await axios.post(
        `${apiUrl}?db=${encodeURIComponent(
          selectedDb
        )}&format=ndjson`,
        { query: processedQuery },
        { 
          responseType: "text",
          signal: controller.signal // Use AbortController signal
        }
      );
      const fetchEndTime = performance.now();
      const apiResponseTime = fetchEndTime - fetchStartTime;

      // Handle API error responses
      if (response.status >= 400) {
        const queryError = handleQueryError({ response }, query);
        dispatch({ type: 'SET_ERROR', payload: { error: queryError.message, detail: queryError.detail || null } });
      } 
      // Handle successful NDJSON response
      else if (response.status >= 200 && response.status < 300) {
        // Process the NDJSON text data line by line
        const textData = response.data;
        
        const lines = textData.split('\n').filter((line: string) => line.trim());
        const streamedResults: any[] = [];
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const parsedLine = JSON.parse(line);
            streamedResults.push(parsedLine);
          } catch (e) {
            console.error("Error parsing NDJSON line:", e);
          }
        }
        
        // Set the results
        dispatch({ type: 'SET_RESULTS', payload: { results: streamedResults, rawJson: textData } });
        
        // Update performance metrics
        setPerformanceMetrics({
          _metric_gigapi_ui: {
            queryTime: 0,
            rowCount: streamedResults.length,
            apiResponseTime,
          },
        });
        
        // Add to history - only include time-related fields if they were actually used
        const historyItem: QueryHistoryEntry = {
          id: Date.now().toString(),
          query,
          timestamp: new Date().toISOString(),
          rowCount: streamedResults.length,
          executionTime: performance.now() - queryStartTime,
          db: selectedDb,
          table: selectedTable,
          timeField: hasVars ? selectedTimeField : null,
          timeRange: hasVars ? timeRange : null,
          success: true,
        };
        
        setQueryHistory((prev) => [historyItem, ...prev]);
        
        // Store in localStorage
        const updatedHistory = [historyItem, ...queryHistory].slice(0, 100);
        localStorage.setItem(STORAGE_KEYS.QUERY_HISTORY, JSON.stringify(updatedHistory));
      } else {
        // Handle other error responses
        const errorMsg = `Error: ${response.status} ${response.statusText}`;
        dispatch({ type: 'SET_ERROR', payload: { error: errorMsg, detail: errorMsg } });
      }
      
      // Record total execution time
      const executionTime = performance.now() - queryStartTime;
      setExecutionTime(executionTime);
      
    } catch (err: any) {
      // Don't report canceled requests as errors
      if (err.name === 'AbortError' || err.name === 'CanceledError') {
        console.debug('Request canceled:', err.message);
        dispatch({ type: 'SET_LOADING', payload: false });
        return;
      }
      
      console.error("Query execution error:", err);

      // Extract detailed error information from response
      let statusCode = err.response?.status;
      let errorTitle = statusCode
        ? `Request failed with status code ${statusCode}`
        : "Error executing query";

      // Get the detailed error message from the response if available
      let detailedMessage = null;
      if (err.response?.data) {
        if (typeof err.response.data.error === "string") {
          detailedMessage = err.response.data.error;
        } else if (typeof err.response.data.message === "string") {
          detailedMessage = err.response.data.message;
        } else if (typeof err.response.data === "string") {
          detailedMessage = err.response.data;
        }
      }

      // Set error state
      dispatch({ type: 'SET_ERROR', payload: { error: errorTitle, detail: detailedMessage } });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [
    query,
    selectedDb,
    apiUrl,
    timeRange,
    selectedTimeField,
    queryHistory,
    getColumnsForTable,
    selectedTable,
    selectedTimeZone,
    replaceQueryVariablesCallback,
    addToQueryHistory,
  ]);

  // Add a cleanup effect for the AbortController
  useEffect(() => {
    // This effect only handles cleanup
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // ----------------------------------------
  // API Connection and Database Management
  // ----------------------------------------

  // API connection handler
  const connectToApi = useCallback(
    async (urlToConnect: string) => {
      if (
        urlToConnect === apiUrl &&
        connectionStateRef.current === "connecting"
      ) {
        return;
      }
      // Reset states
      dispatch({ type: 'SET_CONNECTION_STATE', payload: { state: 'connecting', error: null } });
      dispatch({ type: 'RESET_STATE' });

      try {
        // Make the request with NDJSON format
        const response = await axios.post(
          `${urlToConnect}${
            urlToConnect.includes("?") ? "&" : "?"
          }format=ndjson`,
          { query: "SHOW DATABASES" },
          {
            timeout: 60000, // 60 seconds timeout
            responseType: "text",
          }
        );

        // check the response header if the content type is not application/x-ndjson throw an error "Api response is not NDJSON"
        const contentType = response.headers["content-type"];
        if (!contentType || !contentType.includes("application/x-ndjson")) {
          throw new Error("API response is not NDJSON, please update your GigAPI server");
        }

        // Process the NDJSON response to get database list
        let dbList: Database[] = [];
        
        const lines = response.data
          .split(/\r?\n/)
          .filter((line: string) => line.trim().length > 0);

        dbList = lines
          .map((line: string) => {
            try {
              return JSON.parse(line);
            } catch (e) {
              console.warn("Error parsing NDJSON line:", line);
              return null;
            }
          })
          .filter(Boolean);

        // Process the database list and complete connection
        if (dbList.length > 0) {
          dispatch({ type: 'SET_DATABASES', payload: dbList });
          dispatch({ type: 'SET_CONNECTION_STATE', payload: { state: 'connected', error: null } });
          showSuccessToast(`Connected to API`, `Found ${dbList.length} databases available`);
          const savedDbFromStorage = localStorage.getItem(STORAGE_KEYS.SELECTED_DB);
          let dbToMakeActive = dbList[0].database_name; // Default to first
          if (
            savedDbFromStorage &&
            dbList.some((db) => db.database_name === savedDbFromStorage)
          ) {
            dbToMakeActive = savedDbFromStorage;
          }
          dispatch({ type: 'SET_SELECTED_DB', payload: dbToMakeActive });

          // Save connection info to local storage
          const connection = {
            apiUrl: urlToConnect,
            selectedDb: dbToMakeActive,
            lastConnected: new Date().toISOString(),
          };
          localStorage.setItem(STORAGE_KEYS.CONNECTION, JSON.stringify(connection));
        } else {
          // Change this part to indicate "empty" state instead of error
          dispatch({ type: 'SET_CONNECTION_STATE', payload: { state: 'empty', error: null } });
          dispatch({ type: 'SET_DATABASES', payload: [] });
          // Still save connection info
          const connection = {
            apiUrl: urlToConnect,
            selectedDb: "",
            lastConnected: new Date().toISOString(),
          };
          localStorage.setItem(STORAGE_KEYS.CONNECTION, JSON.stringify(connection));
        }
      } catch (err: any) {
        console.error("Failed to connect to API:", err);
        const connectionError = handleConnectionError(err, urlToConnect);
        dispatch({ type: 'SET_CONNECTION_STATE', payload: { state: 'error', error: connectionError.message } });
      }
    },
    [apiUrl]
  );

  const loadDatabases = useCallback(async () => {
    await connectToApi(apiUrl);
  }, [apiUrl, connectToApi]);

  const resetAppState = useCallback(() => {
    dispatch({ type: 'RESET_STATE' });
    setStartTime(null);
    setExecutionTime(null);
    setResponseSize(null);
    HashQueryUtils.clearUrlParameters();
  }, []);

  // Effect to save apiUrl to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.API_URL, apiUrl);
  }, [apiUrl]);


  // Main effect to handle API URL changes: reset state and attempt connection
  useEffect(() => {
    resetAppState(); // Clear previous state before attempting a new connection
    loadDatabases().catch(console.error); // Initiate connection
  }, [apiUrl, loadDatabases, resetAppState]); // Dependencies are key triggers

  // Load schema for a specific database
  const loadSchemaForDb = useCallback(
    async (dbName: string) => {
      if (!dbName) return;

      if (schema[dbName] && schema[dbName].length > 0) {
        const tables = schema[dbName].map((table) => table.tableName);
        dispatch({ type: 'SET_AVAILABLE_TABLES', payload: tables });
        return;
      }

      setIsLoadingSchema(true);
      try {
        const tablesResponse = await axios.post(
          `${apiUrl}?db=${encodeURIComponent(dbName)}&format=ndjson`,
          { query: "SHOW TABLES" },
          { responseType: "text", timeout: 8000 }
        );

        const dbSchema: TableSchema[] = [];
        let tableNames: string[] = [];

        const tableObjects = tablesResponse.data
          .split(/\r?\n/)
          .filter((line: string) => line.trim().length > 0)
          .map((line: string) => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        tableObjects.forEach((table: any) => {
          const tableName = table.table_name || Object.values(table)[0];
          if (tableName) tableNames.push(tableName as string);
        });
        dispatch({ type: 'SET_AVAILABLE_TABLES', payload: tableNames });

        if (tableNames.length > 0) {
          // Helper function to parse column data and infer timeUnit
          const parseAndInferColumns = (
            responseData: any
          ): ColumnSchema[] => {
            const columns: ColumnSchema[] = [];
            
            const rawCols = responseData
              .split(/\r?\n/)
              .filter((line: string) => line.trim().length > 0)
              .map((line: string) => {
                try {
                  return JSON.parse(line);
                } catch {
                  return null;
                }
              })
              .filter(Boolean);

            rawCols.forEach((col: any) => {
              const columnName =
                col.Field ||
                col.column_name ||
                col.name ||
                (Object.values(col)[0] as string);
              const dataType =
                col.Type ||
                col.data_type ||
                col.type ||
                (Object.values(col)[1] as string) ||
                "unknown";
              let timeUnit: ColumnSchema["timeUnit"];

              const lowerDataType = dataType.toLowerCase();
              const lowerColName = columnName.toLowerCase();

              if (
                lowerDataType.includes("bigint") ||
                lowerDataType.includes("long") ||
                lowerDataType.includes("numeric") ||
                lowerDataType.includes("int")
              ) {
                // Priority 1: Suffixes
                if (
                  lowerColName.endsWith("_ns") ||
                  lowerColName.includes("nanos") ||
                  lowerColName.includes("nano")
                )
                  timeUnit = "ns";
                else if (
                  lowerColName.endsWith("_us") ||
                  lowerColName.includes("micros") ||
                  lowerColName.includes("micro")
                )
                  timeUnit = "us";
                else if (
                  lowerColName.endsWith("_ms") ||
                  lowerColName.includes("millis") ||
                  lowerColName.includes("milli")
                )
                  timeUnit = "ms";
                else if (
                  lowerColName.endsWith("_s") ||
                  lowerColName.includes("secs") ||
                  lowerColName.includes("sec")
                )
                  timeUnit = "s";
                // Priority 2: Strong Conventions (if no suffix matches)
                else if (lowerColName === "__timestamp") timeUnit = "ns";
                // Strong convention for high-res main timestamp
                else if (
                  lowerColName === "created_at" ||
                  lowerColName === "create_date"
                )
                  timeUnit = "ms"; // Strong convention for creation timestamps
                // Priority 3: Broader "timeish" heuristic for BIGINTs (if no suffix or strong convention matches)
                else if (
                  lowerColName === "time" ||
                  lowerColName.includes("time") ||
                  lowerColName.includes("date") ||
                  lowerColName.includes("timestamp")
                ) {
                  timeUnit = "ns"; // Assume nanoseconds for generic BIGINT timeish columns without explicit units
                }
              }
              columns.push({ columnName, dataType, timeUnit });
            });
            return columns;
          };

          const tablePromises = tableNames.map(async (tableName) => {
            try {
              const columnsResponse = await axios.post(
                `${apiUrl}?db=${encodeURIComponent(dbName)}&format=ndjson`,
                { query: `DESCRIBE SELECT * FROM ${tableName} LIMIT 1` },
                {
                  timeout: 5000,
                  responseType: "text",
                }
              );
              const columns = parseAndInferColumns(
                columnsResponse.data
              );
              return { tableName, columns };
            } catch (err) {
              console.warn(
                `Failed to DESCRIBE SELECT for ${tableName}, trying DESCRIBE`,
                err
              );
              try {
                const columnsResponse = await axios.post(
                  `${apiUrl}?db=${encodeURIComponent(dbName)}&format=ndjson`,
                  { query: `DESCRIBE ${tableName}` },
                  {
                    timeout: 5000,
                    responseType: "text",
                  }
                );
                const columns = parseAndInferColumns(
                  columnsResponse.data
                );
                return { tableName, columns };
              } catch (innerErr) {
                console.warn(
                  `Failed to fetch columns for ${tableName} with DESCRIBE also`,
                  innerErr
                );
                return { tableName, columns: [] }; // Ensure columns is always an array
              }
            }
          });
          const tableResults = await Promise.allSettled(tablePromises);
          tableResults.forEach((result) => {
            if (result.status === "fulfilled") dbSchema.push(result.value);
            else
              console.error("Failed to load table schema part:", result.reason);
          });
          dispatch({ type: 'SET_SCHEMA', payload: { db: dbName, schema: dbSchema } });
        } else {
          dispatch({ type: 'SET_SCHEMA', payload: { db: dbName, schema: [] } });
          dispatch({ type: 'SET_AVAILABLE_TABLES', payload: [] });
        }
      } catch (err: any) {
        console.error(`Failed to load schema for ${dbName}:`, err);
        toast.error(`Schema load failed: ${err.message}`);
        dispatch({ type: 'SET_SCHEMA', payload: { db: dbName, schema: [] } });
        dispatch({ type: 'SET_AVAILABLE_TABLES', payload: [] });
      } finally {
        setIsLoadingSchema(false);
      }
    },
    [apiUrl, schema] // `schema` is a dependency because of the check `if (schema[dbName]...)`
  );

  useEffect(() => {
    if (databases.length > 0 && connectionState === "connected") {
      // Ensure connection is stable and DBs are loaded
      const savedQuery = localStorage.getItem(STORAGE_KEYS.LAST_QUERY);

      // Don't automatically select a table, only if explicitly coming from history or URL
      // if (savedTable && availableTables.includes(savedTable)) {
      //  setSelectedTableState(savedTable); // Use internal setter
      // }

      if (savedQuery) setQueryWithCheck(savedQuery);
    }
  }, [databases, availableTables, connectionState, setQueryWithCheck]); // Rerun when DBs or tables become available, or connection established

  useEffect(() => {
    if (selectedTable) {
      localStorage.setItem(STORAGE_KEYS.SELECTED_TABLE, selectedTable);

      if (selectedDb && schema && schema[selectedDb]) {
        const tableSchemaData = schema[selectedDb].find(
          (t) => t.tableName === selectedTable
        );
        if (tableSchemaData && tableSchemaData.columns) {
          const fields: string[] = [];
          tableSchemaData.columns.forEach((column) => {
            const colName = column.columnName?.toLowerCase() || "";
            const dataType = column.dataType?.toLowerCase() || "";
            if (
              colName === "__timestamp" ||
              colName === "time" ||
              colName === "timestamp" ||
              colName === "date" ||
              colName === "time_sec" ||
              colName === "time_usec" ||
              colName === "created_at" ||
              colName === "updated_at" ||
              colName === "create_date" ||
              colName.includes("date") ||
              colName.includes("time") ||
              dataType.includes("timestamp") ||
              dataType.includes("datetime") ||
              dataType.includes("date") ||
              dataType.includes("time") ||
              (dataType.includes("bigint") &&
                (colName.includes("time") || colName.includes("date")))
            ) {
              fields.push(column.columnName);
            }
          });
          dispatch({ type: 'SET_TIME_FIELDS', payload: { fields, selectedField: null } });
          setDetectableTimeFields(fields.length > 0);
        } else {
          dispatch({ type: 'SET_TIME_FIELDS', payload: { fields: [], selectedField: null } });
          setDetectableTimeFields(false);
        }
      }
    } else {
      localStorage.removeItem(STORAGE_KEYS.SELECTED_TABLE);
      dispatch({ type: 'SET_TIME_FIELDS', payload: { fields: [], selectedField: null } });
    }
  }, [selectedTable, selectedDb, schema]);

  const saveTimeRange = useCallback((range: TimeRange) => {
    try {
      localStorage.setItem(STORAGE_KEYS.TIME_RANGE, JSON.stringify(range));
    } catch (e) {
      console.error("Failed to save time range", e);
    }
  }, []);

  const updateTimeRange = useCallback(
    (range: TimeRange) => {
      setTimeRangeInternal(range); // Use internal setter
      saveTimeRange(range);
    },
    [saveTimeRange] // setTimeRangeInternal is stable
  );

  const clearQueryHistory = useCallback(() => {
    setQueryHistory([]);
    localStorage.removeItem(STORAGE_KEYS.QUERY_HISTORY);
  }, []);

  const getShareableUrlForQuery = useCallback(
    (queryText: string) => {
      const params = {
        query: queryText,
        db: selectedDb,
        table: selectedTable || undefined,
        timeField: selectedTimeField || undefined,
        timeFrom: timeRange?.from,
        timeTo: timeRange?.to,
      };
      return HashQueryUtils.generateShareableUrl(params);
    },
    [selectedDb, selectedTable, selectedTimeField, timeRange]
  );

  // ----------------------------------------
  // Query Execution and History
  // ----------------------------------------

  const clearQuery = useCallback(() => {
    dispatch({ type: 'SET_QUERY', payload: '' });
    dispatch({ type: 'SET_RESULTS', payload: { results: null, rawJson: null } });
    dispatch({ type: 'SET_ERROR', payload: { error: null, detail: null } });
    setExecutionTime(null);
    setResponseSize(null);
    localStorage.removeItem(STORAGE_KEYS.LAST_QUERY);
  }, []);

  // ----------------------------------------
  // Time Range and Settings Management
  // ----------------------------------------

  const selectDatabase = useCallback(
    (dbName: string) => {
      if (databases.length === 0 && dbName) {
        // Allow setting if databases not yet loaded (e.g. from hash)
        dispatch({ type: 'SET_SELECTED_DB', payload: dbName });
        return;
      }
      if (dbName && databases.some((db) => db.database_name === dbName)) {
        if (selectedDb !== dbName) dispatch({ type: 'SET_SELECTED_DB', payload: dbName });
      } else if (dbName) {
        toast.warning(`Database "${dbName}" not available.`);
        if (selectedDb !== "") dispatch({ type: 'SET_SELECTED_DB', payload: '' });
      } else {
        if (selectedDb !== "") dispatch({ type: 'SET_SELECTED_DB', payload: '' });
      }
    },
    [databases, selectedDb]
  ); // selectedDb for comparison

  const selectTable = useCallback(
    (tableName: string | null) => {
      if (tableName === null) {
        if (selectedTable !== null) dispatch({ type: 'SET_SELECTED_TABLE', payload: null });
        return;
      }
      if (availableTables.length === 0 && tableName) {
        // Allow setting if tables not yet loaded
        dispatch({ type: 'SET_SELECTED_TABLE', payload: tableName });
        return;
      }
      if (tableName && availableTables.includes(tableName)) {
        if (selectedTable !== tableName) dispatch({ type: 'SET_SELECTED_TABLE', payload: tableName });
      } else if (tableName) {
        toast.warning(`Table "${tableName}" not available.`);
        if (selectedTable !== null) dispatch({ type: 'SET_SELECTED_TABLE', payload: null });
      }
    },
    [availableTables, selectedTable]
  ); // selectedTable for comparison

  const updateApiUrl = useCallback(
    (newUrl: string) => {
      if (newUrl !== apiUrl) {
        HashQueryUtils.clearUrlParameters();
        setApiUrlState(newUrl); // Use internal setter, this triggers the main connection useEffect
      }
    },
    [apiUrl]
  ); // apiUrl for comparison, setApiUrlState is stable

  const setSelectedTimeFieldCallback = useCallback(
    (field: string | null) => {
      dispatch({ type: 'SET_TIME_FIELDS', payload: { fields: timeFields, selectedField: field } });
    },
    [timeFields]
  );

  // Effect to save selectedTimeZone to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SELECTED_TIME_ZONE, selectedTimeZone);
  }, [selectedTimeZone]);

  useEffect(() => {
    if (selectedDb) {
      localStorage.setItem(STORAGE_KEYS.SELECTED_DB, selectedDb);
      dispatch({ type: 'SET_SELECTED_TABLE', payload: null });
      dispatch({ type: 'SET_AVAILABLE_TABLES', payload: [] });
      dispatch({ type: 'SET_TIME_FIELDS', payload: { fields: [], selectedField: null } });
      HashQueryUtils.clearUrlParameters();

      loadSchemaForDb(selectedDb).catch(console.error);
    }
  }, [selectedDb, loadSchemaForDb, apiUrl]);

  // Clean up pending requests when component unmounts or dependencies change
  useEffect(() => {
    // Don't try to replace executeQuery function
    // Cleanup function to abort any pending requests
    return () => {
      // No need to reference any controller here
      // This will be a no-op but prevents the error
    };
  }, []);

  return (
    <QueryContext.Provider
      value={{
        selectedDb,
        setSelectedDb: selectDatabase,
        selectedTable,
        setSelectedTable: selectTable,
        availableTables,
        query,
        setQuery: setQueryWithCheck, 
        results,
        rawJson,
        isLoading,
        error,
        queryErrorDetail,
        executeQuery,
        clearQuery,
        databases,
        loadDatabases,
        apiUrl,
        setApiUrl: updateApiUrl,
        startTime,
        executionTime,
        responseSize,
        schema,
        isLoadingSchema,
        loadSchemaForDb,
        timeRange,
        setTimeRange: updateTimeRange,
        timeFields,
        selectedTimeField,
        setSelectedTimeField: setSelectedTimeFieldCallback,
        detectableTimeFields,
        getColumnsForTable,
        queryHistory,
        addToQueryHistory,
        clearQueryHistory,
        getShareableUrlForQuery,
        connectionState,
        connectionError,
        selectedTimeZone,
        setSelectedTimeZone: setSelectedTimeZoneState,
        selectedTimeFieldDetails,
        performanceMetrics,
        hasTimeVariables,
        actualExecutedQuery,
      }}
    >
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
