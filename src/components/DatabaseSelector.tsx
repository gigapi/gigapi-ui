import { useEffect } from "react";
import { useQuery } from "../contexts/QueryContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Button } from "./ui/button";
import { RefreshCcw } from "lucide-react";

export default function DatabaseSelector() {
  const {
    selectedDb,
    setSelectedDb,
    databases,
    loadDatabases,
    error,
    isLoading,
  } = useQuery();

  useEffect(() => {
    // Only load databases initially if not already loading and no error
    if (!databases.length && !isLoading && !error?.includes("databases")) {
      loadDatabases();
    }
  }, [loadDatabases, databases.length, isLoading, error]);

  function getPlaceholderText() {
    if (error?.includes("databases")) {
      return "Error loading databases";
    }
    if (isLoading && !databases.length) {
      return "Loading databases...";
    }
    if (!databases.length) {
      return "No databases found";
    }
    return "Select database";
  }

  return (
    <div className="space-y-3">
      <div className="flex space-x-2">
        <Select
          value={selectedDb}
          onValueChange={setSelectedDb}
          disabled={
            isLoading || !!error?.includes("databases") || !databases.length
          }
        >
          <SelectTrigger className="bg-background w-64 truncate">
            <SelectValue placeholder={getPlaceholderText()} />
          </SelectTrigger>
          <SelectContent className="bg-popover text-popover-foreground w-64 truncate">
            {databases.map((db) => (
              <SelectItem key={db.database_name} value={db.database_name}>
                {db.database_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={loadDatabases}
          disabled={isLoading}
        >
          <RefreshCcw
            className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
          />
        </Button>
      </div>
    </div>
  );
}
