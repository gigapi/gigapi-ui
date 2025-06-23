import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@/contexts/QueryContext";
import { useDatabase } from "@/contexts/DatabaseContext";
import { useTime } from "@/contexts/TimeContext";
import { HashQueryUtils } from "@/lib/";
import type { TimeRange } from "@/types/index";
import { toast } from "sonner";

export default function AppContent() {
  const location = useLocation();
  const { setQuery, isInitializing, finishInitializing } = useQuery();
  const { setSelectedDb, setSelectedTable, selectedDb, schema } = useDatabase();
  const { setSelectedTimeField, setTimeRange } = useTime();

  const [paramsApplied, setParamsApplied] = useState(false);

  // Don't run AppContent logic on dashboard routes
  const isDashboardRoute = location.pathname.startsWith('/dashboard');

  useEffect(() => {
    // Skip AppContent logic on dashboard routes
    if (isDashboardRoute) {
      if (isInitializing) {
        finishInitializing();
      }
      return;
    }

    // Only run this effect once, and only during initialization
    if (!isInitializing || paramsApplied) {
      return;
    }

    const hashParams = HashQueryUtils.decodeHashQuery();
    if (!hashParams) {
      finishInitializing(); // No params, so we are done initializing.
      setParamsApplied(true);
      return;
    }

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
      return; // Let it retry on next render when schema is available
    }

    // Handle database selection
    if (dbFromHash) {
      if (!schema[dbFromHash]) {
        toast.error(
          `Database '${dbFromHash}' from shared URL not found in available databases.`
        );
      } else if (dbFromHash !== selectedDb) {
        setSelectedDb(dbFromHash);
      }
    }

    // Apply all other parameters
    if (query) {
      setQuery(query);

      if (table) {
        setSelectedTable(table);
      }

      if (timeField) {
        setSelectedTimeField(timeField);
      }

      if (timeFrom || timeTo) {
        const timeRange: TimeRange = {
          from: timeFrom || "now-15m",
          to: timeTo || "now",
          display: `${timeFrom || "now-15m"} to ${timeTo || "now"}`,
          enabled: true,
        };
        setTimeRange(timeRange);
      }

      toast.success("Loaded query from shared URL");
    } else if (dbFromHash && !query) {
      toast.info(`Switched to database '${dbFromHash}' from shared URL.`);
    }

    setParamsApplied(true); // Mark as applied
    finishInitializing(); // Signal that URL processing is complete
  }, [
    isInitializing,
    paramsApplied,
    isDashboardRoute,
    schema,
    selectedDb,
    setQuery,
    setSelectedDb,
    setSelectedTable,
    setSelectedTimeField,
    setTimeRange,
    finishInitializing,
  ]);

  return null; // AppContent is a side-effect component, does not render UI itself
}
