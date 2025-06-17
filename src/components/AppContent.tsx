import { useEffect, useState } from "react";
import { useQuery } from "@/contexts/QueryContext";
import { useDatabase } from "@/contexts/DatabaseContext";
import { useTime } from "@/contexts/TimeContext";
import { HashQueryUtils } from "@/lib/";
import type { TimeRange } from "@/types/index";
import { toast } from "sonner";

// Global flag to prevent auto-generation when loading from URL
let isLoadingFromUrl = false;

export { isLoadingFromUrl };

export default function AppContent() {
  const { setQuery } = useQuery();
  const { setSelectedDb, setSelectedTable, selectedDb, schema } = useDatabase();
  const { setSelectedTimeField, setTimeRange } = useTime();

  const [hashParamsApplied, setHashParamsApplied] = useState(false);

  useEffect(() => {
    if (hashParamsApplied) return;

    // Debug logging
    console.log('Current URL:', window.location.href);
    console.log('Current search params:', window.location.search);
    
    const hashParams = HashQueryUtils.decodeHashQuery();
    if (!hashParams) {
      console.log('No query params found or failed to decode');
      setHashParamsApplied(true);
      return;
    }

    console.log('Loading URL parameters:', hashParams);

    const {
      query,
      db: dbFromHash,
      table,
      timeField,
      timeFrom,
      timeTo,
    } = hashParams;

    // Check if we need to wait for schema to load
    if (!schema) {
      console.warn("Schema not available yet, waiting...");
      return; // Don't set hashParamsApplied yet, let it retry
    }

    // Handle database selection
    if (dbFromHash) {
      if (!schema[dbFromHash]) {
        toast.error(
          `Database '${dbFromHash}' from shared URL not found in available databases.`
        );
        setHashParamsApplied(true);
        return;
      }
      
      // If the database is different from current, set it
      if (dbFromHash !== selectedDb) {
        setSelectedDb(dbFromHash);
        // Don't return here, continue processing other parameters
      }
    }

    // Apply all other parameters
    if (query) {
      console.log('Setting query from URL:', query);
      isLoadingFromUrl = true;
      
      // Use setTimeout to ensure this happens after the QueryEditor is ready
      setTimeout(() => {
        setQuery(query);
        // Reset the flag after a delay to allow normal auto-generation later
        setTimeout(() => {
          isLoadingFromUrl = false;
        }, 1000);
      }, 100);

      if (table) {
        console.log('Setting table from URL:', table);
        setSelectedTable(table);
      }

      if (timeField) {
        console.log('Setting time field from URL:', timeField);
        setSelectedTimeField(timeField);
      }

      if (timeFrom || timeTo) {
        const timeRange: TimeRange = {
          from: timeFrom || 'now-15m',
          to: timeTo || 'now',
          display: `${timeFrom || 'now-15m'} to ${timeTo || 'now'}`,
          enabled: true,
        };
        setTimeRange(timeRange);
      }

      toast.success("Loaded query from shared URL");
    } else if (dbFromHash && !query) {
      toast.info(`Switched to database '${dbFromHash}' from shared URL.`);
    }

    setHashParamsApplied(true); // Mark as applied after successful processing
  }, [
    selectedDb,
    schema,
    hashParamsApplied,
    setQuery,
    setSelectedDb,
    setSelectedTable,
    setSelectedTimeField,
    setTimeRange,
  ]);

  return null; // AppContent is a side-effect component, does not render UI itself
}
