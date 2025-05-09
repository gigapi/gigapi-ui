import { useState, useMemo, useEffect } from "react";
import { Calendar, Clock, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Card } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";

export interface TimeRange {
  from: string; // ISO string or relative time like 'now-24h'
  to: string; // ISO string or relative time like 'now'
  display?: string; // Optional display name for the range
  raw?: {
    from: Date | string;
    to: Date | string;
  };
}

interface TimeRangeSelectorProps {
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  className?: string;
}

// Quick range options
const QUICK_RANGES = [
  { display: "Last 5 minutes", from: "now-5m", to: "now" },
  { display: "Last 15 minutes", from: "now-15m", to: "now" },
  { display: "Last 30 minutes", from: "now-30m", to: "now" },
  { display: "Last 1 hour", from: "now-1h", to: "now" },
  { display: "Last 3 hours", from: "now-3h", to: "now" },
  { display: "Last 6 hours", from: "now-6h", to: "now" },
  { display: "Last 12 hours", from: "now-12h", to: "now" },
  { display: "Last 24 hours", from: "now-24h", to: "now" },
  { display: "Last 2 days", from: "now-2d", to: "now" },
  { display: "Last 7 days", from: "now-7d", to: "now" },
  { display: "Last 30 days", from: "now-30d", to: "now" },
  { display: "Last 90 days", from: "now-90d", to: "now" },
  { display: "Last 6 months", from: "now-6M", to: "now" },
  { display: "Last 1 year", from: "now-1y", to: "now" },
  { display: "Today", from: "now/d", to: "now" },
  { display: "Yesterday", from: "now-1d/d", to: "now/d" },
  { display: "This week", from: "now/w", to: "now" },
  { display: "Previous week", from: "now-1w/w", to: "now/w" },
  { display: "This month", from: "now/M", to: "now" },
  { display: "Previous month", from: "now-1M/M", to: "now/M" },
  { display: "This year", from: "now/y", to: "now" },
  { display: "Previous year", from: "now-1y/y", to: "now/y" },
];

// Parse relative time expressions into timestamp
function parseRelativeTime(relativeTime: string): number {
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
    }
    return date.getTime();
  }

  // If cannot parse, return current time
  return Date.now();
}

// Convert relative expressions to display format
function getDisplayTime(timeStr: string): string {
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
}: TimeRangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"quick" | "relative" | "absolute">("quick");
  const [fromInput, setFromInput] = useState(timeRange.from);
  const [toInput, setToInput] = useState(timeRange.to);
  const [searchQuick, setSearchQuick] = useState("");

  // Filter quick ranges based on search
  const filteredQuickRanges = useMemo(() => {
    if (!searchQuick) return QUICK_RANGES;
    const search = searchQuick.toLowerCase();
    return QUICK_RANGES.filter(range => 
      range.display.toLowerCase().includes(search)
    );
  }, [searchQuick]);

  // Update the input fields when timeRange changes
  useEffect(() => {
    setFromInput(timeRange.from);
    setToInput(timeRange.to);
  }, [timeRange]);

  // Get display for the current time range
  const currentRangeDisplay = useMemo(() => {
    const quickRange = QUICK_RANGES.find(
      r => r.from === timeRange.from && r.to === timeRange.to
    );
    
    if (quickRange) {
      return quickRange.display;
    }
    
    const fromDisplay = getDisplayTime(timeRange.from);
    const toDisplay = getDisplayTime(timeRange.to);
    
    return `${fromDisplay} to ${toDisplay}`;
  }, [timeRange]);

  // Apply quick range selection
  const applyQuickRange = (range: TimeRange) => {
    onTimeRangeChange(range);
    setIsOpen(false);
  };

  // Apply custom range from inputs
  const applyCustomRange = () => {
    onTimeRangeChange({
      from: fromInput,
      to: toInput,
    });
    setIsOpen(false);
  };

  // Refresh to current time (keeps the same relative range)
  const refreshToNow = () => {
    // Find the current quick range if it exists
    const quickRange = QUICK_RANGES.find(
      r => r.from === timeRange.from && r.to === timeRange.to
    );
    
    if (quickRange) {
      onTimeRangeChange({
        ...quickRange,
        raw: {
          from: new Date(parseRelativeTime(quickRange.from)),
          to: new Date(parseRelativeTime(quickRange.to))
        }
      });
    } else if (timeRange.from.startsWith("now-") && timeRange.to === "now") {
      // For custom relative ranges that end with 'now', just trigger a refresh
      onTimeRangeChange({
        ...timeRange,
        raw: {
          from: new Date(parseRelativeTime(timeRange.from)),
          to: new Date()
        }
      });
    }
  };

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
              </div>
              <Clock className="h-4 w-4 shrink-0 opacity-70" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[350px] p-0" align="start">
            <Card className="border-0 shadow-none">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                <TabsList className="grid grid-cols-3 mb-2">
                  <TabsTrigger value="quick">Quick</TabsTrigger>
                  <TabsTrigger value="relative">Relative</TabsTrigger>
                  <TabsTrigger value="absolute">Absolute</TabsTrigger>
                </TabsList>

                {activeTab === "quick" && (
                  <div className="space-y-2 p-2">
                    <Input
                      placeholder="Search quick ranges..."
                      value={searchQuick}
                      onChange={(e) => setSearchQuick(e.target.value)}
                      className="mb-2"
                    />
                    <ScrollArea className="h-[300px]">
                      <div className="space-y-1">
                        {filteredQuickRanges.map((range) => (
                          <Button
                            key={range.display}
                            variant="ghost"
                            className="w-full justify-start text-sm font-normal"
                            onClick={() => applyQuickRange(range)}
                          >
                            {range.display}
                          </Button>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {activeTab === "relative" && (
                  <div className="space-y-4 p-4">
                    <div className="space-y-2">
                      <div className="text-sm">From</div>
                      <Input
                        placeholder="e.g., now-24h"
                        value={fromInput}
                        onChange={(e) => setFromInput(e.target.value)}
                      />
                      <div className="text-xs text-muted-foreground">
                        Example: now-1h, now-1d, now-7d
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm">To</div>
                      <Input
                        placeholder="e.g., now"
                        value={toInput}
                        onChange={(e) => setToInput(e.target.value)}
                      />
                      <div className="text-xs text-muted-foreground">
                        Usually "now" for current time
                      </div>
                    </div>
                    <Button onClick={applyCustomRange} className="w-full">
                      Apply
                    </Button>
                  </div>
                )}

                {activeTab === "absolute" && (
                  <div className="space-y-4 p-4">
                    <div className="space-y-2">
                      <div className="text-sm">From</div>
                      <Input
                        placeholder="e.g., 2023-01-01 00:00:00"
                        value={fromInput}
                        onChange={(e) => setFromInput(e.target.value)}
                        className="h-9"
                      />
                      <div className="text-xs text-muted-foreground">
                        YYYY-MM-DD HH:MM:SS format
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm">To</div>
                      <Input
                        placeholder="e.g., 2023-01-02 00:00:00"
                        value={toInput}
                        onChange={(e) => setToInput(e.target.value)}
                        className="h-9"
                      />
                      <div className="text-xs text-muted-foreground">
                        YYYY-MM-DD HH:MM:SS format
                      </div>
                    </div>
                    <Button onClick={applyCustomRange} className="w-full">
                      Apply
                    </Button>
                  </div>
                )}
              </Tabs>
            </Card>
          </PopoverContent>
        </Popover>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={refreshToNow}
          title="Refresh to current time"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
} 