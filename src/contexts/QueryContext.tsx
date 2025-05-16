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
import { identifyTimeFields, extractTableName } from "../lib/time-range-utils";
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
  
  // Query history methods
  queryHistory: QueryHistoryEntry[];
  addToQueryHistory: (entry: Omit<QueryHistoryEntry, 'id' | 'timestamp'>) => void;
  clearQueryHistory: () => void;
  getShareableUrlForQuery: (query: string) => string;
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

export function QueryProvider({ children }: { children: ReactNode }) {
  // State management for query execution
  const [selectedDb, setSelectedDb] = useState("");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
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
  const [apiUrl, setApiUrl] = useState(() => {
    return (
      localStorage.getItem("apiUrl") ||
      `http://${window.location.hostname}:${window.location.port}/query`
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

  // Query builder state
  const [queryBuilderEnabled, setQueryBuilderEnabled] = useState(true);
  
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

  // Helper function to save connection state
  const saveConnectionState = (url: string, db: string) => {
    const connection = {
      apiUrl: url,
      selectedDb: db,
      lastConnected: new Date().toISOString(),
    };
    localStorage.setItem(CONNECTION_KEY, JSON.stringify(connection));
  };

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

  // Define loadDatabases function declaration first
  const loadDatabases = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.post(
        apiUrl,
        {
          query: "SHOW DATABASES",
        },
        {
          timeout: 10000,
        }
      );

      if (response.data && Array.isArray(response.data.results) && response.data.results.length > 0) {
        const dbList = response.data.results as Database[];
        setDatabases(dbList);
        setError(null);

        const savedDb = localStorage.getItem("selectedDb");
        if (savedDb && dbList.some((db) => db.database_name === savedDb)) {
          setSelectedDb(savedDb);
        }

        toast.success(`Loaded ${dbList.length} databases`);
      } else {
        setDatabases([]);
        setSelectedDb("");
        toast.warning("No databases found from server. Select an endpoint if this is unexpected.");
      }
    } catch (err: any) {
      console.error("Failed to load databases:", err);
      const errorMsg =
        err.response?.data?.error ||
        err.message ||
        "Unknown error loading databases";
      setError(`Failed to load databases: ${errorMsg}`);
      setDatabases([]);
      setSelectedDb("");
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
    setSelectedTable(null);
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
        // Just update available tables
        const tables = schema[dbName].map((table) => table.tableName);
        setAvailableTables(tables);
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
        const tableNames: string[] = [];

        // If we have tables, get details for each
        if (
          tablesResponse.data.results &&
          tablesResponse.data.results.length > 0
        ) {
          const tables = tablesResponse.data.results;

          // Extract table names first and update state immediately
          tables.forEach((table: any) => {
            const tableName = table.table_name || Object.values(table)[0];
            if (tableName) tableNames.push(tableName);
          });

          // Update available tables immediately so UI is responsive
          setAvailableTables(tableNames);

          // Load table columns in parallel using Promise.all
          const tablePromises = tableNames.map(async (tableName) => {
            try {
              // First try DESCRIBE SELECT
              const columnsResponse = await axios.post(
                `${apiUrl}?db=${encodeURIComponent(dbName)}`,
                { query: `DESCRIBE SELECT * FROM ${tableName} LIMIT 1` },
                { timeout: 5000 } // Add timeout to avoid long waits
              );

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

              return { tableName, columns };
            } catch (err) {
              // Fallback to simple DESCRIBE command
              try {
                const columnsResponse = await axios.post(
                  `${apiUrl}?db=${encodeURIComponent(dbName)}`,
                  { query: `DESCRIBE ${tableName}` },
                  { timeout: 5000 }
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

                return { tableName, columns };
              } catch (innerErr) {
                // Add table without columns if both attempts fail
                console.warn(
                  `Failed to fetch columns for ${tableName}`,
                  innerErr
                );
                return { tableName, columns: [] };
              }
            }
          });

          // Wait for all table column queries to finish
          const tableResults = await Promise.allSettled(tablePromises);

          // Process results
          tableResults.forEach((result) => {
            if (result.status === "fulfilled") {
              dbSchema.push(result.value);
            } else {
              console.error("Failed to load table schema:", result.reason);
            }
          });
        }

        // Update schema state
        setSchema((prev) => ({ ...prev, [dbName]: dbSchema }));
      } catch (err: any) {
        console.error(`Failed to load schema for ${dbName}:`, err);
        toast.error(`Failed to load schema: ${err.message}`);
        // Set empty schema for this DB to avoid repeated loading attempts
        setSchema((prev) => ({ ...prev, [dbName]: [] }));
        setAvailableTables([]);
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
    const savedTable = localStorage.getItem(SELECTED_TABLE_KEY);
    const savedQueryBuilder = localStorage.getItem(QUERY_BUILDER_KEY);

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

    if (savedTable) {
      setSelectedTable(savedTable);
    }

    // Load saved query builder state
    if (savedQueryBuilder) {
      try {
        setQueryBuilderEnabled(JSON.parse(savedQueryBuilder));
      } catch (e) {
        console.error("Failed to parse saved query builder state", e);
      }
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

      // Reset selected table when database changes
      setSelectedTable(null);

      // Update connection persistence
      saveConnectionState(apiUrl, selectedDb);
    }
  }, [selectedDb, loadSchemaForDb, apiUrl]);

  // Save table selection to localStorage
  useEffect(() => {
    if (selectedTable) {
      localStorage.setItem(SELECTED_TABLE_KEY, selectedTable);
    } else {
      localStorage.removeItem(SELECTED_TABLE_KEY);
    }
  }, [selectedTable]);

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

  // Update time fields when selected table changes
  useEffect(() => {
    if (selectedTable && selectedDb && schema && schema[selectedDb]) {
      const tableSchema = schema[selectedDb].find(
        (table) => table.tableName === selectedTable
      );

      if (tableSchema && tableSchema.columns) {
        // Filter time fields for this specific table
        const fields: string[] = [];

        tableSchema.columns.forEach((column) => {
          const colName = column.columnName?.toLowerCase() || "";
          const dataType = column.dataType?.toLowerCase() || "";

          // Check if it's a time field
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

        // Auto-select first time field if available
        if (fields.length > 0 && !selectedTimeField) {
          // Prefer common time fields
          const preferredField = fields.find(
            (f) =>
              f === "__timestamp" ||
              f === "time" ||
              f === "date" ||
              f === "timestamp" ||
              f === "created_at"
          );
          setSelectedTimeField(preferredField || fields[0]);
        } else if (fields.length === 0) {
          // No time fields in this table
          setSelectedTimeField(null);
        }
      } else {
        setTimeFields([]);
        setDetectableTimeFields(false);
        setSelectedTimeField(null);
      }
    } else {
      // Use the global time fields function when no table is selected
      if (selectedDb && schema && schema[selectedDb]) {
        const fields = identifyTimeFields(schema);
        setTimeFields(fields);
        setDetectableTimeFields(fields.length > 0);
      } else {
        setTimeFields([]);
        setDetectableTimeFields(false);
      }
    }
  }, [selectedTable, selectedDb, schema, selectedTimeField]);

  // Handle table detection from query
  useEffect(() => {
    if (query && (!selectedTable || selectedTable === null)) {
      const detected = extractTableName(query);
      if (detected && availableTables.includes(detected)) {
        setSelectedTable(detected);
      }
    }
  }, [query, availableTables, selectedTable]);

  // Save query builder state to localStorage
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

  // Enhanced query execution with time range support
  const executeQuery = useCallback(async () => {
    if (!selectedDb) {
      toast.error("Please select a database first");
      return;
    }

    // Update URL with query parameters
    const params = {
      query,
      db: selectedDb,
      table: selectedTable || undefined,
      timeField: selectedTimeField || undefined,
      timeFrom: timeRange?.from,
      timeTo: timeRange?.to
    };
    
    // Update browser URL with query parameters
    HashQueryUtils.updateBrowserUrlWithParams(params);

    setIsLoading(true);
    setError(null);
    setStartTime(Date.now());

    try {
      let queryToExecute = query.trim();

      // Process any query variables if query builder is enabled
      if (queryBuilderEnabled) {
        // Process time variables when time filtering is enabled
        if (selectedTimeField && timeRange && timeRange.enabled !== false) {
          console.log("Processing time variables for field:", selectedTimeField);

          // Initialize database type for proper SQL generation
          let dbType = "unknown";
          
          // Make sure we identify DuckDB case-insensitively and with different possible names
          if (selectedDb.toLowerCase().includes('duck') || 
              selectedDb.toLowerCase().includes('duckdb') || 
              selectedDb.toLowerCase() === 'hep') {  // Special case for this database
            dbType = "duckdb";
            console.log("Using DuckDB SQL dialect for database:", selectedDb);
          } else if (selectedDb.toLowerCase().includes('click')) {
            dbType = "clickhouse";
          } else if (selectedDb.toLowerCase().includes('postgres') || selectedDb.toLowerCase().includes('pg')) {
            dbType = "postgres";
          }
          
          // Generate SQL for the time filter
          if (dbType === "duckdb") {
            // Format the query with correct DuckDB syntax - DuckDB requires specific spacing and syntax
            const timeRangeAmount = getTimeRangeAmount(timeRange.from);
            const timeRangeUnit = getTimeRangeUnit(timeRange.from);
            
            // Get field data type from schema if available to determine how to handle the time
            let fieldDataType = "unknown";
            const columns = getColumnsForTable(selectedTable || extractTableName(queryToExecute) || '');
            if (columns) {
              const fieldInfo = columns.find(col => col.columnName === selectedTimeField);
              if (fieldInfo) {
                fieldDataType = fieldInfo.dataType.toLowerCase();
                console.log(`Time field '${selectedTimeField}' has type: ${fieldDataType}`);
              }
            }
            
            // Check if this field stores timestamps in milliseconds or seconds
            const isMillisTimestamp = fieldDataType.includes('bigint') || 
                                    selectedTimeField.toLowerCase() === 'create_date' || 
                                    selectedTimeField.toLowerCase() === '__timestamp';
                                    
            const isDateTimeField = fieldDataType.includes('timestamp') || 
                                   fieldDataType.includes('date') || 
                                   fieldDataType.includes('time');
            
            // Generate appropriate SQL based on field type
            if (isMillisTimestamp) {
              // For millisecond timestamps stored as BIGINT (e.g., create_date, __timestamp)
              queryToExecute = queryToExecute.replace(/\$__timeFilter/g, 
                `${selectedTimeField} >= (EXTRACT(EPOCH FROM now() - INTERVAL ${timeRangeAmount} ${timeRangeUnit}) * 1000)::BIGINT AND ` +
                `${selectedTimeField} <= (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT`);
                
              queryToExecute = queryToExecute.replace(/\$__timeFrom/g, 
                `(EXTRACT(EPOCH FROM now() - INTERVAL ${timeRangeAmount} ${timeRangeUnit}) * 1000)::BIGINT`);
                
              queryToExecute = queryToExecute.replace(/\$__timeTo/g, 
                `(EXTRACT(EPOCH FROM now()) * 1000)::BIGINT`);
            } 
            else if (isDateTimeField) {
              // For proper date/time fields in DuckDB
              queryToExecute = queryToExecute.replace(/\$__timeFilter/g, 
                `${selectedTimeField} >= now() - INTERVAL ${timeRangeAmount} ${timeRangeUnit} AND ` +
                `${selectedTimeField} <= now()`);
                
              queryToExecute = queryToExecute.replace(/\$__timeFrom/g, `now() - INTERVAL ${timeRangeAmount} ${timeRangeUnit}`);
              queryToExecute = queryToExecute.replace(/\$__timeTo/g, `now()`);
            }
            else {
              // Default case for fields we're not sure about - assume epoch milliseconds
              queryToExecute = queryToExecute.replace(/\$__timeFilter/g, 
                `${selectedTimeField} >= (EXTRACT(EPOCH FROM now() - INTERVAL ${timeRangeAmount} ${timeRangeUnit}) * 1000)::BIGINT AND ` +
                `${selectedTimeField} <= (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT`);
                
              queryToExecute = queryToExecute.replace(/\$__timeFrom/g, 
                `(EXTRACT(EPOCH FROM now() - INTERVAL ${timeRangeAmount} ${timeRangeUnit}) * 1000)::BIGINT`);
                
              queryToExecute = queryToExecute.replace(/\$__timeTo/g, 
                `(EXTRACT(EPOCH FROM now()) * 1000)::BIGINT`);
            }
            
            queryToExecute = queryToExecute.replace(/\$__timeField/g, selectedTimeField);
          } else {
            // Use the complex logic for other database types
            let timeFilterSql = "";
            
            // Initialize epoch conversion function and multiplier variables
            let epochFunction = "CAST(EXTRACT(EPOCH FROM ";
            let epochMultiplier = "* 1000"; // Default to milliseconds
            
            // Check if field is 'create_date' which we know is a BIGINT in milliseconds
            const isCreateDateField = selectedTimeField.toLowerCase() === 'create_date';
            
            // Override for create_date which we know is milliseconds
            if (isCreateDateField) {
              epochFunction = "CAST(EXTRACT(EPOCH FROM ";
              epochMultiplier = "* 1000)"; // Convert to milliseconds for create_date
            }
            // Handle different database dialects
            else if (dbType === "clickhouse") {
              // ClickHouse uses toUnixTimestamp function
              epochFunction = "toUnixTimestamp64Nano";
              epochMultiplier = "";
            } else if (dbType === "postgres") {
              // PostgreSQL 
              epochFunction = "CAST(EXTRACT(EPOCH FROM ";
              epochMultiplier = "* 1000000000)::BIGINT"; // Convert to nanoseconds
            } else if (dbType === "influx") {
              // InfluxDB has its own time format
              epochFunction = "date_trunc_nano(";
              epochMultiplier = "";
            } else {
              // Default PostgreSQL-like
              epochFunction = "CAST(EXTRACT(EPOCH FROM ";
              epochMultiplier = "* 1000)"; // Convert to milliseconds
            }
            
            // Process time range and build SQL conditions
            if (timeRange.from.startsWith("now-")) {
              const match = timeRange.from.match(/^now-(\d+)([mhdwMy])$/);
              if (match) {
                const [, amount, unit] = match;
                let interval = "";
                
                switch (unit) {
                  case "m": interval = `${amount} minute`; break;
                  case "h": interval = `${amount} hour`; break;
                  case "d": interval = `${amount} day`; break;
                  case "w": interval = `${amount} week`; break;
                  case "M": interval = `${amount} month`; break;
                  case "y": interval = `${amount} year`; break;
                }
                
                timeFilterSql = `${selectedTimeField} >= ${epochFunction}now() - interval '${interval}') ${epochMultiplier}`;
              }
            }
            
            // Replace variables in query
            if (timeFilterSql && typeof queryToExecute === 'string') {
              queryToExecute = queryToExecute.replace(/\$__timeFilter/g, timeFilterSql);
            }
            
            if (typeof queryToExecute === 'string') {
              queryToExecute = queryToExecute.replace(/\$__timeField/g, selectedTimeField);
            }
            
            // Handle $__timeFrom
            let timeFromSql = "";
            if (timeRange.from.startsWith("now-")) {
              const match = timeRange.from.match(/^now-(\d+)([mhdwMy])$/);
              if (match) {
                const [, amount, unit] = match;
                let interval = "";
                
                switch (unit) {
                  case "m": interval = `${amount} minute`; break;
                  case "h": interval = `${amount} hour`; break;
                  case "d": interval = `${amount} day`; break;
                  case "w": interval = `${amount} week`; break;
                  case "M": interval = `${amount} month`; break;
                  case "y": interval = `${amount} year`; break;
                }
                
                timeFromSql = `${epochFunction}now() - interval '${interval}') ${epochMultiplier}`;
              }
            } else if (timeRange.from === "now") {
              timeFromSql = `${epochFunction}now()) ${epochMultiplier}`;
            }
            
            if (timeFromSql && typeof queryToExecute === 'string') {
              queryToExecute = queryToExecute.replace(/\$__timeFrom/g, timeFromSql);
            }
            
            // Handle $__timeTo
            let timeToSql = "";
            if (timeRange.to === "now") {
              timeToSql = `${epochFunction}now()) ${epochMultiplier}`;
            }
            
            if (timeToSql && typeof queryToExecute === 'string') {
              queryToExecute = queryToExecute.replace(/\$__timeTo/g, timeToSql);
            }
          }
          
          console.log("Query with variables replaced:", queryToExecute);
        }
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
      
      // Calculate execution time
      const executionTimeMs = Date.now() - (startTime || Date.now());
      setExecutionTime(executionTimeMs);
      
      // Add successful query to history
      addToQueryHistory({
        query: queryToExecute,
        db: selectedDb,
        table: selectedTable,
        timeField: selectedTimeField,
        timeRange: timeRange.enabled !== false ? timeRange : null,
        success: true,
        executionTime: executionTimeMs,
        rowCount: response.data.results?.length || 0
      });
      
      // Also save the query to localStorage for persistence
      localStorage.setItem("lastQuery", query);
    } catch (err: any) {
      console.error("Query execution error:", err);
      const errorMessage = err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "Error executing query";
      
      setError(errorMessage);
      setResults(null);
      setRawJson(null);
      
      // Calculate execution time for the failed query
      const executionTimeMs = Date.now() - (startTime || Date.now());
      setExecutionTime(executionTimeMs);
      
      // Record the failed query in history
      addToQueryHistory({
        query,
        db: selectedDb,
        table: selectedTable,
        timeField: selectedTimeField,
        timeRange: timeRange.enabled !== false ? timeRange : null,
        success: false,
        error: errorMessage,
        executionTime: executionTimeMs
      });
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
  ]);

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
  
  // Query history methods
  const saveQueryHistory = useCallback((history: QueryHistoryEntry[]) => {
    try {
      localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(history.slice(0, 50))); // Keep only last 50 entries
    } catch (e) {
      console.error("Failed to save query history", e);
    }
  }, []);
  
  const addToQueryHistory = useCallback((entry: Omit<QueryHistoryEntry, 'id' | 'timestamp'>) => {
    const newEntry: QueryHistoryEntry = {
      ...entry,
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      timestamp: new Date().toISOString()
    };
    
    setQueryHistory(prev => {
      const newHistory = [newEntry, ...prev].slice(0, 50); // Limit history to 50 entries
      saveQueryHistory(newHistory);
      return newHistory;
    });
  }, [saveQueryHistory]);
  
  const clearQueryHistory = useCallback(() => {
    setQueryHistory([]);
    localStorage.removeItem(QUERY_HISTORY_KEY);
  }, []);
  
  const getShareableUrlForQuery = useCallback((queryText: string) => {
    // Create hash params from current state
    const params = {
      query: queryText,
      db: selectedDb,
      table: selectedTable || undefined,
      timeField: selectedTimeField || undefined,
      timeFrom: timeRange?.from,
      timeTo: timeRange?.to
    };
    
    return HashQueryUtils.generateShareableUrl(params);
  }, [selectedDb, selectedTable, selectedTimeField, timeRange]);

  return (
    <QueryContext.Provider
      value={{
        selectedDb,
        setSelectedDb,
        selectedTable,
        setSelectedTable,
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
        getColumnsForTable,
        queryBuilderEnabled,
        setQueryBuilderEnabled,
        // Add query history properties
        queryHistory,
        addToQueryHistory,
        clearQueryHistory,
        getShareableUrlForQuery
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

// Helper function to get the amount from a time range string
function getTimeRangeAmount(timeRangeStr: string): string {
  if (timeRangeStr.startsWith("now-")) {
    const match = timeRangeStr.match(/^now-(\d+)([mhdwMy])$/);
    if (match) {
      return match[1];
    }
  }
  return "5"; // Default to 5 if parsing fails
}

// Helper function to get the unit from a time range string in uppercase for DuckDB
function getTimeRangeUnit(timeRangeStr: string): string {
  if (timeRangeStr.startsWith("now-")) {
    const match = timeRangeStr.match(/^now-(\d+)([mhdwMy])$/);
    if (match) {
      const unit = match[2];
      switch (unit) {
        case "m": return "MINUTE";
        case "h": return "HOUR";
        case "d": return "DAY";
        case "w": return "WEEK";
        case "M": return "MONTH";
        case "y": return "YEAR";
        default: return "MINUTE";
      }
    }
  }
  return "MINUTE"; // Default to MINUTE if parsing fails
}
