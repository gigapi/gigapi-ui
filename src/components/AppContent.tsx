import { useEffect, useState } from "react";
import { useQuery } from "@/contexts/QueryContext";
import HashQueryUtils from "@/lib/hash-query-utils";
import type { TimeRange } from "@/types/index";
import { toast } from "sonner";

export default function AppContent() {
  const {
    setQuery,
    executeQuery,
    setSelectedDb,
    setSelectedTable,
    setSelectedTimeField,
    setTimeRange,
    selectedDb,
    schema,
  } = useQuery();

  const [hashParamsApplied, setHashParamsApplied] = useState(false);

  useEffect(() => {
    if (hashParamsApplied) return;

    const hashParams = HashQueryUtils.decodeHashQuery();
    if (!hashParams) {
      setHashParamsApplied(true);
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

    if (dbFromHash) {
      if (schema && schema[dbFromHash]) {
        if (dbFromHash !== selectedDb) {
          setSelectedDb(dbFromHash);
          return;
        }
      } else if (schema && !schema[dbFromHash]) {
        toast.error(
          `Database '${dbFromHash}' from shared URL not found in available databases.`
        );
        setHashParamsApplied(true);
        return;
      } else if (!schema) {
        console.warn(
          "Schema not immediately available for db from hash. Effect will re-run."
        );
      }
    }

    if (query) {
      if (!selectedDb) {
        toast.info(
          "Cannot apply shared query: No database is currently active or selected."
        );
        setHashParamsApplied(true);
        return;
      }

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
          enabled: true,
        };
        setTimeRange(timeRange);
      }

      // Execute the query automatically after a short delay to allow UI to settle
      setTimeout(() => {
        executeQuery().catch((execError: Error) => {
          console.error("Error executing query from URL hash:", execError);
          toast.error(
            `Failed to execute shared query: ${
              execError.message || String(execError)
            }`
          );
        });
      }, 300); // Adjusted delay slightly

      toast.success("Loaded query from shared URL");
    } else if (dbFromHash && !query) {
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
    setTimeRange,
  ]);

  return null; // AppContent is a side-effect component, does not render UI itself
}
