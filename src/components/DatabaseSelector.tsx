import { useQuery } from "@/contexts/QueryContext"; // Assuming this context exists and works
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Database, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils"; // Make sure you have cn utility

export default function DatabaseSelector() {
  const {
    selectedDb,
    setSelectedDb,
    databases,
    loadDatabases,
    error,
    isLoading,
  } = useQuery();

  function getPlaceholderText() {
    if (error?.includes("databases")) {
      return "Error loading DBs"; // Shortened for better fit
    }
    if (isLoading && !databases.length) {
      return "Loading DBs..."; // Shortened
    }
    if (!databases.length) {
      return "No DBs found"; // Shortened
    }
    return "Select database";
  }

  const isDisabled = isLoading || !!error?.includes("databases") || !databases.length;

  return (
    <div className="space-y-3">
      <div className="flex space-x-2 items-center">
        {/* The Database icon is now INSIDE the SelectTrigger */}
        <Select
          value={selectedDb || ""} // Ensure value is not undefined for controlled component
          onValueChange={setSelectedDb}
          disabled={isDisabled}
        >
          <SelectTrigger
            className={cn(
              "bg-background w-full sm:w-[200px] md:w-[240px]", // Adjust width as needed
              { "text-destructive": error?.includes("databases") }
            )}
          >
            <div className="flex items-center gap-2"> {/* Flex container for icon and text */}
              <Database className={cn(
                "h-4 w-4",
                isDisabled ? "text-muted-foreground/50" : "text-muted-foreground"
              )} />
              <SelectValue
                placeholder={
                  <span className={error?.includes("databases") ? "text-destructive" : ""}>
                    {getPlaceholderText()}
                  </span>
                }
                className="truncate" // Apply truncate to the SelectValue text
              />
            </div>
          </SelectTrigger>
          <SelectContent className="bg-popover text-popover-foreground">
            {databases.map((db) => (
              <SelectItem key={db.database_name} value={db.database_name} className="truncate">
                {db.database_name}
              </SelectItem>
            ))}
            {/* Optional: Show a message if loading or no databases in dropdown */}
            {isLoading && !databases.length && (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">Loading databases...</div>
            )}
            {!isLoading && !databases.length && !error?.includes("databases") && (
               <div className="px-2 py-1.5 text-sm text-muted-foreground">No databases found.</div>
            )}
            {error?.includes("databases") && (
              <div className="px-2 py-1.5 text-sm text-destructive">Error loading databases.</div>
            )}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={loadDatabases}
          disabled={isLoading}
          aria-label="Refresh database list"
        >
          <RefreshCcw
            className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
          />
        </Button>
      </div>
    </div>
  );
}