import { useState, useMemo, useEffect } from "react";
import { Calendar as CalendarIcon, Clock, Play, Globe } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Card } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import {
  DEFAULT_TIME_RANGE,
  NO_TIME_FILTER,
  QUICK_RANGES,
} from "@/lib/time-constants";
import { Badge } from "./ui/badge";
import { useQuery } from "../contexts/QueryContext";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Calendar } from "./ui/calendar";
import "./ui/calendar.css";

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
    const complexMatch = relativeTime.match(
      /^now-(\d+)([mhdwMy])\/([mhdwMy])$/
    );
    if (complexMatch) {
      const [, amount, unit, snapTo] = complexMatch;
      const value = parseInt(amount, 10);
      let timestamp = Date.now();

      // First apply the subtraction
      switch (unit) {
        case "m":
          timestamp -= value * 60 * 1000;
          break;
        case "h":
          timestamp -= value * 60 * 60 * 1000;
          break;
        case "d":
          timestamp -= value * 24 * 60 * 60 * 1000;
          break;
        case "w":
          timestamp -= value * 7 * 24 * 60 * 60 * 1000;
          break;
        case "M":
          timestamp -= value * 30 * 24 * 60 * 60 * 1000;
          break;
        case "y":
          timestamp -= value * 365 * 24 * 60 * 60 * 1000;
          break;
        default:
          break;
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
        default:
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
      default:
        break;
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

// Return a formatted version of timezone for display
function formatTimezone(timezone: string): string {
  if (!timezone) return "UTC";

  try {
    // Format: Continent/City -> City (UTC+XX:XX)
    const parts = timezone.split("/");
    const city =
      parts.length > 1 ? parts[parts.length - 1].replace(/_/g, " ") : timezone;

    // Get the UTC offset
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      timeZoneName: "short",
    });
    const formatted = formatter.format(now);
    const tzPart = formatted.split(" ").pop() || "";

    return `${city} (${tzPart})`;
  } catch (e) {
    console.error("Error formatting timezone:", e);
    return timezone;
  }
}

// First, let's update the timezone categories to include a proper browser time detection
function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (e) {
    console.error("Error getting browser timezone:", e);
    return "UTC";
  }
}

// Update timezone categories with proper browser detection
const TIMEZONE_CATEGORIES = [
  {
    name: "Default",
    zones: ["Europe/London", "UTC"],
  },
  {
    name: "Browser Time",
    zones: [getBrowserTimezone()],
  },
  {
    name: "Coordinated Universal Time",
    zones: ["UTC", "GMT"],
  },
  {
    name: "Africa",
    zones: [
      "Africa/Abidjan",
      "Africa/Accra",
      "Africa/Addis_Ababa",
      "Africa/Algiers",
      "Africa/Cairo",
      "Africa/Casablanca",
      "Africa/Lagos",
      "Africa/Nairobi",
    ],
  },
  {
    name: "America",
    zones: [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Toronto",
      "America/Vancouver",
      "America/Montreal",
      "America/Edmonton",
    ],
  },
  {
    name: "Europe",
    zones: [
      "Europe/London",
      "Europe/Berlin",
      "Europe/Paris",
      "Europe/Madrid",
      "Europe/Rome",
      "Europe/Amsterdam",
      "Europe/Stockholm",
      "Europe/Zurich",
      "Europe/Dublin",
      "Europe/Oslo",
    ],
  },
  {
    name: "Asia",
    zones: [
      "Asia/Tokyo",
      "Asia/Shanghai",
      "Asia/Hong_Kong",
      "Asia/Singapore",
      "Asia/Dubai",
      "Asia/Kolkata",
      "Asia/Seoul",
      "Asia/Bangkok",
    ],
  },
  {
    name: "Australia & Pacific",
    zones: [
      "Australia/Sydney",
      "Australia/Melbourne",
      "Australia/Perth",
      "Pacific/Auckland",
    ],
  },
];

