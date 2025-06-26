import { useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import TableSelector from "@/components/TableSelector";
import TimeRangeSelector from "@/components/TimeRangeSelector";
import type { TimeRange, ColumnSchema } from "@/types/utils.types";
import type { TimeRange as DashboardTimeRange } from "@/types/dashboard.types";

// Type guard to check if it's a query TimeRange
function isQueryTimeRange(timeRange: any): timeRange is TimeRange {
  return typeof timeRange.from === 'string' && typeof timeRange.to === 'string';
}

// Convert TimeRangeUnion to TimeRange for the callback
function convertToQueryTimeRange(range: TimeRange | DashboardTimeRange): TimeRange {
  if (isQueryTimeRange(range)) {
    return range;
  }
  
  // Convert DashboardTimeRange to TimeRange
  if (range.type === 'relative') {
    return {
      from: range.from,
      to: range.to,
      enabled: true,
    };
  } else {
    // AbsoluteTimeRange
    return {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      enabled: true,
    };
  }
}

interface QueryEditorSelectorsProps {
  selectedDb?: string;
  selectedTable?: string;
  selectedTimeField?: string;
  timeRange: TimeRange;
  hasTimeVariables: boolean;
  timeFieldOptions: string[];
  onTimeFieldChange: (value: string) => void;
  onTimeRangeChange: (timeRange: TimeRange) => void;
  getTimeFieldDetails: (fieldName: string) => ColumnSchema | null;
}

export default function QueryEditorSelectors({
  selectedDb,
  selectedTable,
  selectedTimeField,
  timeRange,
  hasTimeVariables,
  timeFieldOptions,
  onTimeFieldChange,
  onTimeRangeChange,
  getTimeFieldDetails,
}: QueryEditorSelectorsProps) {
  const handleTimeFieldChange = useCallback(
    (value: string) => {
      if (value === "_NO_TIME_FIELDS_") {
        // This is a disabled placeholder item, do nothing
        return;
      }
      onTimeFieldChange(value);
    },
    [onTimeFieldChange]
  );
  
  const handleTimeRangeChange = useCallback(
    (range: TimeRange | DashboardTimeRange) => {
      onTimeRangeChange(convertToQueryTimeRange(range));
    },
    [onTimeRangeChange]
  );

  // Add a component to render the type badge
  const renderTimeFieldTypeBadge = (fieldName: string) => {
    const fieldDetails = getTimeFieldDetails(fieldName);
    if (!fieldDetails) return null;

    const { dataType, timeUnit } = fieldDetails;
    const displayType = dataType?.toUpperCase() || 'UNKNOWN';
    const displayUnit = timeUnit ? ` (${timeUnit})` : "";

    return (
      <Badge variant="outline" className="font-mono text-[10px] ml-1 px-1 bg-blue-50 text-blue-700">
        {displayType}{displayUnit}
      </Badge>
    );
  };

  if (!selectedDb) {
    return null;
  }

  return (
    <>
      {/* Desktop Layout */}
      <div className="hidden lg:flex items-center gap-2 ml-2">
        <div className="h-5 w-px bg-border mx-1"></div>

        {/* Table Selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">FROM</span>
          <TableSelector />
        </div>

        {/* Time Field Selector */}
        {selectedTable && (
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-xs text-muted-foreground">TIME BY</span>
            <Select
              value={selectedTimeField}
              onValueChange={handleTimeFieldChange}
            >
              <SelectTrigger
                className={`h-8 text-xs min-w-[120px] ${
                  hasTimeVariables && !selectedTimeField
                    ? "border-destructive bg-destructive/10"
                    : ""
                }`}
              >
                <SelectValue placeholder="">
                  <div className="flex items-center">
                    {selectedTimeField ||
                      (hasTimeVariables ? "⚠️ Required" : "None")}
                    {selectedTimeField &&
                      renderTimeFieldTypeBadge(selectedTimeField)}
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {hasTimeVariables && timeFieldOptions.length === 0 && (
                  <SelectItem
                    key="no-time-fields"
                    value="_NO_TIME_FIELDS_"
                    disabled
                    className="text-xs text-muted-foreground"
                  >
                    <div className="flex items-center">
                      <span>No time fields available</span>
                    </div>
                  </SelectItem>
                )}
                {timeFieldOptions.map((field: string) => (
                  <SelectItem key={field} value={field} className="text-xs">
                    <div className="flex items-center">
                      <span>{field}</span>
                      {renderTimeFieldTypeBadge(field)}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Time Range Selector */}
        {selectedTable && selectedTimeField && (
          <div className="flex items-center gap-1.5 ml-2">
            <TimeRangeSelector
              timeRange={timeRange}
              onTimeRangeChange={handleTimeRangeChange}
              fieldName={selectedTimeField}
              tableName={selectedTable}
            />
          </div>
        )}
      </div>

      {/* Mobile/Tablet Layout */}
      <div className="lg:hidden space-y-2">
        {/* Table and Time Controls */}
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Table Selector */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="text-xs text-muted-foreground flex-shrink-0">FROM</span>
            <div className="min-w-0 flex-1">
              <TableSelector />
            </div>
          </div>

          {/* Time Field Selector */}
          {selectedTable && (
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="text-xs text-muted-foreground flex-shrink-0">
                TIME BY
              </span>
              <div className="min-w-0 flex-1">
                <Select
                  value={selectedTimeField}
                  onValueChange={handleTimeFieldChange}
                >
                  <SelectTrigger
                    className={`h-8 text-xs ${
                      hasTimeVariables && !selectedTimeField
                        ? "border-destructive bg-destructive/10"
                        : ""
                    }`}
                  >
                    <SelectValue placeholder="">
                      <div className="flex items-center">
                        {selectedTimeField ||
                          (hasTimeVariables ? "⚠️ Required" : "None")}
                        {selectedTimeField &&
                          renderTimeFieldTypeBadge(selectedTimeField)}
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {hasTimeVariables && timeFieldOptions.length === 0 && (
                      <SelectItem
                        key="no-time-fields"
                        value="_NO_TIME_FIELDS_"
                        disabled
                        className="text-xs text-muted-foreground"
                      >
                        <div className="flex items-center">
                          <span>No time fields available</span>
                        </div>
                      </SelectItem>
                    )}
                    {timeFieldOptions.map((field: string) => (
                      <SelectItem key={field} value={field} className="text-xs">
                        <div className="flex items-center">
                          <span>{field}</span>
                          {renderTimeFieldTypeBadge(field)}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        {/* Time Range Selector */}
        {selectedTable && selectedTimeField && (
          <div className="flex items-center gap-1.5">
            <TimeRangeSelector
              timeRange={timeRange}
              onTimeRangeChange={handleTimeRangeChange}
              fieldName={selectedTimeField}
              tableName={selectedTable}
            />
          </div>
        )}
      </div>
    </>
  );
}