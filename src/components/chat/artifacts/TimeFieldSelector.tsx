import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Clock, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib";
import { useDynamicSchemaData } from "@/hooks/useDynamicSchemaData";

interface TimeFieldSelectorProps {
  query: string;
  database?: string;
  value?: string;
  onChange: (field: string) => void;
  schemaColumns?: string[];
  className?: string;
  // Dynamic mode for real-time schema fetching
  dynamic?: boolean;
  table?: string;
}

// Helper function to detect time field from query (can be used by parent components)
export function detectTimeFieldFromQuery(query: string, schemaColumns: string[] = []): string | null {
  const queryLower = query.toLowerCase();
  
  // Check if $__timeFilter is already used with the old function syntax
  const timeFilterMatch = query.match(/\$__timeFilter\s*\(\s*([^)]+)\s*\)/i);
  if (timeFilterMatch) {
    return timeFilterMatch[1].trim();
  }
  
  // Common time field patterns - ensure __timestamp is always first
  const commonTimeFields = [
    "__timestamp", // Always include this as it's the default for ClickHouse
    "timestamp",
    "time",
    "created_at",
    "updated_at",
    "event_time",
    "date",
    "datetime",
    "ts",
    "_time", // Common in some systems
  ];
  
  // Find time fields in the query
  const foundFields: string[] = [];
  for (const field of commonTimeFields) {
    if (queryLower.includes(field)) {
      foundFields.push(field);
    }
  }
  
  // Check schema columns
  if (schemaColumns.length > 0) {
    const timeColumns = schemaColumns.filter((col) =>
      commonTimeFields.some((tf) => col.toLowerCase().includes(tf))
    );
    foundFields.push(...timeColumns);
  }
  
  // Remove duplicates
  const uniqueFields = Array.from(new Set(foundFields));
  
  if (uniqueFields.length === 0) return null;
  
  // Prefer __timestamp if available
  return uniqueFields.find((f) => f === "__timestamp") || uniqueFields[0];
}

