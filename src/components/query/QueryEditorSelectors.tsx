import { useCallback } from "react";
import { useAtom } from "jotai";
import { UnifiedSchemaSelector } from "@/components/shared/UnifiedSchemaSelector";
import TimeRangeSelector from "@/components/shared/TimeRangeSelector";
import { 
  schemaLoadingAtom,
  currentTabDatabaseAtom,
} from "@/atoms";
import { Database } from "lucide-react";
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
  onTableChange: (value: string) => void;
  onTimeFieldChange: (value: string) => void;
  onTimeRangeChange: (timeRange: TimeRange) => void;
  getTimeFieldDetails: (fieldName: string) => ColumnSchema | null;
}

export default function QueryEditorSelectors({
  selectedDb,
  selectedTable,
  selectedTimeField,
  timeRange,
  onTableChange,
  onTimeFieldChange,
  onTimeRangeChange,
}: QueryEditorSelectorsProps) {
  const [isSchemaLoading] = useAtom(schemaLoadingAtom);
  const [selectedDbValue, setSelectedDb] = useAtom(currentTabDatabaseAtom);
  
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


  return (
    <>
      {/* Desktop Layout */}
      <div className="hidden lg:flex items-center gap-2 ml-2">
        <div className="h-5 w-px bg-border mx-1"></div>

        {/* Database Selector */}
        <div className="flex items-center gap-1.5">
          <Database className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">DB</span>
          <UnifiedSchemaSelector
            type="database"
            dataSource="atoms"
            style="popover"
            dynamic={true}
            value={selectedDbValue || ""}
            onChange={setSelectedDb}
            className="w-auto min-w-[150px]"
            showIcon={false}
            label={null}
          />
        </div>

        {/* Table Selector */}
        {selectedDb && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">FROM</span>
          <UnifiedSchemaSelector
            type="table"
            dataSource="atoms"
            style="popover"
            dynamic={true}
            value={selectedTable || ""}
            onChange={onTableChange}
            database={selectedDb}
            className="w-auto min-w-[200px]"
            showIcon={false}
            label={null}
          />
          </div>
        )}

        {/* Time Field Selector */}
        {selectedTable && (
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-xs text-muted-foreground">TIME BY</span>
            <UnifiedSchemaSelector
              type="timeField"
              dataSource="atoms"
              style="popover"
              dynamic={true}
              value={selectedTimeField || ""}
              onChange={handleTimeFieldChange}
              database={selectedDb}
              table={selectedTable}
              className="w-auto min-w-[150px]"
              showIcon={false}
              label={null}
              disabled={isSchemaLoading}
              placeholder={isSchemaLoading ? "Loading schema..." : undefined}
            />
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
        {/* Database Selector */}
        <div className="flex items-center gap-2">
          <Database className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">DB</span>
          <div className="flex-1">
            <UnifiedSchemaSelector
              type="database"
              dataSource="atoms"
              style="popover"
              dynamic={true}
              value={selectedDbValue || ""}
              onChange={setSelectedDb}
              className="w-full"
              showIcon={false}
              label={null}
            />
          </div>
        </div>

        {/* Table and Time Controls */}
        {selectedDb && (
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Table Selector */}
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="text-xs text-muted-foreground flex-shrink-0">FROM</span>
            <div className="min-w-0 flex-1">
              <UnifiedSchemaSelector
                type="table"
                dataSource="atoms"
                style="popover"
                dynamic={true}
                value={selectedTable || ""}
                onChange={onTableChange}
                database={selectedDb}
                className="w-full"
                showIcon={false}
                label={null}
              />
            </div>
          </div>

          {/* Time Field Selector */}
          {selectedTable && (
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="text-xs text-muted-foreground flex-shrink-0">
                TIME BY
              </span>
              <div className="min-w-0 flex-1">
                <UnifiedSchemaSelector
                  type="timeField"
                  dataSource="atoms"
                  style="popover"
                  dynamic={true}
                  value={selectedTimeField || ""}
                  onChange={handleTimeFieldChange}
                  database={selectedDb}
                  table={selectedTable}
                  className="w-full"
                  showIcon={false}
                  label={null}
                  disabled={isSchemaLoading}
                  placeholder={isSchemaLoading ? "Loading schema..." : undefined}
                />
              </div>
            </div>
          )}
        </div>
        )}

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