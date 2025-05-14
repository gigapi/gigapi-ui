import { useEffect, useState } from "react";
import { useQuery } from "../contexts/QueryContext";
import HashQueryUtils from "@/lib/hash-query-utils";
import type { TimeRange } from "@/components/TimeRangeSelector";
import { toast } from "sonner";

// This component is responsible for loading database information 
// and handling URL hash query parameters when the application first loads
export default function AppContent() {
  const { 
    loadDatabases, 
    setQuery, 
    executeQuery, 
    setSelectedDb, 
    setSelectedTable,
    setSelectedTimeField,
    setTimeRange,
    selectedDb,
    schema
  } = useQuery();
  
  const [hashParamsApplied, setHashParamsApplied] = useState(false);

  // Load databases on initial mount
  useEffect(() => {
    loadDatabases().catch(console.error);
  }, [loadDatabases]);
  
  // Process URL hash parameters once databases are loaded
  useEffect(() => {
    if (!selectedDb || hashParamsApplied) return;
    
    const hashParams = HashQueryUtils.decodeHashQuery();
    if (!hashParams) return;
    
    const { query, db, table, timeField, timeFrom, timeTo } = hashParams;
    
    // Check if the decoded database matches one of our available databases
    if (db && db !== selectedDb) {
      setSelectedDb(db);
      // We'll let the next effect handle the rest when selectedDb updates
      return;
    }
    
    // Apply the decoded parameters
    if (query) {
      console.log("Applying query from URL hash:", query);
      setQuery(query);
      
      // Set additional parameters if available
      if (table) {
        setSelectedTable(table);
      }
      
      if (timeField) {
        setSelectedTimeField(timeField);
      }
      
      // Set time range if available
      if (timeFrom && timeTo) {
        const timeRange: TimeRange = {
          from: timeFrom,
          to: timeTo,
          display: `${timeFrom} to ${timeTo}`,
          enabled: true
        };
        setTimeRange(timeRange);
      }
      
      // Execute the query automatically
      setTimeout(() => {
        executeQuery().catch((error) => {
          console.error("Error executing query from URL hash:", error);
          toast.error("Failed to execute shared query");
        });
      }, 500);
      
      toast.success("Loaded query from shared URL");
    }
    
    setHashParamsApplied(true);
  }, [
    selectedDb, 
    schema, 
    hashParamsApplied, 
    setQuery, 
    setSelectedDb,
    setSelectedTable,
    setSelectedTimeField,
    setTimeRange,
    executeQuery
  ]);

  return null;
}