// Add getTimezoneOffset helper function
const getTimezoneOffset = (timezone: string): string => {
  try {
    // Special handling for Browser Time
    if (timezone === "Browser_Time") {
      const offset = -new Date().getTimezoneOffset();
      const hours = Math.floor(Math.abs(offset) / 60);
      const minutes = Math.abs(offset) % 60;
      const sign = offset >= 0 ? "+" : "-";
      return `UTC${sign}${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}`;
    }

    // For all other timezones
    const now = new Date();
    const tzString = now.toLocaleString("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    });
    const match = tzString.match(/GMT([+-]\d{1,2}(?::\d{2})?)/);

    if (match && match[1]) {
      // Format to UTC+XX:XX
      let offset = match[1].replace("GMT", "UTC");
      // Add minutes if they're not present
      if (!offset.includes(":")) {
        offset += ":00";
      }
      return offset;
    }

    // Standard UTC if timezone is UTC/GMT
    if (timezone === "UTC" || timezone === "GMT") {
      return "UTC+00:00";
    }

    // Fallback
    return timezone.includes("UTC") ? timezone : "UTC";
  } catch (e) {
    console.error("Error getting timezone offset:", e);
    return "UTC";
  }
};

export default function TimeRangeSelector({
  timeRange,
  onTimeRangeChange,
  disabled = false,
  fieldName,
  tableName,
}: TimeRangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [fromInput, setFromInput] = useState(
    timeRange?.from || DEFAULT_TIME_RANGE.from
  );
  const [toInput, setToInput] = useState(
    timeRange?.to || DEFAULT_TIME_RANGE.to
  );
  const [searchQuick, setSearchQuick] = useState("");
  const [currentTime, setCurrentTime] = useState("");

  // State for absolute date pickers
  const [fromDate, setFromDate] = useState<Date | undefined>(new Date());
  const [toDate, setToDate] = useState<Date | undefined>(new Date());
  const [fromTime, setFromTime] = useState("00:00:00");
  const [toTime, setToTime] = useState("23:59:59");

  const {
    executeQuery,
    selectedTimeFieldDetails,
    selectedTimeZone,
    setSelectedTimeZone,
  } = useQuery();

  // Add a separate state for timezone search
  const [timezoneSearch, setTimezoneSearch] = useState("");

  // Get browser timezone and current time
  useEffect(() => {
    const updateTime = () => {
      // Format the current time in the selected timezone
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

  // Filter quick ranges based on search
  const filteredQuickRanges = useMemo(() => {
    // Add "No time filter" option at the beginning
    const allRanges = [NO_TIME_FILTER, ...QUICK_RANGES];

    if (!searchQuick) return allRanges;

    const search = searchQuick.toLowerCase();
    return allRanges.filter((range) =>
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
      (r) => r.from === safeTimeRange.from && r.to === safeTimeRange.to
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
      onTimeRangeChange({ ...NO_TIME_FILTER, raw: undefined });
      setIsOpen(false);
      return;
    }

    // Add raw timestamps for better handling
    const newRange = {
      ...range,
      enabled: true, // Explicitly set to true for all other options
      raw: {
        from: new Date(parseRelativeTime(range.from)),
        to: new Date(parseRelativeTime(range.to)),
      },
    };

    onTimeRangeChange(newRange);
    setIsOpen(false);
  };

  // Apply relative time range from inputs
  const applyRelativeRange = () => {
    // Validate inputs before applying
    if (!fromInput || !toInput) {
      toast.error("Invalid time range inputs");
      return;
    }

    // Add raw timestamps for better handling
    let fromTimestamp, toTimestamp;
    let fromValue = fromInput;
    let toValue = toInput;

    try {
      // If the inputs are formatted dates, convert to ISO
      if (fromInput.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
        const date = new Date(fromInput.replace(" ", "T"));
        fromValue = date.toISOString();
        fromTimestamp = date.getTime();
      } else {
        fromTimestamp = parseRelativeTime(fromInput);
      }

      if (toInput.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
        const date = new Date(toInput.replace(" ", "T"));
        toValue = date.toISOString();
        toTimestamp = date.getTime();
      } else {
        toTimestamp = parseRelativeTime(toInput);
      }
    } catch (e) {
      toast.error("Invalid time format");
      return;
    }

    const newRange = {
      from: fromValue,
      to: toValue,
      display: `${getDisplayTime(fromValue)} to ${getDisplayTime(toValue)}`,
      enabled: true,
      raw: {
        from: new Date(fromTimestamp),
        to: new Date(toTimestamp),
      },
    };

    onTimeRangeChange(newRange);
    setIsOpen(false);
  };

  // Get time field type badge
  const getTimeFieldTypeBadge = () => {
    if (!selectedTimeFieldDetails) return null;

    const { dataType, timeUnit } = selectedTimeFieldDetails;
    const displayType = dataType.toUpperCase();
    const displayUnit = timeUnit ? ` (${timeUnit})` : "";

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="ml-1 text-xs font-mono py-0 h-5 px-1.5 bg-muted/30 border-0"
            >
              {displayType}
              {displayUnit}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Field type: {displayType}</p>
            {timeUnit && <p>Time unit: {timeUnit}</p>}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  // Handle timezone selection
  const handleTimezoneChange = (tz: string) => {
    setSelectedTimeZone(tz);
    toast.success(`Timezone set to ${tz}`, {
      description: "Time filtering will use this timezone for calculations",
    });
  };

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
    <div className={cn("relative flex items-center")}>
      <div className="flex items-center gap-1">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="gap-1 h-8 justify-between text-xs min-w-[160px] px-2 border-0 bg-transparent hover:bg-muted/30"
              aria-label="Select time range"
            >
              <div className="flex items-center gap-1">
                <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-normal">
                  {currentRangeDisplay}
                </span>
                {fieldName && (
                  <Badge
                    variant="outline"
                    className="ml-1 text-xs py-0 h-5 px-1.5 bg-transparent border-0"
                  >
                    {fieldName}
                    {tableName && ` (${tableName})`}
                  </Badge>
                )}
                {selectedTimeFieldDetails && getTimeFieldTypeBadge()}
              </div>
              <Clock className="h-3.5 w-3.5 shrink-0 opacity-70" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full max-w-[720px] p-0" align="start">
            <Card className="border-0 shadow-none">
              <div className="flex flex-col">
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
                          <div className="relative flex-1">
                            <Input
                              id="from-input"
                              placeholder="e.g., now-24h or now-7d"
                              value={fromInput}
                              onChange={(e) => setFromInput(e.target.value)}
                              className="h-10 pr-10"
                            />
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-0 top-0 h-10 w-10 p-0"
                                >
                                  <CalendarIcon className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-auto p-0"
                                align="end"
                              >
                                <div className="p-3">
                                  <Calendar
                                    mode="single"
                                    selected={fromDate}
                                    onSelect={(date) => {
                                      setFromDate(date);
                                    }}
                                    className="p-0 calendar-dark"
                                  />
                                  <div className="mt-4 flex gap-2 items-center">
                                    <div className="text-sm font-medium">
                                      Time:
                                    </div>
                                    <Input
                                      type="time"
                                      step="1"
                                      value={fromTime}
                                      onChange={(e) =>
                                        setFromTime(e.target.value)
                                      }
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                  <Button
                                    className="mt-4 w-full bg-blue-500 hover:bg-blue-600 text-white"
                                    onClick={() => {
                                      if (fromDate) {
                                        const [hours, minutes, seconds] =
                                          fromTime.split(":").map(Number);
                                        const newDate = new Date(fromDate);
                                        newDate.setHours(
                                          hours || 0,
                                          minutes || 0,
                                          seconds || 0
                                        );
                                        const formattedDate = format(
                                          newDate,
                                          "yyyy-MM-dd HH:mm:ss"
                                        );
                                        setFromInput(formattedDate);
                                      }
                                    }}
                                  >
                                    Apply Date
                                  </Button>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
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
                          <div className="relative flex-1">
                            <Input
                              id="to-input"
                              placeholder="e.g., now"
                              value={toInput}
                              onChange={(e) => setToInput(e.target.value)}
                              className="h-10 pr-10"
                            />
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-0 top-0 h-10 w-10 p-0"
                                >
                                  <CalendarIcon className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-auto p-0"
                                align="end"
                              >
                                <div className="p-3">
                                  <Calendar
                                    mode="single"
                                    selected={toDate}
                                    onSelect={(date) => {
                                      setToDate(date);
                                    }}
                                    className="p-0 calendar-dark"
                                  />
                                  <div className="mt-4 flex gap-2 items-center">
                                    <div className="text-sm font-medium">
                                      Time:
                                    </div>
                                    <Input
                                      type="time"
                                      step="1"
                                      value={toTime}
                                      onChange={(e) =>
                                        setToTime(e.target.value)
                                      }
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                  <Button
                                    className="mt-4 w-full bg-blue-500 hover:bg-blue-600 text-white"
                                    onClick={() => {
                                      if (toDate) {
                                        const [hours, minutes, seconds] = toTime
                                          .split(":")
                                          .map(Number);
                                        const newDate = new Date(toDate);
                                        newDate.setHours(
                                          hours || 23,
                                          minutes || 59,
                                          seconds || 59
                                        );
                                        const formattedDate = format(
                                          newDate,
                                          "yyyy-MM-dd HH:mm:ss"
                                        );
                                        setToInput(formattedDate);
                                      }
                                    }}
                                  >
                                    Apply Date
                                  </Button>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
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
                    <div className="w-[240px] space-y-2 border-l pl-6">
                      <Input
                        placeholder="Search quick ranges..."
                        value={searchQuick}
                        onChange={(e) => setSearchQuick(e.target.value)}
                        className="mb-2 h-9"
                      />
                      <ScrollArea className="h-[240px]">
                        <div className="space-y-1">
                          {filteredQuickRanges.map((range) => (
                            <Button
                              key={range.display || "no-filter"}
                              variant="ghost"
                              className="w-full justify-start text-sm font-normal h-8"
                              onClick={() => applyQuickRange(range)}
                            >
                              {range.display || "No time filter"}
                            </Button>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                </div>

                {/* Timezone Section */}
                <div className="p-4 border-t space-y-3">
                  <div className="text-xs text-muted-foreground">
                    Time zone
                  </div>
                  <div className="space-y-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-between h-9 text-xs"
                          id="timezone-select"
                        >
                          <div className="flex items-center">
                            <Globe className="h-3.5 w-3.5 mr-2" />
                            <span>{formatTimezone(selectedTimeZone)}</span>
                          </div>
                          <div className="opacity-70">
                            {getTimezoneOffset(selectedTimeZone)}
                          </div>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[320px] p-0" align="start">
                        <div className="p-2 border-b">
                          <Input
                            placeholder="Type to search (country, city, abbreviation)"
                            value={timezoneSearch}
                            onChange={(e) => setTimezoneSearch(e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                        <ScrollArea className="h-[300px]">
                          <div className="p-2">
                            {TIMEZONE_CATEGORIES.map((category) => {
                              // Filter zones based on search query
                              const filteredZones = category.zones.filter(
                                (zone) => {
                                  if (!timezoneSearch) return true;
                                  const search = timezoneSearch.toLowerCase();
                                  return (
                                    zone.toLowerCase().includes(search) ||
                                    formatTimezone(zone)
                                      .toLowerCase()
                                      .includes(search) ||
                                    getTimezoneOffset(zone)
                                      .toLowerCase()
                                      .includes(search)
                                  );
                                }
                              );

                              // Skip empty categories
                              if (filteredZones.length === 0) return null;

                              return (
                                <div key={category.name} className="mb-2">
                                  {timezoneSearch ? null : (
                                    <div className="text-xs font-medium text-muted-foreground py-1">
                                      {category.name}
                                    </div>
                                  )}
                                  {filteredZones.map((zone) => {
                                    const isBrowserDefault =
                                      category.name === "Browser Time";
                                    const displayZone = isBrowserDefault
                                      ? `Browser Time ${zone
                                          .split("/")
                                          .pop()
                                          ?.replace(/_/g, " ")}`
                                      : formatTimezone(zone);

                                    const offset = getTimezoneOffset(zone);

                                    return (
                                      <Button
                                        key={zone}
                                        variant="ghost"
                                        className={`w-full justify-between text-xs font-normal h-8 ${
                                          zone === selectedTimeZone
                                            ? "bg-muted"
                                            : ""
                                        }`}
                                        onClick={() =>
                                          handleTimezoneChange(zone)
                                        }
                                      >
                                        <span>{displayZone}</span>
                                        <span className="text-muted-foreground">
                                          {offset}
                                        </span>
                                      </Button>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
                  </div>
                  {/* Field Info and Current Time Footer */}
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <div>Current Time:</div>
                    <div className="font-mono">{currentTime}</div>
                  </div>
                  {selectedTimeFieldDetails && (
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <div>Field Type:</div>
                      <div className="font-mono">
                        {selectedTimeFieldDetails.dataType.toUpperCase()}
                        {selectedTimeFieldDetails.timeUnit &&
                          ` (${selectedTimeFieldDetails.timeUnit})`}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </PopoverContent>
        </Popover>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 p-1.5 border-0 bg-transparent hover:bg-muted/30"
          onClick={executeQueryWithFilters}
          title="Execute query with time filters"
        >
          <Play className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
