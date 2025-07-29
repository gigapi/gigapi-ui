export interface ColumnSchema {
  columnName: string;
  dataType: string;
  timeUnit?: TimeUnit;
  nullable?: boolean;
  defaultValue?: string;
}

export interface TableSchema {
  tableName: string;
  columns: ColumnSchema[];
  rowCount?: number;
}

export type SchemaInfo = Record<string, TableSchema[]>;

// ============================================================================
// Time and Date Types
// ============================================================================

export type TimeUnit = "s" | "ms" | "us" | "ns";

// ============================================================================
// Tab Types
// ============================================================================

export * from "./tab.types";
