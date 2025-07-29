import { useState, useMemo, useCallback } from "react";
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
import { useSchemaData, type DataSource } from "@/hooks/useSchemaData";
import { useDynamicSchemaData } from "@/hooks/useDynamicSchemaData";

// Types for the unified selector
export type SelectorType = "database" | "table" | "timeField";
export type SelectorStyle = "select" | "popover";

interface UnifiedSchemaSelectorProps {
  type: SelectorType;
  value?: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  // Context
  dataSource?: DataSource;
  // For table selector
  database?: string;
  // For time field selector
  table?: string;
  // Optional schema override (for artifact context)
  schemaOverride?: Record<string, any>;
  // Optional label (null = no label, undefined = default label, string = custom label)
  label?: string | null;
  // Show icon in trigger
  showIcon?: boolean;
  // Style variant
  style?: SelectorStyle;
  // Dynamic mode - always fetch fresh data
  dynamic?: boolean;
}

export function UnifiedSchemaSelector({
  type,
  value,
  onChange,
  className,
  disabled = false,
  placeholder,
  dataSource = "atoms",
  database,
  table,
  schemaOverride,
  label,
  showIcon = true,
  style = "select",
  dynamic = false,
}: UnifiedSchemaSelectorProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // Use dynamic hook if dynamic mode is enabled
  const dynamicData = useDynamicSchemaData({
    database,
    table,
  });

  // Get schema data using the unified hook
  const cachedData = useSchemaData({
    dataSource,
    database,
    table,
    schemaOverride,
  });

  // Choose which data to use based on dynamic prop
  const { databases, tables, timeFields, isLoading, error, refetchDatabases, refetchTables, refetchSchema } = dynamic ? dynamicData : cachedData;

  // Get options based on selector type
  const options = useMemo(() => {
    switch (type) {
      case "database":
        return databases;
      case "table":
        return tables;
      case "timeField":
        return timeFields.map(field => field.name);
      default:
        return [];
    }
  }, [type, databases, tables, timeFields]);

  // Get time field metadata for display
  const timeFieldsMetadata = useMemo(() => {
    const metadata: Record<string, { timeUnit?: string }> = {};
    if (type === "timeField") {
      timeFields.forEach(field => {
        if (field.timeUnit) {
          metadata[field.name] = { timeUnit: field.timeUnit };
        }
      });
    }
    return metadata;
  }, [type, timeFields]);

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
    if (placeholder) return placeholder;

    if (isLoading) {
      return `Loading ${type}s...`;
    }

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
    if (label === null) return null;
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
  const handleSelect = useCallback((selectedValue: string) => {
    onChange(selectedValue);
    setIsOpen(false);
    setSearchTerm("");
  }, [onChange]);

  // Handle popover open/close with dynamic fetching
  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    
    // Trigger fresh fetch when opening in dynamic mode
    if (open && dynamic) {
      switch (type) {
        case "database":
          refetchDatabases?.();
          break;
        case "table":
          if (database) {
            refetchTables?.();
          }
          break;
        case "timeField":
          if (database && table) {
            refetchSchema?.();
          }
          break;
      }
    }
  }, [dynamic, type, database, table, refetchDatabases, refetchTables, refetchSchema]);

  // Check if selector should be disabled
  const isDisabled = disabled || 
    isLoading ||
    (type === "table" && !database) ||
    (type === "timeField" && !table);

  const displayLabel = getLabel();

  // Render select style
  if (style === "select") {
    return (
      <div className={cn("space-y-1.5", className)}>
        {displayLabel !== null && (
          <label className="text-sm font-medium text-muted-foreground">
            {displayLabel}
          </label>
        )}
        <Select
          value={value}
          onValueChange={onChange}
          disabled={isDisabled}
        >
          <SelectTrigger
            className={cn("w-full", !value && "text-muted-foreground")}
          >
            <div className="flex items-center gap-2">
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                showIcon && getIcon()
              )}
              <SelectValue placeholder={getPlaceholder()} />
            </div>
          </SelectTrigger>
          <SelectContent>
            {error ? (
              <div className="py-2 px-3 text-sm text-destructive text-center">
                Error loading {type}s
              </div>
            ) : filteredOptions.length === 0 ? (
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
      {displayLabel !== null && (
        <label className="text-sm font-medium text-muted-foreground">
          {displayLabel}
        </label>
      )}
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={isOpen}
            className={cn(
              "w-full justify-between",
              !value && "text-muted-foreground"
            )}
            disabled={isDisabled}
          >
            <div className="flex items-center gap-2 truncate">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                showIcon && getIcon()
              )}
              <span className="truncate">
                {value || getPlaceholder()}
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
            {error ? (
              <div className="py-6 text-center text-sm text-destructive">
                Error loading {type}s
              </div>
            ) : filteredOptions.length === 0 ? (
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