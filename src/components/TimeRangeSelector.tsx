import { useState, useMemo, useEffect } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  HelpCircle,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { DEFAULT_TIME_RANGE } from "@/lib/";
import { QUICK_RANGES } from "@/types/utils.types";
import { Badge } from "@/components/ui/badge";
import { useAtom, useSetAtom } from "jotai";
import { 
  selectedTimeZoneAtom, 
  selectedTimeFieldAtom,
  hasTimeVariablesAtom
} from "@/atoms";
import { queryAtom, setQueryAtom } from "@/atoms";
import { getColumnsAtom } from "@/atoms";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TimeRange } from "@/types";
import {
  parseRelativeTime,
  getDisplayTime,
  validateTimeInputs,
  convertDateInput,
  validateTimeInput,
} from "@/lib/";
import TimezoneSelector from "@/components/TimezoneSelector";
import DateTimePicker from "@/components/shared/DateTimePicker";
import QuickRanges from "@/components/QuickRanges";
import { toast } from "sonner";

// TimeRange is now imported from the centralized types file

interface TimeRangeSelectorProps {
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  className?: string;
  disabled?: boolean; // Whether the selector should be disabled
  fieldName?: string; // The name of the field being filtered
  tableName?: string; // The name of the table being filtered
  context?: 'query' | 'dashboard'; // Context where the selector is being used
}

// Component code uses imported utilities for time parsing and timezone handling

