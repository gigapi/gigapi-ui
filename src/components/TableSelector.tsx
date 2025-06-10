import { useDatabase } from "@/contexts/DatabaseContext";
import { useQuery } from "@/contexts/QueryContext";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Table, ChevronsUpDown, Check } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/";

export default function TableSelector() {
  const {
    selectedTable,
    setSelectedTable,
    availableTables,
    isLoadingSchema,
    selectedDb,
  } = useDatabase();
  const { query, setQuery } = useQuery();

  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-select the first table when available tables change and none is selected
  useEffect(() => {
    if (availableTables.length > 0 && !selectedTable && selectedDb) {
      const firstTable = availableTables[0];
      setSelectedTable(firstTable);
      
      // Generate a basic query with the selected table
      if (!query || query.trim() === "") {
        const newQuery = `SELECT * FROM ${firstTable}`;
        setQuery(newQuery);
      }
    }
  }, [availableTables, selectedTable, setSelectedTable, query, setQuery, selectedDb]);

  // Clear search when popover opens and focus input
  useEffect(() => {
    if (open) {
      setSearchQuery("");
      // Focus the input after a small delay to ensure it's rendered
      // Only focus if we have tables to search through
      if (availableTables.length > 0) {
        setTimeout(() => {
          inputRef.current?.focus();
        }, 50);
      }
    }
  }, [open, availableTables.length]);

  // Handle table change
  const handleTableChange = (value: string) => {
    setSelectedTable(value);
    setSearchQuery("");
    setOpen(false);
    
    // Generate a basic query with the selected table
    // Only update if the query is empty or doesn't contain the table name
    if (!query || !query.toLowerCase().includes(value.toLowerCase())) {
      const newQuery = `SELECT * FROM ${value}`;
      setQuery(newQuery);
    }
  };

  // Filter tables based on search query
  const filteredTables = searchQuery
    ? availableTables.filter((table) =>
        table.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : availableTables;

  if (!selectedDb) {
    return null;
  }

  function getPlaceholderText() {
    if (isLoadingSchema) {
      return "Loading tables...";
    }
    if (availableTables.length === 0) {
      return "No tables available";
    }
    return "Select a table";
  }

  const isDisabled = isLoadingSchema;

  return (
    <div className="flex items-center gap-1 max-w-[300px]">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center">
              <Table className="h-4 w-4 mr-1 text-primary" />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Select a table to query</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={isDisabled}
            className="w-[250px] h-9 text-sm justify-start"
          >
            <span className="truncate">
              {selectedTable || (
                <span className="text-muted-foreground">
                  {getPlaceholderText()}
                </span>
              )}
            </span>
            <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-0" align="start">
          <div className="flex flex-col max-h-[400px]">
            {/* Search Input - always show for better UX */}
            {!isLoadingSchema && availableTables.length > 0 && (
              <div className="flex items-center border-b px-3 py-2 flex-shrink-0">
                <Input
                  ref={inputRef}
                  placeholder="Search tables..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
            )}
            
            {/* Table List with native scrolling */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="p-1">
                {isLoadingSchema ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground animate-pulse">
                    Loading tables...
                  </div>
                ) : availableTables.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No tables available
                  </div>
                ) : filteredTables.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No tables match your search
                  </div>
                ) : (
                  filteredTables.map((table) => (
                    <button
                      key={table}
                      onClick={() => handleTableChange(table)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none",
                        selectedTable === table && "bg-accent"
                      )}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4",
                          selectedTable === table ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="truncate">{table}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
