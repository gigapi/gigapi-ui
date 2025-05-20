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
  connectionState: "connected" | "connecting" | "error" | "idle";
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

// Connection key for persistence
const CONNECTION_KEY = "gigapi_connection";
const TIME_RANGE_KEY = "gigapi_time_range";
const SELECTED_TABLE_KEY = "gigapi_selected_table";
const QUERY_BUILDER_KEY = "gigapi_query_builder";
const QUERY_HISTORY_KEY = "gigapi_query_history";
const SELECTED_TIME_ZONE_KEY = "gigapi_selected_time_zone"; // Key for time zone

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
    "connected" | "connecting" | "error" | "idle"
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
  const [queryBuilderEnabled, setQueryBuilderEnabled] = useState(true);

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

  // Retry tracking refs (currently not used in core connection/schema logic, but kept if needed elsewhere)
  const retryCountRef = useRef(0);
  const schemaRetryCountRef = useRef(0);
  // const MAX_RETRIES = 2; // Not used

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
        let formatDetected = false;

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

          // Now let's analyze the response format
          if (currentFormat === "ndjson") {
            // If we requested NDJSON, but response is not text or empty, it might be a problem
            if (typeof response.data !== "string" || !response.data.trim()) {
              console.warn("Unexpected response type for NDJSON request:", typeof response.data);
            } else {
              // Check if it looks like a single JSON object rather than NDJSON lines
              const trimmedData = response.data.trim();
              const firstChar = trimmedData[0];
              const lastChar = trimmedData[trimmedData.length - 1];
              
              // If it looks like a complete JSON object/array
              if ((firstChar === "{" && lastChar === "}") || (firstChar === "[" && lastChar === "]")) {
                try {
                  // Try to parse the entire response as a single JSON object
                  const parsedJson = JSON.parse(trimmedData);
                  
                  // If we requested NDJSON but got a JSON object with a results array,
                  // then the API doesn't support NDJSON
                  if (parsedJson && typeof parsedJson === "object" && parsedJson.results && Array.isArray(parsedJson.results)) {
                    console.log("API returned JSON with 'results' array when NDJSON was requested - switching to JSON format");
                    setFormatCompatibility({
                      supportsNdjson: false,
                      detected: true,
                    });
                    setFormat("json");
                    currentFormat = "json";
                    formatDetected = true;
                    // Use the results array as our database list
                    response.data = parsedJson;
                  }
                } catch (e) {
                  // If we can't parse it as a single JSON, it might still be valid NDJSON
                  console.log("Response doesn't parse as a single JSON object, continuing with NDJSON processing");
                }
              }
            }
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
            formatDetected = true;
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
        if (currentFormat === "ndjson" && !formatDetected) {
          // Only try to parse as NDJSON if we didn't already detect it as JSON
          try {
            // Traditional NDJSON parsing
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
            
            // Successfully parsed NDJSON
            if (dbList.length > 0) {
              setFormatCompatibility({
                supportsNdjson: true,
                detected: true,
              });
            } else {
              // No valid NDJSON lines found, API might not support NDJSON
              console.warn("No valid NDJSON lines found in response");
              
              // Try to parse the whole response as JSON as a fallback
              try {
                const jsonData = JSON.parse(response.data);
                if (jsonData && jsonData.results && Array.isArray(jsonData.results)) {
                  dbList = jsonData.results;
                  setFormatCompatibility({
                    supportsNdjson: false,
                    detected: true,
                  });
                  setFormat("json");
                  toast.warning("Format switched to JSON", {
                    description: "API returned JSON instead of NDJSON format",
                  });
                }
              } catch (e) {
                console.error("Failed to parse response as JSON fallback:", e);
              }
            }
          } catch (e) {
            console.error("Error processing NDJSON response:", e);
            throw new Error("Failed to process API response");
          }
        } else if (response.data && typeof response.data === "object") {
          // JSON format handling (either detected or requested)
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
          setConnectionState("error");
          setConnectionError(
            "No databases found. Check API endpoint and format."
          );
          toast.warning("No databases found. Check API endpoint and format.");
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
    retryCountRef.current = 0;
    schemaRetryCountRef.current = 0;
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
                else if (lowerColName === "__timestamp")
                  timeUnit =
                    "ns"; // Strong convention for high-res main timestamp
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
      const savedTable = localStorage.getItem(SELECTED_TABLE_KEY);
      const savedQueryBuilder = localStorage.getItem(QUERY_BUILDER_KEY);

      if (savedTable && availableTables.includes(savedTable)) {
        setSelectedTableState(savedTable); // Use internal setter
      }
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

  useEffect(() => {
    if (selectedTable) {
      localStorage.setItem(SELECTED_TABLE_KEY, selectedTable);
      setSelectedTimeField(null); // Reset time field when table changes

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
          if (fields.length > 0) {
            const preferredField = fields.find((f) =>
              [
                "__timestamp",
                "time",
                "date",
                "timestamp",
                "created_at",
                "create_date",
              ].includes(f)
            );
            setSelectedTimeField(preferredField || fields[0]);
          }
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

  useEffect(() => {
    if (query && !selectedTable && availableTables.length > 0) {
      // Check availableTables to prevent premature selection
      const detected = extractTableName(query);
      if (detected && availableTables.includes(detected)) {
        setSelectedTableState(detected); // Use internal setter
      }
    }
  }, [query, availableTables, selectedTable]); // Add selectedTable to prevent re-running if already set

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

  // Helper functions for JS-based time calculations (can be moved to a utility file later)

  /**
   * Parses a relative date string (e.g., "now-5m", "now-24h") based on a given baseDate.
   * Note: This is a simplified parser. For robust production use, a library like date-fns is recommended.
   * Timezone of baseDate is preserved.
   */
  const parseRelativeDate = (relativeString: string, baseDate: Date): Date => {
    const match = relativeString.match(/^now-(\d+)([mhdwMy])$/);
    if (!match) return baseDate; // Should not happen if called after isAbsoluteDate

    const amount = parseInt(match[1], 10);
    const unit = match[2];
    const date = new Date(baseDate.getTime()); // Clone baseDate

    switch (unit) {
      case "m":
        date.setMinutes(date.getMinutes() - amount);
        break;
      case "h":
        date.setHours(date.getHours() - amount);
        break;
      case "d":
        date.setDate(date.getDate() - amount);
        break;
      case "w":
        date.setDate(date.getDate() - amount * 7);
        break;
      case "M":
        date.setMonth(date.getMonth() - amount);
        break;
      case "y":
        date.setFullYear(date.getFullYear() - amount);
        break;
      default:
        break; // Should not happen
    }
    return date;
  };

  /**
   * Resolves a TimeRange object to absolute Date objects.
   * For "now" or relative strings, it uses the current time.
   * For absolute date strings, it parses them.
   * Timezone handling is basic: uses system/browser local time for Date operations.
   */
  const resolveTimeRangeToDates = (
    timeRange: TimeRange
  ): { fromDate: Date; toDate: Date } => {
    const now = new Date();
    let fromDate: Date;
    let toDate: Date;

    if (isAbsoluteDate(timeRange.from)) {
      fromDate = new Date(timeRange.from);
    } else if (timeRange.from.toLowerCase() === "now") {
      fromDate = now;
    } else {
      // Relative e.g. "now-5m"
      fromDate = parseRelativeDate(timeRange.from, now);
    }

    if (isAbsoluteDate(timeRange.to)) {
      toDate = new Date(timeRange.to);
    } else if (timeRange.to.toLowerCase() === "now") {
      toDate = now;
    } else {
      // Relative e.g. "now-5m" (though less common for 'to')
      toDate = parseRelativeDate(timeRange.to, now);
    }
    // Basic validation to ensure fromDate is not after toDate
    if (fromDate.getTime() > toDate.getTime()) {
      console.warn(
        "Time range warning: 'from' date is after 'to' date. Swapping them."
      );
      return { fromDate: toDate, toDate: fromDate };
    }

    return { fromDate, toDate };
  };

  /**
   * Converts a JavaScript Date object to a numeric epoch value, scaled to the target unit.
   * JS Date.getTime() is epoch milliseconds.
   */
  const convertDateToScaledEpoch = (
    date: Date,
    unit: "s" | "ms" | "us" | "ns" | undefined
  ): number => {
    const millis = date.getTime();
    switch (unit) {
      case "s":
        return Math.floor(millis / 1000);
      case "ms":
        return millis;
      case "us":
        return millis * 1000;
      case "ns":
        return millis * 1000000;
      default:
        // This case should ideally be handled before calling, by checking if unit is defined.
        // If called with undefined unit, defaulting to milliseconds for safety, but warning.
        console.warn(
          `convertDateToScaledEpoch called with undefined unit. Defaulting to milliseconds.`
        );
        return millis;
    }
  };

  // End of new helper functions

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
    setStartTime(Date.now());

    try {
      let queryToExecute = query.trim();
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

        const { fromDate, toDate } = resolveTimeRangeToDates(timeRange);

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
        `${apiUrl}?db=${encodeURIComponent(selectedDb)}&format=${currentFormat}`,
        { query: queryToExecute },
        { responseType: currentFormat === "ndjson" ? "text" : "json" }
      );

      let parsedResults: QueryResult[] = [];
      let formatIssueDetected = false;

      // Process response based on current format setting
      if (currentFormat === "ndjson") {
        // Handle NDJSON format (or what should be NDJSON)
        if (typeof response.data !== "string") {
          console.warn("Expected string response for NDJSON format but got:", typeof response.data);
          formatIssueDetected = true;
        } else {
          const responseStr = response.data.trim();
          
          // Quick check: If it starts with { and ends with }, it might be a single JSON object
          // rather than proper NDJSON which should be multiple JSON objects on separate lines
          if ((responseStr.startsWith('{') && responseStr.endsWith('}')) || 
              (responseStr.startsWith('[') && responseStr.endsWith(']'))) {
            
            try {
              // Try to parse as a single JSON object
              const jsonObject = JSON.parse(responseStr);
              
              // Check if it has a results array - clear indicator of JSON format instead of NDJSON
              if (jsonObject && typeof jsonObject === 'object' && jsonObject.results) {
                console.log("Detected JSON with results array when NDJSON was requested");
                
                // Update format compatibility and switch format
                setFormatCompatibility({
                  supportsNdjson: false,
                  detected: true
                });
                
                // Switch to JSON format for future requests
                setFormat("json");
                toast.warning("Format switched to JSON", {
                  description: "Your API only supports JSON format, not NDJSON"
                });
                
                // Handle results from the JSON format
                if (Array.isArray(jsonObject.results)) {
                  parsedResults = jsonObject.results;
                  setResults(parsedResults);
                  setRawJson(jsonObject);
                  formatIssueDetected = true;
                }
              }
            } catch (e) {
              // Not a complete JSON object, continue with NDJSON parsing
              console.log("Response doesn't parse as a single JSON object", e);
            }
          }
          
          // If we haven't detected a format issue yet, try regular NDJSON parsing
          if (!formatIssueDetected) {
            const lines = responseStr.split(/\r?\n/).filter(line => line.trim().length > 0);
            
            // Parse each line as a separate JSON object
            const parsed = lines.map(line => {
              try {
                return JSON.parse(line);
              } catch (e) {
                console.warn("Failed to parse NDJSON line:", line);
                return null;
              }
            }).filter(Boolean);
            
            if (parsed.length > 0) {
              // Successfully parsed as NDJSON
              parsedResults = parsed;
              setResults(parsedResults);
              setRawJson(response.data);
              
              // If we previously thought NDJSON wasn't supported, update our state
              if (!formatCompatibility.supportsNdjson && formatCompatibility.detected) {
                setFormatCompatibility({
                  supportsNdjson: true,
                  detected: true
                });
              }
            } else {
              // No valid JSON objects found in lines - this is suspicious for NDJSON
              throw new Error("No valid JSON objects found in NDJSON response");
            }
          }
        }
      } else {
        // Standard JSON handling
        setRawJson(response.data);
        setResults(
          response.data && Array.isArray(response.data.results)
            ? response.data.results
            : []
        );
        parsedResults =
          response.data && Array.isArray(response.data.results)
            ? response.data.results
            : [];
      }

      // Calculate response metrics
      const responseSizeNum =
        typeof response.data === "string"
          ? response.data.length
          : JSON.stringify(response.data).length;
      setResponseSize(responseSizeNum);
      const executionTimeMs = Date.now() - (startTime || Date.now());
      setExecutionTime(executionTimeMs);

      // Add to query history
      addToQueryHistory({
        query: queryToExecute,
        db: selectedDb,
        table: selectedTable,
        timeField: selectedTimeField,
        timeRange: timeRange.enabled !== false ? timeRange : null,
        success: true,
        executionTime: executionTimeMs,
        rowCount: parsedResults.length,
      });
      localStorage.setItem("lastQuery", query); // Save original query
    } catch (err: any) {
      console.error("Query execution error:", err);
      const errorMessage =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "Error executing query";
      setError(errorMessage);
      setResults(null);
      setRawJson(null);
      const executionTimeMs = Date.now() - (startTime || Date.now());
      setExecutionTime(executionTimeMs);
      addToQueryHistory({
        query,
        db: selectedDb,
        table: selectedTable,
        timeField: selectedTimeField,
        timeRange: timeRange.enabled !== false ? timeRange : null,
        success: false,
        error: errorMessage,
        executionTime: executionTimeMs,
      });

      // Enhanced format error detection for improved reliability
      if (
        format === "ndjson" &&
        (
          // Check error message for format-related keywords
          (typeof err.message === "string" && 
            (err.message.toLowerCase().includes("json") ||
            err.message.toLowerCase().includes("parse") ||
            err.message.toLowerCase().includes("syntax"))) ||
          // Also check response error messages which might be more specific
          (err.response?.data?.error && 
            typeof err.response.data.error === "string" &&
            (err.response.data.error.toLowerCase().includes("format") ||
             err.response.data.error.toLowerCase().includes("invalid")))
        )
      ) {
        // This may be an API that doesn't support NDJSON
        setFormatCompatibility({
          supportsNdjson: false,
          detected: true,
        });
        
        // Switch format for future requests
        setFormat("json");
        toast.warning("Switched to JSON format", {
          description: "The API appears to only support JSON format"
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
  ]);

  const clearQuery = useCallback(() => {
    setQuery("");
    setResults(null);
    setRawJson(null);
    setError(null);
    setExecutionTime(null);
    setResponseSize(null);
    localStorage.removeItem("lastQuery");
  }, []);

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

  // Effect to handle URL hash changes on initial mount
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      try {
        const params = HashQueryUtils.getHashParams();
        if (params.query && params.db) {
          // Defer execution slightly to allow initial state to settle from localStorage
          setTimeout(() => {
            if (params.db !== selectedDb) {
              // This will trigger other effects (load schema, etc.)
              selectDatabase(params.db);
            }
            if (params.query !== query) {
              setQuery(params.query);
            }
            // Table/timefield selection should ideally wait for schema to be loaded for the new DB
            // TODO: This part might need refinement based on UX for hash loading.
            // For now, if they are present and valid for *current* schema, set them.
            if (
              params.table &&
              params.table !== selectedTable &&
              availableTables.includes(params.table)
            ) {
              selectTable(params.table);
            }
            if (
              params.timeField &&
              params.timeField !== selectedTimeField &&
              timeFields.includes(params.timeField)
            ) {
              setSelectedTimeField(params.timeField);
            }
            if (params.timeFrom && params.timeTo) {
              updateTimeRange({
                from: params.timeFrom,
                to: params.timeTo,
                display: `${params.timeFrom} to ${params.timeTo}`,
                enabled: true,
              });
            }
          }, 100);
        }
      } catch (err) {
        console.error("Failed to process hash parameters:", err);
      }
    };
    handleHashChange();
    // IMPORTANT: This effect runs ONLY ONCE on mount.
    // Adding dependencies would make it re-run on state changes, potentially causing loops. DON'T ADD DEPENDENCIES!!!
  }, []);

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
        selectedTimeZone, // Expose selectedTimeZone
        setSelectedTimeZone: setSelectedTimeZoneState, // Expose setter
        selectedTimeFieldDetails, // Expose the details
        formatCompatibility, // Expose format compatibility
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
