import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import axios from "axios";
import { toast } from "sonner";
import { selectedTimeFieldAtom, setSelectedTimeFieldAtom } from "./time-atoms";
import { detectTimeFieldsFromSchema, detectTimeUnitForColumn } from "@/lib/query-processor";

// ============================================================================
// Schema Cache Types
// ============================================================================

interface ColumnSchema {
  column_name: string;
  column_type: string;
  null: string;
  default: any;
  key: string | null;
  extra: string | null;
  timeUnit?: string; // Added time unit for timestamp columns
}

interface SampleDataEntry {
  data: any[];
  columns: string[];
  rowCount: number;
  timestamp: number;
  success: boolean;
  error?: string;
}

interface SchemaCache {
  databases: Record<
    string,
    {
      tables: string[];
      schemas: Record<string, ColumnSchema[]>;
      sampleData: Record<string, SampleDataEntry>;
    }
  >;
  timestamp: number;
  version: string;
}

// Import tab atoms
import { currentTabDatabaseAtom, currentTabTableAtom } from "./tab-atoms";

// Database selection atoms - now use tab-aware versions
export const selectedDbAtom = currentTabDatabaseAtom;
export const selectedTableAtom = currentTabTableAtom;

// Schema data atoms
export const schemaAtom = atom<Record<string, any>>({});
export const availableTablesAtom = atom<string[]>([]);
export const tableSchemaAtom = atom<any[]>([]);

// Autocomplete schema - structured for Monaco Editor
export const autoCompleteSchemaAtom = atom<Record<string, any[]>>({});

// AI Chatbot data - stored as arrays for easy consumption
export const databaseListForAIAtom = atomWithStorage<string[]>(
  "gigapi_databases",
  []
);
export const tablesListForAIAtom = atomWithStorage<Record<string, string[]>>(
  "gigapi_tables",
  {}
);

// Loading state atoms
export const tablesLoadingAtom = atom<boolean>(false);
export const schemaLoadingAtom = atom<boolean>(false);

// ============================================================================
// Schema Cache Atoms
// ============================================================================

// Comprehensive schema cache stored in localStorage for persistence
export const schemaCacheAtom = atomWithStorage<SchemaCache | null>(
  "gigapi_schema_cache",
  null,
  {
    getItem: (key) => {
      const item = localStorage.getItem(key);
      if (item) {
        try {
          const parsed = JSON.parse(item);
          return parsed;
        } catch (e) {
          console.error(
            "[SchemaCache] Failed to parse cache from localStorage:",
            e
          );
          return null;
        }
      }
      return null;
    },
    setItem: (key, value) => {
      localStorage.setItem(key, JSON.stringify(value));
    },
    removeItem: (key) => {
      localStorage.removeItem(key);
    },
  }
);

// Cache loading state
export const isCacheLoadingAtom = atom<boolean>(false);
export const cacheProgressAtom = atom<{ current: number; total: number }>({
  current: 0,
  total: 0,
});

// Synchronous cache check - directly from localStorage
export const getLocalStorageCacheAtom = atom(() => {
  try {
    const item = localStorage.getItem("gigapi_schema_cache");
    if (item) {
      const parsed = JSON.parse(item);
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
      const isValid = Date.now() - parsed.timestamp < TWENTY_FOUR_HOURS;
      return isValid ? parsed : null;
    }
  } catch (e) {
    console.error("[SchemaCache] Direct localStorage error:", e);
  }
  return null;
});

// Import available databases from connection atoms
import {
  availableDatabasesAtom,
  isConnectedAtom,
  apiUrlAtom,
} from "./connection-atoms";

