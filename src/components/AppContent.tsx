import { useEffect, useState } from "react";
import { useQuery } from "../contexts/QueryContext";
import HashQueryUtils from "@/lib/hash-query-utils";
import type { TimeRange } from "@/components/TimeRangeSelector";
import { toast } from "sonner";

// This component is responsible for handling URL hash query parameters 
// once the main application has confirmed databases are loaded.
export default function AppContent() {
  const { 
    // loadDatabases, // Removed, App.tsx handles initial load
    setQuery, 
    executeQuery, 
    setSelectedDb, 
    setSelectedTable,
    setSelectedTimeField,
    setTimeRange,
    selectedDb, // Current selected DB from context
    schema,     // Full schema
    // error, // No longer needed for initial DB load checks here
    // isLoading, // No longer needed for initial DB load checks here
  } = useQuery();
  
  const [hashParamsApplied, setHashParamsApplied] = useState(false);

  // useEffect to loadDatabases removed - App.tsx handles this.
  
  // Process URL hash parameters
  useEffect(() => {
    if (hashParamsApplied) return; // Run once per component instance

    const hashParams = HashQueryUtils.decodeHashQuery();
    if (!hashParams) {
      setHashParamsApplied(true); // No hash, mark as applied, nothing to do
      return;
    }
    
    const { query, db: dbFromHash, table, timeField, timeFrom, timeTo } = hashParams;

    // If db is specified in hash, try to set it.
    // This effect will re-run if setSelectedDb changes selectedDb.
    if (dbFromHash) {
      if (schema && schema[dbFromHash]) {
        if (dbFromHash !== selectedDb) {
          setSelectedDb(dbFromHash);
          // Do not set hashParamsApplied yet. Let the effect re-run with the new selectedDb.
          return; 
        }
        // dbFromHash is valid and already the current selectedDb, proceed.
      } else if (schema && !schema[dbFromHash]) {
        toast.error(`Database '${dbFromHash}' from shared URL not found in available databases.`);
        setHashParamsApplied(true); // Cannot proceed with this db, mark applied.
        return;
      } else if (!schema) {
        // Schema might not be populated yet if selectedDb just changed. 
        // This effect will re-run when schema updates for the new selectedDb.
        // For safety, one could add a small delay or a check for schema[dbFromHash] readiness.
        // However, if App.tsx gates rendering on initial schema load, this might be less of an issue.
        // If still problematic, a more robust schema readiness check for the specific dbFromHash might be needed.
        console.warn("Schema not immediately available for db from hash. Effect will re-run.");
        return; // Wait for schema to be available for the potentially new selectedDb.
      }
    }
    
    // If we reach here, selectedDb is either the one from context (if no db in hash, or hash db matched)
    // or it has been successfully updated from hash and the effect has re-run.

    if (query) {
      if (!selectedDb) {
        // This case should be rare if App.tsx ensures a DB is selected or handles "No DBs found".
        // However, if hash tries to apply a query without a DB context (e.g. hash only has ?query=...)
        toast.info("Cannot apply shared query: No database is currently active or selected.");
        setHashParamsApplied(true);
        return;
      }

      console.log("Applying query from URL hash:", query, "for database:", selectedDb);
      setQuery(query);
      
      if (table) {
        setSelectedTable(table);
      }
      
      if (timeField) {
        setSelectedTimeField(timeField);
      }
      
      if (timeFrom && timeTo) {
        const timeRange: TimeRange = {
          from: timeFrom,
          to: timeTo,
          display: `${timeFrom} to ${timeTo}`,
          enabled: true
        };
        setTimeRange(timeRange);
      }
      
      // Execute the query automatically after a short delay to allow UI to settle
      setTimeout(() => {
        executeQuery().catch((execError: Error) => {
          console.error("Error executing query from URL hash:", execError);
          toast.error(`Failed to execute shared query: ${execError.message || String(execError)}`);
        });
      }, 300); // Adjusted delay slightly
      
      toast.success("Loaded query from shared URL");
    } else if (dbFromHash && !query) {
      // If only a DB was in the hash, and it was successfully set, 
      // we can consider the hash "applied" in terms of DB selection.
      toast.info(`Switched to database '${dbFromHash}' from shared URL.`);
    }
    
    setHashParamsApplied(true); // Mark as applied after successful processing or decision not to process further.
  }, [
    selectedDb, 
    schema, 
    hashParamsApplied, 
    setQuery, 
    executeQuery, 
    setSelectedDb,
    setSelectedTable,
    setSelectedTimeField,
    setTimeRange
  ]);

  return null; // AppContent is a side-effect component, does not render UI itself
}
