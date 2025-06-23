import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useConnection } from "@/contexts/ConnectionContext";
import type { Database, SchemaInfo, TableSchema, ColumnSchema } from "@/types";
import { toast } from "sonner";

interface DashboardDatabaseState {
  databases: Database[];
  selectedDb: string | null;
  selectedTable: string | null;
  schema: SchemaInfo;
  tableSchema: TableSchema | null;
  loading: boolean;
  error: string | null;
}

interface DashboardDatabaseContextType extends DashboardDatabaseState {
  setSelectedDb: (db: string | null) => void;
  setSelectedTable: (table: string | null) => void;
  loadDatabases: () => Promise<void>;
  loadTableSchema: (db: string, table: string) => Promise<void>;
  loadTablesForDatabase: (db: string) => Promise<void>;
  reset: () => void;
}

const DashboardDatabaseContext = createContext<DashboardDatabaseContextType | null>(null);

export function useDashboardDatabase() {
  const context = useContext(DashboardDatabaseContext);
  if (!context) {
    throw new Error("useDashboardDatabase must be used within a DashboardDatabaseProvider");
  }
  return context;
}

interface DashboardDatabaseProviderProps {
  children: ReactNode;
}

export function DashboardDatabaseProvider({ children }: DashboardDatabaseProviderProps) {
  const { apiUrl } = useConnection();
  
  const [state, setState] = useState<DashboardDatabaseState>({
    databases: [],
    selectedDb: null,
    selectedTable: null,
    schema: {},
    tableSchema: null,
    loading: false,
    error: null,
  });

  const reset = useCallback(() => {
    setState({
      databases: [],
      selectedDb: null,
      selectedTable: null,
      schema: {},
      tableSchema: null,
      loading: false,
      error: null,
    });
  }, []);

  const loadDatabases = useCallback(async () => {
    if (!apiUrl) return;

    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      // Use the same pattern as DatabaseContext - send "SHOW DATABASES" query
      const response = await fetch(`${apiUrl}?format=ndjson`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: "SHOW DATABASES" })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to load databases: ${response.statusText}`);
      }
      
      const textData = await response.text();
      const lines = textData.split('\n').filter(line => line.trim());
      const databases: Database[] = [];
      
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const dbObj = JSON.parse(line);
          const dbName = dbObj.database_name || dbObj.Database || Object.values(dbObj)[0];
          if (dbName) {
            databases.push({ database_name: dbName });
          }
        } catch (e) {
          console.warn('Failed to parse database line:', line, e);
        }
      }
      
      setState(prev => ({
        ...prev,
        databases,
        loading: false,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to load databases";
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
      }));
      toast.error(errorMessage);
    }
  }, [apiUrl]);

  // Load tables for a database without specifying a specific table
  const loadTablesForDatabase = useCallback(async (db: string) => {
    if (!apiUrl) return;

    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const tablesResponse = await fetch(`${apiUrl}?db=${encodeURIComponent(db)}&format=ndjson`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: "SHOW TABLES" })
      });
      
      if (!tablesResponse.ok) {
        throw new Error(`Failed to load tables: ${tablesResponse.statusText}`);
      }
      
      const tablesTextData = await tablesResponse.text();
      const tablesLines = tablesTextData.split('\n').filter(line => line.trim());
      const tables: TableSchema[] = [];
      
      // Parse table names
      for (const line of tablesLines) {
        if (!line.trim()) continue;
        try {
          const tableObj = JSON.parse(line);
          const tableName = tableObj.table_name || tableObj.Table || Object.values(tableObj)[0];
          if (tableName) {
            tables.push({ tableName, columns: [] });
          }
        } catch (e) {
          console.warn('Failed to parse table line:', line, e);
        }
      }
      
      setState(prev => ({
        ...prev,
        schema: { ...prev.schema, [db]: tables },
        loading: false,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to load tables";
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
      }));
      toast.error(errorMessage);
    }
  }, [apiUrl]);

  const loadTableSchema = useCallback(async (db: string, table: string) => {
    if (!apiUrl) return;

    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      // Now get column schema for the specific table using DESCRIBE
      if (table) {
        try {
          const columnsResponse = await fetch(`${apiUrl}?db=${encodeURIComponent(db)}&format=ndjson`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: `DESCRIBE SELECT * FROM ${table} LIMIT 1` })
          });
          
          if (columnsResponse.ok) {
            const columnsTextData = await columnsResponse.text();
            const columnsLines = columnsTextData.split('\n').filter(line => line.trim());
            const columns: ColumnSchema[] = [];
            
            for (const line of columnsLines) {
              if (!line.trim()) continue;
              try {
                const colObj = JSON.parse(line);
                const columnName = colObj.Field || colObj.column_name || colObj.name || Object.values(colObj)[0];
                const dataType = colObj.Type || colObj.data_type || colObj.type || Object.values(colObj)[1] || 'unknown';
                
                if (columnName) {
                  columns.push({ columnName, dataType });
                }
              } catch (e) {
                console.warn('Failed to parse column line:', line, e);
              }
            }
            
            // Update the specific table schema
            const tableSchema = { tableName: table, columns };
            
            setState(prev => ({
              ...prev,
              tableSchema,
              loading: false,
            }));
          } else {
            // If describe fails, still mark as not loading
            setState(prev => ({
              ...prev,
              tableSchema: { tableName: table, columns: [] },
              loading: false,
            }));
          }
        } catch (error) {
          console.warn(`Failed to describe table ${table}:`, error);
          // Still add the table with empty columns
          setState(prev => ({
            ...prev,
            tableSchema: { tableName: table, columns: [] },
            loading: false,
          }));
        }
      } else {
        // If no specific table requested, just finish loading
        setState(prev => ({
          ...prev,
          loading: false,
        }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to load table schema";
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
      }));
      toast.error(errorMessage);
    }
  }, [apiUrl]);

  const setSelectedDb = useCallback((db: string | null) => {
    setState(prev => ({
      ...prev,
      selectedDb: db,
      selectedTable: null, // Reset table when changing database
      tableSchema: null,
    }));
    
    // Load tables for the new database if not already loaded
    if (db && apiUrl) {
      loadTablesForDatabase(db);
    }
  }, [apiUrl, loadTablesForDatabase]);

  const setSelectedTable = useCallback((table: string | null) => {
    setState(prev => ({
      ...prev,
      selectedTable: table,
      tableSchema: null,
    }));
    
    // Load schema for the new table
    if (table && state.selectedDb && apiUrl) {
      loadTableSchema(state.selectedDb, table);
    }
  }, [state.selectedDb, apiUrl, loadTableSchema]);

  // Load databases when apiUrl is available - but only once
  useEffect(() => {
    if (apiUrl && state.databases.length === 0 && !state.loading) {
      loadDatabases();
    }
  }, [apiUrl]); // Remove loadDatabases from deps to prevent infinite loop

  const value: DashboardDatabaseContextType = {
    ...state,
    setSelectedDb,
    setSelectedTable,
    loadDatabases,
    loadTableSchema,
    loadTablesForDatabase,
    reset,
  };

  return (
    <DashboardDatabaseContext.Provider value={value}>
      {children}
    </DashboardDatabaseContext.Provider>
  );
}
