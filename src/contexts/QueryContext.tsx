import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import axios from "axios";
import { toast } from "sonner";
import type { TimeRange } from "../components/TimeRangeSelector";
import {
  identifyTimeFields,
  generateTimeFilter,
  adaptTimeFilterForDbType,
  addTimeFilterToQuery,
  hasTimeFilter,
} from "../lib/time-range-utils";

type Database = {
  database_name: string;
};

// Schema types
type ColumnSchema = {
  columnName: string;
  dataType: string;
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
}

const QueryContext = createContext<QueryContextType | undefined>(undefined);

// Export the context directly so it can be imported if needed
export { QueryContext };

// Connection key for persistence
const CONNECTION_KEY = "gigapi_connection";
const TIME_RANGE_KEY = "gigapi_time_range";

export function QueryProvider({ children }: { children: ReactNode }) {
  // State management for query execution
  const [selectedDb, setSelectedDb] = useState("");
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
  const [apiUrl, setApiUrl] = useState(() => {
    return (
      localStorage.getItem("apiUrl") || `http://${window.location.hostname}:${window.location.port}/query `
    );
  });

  // Time range state
  const [timeRange, setTimeRange] = useState<TimeRange>(() => {
    // Try to load from localStorage or use default (last 24 hours)
    try {
      const savedTimeRange = localStorage.getItem(TIME_RANGE_KEY);
      if (savedTimeRange) {
        return JSON.parse(savedTimeRange);
      }
    } catch (e) {
      console.error("Failed to parse saved time range", e);
    }
    return { from: "now-24h", to: "now", display: "Last 24 hours" };
  });

  const [timeFields, setTimeFields] = useState<string[]>([]);
  const [selectedTimeField, setSelectedTimeField] = useState<string | null>(
    null
  );
  const [detectableTimeFields, setDetectableTimeFields] =
    useState<boolean>(false);

  // Helper function to save connection state
  const saveConnectionState = (url: string, db: string) => {
    const connection = {
      apiUrl: url,
      selectedDb: db,
      lastConnected: new Date().toISOString(),
    };
    localStorage.setItem(CONNECTION_KEY, JSON.stringify(connection));
  };

  // Define loadDatabases function declaration first
  const loadDatabases = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Always use current apiUrl state value directly
      const response = await axios.post(
        apiUrl,
        {
          query: "SHOW DATABASES",
        },
        {
          // Add timeout to prevent long-running requests
          timeout: 10000,
        }
      );

      if (response.data.results && response.data.results.length > 0) {
        const dbList = response.data.results as Database[];
        setDatabases(dbList);

        // Load saved database from localStorage if it exists in the list
        const savedDb = localStorage.getItem("selectedDb");
        if (savedDb && dbList.some((db) => db.database_name === savedDb)) {
          setSelectedDb(savedDb);
        }

        toast.success(`Loaded ${dbList.length} databases`);
      } else {
        setDatabases([]); // Clear databases if results are empty
        setSelectedDb(""); // Reset selected DB
        toast.warning("No databases found");
      }
    } catch (err: any) {
      console.error("Failed to load databases:", err);
      const errorMsg =
        err.response?.data?.error ||
        err.message ||
        "Unknown error loading databases";
      setError(`Failed to load databases: ${errorMsg}`);
      setDatabases([]); // Clear databases on error
      setSelectedDb(""); // Reset selected DB on error
      toast.error(`Failed to load databases: ${errorMsg}`);
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl]);

  // Handle API URL changes and reset state
  useEffect(() => {
    localStorage.setItem("apiUrl", apiUrl);
    // Clear cached state to force refresh with new endpoint
    setDatabases([]);
    setSelectedDb("");
    setResults(null);
    setRawJson(null);
    setError(null);

    // Save connection state with empty DB (since we're changing endpoints)
    saveConnectionState(apiUrl, "");

    // Trigger a fresh database load with a slight delay to ensure state is reset
    const timer = setTimeout(() => {
      loadDatabases().catch(console.error);
    }, 100);

    return () => clearTimeout(timer);
  }, [apiUrl]);

  // Load schema for a specific database
  const loadSchemaForDb = useCallback(
    async (dbName: string) => {
      if (!dbName) return;

      // If we already have the schema for this DB, don't reload
      if (schema[dbName] && schema[dbName].length > 0) {
        return;
      }

      setIsLoadingSchema(true);
      try {
        // First get all tables
        const tablesResponse = await axios.post(
          `${apiUrl}?db=${encodeURIComponent(dbName)}`,
          { query: "SHOW TABLES" }
        );

        const dbSchema: TableSchema[] = [];

        // If we have tables, get details for each
        if (
          tablesResponse.data.results &&
          tablesResponse.data.results.length > 0
        ) {
          const tables = tablesResponse.data.results;

          for (const table of tables) {
            // Extract table name from the response
            const tableName = table.table_name || Object.values(table)[0];

            try {
              // Get columns for this table
              const columnsResponse = await axios.post(
                `${apiUrl}?db=${encodeURIComponent(dbName)}`,
                { query: `DESCRIBE SELECT * FROM ${tableName}` }
              );

              // Process column info
              const columns: ColumnSchema[] = [];
              if (
                columnsResponse.data.results &&
                columnsResponse.data.results.length > 0
              ) {
                // Map column info to our schema format
                columnsResponse.data.results.forEach((col: any) => {
                  columns.push({
                    columnName:
                      col.Field ||
                      col.column_name ||
                      col.name ||
                      Object.values(col)[0],
                    dataType:
                      col.Type ||
                      col.data_type ||
                      col.type ||
                      Object.values(col)[1] ||
                      "unknown",
                  });
                });
              }

              dbSchema.push({ tableName, columns });
            } catch (err) {
              // Fallback to simple DESCRIBE command if the previous one failed
              try {
                const columnsResponse = await axios.post(
                  `${apiUrl}?db=${encodeURIComponent(dbName)}`,
                  { query: `DESCRIBE ${tableName}` }
                );

                const columns: ColumnSchema[] = [];
                if (
                  columnsResponse.data.results &&
                  columnsResponse.data.results.length > 0
                ) {
                  columnsResponse.data.results.forEach((col: any) => {
                    columns.push({
                      columnName:
                        col.Field ||
                        col.column_name ||
                        col.name ||
                        Object.values(col)[0],
                      dataType:
                        col.Type ||
                        col.data_type ||
                        col.type ||
                        Object.values(col)[1] ||
                        "unknown",
                    });
                  });
                }

                dbSchema.push({ tableName, columns });
              } catch (innerErr) {
                // Add table without columns if both attempts fail
                dbSchema.push({ tableName, columns: [] });
              }
            }
          }
        }

        // Update schema state
        setSchema((prev) => ({ ...prev, [dbName]: dbSchema }));
      } catch (err: any) {
        console.error(`Failed to load schema for ${dbName}:`, err);
        toast.error(`Failed to load schema: ${err.message}`);
        // Set empty schema for this DB to avoid repeated loading attempts
        setSchema((prev) => ({ ...prev, [dbName]: [] }));
      } finally {
        setIsLoadingSchema(false);
      }
    },
    [apiUrl, schema]
  );

  // Effect to load initial state from localStorage
  useEffect(() => {
    // Load persistent state from localStorage on initial mount
    const savedQuery = localStorage.getItem("lastQuery");

    // Load saved connection data
    const savedConnection = localStorage.getItem(CONNECTION_KEY);
    if (savedConnection) {
      try {
        const connection = JSON.parse(savedConnection);
        if (connection.apiUrl) setApiUrl(connection.apiUrl);
        // selectedDb will be set from the databases load
      } catch (e) {
        console.error("Failed to parse saved connection", e);
      }
    }

    if (savedQuery) {
      setQuery(savedQuery);
    }
  }, []);

  // Effect to load schema when selectedDb changes
  useEffect(() => {
    if (selectedDb) {
      // Save selected database to localStorage
      localStorage.setItem("selectedDb", selectedDb);
      loadSchemaForDb(selectedDb).catch(console.error);

      // Clear results when DB changes
      setResults(null);
      setRawJson(null);
      setError(null);

      // Update connection persistence
      saveConnectionState(apiUrl, selectedDb);
    }
  }, [selectedDb, loadSchemaForDb, apiUrl]);

  // Save time range to localStorage
  const saveTimeRange = useCallback((range: TimeRange) => {
    try {
      localStorage.setItem(TIME_RANGE_KEY, JSON.stringify(range));
    } catch (e) {
      console.error("Failed to save time range", e);
    }
  }, []);

  // Update time range with validation
  const updateTimeRange = useCallback(
    (range: TimeRange) => {
      setTimeRange(range);
      saveTimeRange(range);
    },
    [saveTimeRange]
  );

  // Extract time fields from schema when selectedDb changes
  useEffect(() => {
    if (selectedDb && schema && schema[selectedDb]) {
      const fields = identifyTimeFields(schema);
      setTimeFields(fields);
      setDetectableTimeFields(fields.length > 0);

      // Try to auto-select a time field
      if (fields.length > 0 && !selectedTimeField) {
        // Prefer __timestamp, time, or date fields
        const preferredField = fields.find(
          (f) =>
            f === "__timestamp" ||
            f === "time" ||
            f === "date" ||
            f === "time_sec" ||
            f === "time_usec"
        );
        setSelectedTimeField(preferredField || fields[0]);
      }
    }
  }, [selectedDb, schema, selectedTimeField]);

  // Enhanced query execution with time range support
  const executeQuery = useCallback(async () => {
    if (!selectedDb) {
      toast.error("Please select a database first");
      return;
    }

    setIsLoading(true);
    setError(null);
    setStartTime(Date.now());

    try {
      let queryToExecute = query.trim();
      
      // Only add time filter if:
      // 1. A time field is selected
      // 2. Time filtering is enabled in the timeRange
      // 3. The query doesn't already have a time filter
      if (
        selectedTimeField && 
        timeRange && 
        timeRange.enabled !== false &&
        !hasTimeFilter(queryToExecute)
      ) {
        console.log("Applying time filter for field:", selectedTimeField);
        const timeFilter = generateTimeFilter(timeRange, selectedTimeField);
        const adaptedFilter = adaptTimeFilterForDbType(timeFilter, "sql");
        
        // Add filter to the query
        queryToExecute = addTimeFilterToQuery(queryToExecute, adaptedFilter, timeRange, selectedTimeField);
        console.log("Query with time filter:", queryToExecute);
      } else {
        console.log("Not applying time filter, using raw query");
      }

      const response = await axios.post(
        `${apiUrl}?db=${encodeURIComponent(selectedDb)}`,
        { query: queryToExecute }
      );

      const responseSize = JSON.stringify(response.data).length;
      setResponseSize(responseSize);

      if (response.data && response.data.results) {
        setRawJson(response.data);
        setResults(response.data.results);
      } else {
        setRawJson(response.data);
        setResults([]);
      }
    } catch (err: any) {
      console.error("Query execution error:", err);
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          "Error executing query"
      );
      setResults(null);
      setRawJson(null);
    } finally {
      setIsLoading(false);
      setExecutionTime(Date.now() - (startTime || Date.now()));
    }
  }, [query, selectedDb, apiUrl, startTime, timeRange, selectedTimeField]);

  // Clear query
  const clearQuery = useCallback(() => {
    setQuery("");
    setResults(null);
    setRawJson(null);
    setError(null);
    setExecutionTime(null);
    setResponseSize(null);

    // Clear localStorage query parameter
    localStorage.removeItem("lastQuery");
  }, []);

  return (
    <QueryContext.Provider
      value={{
        selectedDb,
        setSelectedDb,
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
        setApiUrl,
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
