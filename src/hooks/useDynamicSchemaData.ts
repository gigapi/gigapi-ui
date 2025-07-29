import { useAtom, useSetAtom } from "jotai";
import { useEffect, useMemo } from "react";
import {
  freshDatabasesAtom,
  freshDatabasesLoadingAtom,
  fetchFreshDatabasesAtom,
  freshTablesAtom,
  freshTablesLoadingAtom,
  fetchFreshTablesAtom,
  freshSchemaAtom,
  freshSchemaLoadingAtom,
  fetchFreshSchemaAtom,
} from "@/atoms";
import { detectTimeFieldsFromSchema } from "@/lib/query-processor";
import type { TimeFieldInfo, SchemaDataResult } from "./useSchemaData";

interface UseDynamicSchemaDataOptions {
  database?: string;
  table?: string;
}

/**
 * Hook for accessing fresh database schema data without caching
 * Always fetches latest data from API for real-time collaboration
 */
export function useDynamicSchemaData({
  database,
  table,
}: UseDynamicSchemaDataOptions = {}): SchemaDataResult {
  // Fresh data atoms
  const [databases] = useAtom(freshDatabasesAtom);
  const [databasesLoading] = useAtom(freshDatabasesLoadingAtom);
  const fetchDatabases = useSetAtom(fetchFreshDatabasesAtom);
  
  const [tables] = useAtom(freshTablesAtom);
  const [tablesLoading] = useAtom(freshTablesLoadingAtom);
  const fetchTables = useSetAtom(fetchFreshTablesAtom);
  
  const [schema] = useAtom(freshSchemaAtom);
  const [schemaLoading] = useAtom(freshSchemaLoadingAtom);
  const fetchSchema = useSetAtom(fetchFreshSchemaAtom);

  // Fetch databases on mount and when needed
  useEffect(() => {
    fetchDatabases();
  }, [fetchDatabases]);

  // Fetch tables when database changes
  useEffect(() => {
    if (database) {
      fetchTables(database);
    }
  }, [database, fetchTables]);

  // Fetch schema when table changes
  useEffect(() => {
    if (database && table) {
      fetchSchema({ database, table });
    }
  }, [database, table, fetchSchema]);

  // Extract time fields from schema
  const timeFields = useMemo((): TimeFieldInfo[] => {
    const fields: TimeFieldInfo[] = [];
    
    if (schema && Array.isArray(schema)) {
      schema.forEach((col: any) => {
        const columnName = col.column_name || col.columnName || col.name;
        const columnType = col.column_type || col.dataType || col.type;
        const timeUnit = col.timeUnit;

        if (!columnName || typeof columnName !== "string") return;

        // Check if it's a time field
        if (
          columnName.toLowerCase().includes("time") ||
          columnName.toLowerCase().includes("date") ||
          columnName.toLowerCase().includes("timestamp") ||
          columnName === "__timestamp" ||
          columnType?.toLowerCase().includes("timestamp") ||
          columnType?.toLowerCase().includes("datetime")
        ) {
          fields.push({
            name: columnName,
            timeUnit,
          });
        }
      });
    }

    // Sort time fields to prioritize __timestamp
    fields.sort((a, b) =>
      a.name === "__timestamp" ? -1 : b.name === "__timestamp" ? 1 : 0
    );

    return fields;
  }, [schema]);

  // Compute loading and error states
  const isLoading = databasesLoading || tablesLoading || schemaLoading;
  const error = null; // Could add error handling if needed

  return {
    databases,
    tables,
    timeFields,
    isLoading,
    error,
    // Manual refetch functions
    refetchDatabases: () => fetchDatabases(),
    refetchTables: () => database ? fetchTables(database) : Promise.resolve(),
    refetchSchema: () => database && table ? fetchSchema({ database, table }) : Promise.resolve(),
  };
}