export default function TimeFieldSelector({
  query,
  database,
  table,
  value,
  onChange,
  schemaColumns = [],
  className,
  dynamic = false,
}: TimeFieldSelectorProps) {
  const [detectedField, setDetectedField] = useState<string | null>(null);
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const isMountedRef = useRef(false);
  const hasInitializedRef = useRef(false);
  
  // Track mount status - only run once on mount
  useEffect(() => {
    isMountedRef.current = true;
    // Add a delay before allowing any onChange calls
    const timer = setTimeout(() => {
      hasInitializedRef.current = true;
    }, 500); // Half second delay before allowing changes
    
    return () => {
      isMountedRef.current = false;
      clearTimeout(timer);
    };
  }, []); // Empty dependency array - only run on mount/unmount
  
  // Safe onChange handler that prevents undefined values and initial render calls
  const handleChange = useCallback((newValue: string) => {
    // Don't call onChange during initial mount phase
    if (!hasInitializedRef.current) {
      return;
    }
    
    // Don't call onChange if the value hasn't actually changed
    if (newValue !== value) {
      // Use setTimeout to defer the state update
      setTimeout(() => {
        if (isMountedRef.current) {
          onChange(newValue);
        }
      }, 0);
    }
  }, [value, onChange]);
  
  // Dynamic schema hook for real-time data (when enabled)
  const dynamicData = useDynamicSchemaData({
    database: dynamic ? database : undefined,
    table: dynamic ? table : undefined,
  });

  // Common time field patterns - ensure __timestamp is always first
  const commonTimeFields = [
    "__timestamp", // Always include this as it's the default for ClickHouse
    "timestamp",
    "time",
    "created_at",
    "updated_at",
    "event_time",
    "date",
    "datetime",
    "ts",
    "_time", // Common in some systems
  ];

  useEffect(() => {
    // Only detect available fields, NO auto-selection here
    const queryLower = query.toLowerCase();

    // Check if $__timeFilter is already used (with the old function syntax)
    const timeFilterMatch = query.match(/\$__timeFilter\s*\(\s*([^)]+)\s*\)/i);
    if (timeFilterMatch) {
      const field = timeFilterMatch[1].trim();
      setDetectedField(field);
    }

    // Find time fields in the query
    const foundFields: string[] = [];
    for (const field of commonTimeFields) {
      if (queryLower.includes(field)) {
        foundFields.push(field);
      }
    }

    // Get columns from dynamic data if enabled, otherwise use provided schema
    const columnsToCheck = dynamic && database && table && dynamicData.timeFields.length > 0
      ? dynamicData.timeFields.map(field => field.name)
      : schemaColumns;
      
    if (columnsToCheck.length > 0) {
      const timeColumns = columnsToCheck.filter((col) =>
        commonTimeFields.some((tf) => col.toLowerCase().includes(tf))
      );
      foundFields.push(...timeColumns);
    }

    // Remove duplicates and set available fields
    const uniqueFields = Array.from(new Set(foundFields));
    setAvailableFields(uniqueFields);
  }, [query, schemaColumns, dynamic, database, table, dynamicData.timeFields]);


  const hasTimeFilter = query.includes("$__timeFilter");
  const needsTimeField = hasTimeFilter && !value;
  const isLoading = dynamic && dynamicData.isLoading;
  
  // Build the full list of options
  const allOptions = useMemo(() => {
    const options = new Set<string>();
    
    // Add available fields from detection
    availableFields.forEach(field => options.add(field));
    
    // Always include common time fields as fallback options
    commonTimeFields.forEach(field => options.add(field));
    
    return Array.from(options);
  }, [availableFields]);
  
  // Ensure the current value exists in options
  const safeValue = useMemo(() => {
    if (!value) return "";
    
    // If value exists in options, use it
    if (allOptions.includes(value)) return value;
    
    // Otherwise reset to empty
    return "";
  }, [value, allOptions]);
  
  // Don't render the Select until we have determined the options
  const isReady = hasInitializedRef.current && isMountedRef.current;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        {isLoading ? (
          <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin" />
        ) : (
          <Clock className="w-4 h-4 text-muted-foreground" />
        )}
        <Label htmlFor="time-field" className="text-sm font-medium">
          Time Field
          {dynamic && (
            <span className="ml-1 text-xs text-green-600 font-normal">
              (live)
            </span>
          )}
        </Label>
        {needsTimeField && <AlertCircle className="w-4 h-4 text-yellow-500" />}
      </div>

      {!isReady ? (
        <div className="flex items-center h-9 px-3 text-sm text-muted-foreground">
          <RefreshCw className="w-3 h-3 mr-2 animate-spin" />
          Initializing...
        </div>
      ) : (
        <Select value={safeValue} onValueChange={handleChange}>
          <SelectTrigger
            id="time-field"
            className={cn(
              "w-full", 
              needsTimeField && "border-yellow-500",
              isLoading && "opacity-50"
            )}
            disabled={isLoading}
          >
            <SelectValue placeholder={isLoading ? "Loading fields..." : "Select time field"} />
          </SelectTrigger>
          <SelectContent>
          {availableFields.length > 0 ? (
            <>
              <SelectItem value="auto">Auto-detect</SelectItem>
              {availableFields.map((field) => (
                <SelectItem key={field} value={field}>
                  {field}
                  {field === detectedField && " (detected)"}
                  {dynamic && dynamicData.timeFields.find(f => f.name === field)?.timeUnit && (
                    <span className="text-xs text-muted-foreground ml-2">
                      ({dynamicData.timeFields.find(f => f.name === field)?.timeUnit})
                    </span>
                  )}
                </SelectItem>
              ))}
            </>
          ) : (
            commonTimeFields.map((field) => (
              <SelectItem key={field} value={field}>
                {field}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      )}

      {hasTimeFilter && !value && (
        <p className="text-xs text-yellow-600">
          Query uses $__timeFilter but no time field is selected
        </p>
      )}

      {value && hasTimeFilter && (
        <p className="text-xs text-muted-foreground">
          Time filter will use: <code className="font-mono">{value}</code>
        </p>
      )}
    </div>
  );
}
