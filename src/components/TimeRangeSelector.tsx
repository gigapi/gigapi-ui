import { useState, useMemo, useEffect } from "react";
import { Calendar, Clock, Play } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Card } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import { DEFAULT_TIME_RANGE, NO_TIME_FILTER, QUICK_RANGES } from "@/lib/time-constants";
import { Badge } from "./ui/badge";
import { useQuery } from "../contexts/QueryContext";
import { toast } from "sonner";

export interface TimeRange {
  from: string; // ISO string or relative time like 'now-24h'
  to: string; // ISO string or relative time like 'now'
  display?: string; // Optional display name for the range
  raw?: {
    from: Date | string;
    to: Date | string;
  };
  enabled?: boolean; // Whether time filtering is enabled
}

interface TimeRangeSelectorProps {
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  className?: string;
  disabled?: boolean; // Whether the selector should be disabled
  fieldName?: string; // The name of the field being filtered
  tableName?: string; // The name of the table being filtered
}

// Parse relative time expressions into timestamp
export function parseRelativeTime(relativeTime: string): number {
  if (!relativeTime) return Date.now();
  
  if (relativeTime === "now") {
    return Date.now();
  }

  if (relativeTime.startsWith("now-")) {
    const match = relativeTime.match(/^now-(\d+)([mhdwMy])$/);
    if (match) {
      const [, amount, unit] = match;
      const value = parseInt(amount, 10);
      const now = Date.now();

      switch (unit) {
        case "m": // minutes
          return now - value * 60 * 1000;
        case "h": // hours
          return now - value * 60 * 60 * 1000;
        case "d": // days
          return now - value * 24 * 60 * 60 * 1000;
        case "w": // weeks
          return now - value * 7 * 24 * 60 * 60 * 1000;
        case "M": // months (approximate)
          return now - value * 30 * 24 * 60 * 60 * 1000;
        case "y": // years (approximate)
          return now - value * 365 * 24 * 60 * 60 * 1000;
        default:
          return now;
      }
    }

    // Handle combined formats like "now-1d/d" (start of yesterday)
    const complexMatch = relativeTime.match(/^now-(\d+)([mhdwMy])\/([mhdwMy])$/);
    if (complexMatch) {
      const [, amount, unit, snapTo] = complexMatch;
      const value = parseInt(amount, 10);
      let timestamp = Date.now();

      // First apply the subtraction
      switch (unit) {
        case "m": timestamp -= value * 60 * 1000; break;
        case "h": timestamp -= value * 60 * 60 * 1000; break;
        case "d": timestamp -= value * 24 * 60 * 60 * 1000; break;
        case "w": timestamp -= value * 7 * 24 * 60 * 60 * 1000; break;
        case "M": timestamp -= value * 30 * 24 * 60 * 60 * 1000; break;
        case "y": timestamp -= value * 365 * 24 * 60 * 60 * 1000; break;
        default: break;
      }

      // Then snap to the unit boundary
      const date = new Date(timestamp);
      switch (snapTo) {
        case "d": // Start of day
          date.setHours(0, 0, 0, 0);
          break;
        case "w": // Start of week (Sunday)
          const day = date.getDay();
          date.setDate(date.getDate() - day);
          date.setHours(0, 0, 0, 0);
          break;
        case "M": // Start of month
          date.setDate(1);
          date.setHours(0, 0, 0, 0);
          break;
        case "y": // Start of year
          date.setMonth(0, 1);
          date.setHours(0, 0, 0, 0);
          break;
        default: break;
      }
      return date.getTime();
    }
  }

  if (relativeTime.startsWith("now/")) {
    const unit = relativeTime.substring(4);
    const date = new Date();

    switch (unit) {
      case "d": // Start of day
        date.setHours(0, 0, 0, 0);
        break;
      case "w": // Start of week (Sunday)
        const day = date.getDay();
        date.setDate(date.getDate() - day);
        date.setHours(0, 0, 0, 0);
        break;
      case "M": // Start of month
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        break;
      case "y": // Start of year
        date.setMonth(0, 1);
        date.setHours(0, 0, 0, 0);
        break;
      default: break;
    }
    return date.getTime();
  }

  // Try to parse as ISO date or timestamp
  try {
    const timestamp = Date.parse(relativeTime);
    if (!isNaN(timestamp)) {
      return timestamp;
    }
  } catch (e) {
    console.error("Error parsing time:", e);
  }

  // If cannot parse, return current time
  return Date.now();
}