// Actions
export const setSelectedDbAtom = atom(
  null,
  async (get, set, database: string) => {
    const currentDb = get(selectedDbAtom);

    // Early return if database hasn't changed
    if (currentDb === database) {
      return;
    }

    // Check if already loading tables
    if (get(tablesLoadingAtom)) {
      return;
    }

    set(selectedDbAtom, database);
    set(selectedTableAtom, ""); // Clear table selection
    set(availableTablesAtom, []); // Clear tables

    if (!database) return;

    set(tablesLoadingAtom, true);

    try {
      let tables: string[] = [];

      // Check cache first
      const getCachedTables = get(getCachedTablesAtom);
      const cachedTables = getCachedTables(database);

      if (cachedTables.length > 0) {
        tables = cachedTables;
      } else {
        // Fallback to API if cache miss
        const apiUrl = get(apiUrlAtom);
        const response = await axios.post(
          `${apiUrl}?db=${database}&format=json`,
          {
            query: "SHOW TABLES",
          }
        );
        tables =
          response.data.results
            ?.map((item: any) => item.table_name || item.Table || item.name)
            .filter(Boolean) || [];
      }

      set(availableTablesAtom, tables);

      // Initialize autocomplete schema for this database with table names
      const currentAutoCompleteSchema = get(autoCompleteSchemaAtom);
      const existingTables = currentAutoCompleteSchema[database] || [];

      // Create table entries for tables that don't exist yet (without columns)
      const updatedTables = [...existingTables];
      tables.forEach((tableName: string) => {
        if (!updatedTables.find((t) => t.tableName === tableName)) {
          updatedTables.push({
            tableName,
            columns: [], // Will be filled when table is selected
          });
        }
      });

      set(autoCompleteSchemaAtom, {
        ...currentAutoCompleteSchema,
        [database]: updatedTables,
      });

      // Save tables for AI/MCP use
      const currentAITables = get(tablesListForAIAtom);
      set(tablesListForAIAtom, {
        ...currentAITables,
        [database]: tables,
      });

      // Auto-select first table if none selected
      const currentTable = get(selectedTableAtom);
      if (!currentTable && tables.length > 0) {
        set(setSelectedTableAtom, tables[0]);
      }
    } catch (error) {
      console.error("Failed to load tables:", error);

      // Different error messages for different error types
      let errorMessage = "Unknown error";
      if (error instanceof Error) {
        if (error.message.includes("timeout")) {
          errorMessage =
            "Database query timed out - try again or check your database";
        } else if (error.message.includes("Network error")) {
          errorMessage = "Network error - check your connection";
        } else {
          errorMessage = error.message;
        }
      }

      toast.error(`Failed to load tables: ${errorMessage}`);
      // Set empty tables array so UI doesn't break
      set(availableTablesAtom, []);
    } finally {
      set(tablesLoadingAtom, false);
    }
  }
);

