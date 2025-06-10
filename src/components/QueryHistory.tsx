import { useState, useEffect } from "react";
import { useQuery } from "@/contexts/QueryContext";
import { useTime } from "@/contexts/TimeContext";
import { useDatabase } from "@/contexts/DatabaseContext";
import { checkForTimeVariables } from "@/lib/";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  History,
  Copy,
  Search,
  Trash2,
  Calendar,
  Database as DbIcon,
  Clock,
  Table,
  Variable,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatDate } from "@/lib/";

// Use the same type as in QueryContext
type HistoryItem = {
  id: string;
  query: string;
  db: string;
  table: string | null;
  timestamp: string;
  timeField: string | null;
  timeRange: any | null;
  success: boolean;
  error?: string;
  executionTime?: number;
  rowCount?: number;
};

export default function QueryHistory() {
  const { setQuery, queryHistory, clearQueryHistory } = useQuery();
  const { setSelectedTimeField, setTimeRange } = useTime();
  const { setSelectedDb, setSelectedTable } = useDatabase();
  const [localHistory, setLocalHistory] = useState<HistoryItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  // Load query history from context when sheet opens
  useEffect(() => {
    if (isOpen) {
      setLocalHistory(queryHistory || []);
    }
  }, [isOpen, queryHistory]);

  // Load a query from history with all its context
  function loadQueryFromHistory(item: HistoryItem) {
    // First set the database (this might trigger schema loading)
    setSelectedDb(item.db);

    // Restore the original query with variables
    setQuery(item.query);

    // Restore the table if available
    if (item.table) {
      setSelectedTable(item.table);
    }

    // Restore the time field if available
    if (item.timeField) {
      setSelectedTimeField(item.timeField);
    }

    // Restore the time range if available
    if (item.timeRange) {
      setTimeRange(item.timeRange);
    }

    setIsOpen(false);
    toast.success("Query context restored");
  }

  // Clear all history using context method
  function clearHistory() {
    clearQueryHistory();
    setLocalHistory([]);
    toast.success("History cleared");
    setConfirmDialogOpen(false);
  }

  // Truncate query for display
  function truncateQuery(query: string, maxLength: number = 120): string {
    if (query.length <= maxLength) return query;
    return `${query.substring(0, maxLength)}...`;
  }

  // Check if query contains time variables
  function hasTimeVariables(query: string): boolean {
    return checkForTimeVariables(query);
  }

  // Filter the history based on search term
  const filteredHistory = localHistory.filter((item) => {
    if (!searchTerm) return true;

    const searchLower = searchTerm.toLowerCase();
    return (
      item.query.toLowerCase().includes(searchLower) ||
      item.db.toLowerCase().includes(searchLower) ||
      (item.table && item.table.toLowerCase().includes(searchLower)) ||
      (item.timeField && item.timeField.toLowerCase().includes(searchLower))
    );
  });

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="outline">
            <History className="h-5 w-5" /> History
          </Button>
        </SheetTrigger>
        <SheetContent
          className="w-full sm:max-w-md md:max-w-lg bg-background"
          side="right"
        >
          <SheetHeader className="space-y-1">
            <SheetTitle className="text-xl">Query History</SheetTitle>
            <SheetDescription>
              View and reuse your recent queries
            </SheetDescription>
          </SheetHeader>

          {/* Search and Clear */}
          <div className="flex items-center justify-between gap-4 mt-4 mb-2 px-4">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search queries..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDialogOpen(true)}
              disabled={localHistory.length === 0}
              title="Clear history"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>

          <ScrollArea className="h-[calc(100vh-10rem)] mt-2 px-4">
            <div className="space-y-2">
              {filteredHistory.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  {localHistory.length === 0 ? (
                    <>
                      <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No query history yet</p>
                      <p className="text-sm mt-1">
                        Executed queries will appear here
                      </p>
                    </>
                  ) : (
                    <>
                      <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No results match your search</p>
                    </>
                  )}
                </div>
              )}

              {filteredHistory.map((item, index) => (
                <div
                  key={item.id || index}
                  className="border rounded-md p-2 hover:bg-muted/40 cursor-pointer transition-colors group"
                  onClick={() => loadQueryFromHistory(item)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      <Badge
                        variant="outline"
                        className="h-5 px-1.5 flex items-center gap-1 font-normal bg-primary/5 hover:bg-primary/10 text-xs"
                      >
                        <DbIcon className="h-3 w-3" />
                        {item.db}
                      </Badge>

                      {item.table && (
                        <Badge
                          variant="outline"
                          className="h-5 px-1.5 flex items-center gap-1 font-normal bg-muted hover:bg-muted/80 text-xs"
                        >
                          <Table className="h-3 w-3" />
                          {item.table}
                        </Badge>
                      )}

                      {/* Only show time field badge if query has time variables AND timeField is not null */}
                      {item.timeField && hasTimeVariables(item.query) && (
                        <Badge
                          variant="outline"
                          className="h-5 px-1.5 flex items-center gap-1 font-normal bg-blue-500/10 hover:bg-blue-500/20 text-xs text-blue-600 dark:text-blue-400"
                        >
                          <Clock className="h-3 w-3" />
                          {item.timeField}
                        </Badge>
                      )}

                      {/* Only show variables badge if query has time variables */}
                      {hasTimeVariables(item.query) && (
                        <Badge
                          variant="outline"
                          className="h-5 px-1.5 flex items-center gap-1 font-normal bg-amber-500/10 hover:bg-amber-500/20 text-xs text-amber-600 dark:text-amber-400"
                        >
                          <Variable className="h-3 w-3" />
                          Variables
                        </Badge>
                      )}

                      <span className="text-xs flex items-center gap-1 text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {formatDate(item.timestamp)}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(item.query);
                        toast.success("Query copied to clipboard");
                      }}
                      title="Copy query"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="font-mono text-xs text-foreground/80 whitespace-pre-wrap break-all leading-snug bg-muted/30 rounded p-1.5 max-h-24 overflow-hidden">
                    {truncateQuery(item.query)}
                  </div>

                  {/* Only show time range if query has time variables AND timeRange is not null */}
                  {item.timeRange && hasTimeVariables(item.query) && (
                    <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>
                        Range:{" "}
                        {item.timeRange.display ||
                          `${item.timeRange.from} to ${item.timeRange.to}`}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clear Query History</DialogTitle>
            <DialogDescription>
              This will permanently delete all saved queries. This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={clearHistory}>
              Clear All History
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
