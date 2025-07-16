import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import axios from "axios";
import { toast } from "sonner";
import { selectedTimeFieldAtom, setSelectedTimeFieldAtom } from "./time-atoms";

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
}

interface SchemaCache {
  databases: Record<
    string,
    {
      tables: string[];
      schemas: Record<string, ColumnSchema[]>;
    }
  >;
  timestamp: number;
  version: string;
}

// Database selection atoms
export const selectedDbAtom = atomWithStorage<string>(
  "gigapi_selected_db",
  "",
  {
    getItem: (key) => localStorage.getItem(key) || "",
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
  }
);

export const selectedTableAtom = atomWithStorage<string>(
  "gigapi_selected_table",
  "",
  {
    getItem: (key) => localStorage.getItem(key) || "",
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
  }
);

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
      console.log("[SchemaCache] Loading from localStorage...");
      const item = localStorage.getItem(key);
      if (item) {
        try {
          const parsed = JSON.parse(item);
          console.log("[SchemaCache] Found cache in localStorage:", {
            databases: Object.keys(parsed.databases || {}),
            timestamp: new Date(parsed.timestamp).toISOString(),
            age:
              Math.round((Date.now() - parsed.timestamp) / 1000 / 60) +
              " minutes",
          });
          return parsed;
        } catch (e) {
          console.error(
            "[SchemaCache] Failed to parse cache from localStorage:",
            e
          );
          return null;
        }
      }
      console.log("[SchemaCache] No cache found in localStorage");
      return null;
    },
    setItem: (key, value) => {
      console.log("[SchemaCache] Saving to localStorage:", {
        databases: Object.keys(value?.databases || {}),
        timestamp: new Date(value?.timestamp || 0).toISOString(),
      });
      localStorage.setItem(key, JSON.stringify(value));
    },
    removeItem: (key) => {
      console.log("[SchemaCache] Removing from localStorage");
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
  console.log("[SchemaCache] Direct localStorage check...");
  try {
    const item = localStorage.getItem("gigapi_schema_cache");
    if (item) {
      const parsed = JSON.parse(item);
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
      const isValid = Date.now() - parsed.timestamp < TWENTY_FOUR_HOURS;
      console.log("[SchemaCache] Direct localStorage result:", {
        found: true,
        valid: isValid,
        databases: Object.keys(parsed.databases || {}),
        age:
          Math.round((Date.now() - parsed.timestamp) / 1000 / 60) + " minutes",
      });
      return isValid ? parsed : null;
    }
  } catch (e) {
    console.error("[SchemaCache] Direct localStorage error:", e);
  }
  console.log("[SchemaCache] Direct localStorage result: not found or invalid");
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
      console.log(`[Database] Database ${database} already selected, skipping`);
      return;
    }

    // Check if already loading tables
    if (get(tablesLoadingAtom)) {
      console.log(`[Database] Tables already loading, skipping`);
      return;
    }

    console.log(
      `[Database] Setting selected database from ${currentDb} to ${database}`
    );

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
        console.log(
          `[Database] Using cached tables for ${database}: ${cachedTables.length} tables`
        );
        tables = cachedTables;
      } else {
        // Fallback to API if cache miss
        console.log(`[Database] Cache miss for ${database}, fetching from API`);
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

      console.log(
        `[Database] Initialized autocomplete schema for ${database} with ${tables.length} tables`
      );

      // Save tables for AI/MCP use
      const currentAITables = get(tablesListForAIAtom);
      set(tablesListForAIAtom, {
        ...currentAITables,
        [database]: tables,
      });
      console.log(
        `[Database] Saved ${tables.length} tables for AI/MCP in database ${database}:`,
        tables
      );

      // Auto-select first table if none selected
      const currentTable = get(selectedTableAtom);
      if (!currentTable && tables.length > 0) {
        console.log(`[Database] Auto-selecting first table: ${tables[0]}`);
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
      console.log(`[Database] Schema already loading for ${table}, skipping`);
      return;
    }

    set(schemaLoadingAtom, true);

    try {
      let schema: ColumnSchema[] = [];

      // Check cache first
      const getCachedSchema = get(getCachedSchemaAtom);
      const cachedSchema = getCachedSchema(database, table);

      if (cachedSchema) {
        console.log(`[Database] Using cached schema for ${database}.${table}`);
        schema = cachedSchema;
      } else {
        // Fallback to API if cache miss
        console.log(
          `[Database] Cache miss for ${database}.${table}, fetching from API`
        );
        const apiUrl = get(apiUrlAtom);
        const response = await axios.post(
          `${apiUrl}?db=${database}&format=json`,
          {
            query: `DESCRIBE SELECT * FROM ${table} LIMIT 1`,
          }
        );
        schema = response.data.results || [];
      }

      set(tableSchemaAtom, schema);

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
      console.log(
        `[Database] Updated autocomplete schema for ${database}.${table}:`,
        tableSchema
      );

      // Auto-select time field if none selected
      const selectedTimeField = get(selectedTimeFieldAtom);
      if (!selectedTimeField && schema.length > 0) {
        // Find time fields
        const timeFields = schema.filter((col) => {
          const colName = (col.column_name || "").toLowerCase();
          const dataType = (col.column_type || "").toLowerCase();
          return (
            colName.includes("time") ||
            colName.includes("date") ||
            colName.includes("timestamp") ||
            colName === "__timestamp" ||
            dataType.includes("timestamp") ||
            dataType.includes("datetime")
          );
        });

        if (timeFields.length > 0) {
          // Prefer __timestamp or first available time field
          const preferredTimeField =
            timeFields.find((col) => col.column_name === "__timestamp") ||
            timeFields[0];

          const timeFieldName = preferredTimeField.column_name;
          console.log(`[Database] Auto-selecting time field: ${timeFieldName}`);
          set(setSelectedTimeFieldAtom, timeFieldName);
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
    console.log(`[Database] Tables already loading for ${currentDb}, skipping`);
    return;
  }

  set(tablesLoadingAtom, true);

  try {
    let tables: string[] = [];

    // Check cache first
    const getCachedTables = get(getCachedTablesAtom);
    const cachedTables = getCachedTables(currentDb);

    if (cachedTables.length > 0) {
      console.log(
        `[Database] Using cached tables for ${currentDb}: ${cachedTables.length} tables`
      );
      tables = cachedTables;
    } else {
      // Fallback to API if cache miss
      console.log(`[Database] Cache miss for ${currentDb}, fetching from API`);
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
        let schema: ColumnSchema[] = [];

        // Check cache first
        const getCachedSchema = get(getCachedSchemaAtom);
        const cachedSchema = getCachedSchema(currentDb, selectedTable);

        if (cachedSchema) {
          console.log(
            `[Database] Using cached schema for ${currentDb}.${selectedTable}`
          );
          schema = cachedSchema;
        } else {
          // Fallback to API if cache miss
          console.log(
            `[Database] Cache miss for schema ${currentDb}.${selectedTable}, fetching from API`
          );
          const apiUrl = get(apiUrlAtom);
          const schemaResponse = await axios.post(
            `${apiUrl}?db=${currentDb}&format=json`,
            {
              query: `DESCRIBE SELECT * FROM ${selectedTable} LIMIT 1`,
            }
          );
          schema = schemaResponse.data.results || [];
        }

        set(tableSchemaAtom, schema);
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
  console.log("[Database] initializeDatabaseAtom called:", {
    isConnected,
    timestamp: new Date().toISOString(),
  });

  // Don't initialize if not connected
  if (!isConnected) {
    console.log("[Database] Not connected, skipping initialization");
    return;
  }

  // Check cache status before proceeding
  const schemaCache = get(schemaCacheAtom);
  console.log("[Database] Cache status at initialization:", {
    hasCache: !!schemaCache,
    databases: schemaCache ? Object.keys(schemaCache.databases) : [],
    isCacheLoading: get(isCacheLoadingAtom),
  });

  const databases = get(availableDatabasesAtom);
  const currentDb = get(selectedDbAtom);

  console.log(
    `🔥 [Database] Initializing with ${databases.length} databases, current: ${currentDb}`
  );

  // If no database selected but databases available, select first one
  if (!currentDb && databases.length > 0) {
    console.log(
      `🔥 [Database] No database selected, selecting first: ${databases[0]}`
    );
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
        console.log(
          `🔥 [Database] SUCCESS: Loading ${cachedTables.length} tables from cache for ${currentDb}`,
          cachedTables
        );
        set(availableTablesAtom, cachedTables);

        // Also check if we have a selected table and load its schema from cache
        const selectedTable = get(selectedTableAtom);
        if (selectedTable && cachedTables.includes(selectedTable)) {
          const getCachedSchema = get(getCachedSchemaAtom);
          const cachedSchema = getCachedSchema(currentDb, selectedTable);
          if (cachedSchema) {
            console.log(
              `🔥 [Database] SUCCESS: Loading schema from cache for ${currentDb}.${selectedTable}`
            );
            set(tableSchemaAtom, cachedSchema);
          } else {
            console.log(
              `🔥 [Database] No cached schema for ${currentDb}.${selectedTable}`
            );
          }
        }
      } else {
        console.log(
          `🔥 [Database] CACHE MISS: No cached tables for ${currentDb}, will load from API`
        );
        await set(loadTablesForCurrentDbAtom);
      }
    } else {
      console.log(
        `🔥 [Database] Database ${currentDb} already has ${currentTables.length} tables loaded`
      );
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
      console.log(`[Database] Schema already loaded for ${database}`);
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

      console.log(
        `[Database] Loaded schema for ${tables.length} tables in ${database}`
      );
    } catch (error) {
      console.error(`Failed to load schema for database ${database}:`, error);
    }
  }
);

// ============================================================================
// Schema Cache Functions
// ============================================================================

// Load complete schema cache for all databases
export const loadCompleteSchemaCacheAtom = atom(null, async (get, set) => {
  const apiUrl = get(apiUrlAtom);
  const databases = get(availableDatabasesAtom);

  if (!databases.length) {
    console.log("[SchemaCache] No databases available to cache");
    return;
  }

  console.log(`[SchemaCache] Starting to cache ${databases.length} databases`);
  set(isCacheLoadingAtom, true);
  set(cacheProgressAtom, { current: 0, total: databases.length });

  const cache: SchemaCache = {
    databases: {},
    timestamp: Date.now(),
    version: "1.0",
  };

  try {
    for (let i = 0; i < databases.length; i++) {
      const database = databases[i];
      console.log(
        `[SchemaCache] Loading database ${i + 1}/${
          databases.length
        }: ${database}`
      );
      set(cacheProgressAtom, { current: i + 1, total: databases.length });

      try {
        // Get tables for database
        const tablesResponse = await axios.post(
          `${apiUrl}?db=${database}&format=json`,
          { query: "SHOW TABLES" }
        );

        const tables =
          tablesResponse.data.results
            ?.map((item: any) => item.table_name || item.Table || item.name)
            .filter(Boolean) || [];

        console.log(
          `[SchemaCache] Found ${tables.length} tables in ${database}`
        );

        // Get schemas for all tables in parallel (batch by 10 to avoid overwhelming)
        const batchSize = 10;
        const allSchemas: { table: string; schema: ColumnSchema[] }[] = [];

        for (let j = 0; j < tables.length; j += batchSize) {
          const batch = tables.slice(j, j + batchSize);
          const schemaPromises = batch.map(async (table: string) => {
            try {
              const schemaResponse = await axios.post(
                `${apiUrl}?db=${database}&format=json`,
                { query: `DESCRIBE SELECT * FROM ${table} LIMIT 1` }
              );
              return { table, schema: schemaResponse.data.results || [] };
            } catch (error) {
              console.error(
                `[SchemaCache] Failed to load schema for ${database}.${table}:`,
                error
              );
              return { table, schema: [] };
            }
          });

          const batchResults = await Promise.all(schemaPromises);
          allSchemas.push(...batchResults);
        }

        cache.databases[database] = {
          tables,
          schemas: allSchemas.reduce((acc, { table, schema }) => {
            acc[table] = schema;
            return acc;
          }, {} as Record<string, ColumnSchema[]>),
        };
      } catch (error) {
        console.error(
          `[SchemaCache] Failed to load database ${database}:`,
          error
        );
        cache.databases[database] = { tables: [], schemas: {} };
      }
    }

    // Save cache
    set(schemaCacheAtom, cache);

    // Also update existing atoms for compatibility
    set(
      tablesListForAIAtom,
      Object.entries(cache.databases).reduce((acc, [db, data]) => {
        acc[db] = data.tables;
        return acc;
      }, {} as Record<string, string[]>)
    );

    // Count total tables cached
    const totalTables = Object.values(cache.databases).reduce(
      (sum, db: any) => sum + db.tables.length,
      0
    );
    console.log(
      `[SchemaCache] Cache loaded successfully: ${databases.length} databases, ${totalTables} tables`
    );
    toast.success(
      `Schema cache loaded: ${databases.length} databases, ${totalTables} tables`
    );
  } catch (error) {
    console.error("[SchemaCache] Failed to load cache:", error);
    toast.error("Failed to load database schema cache");
  } finally {
    set(isCacheLoadingAtom, false);
    set(cacheProgressAtom, { current: 0, total: 0 });
  }
});

// Get cached schema for a specific table
export const getCachedSchemaAtom = atom(
  (get) =>
    (database: string, table: string): ColumnSchema[] | null => {
      const cache = get(schemaCacheAtom);
      return cache?.databases[database]?.schemas[table] || null;
    }
);

// Get cached tables for a database
export const getCachedTablesAtom = atom(
  (get) =>
    (database: string): string[] => {
      const cache = get(schemaCacheAtom);
      const tables = cache?.databases[database]?.tables || [];
      console.log(`[SchemaCache] getCachedTables for ${database}:`, {
        cacheExists: !!cache,
        databaseInCache: !!cache?.databases[database],
        tablesCount: tables.length,
      });
      return tables;
    }
);

// Check if cache is valid (not older than 24 hours)
export const isCacheValidAtom = atom((get) => {
  const cache = get(schemaCacheAtom);
  console.log("[SchemaCache] Checking validity:", {
    hasCache: !!cache,
    timestamp: cache ? new Date(cache.timestamp).toISOString() : "none",
    age: cache
      ? Math.round((Date.now() - cache.timestamp) / 1000 / 60) + " minutes"
      : "N/A",
  });

  if (!cache) return false;

  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  const isValid = Date.now() - cache.timestamp < TWENTY_FOUR_HOURS;
  console.log("[SchemaCache] Cache validity result:", isValid);
  return isValid;
});

// Refresh cache
export const refreshSchemaCacheAtom = atom(null, async (_get, set) => {
  console.log("[SchemaCache] Refreshing cache...");
  toast.info("Refreshing database schema cache...");
  set(schemaCacheAtom, null); // Clear old cache
  await set(loadCompleteSchemaCacheAtom);
});
