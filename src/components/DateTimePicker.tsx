import { useState, useEffect, useRef } from "react";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { format, parse, isValid } from "date-fns";
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
  defaultTime?: string;
}

export default function DateTimePicker({
  value,
  onChange,
  placeholder = "e.g., now-1h",
  defaultTime = "00:00:00",
}: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [timeValue, setTimeValue] = useState(defaultTime);
  const [step, setStep] = useState<"date" | "time">("date");
  const timeInputRef = useRef<HTMLInputElement>(null);

  // Initialize with current value if it's a valid date
  useEffect(() => {
    if (value && value !== placeholder) {
      try {
        // Try to parse various date formats
        let parsedDate: Date | null = null;
        
        // Try ISO format first
        if (value.match(/^\d{4}-\d{2}-\d{2}(\s+|T)\d{2}:\d{2}:\d{2}/)) {
          parsedDate = new Date(value);
        }
        // Try other common formats
        else if (value.match(/^\d{4}-\d{2}-\d{2}$/)) {
          parsedDate = parse(value, "yyyy-MM-dd", new Date());
        }
        
        if (parsedDate && isValid(parsedDate)) {
          setSelectedDate(parsedDate);
          setTimeValue(format(parsedDate, "HH:mm:ss"));
        }
      } catch (e) {
        // If parsing fails, use current date
        setSelectedDate(new Date());
      }
    } else {
      setSelectedDate(new Date());
    }
  }, [value, placeholder]);

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      // Auto-advance to time selection
      setStep("time");
      // Focus the time input after a brief delay
      setTimeout(() => {
        timeInputRef.current?.focus();
      }, 150);
    }
  };

  const handleApplyDateTime = () => {
    if (selectedDate) {
      const [hours, minutes, seconds] = timeValue.split(":").map(Number);
      const newDate = new Date(selectedDate);
      newDate.setHours(hours || 0, minutes || 0, seconds || 0);
      const formattedDate = format(newDate, "yyyy-MM-dd HH:mm:ss");
      onChange(formattedDate);
      setIsOpen(false);
      setStep("date"); // Reset for next time
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setStep("date"); // Always start with date selection
    }
  };

  const handleBackToDate = () => {
    setStep("date");
  };

  // Quick time presets
  const timePresets = [
    { label: "Now", value: format(new Date(), "HH:mm:ss") },
    { label: "Start of Day", value: "00:00:00" },
    { label: "End of Day", value: "23:59:59" },
    { label: "Noon", value: "12:00:00" },
  ];

  return (
    <div className="relative flex-1">
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 pr-10"
      />
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-10 w-10 p-0 hover:bg-muted"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <div className="flex flex-col">
            {/* Header with step indicator */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center space-x-2">
                <div className={cn(
                  "flex items-center space-x-1 text-sm",
                  step === "date" ? "text-primary font-medium" : "text-muted-foreground"
                )}>
                  <CalendarIcon className="h-4 w-4" />
                  <span>1. Date</span>
                </div>
                <div className="text-muted-foreground">→</div>
                <div className={cn(
                  "flex items-center space-x-1 text-sm",
                  step === "time" ? "text-primary font-medium" : "text-muted-foreground"
                )}>
                  <Clock className="h-4 w-4" />
                  <span>2. Time</span>
                </div>
              </div>
              {step === "time" && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleBackToDate}
                  className="text-xs"
                >
                  ← Back
                </Button>
              )}
            </div>

            {step === "date" && (
              <div className="p-3">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  className="rounded-md border-0"
                  classNames={{
                    months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                    month: "space-y-4",
                    caption: "flex justify-center pt-1 relative items-center",
                    caption_label: "text-sm font-medium",
                    nav: "space-x-1 flex items-center",
                    nav_button: cn(
                      "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
                    ),
                    nav_button_previous: "absolute left-1",
                    nav_button_next: "absolute right-1",
                    table: "w-full border-collapse space-y-1",
                    head_row: "flex",
                    head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
                    row: "flex w-full mt-2",
                    cell: "text-center text-sm p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                    day: cn(
                      "inline-flex items-center justify-center rounded-md text-sm font-normal transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
                    ),
                    day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                    day_today: "bg-accent text-accent-foreground",
                    day_outside: "text-muted-foreground opacity-50",
                    day_disabled: "text-muted-foreground opacity-50",
                    day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
                    day_hidden: "invisible",
                  }}
                />
                <div className="mt-3 text-center">
                  <p className="text-xs text-muted-foreground">
                    Select a date to continue to time selection
                  </p>
                </div>
              </div>
            )}

            {step === "time" && (
              <div className="p-4 space-y-4">
                <div>
                  <Label htmlFor="time-input" className="text-sm font-medium">
                    Select Time
                  </Label>
                  <div className="mt-2">
                    <Input
                      id="time-input"
                      ref={timeInputRef}
                      type="time"
                      step="1"
                      value={timeValue}
                      onChange={(e) => setTimeValue(e.target.value)}
                      className="h-10 text-sm font-mono"
                    />
                  </div>
                </div>

                {/* Quick time presets */}
                <div>
                  <Label className="text-xs text-muted-foreground">Quick Select</Label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {timePresets.map((preset) => (
                      <Button
                        key={preset.label}
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setTimeValue(preset.value)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Selected datetime preview */}
                {selectedDate && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <Label className="text-xs text-muted-foreground">Preview</Label>
                    <div className="mt-1 font-mono text-sm">
                      {format(selectedDate, "MMM dd, yyyy")} at {timeValue}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBackToDate}
                    className="flex-1"
                  >
                    Back to Date
                  </Button>
                  <Button
                    onClick={handleApplyDateTime}
                    size="sm"
                    className="flex-1"
                    disabled={!selectedDate}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
