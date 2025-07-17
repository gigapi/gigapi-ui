import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { QUICK_RANGES, NO_TIME_FILTER } from "@/types/utils.types";
import type { TimeRange } from "@/types/index";

interface QuickRangesProps {
  onRangeSelect: (range: TimeRange) => void;
  className?: string;
}

export default function QuickRanges({
  onRangeSelect,
  className,
}: QuickRangesProps) {
  const [searchQuick, setSearchQuick] = useState("");

  const filteredQuickRanges = useMemo(() => {
    const allRanges = [NO_TIME_FILTER, ...QUICK_RANGES];

    if (!searchQuick) return allRanges;

    const search = searchQuick.toLowerCase();
    return allRanges.filter((range) =>
      range.display?.toLowerCase().includes(search)
    );
  }, [searchQuick]);

  return (
    <div className={className}>
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
              onClick={() => onRangeSelect(range)}
            >
              {range.display || "No time filter"}
            </Button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