// Convert relative expressions to display format
function getDisplayTime(timeStr: string): string {
  if (!timeStr) return "now";
  
  if (timeStr === "now") {
    return "now";
  }

  try {
    if (timeStr.startsWith("now-") || timeStr.startsWith("now/")) {
      const timestamp = parseRelativeTime(timeStr);
      return format(new Date(timestamp), "yyyy-MM-dd HH:mm:ss");
    }

    // Try to parse as ISO string or timestamp
    const date = new Date(timeStr);
    if (!isNaN(date.getTime())) {
      return format(date, "yyyy-MM-dd HH:mm:ss");
    }
  } catch (e) {
    console.error("Error parsing time:", e);
  }

  return timeStr;
}

export default function TimeRangeSelector({
  timeRange,
  onTimeRangeChange,
  className,
  disabled = false,
  fieldName,
  tableName
}: TimeRangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [fromInput, setFromInput] = useState(timeRange?.from || DEFAULT_TIME_RANGE.from);
  const [toInput, setToInput] = useState(timeRange?.to || DEFAULT_TIME_RANGE.to);
  const [searchQuick, setSearchQuick] = useState("");
  const [browserTimezone, setBrowserTimezone] = useState("");
  const [currentTime, setCurrentTime] = useState("");
  const { query, setQuery, executeQuery } = useQuery();

  // Get browser timezone and current time
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setBrowserTimezone(tz);

    const updateTime = () => {
      setCurrentTime(format(new Date(), "HH:mm:ss zzz"));
    };
    updateTime();
    const timerId = setInterval(updateTime, 1000);
    return () => clearInterval(timerId);
  }, []);

  // Ensure time range is valid
  const safeTimeRange = useMemo(() => {
    return timeRange || DEFAULT_TIME_RANGE;
  }, [timeRange]);

  // Filter quick ranges based on search
  const filteredQuickRanges = useMemo(() => {
    // Add "No time filter" option at the beginning
    const allRanges = [NO_TIME_FILTER, ...QUICK_RANGES];
    
    if (!searchQuick) return allRanges;
    
    const search = searchQuick.toLowerCase();
    return allRanges.filter(range => 
      range.display?.toLowerCase().includes(search)
    );
  }, [searchQuick]);

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
    
    // Check if time filtering is disabled
    if (safeTimeRange.enabled === false) {
      return "No time filter";
    }
    
    const quickRange = QUICK_RANGES.find(
      r => r.from === safeTimeRange.from && r.to === safeTimeRange.to
    );
    
    if (quickRange) {
      return quickRange.display;
    }
    
    const fromDisplay = getDisplayTime(safeTimeRange.from);
    const toDisplay = getDisplayTime(safeTimeRange.to);
    
    return `${fromDisplay} to ${toDisplay}`;
  }, [safeTimeRange]);

  // Apply quick range selection
  const applyQuickRange = (range: TimeRange) => {
    // Special handling for "No time filter" option
    if (range.display === "No time filter") {
      onTimeRangeChange({...NO_TIME_FILTER, raw: undefined});
      setIsOpen(false);
      return;
    }
    
    // Add raw timestamps for better handling
    const newRange = {
      ...range,
      enabled: true, // Explicitly set to true for all other options
      raw: {
        from: new Date(parseRelativeTime(range.from)),
        to: new Date(parseRelativeTime(range.to))
      }
    };
    
    onTimeRangeChange(newRange);
    setIsOpen(false);
  };

  // Apply custom range from inputs
  const applyCustomRange = () => {
    // Validate inputs before applying
    if (!fromInput || !toInput) {
      console.error("Invalid time range inputs");
      return;
    }
    
    const newRange = {
      from: fromInput,
      to: toInput,
      enabled: true,
      raw: {
        from: new Date(parseRelativeTime(fromInput)),
        to: new Date(parseRelativeTime(toInput))
      }
    };
    onTimeRangeChange(newRange);
    setIsOpen(false);
  };

  // Helper to get display for Browser Time footer
  const getBrowserTimeDisplay = () => {
    try {
      const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
      const parts = timeZone.split('/');
      const city = parts.length > 1 ? parts[parts.length - 1].replace('_', ' ') : timeZone;
      const country = parts.length > 1 ? parts[0].replace('_', ' ') : ''; // Basic country name
      
      const offset = format(new Date(), "zzz"); // Get UTC offset like UTC+02:00

      return {
        display: `${country ? country + ", " : ""}${city}`,
        offset: offset,
      };
    } catch (e) {
      console.error("Error getting browser time display:", e);
      return { display: "N/A", offset: ""};
    }
  };

  const browserTimeInfo = getBrowserTimeDisplay();

  // Execute the query with the current time filters
  const executeQueryWithFilters = () => {
    // This applies the query with time variables replaced by actual values
    executeQuery();
    toast.success("Query executed with time filters");
  };
  
  // If time range filtering is disabled, don't render the component
  // NOTE: Moved below all hooks to maintain hook order consistency
  if (disabled || timeRange?.enabled === false) {
    return null;
  }

  return (
    <div className={cn("relative", className)}>
      <div className="flex items-center gap-2">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="gap-2 w-full justify-between min-w-[280px] h-9"
              aria-label="Select time range"
            >
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 shrink-0" />
                <span className="text-sm truncate font-normal">{currentRangeDisplay}</span>
                {fieldName && (
                  <Badge variant="outline" className="ml-1 text-xs">
                    {fieldName}
                    {tableName && ` (${tableName})`}
                  </Badge>
                )}
              </div>
              <Clock className="h-4 w-4 shrink-0 opacity-70" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[550px] p-0" align="start">
            <Card className="border-0 shadow-none">
              <div className="flex">
                {/* Left Pane: Absolute Time Range & Settings */}
                <div className="flex-1 p-4 space-y-4 border-r">
                  <div className="font-semibold text-sm">Absolute time range</div>
                  <div className="space-y-2">
                    <label htmlFor="from-input" className="text-xs text-muted-foreground">From</label>
                    <Input
                      id="from-input"
                      placeholder="e.g., now-24h or YYYY-MM-DD HH:mm:ss"
                      value={fromInput}
                      onChange={(e) => setFromInput(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="to-input" className="text-xs text-muted-foreground">To</label>
                    <Input
                      id="to-input"
                      placeholder="e.g., now or YYYY-MM-DD HH:mm:ss"
                      value={toInput}
                      onChange={(e) => setToInput(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <Button onClick={applyCustomRange} className="w-full h-9">
                    Apply time range
                  </Button>


                  
                  {/* Browser Time and Timezone Settings Footer */}
                  <div className="border-t pt-2 mt-auto absolute bottom-0 left-0 right-0 p-2 bg-background">
                     <div className="flex justify-between items-center text-xs text-muted-foreground">
                       <div>
                         Browser Time: {browserTimeInfo.display}
                       </div>
                       <div className="flex items-center">
                         <span>{browserTimeInfo.offset}</span>
                         
                       </div>
                     </div>
                   
                  </div>

                </div>

                {/* Right Pane: Quick Ranges */}
                <div className="w-[200px] p-2 space-y-2">
                  <Input
                    placeholder="Search quick ranges..."
                    value={searchQuick}
                    onChange={(e) => setSearchQuick(e.target.value)}
                    className="mb-2 h-9"
                  />
                  <ScrollArea className="h-[300px]"> {/* Adjust height as needed */}
                    <div className="space-y-1">
                      {filteredQuickRanges.map((range) => (
                        <Button
                          key={range.display || 'no-filter'}
                          variant="ghost"
                          className="w-full justify-start text-sm font-normal h-8"
                          onClick={() => applyQuickRange(range)}
                        >
                          {range.display || 'No time filter'}
                        </Button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </Card>
          </PopoverContent>
        </Popover>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={executeQueryWithFilters}
          title="Execute query with time filters"
        >
          <Play className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
} 