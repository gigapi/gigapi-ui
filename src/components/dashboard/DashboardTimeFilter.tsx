import { useState } from "react";
import { CalendarDays, Globe } from "lucide-react";
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
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
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
  disabled?: boolean;
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
    const from = format(new Date(timeRange.from), "MMM dd, HH:mm");
    const to = format(new Date(timeRange.to), "MMM dd, HH:mm");
    return `${from} - ${to}`;
  }
}

export function DashboardTimeFilter({
  timeRange,
  timeZone,
  onTimeRangeChange,
  onTimeZoneChange,
  disabled = false,
}: DashboardTimeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"quick" | "absolute">(
    timeRange.type === "relative" ? "quick" : "absolute"
  );
  const [fromDate, setFromDate] = useState<Date | undefined>(
    timeRange.type === "absolute" ? new Date(timeRange.from) : undefined
  );
  const [toDate, setToDate] = useState<Date | undefined>(
    timeRange.type === "absolute" ? new Date(timeRange.to) : undefined
  );

  const handleQuickRangeSelect = (range: RelativeTimeRange) => {
    onTimeRangeChange(range);
    setIsOpen(false);
  };

  const handleAbsoluteRangeApply = () => {
    if (fromDate && toDate) {
      const absoluteRange: AbsoluteTimeRange = {
        type: "absolute",
        from: fromDate,
        to: toDate,
      };
      onTimeRangeChange(absoluteRange);
      setIsOpen(false);
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
        <PopoverContent className="w-96 p-0" align="start">
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
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="from-date">From</Label>
                    <Calendar
                      mode="single"
                      selected={fromDate}
                      onSelect={setFromDate}
                      disabled={(date) => date > new Date()}
                      className="rounded-md border"
                    />
                  </div>
                  <div>
                    <Label htmlFor="to-date">To</Label>
                    <Calendar
                      mode="single"
                      selected={toDate}
                      onSelect={setToDate}
                      disabled={(date) => date > new Date()}
                      className="rounded-md border"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={handleAbsoluteRangeApply}
                    disabled={!fromDate || !toDate}
                    size="sm"
                  >
                    Apply
                  </Button>
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

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
    </div>
  );
}
