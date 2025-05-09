import { useState, useEffect } from "react";
import { useQuery } from "../contexts/QueryContext";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import {
  History,
  Copy,
  Search,
  Trash2,
  Calendar,
  Database as DbIcon,
} from "lucide-react";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { toast } from "sonner";

type HistoryItem = {
  query: string;
  database: string;
  timestamp: string;
};

export default function QueryHistory() {
  const { setQuery, setSelectedDb } = useQuery();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  // Load query history on mount and when sheet opens
  useEffect(() => {
    if (isOpen) {
      loadQueryHistory();
    }

    // Set up storage event listener to update history when it changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "queryHistory" && e.newValue) {
        loadQueryHistory();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [isOpen]);

  // Load query history from localStorage
  function loadQueryHistory() {
    try {
      const savedHistory = localStorage.getItem("queryHistory");
      if (savedHistory) {
        setHistory(JSON.parse(savedHistory));
      }
    } catch (err) {
      console.error("Failed to load query history", err);
      toast.error("Failed to load history");
    }
  }

  // Load a query from history
  function loadQueryFromHistory(item: HistoryItem) {
    setSelectedDb(item.database);
    setQuery(item.query);
    setIsOpen(false);
    toast.success("Query loaded");
  }

  // Clear all history
  function clearHistory() {
    localStorage.removeItem("queryHistory");
    setHistory([]);
    toast.success("History cleared");
    setConfirmDialogOpen(false);
  }

  // Format date for display
  function formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      // If today, just show time
      const today = new Date();
      if (date.toDateString() === today.toDateString()) {
        return `Today at ${date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}`;
      }

      // If yesterday, show "Yesterday"
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (date.toDateString() === yesterday.toDateString()) {
        return `Yesterday at ${date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}`;
      }

      // Otherwise full date
      return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return dateStr;
    }
  }

  // Truncate query for display
  function truncateQuery(query: string, maxLength: number = 120): string {
    if (query.length <= maxLength) return query;
    return `${query.substring(0, maxLength)}...`;
  }

  // Filter the history based on search term
  const filteredHistory = history.filter((item) => {
    if (!searchTerm) return true;

    const searchLower = searchTerm.toLowerCase();
    return (
      item.query.toLowerCase().includes(searchLower) ||
      item.database.toLowerCase().includes(searchLower)
    );
  });

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" title="Query History">
            <History className="h-5 w-5" />
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
              disabled={history.length === 0}
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
                  {history.length === 0 ? (
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
                  key={index}
                  className="border rounded-md p-2 hover:bg-muted/40 cursor-pointer transition-colors group"
                  onClick={() => loadQueryFromHistory(item)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1">
                      <Badge
                        variant="outline"
                        className="h-5 px-1.5 flex items-center gap-1 font-normal bg-primary/5 hover:bg-primary/10 text-xs"
                      >
                        <DbIcon className="h-3 w-3" />
                        {item.database}
                      </Badge>
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