export const setSelectedTableAtom = atom(
  null,
  async (get, set, table: string) => {
    set(selectedTableAtom, table);

    if (!table) {
      set(tableSchemaAtom, []);
      return;
    }

    const database = get(selectedDbAtom);
    if (!database) return;

    // Check if already loading schema
    if (get(schemaLoadingAtom)) {
      return;
    }

    set(schemaLoadingAtom, true);

    try {
      // Use lazy loading - it will check cache first, then load if needed
      const schema = await set(loadAndCacheTableSchemaAtom, {
        database,
        table,
      });

      // Transform schema to use consistent property names
      const transformedSchema = schema.map((col: any) => {
        const columnName = col.column_name || col.name;
        const dataType = col.column_type || col.type || "unknown";
        
        // Detect time unit for potential time columns
        let timeUnit;
        const lowerName = columnName.toLowerCase();
        if (
          lowerName.includes("time") ||
          lowerName.includes("date") ||
          lowerName.includes("timestamp") ||
          columnName === "__timestamp"
        ) {
          timeUnit = detectTimeUnitForColumn(columnName, dataType);
        }

        return {
          columnName,
          dataType,
          timeUnit,
          // Preserve original properties for compatibility
          column_name: col.column_name,
          column_type: col.column_type,
          null: col.null,
          default: col.default,
          key: col.key,
          extra: col.extra,
        };
      });

      set(tableSchemaAtom, transformedSchema);

      // Update autocomplete schema for Monaco Editor
      const currentAutoCompleteSchema = get(autoCompleteSchemaAtom);
      const updatedSchema = {
        ...currentAutoCompleteSchema,
        [database]: currentAutoCompleteSchema[database] || [],
      };

      // Find or create the table in the schema
      const existingTableIndex = updatedSchema[database].findIndex(
        (t: any) => t.tableName === table
      );

      const tableSchema = {
        tableName: table,
        columns: schema.map((col: any) => ({
          columnName: col.column_name || col.name,
          dataType: col.column_type || col.type || "unknown",
        })),
      };

      if (existingTableIndex >= 0) {
        updatedSchema[database][existingTableIndex] = tableSchema;
      } else {
        updatedSchema[database].push(tableSchema);
      }

      set(autoCompleteSchemaAtom, updatedSchema);

      // Auto-select time field if none selected
      const selectedTimeField = get(selectedTimeFieldAtom);
      if (!selectedTimeField && transformedSchema.length > 0) {
        // Find time fields using the detectTimeFieldsFromSchema function
        const timeFieldNames = detectTimeFieldsFromSchema(transformedSchema);

        if (timeFieldNames.length > 0) {
          // Prefer __timestamp or first available time field
          const preferredTimeFieldName = timeFieldNames.includes("__timestamp")
            ? "__timestamp"
            : timeFieldNames[0];

          set(setSelectedTimeFieldAtom, preferredTimeFieldName);
        }
      }
    } catch (error) {
      console.error("Failed to load table schema:", error);
      toast.error(
        `Failed to load schema for table ${table}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      set(tableSchemaAtom, []);
    } finally {
      set(schemaLoadingAtom, false);
    }
  }
);

// Load tables for current database without changing selection
export const loadTablesForCurrentDbAtom = atom(null, async (get, set) => {
  const currentDb = get(selectedDbAtom);

  if (!currentDb) return;

  // Check if already loading tables
  if (get(tablesLoadingAtom)) {
    return;
  }

  set(tablesLoadingAtom, true);

  try {
    let tables: string[] = [];

    // Check cache first
    const getCachedTables = get(getCachedTablesAtom);
    const cachedTables = getCachedTables(currentDb);

    if (cachedTables.length > 0) {
      tables = cachedTables;
    } else {
      // Fallback to API if cache miss
      const apiUrl = get(apiUrlAtom);
      const response = await axios.post(
        `${apiUrl}?db=${currentDb}&format=json`,
        {
          query: "SHOW TABLES",
        }
      );
      tables =
        response.data.results
          ?.map((item: any) => item.table_name || item.Table || item.name)
          .filter(Boolean) || [];
    }

    set(availableTablesAtom, tables);

    const selectedTable = get(selectedTableAtom);
    if (selectedTable && tables.includes(selectedTable)) {
      try {
        // Use lazy loading - it will check cache first, then load if needed
        const schema = await set(loadAndCacheTableSchemaAtom, {
          database: currentDb,
          table: selectedTable,
        });

        // Transform schema to use consistent property names
        const transformedSchema = schema.map((col: any) => {
          const columnName = col.column_name || col.name;
          const dataType = col.column_type || col.type || "unknown";
          
          // Detect time unit for potential time columns
          let timeUnit;
          const lowerName = columnName.toLowerCase();
          if (
            lowerName.includes("time") ||
            lowerName.includes("date") ||
            lowerName.includes("timestamp") ||
            columnName === "__timestamp"
          ) {
            timeUnit = detectTimeUnitForColumn(columnName, dataType);
          }

          return {
            columnName,
            dataType,
            timeUnit,
            // Preserve original properties for compatibility
            column_name: col.column_name,
            column_type: col.column_type,
            null: col.null,
            default: col.default,
            key: col.key,
            extra: col.extra,
          };
        });

        set(tableSchemaAtom, transformedSchema);
      } catch (error) {
        console.error("Failed to load table schema:", error);
        // Don't show toast for schema errors during initialization
        set(tableSchemaAtom, []);
      }
    }
  } catch (error) {
    console.error("Failed to load tables:", error);

    // Different error messages for different error types
    let errorMessage = "Unknown error";
    if (error instanceof Error) {
      if (error.message.includes("timeout")) {
        errorMessage =
          "Database query timed out - try again or check your database";
      } else if (error.message.includes("Network error")) {
        errorMessage = "Network error - check your connection";
      } else {
        errorMessage = error.message;
      }
    }

    // Only show toast for explicit timeouts, not during initialization
    if (error instanceof Error && error.message.includes("timeout")) {
      toast.error(`Failed to load tables: ${errorMessage}`);
    }

    set(availableTablesAtom, []);
  } finally {
    set(tablesLoadingAtom, false);
  }
});

// Initialize database atom
export const initializeDatabaseAtom = atom(null, async (get, set) => {
  const isConnected = get(isConnectedAtom);
  // Don't initialize if not connected
  if (!isConnected) {
    return;
  }

  const databases = get(availableDatabasesAtom);
  const currentDb = get(selectedDbAtom);

  // If no database selected but databases available, select first one
  if (!currentDb && databases.length > 0) {
    await set(setSelectedDbAtom, databases[0]);
  } else if (currentDb) {
    // If database is already selected, just load its tables
    // Only load if tables aren't already loaded to prevent duplicate calls
    const currentTables = get(availableTablesAtom);
    if (currentTables.length === 0) {
      // First check cache
      const getCachedTables = get(getCachedTablesAtom);
      const cachedTables = getCachedTables(currentDb);

      if (cachedTables.length > 0) {
        set(availableTablesAtom, cachedTables);

        // Also check if we have a selected table and load its schema from cache
        const selectedTable = get(selectedTableAtom);
        if (selectedTable && cachedTables.includes(selectedTable)) {
          const getCachedSchema = get(getCachedSchemaAtom);
          const cachedSchema = getCachedSchema(currentDb, selectedTable);
          if (cachedSchema) {
            // Transform cached schema to use consistent property names
            const transformedSchema = cachedSchema.map((col: any) => {
              const columnName = col.column_name || col.name;
              const dataType = col.column_type || col.type || "unknown";
              
              // Use cached time unit if available, otherwise detect it
              const timeUnit = col.timeUnit || (() => {
                const lowerName = columnName.toLowerCase();
                if (
                  lowerName.includes("time") ||
                  lowerName.includes("date") ||
                  lowerName.includes("timestamp") ||
                  columnName === "__timestamp"
                ) {
                  return detectTimeUnitForColumn(columnName, dataType);
                }
                return undefined;
              })();

              return {
                columnName,
                dataType,
                timeUnit,
                // Preserve original properties for compatibility
                column_name: col.column_name,
                column_type: col.column_type,
                null: col.null,
                default: col.default,
                key: col.key,
                extra: col.extra,
              };
            });
            set(tableSchemaAtom, transformedSchema);
          }
        }
      } else {
        await set(loadTablesForCurrentDbAtom);
      }
    }
  }
});

// Database column utilities
export const getColumnsAtom = atom((get) => {
  return (tableName: string) => {
    const selectedTable = get(selectedTableAtom);
    if (selectedTable === tableName) {
      return get(tableSchemaAtom);
    }
    return [];
  };
});

// Load schema for a specific database (all tables)
export const loadSchemaForDbAtom = atom(
  null,
  async (get, set, database: string) => {
    if (!database) return;

    const apiUrl = get(apiUrlAtom);
    const currentSchema = get(schemaAtom);

    // If schema already exists for this database, skip
    if (currentSchema[database]) {
      return;
    }

    try {
      // First, get all tables for the database
      const tablesResponse = await axios.post(
        `${apiUrl}?db=${database}&format=json`,
        {
          query: "SHOW TABLES",
        }
      );
      const tables =
        tablesResponse.data.results
          ?.map((item: any) => item.table_name || item.Table || item.name)
          .filter(Boolean) || [];

      // Load schema for each table
      const schemaPromises = tables.map(async (table: string) => {
        try {
          const schemaResponse = await axios.post(
            `${apiUrl}?db=${database}&format=json`,
            {
              query: `DESCRIBE SELECT * FROM ${table} LIMIT 1`,
            }
          );
          const tableSchema = schemaResponse.data.results || [];
          return { table, schema: tableSchema };
        } catch (error) {
          console.error(
            `Failed to load schema for ${database}.${table}:`,
            error
          );
          return { table, schema: [] };
        }
      });

      const results = await Promise.all(schemaPromises);

      // Build schema object
      const dbSchema: Record<string, any[]> = {};
      results.forEach(({ table, schema }: { table: string; schema: any[] }) => {
        dbSchema[table] = schema;
      });

      // Update schema atom
      set(schemaAtom, {
        ...currentSchema,
        [database]: dbSchema,
      });
    } catch (error) {
      console.error(`Failed to load schema for database ${database}:`, error);
    }
  }
);

// ============================================================================
// Schema Cache Functions
// ============================================================================

// Initialize schema cache with just database and table lists (no schemas)
export const initializeSchemaCacheAtom = atom(null, async (get, set) => {
  const apiUrl = get(apiUrlAtom);
  const databases = get(availableDatabasesAtom);

  if (!databases.length) {
    return;
  }

  const cache: SchemaCache = {
    databases: {},
    timestamp: Date.now(),
    version: "1.0",
  };

  // Only load table lists, not schemas
  let networkCallsMade = 0;
  const totalDatabases = databases.length;
  
  console.log(`[SchemaCache] Initializing cache for ${totalDatabases} databases`);
  
  for (const database of databases) {
    try {
      // Check if we already have tables in memory
      const currentTables = get(tablesListForAIAtom)[database];

      if (currentTables && currentTables.length > 0) {
        console.log(`[SchemaCache] Using cached tables for ${database} (${currentTables.length} tables)`);
        cache.databases[database] = {
          tables: currentTables,
          schemas: {}, // Empty schemas - will be loaded on demand
          sampleData: {}, // Initialize sample data cache
        };
      } else {
        console.log(`[SchemaCache] Fetching tables for ${database}...`);
        const requestStart = Date.now();
        
        const tablesResponse = await axios.post(
          `${apiUrl}?db=${database}&format=json`,
          { query: "SHOW TABLES" }
        );
        
        networkCallsMade++;
        const requestDuration = Date.now() - requestStart;
        
        const tables =
          tablesResponse.data.results
            ?.map((item: any) => item.table_name || item.Table || item.name)
            .filter(Boolean) || [];

        console.log(`[SchemaCache] Loaded ${tables.length} tables for ${database} (${requestDuration}ms)`);

        cache.databases[database] = {
          tables,
          schemas: {}, // Empty schemas - will be loaded on demand
          sampleData: {}, // Initialize sample data cache
        };

        // Update tables list for AI
        const currentAITables = get(tablesListForAIAtom);
        set(tablesListForAIAtom, {
          ...currentAITables,
          [database]: tables,
        });
      }
    } catch (error) {
      console.error(
        `[SchemaCache] Failed to load tables for ${database}:`,
        error
      );
      cache.databases[database] = { 
        tables: [], 
        schemas: {},
        sampleData: {}
      };
    }
  }
  
  console.log(`[SchemaCache] Cache initialization complete: ${networkCallsMade} network calls made`);

  // Save lightweight cache
  set(schemaCacheAtom, cache);
});

// Get cached schema for a specific table
export const getCachedSchemaAtom = atom(
  (get) =>
    (database: string, table: string): ColumnSchema[] | null => {
      const cache = get(schemaCacheAtom);
      return cache?.databases[database]?.schemas[table] || null;
    }
);

// Lazily load and cache schema for a specific table
export const loadAndCacheTableSchemaAtom = atom(
  null,
  async (
    get,
    set,
    { database, table }: { database: string; table: string }
  ) => {
    const apiUrl = get(apiUrlAtom);
    const cache = get(schemaCacheAtom);

    // Check if already cached
    if (cache?.databases[database]?.schemas[table]) {
      return cache.databases[database].schemas[table];
    }

    try {
      const response = await axios.post(
        `${apiUrl}?db=${database}&format=json`,
        {
          query: `DESCRIBE SELECT * FROM ${table} LIMIT 1`,
        }
      );

      const schema = response.data.results || [];

      // Add time unit information to schema before caching
      const schemaWithTimeUnits = schema.map((col: any) => {
        const columnName = col.column_name || col.name;
        const dataType = col.column_type || col.type || "unknown";
        
        // Detect time unit for potential time columns
        let timeUnit;
        const lowerName = columnName.toLowerCase();
        if (
          lowerName.includes("time") ||
          lowerName.includes("date") ||
          lowerName.includes("timestamp") ||
          columnName === "__timestamp"
        ) {
          timeUnit = detectTimeUnitForColumn(columnName, dataType);
        }

        return {
          ...col,
          timeUnit
        };
      });

      // Update cache with the new schema
      if (cache) {
        const updatedCache = {
          ...cache,
          databases: {
            ...cache.databases,
            [database]: {
              ...cache.databases[database],
              schemas: {
                ...cache.databases[database]?.schemas,
                [table]: schemaWithTimeUnits,
              },
            },
          },
        };

        set(schemaCacheAtom, updatedCache);
      }

      return schemaWithTimeUnits;
    } catch (error) {
      console.error(
        `[SchemaCache] Failed to load schema for ${database}.${table}:`,
        error
      );
      throw error;
    }
  }
);

// Get cached tables for a database
export const getCachedTablesAtom = atom(
  (get) =>
    (database: string): string[] => {
      const cache = get(schemaCacheAtom);
      const tables = cache?.databases[database]?.tables || [];
      return tables;
    }
);

// Check if cache is valid (not older than 24 hours)
export const isCacheValidAtom = atom((get) => {
  const cache = get(schemaCacheAtom);
  if (!cache) return false;

  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  const isValid = Date.now() - cache.timestamp < TWENTY_FOUR_HOURS;
  return isValid;
});

// Loading state for cache refresh
export const cacheRefreshLoadingAtom = atom<boolean>(false);

// Refresh cache
export const refreshSchemaCacheAtom = atom(null, async (_get, set) => {
  set(cacheRefreshLoadingAtom, true);
  const startTime = Date.now();
  
  try {
    toast.info("Refreshing database schema cache...");
    console.log("[SchemaCache] Starting cache refresh");
    
    // Clear existing cache
    set(schemaCacheAtom, null);
    
    // Initialize lightweight cache with network calls
    await set(initializeSchemaCacheAtom);
    
    const duration = Date.now() - startTime;
    console.log(`[SchemaCache] Cache refresh completed in ${duration}ms`);
    toast.success(`Database schema refreshed successfully (${Math.round(duration / 1000)}s)`);
  } catch (error) {
    console.error("[SchemaCache] Cache refresh failed:", error);
    toast.error("Failed to refresh database schema cache");
    throw error;
  } finally {
    set(cacheRefreshLoadingAtom, false);
  }
});

// Force reload schema for current table
export const forceReloadCurrentTableSchemaAtom = atom(
  null,
  async (get, set) => {
    const database = get(selectedDbAtom);
    const table = get(selectedTableAtom);

    if (!database || !table) {
      return;
    }

    // Clear the table schema first
    set(tableSchemaAtom, []);
    set(schemaLoadingAtom, true);

    try {
      // Clear cache for this specific table
      const cache = get(schemaCacheAtom);
      if (cache?.databases[database]?.schemas[table]) {
        const updatedCache = {
          ...cache,
          databases: {
            ...cache.databases,
            [database]: {
              ...cache.databases[database],
              schemas: Object.fromEntries(
                Object.entries(cache.databases[database].schemas).filter(
                  ([key]) => key !== table
                )
              ),
            },
          },
        };
        set(schemaCacheAtom, updatedCache);
      }

      // Force reload from API
      const apiUrl = get(apiUrlAtom);
      const response = await axios.post(
        `${apiUrl}?db=${database}&format=json`,
        {
          query: `DESCRIBE SELECT * FROM ${table} LIMIT 1`,
        }
      );

      const schema = response.data.results || [];

      // Add time unit information to schema before caching
      const schemaWithTimeUnits = schema.map((col: any) => {
        const columnName = col.column_name || col.name;
        const dataType = col.column_type || col.type || "unknown";
        
        // Detect time unit for potential time columns
        let timeUnit;
        const lowerName = columnName.toLowerCase();
        if (
          lowerName.includes("time") ||
          lowerName.includes("date") ||
          lowerName.includes("timestamp") ||
          columnName === "__timestamp"
        ) {
          timeUnit = detectTimeUnitForColumn(columnName, dataType);
        }

        return {
          ...col,
          timeUnit
        };
      });

      // Transform and set the schema
      const transformedSchema = schemaWithTimeUnits.map((col: any) => ({
        columnName: col.column_name || col.name,
        dataType: col.column_type || col.type || "unknown",
        timeUnit: col.timeUnit,
        // Preserve original properties for compatibility
        column_name: col.column_name,
        column_type: col.column_type,
        null: col.null,
        default: col.default,
        key: col.key,
        extra: col.extra,
      }));

      set(tableSchemaAtom, transformedSchema);

      // Update cache with new schema
      if (cache) {
        const updatedCache = {
          ...cache,
          databases: {
            ...cache.databases,
            [database]: {
              ...cache.databases[database],
              schemas: {
                ...cache.databases[database]?.schemas,
                [table]: schemaWithTimeUnits,
              },
            },
          },
        };
        set(schemaCacheAtom, updatedCache);
      }

      toast.success(`Schema refreshed for ${table}`);
    } catch (error) {
      console.error(`[Schema Force Reload] Failed to reload schema:`, error);
      toast.error(
        `Failed to refresh schema: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      set(schemaLoadingAtom, false);
    }
  }
);

// ============================================================================
// Fresh Data Atoms - Always Bypass Cache for Dynamic Fetching
// ============================================================================

// Fresh databases - always fetch from API
export const freshDatabasesLoadingAtom = atom<boolean>(false);
export const freshDatabasesAtom = atom<string[]>([]);

export const fetchFreshDatabasesAtom = atom(
  null,
  async (get, set) => {
    const apiUrl = get(apiUrlAtom);
    const isConnected = get(isConnectedAtom);
    
    if (!isConnected) {
      return [];
    }
    
    set(freshDatabasesLoadingAtom, true);
    
    try {
      const response = await axios.post(
        `${apiUrl}?format=json`,
        { query: "SHOW DATABASES" }
      );
      
      const databases = response.data.results
        ?.map((item: any) => item.database_name || item.Database || item.name)
        .filter(Boolean) || [];
        
      set(freshDatabasesAtom, databases);
      set(freshDatabasesLoadedAtom, true);
      return databases;
    } catch (error) {
      console.error("[Fresh Databases] Failed to fetch:", error);
      set(freshDatabasesAtom, []);
      return [];
    } finally {
      set(freshDatabasesLoadingAtom, false);
    }
  }
);

// Fresh tables - always fetch from API (keyed by database)
export const freshTablesLoadingAtom = atom<boolean>(false);
export const freshTablesAtom = atom<Record<string, string[]>>({});

export const fetchFreshTablesAtom = atom(
  null,
  async (get, set, database: string) => {
    const apiUrl = get(apiUrlAtom);
    
    if (!database) {
      return [];
    }
    
    set(freshTablesLoadingAtom, true);
    
    try {
      const response = await axios.post(
        `${apiUrl}?db=${database}&format=json`,
        { query: "SHOW TABLES" }
      );
      
      const tables = response.data.results
        ?.map((item: any) => item.table_name || item.Table || item.name)
        .filter(Boolean) || [];
        
      // Store tables keyed by database
      set(freshTablesAtom, (prev) => ({
        ...prev,
        [database]: tables
      }));
      // Mark this database as having tables loaded
      set(freshTablesLoadedForAtom, (prev: Set<string>) => {
        const newSet = new Set(prev);
        newSet.add(database);
        return newSet;
      });
      return tables;
    } catch (error) {
      console.error(`[Fresh Tables] Failed to fetch for ${database}:`, error);
      // Don't clear all tables, just mark this database as empty
      set(freshTablesAtom, (prev) => ({
        ...prev,
        [database]: []
      }));
      return [];
    } finally {
      set(freshTablesLoadingAtom, false);
    }
  }
);

// Fresh schema - always fetch from API (keyed by database.table)
export const freshSchemaLoadingAtom = atom<boolean>(false);
export const freshSchemaAtom = atom<Record<string, ColumnSchema[]>>({});

export const fetchFreshSchemaAtom = atom(
  null,
  async (get, set, { database, table }: { database: string; table: string }) => {
    const apiUrl = get(apiUrlAtom);
    
    if (!database || !table) {
      return [];
    }
    
    set(freshSchemaLoadingAtom, true);
    
    try {
      const response = await axios.post(
        `${apiUrl}?db=${database}&format=json`,
        { query: `DESCRIBE SELECT * FROM ${table} LIMIT 1` }
      );
      
      const schema = response.data.results || [];
      
      // Add time unit information to schema
      const schemaWithTimeUnits = schema.map((col: any) => {
        const columnName = col.column_name || col.name;
        const dataType = col.column_type || col.type || "unknown";
        
        // Detect time unit for potential time columns
        let timeUnit;
        const lowerName = columnName.toLowerCase();
        if (
          lowerName.includes("time") ||
          lowerName.includes("date") ||
          lowerName.includes("timestamp") ||
          columnName === "__timestamp"
        ) {
          timeUnit = detectTimeUnitForColumn(columnName, dataType);
        }

        return {
          ...col,
          timeUnit
        };
      });
      
      // Store schema keyed by database.table
      const schemaKey = `${database}.${table}`;
      set(freshSchemaAtom, (prev) => ({
        ...prev,
        [schemaKey]: schemaWithTimeUnits
      }));
      // Mark this table schema as loaded
      set(freshSchemasLoadedForAtom, (prev: Set<string>) => {
        const newSet = new Set(prev);
        newSet.add(schemaKey);
        return newSet;
      });
      return schemaWithTimeUnits;
    } catch (error) {
      console.error(`[Fresh Schema] Failed to fetch for ${database}.${table}:`, error);
      // Don't clear all schemas, just mark this table as empty
      const schemaKey = `${database}.${table}`;
      set(freshSchemaAtom, (prev) => ({
        ...prev,
        [schemaKey]: []
      }));
      return [];
    } finally {
      set(freshSchemaLoadingAtom, false);
    }
  }
);

// ============================================================================
// Fresh Data Tracking Atoms - Track what has been loaded
// ============================================================================

// Track if databases have been loaded in this session
export const freshDatabasesLoadedAtom = atom<boolean>(false);

// Track which database tables have been loaded
export const freshTablesLoadedForAtom = atom<Set<string>>(new Set<string>());

// Track which schemas have been loaded (key: "database.table")
export const freshSchemasLoadedForAtom = atom<Set<string>>(new Set<string>());

// ============================================================================
// Sample Data Cache Management
// ============================================================================

// Sample data cache TTL (shorter than schema cache - 30 minutes)
const SAMPLE_DATA_TTL = 30 * 60 * 1000; // 30 minutes

// Get cached sample data for a table
export const getCachedSampleDataAtom = atom(
  (get) =>
    (database: string, table: string): SampleDataEntry | null => {
      const cache = get(schemaCacheAtom);
      const sampleData = cache?.databases[database]?.sampleData?.[table];
      
      if (!sampleData) return null;
      
      // Check if sample data is still valid (30 minutes TTL)
      const isValid = Date.now() - sampleData.timestamp < SAMPLE_DATA_TTL;
      return isValid ? sampleData : null;
    }
);

// Load and cache sample data for a specific table
export const loadAndCacheSampleDataAtom = atom(
  null,
  async (
    get,
    set,
    { database, table, apiUrl, limit = 5 }: { 
      database: string; 
      table: string; 
      apiUrl: string;
      limit?: number;
    }
  ) => {
    const cache = get(schemaCacheAtom);
    
    try {
      console.log(`[SampleDataCache] Fetching sample data for ${database}.${table}`);
      
      const sampleQuery = `SELECT * FROM ${table} LIMIT ${limit}`;
      const response = await axios.post(
        `${apiUrl}?db=${encodeURIComponent(database)}&format=json`,
        { query: sampleQuery },
        { timeout: 5000 }
      );

      const results = response.data.results || [];
      const columns = results.length > 0 ? Object.keys(results[0]) : [];
      
      const sampleDataEntry: SampleDataEntry = {
        data: results,
        columns,
        rowCount: results.length,
        timestamp: Date.now(),
        success: true,
      };

      // Update cache with the new sample data
      if (cache) {
        const updatedCache = {
          ...cache,
          databases: {
            ...cache.databases,
            [database]: {
              ...cache.databases[database],
              sampleData: {
                ...cache.databases[database]?.sampleData,
                [table]: sampleDataEntry,
              },
            },
          },
        };

        set(schemaCacheAtom, updatedCache);
      }

      return sampleDataEntry;
    } catch (error) {
      console.error(`[SampleDataCache] Failed to load sample data for ${database}.${table}:`, error);
      
      const errorEntry: SampleDataEntry = {
        data: [],
        columns: [],
        rowCount: 0,
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      // Still cache the error to avoid repeated failed requests
      if (cache) {
        const updatedCache = {
          ...cache,
          databases: {
            ...cache.databases,
            [database]: {
              ...cache.databases[database],
              sampleData: {
                ...cache.databases[database]?.sampleData,
                [table]: errorEntry,
              },
            },
          },
        };

        set(schemaCacheAtom, updatedCache);
      }

      throw error;
    }
  }
);
