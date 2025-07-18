/**
 * @deprecated This component has been replaced by UnifiedSchemaSelector.
 * Please use UnifiedSchemaSelector from @/components/shared/UnifiedSchemaSelector instead.
 * 
 * Migration guide:
 * - Use `dataSource="cache"` prop for dashboard context
 * - All other props remain the same
 * 
 * This component uses cached data when available and falls back to API calls only when cache is empty.
 */
import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Database, Table, Clock } from "lucide-react";
import { cn } from "@/lib/utils/class-utils";
import { useDatabaseData } from "@/hooks/useDatabaseData";
import { useDatabaseCache } from "@/hooks/useDatabaseCache";
import type { SelectorType } from "@/components/shared/DbTableTimeSelector";

interface DashboardUnifiedSelectorProps {
  type: SelectorType;
  value?: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  database?: string;
  table?: string;
  label?: string | null;
  showIcon?: boolean;
}

export function DashboardUnifiedSelector({
  type,
  value,
  onChange,
  className,
  disabled = false,
  placeholder,
  database,
  table,
  label,
  showIcon = true,
}: DashboardUnifiedSelectorProps) {
  // Try to use cache first
  const cache = useDatabaseCache();
  
  // Check if we need to fetch data based on cache availability
  const shouldFetchDatabases = type === "database" && cache.databases.length === 0;
  const shouldFetchTables = type === "table" && !!database && !cache.hasTables(database);
  const shouldFetchSchema = type === "timeField" && !!database && !!table && !cache.hasSchema(database, table);
  
  // Fetch data only if not in cache
  const { databases: fetchedDatabases } = useDatabaseData({
    fetchDatabases: shouldFetchDatabases,
    fetchTables: false,
    fetchSchema: false,
  });

  const { tables: fetchedTables } = useDatabaseData({
    fetchDatabases: false,
    fetchTables: shouldFetchTables,
    fetchSchema: false,
    database,
  });

  const { schema: fetchedSchema } = useDatabaseData({
    fetchDatabases: false,
    fetchTables: false,
    fetchSchema: shouldFetchSchema,
    database,
    table,
  });
  
  // Use cached data if available, otherwise use fetched data
  const databases = cache.databases.length > 0 ? cache.databases : fetchedDatabases;
  const tables = cache.hasTables(database || '') ? cache.getTables(database || '') : fetchedTables;
  const schema = cache.hasSchema(database || '', table || '') ? cache.getSchema(database || '', table || '') : fetchedSchema;

  // Get options based on type
  const options = useMemo(() => {
    switch (type) {
      case "database":
        return databases;
      
      case "table":
        return tables;
      
      case "timeField":
        if (!schema || schema.length === 0) return [];
        
        // Find time fields from schema
        return schema
          .filter((col: any) => {
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
          })
          .map((col: any) => col.column_name || col.name)
          .sort((a: string, b: string) => 
            a === "__timestamp" ? -1 : b === "__timestamp" ? 1 : 0
          );
      
      default:
        return [];
    }
  }, [type, databases, tables, schema]);

  // Get icon based on type
  const getIcon = () => {
    switch (type) {
      case "database":
        return <Database className="h-3.5 w-3.5" />;
      case "table":
        return <Table className="h-3.5 w-3.5" />;
      case "timeField":
        return <Clock className="h-3.5 w-3.5" />;
      default:
        return null;
    }
  };

  // Get default placeholder
  const getDefaultPlaceholder = () => {
    switch (type) {
      case "database":
        return "Select database";
      case "table":
        return database ? "Select table" : "Select database first";
      case "timeField":
        return table ? "Select time field" : "Select table first";
      default:
        return "Select...";
    }
  };

  // Get default label
  const getDefaultLabel = () => {
    switch (type) {
      case "database":
        return "Database";
      case "table":
        return "Table";
      case "timeField":
        return "Time Field";
      default:
        return "";
    }
  };

  const displayLabel = label === null ? null : label || getDefaultLabel();
  const displayPlaceholder = placeholder || getDefaultPlaceholder();

  return (
    <div className="flex items-center gap-2">
      {displayLabel && (
        <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          {displayLabel}:
        </label>
      )}
      <Select
        value={value || ""}
        onValueChange={onChange}
        disabled={disabled || (type === "table" && !database) || (type === "timeField" && !table)}
      >
        <SelectTrigger className={cn("w-[200px]", className)}>
          <div className="flex items-center gap-2">
            {showIcon && getIcon()}
            <SelectValue placeholder={displayPlaceholder} />
          </div>
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 ? (
            <div className="text-sm text-muted-foreground p-2 text-center">
              {type === "table" && !database
                ? "Select a database first"
                : type === "timeField" && !table
                ? "Select a table first"
                : "No items available"}
            </div>
          ) : (
            <>
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}