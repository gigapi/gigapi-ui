import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import "@/components/ui/calendar.css";

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  defaultTime?: string;
}

export default function DateTimePicker({
  value,
  onChange,
  placeholder = "e.g., now-1h",
  label = "Time",
  defaultTime = "00:00:00",
}: DateTimePickerProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date()
  );
  const [timeValue, setTimeValue] = useState(defaultTime);

  const handleApplyDate = () => {
    if (selectedDate) {
      const [hours, minutes, seconds] = timeValue.split(":").map(Number);
      const newDate = new Date(selectedDate);
      newDate.setHours(hours || 0, minutes || 0, seconds || 0);
      const formattedDate = format(newDate, "yyyy-MM-dd HH:mm:ss");
      onChange(formattedDate);
    }
  };

  return (
    <div className="relative flex-1">
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
        <PopoverContent className="w-auto p-0" align="end">
          <div className="p-3">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              className="p-0 calendar-dark"
            />
            <div className="mt-4 flex gap-2 items-center">
              <div className="text-sm font-medium">{label}:</div>
              <Input
                type="time"
                step="1"
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <Button
              className="mt-4 w-full bg-blue-500 hover:bg-blue-600 text-white"
              onClick={handleApplyDate}
            >
              Apply Date
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
