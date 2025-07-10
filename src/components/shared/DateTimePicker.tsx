import { useState, useEffect } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import {
  format,
  parse,
  isValid,
  setHours,
  setMinutes,
  setSeconds,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/";

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function DateTimePicker({
  value,
  onChange,
  placeholder = "e.g., now-1h",
}: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const getInitialDate = () => {
    if (value) {
      // Try parsing formats, from most specific to least
      let d = parse(value, "yyyy-MM-dd HH:mm:ss", new Date());
      if (isValid(d)) return d;
      d = parse(value, "yyyy-MM-dd", new Date());
      if (isValid(d)) return d;
      // Fallback for ISO strings etc.
      d = new Date(value);
      if (isValid(d)) return d;
    }
    // Default to now
    return new Date();
  };

  const [date, setDate] = useState<Date>(new Date());

  // When the popover opens, initialize the date from the value prop
  useEffect(() => {
    if (isOpen) {
      setDate(getInitialDate());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleDateSelect = (selectedDay: Date | undefined) => {
    if (!selectedDay) return;
    // The calendar only returns a date part. We need to preserve the time.
    const newDate = setSeconds(
      setMinutes(setHours(selectedDay, date.getHours()), date.getMinutes()),
      date.getSeconds()
    );
    setDate(newDate);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const timeValue = e.target.value;
    if (!timeValue) return;
    const [hours, minutes, seconds] = timeValue.split(":").map(Number);
    let newDate = setHours(date, hours || 0);
    newDate = setMinutes(newDate, minutes || 0);
    newDate = setSeconds(newDate, seconds || 0);
    setDate(newDate);
  };

  const handleApply = () => {
    const formattedDate = format(date, "yyyy-MM-dd HH:mm:ss");
    onChange(formattedDate);
    setIsOpen(false);
  };

  const setTimePreset = (
    preset: "now" | "startOfDay" | "endOfDay" | "noon"
  ) => {
    let newDate = new Date(date);
    switch (preset) {
      case "now":
        const now = new Date();
        newDate = setSeconds(
          setMinutes(setHours(newDate, now.getHours()), now.getMinutes()),
          now.getSeconds()
        );
        break;
      case "startOfDay":
        newDate = setSeconds(setMinutes(setHours(newDate, 0), 0), 0);
        break;
      case "endOfDay":
        newDate = setSeconds(setMinutes(setHours(newDate, 23), 59), 59);
        break;
      case "noon":
        newDate = setSeconds(setMinutes(setHours(newDate, 12), 0), 0);
        break;
    }
    setDate(newDate);
  };

  const timeValue = format(date, "HH:mm:ss");

  return (
    <div className="relative flex-1">
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 pr-10"
      />
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-10 w-10 p-0 hover:bg-muted"
            aria-label="Open date and time picker"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <div className="p-3">
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleDateSelect}
              className="rounded-md border-0"
              classNames={{
                months:
                  "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                month: "space-y-4",
                caption: "flex justify-center pt-1 relative items-center",
                caption_label: "text-sm font-medium",
                nav: "space",

                day: cn(
                  "inline-flex items-center justify-center rounded-md text-sm font-normal transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
                ),
                day_selected:
                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
              }}
            />
          </div>
          <div className="p-3 border-t border-border space-y-4">
            <div className="space-y-2">
              <Label htmlFor="time" className="text-sm font-medium">
                Time
              </Label>
              <Input
                id="time"
                type="time"
                step="1"
                value={timeValue}
                onChange={handleTimeChange}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Quick Select
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setTimePreset("now")}
                >
                  Now
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setTimePreset("startOfDay")}
                >
                  Start of Day
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setTimePreset("endOfDay")}
                >
                  End of Day
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setTimePreset("noon")}
                >
                  Noon
                </Button>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <p className="text-sm font-mono">
                {format(date, "MMM dd, yyyy, HH:mm:ss")}
              </p>
            </div>

            <Button onClick={handleApply} className="w-full">
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
