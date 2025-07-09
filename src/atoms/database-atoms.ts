import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { gigapiClient } from "@/lib/api/gigapi-client";
import { toast } from "sonner";

// Database selection atoms - Fixed to not add extra quotes
export const selectedDbAtom = atomWithStorage<string>("gigapi_selected_db", "", {
  getItem: (key) => localStorage.getItem(key) || "",
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
});

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

// MCP/AI Chatbot data - stored as arrays for easy consumption
export const databaseListForAIAtom = atomWithStorage<string[]>("gigapi_databases", []);
export const tablesListForAIAtom = atomWithStorage<Record<string, string[]>>("gigapi_tables", {});
export const schemaForAIAtom = atomWithStorage<Record<string, Record<string, any[]>>>("gigapi_schema", {});

// Loading state atoms
export const tablesLoadingAtom = atom<boolean>(false);
export const schemaLoadingAtom = atom<boolean>(false);

// Import available databases from connection atoms
import { availableDatabasesAtom, isConnectedAtom } from "./connection";

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

    console.log(`[Database] Setting selected database from ${currentDb} to ${database}`);

    set(selectedDbAtom, database);
    set(selectedTableAtom, ""); // Clear table selection
    set(availableTablesAtom, []); // Clear tables

    if (!database) return;

    set(tablesLoadingAtom, true);

    try {
      const apiUrl = get(apiUrlAtom);
      const tables = await gigapiClient.getTables(apiUrl, database);
      set(availableTablesAtom, tables);
      
      // Initialize autocomplete schema for this database with table names
      const currentAutoCompleteSchema = get(autoCompleteSchemaAtom);
      const existingTables = currentAutoCompleteSchema[database] || [];
      
      // Create table entries for tables that don't exist yet (without columns)
      const updatedTables = [...existingTables];
      tables.forEach(tableName => {
        if (!updatedTables.find(t => t.tableName === tableName)) {
          updatedTables.push({
            tableName,
            columns: [] // Will be filled when table is selected
          });
        }
      });
      
      set(autoCompleteSchemaAtom, {
        ...currentAutoCompleteSchema,
        [database]: updatedTables
      });
      
      console.log(`[Database] Initialized autocomplete schema for ${database} with ${tables.length} tables`);
      
      // Save tables for AI/MCP use
      const currentAITables = get(tablesListForAIAtom);
      set(tablesListForAIAtom, {
        ...currentAITables,
        [database]: tables
      });
      console.log(`[Database] Saved ${tables.length} tables for AI/MCP in database ${database}:`, tables);
      
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
          errorMessage = "Database query timed out - try again or check your database";
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
      const apiUrl = get(apiUrlAtom);
      const schema = await gigapiClient.getSchema(apiUrl, database, table);
      set(tableSchemaAtom, schema);
      
      // Update autocomplete schema for Monaco Editor
      const currentAutoCompleteSchema = get(autoCompleteSchemaAtom);
      const updatedSchema = {
        ...currentAutoCompleteSchema,
        [database]: currentAutoCompleteSchema[database] || []
      };
      
      // Find or create the table in the schema
      const existingTableIndex = updatedSchema[database].findIndex(
        (t: any) => t.tableName === table
      );
      
      const tableSchema = {
        tableName: table,
        columns: schema.map((col: any) => ({
          columnName: col.column_name || col.name,
          dataType: col.column_type || col.type || 'unknown'
        }))
      };
      
      if (existingTableIndex >= 0) {
        updatedSchema[database][existingTableIndex] = tableSchema;
      } else {
        updatedSchema[database].push(tableSchema);
      }
      
      set(autoCompleteSchemaAtom, updatedSchema);
      console.log(`[Database] Updated autocomplete schema for ${database}.${table}:`, tableSchema);
      
      // Save schema for AI/MCP use
      const currentAISchema = get(schemaForAIAtom);
      const updatedAISchema = {
        ...currentAISchema,
        [database]: {
          ...currentAISchema[database],
          [table]: schema
        }
      };
      set(schemaForAIAtom, updatedAISchema);
      console.log(`[Database] Saved schema for AI/MCP for ${database}.${table}:`, schema);
      
      // Auto-select time field if none selected
      const selectedTimeField = get(selectedTimeFieldAtom);
      if (!selectedTimeField && schema.length > 0) {
        // Find time fields
        const timeFields = schema.filter((col: any) => {
          const colName = (col.column_name || col.name || '').toLowerCase();
          const dataType = (col.column_type || col.type || '').toLowerCase();
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
          const preferredTimeField = timeFields.find((col: any) => 
            (col.column_name || col.name) === "__timestamp"
          ) || timeFields[0];
          
          const timeFieldName = preferredTimeField.column_name || preferredTimeField.name;
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

// Derived atoms
export const hasValidSelectionAtom = atom((get) => {
  const db = get(selectedDbAtom);
  const table = get(selectedTableAtom);
  return Boolean(db && table);
});

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
    const apiUrl = get(apiUrlAtom);
    const tables = await gigapiClient.getTables(apiUrl, currentDb);
    set(availableTablesAtom, tables);

    // If we have a selected table, also load its schema
    const selectedTable = get(selectedTableAtom);
    if (selectedTable && tables.includes(selectedTable)) {
      try {
        const schema = await gigapiClient.getSchema(
          apiUrl,
          currentDb,
          selectedTable
        );
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
        errorMessage = "Database query timed out - try again or check your database";
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
    console.log("[Database] Not connected, skipping initialization");
    return;
  }
  
  const databases = get(availableDatabasesAtom);
  const currentDb = get(selectedDbAtom);

  console.log(`🔥 [Database] Initializing with ${databases.length} databases, current: ${currentDb}`);

  // If no database selected but databases available, select first one
  if (!currentDb && databases.length > 0) {
    console.log(`🔥 [Database] No database selected, selecting first: ${databases[0]}`);
    await set(setSelectedDbAtom, databases[0]);
  } else if (currentDb) {
    // If database is already selected, just load its tables
    // Only load if tables aren't already loaded to prevent duplicate calls
    const currentTables = get(availableTablesAtom);
    if (currentTables.length === 0) {
      console.log(`🔥 [Database] Database ${currentDb} already selected, loading tables`);
      await set(loadTablesForCurrentDbAtom);
    } else {
      console.log(`🔥 [Database] Database ${currentDb} already has ${currentTables.length} tables loaded`);
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
      const tables = await gigapiClient.getTables(apiUrl, database);
      
      // Load schema for each table
      const schemaPromises = tables.map(async (table) => {
        try {
          const tableSchema = await gigapiClient.getSchema(apiUrl, database, table);
          return { table, schema: tableSchema };
        } catch (error) {
          console.error(`Failed to load schema for ${database}.${table}:`, error);
          return { table, schema: [] };
        }
      });
      
      const results = await Promise.all(schemaPromises);
      
      // Build schema object
      const dbSchema: Record<string, any[]> = {};
      results.forEach(({ table, schema }) => {
        dbSchema[table] = schema;
      });
      
      // Update schema atom
      set(schemaAtom, {
        ...currentSchema,
        [database]: dbSchema
      });
      
      console.log(`[Database] Loaded schema for ${tables.length} tables in ${database}`);
    } catch (error) {
      console.error(`Failed to load schema for database ${database}:`, error);
    }
  }
);

// Import connection atoms
import { apiUrlAtom } from "./connection";
import { selectedTimeFieldAtom, setSelectedTimeFieldAtom } from "./time-atoms";
