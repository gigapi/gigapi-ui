import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Eye, 
  ChevronDown, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle, 
  Clock,
  Zap
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TimeRange } from "@/types/utils.types";

interface TimeVariablesPreviewProps {
  hasTimeVariables: boolean;
  selectedTimeField?: string;
  timeRange: TimeRange;
  processedQueryPreview: {
    hasTimeVariables: boolean;
    processedQuery: string;
    errors: string[];
  } | null;
  editorContent: string;
  contextQuery: string;
}

export default function TimeVariablesPreview({
  hasTimeVariables,
  selectedTimeField,
  timeRange,
  processedQueryPreview,
  editorContent,
  contextQuery,
}: TimeVariablesPreviewProps) {
  const [showProcessedQuery, setShowProcessedQuery] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  if (!hasTimeVariables) {
    return null;
  }

  const isTimeFieldReady = Boolean(selectedTimeField);
  const isTimeRangeReady = Boolean(timeRange?.enabled && timeRange?.from && timeRange?.to);
  const isTimeFilterReady = isTimeFieldReady && isTimeRangeReady;
  const hasValidationErrors = processedQueryPreview?.errors && processedQueryPreview.errors.length > 0;
  const isSynced = editorContent === contextQuery;

  // Determine overall status
  const getOverallStatus = (): { status: 'ready' | 'warning' | 'error'; label: string } => {
    if (hasValidationErrors) {
      return { status: 'error', label: 'Error' };
    }
    if (!isTimeFieldReady || !isTimeRangeReady) {
      return { status: 'warning', label: 'Setup Required' };
    }
    if (!isSynced) {
      return { status: 'warning', label: 'Updating...' };
    }
    return { status: 'ready', label: 'Ready' };
  };

  const overallStatus = getOverallStatus();

  const StatusIcon = ({ status, ready }: { status: 'ready' | 'warning' | 'error'; ready: boolean }) => {
    if (status === 'error') {
      return <AlertCircle className="h-3 w-3 text-red-500" />;
    }
    if (status === 'warning') {
      return <Clock className="h-3 w-3 text-yellow-500" />;
    }
    return ready ? (
      <CheckCircle2 className="h-3 w-3 text-green-500" />
    ) : (
      <AlertCircle className="h-3 w-3 text-red-500" />
    );
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="fixed bottom-4 right-4 z-50 shadow-lg"
        >
          <Zap className="h-4 w-4 text-blue-600" />

        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-600" />
            Query Variables Detected
            <Badge 
              variant={overallStatus.status === 'ready' ? 'default' : overallStatus.status === 'warning' ? 'secondary' : 'destructive'}
              className="text-xs"
            >
              {overallStatus.label}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Variable Status Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 p-3 bg-muted/30 rounded border">
                    <StatusIcon status={isTimeFieldReady ? 'ready' : 'error'} ready={isTimeFieldReady} />
                    <div className="flex-1">
                      <div className="font-medium">$__timeField</div>
                      <div className="text-muted-foreground">
                        {selectedTimeField || 'Not set'}
                      </div>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>The selected time field that will replace $__timeField in your query</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 p-3 bg-muted/30 rounded border">
                    <StatusIcon status={isTimeFilterReady ? 'ready' : 'warning'} ready={isTimeFilterReady} />
                    <div className="flex-1">
                      <div className="font-medium">$__timeFilter</div>
                      <div className="text-muted-foreground">
                        {isTimeFilterReady ? 'Ready' : 'Missing requirements'}
                      </div>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Generates a WHERE clause with time range filter. Requires both time field and time range.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 p-3 bg-muted/30 rounded border">
                    <StatusIcon status={isTimeRangeReady ? 'ready' : 'warning'} ready={isTimeRangeReady} />
                    <div className="flex-1">
                      <div className="font-medium">Time Range</div>
                      <div className="text-muted-foreground">
                        {isTimeRangeReady ? timeRange.display || `${timeRange.from} to ${timeRange.to}` : 'Disabled'}
                      </div>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Time range used for $__timeFrom, $__timeTo, and $__timeFilter variables</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 p-3 bg-muted/30 rounded border">
                    <StatusIcon status={hasValidationErrors ? 'error' : 'ready'} ready={!hasValidationErrors} />
                    <div className="flex-1">
                      <div className="font-medium">Validation</div>
                      <div className="text-muted-foreground">
                        {hasValidationErrors ? `${processedQueryPreview?.errors.length} errors` : 'Valid'}
                      </div>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Query validation status - checks if all required variables have values</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Validation Errors */}
          {hasValidationErrors && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded text-sm">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <span className="font-medium text-destructive">Validation Errors:</span>
              </div>
              <ul className="space-y-1 ml-6">
                {processedQueryPreview?.errors.map((error, index) => (
                  <li key={index} className="text-destructive">• {error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Processed Query Preview Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Processed Query Preview</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowProcessedQuery(!showProcessedQuery)}
              className="h-8 px-3"
            >
              {showProcessedQuery ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <span className="ml-1 text-sm">
                {showProcessedQuery ? 'Hide' : 'Show'}
              </span>
            </Button>
          </div>

          {/* Processed Query Preview */}
          {showProcessedQuery && processedQueryPreview && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Eye className="h-4 w-4" />
                What will be sent to the backend:
              </div>
              <div className="bg-muted/50 border rounded p-3 font-mono text-sm whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto">
                {processedQueryPreview.processedQuery}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
