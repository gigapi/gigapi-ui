import { useEffect, useState } from "react";
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
  
  // Dynamic schema hook for real-time data (when enabled)
  const dynamicData = useDynamicSchemaData({
    database: dynamic ? database : undefined,
    table: dynamic ? table : undefined,
  });

  // Common time field patterns
  const commonTimeFields = [
    "__timestamp",
    "time",
    "timestamp",
    "created_at",
    "updated_at",
    "event_time",
    "date",
    "datetime",
    "ts",
  ];

  useEffect(() => {
    // Detect time field from query
    const queryLower = query.toLowerCase();

    // Check if $__timeFilter is already used (with the old function syntax)
    const timeFilterMatch = query.match(/\$__timeFilter\s*\(\s*([^)]+)\s*\)/i);
    if (timeFilterMatch) {
      const field = timeFilterMatch[1].trim();
      setDetectedField(field);
      if (!value) {
        onChange(field);
      }
      // Don't return early, still scan for available fields
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

    // Auto-select if only one option
    if (uniqueFields.length === 1 && !value) {
      onChange(uniqueFields[0]);
      setDetectedField(uniqueFields[0]);
    } else if (uniqueFields.length > 0 && !value) {
      // Prefer __timestamp if available
      const preferred =
        uniqueFields.find((f) => f === "__timestamp") || uniqueFields[0];
      onChange(preferred);
      setDetectedField(preferred);
    }
  }, [query, schemaColumns, value, onChange, dynamic, database, table, dynamicData.timeFields]);

  const hasTimeFilter = query.includes("$__timeFilter");
  const needsTimeField = hasTimeFilter && !value;
  const isLoading = dynamic && dynamicData.isLoading;

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

      <Select value={value || ""} onValueChange={onChange}>
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
