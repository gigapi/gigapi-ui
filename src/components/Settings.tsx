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
import { AlertTriangle, InfoIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

const SettingsContent: React.FC = () => {
  const { format, setFormat, formatCompatibility } = useQuery();

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
              
              {formatCompatibility?.detected && !formatCompatibility?.supportsNdjson && (
                <Badge 
                  variant="outline"
                  className="ml-auto text-xs py-0 px-2 bg-yellow-500/20 border-yellow-500/30 text-yellow-700 dark:text-yellow-400"
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  NDJSON not supported
                </Badge>
              )}
            </div>
            
            {formatCompatibility?.detected && !formatCompatibility?.supportsNdjson && (
              <Alert variant="warning" className="py-2 bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-400 mb-2">
                <AlertDescription className="text-xs">
                  Your API appears to only support JSON format, not NDJSON. 
                  Consider upgrading to a newer version of the GigaPI engine that supports the more efficient NDJSON format.
                </AlertDescription>
              </Alert>
            )}
            
            <Select
              value={format}
              onValueChange={(value) => setFormat(value)}
            >
              <SelectTrigger id="format-select" className="w-full">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">json</SelectItem>
                <SelectItem value="ndjson" disabled={formatCompatibility?.detected && !formatCompatibility?.supportsNdjson}>
                  ndjson 
                  {formatCompatibility?.detected && !formatCompatibility?.supportsNdjson && (
                    <span className="ml-2 text-red-500 text-xs">not supported</span>
                  )}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SettingsContent;
