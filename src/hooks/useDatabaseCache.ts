import { useAtomValue } from "jotai";
import { 
  schemaCacheAtom,
  getCachedTablesAtom,
  getCachedSchemaAtom,
  isCacheValidAtom
} from "@/atoms/database-atoms";
import { availableDatabasesAtom } from "@/atoms/connection-atoms";

/**
 * Hook to access database cache information
 * Provides a unified interface to access cached database, table, and schema data
 */
export function useDatabaseCache() {
  const schemaCache = useAtomValue(schemaCacheAtom);
  const getCachedTables = useAtomValue(getCachedTablesAtom);
  const getCachedSchema = useAtomValue(getCachedSchemaAtom);
  const availableDatabases = useAtomValue(availableDatabasesAtom);
  const isCacheValid = useAtomValue(isCacheValidAtom);

  return {
    // Direct cache access
    schemaCache,
    isCacheValid,
    
    // Databases - always available from connection state
    databases: availableDatabases,
    
    // Helper functions
    getTables: (database: string) => getCachedTables(database),
    getSchema: (database: string, table: string) => getCachedSchema(database, table),
    
    // Check if data exists in cache
    hasDatabase: (database: string) => availableDatabases.includes(database),
    hasTables: (database: string) => getCachedTables(database).length > 0,
    hasSchema: (database: string, table: string) => getCachedSchema(database, table) !== null
  };
}