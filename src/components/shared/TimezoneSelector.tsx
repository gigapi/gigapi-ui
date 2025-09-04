import { useState } from "react";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  formatTimezone,
  getTimezoneOffset,
  getBrowserTimezone,
} from "@/lib/";

interface TimezoneSelectorProps {
  selectedTimeZone: string;
  onTimeZoneChange: (timezone: string) => void;
  className?: string;
}

// Timezone categories
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
      "America/Santiago",
      "America/Bogota",
      "America/Lima",
      "America/Mexico_City",
      "America/Caracas",
      "America/Sao_Paulo",
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

export default function TimezoneSelector({
  selectedTimeZone,
  onTimeZoneChange,
  className,
}: TimezoneSelectorProps) {
  const [timezoneSearch, setTimezoneSearch] = useState("");

  const handleTimezoneChange = (tz: string) => {
    onTimeZoneChange(tz);
    toast.success(`Timezone set to ${tz}`, {
      description: "Time filtering will use this timezone for calculations",
    });
  };

  return (
    <div className={className}>
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
                const filteredZones = category.zones.filter((zone) => {
                  if (!timezoneSearch) return true;
                  const search = timezoneSearch.toLowerCase();
                  return (
                    zone.toLowerCase().includes(search) ||
                    formatTimezone(zone).toLowerCase().includes(search) ||
                    getTimezoneOffset(zone).toLowerCase().includes(search)
                  );
                });

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
                      const isBrowserDefault = category.name === "Browser Time";
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
                            zone === selectedTimeZone ? "bg-muted" : ""
                          }`}
                          onClick={() => handleTimezoneChange(zone)}
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
  );
}
