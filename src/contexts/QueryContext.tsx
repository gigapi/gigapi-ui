import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  type ReactNode,
} from "react";
import axios from "axios";
import { toast } from "sonner";
import type { TimeRange } from "../components/TimeRangeSelector";
import {
  extractTableName,
  isAbsoluteDate,
  formatDateForSql,
} from "../lib/time-range-utils";
import HashQueryUtils from "../lib/hash-query-utils";
import {
  resolveTimeRangeToDates,
  convertDateToScaledEpoch,
} from "../lib/utils";

// Storage keys
const CONNECTION_KEY = "gigapi_connection";
const TIME_RANGE_KEY = "gigapi_time_range";
const SELECTED_TABLE_KEY = "gigapi_selected_table";
const QUERY_BUILDER_KEY = "gigapi_query_builder";
const QUERY_HISTORY_KEY = "gigapi_query_history";
const SELECTED_TIME_ZONE_KEY = "gigapi_selected_time_zone";

// Type definitions
type Database = {
  database_name: string;
};

// Query history entry type
type QueryHistoryEntry = {
  id: string;
  query: string;
  db: string;
  table: string | null;
  timestamp: string;
  timeField: string | null;
  timeRange: TimeRange | null;
  success: boolean;
  error?: string;
  executionTime?: number;
  rowCount?: number;
};

// Schema types
type ColumnSchema = {
  columnName: string;
  dataType: string;
  timeUnit?: "s" | "ms" | "us" | "ns"; // Added for numeric time fields
};

type TableSchema = {
  tableName: string;
  columns: ColumnSchema[];
};

type SchemaInfo = Record<string, TableSchema[]>; // Database name -> tables

type QueryResult = Record<string, any>;

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
  queryBuilderEnabled: boolean;
  setQueryBuilderEnabled: (enabled: boolean) => void;

  // Connection state
  connectionState: "connected" | "connecting" | "error" | "idle" | "empty";
  connectionError: string | null;

  // Query history methods
  queryHistory: QueryHistoryEntry[];
  addToQueryHistory: (
    entry: Omit<QueryHistoryEntry, "id" | "timestamp">
  ) => void;
  clearQueryHistory: () => void;
  getShareableUrlForQuery: (query: string) => string;
  format: string;
  setFormat: (format: string) => void;

  // Time Zone
  selectedTimeZone: string;
  setSelectedTimeZone: (tz: string) => void;

  // Details for the selected time field
  selectedTimeFieldDetails: ColumnSchema | null;

  // Format compatibility state
  formatCompatibility: {
    supportsNdjson: boolean;
    detected: boolean;
  };
}

const QueryContext = createContext<QueryContextType | undefined>(undefined);

// Export the context directly so it can be imported if needed
export { QueryContext };

