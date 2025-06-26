import { useState } from "react";
import { CalendarDays, Globe, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { format, isValid, isBefore, isAfter, subMinutes } from "date-fns";
import { toast } from "sonner";
import { 
  type TimeRange, 
  type RelativeTimeRange, 
  type AbsoluteTimeRange 
} from "@/types/dashboard.types";

interface DashboardTimeFilterProps {
  timeRange: TimeRange;
  timeZone: string;
  onTimeRangeChange: (timeRange: TimeRange) => void;
  onTimeZoneChange: (timeZone: string) => void;
  onReset?: () => void; // Added reset callback
  disabled?: boolean;
  showTimeZone?: boolean;
}

const QUICK_TIME_RANGES: Array<{ label: string; value: RelativeTimeRange }> = [
  { label: "Last 5 minutes", value: { type: "relative", from: "5m", to: "now" } },
  { label: "Last 15 minutes", value: { type: "relative", from: "15m", to: "now" } },
  { label: "Last 30 minutes", value: { type: "relative", from: "30m", to: "now" } },
  { label: "Last 1 hour", value: { type: "relative", from: "1h", to: "now" } },
  { label: "Last 3 hours", value: { type: "relative", from: "3h", to: "now" } },
  { label: "Last 6 hours", value: { type: "relative", from: "6h", to: "now" } },
  { label: "Last 12 hours", value: { type: "relative", from: "12h", to: "now" } },
  { label: "Last 24 hours", value: { type: "relative", from: "24h", to: "now" } },
  { label: "Last 2 days", value: { type: "relative", from: "2d", to: "now" } },
  { label: "Last 7 days", value: { type: "relative", from: "7d", to: "now" } },
  { label: "Last 30 days", value: { type: "relative", from: "30d", to: "now" } },
];

const TIMEZONES = [
  { label: "UTC", value: "UTC" },
  { label: "America/New_York", value: "America/New_York" },
  { label: "America/Los_Angeles", value: "America/Los_Angeles" },
  { label: "Europe/London", value: "Europe/London" },
  { label: "Europe/Paris", value: "Europe/Paris" },
  { label: "Asia/Tokyo", value: "Asia/Tokyo" },
  { label: "Asia/Shanghai", value: "Asia/Shanghai" },
  { label: "Australia/Sydney", value: "Australia/Sydney" },
];

function formatTimeRange(timeRange: TimeRange): string {
  if (timeRange.type === "relative") {
    const quick = QUICK_TIME_RANGES.find(q => 
      q.value.from === timeRange.from && q.value.to === timeRange.to
    );
    return quick ? quick.label : `Last ${timeRange.from}`;
  } else {
    try {
      const fromDate = timeRange.from instanceof Date ? timeRange.from : new Date(timeRange.from);
      const toDate = timeRange.to instanceof Date ? timeRange.to : new Date(timeRange.to);
      
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return "Invalid time range";
      }
      
      const from = format(fromDate, "MMM dd, HH:mm");
      const to = format(toDate, "MMM dd, HH:mm");
      return `${from} - ${to}`;
    } catch (error) {
      console.error("Error formatting time range:", error);
      return "Invalid time range";
    }
  }
}