export default function TimeRangeSelector({
  timeRange,
  onTimeRangeChange,
  disabled = false,
  context = 'query',
}: TimeRangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [fromInput, setFromInput] = useState(
    timeRange?.from || DEFAULT_TIME_RANGE.from
  );
  const [toInput, setToInput] = useState(
    timeRange?.to || DEFAULT_TIME_RANGE.to
  );
  const [currentTime, setCurrentTime] = useState("");

  const [selectedTimeZone] = useAtom(selectedTimeZoneAtom);
  const [hasTimeVariables] = useAtom(hasTimeVariablesAtom);
  const [selectedTimeField] = useAtom(selectedTimeFieldAtom);
  const [query] = useAtom(queryAtom);
  const [getColumns] = useAtom(getColumnsAtom);
  const setSelectedTimeZone = useSetAtom(selectedTimeZoneAtom);
  const setQuery = useSetAtom(setQueryAtom);
  
  // Get time field details from columns
  const selectedTimeFieldDetails = selectedTimeField && getColumns ? getColumns(selectedTimeField) : null;

  // Get browser timezone and current time
  useEffect(() => {
    const updateTime = () => {
      try {
        const now = new Date();
        const options: Intl.DateTimeFormatOptions = {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZone: selectedTimeZone,
        };
        setCurrentTime(new Intl.DateTimeFormat("en-US", options).format(now));
      } catch (e) {
        console.error("Error formatting time with timezone:", e);
        setCurrentTime(format(new Date(), "HH:mm:ss"));
      }
    };

    updateTime();
    const timerId = setInterval(updateTime, 1000);
    return () => clearInterval(timerId);
  }, [selectedTimeZone]);

  // Ensure time range is valid
  const safeTimeRange = useMemo(() => {
    return timeRange || DEFAULT_TIME_RANGE;
  }, [timeRange]);

  // Update the input fields when timeRange changes
  useEffect(() => {
    if (safeTimeRange) {
      setFromInput(safeTimeRange.from);
      setToInput(safeTimeRange.to);
    }
  }, [safeTimeRange]);

  // Get display for the current time range
  const currentRangeDisplay = useMemo(() => {
    // Safety check
    if (!safeTimeRange) return "Select time range";

    // Check if time filtering is disabled (handle both types)
    if ('enabled' in safeTimeRange && safeTimeRange.enabled === false) {
      return "No time filter";
    }

    // Check if it's an absolute time range
    if (safeTimeRange.type === 'absolute') {
      try {
        // For absolute time ranges, from and to are already strings (ISO date strings)
        const fromDate = new Date(safeTimeRange.from);
        const toDate = new Date(safeTimeRange.to);
        
        // Format absolute dates nicely
        const formatOptions: Intl.DateTimeFormatOptions = {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        };
        
        const fromStr = fromDate.toLocaleString('en-US', formatOptions);
        const toStr = toDate.toLocaleString('en-US', formatOptions);
        
        // If same day, show more compact format
        if (fromDate.toDateString() === toDate.toDateString()) {
          return `${fromStr} - ${toDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
        }
        
        return `${fromStr} - ${toStr}`;
      } catch (e) {
        console.error('Error formatting absolute time range:', e);
      }
    }

    // For relative time ranges, check quick ranges first
    const quickRange = QUICK_RANGES.find(
      (r) =>
        r.from === safeTimeRange.from && r.to === safeTimeRange.to
    );

    if (quickRange) {
      return quickRange.display;
    }

    // Format custom relative ranges
    const fromDisplay = safeTimeRange.from.startsWith('now') 
      ? safeTimeRange.from 
      : getDisplayTime(safeTimeRange.from);
    const toDisplay = safeTimeRange.to === 'now' 
      ? 'now' 
      : getDisplayTime(safeTimeRange.to);

    // For relative ranges starting with "now-", format nicely
    if (safeTimeRange.from.startsWith('now-') && safeTimeRange.to === 'now') {
      const duration = safeTimeRange.from.replace('now-', '');
      return `Last ${duration}`;
    }

    return `${fromDisplay} to ${toDisplay}`;
  }, [safeTimeRange]);

  // Determine if time filtering is active based on context
  const isTimeFilterActive = useMemo(() => {
    return (
      hasTimeVariables &&
      (!('enabled' in safeTimeRange) || safeTimeRange.enabled !== false) &&
      selectedTimeFieldDetails !== null
    );
  }, [hasTimeVariables, safeTimeRange, selectedTimeFieldDetails]);

  // Determine if time filtering is available but unused
  const isTimeFilterUnused = useMemo(() => {
    // Only show this warning in query context, not in dashboard context
    if (context === 'dashboard') {
      return false;
    }
    
    return (
      !hasTimeVariables &&
      (!('enabled' in safeTimeRange) || safeTimeRange.enabled !== false) &&
      selectedTimeField !== null &&
      selectedTimeField !== "_none_" &&
      query.trim() !== ""
    );
  }, [hasTimeVariables, safeTimeRange, selectedTimeField, query, context]);

  // Function to add time filter to query
  const addTimeFilterToQuery = () => {
    if (!selectedTimeField || !query) {
      toast.error("No time field selected or query is empty");
      return;
    }

    // Get current query from the editor
    let newQuery = query;

    // Check if we need to add a WHERE clause or add to an existing one
    if (newQuery.includes(" WHERE ")) {
      // Find the position after "WHERE"
      const wherePos = newQuery.toLowerCase().indexOf(" where ") + 7;
      // Check if there are other clauses after WHERE
      const nextClauseMatch = /\b(GROUP BY|ORDER BY|LIMIT)\b/i.exec(
        newQuery.substring(wherePos)
      );

      if (nextClauseMatch) {
        newQuery =
          newQuery.substring(0, wherePos) +
          "$__timeFilter " +
          newQuery.substring(wherePos);
      } else {
        newQuery =
          newQuery.substring(0, wherePos) +
          "$__timeFilter AND " +
          newQuery.substring(wherePos);
      }
    } else {
      const clauseMatch = /\b(GROUP BY|ORDER BY|LIMIT)\b/i.exec(newQuery);

      if (clauseMatch) {
        // Insert WHERE before the matched clause
        const insertPos = clauseMatch.index;
        newQuery =
          newQuery.substring(0, insertPos) +
          " WHERE $__timeFilter " +
          newQuery.substring(insertPos);
      } else {
        // Add WHERE clause at the end
        newQuery += " WHERE $__timeFilter";
      }
    }

    // Update the query
    setQuery(newQuery);
    toast.success("Time filter added to query");
  };

  // Apply quick range selection
  const applyQuickRange = (range: any) => {
    // Special handling for "No time filter" option
    if (range.display === "No time filter") {
      const noTimeFilter: TimeRange = {
        type: 'relative',
        from: '',
        to: '',
        display: 'No time filter',
      };
      onTimeRangeChange(noTimeFilter);
      setIsOpen(false);
      return;
    }

    // Add type field and raw timestamps for better handling
    const newRange: TimeRange = {
      type: 'relative',
      ...range,
      raw: {
        from: new Date(parseRelativeTime(range.from) || Date.now()),
        to: new Date(parseRelativeTime(range.to) || Date.now()),
      },
    };

    onTimeRangeChange(newRange);
    setIsOpen(false);
  };

  // Apply relative time range from inputs
  const applyRelativeRange = () => {
    // Validate inputs before applying
    const fromError = validateTimeInput(
      fromInput,
      { required: true },
      "From time"
    );
    const toError = validateTimeInput(toInput, { required: true }, "To time");

    if (fromError || toError || !validateTimeInputs(fromInput, toInput)) {
      toast.error(
        `Invalid time inputs: ${
          fromError || toError || "From must be before To"
        }`
      );
      return;
    }

    // Convert inputs to appropriate values
    const fromValue = convertDateInput(fromInput);
    const toValue = convertDateInput(toInput);

    // Removed unused timestamp variables

    const newRange: TimeRange = {
      type: 'relative',
      from: fromValue,
      to: toValue,
      display: `${getDisplayTime(fromValue)} to ${getDisplayTime(toValue)}`,
    };

    onTimeRangeChange(newRange);
    setIsOpen(false);
  };

  // Handle timezone selection
  const handleTimezoneChange = (tz: string) => {
    setSelectedTimeZone(tz);
  };

  // If time range filtering is disabled, don't render the component
  if (disabled) {
    return null;
  }

  return (
    <div className={cn("relative flex items-center")}>
      <div className="flex items-center gap-1">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "gap-1 h-8 justify-between text-xs min-w-[160px] px-2 border-0 bg-transparent hover:bg-muted/30",
                isTimeFilterActive && "bg-primary/10"
              )}
              aria-label="Select time range"
            >
              <div className="flex items-center gap-1">
                {isTimeFilterActive ? (
                  <Clock className="h-3.5 w-3.5 shrink-0 text-primary" />
                ) : (
                  <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="truncate font-normal">
                  {timeRange && 'enabled' in timeRange && timeRange.enabled === false
                    ? "No time filter"
                    : currentRangeDisplay}
                </span>
                {isTimeFilterActive && (
                  <Badge
                    variant="outline"
                    className="ml-1 h-4 px-1 py-0 border-primary/20 text-[10px] bg-green-400/20"
                  >
                    active
                  </Badge>
                )}
                {isTimeFilterUnused && (
                  <Badge
                    variant="outline"
                    className="ml-1 h-4 px-1 py-0 border-primary/20 text-[10px] bg-amber-400/20"
                  >
                    unused
                  </Badge>
                )}
                {timeRange && 'enabled' in timeRange && timeRange.enabled === false && (
                  <Badge
                    variant="outline"
                    className="ml-1 h-4 px-1 py-0 border-primary/20 text-[10px] bg-red-400/20"
                  >
                    disabled
                  </Badge>
                )}
              </div>
            </Button>
          </PopoverTrigger>
          <PopoverContent 
            className="w-full max-w-[720px] p-0 max-h-[calc(100vh-100px)] overflow-y-auto" 
            align="start"
            sideOffset={5}
            avoidCollisions={true}
            collisionPadding={20}
          >
            <Card className="border-0 shadow-none">
              <div className="flex flex-col">
                {/* Add a section at the top showing the query status */}
                {hasTimeVariables && (
                  <div className="bg-muted/40 p-2 border-b text-xs flex justify-between items-center">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      <span>Time variables detected in query</span>
                    </div>
                    <Badge
                      variant="outline"
                      className="h-5 px-1.5 bg-primary/10 border-primary/20"
                    >
                      Time filtered
                    </Badge>
                  </div>
                )}

                {/* Show when time filter is available but unused */}
                {isTimeFilterUnused && (
                  <div className="bg-amber-400/10 p-2 border-b text-xs flex justify-between items-center">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                      <span>Time field selected but not used in query</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs gap-1 bg-amber-400/20 border-amber-400/30"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        addTimeFilterToQuery();
                      }}
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add time filter</span>
                    </Button>
                  </div>
                )}

                {/* Main time input section */}
                <div className="p-6">
                  <div className="flex space-x-6">
                    {/* Left Pane: Time Inputs */}
                    <div className="flex-1 space-y-6">
                      {/* From input with calendar picker */}
                      <div className="space-y-2">
                        <label
                          htmlFor="from-input"
                          className="text-sm font-medium"
                        >
                          From
                        </label>
                        <div className="flex gap-2">
                          <DateTimePicker
                            value={fromInput}
                            onChange={setFromInput}
                            placeholder="e.g., now-24h or now-7d"
                          />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Examples: now-1h, now-7d, now-1M
                        </div>
                      </div>

                      {/* To input with calendar picker */}
                      <div className="space-y-2">
                        <label
                          htmlFor="to-input"
                          className="text-sm font-medium"
                        >
                          To
                        </label>
                        <div className="flex gap-2">
                          <DateTimePicker
                            value={toInput}
                            onChange={setToInput}
                            placeholder="e.g., now"
                          />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Examples: now, now-1h/h (top of previous hour)
                        </div>
                      </div>

                      {/* Apply Button */}
                      <Button
                        onClick={applyRelativeRange}
                        className="w-full h-10 mt-4"
                        variant="default"
                      >
                        Apply time range
                      </Button>
                    </div>

                    {/* Right Pane: Quick Ranges */}
                    <QuickRanges
                      onRangeSelect={applyQuickRange}
                      className="w-[240px] space-y-2 border-l pl-6"
                    />
                  </div>
                </div>

                {/* Timezone Section */}
                <div className="p-4 border-t space-y-3">
                  <div className="text-xs text-muted-foreground">Time zone</div>
                  <TimezoneSelector
                    selectedTimeZone={selectedTimeZone}
                    onTimeZoneChange={handleTimezoneChange}
                  />
                  {/* Field Info and Current Time Footer */}
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <div>Current Time:</div>
                    <div className="font-mono">{currentTime}</div>
                  </div>
                  {selectedTimeField && (
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <div>Time Field:</div>
                      <div className="font-mono">
                        {selectedTimeField}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </PopoverContent>
        </Popover>
        {/* Query variables help - always show */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <HelpCircle className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              align="start"
              className="max-w-[400px]"
            >
              <div className="text-sm space-y-2">
                <p className="font-bold">Query Variables:</p>
                <ul className="space-y-1 list-disc pl-4">
                  <li>
                    <code className="bg-muted px-1 rounded">$__timeFilter</code>{" "}
                    - Complete time filter for the selected field
                  </li>
                  <li>
                    <code className="bg-muted px-1 rounded">$__timeField</code>{" "}
                    - Selected time field name
                  </li>
                  <li>
                    <code className="bg-muted px-1 rounded">$__timeFrom</code> -
                    Start of the selected time range
                  </li>
                  <li>
                    <code className="bg-muted px-1 rounded">$__timeTo</code> -
                    End of the selected time range
                  </li>
                </ul>
                <p className="text-xs mt-2">
                  Example:
                  <code className="bg-muted px-1 rounded block mt-1">
                    WHERE $__timeFilter
                  </code>
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Add a use filter button when time filter is unused */}
        {isTimeFilterUnused && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-100/30"
            onClick={addTimeFilterToQuery}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Use filter</span>
          </Button>
        )}
      </div>
    </div>
  );
}
