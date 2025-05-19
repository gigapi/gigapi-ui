import React from "react";
import { useQuery } from "@/contexts/QueryContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InfoIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const SettingsContent: React.FC = () => {
  const { format, setFormat } = useQuery();

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardContent className="p-0">
        <div className="flex flex-col gap-4 w-full">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="format-select" className="text-sm font-medium">
                Query Response Format
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-80">
                    <p className="font-medium">About response formats:</p>
                    <ul className="list-disc pl-4 mt-1 space-y-1 text-xs">
                      <li>
                        <span className="font-semibold">json</span>: Standard JSON format with a "results" array containing all data
                      </li>
                      <li>
                        <span className="font-semibold">ndjson</span>: Newline-Delimited JSON - each line is a valid JSON object. 
                        <span className="block mt-1 text-green-500">
                          Significantly more memory efficient and faster for large datasets. 
                          Reduces memory usage and speeds up processing for high-volume queries.
                        </span>
                      </li>
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select
              value={format}
              onValueChange={(value) => setFormat(value)}
            >
              <SelectTrigger id="format-select" className="w-full">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">json</SelectItem>
                <SelectItem value="ndjson">ndjson</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SettingsContent;