export function DashboardTimeFilter({
  timeRange,
  timeZone,
  onTimeRangeChange,
  onTimeZoneChange,
  onReset,
  disabled = false,
  showTimeZone = true,
}: DashboardTimeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"quick" | "absolute">("quick");
  const [fromDate, setFromDate] = useState<Date | undefined>(() => {
    if (timeRange.type === "absolute") {
      try {
        const date = timeRange.from instanceof Date ? timeRange.from : new Date(timeRange.from);
        return isValid(date) ? date : undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  });
  
  const [toDate, setToDate] = useState<Date | undefined>(() => {
    if (timeRange.type === "absolute") {
      try {
        const date = timeRange.to instanceof Date ? timeRange.to : new Date(timeRange.to);
        return isValid(date) ? date : undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  });
  
  const [fromTime, setFromTime] = useState<string>(() => {
    if (timeRange.type === "absolute") {
      try {
        const date = timeRange.from instanceof Date ? timeRange.from : new Date(timeRange.from);
        return isValid(date) ? format(date, "HH:mm") : "00:00";
      } catch {
        return "00:00";
      }
    }
    return "00:00";
  });
  
  const [toTime, setToTime] = useState<string>(() => {
    if (timeRange.type === "absolute") {
      try {
        const date = timeRange.to instanceof Date ? timeRange.to : new Date(timeRange.to);
        return isValid(date) ? format(date, "HH:mm") : "23:59";
      } catch {
        return "23:59";
      }
    }
    return "23:59";
  });

  const handleQuickRangeSelect = (range: RelativeTimeRange) => {
    onTimeRangeChange(range);
    setIsOpen(false);
  };

  const handleAbsoluteRangeApply = () => {
    if (fromDate && toDate) {
      try {
        // Combine date and time for precise time selection
        const [fromHours, fromMinutes] = fromTime.split(':').map(Number);
        const [toHours, toMinutes] = toTime.split(':').map(Number);
        
        // Validate time input format
        if (isNaN(fromHours) || isNaN(fromMinutes) || isNaN(toHours) || isNaN(toMinutes)) {
          throw new Error('Invalid time format');
        }
        
        const fromDateTime = new Date(fromDate);
        fromDateTime.setHours(fromHours, fromMinutes, 0, 0);
        
        const toDateTime = new Date(toDate);
        toDateTime.setHours(toHours, toMinutes, 59, 999);
        
        // Validate the created dates
        if (!isValid(fromDateTime) || !isValid(toDateTime)) {
          throw new Error('Invalid date/time values');
        }
        
        // Check if from date is after to date
        if (isAfter(fromDateTime, toDateTime)) {
          throw new Error('Start time cannot be after end time');
        }
        
        // Check if dates are in the future
        const now = new Date();
        if (isAfter(fromDateTime, now) || isAfter(toDateTime, now)) {
          throw new Error('Cannot select future dates');
        }
        
        // Check if time range is too large (more than 1 year)
        const oneYearAgo = subMinutes(now, 365 * 24 * 60);
        if (isBefore(fromDateTime, oneYearAgo)) {
          throw new Error('Time range too large (maximum 1 year)');
        }
        
        const absoluteRange: AbsoluteTimeRange = {
          type: "absolute",
          from: fromDateTime,
          to: toDateTime,
        };
        
        onTimeRangeChange(absoluteRange);
        setIsOpen(false);
        
      } catch (error) {
        // Handle invalid time range - fallback to last 5 minutes
        console.error('Invalid time range selected:', error);
        
        const errorMessage = error instanceof Error ? error.message : 'Invalid time selection';
        toast.error(`${errorMessage}. Switching to last 5 minutes.`);
        
        // Fallback to last 5 minutes
        const fallbackRange: RelativeTimeRange = {
          type: "relative",
          from: "5m",
          to: "now"
        };
        
        onTimeRangeChange(fallbackRange);
        
        // Reset form to valid defaults
        const now = new Date();
        const fiveMinutesAgo = subMinutes(now, 5);
        setFromDate(fiveMinutesAgo);
        setToDate(now);
        setFromTime(format(fiveMinutesAgo, "HH:mm"));
        setToTime(format(now, "HH:mm"));
        
        setIsOpen(false);
      }
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className="justify-start gap-2 min-w-[200px]"
          >
            <CalendarDays className="h-4 w-4" />
            {formatTimeRange(timeRange)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[700px] p-0" align="start">
          <div className="flex border-b">
            <button
              className={`flex-1 px-4 py-2 text-sm font-medium ${
                activeTab === "quick"
                  ? "border-b-2 border-primary bg-muted"
                  : "hover:bg-muted/50"
              }`}
              onClick={() => setActiveTab("quick")}
            >
              Quick ranges
            </button>
            <button
              className={`flex-1 px-4 py-2 text-sm font-medium ${
                activeTab === "absolute"
                  ? "border-b-2 border-primary bg-muted"
                  : "hover:bg-muted/50"
              }`}
              onClick={() => setActiveTab("absolute")}
            >
              Absolute time
            </button>
          </div>
          
          <div className="p-4">
            {activeTab === "quick" ? (
              <div className="space-y-1">
                {QUICK_TIME_RANGES.map((range) => (
                  <button
                    key={range.label}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-md"
                    onClick={() => handleQuickRangeSelect(range.value)}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  {/* From Date/Time Section */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">From</Label>
                    <div className="space-y-3">
                      <Calendar
                        mode="single"
                        selected={fromDate}
                        onSelect={setFromDate}
                        disabled={(date) => date > new Date()}
                        className="rounded-md border"
                      />
                      <div className="space-y-2">
                        <Label htmlFor="from-time" className="text-xs text-muted-foreground">
                          Time
                        </Label>
                        <Input
                          id="from-time"
                          type="time"
                          value={fromTime}
                          onChange={(e) => setFromTime(e.target.value)}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* To Date/Time Section */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">To</Label>
                    <div className="space-y-3">
                      <Calendar
                        mode="single"
                        selected={toDate}
                        onSelect={setToDate}
                        disabled={(date) => date > new Date()}
                        className="rounded-md border"
                      />
                      <div className="space-y-2">
                        <Label htmlFor="to-time" className="text-xs text-muted-foreground">
                          Time
                        </Label>
                        <Input
                          id="to-time"
                          type="time"
                          value={toTime}
                          onChange={(e) => setToTime(e.target.value)}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex justify-between items-center pt-2 border-t">
                  <div className="text-xs text-muted-foreground">
                    {fromDate && toDate && fromTime && toTime && (
                      <>
                        {format(new Date(`${format(fromDate, 'yyyy-MM-dd')}T${fromTime}`), "MMM dd, yyyy HH:mm")} 
                        {" → "}
                        {format(new Date(`${format(toDate, 'yyyy-MM-dd')}T${toTime}`), "MMM dd, yyyy HH:mm")}
                      </>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setIsOpen(false)}
                      size="sm"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAbsoluteRangeApply}
                      disabled={!fromDate || !toDate}
                      size="sm"
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Reset Button */}
      {onReset && (
        <Button
          variant="outline"
          size="sm"
          onClick={onReset}
          disabled={disabled}
          className="px-2"
          title="Reset to original time range"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      )}

      {showTimeZone && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" disabled={disabled}>
              <Globe className="h-4 w-4" />
              {timeZone}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56" align="start">
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={timeZone} onValueChange={onTimeZoneChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
