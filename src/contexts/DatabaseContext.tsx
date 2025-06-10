import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useReducer,
  type ReactNode,
} from "react";
import axios from "axios";
import { toast } from "sonner";
import type {
  SchemaInfo,
  TableSchema,
  ColumnSchema,
  DatabaseState,
  DatabaseAction,
} from "@/types";
import { safeLocalStorage, STORAGE_KEYS } from "@/lib/";
import { useConnection } from "./ConnectionContext";

const initialDatabaseState: DatabaseState = {
  selectedDb: "",
  selectedTable: null,
  availableTables: [],
  schema: {},
  isLoadingSchema: false,
};

function databaseReducer(
  state: DatabaseState,
  action: DatabaseAction
): DatabaseState {
  switch (action.type) {
    case "SET_SELECTED_DB":
      return {
        ...state,
        selectedDb: action.payload,
        selectedTable: null,
        availableTables: [],
      };
    case "SET_SELECTED_TABLE":
      return { ...state, selectedTable: action.payload };
    case "SET_AVAILABLE_TABLES":
      return { ...state, availableTables: action.payload };
    case "SET_SCHEMA":
      return {
        ...state,
        schema: { ...state.schema, [action.payload.db]: action.payload.schema },
      };
    case "SET_LOADING_SCHEMA":
      return { ...state, isLoadingSchema: action.payload };
    case "RESET_STATE":
      return { ...initialDatabaseState };
    default:
      return state;
  }
}

interface DatabaseContextType {
  // Database management
  selectedDb: string;
  setSelectedDb: (db: string) => void;
  availableDatabases: string[];

  // Table management
  selectedTable: string | null;
  setSelectedTable: (table: string | null) => void;
  availableTables: string[];

  // Schema management
  schema: SchemaInfo;
  isLoadingSchema: boolean;
  loadSchemaForDb: (dbName: string) => Promise<void>;
  getColumnsForTable: (tableName: string) => ColumnSchema[] | null;

  // Utilities
  refreshSchema: () => Promise<void>;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(
  undefined
);

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const { databases, apiUrl, isConnected } = useConnection();
  const [state, dispatch] = useReducer(databaseReducer, initialDatabaseState);

  // Reset state when API URL changes
  useEffect(() => {
    dispatch({ type: "RESET_STATE" });
  }, [apiUrl]);

  // Get available database names - simple derivation, no memo needed
  const availableDatabases = databases.map((db) => db.database_name);

  // Parse column schema helper
  const parseColumnSchema = useCallback(
    (responseData: string): ColumnSchema[] => {
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

        // Infer time unit for numeric columns THIS NEEDS TO BE REVIEWD SINCE WE ARE MAKING ASSUMPTIONS AND IT CAN BREAK
        if (
          lowerDataType.includes("bigint") ||
          lowerDataType.includes("long") ||
          lowerDataType.includes("int")
        ) {
          if (lowerColName.endsWith("_ns")) timeUnit = "ns";
          else if (lowerColName.endsWith("_us")) timeUnit = "us";
          else if (
            lowerColName.endsWith("_ms") ||
            lowerColName.includes("milli")
          )
            timeUnit = "ms";
          else if (lowerColName.endsWith("_s") || lowerColName.includes("sec"))
            timeUnit = "s";
          else if (lowerColName === "__timestamp") timeUnit = "ns";
          else if (
            lowerColName === "created_at" ||
            lowerColName === "create_date"
          )
            timeUnit = "ms";
          else if (
            lowerColName.includes("time") ||
            lowerColName.includes("date")
          )
            timeUnit = "ns";
        }

        columns.push({ columnName, dataType, timeUnit });
      });

