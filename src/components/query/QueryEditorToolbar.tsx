import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  Copy,
  Eraser,
  Share,
  MessageCircle,
  Bot,
  Share2,
  RefreshCw,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Loader from "@/components/shared/Loader";
import { HashQueryUtils } from "@/lib/";
import { toast } from "sonner";
import type { TimeRange } from "@/types/utils.types";

interface QueryEditorToolbarProps {
  isLoading: boolean;
  selectedDb?: string;
  selectedTable?: string;
  selectedTimeField?: string;
  timeRange: TimeRange;
  query: string;
  mcpConnected: boolean;
  showChatPanel: boolean;
  chatSessionsCount?: number;
  onRunQuery: () => void;
  onClearQuery: () => void;
  onToggleChat: () => void;
  onRefreshSchema?: () => void;
}

export default function QueryEditorToolbar({
  isLoading,
  selectedDb,
  selectedTable,
  selectedTimeField,
  timeRange,
  query,
  mcpConnected,
  showChatPanel,
  chatSessionsCount = 0,
  onRunQuery,
  onClearQuery,
  onToggleChat,
  onRefreshSchema,
}: QueryEditorToolbarProps) {
  const copyQuery = async () => {
    if (!query.trim()) {
      toast.error("No query to copy");
      return;
    }

    try {
      await navigator.clipboard.writeText(query);
      toast.success("Query copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy query");
    }
  };

  const shareQuery = async () => {
    if (!query.trim()) {
      toast.error("No query to share");
      return;
    }

    const params = {
      query: query.trim(),
      db: selectedDb,
      table: selectedTable,
      timeField: selectedTimeField,
      timeFrom: timeRange?.from,
      timeTo: timeRange?.to,
    };

    try {
      const success = await HashQueryUtils.copyShareableUrl(params);
      if (success) {
        toast.success("Shareable URL copied to clipboard");
      } else {
        toast.error("Failed to copy URL");
      }
    } catch (error) {
      toast.error("Failed to generate shareable URL");
    }
  };

  return (
    <>
      {/* Desktop Layout */}
      <div className="hidden lg:flex items-center p-2">
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onRunQuery}
                  disabled={isLoading || !selectedDb}
                  className="h-8 px-3"
                  variant="default"
                >
                  {isLoading ? (
                    <>
                      <Loader className="h-4 w-4" />
                      <span className="ml-1">Running...</span>
                    </>
                  ) : (
                    <>
                      <Play className="mr-1.5 h-3.5 w-3.5" />
                      Run Query
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">⌘R or ⌘Enter</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={shareQuery}
                    className="h-8 w-8 p-0"
                    disabled={!query.trim()}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">Copy shareable URL</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyQuery}
                    className="h-8 w-8 p-0"
                    disabled={!query.trim()}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">Copy query</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={onClearQuery}
                    disabled={!query.trim()}
                  >
                    <Eraser className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">Clear query</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {onRefreshSchema && selectedTable && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={onRefreshSchema}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">Refresh table schema</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <div className="h-5 w-px bg-border mx-1"></div>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showChatPanel ? "default" : "outline"}
                    size="sm"
                    className="h-8 px-3 relative bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 text-white border-0"
                    onClick={onToggleChat}
                  >
                    {mcpConnected ? (
                      <Bot className="h-3.5 w-3.5" />
                    ) : (
                      <MessageCircle className="h-3.5 w-3.5" />
                    )}
                    {chatSessionsCount > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-1.5 h-4 px-1 flex items-center justify-center text-xs bg-white/20 text-white border-0"
                      >
                        {chatSessionsCount > 9 ? "9+" : chatSessionsCount}
                      </Badge>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">
                    {showChatPanel ? "Hide" : "Show"} AI assistant
                    {mcpConnected
                      ? ` (${chatSessionsCount} sessions)`
                      : " (Setup required)"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* Mobile/Tablet Layout */}
      <div className="lg:hidden bg-card rounded-md border p-2 space-y-2">
        {/* First Row: Run Query and Action Buttons */}
        <div className="flex items-center justify-between">
          <Button
            onClick={onRunQuery}
            disabled={isLoading || !selectedDb}
            className="h-8 px-3 flex-shrink-0"
            variant="default"
          >
            {isLoading ? (
              <>
                <Loader className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Running...</span>
              </>
            ) : (
              <>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                <span className="hidden sm:inline">Run Query</span>
                <span className="sm:hidden">Run</span>
              </>
            )}
          </Button>

          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={shareQuery}
                    className="h-8 w-8 p-0"
                    disabled={!query.trim()}
                  >
                    <Share className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">Share</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyQuery}
                    className="h-8 w-8 p-0"
                    disabled={!query.trim()}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">Copy</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={onClearQuery}
                    disabled={!query.trim()}
                  >
                    <Eraser className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">Clear</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {onRefreshSchema && selectedTable && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={onRefreshSchema}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">Refresh</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showChatPanel ? "default" : "outline"}
                    size="sm"
                    className="h-8 px-2 relative bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 text-white border-0"
                    onClick={onToggleChat}
                  >
                    {mcpConnected ? (
                      <Bot className="h-3.5 w-3.5 mr-1" />
                    ) : (
                      <MessageCircle className="h-3.5 w-3.5 mr-1" />
                    )}
                    <span className="text-xs sm:inline hidden">AI</span>
                    {chatSessionsCount > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-1 h-4 w-4 p-0 flex items-center justify-center text-xs bg-white/20 text-white border-0"
                      >
                        {chatSessionsCount > 9 ? "9+" : chatSessionsCount}
                      </Badge>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">
                    {showChatPanel ? "Hide" : "Show"} AI assistant
                    {mcpConnected
                      ? ` (${chatSessionsCount} sessions)`
                      : " (Setup required)"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </>
  );
}
