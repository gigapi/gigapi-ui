import { useAtom } from "jotai";
import { useMemo } from "react";
import {
  availableDatabasesAtom,
  availableTablesAtom,
  tableSchemaAtom,
  schemaAtom,
} from "@/atoms";
import { useDatabaseCache } from "./useDatabaseCache";
import { useDatabaseData } from "./useDatabaseData";
import { detectTimeFieldsFromSchema } from "@/lib/query-processor";
import type { ColumnSchema } from "@/types";

export type DataSource = "atoms" | "cache";

export interface TimeFieldInfo {
  name: string;
  timeUnit?: string;
}

export interface SchemaDataResult {
  databases: string[];
  tables: string[];
  timeFields: TimeFieldInfo[];
  isLoading: boolean;
  error: string | null;
}

interface UseSchemaDataOptions {
  dataSource?: DataSource;
  database?: string;
  table?: string;
  // For artifact/schema override contexts
  schemaOverride?: Record<string, any>;
}

/**
 * Unified hook for accessing database schema data
 * Supports both atom-based (query context) and cache-based (dashboard context) data access
 */
export function useSchemaData({
  dataSource = "atoms",
  database,
  table,
  schemaOverride,
}: UseSchemaDataOptions = {}): SchemaDataResult {
  // Atom-based data access (for query context)
  const [availableDatabases] = useAtom(availableDatabasesAtom);
  const [availableTables] = useAtom(availableTablesAtom);
  const [tableSchema] = useAtom(tableSchemaAtom);
  const [schema] = useAtom(schemaAtom);

  // Cache-based data access (for dashboard context)
  const cache = useDatabaseCache();

  // Determine if we need to fetch data from API
  const shouldFetchDatabases =
    dataSource === "cache" && cache.databases.length === 0;
  const shouldFetchTables =
    dataSource === "cache" && !!database && !cache.hasTables(database);
  const shouldFetchSchema =
    dataSource === "cache" &&
    !!database &&
    !!table &&
    !cache.hasSchema(database, table);

  // Fetch data only if using cache and not available
  const { databases: fetchedDatabases, loading: dbLoading, error: dbError } = useDatabaseData({
    fetchDatabases: shouldFetchDatabases,
    fetchTables: false,
    fetchSchema: false,
  });

  const { tables: fetchedTables, loading: tablesLoading, error: tablesError } = useDatabaseData({
    fetchDatabases: false,
    fetchTables: shouldFetchTables,
    fetchSchema: false,
    database,
  });

  const { schema: fetchedSchema, loading: schemaLoading, error: schemaError } = useDatabaseData({
    fetchDatabases: false,
    fetchTables: false,
    fetchSchema: shouldFetchSchema,
    database,
    table,
  });

  // Compute final data based on data source
  const { databases, tables, timeFields } = useMemo(() => {
    let finalDatabases: string[] = [];
    let finalTables: string[] = [];
    let finalTimeFields: TimeFieldInfo[] = [];

    // Handle schema override (for artifact context)
    if (schemaOverride) {
      finalDatabases = Object.keys(schemaOverride);
      
      if (database && schemaOverride[database]) {
        const dbData = schemaOverride[database];
        finalTables = Array.isArray(dbData)
          ? dbData
              .map((t: any) => (typeof t === "string" ? t : t.tableName))
              .filter(Boolean)
          : [];

        if (table) {
          const tableData = Array.isArray(dbData)
            ? dbData.find((t: any) => t.tableName === table)
            : null;

          if (tableData?.columns) {
            // Extract time fields with metadata
            tableData.columns.forEach((col: ColumnSchema) => {
              if (!col.columnName) return;

              const lowerName = col.columnName.toLowerCase();
              if (
                lowerName.includes("time") ||
                lowerName.includes("date") ||
                lowerName.includes("timestamp") ||
                col.columnName === "__timestamp"
              ) {
                finalTimeFields.push({
                  name: col.columnName,
                  timeUnit: col.timeUnit,
                });
              }
            });
          }
        }
      }
    } else if (dataSource === "atoms") {
      // Use atom-based data
      finalDatabases = availableDatabases || [];
      finalTables = availableTables || [];

      // Get time fields from table schema
      if (tableSchema && Array.isArray(tableSchema)) {
        tableSchema.forEach((col: any) => {
          const columnName = col.column_name || col.columnName;
          const columnType = col.column_type || col.dataType;
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
            finalTimeFields.push({
              name: columnName,
              timeUnit,
            });
          }
        });
      }
    } else {
      // Use cache-based data
      finalDatabases = cache.databases.length > 0 ? cache.databases : fetchedDatabases;
      finalTables = cache.hasTables(database || "") 
        ? cache.getTables(database || "") 
        : fetchedTables;

      // Get schema from cache or fetched data
      const schemaData = cache.hasSchema(database || "", table || "")
        ? cache.getSchema(database || "", table || "")
        : fetchedSchema;

      if (schemaData && Array.isArray(schemaData)) {
        schemaData.forEach((col: any) => {
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
            finalTimeFields.push({
              name: columnName,
              timeUnit,
            });
          }
        });
      }
    }

    // Sort time fields to prioritize __timestamp
    finalTimeFields.sort((a, b) =>
      a.name === "__timestamp" ? -1 : b.name === "__timestamp" ? 1 : 0
    );

    return {
      databases: finalDatabases,
      tables: finalTables,
      timeFields: finalTimeFields,
    };
  }, [
    dataSource,
    database,
    table,
    schemaOverride,
    availableDatabases,
    availableTables,
    tableSchema,
    schema,
    cache,
    fetchedDatabases,
    fetchedTables,
    fetchedSchema,
  ]);

  // Compute loading and error states
  const isLoading = dataSource === "cache" ? (dbLoading || tablesLoading || schemaLoading) : false;
  const error = dataSource === "cache" 
    ? (dbError || tablesError || schemaError) 
    : null;

  return {
    databases,
    tables,
    timeFields,
    isLoading,
    error,
  };
}