export function QueryProvider({ children }: { children: ReactNode }) {
  // State management for query execution
  const [selectedDb, setSelectedDbState] = useState(""); // Renamed to avoid conflict with context value
  const [selectedTable, setSelectedTableState] = useState<string | null>(null); // Renamed
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QueryResult[] | null>(null);
  const [rawJson, setRawJson] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryErrorDetail, setQueryErrorDetail] = useState<string | null>(null);

  // Database and schema state
  const [databases, setDatabases] = useState<Database[]>([]);
  const [schema, setSchema] = useState<SchemaInfo>({});
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);

  // Performance metrics
  const [startTime, setStartTime] = useState<number | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [responseSize, setResponseSize] = useState<number | null>(null);

  // API configuration
  const [apiUrl, setApiUrlState] = useState(() => {
    // Renamed
    const savedUrl = localStorage.getItem("apiUrl");
    if (savedUrl) return savedUrl;

    const protocol = window.location.protocol || "http:";
    const hostname = window.location.hostname;
    const port = window.location.port;

    return port
      ? `${protocol}//${hostname}:${port}/query`
      : `${protocol}//${hostname}/query`;
  });

  // API connection state
  const [connectionState, setConnectionState] = useState<
    "connected" | "connecting" | "error" | "idle" | "empty"
  >("idle");
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Format state
  const [format, setFormat] = useState(() => {
    return localStorage.getItem("queryFormat") || "ndjson";
  });

  // Format compatibility state
  const [formatCompatibility, setFormatCompatibility] = useState<{
    supportsNdjson: boolean;
    detected: boolean;
  }>({
    supportsNdjson: true,
    detected: false,
  });

  // Time range state
  const [timeRange, setTimeRangeInternal] = useState<TimeRange>(() => {
    // Renamed
    try {
      const savedTimeRange = localStorage.getItem(TIME_RANGE_KEY);
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

  const [timeFields, setTimeFields] = useState<string[]>([]);
  const [selectedTimeField, setSelectedTimeField] = useState<string | null>(
    null
  );
  const [detectableTimeFields, setDetectableTimeFields] =
    useState<boolean>(false);

  // Query builder state
  const [queryBuilderEnabled, setQueryBuilderEnabled] = useState(() => {
    try {
      const savedState = localStorage.getItem(QUERY_BUILDER_KEY);
      // Only enable it if explicitly set to true in localStorage
      return savedState ? JSON.parse(savedState) === true : false;
    } catch (e) {
      console.error("Failed to parse saved query builder state", e);
      return false; // Default to false if not set or invalid
    }
  });

  // Time zone state
  const [selectedTimeZone, setSelectedTimeZoneState] = useState<string>(() => {
    const savedTz = localStorage.getItem(SELECTED_TIME_ZONE_KEY);
    if (savedTz) return savedTz;
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch (e) {
      return "UTC"; // Fallback if Intl API fails or not available
    }
  });

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

  // Query history state
  const [queryHistory, setQueryHistory] = useState<QueryHistoryEntry[]>(() => {
    try {
      const savedHistory = localStorage.getItem(QUERY_HISTORY_KEY);
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
      setConnectionState("connecting");
      setConnectionError(null);
      setDatabases([]);
      setSelectedDbState("");
      setSchema({});
      setAvailableTables([]);
      setSelectedTableState(null);
      setTimeFields([]);
      setSelectedTimeField(null);
      setResults(null);
      setRawJson(null);
      setError(null);

      try {
        // Try with NDJSON format if that's what's configured
        let currentFormat = format;
        let response;

        try {
          // Make the request with the current format setting
          response = await axios.post(
            `${urlToConnect}${
              urlToConnect.includes("?") ? "&" : "?"
            }format=${currentFormat}`,
            { query: "SHOW DATABASES" },
            {
              timeout: 10000,
              responseType: currentFormat === "ndjson" ? "text" : "json",
            }
          );

          // Check the Content-Type header to determine actual format
          const contentType =
            response.headers["content-type"]?.toLowerCase() || "";
          const isNdjsonResponse = contentType.includes("x-ndjson");
          const isJsonResponse = contentType.includes("json");

          // If we requested NDJSON but got JSON, API doesn't support NDJSON
          if (
            currentFormat === "ndjson" &&
            !isNdjsonResponse &&
            isJsonResponse
          ) {
            console.log(
              "API returned Content-Type: " +
                contentType +
                " when NDJSON was requested"
            );
            setFormatCompatibility({
              supportsNdjson: false,
              detected: true,
            });
            setFormat("json");
            currentFormat = "json";
            toast.warning("Format switched to JSON", {
              description: "NDJSON format not supported by this API",
            });
          }
          // If we get NDJSON response, confirm support
          else if (isNdjsonResponse) {
            setFormatCompatibility({
              supportsNdjson: true,
              detected: true,
            });
          }
        } catch (e) {
          console.error("Error with initial API request:", e);
          // If first attempt fails and format is ndjson, try again with json
          if (currentFormat === "ndjson") {
            console.log("NDJSON request failed, trying with JSON format");
            currentFormat = "json";
            response = await axios.post(
              `${urlToConnect}${
                urlToConnect.includes("?") ? "&" : "?"
              }format=${currentFormat}`,
              { query: "SHOW DATABASES" },
              { timeout: 10000, responseType: "json" }
            );

            // If JSON request succeeds, update format compatibility
            setFormatCompatibility({
              supportsNdjson: false,
              detected: true,
            });
            // Switch format to JSON
            setFormat("json");
            toast.warning("Format switched to JSON", {
              description: "NDJSON format not supported by this API",
            });
          } else {
            // If not a format issue, rethrow
            throw e;
          }
        }

        // Process the response to get database list
        let dbList: Database[] = [];

        // Process based on the determined format
        if (currentFormat === "ndjson") {
          // Process as NDJSON
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
        } else if (response.data && typeof response.data === "object") {
          // JSON format handling
          if (response.data.results && Array.isArray(response.data.results)) {
            dbList = response.data.results as Database[];
          } else if (Array.isArray(response.data)) {
            dbList = response.data as Database[];
          }
        }

        // Process the database list and complete connection
        if (dbList.length > 0) {
          setDatabases(dbList);
          setConnectionState("connected");
          setConnectionError(null);
          toast.success(`Connected to API with ${dbList.length} databases.`);
          const savedDbFromStorage = localStorage.getItem("selectedDb");
          let dbToMakeActive = dbList[0].database_name; // Default to first
          if (
            savedDbFromStorage &&
            dbList.some((db) => db.database_name === savedDbFromStorage)
          ) {
            dbToMakeActive = savedDbFromStorage;
          }
          setSelectedDbState(dbToMakeActive);

          // Save connection info to local storage
          const connection = {
            apiUrl: urlToConnect,
            selectedDb: dbToMakeActive,
            lastConnected: new Date().toISOString(),
          };
          localStorage.setItem(CONNECTION_KEY, JSON.stringify(connection));
        } else {
          // Change this part to indicate "empty" state instead of error
          setConnectionState("empty");
          setConnectionError(null);
          setDatabases([]);
          // Still save connection info
          const connection = {
            apiUrl: urlToConnect,
            selectedDb: "",
            lastConnected: new Date().toISOString(),
          };
          localStorage.setItem(CONNECTION_KEY, JSON.stringify(connection));
        }
      } catch (err: any) {
        console.error("Failed to connect to API:", err);
        const errorMsg =
          err.response?.data?.error ||
          err.message ||
          "Unknown connection error";
        setConnectionState("error");
        setConnectionError(`Connection failed: ${errorMsg}`);
        toast.error(`API connection failed: ${errorMsg}`);
      }
    },
    [apiUrl, format, setFormat]
  );

  const loadDatabases = useCallback(async () => {
    await connectToApi(apiUrl);
  }, [apiUrl, connectToApi]);

  const resetAppState = useCallback(() => {
    setDatabases([]);
    setSelectedDbState(""); // Use internal setter
    setSelectedTableState(null); // Use internal setter
    setSchema({});
    setAvailableTables([]);
    setTimeFields([]);
    setSelectedTimeField(null);
    setResults(null);
    setRawJson(null);
    setError(null);
    setStartTime(null);
    setExecutionTime(null);
    setResponseSize(null);
    HashQueryUtils.clearUrlParameters();
  }, []); // Relies on stable setters from useState

  // Effect to save apiUrl to localStorage
  useEffect(() => {
    localStorage.setItem("apiUrl", apiUrl);
  }, [apiUrl]);

  // Effect to save queryFormat to localStorage
  useEffect(() => {
    localStorage.setItem("queryFormat", format);
  }, [format]);

  // Main effect to handle API URL or format changes: reset state and attempt connection
  useEffect(() => {
    resetAppState(); // Clear previous state before attempting a new connection
    loadDatabases().catch(console.error); // Initiate connection
  }, [apiUrl, format, loadDatabases, resetAppState]); // Dependencies are key triggers

  // Load schema for a specific database
  const loadSchemaForDb = useCallback(
    async (dbName: string) => {
      if (!dbName) return;

      if (schema[dbName] && schema[dbName].length > 0) {
        const tables = schema[dbName].map((table) => table.tableName);
        setAvailableTables(tables);
        return;
      }

      setIsLoadingSchema(true);
      try {
        const tablesResponse = await axios.post(
          `${apiUrl}?db=${encodeURIComponent(dbName)}&format=${format}`,
          { query: "SHOW TABLES" },
          { responseType: format === "ndjson" ? "text" : "json", timeout: 8000 }
        );

        const dbSchema: TableSchema[] = [];
        let tableNames: string[] = [];

        if (format === "ndjson") {
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
        } else if (
          tablesResponse.data &&
          Array.isArray(tablesResponse.data.results)
        ) {
          tablesResponse.data.results.forEach((table: any) => {
            const tableName = table.table_name || Object.values(table)[0];
            if (tableName) tableNames.push(tableName as string);
          });
        }
        setAvailableTables(tableNames);

        if (tableNames.length > 0) {
          // Helper function to parse column data and infer timeUnit
          const parseAndInferColumns = (
            responseData: any,
            formatType: string
          ): ColumnSchema[] => {
            const columns: ColumnSchema[] = [];
            let rawCols: any[] = [];

            if (formatType === "ndjson") {
              rawCols = responseData
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
            } else if (responseData && Array.isArray(responseData.results)) {
              rawCols = responseData.results;
            }

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
                // If timeUnit is still undefined here, it means it's a numeric field,
                // potentially a time field, but its unit isn't clear from name alone.
                // This will be handled in executeQuery.
              }
              columns.push({ columnName, dataType, timeUnit });
            });
            return columns;
          };

          const tablePromises = tableNames.map(async (tableName) => {
            try {
              const columnsResponse = await axios.post(
                `${apiUrl}?db=${encodeURIComponent(dbName)}&format=${format}`,
                { query: `DESCRIBE SELECT * FROM ${tableName} LIMIT 1` },
                {
                  timeout: 5000,
                  responseType: format === "ndjson" ? "text" : "json",
                }
              );
              const columns = parseAndInferColumns(
                columnsResponse.data,
                format
              );
              return { tableName, columns };
            } catch (err) {
              console.warn(
                `Failed to DESCRIBE SELECT for ${tableName}, trying DESCRIBE`,
                err
              );
              try {
                const columnsResponse = await axios.post(
                  `${apiUrl}?db=${encodeURIComponent(dbName)}&format=${format}`,
                  { query: `DESCRIBE ${tableName}` },
                  {
                    timeout: 5000,
                    responseType: format === "ndjson" ? "text" : "json",
                  }
                );
                const columns = parseAndInferColumns(
                  columnsResponse.data,
                  format
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
          setSchema((prev) => ({ ...prev, [dbName]: dbSchema }));
        } else {
          setSchema((prev) => ({ ...prev, [dbName]: [] }));
          setAvailableTables([]);
        }
      } catch (err: any) {
        console.error(`Failed to load schema for ${dbName}:`, err);
        toast.error(`Schema load failed: ${err.message}`);
        setSchema((prev) => ({ ...prev, [dbName]: [] }));
        setAvailableTables([]);
      } finally {
        setIsLoadingSchema(false);
      }
    },
    [apiUrl, schema, format] // `schema` is a dependency because of the check `if (schema[dbName]...)`
  );

  useEffect(() => {
    if (databases.length > 0 && connectionState === "connected") {
      // Ensure connection is stable and DBs are loaded
      const savedQuery = localStorage.getItem("lastQuery");
      const savedQueryBuilder = localStorage.getItem(QUERY_BUILDER_KEY);

      // Don't automatically select a table, only if explicitly coming from history or URL
      // if (savedTable && availableTables.includes(savedTable)) {
      //  setSelectedTableState(savedTable); // Use internal setter
      // }

      if (savedQuery) setQuery(savedQuery);
      if (savedQueryBuilder) {
        try {
          setQueryBuilderEnabled(JSON.parse(savedQueryBuilder));
        } catch (e) {
          console.error("Failed to parse saved query builder state", e);
        }
      }
    }
  }, [databases, availableTables, connectionState]); // Rerun when DBs or tables become available, or connection established

  useEffect(() => {
    if (selectedTable) {
      localStorage.setItem(SELECTED_TABLE_KEY, selectedTable);

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
          setTimeFields(fields);
          setDetectableTimeFields(fields.length > 0);
        } else {
          setTimeFields([]);
          setDetectableTimeFields(false);
          setSelectedTimeField(null);
        }
      }
    } else {
      localStorage.removeItem(SELECTED_TABLE_KEY);
      setTimeFields([]);
      setSelectedTimeField(null);
    }
  }, [selectedTable, selectedDb, schema]);

  const saveTimeRange = useCallback((range: TimeRange) => {
    try {
      localStorage.setItem(TIME_RANGE_KEY, JSON.stringify(range));
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

  const saveQueryHistory = useCallback((history: QueryHistoryEntry[]) => {
    try {
      localStorage.setItem(
        QUERY_HISTORY_KEY,
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
        id: crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now() + Math.random()),
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

  const clearQueryHistory = useCallback(() => {
    setQueryHistory([]);
    localStorage.removeItem(QUERY_HISTORY_KEY);
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

  const executeQuery = useCallback(async () => {
    if (!selectedDb) {
      toast.error("Please select a database first");
      return;
    }

    if (query.trim()) {
      const params = {
        query,
        db: selectedDb,
        table: selectedTable || undefined,
        timeField: selectedTimeField || undefined,
        timeFrom: timeRange?.from,
        timeTo: timeRange?.to,
      };
      HashQueryUtils.updateBrowserUrlWithParams(params);
    }

    setIsLoading(true);
    setError(null);
    setQueryErrorDetail(null);
    setStartTime(Date.now());

    try {
      // Store the original, parameterized query
      const originalQuery = query.trim();
      let queryToExecute = originalQuery;

      if (
        queryBuilderEnabled &&
        selectedTimeField &&
        timeRange &&
        timeRange.enabled !== false
      ) {
        const columnSchema = getColumnsForTable(
          selectedTable || extractTableName(queryToExecute) || ""
        )?.find((c) => c.columnName === selectedTimeField);
        const fieldDataType = columnSchema?.dataType?.toLowerCase();
        const timeUnit = columnSchema?.timeUnit;

        // Use the utility function from utils.ts
        const { fromDate, toDate } = resolveTimeRangeToDates(
          { from: timeRange.from, to: timeRange.to },
          selectedTimeZone,
          isAbsoluteDate
        );

        let finalFromStr: string = "NULL";
        let finalToStr: string = "NULL";
        let timeFilterCondition: string = "1=1";

        if (
          fieldDataType?.includes("date") ||
          fieldDataType?.includes("timestamp") ||
          fieldDataType?.includes("datetime")
        ) {
          const sqlFromDate = formatDateForSql(fromDate);
          const sqlToDate = formatDateForSql(toDate);
          // Ensure these are valid string results before using
          if (
            typeof sqlFromDate === "string" &&
            typeof sqlToDate === "string"
          ) {
            timeFilterCondition = `${selectedTimeField} >= ${sqlFromDate} AND ${selectedTimeField} <= ${sqlToDate}`;
            finalFromStr = sqlFromDate;
            finalToStr = sqlToDate;
          } else {
            console.warn(
              `formatDateForSql did not return expected strings for ${fromDate} or ${toDate}. Time filter may be incorrect.`
            );
            // Fallback to 1=1, NULLs are already set
          }
        } else if (
          fieldDataType?.includes("bigint") ||
          fieldDataType?.includes("long") ||
          fieldDataType?.includes("numeric") ||
          fieldDataType?.includes("int")
        ) {
          if (timeUnit) {
            // Use the utility function from utils.ts
            const epochFrom = convertDateToScaledEpoch(fromDate, timeUnit);
            const epochTo = convertDateToScaledEpoch(toDate, timeUnit);
            timeFilterCondition = `${selectedTimeField} >= ${epochFrom} AND ${selectedTimeField} <= ${epochTo}`;
            finalFromStr = String(epochFrom);
            finalToStr = String(epochTo);
          } else {
            console.warn(
              `Numeric time field '${selectedTimeField}' (dataType: ${fieldDataType}) has an unrecognized time unit. $__timeFilter will not apply actual filtering for this field. Consider using a field with a standard time unit suffix (e.g., _ns, _ms) or a conventional name like __timestamp, created_at.`
            );
          }
        } else {
          console.warn(
            `Time field '${selectedTimeField}' has dataType '${fieldDataType}' which is not explicitly handled for detailed time filtering. $__timeFilter will not apply actual filtering.`
          );
        }

        queryToExecute = queryToExecute.replace(
          /\$__timeFilter/g,
          timeFilterCondition
        );
        queryToExecute = queryToExecute.replace(/\$__timeFrom/g, finalFromStr);
        queryToExecute = queryToExecute.replace(/\$__timeTo/g, finalToStr);
        queryToExecute = queryToExecute.replace(
          /\$__timeField/g,
          selectedTimeField || "NULL"
        );
      }

      // Execute the query with proper format parameter
      let currentFormat = format;
      const response = await axios.post(
        `${apiUrl}?db=${encodeURIComponent(
          selectedDb
        )}&format=${currentFormat}`,
        { query: queryToExecute },
        { responseType: currentFormat === "ndjson" ? "text" : "json" }
      );

      // Check Content-Type header to determine actual response format
      const contentType = response.headers["content-type"]?.toLowerCase() || "";
      const isNdjsonResponse = contentType.includes("x-ndjson");
      const isJsonResponse = contentType.includes("json");

      // Format compatibility detection based on headers
      if (currentFormat === "ndjson" && !isNdjsonResponse && isJsonResponse) {
        console.log(
          `Detected content type: ${contentType} when NDJSON was requested`
        );
        setFormatCompatibility({
          supportsNdjson: false,
          detected: true,
        });
        setFormat("json");
        toast.warning("Format switched to JSON", {
          description: "Your API only supports JSON format, not NDJSON",
        });
      } else if (isNdjsonResponse && !formatCompatibility.supportsNdjson) {
        // Update if we previously thought it didn't support NDJSON
        setFormatCompatibility({
          supportsNdjson: true,
          detected: true,
        });
      }

      let parsedResults: QueryResult[] = [];

      // Process response based on the actual content type received
      if (isNdjsonResponse) {
        // Handle true NDJSON response
        const lines = response.data
          .split(/\r?\n/)
          .filter((line: string) => line.trim().length > 0);
        parsedResults = lines
          .map((line: string) => {
            try {
              return JSON.parse(line);
            } catch (e) {
              console.warn("Failed to parse NDJSON line:", line);
              return null;
            }
          })
          .filter(Boolean);

        setResults(parsedResults);
        setRawJson(response.data);
      } else {
        // Handle JSON response (either because API only supports JSON or we requested JSON)
        setRawJson(response.data);
        if (response.data && Array.isArray(response.data.results)) {
          parsedResults = response.data.results;
          setResults(parsedResults);
        } else if (Array.isArray(response.data)) {
          parsedResults = response.data;
          setResults(parsedResults);
        } else {
          setResults([]);
          parsedResults = [];
        }
      }

      // Calculate response metrics
      const responseSizeNum =
        typeof response.data === "string"
          ? response.data.length
          : JSON.stringify(response.data).length;
      setResponseSize(responseSizeNum);
      const executionTimeMs = Date.now() - (startTime || Date.now());
      setExecutionTime(executionTimeMs);

      // Add to query history - save the original query with variables, not the processed one
      addToQueryHistory({
        query: originalQuery,
        db: selectedDb,
        table: selectedTable,
        timeField: selectedTimeField,
        timeRange: timeRange.enabled !== false ? timeRange : null,
        success: true,
        executionTime: executionTimeMs,
        rowCount: parsedResults.length,
      });
      localStorage.setItem("lastQuery", originalQuery); // Save original query
    } catch (err: any) {
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

      // Fallback to the error message if no detailed message is available
      const errorMessage = errorTitle;
      setError(errorMessage);

      // Set the detailed error message separately
      setQueryErrorDetail(detailedMessage);

      setResults(null);
      setRawJson(err.response?.data || null);
      const executionTimeMs = Date.now() - (startTime || Date.now());
      setExecutionTime(executionTimeMs);
      // In the catch block, also use the original query
      addToQueryHistory({
        query: query.trim(),
        db: selectedDb,
        table: selectedTable,
        timeField: selectedTimeField,
        timeRange: timeRange.enabled !== false ? timeRange : null,
        success: false,
        error: detailedMessage || errorMessage,
        executionTime: executionTimeMs,
      });

      // Enhanced format error detection for improved reliability
      if (
        format === "ndjson" &&
        // Check error message for format-related keywords
        ((typeof err.message === "string" &&
          (err.message.toLowerCase().includes("json") ||
            err.message.toLowerCase().includes("parse") ||
            err.message.toLowerCase().includes("syntax"))) ||
          // Also check response error messages which might be more specific
          (err.response?.data?.error &&
            typeof err.response.data.error === "string" &&
            (err.response.data.error.toLowerCase().includes("format") ||
              err.response.data.error.toLowerCase().includes("invalid"))))
      ) {
        // This may be an API that doesn't support NDJSON
        setFormatCompatibility({
          supportsNdjson: false,
          detected: true,
        });

        // Switch format for future requests
        setFormat("json");
        toast.warning("Switched to JSON format", {
          description: "The API appears to only support JSON format",
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    query,
    selectedDb,
    apiUrl,
    startTime,
    timeRange,
    selectedTimeField,
    queryBuilderEnabled,
    format,
    addToQueryHistory,
    getColumnsForTable,
    selectedTable,
    formatCompatibility,
    selectedTimeZone, // Added selectedTimeZone as dependency
  ]);

  const clearQuery = useCallback(() => {
    setQuery("");
    setResults(null);
    setRawJson(null);
    setError(null);
    setQueryErrorDetail(null);
    setExecutionTime(null);
    setResponseSize(null);
    localStorage.removeItem("lastQuery");
  }, []);

  // ----------------------------------------
  // Time Range and Settings Management
  // ----------------------------------------

  const selectDatabase = useCallback(
    (dbName: string) => {
      if (databases.length === 0 && dbName) {
        // Allow setting if databases not yet loaded (e.g. from hash)
        setSelectedDbState(dbName); // Use internal setter
        return;
      }
      if (dbName && databases.some((db) => db.database_name === dbName)) {
        if (selectedDb !== dbName) setSelectedDbState(dbName); // Use internal setter
      } else if (dbName) {
        toast.warning(`Database "${dbName}" not available.`);
        if (selectedDb !== "") setSelectedDbState(""); // Use internal setter
      } else {
        if (selectedDb !== "") setSelectedDbState(""); // Use internal setter
      }
    },
    [databases, selectedDb]
  ); // selectedDb for comparison

  const selectTable = useCallback(
    (tableName: string | null) => {
      if (tableName === null) {
        if (selectedTable !== null) setSelectedTableState(null); // Use internal setter
        return;
      }
      if (availableTables.length === 0 && tableName) {
        // Allow setting if tables not yet loaded
        setSelectedTableState(tableName); // Use internal setter
        return;
      }
      if (tableName && availableTables.includes(tableName)) {
        if (selectedTable !== tableName) setSelectedTableState(tableName); // Use internal setter
      } else if (tableName) {
        toast.warning(`Table "${tableName}" not available.`);
        if (selectedTable !== null) setSelectedTableState(null); // Use internal setter
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

  // Effect to save selectedTimeZone to localStorage
  useEffect(() => {
    localStorage.setItem(SELECTED_TIME_ZONE_KEY, selectedTimeZone);
  }, [selectedTimeZone]);

  useEffect(() => {
    try {
      localStorage.setItem(
        QUERY_BUILDER_KEY,
        JSON.stringify(queryBuilderEnabled)
      );
    } catch (e) {
      console.error("Failed to save query builder state", e);
    }
  }, [queryBuilderEnabled]);

  useEffect(() => {
    if (selectedDb) {
      localStorage.setItem("selectedDb", selectedDb);
      setSelectedTableState(null); // Use internal setter
      setAvailableTables([]); // Will be repopulated by loadSchemaForDb
      setTimeFields([]);
      setSelectedTimeField(null);
      HashQueryUtils.clearUrlParameters();

      loadSchemaForDb(selectedDb).catch(console.error);
    }
  }, [selectedDb, loadSchemaForDb, apiUrl]);

  return (
    <QueryContext.Provider
      value={{
        selectedDb,
        setSelectedDb: selectDatabase,
        selectedTable,
        setSelectedTable: selectTable,
        availableTables,
        query,
        setQuery,
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
        setSelectedTimeField,
        detectableTimeFields,
        getColumnsForTable,
        queryBuilderEnabled,
        setQueryBuilderEnabled,
        queryHistory,
        addToQueryHistory,
        clearQueryHistory,
        getShareableUrlForQuery,
        format,
        setFormat,
        connectionState,
        connectionError,
        selectedTimeZone,
        setSelectedTimeZone: setSelectedTimeZoneState,
        selectedTimeFieldDetails,
        formatCompatibility,
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
