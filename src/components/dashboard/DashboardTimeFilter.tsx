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
import { format } from "date-fns";
import { toast } from "sonner";
import {
  type TimeRange,
  type RelativeTimeRange,
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
  {
    label: "Last 5 minutes",
    value: { type: "relative", from: "5m", to: "now" },
  },
  {
    label: "Last 15 minutes",
    value: { type: "relative", from: "15m", to: "now" },
  },
  {
    label: "Last 30 minutes",
    value: { type: "relative", from: "30m", to: "now" },
  },
  { label: "Last 1 hour", value: { type: "relative", from: "1h", to: "now" } },
  { label: "Last 3 hours", value: { type: "relative", from: "3h", to: "now" } },
  { label: "Last 6 hours", value: { type: "relative", from: "6h", to: "now" } },
  {
    label: "Last 12 hours",
    value: { type: "relative", from: "12h", to: "now" },
  },
  {
    label: "Last 24 hours",
    value: { type: "relative", from: "24h", to: "now" },
  },
  { label: "Last 2 days", value: { type: "relative", from: "2d", to: "now" } },
  { label: "Last 7 days", value: { type: "relative", from: "7d", to: "now" } },
  {
    label: "Last 30 days",
    value: { type: "relative", from: "30d", to: "now" },
  },
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
    const quick = QUICK_TIME_RANGES.find(
      (q) => q.value.from === timeRange.from && q.value.to === timeRange.to
    );
    return quick ? quick.label : `Last ${timeRange.from}`;
  } else {
    try {
      const fromDate =
        timeRange.from instanceof Date
          ? timeRange.from
          : new Date(timeRange.from);
      const toDate =
        timeRange.to instanceof Date ? timeRange.to : new Date(timeRange.to);

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
  const [fromInput, setFromInput] = useState<string>(
    timeRange.type === "absolute"
      ? timeRange.from instanceof Date
        ? timeRange.from.toISOString()
        : String(timeRange.from)
      : "now-5m"
  );
  const [toInput, setToInput] = useState<string>(
    timeRange.type === "absolute"
      ? timeRange.to instanceof Date
        ? timeRange.to.toISOString()
        : String(timeRange.to)
      : "now"
  );

  const handleQuickRangeSelect = (range: RelativeTimeRange) => {
    onTimeRangeChange(range);
    setIsOpen(false);
  };

  const handleCustomRangeApply = () => {
    try {
      // Try to parse as relative time first (now-5m, etc.)
      const fromValue = fromInput.trim();
      const toValue = toInput.trim();

      if (!fromValue || !toValue) {
        throw new Error("Both from and to times are required");
      }

      // For now, create a relative time range
      const relativeRange: RelativeTimeRange = {
        type: "relative",
        from: fromValue.startsWith("now")
          ? fromValue.replace("now-", "")
          : fromValue,
        to: "now" as const,
      };

      onTimeRangeChange(relativeRange);
      setIsOpen(false);
    } catch (error) {
      console.error("Invalid time range selected:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Invalid time selection";
      toast.error(`${errorMessage}. Please check your time format.`);
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
        <PopoverContent className="w-full max-w-[600px] p-0" align="start">
          <div className="bg-background border rounded-lg shadow-lg">
            {/* Main time input section */}
            <div className="p-6">
              <div className="flex space-x-6">
                {/* Left Pane: Time Inputs */}
                <div className="flex-1 space-y-6">
                  {/* From input */}
                  <div className="space-y-2">
                    <label
                      htmlFor="from-input"
                      className="text-sm font-medium"
                    >
                      From
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={fromInput}
                        onChange={(e) => setFromInput(e.target.value)}
                        placeholder="now-5m"
                        className="w-full"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Examples: now-1h, now-7d, now-1M
                    </div>
                  </div>

                  {/* To input */}
                  <div className="space-y-2">
                    <label
                      htmlFor="to-input"
                      className="text-sm font-medium"
                    >
                      To
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={toInput}
                        onChange={(e) => setToInput(e.target.value)}
                        placeholder="now"
                        className="w-full"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Examples: now, now-1h/h (top of previous hour)
                    </div>
                  </div>

                  {/* Apply Button */}
                  <Button
                    onClick={handleCustomRangeApply}
                    className="w-full h-10 mt-4"
                    variant="default"
                  >
                    Apply time range
                  </Button>
                </div>

                {/* Right Pane: Quick Ranges */}
                <div className="w-[240px] space-y-2 border-l pl-6">
                  <div className="text-sm font-medium mb-3">Quick ranges</div>
                  
                  {/* Quick range options */}
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
              </div>
            </div>

            {/* Timezone Section */}
            {showTimeZone && (
              <div className="p-4 border-t space-y-3">
                <div className="text-xs text-muted-foreground">Time zone</div>
                <Select value={timeZone} onValueChange={onTimeZoneChange}>
                  <SelectTrigger className="w-full">
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
