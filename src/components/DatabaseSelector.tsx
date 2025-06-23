import { useConnection } from "@/contexts/ConnectionContext";
import { useDatabase } from "@/contexts/DatabaseContext";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Database, RefreshCcw, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/"; 

export default function DatabaseSelector() {
  const { databases, loadDatabases, connectionError, connectionState } = useConnection();
  const { selectedDb, setSelectedDb } = useDatabase();

  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear search when popover opens and focus input
  useEffect(() => {
    if (open) {
      setSearchValue("");
      // Focus the input after a small delay to ensure it's rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  function getPlaceholderText() {
    if (connectionError) {
      return "Error loading DBs";
    }
    if (connectionState === "connecting" && !databases.length) {
      return "Loading DBs...";
    }
    if (!databases.length) {
      return "No DBs found";
    }
    return "Select database";
  }

  const isDisabled = connectionState === "connecting" || !!connectionError || !databases.length;

  // Filter databases based on search
  const filteredDatabases = databases.filter((db) =>
    db.database_name.toLowerCase().includes(searchValue.toLowerCase())
  );

  const handleSelectDatabase = (dbName: string) => {
    setSelectedDb(dbName);
    setSearchValue("");
    setOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex space-x-2 items-center">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={isDisabled}
              className={cn(
                "max-w-[240px] truncate justify-start",
                { "text-destructive border-destructive": connectionError }
              )}
            >
              <Database className={cn(
                "h-4 w-4 mr-2",
                isDisabled ? "text-muted-foreground/50" : "text-muted-foreground"
              )} />
              <span className="truncate">
                {selectedDb || (
                  <span className={connectionError ? "text-destructive" : "text-muted-foreground"}>
                    {getPlaceholderText()}
                  </span>
                )}
              </span>
              <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[240px] p-0" align="start">
            <div className="flex flex-col max-h-[400px]">
              {/* Search Input */}
              <div className="flex items-center border-b px-3 py-2 flex-shrink-0">
                <Input
                  ref={inputRef}
                  placeholder="Search databases..."
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  className="h-8 border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
              
              {/* Database List with native scrolling */}
              <div className="flex-1 overflow-y-auto min-h-0">
                <div className="p-1">
                  {connectionState === "connecting" && !databases.length ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      Loading databases...
                    </div>
                  ) : filteredDatabases.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      {searchValue ? "No matching databases found." : "No databases found."}
                    </div>
                  ) : (
                    filteredDatabases.map((db) => (
                      <button
                        key={db.database_name}
                        onClick={() => handleSelectDatabase(db.database_name)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none",
                          selectedDb === db.database_name && "bg-accent"
                        )}
                      >
                        <Check
                          className={cn(
                            "h-4 w-4",
                            selectedDb === db.database_name ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span className="truncate">{db.database_name}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <Button
          variant="outline"
          size="icon"
          onClick={loadDatabases}
          disabled={connectionState === "connecting"}
          aria-label="Refresh database list"
        >
          <RefreshCcw
            className={`h-4 w-4 ${connectionState === "connecting" ? "animate-spin" : ""}`}
          />
        </Button>
      </div>
    </div>
  );
}