      return columns;
    },
    []
  );

  // Get columns for a specific table
  const getColumnsForTable = useCallback(
    (tableName: string): ColumnSchema[] | null => {
      if (!state.selectedDb || !state.schema[state.selectedDb]) return null;

      const tableSchema = state.schema[state.selectedDb].find(
        (table) => table.tableName === tableName
      );
      return tableSchema?.columns || null;
    },
    [state.selectedDb, state.schema]
  );

  // Load schema for a database
  const loadSchemaForDb = useCallback(
    async (dbName: string) => {
      if (!dbName || !isConnected) return;

      // Return early if schema already exists
      if (state.schema[dbName]?.length > 0) {
        const tables = state.schema[dbName].map((table) => table.tableName);
        dispatch({ type: "SET_AVAILABLE_TABLES", payload: tables });
        return;
      }

      dispatch({ type: "SET_LOADING_SCHEMA", payload: true });

      try {
        // Fetch table list
        const tablesResponse = await axios.post(
          `${apiUrl}?db=${encodeURIComponent(dbName)}&format=ndjson`,
          { query: "SHOW TABLES" },
          { responseType: "text", timeout: 8000 }
        );

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

        const tableNames = tableObjects
          .map((table: any) => table.table_name || Object.values(table)[0])
          .filter(Boolean) as string[];

        dispatch({ type: "SET_AVAILABLE_TABLES", payload: tableNames });

        if (tableNames.length === 0) return;

        // Load column schemas for each table
        const dbSchema: TableSchema[] = [];
        const tablePromises = tableNames.map(async (tableName) => {
          try {
            const columnsResponse = await axios.post(
              `${apiUrl}?db=${encodeURIComponent(dbName)}&format=ndjson`,
              { query: `DESCRIBE SELECT * FROM ${tableName} LIMIT 1` },
              { timeout: 5000, responseType: "text" }
            );

            const columns = parseColumnSchema(columnsResponse.data);
            return { tableName, columns };
          } catch (err) {
            console.warn(`Failed to describe table ${tableName}:`, err);
            return { tableName, columns: [] };
          }
        });

        const tableResults = await Promise.allSettled(tablePromises);

        tableResults.forEach((result) => {
          if (result.status === "fulfilled") {
            dbSchema.push(result.value);
          }
        });

        dispatch({
          type: "SET_SCHEMA",
          payload: { db: dbName, schema: dbSchema },
        });
      } catch (err: any) {
        console.error(`Failed to load schema for ${dbName}:`, err);
        toast.error(`Schema load failed: ${err.message}`);
      } finally {
        dispatch({ type: "SET_LOADING_SCHEMA", payload: false });
      }
    },
    [apiUrl, isConnected, parseColumnSchema, state.schema]
  );

  // Database selection with validation
  const setSelectedDb = useCallback(
    (dbName: string) => {
      // Allow setting any database name if no databases are available yet
      if (!availableDatabases.length && dbName) {
        dispatch({ type: "SET_SELECTED_DB", payload: dbName });
        return;
      }

      if (dbName && availableDatabases.includes(dbName)) {
        if (state.selectedDb !== dbName) {
          dispatch({ type: "SET_SELECTED_DB", payload: dbName });
        }
      } else if (dbName) {
        toast.warning(`Database "${dbName}" not available.`);
        if (state.selectedDb !== "") {
          dispatch({ type: "SET_SELECTED_DB", payload: "" });
        }
      }
    },
    [availableDatabases, state.selectedDb]
  );

  // Table selection with validation
  const setSelectedTable = useCallback(
    (tableName: string | null) => {
      if (tableName === null) {
        if (state.selectedTable !== null) {
          dispatch({ type: "SET_SELECTED_TABLE", payload: null });
        }
        return;
      }

      // Allow setting any table name if no tables are available yet
      if (state.availableTables.length === 0 && tableName) {
        dispatch({ type: "SET_SELECTED_TABLE", payload: tableName });
        return;
      }

      if (tableName && state.availableTables.includes(tableName)) {
        if (state.selectedTable !== tableName) {
          dispatch({ type: "SET_SELECTED_TABLE", payload: tableName });
        }
      } else if (tableName) {
        toast.warning(`Table "${tableName}" not available.`);
        if (state.selectedTable !== null) {
          dispatch({ type: "SET_SELECTED_TABLE", payload: null });
        }
      }
    },
    [state.availableTables, state.selectedTable]
  );

  // Refresh current database schema
  const refreshSchema = useCallback(async () => {
    if (!state.selectedDb) return;

    // Clear existing schema for this database
    dispatch({
      type: "SET_SCHEMA",
      payload: { db: state.selectedDb, schema: [] },
    });

    await loadSchemaForDb(state.selectedDb);
  }, [state.selectedDb, loadSchemaForDb]);

  // Handle database initialization and persistence
  useEffect(() => {
    const savedDb = safeLocalStorage.getItem(STORAGE_KEYS.SELECTED_DB);

    if (
      savedDb &&
      availableDatabases.includes(savedDb) &&
      state.selectedDb !== savedDb
    ) {
      setSelectedDb(savedDb);
    } else if (availableDatabases.length > 0 && !state.selectedDb) {
      // Auto-select first available database
      setSelectedDb(availableDatabases[0]);
    }
  }, [availableDatabases, state.selectedDb, setSelectedDb]);

  // Load schema when database is selected
  useEffect(() => {
    if (state.selectedDb) {
      safeLocalStorage.setItem(STORAGE_KEYS.SELECTED_DB, state.selectedDb);
      loadSchemaForDb(state.selectedDb).catch(console.error);
    }
  }, [state.selectedDb, loadSchemaForDb]);

  // Persist table selection
  useEffect(() => {
    if (state.selectedTable) {
      safeLocalStorage.setItem(
        STORAGE_KEYS.SELECTED_TABLE,
        state.selectedTable
      );
    } else {
      safeLocalStorage.removeItem(STORAGE_KEYS.SELECTED_TABLE);
    }
  }, [state.selectedTable]);

  // Context value - no memoization needed, React already optimizes context updates
  const contextValue: DatabaseContextType = {
    selectedDb: state.selectedDb,
    setSelectedDb,
    availableDatabases,
    selectedTable: state.selectedTable,
    setSelectedTable,
    availableTables: state.availableTables,
    schema: state.schema,
    isLoadingSchema: state.isLoadingSchema,
    loadSchemaForDb,
    getColumnsForTable,
    refreshSchema,
  };

  return (
    <DatabaseContext.Provider value={contextValue}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (context === undefined) {
    throw new Error("useDatabase must be used within a DatabaseProvider");
  }
  return context;
}
