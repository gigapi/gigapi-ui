import { useQuery } from "../contexts/QueryContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Table } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { useState } from "react";
import { Input } from "./ui/input";

export default function TableSelector() {
  const {
    selectedTable,
    setSelectedTable,
    availableTables,
    isLoadingSchema,
    selectedDb,
  } = useQuery();

  const [searchQuery, setSearchQuery] = useState("");

  // Handle table change
  const handleTableChange = (value: string) => {
    if (value === "_NONE_") {
      setSelectedTable(null);
    } else {
      setSelectedTable(value);
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

      <Select
        value={selectedTable || "_NONE_"}
        onValueChange={handleTableChange}
        disabled={isLoadingSchema}
      >
        <SelectTrigger className="w-[250px] h-9 text-sm">
          <SelectValue
            placeholder={
              isLoadingSchema ? "Loading tables..." : "Select a table"
            }
          >
            {isLoadingSchema
              ? "Loading tables..."
              : selectedTable || "Select a table"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[400px]">
          {isLoadingSchema ? (
            <div className="p-2 text-sm text-center text-muted-foreground animate-pulse">
              Loading tables...
            </div>
          ) : availableTables.length === 0 ? (
            <SelectItem value="_NONE_" disabled>
              No tables available
            </SelectItem>
          ) : (
            <>
              {availableTables.length > 10 && (
                <div className="p-2 sticky top-0 z-10">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 border-0 p-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 px-2"
                    placeholder="Search tables..."
                  />
                </div>
              )}

              <SelectItem value="_NONE_">None</SelectItem>

              {filteredTables.length === 0 ? (
                <div className="p-2 text-sm text-center text-muted-foreground">
                  No tables match your search
                </div>
              ) : (
                filteredTables.map((table) => (
                  <SelectItem key={table} value={table} className="text-sm">
                    {table}
                  </SelectItem>
                ))
              )}
            </>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
