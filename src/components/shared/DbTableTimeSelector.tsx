import { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  Table,
  Clock,
  Search,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils/class-utils";
import { useAtom } from "jotai";
import {
  availableDatabasesAtom,
  availableTablesAtom,
  schemaAtom,
  tableSchemaAtom,
} from "@/atoms";
import { SchemaAnalyzer } from "@/lib/dashboard/schema-analyzer";
import type { TableSchema, ColumnSchema } from "@/types";

// Types for the unified selector
export type SelectorType = "database" | "table" | "timeField";
export type SelectorContext = "query" | "dashboard" | "artifact";
export type SelectorStyle = "select" | "popover";

interface UnifiedSelectorProps {
  type: SelectorType;
  context: SelectorContext;
  style?: SelectorStyle;
  value?: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  // For table selector
  database?: string;
  // For time field selector
  table?: string;
  // Optional schema override (for artifact context)
  schemaOverride?: Record<string, TableSchema[]>;
  // Optional label (null = no label, undefined = default label, string = custom label)
  label?: string | null;
  // Show icon in trigger
  showIcon?: boolean;
}

export function UnifiedSelector({
  type,
  style = "select",
  value,
  onChange,
  className,
  disabled = false,
  placeholder,
  database,
  table,
  schemaOverride,
  label,
  showIcon = true,
}: UnifiedSelectorProps) {
  const [availableDatabases] = useAtom(availableDatabasesAtom);
  const [availableTables] = useAtom(availableTablesAtom);
  const [schema] = useAtom(schemaAtom);
  const [tableSchema] = useAtom(tableSchemaAtom);
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // Get the appropriate data based on selector type
  const { options, timeFieldsMetadata } = useMemo(() => {
    const metadata: Record<string, { timeUnit?: string }> = {};
    let optionsList: string[] = [];
    
    switch (type) {
      case "database":
        optionsList = availableDatabases || [];
        break;

      case "table":
        if (!database) {
          optionsList = [];
          break;
        }

        // For artifact context, use schema override
        if (schemaOverride?.[database]) {
          const dbTables = schemaOverride[database];
          optionsList = Array.isArray(dbTables)
            ? dbTables
                .map((t) => (typeof t === "string" ? t : t.tableName))
                .filter(Boolean)
            : [];
        } else {
          // For query context, use availableTables directly (it's already loaded for the selected database)
          optionsList = availableTables || [];
        }
        break;

      case "timeField":
        if (!database || !table) {
          optionsList = [];
          break;
        }

        // For artifact context with schema override
        if (schemaOverride?.[database]) {
          const dbSchema = schemaOverride[database];
          const tableSchemaOverride = dbSchema.find(
            (t) => t.tableName === table
          );
          if (!tableSchemaOverride?.columns) {
            optionsList = [];
            break;
          }

          const timeFields: string[] = [];
          
          tableSchemaOverride.columns.forEach((column: ColumnSchema) => {
            if (!column.columnName) return;

            const fieldType = SchemaAnalyzer.analyzeFieldType(
              column.columnName,
              null,
              column.dataType
            );

            if (
              fieldType.semantic === "timestamp" ||
              fieldType.format?.includes("Time") ||
              column.columnName.toLowerCase().includes("time") ||
              column.columnName.toLowerCase().includes("date") ||
              column.columnName.toLowerCase().includes("timestamp") ||
              column.columnName === "__timestamp"
            ) {
              timeFields.push(column.columnName);
              if (column.timeUnit) {
                metadata[column.columnName] = { timeUnit: column.timeUnit };
              }
            }
          });

          optionsList = timeFields.sort((a, b) =>
            a === "__timestamp" ? -1 : b === "__timestamp" ? 1 : 0
          );
          break;
        }

        // For query context, use tableSchema atom (from DESCRIBE query)
        if (!tableSchema || !Array.isArray(tableSchema)) {
          optionsList = [];
          break;
        }

        interface TimeFieldInfo {
          name: string;
          timeUnit?: string;
        }
        
        const timeFields: TimeFieldInfo[] = [];
        
        tableSchema.forEach((column: any) => {
          // Handle the API response format: {"column_name":"method","column_type":"VARCHAR",...}
          const columnName = column.column_name || column.columnName;
          const columnType = column.column_type || column.dataType;
          const timeUnit = column.timeUnit;

          if (!columnName || typeof columnName !== "string") return;

          // Simple time field detection based on your API response
          if (
            columnName.toLowerCase().includes("time") ||
            columnName.toLowerCase().includes("date") ||
            columnName.toLowerCase().includes("timestamp") ||
            columnName === "__timestamp" ||
            columnType?.toLowerCase().includes("timestamp") ||
            columnType?.toLowerCase().includes("datetime")
          ) {
            timeFields.push({ name: columnName, timeUnit });
            if (timeUnit) {
              metadata[columnName] = { timeUnit };
            }
          }
        });

        // Prioritize __timestamp if it exists
        optionsList = timeFields
          .sort((a, b) =>
            a.name === "__timestamp" ? -1 : b.name === "__timestamp" ? 1 : 0
          )
          .map(field => field.name);
        break;

      default:
        optionsList = [];
    }
    
    return { options: optionsList, timeFieldsMetadata: metadata };
  }, [
    type,
    availableDatabases,
    availableTables,
    schema,
    database,
    table,
    schemaOverride,
    tableSchema,
  ]);

  // Filter options based on search term
  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    return options.filter((option) =>
      option.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [options, searchTerm]);

  // Get icon based on selector type
  const getIcon = () => {
    switch (type) {
      case "database":
        return <Database className="w-4 h-4" />;
      case "table":
        return <Table className="w-4 h-4" />;
      case "timeField":
        return <Clock className="w-4 h-4" />;
    }
  };

  // Get placeholder based on type and context
  const getPlaceholder = () => {
    // Always prioritize custom placeholder if provided
    if (placeholder) return placeholder;

    switch (type) {
      case "database":
        return "Select database";
      case "table":
        return database ? "Select table" : "Select database first";
      case "timeField":
        if (!table) return "Select table first";
        return "Select time field";
    }
  };

  // Get label based on type
  const getLabel = () => {
    if (label) return label;

    switch (type) {
      case "database":
        return "Database";
      case "table":
        return "Table";
      case "timeField":
        return "Time Field";
    }
  };

  // Handle selection
  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue);
    setIsOpen(false);
    setSearchTerm("");
  };

  // Render select style
  if (style === "select") {
    return (
      <div className={cn("space-y-1.5", className)}>
        {label !== null && (
          <label className="text-sm font-medium text-muted-foreground">
            {getLabel()}
          </label>
        )}
        <Select
          value={value}
          onValueChange={onChange}
          disabled={
            disabled ||
            (type === "table" && !database) ||
            (type === "timeField" && !table)
          }
        >
          <SelectTrigger
            className={cn("w-full", !value && "text-muted-foreground")}
          >
            <div className="flex items-center gap-2">
              {showIcon && getIcon()}
              <SelectValue placeholder={getPlaceholder()} />
            </div>
          </SelectTrigger>
          <SelectContent>
            {filteredOptions.length === 0 ? (
              <div className="py-2 px-3 text-sm text-muted-foreground text-center">
                {type === "table" && !database
                  ? "Select a database first"
                  : type === "timeField" && !table
                  ? "Select a table first"
                  : type === "timeField"
                  ? "No time fields found"
                  : "No options available"}
              </div>
            ) : (
              filteredOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  <div className="flex items-center justify-between w-full">
                    <span>{option}</span>
                    {type === "timeField" && timeFieldsMetadata[option]?.timeUnit && (
                      <span className="text-xs text-muted-foreground ml-2">
                        ({timeFieldsMetadata[option].timeUnit})
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // Render popover style (with search)
  return (
    <div className={cn("space-y-1.5", className)}>
      {label !== null && (
        <label className="text-sm font-medium text-muted-foreground">
          {getLabel()}
        </label>
      )}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={isOpen}
            className={cn(
              "w-full justify-between",
              !value &&
                !placeholder?.includes("Loading") &&
                "text-muted-foreground",
              disabled && placeholder?.includes("Loading") && "opacity-100"
            )}
            disabled={
              disabled ||
              (type === "table" && !database) ||
              (type === "timeField" && !table)
            }
          >
            <div className="flex items-center gap-2 truncate">
              {disabled && placeholder?.includes("Loading") ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                showIcon && getIcon()
              )}
              <span className="truncate">
                {value || getPlaceholder() || "Select time field"}
              </span>
            </div>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <div className="border-b px-3 py-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${type}s...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {searchTerm
                  ? "No results found"
                  : type === "timeField"
                  ? "No time fields found in this table"
                  : "No options available"}
              </div>
            ) : (
              <div className="p-1">
                {filteredOptions.map((option) => (
                  <button
                    key={option}
                    onClick={() => handleSelect(option)}
                    className={cn(
                      "w-full px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground text-left transition-colors",
                      value === option && "bg-accent text-accent-foreground"
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <span>{option}</span>
                        {type === "timeField" && option === "__timestamp" && (
                          <Badge variant="secondary" className="text-xs">
                            Default
                          </Badge>
                        )}
                      </div>
                      {type === "timeField" && timeFieldsMetadata[option]?.timeUnit && (
                        <span className="text-xs text-muted-foreground">
                          {timeFieldsMetadata[option].timeUnit}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
