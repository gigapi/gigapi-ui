/**
 * Dashboard-specific UnifiedSelector that fetches its own data
 * Independent from the main query interface state
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
  // Fetch data based on selector type
  const { databases } = useDatabaseData({
    fetchDatabases: type === "database",
    fetchTables: false,
    fetchSchema: false,
  });

  const { tables } = useDatabaseData({
    fetchDatabases: false,
    fetchTables: type === "table" && !!database,
    fetchSchema: false,
    database,
  });

  const { schema } = useDatabaseData({
    fetchDatabases: false,
    fetchTables: false,
    fetchSchema: type === "timeField" && !!database && !!table,
    database,
    table,
  });

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
          .map((col: any) => col.column_name || col.name);
      
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