import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import axios from "axios";
import { QueryProcessor } from "@/lib/query-processor";
import { toast } from "sonner";
import { parseNDJSON } from "@/lib/parsers/ndjson";

// Query state atoms - FIX: Make sure atom and localStorage stay in sync
export const queryAtom = atomWithStorage<string>("gigapi_current_query", "", {
  getItem: (key) => {
    const stored = localStorage.getItem(key);
    console.log("🔥 QUERY ATOM GET:", { key, stored });
    return stored || "";
  },
  setItem: (key, value) => {
    console.log("🔥 QUERY ATOM SET:", {
      key,
      value,
      timestamp: new Date().toISOString(),
    });
    localStorage.setItem(key, value);
  },
  removeItem: (key) => {
    console.log("🔥 QUERY ATOM REMOVE:", { key });
    localStorage.removeItem(key);
  },
});
export const queryResultsAtom = atom<any[]>([]);
export const queryErrorAtom = atom<string | null>(null);
export const queryLoadingAtom = atom<boolean>(false);
export const queryExecutionTimeAtom = atom<number>(0);
export const queryMetricsAtom = atom<any>({
  executionTime: 0,
  rowCount: 0,
  size: 0,
  processedRows: 0,
});

// Raw query response (for Raw tab)
export const rawQueryResponseAtom = atom<string>("");

// Processed query (for debugging)
export const processedQueryAtom = atom<string>("");

// Query history (stored in memory, will use IndexedDB later)
export const queryHistoryAtom = atom<any[]>([]);

// Actions
export const setQueryAtom = atom(null, (_get, set, query: string) => {
  console.log("🔥 SET QUERY ATOM CALLED:", {
    query,
    timestamp: new Date().toISOString(),
  });
  set(queryAtom, query);
});

export const clearQueryAtom = atom(null, (_get, set) => {
  set(queryAtom, "");
  set(queryResultsAtom, []);
  set(queryErrorAtom, null);
});

export const executeQueryAtom = atom(null, async (get, set) => {
  const query = get(queryAtom);
  const selectedDb = get(selectedDbAtom);
  const selectedTable = get(selectedTableAtom);
  const selectedTimeField = get(selectedTimeFieldAtom);
  const timeRange = get(timeRangeAtom);
  const tableSchema = get(tableSchemaAtom);
  const apiUrl = get(apiUrlAtom);

  if (!query.trim()) {
    toast.error("Please enter a query");
    return;
  }

  if (!selectedDb) {
    toast.error("Please select a database");
    return;
  }

  set(queryLoadingAtom, true);
  set(queryErrorAtom, null);

  const startTime = Date.now();

  try {
    // Process query with QueryProcessor
    let processedQuery = query;
    let hasTimeVariables = false;

    // Check if we need to process time variables
    if (QueryProcessor.checkForTimeVariables(query)) {
      hasTimeVariables = true;

      // Get time field details from schema
      let timeFieldDetails = null;
      if (selectedTimeField && tableSchema) {
        timeFieldDetails = tableSchema.find(
          (col) =>
            col.column_name === selectedTimeField ||
            col.columnName === selectedTimeField
        );
      }

      // Process the query
      const processed = QueryProcessor.process({
        database: selectedDb,
        query,
        timeRange: timeRange || undefined,
        timeColumn: selectedTimeField || undefined,
        timeColumnDetails: timeFieldDetails,
        timeZone: "UTC",
        maxDataPoints: 2000,
        table: selectedTable || undefined,
      });

      if (processed.errors.length > 0) {
        set(queryErrorAtom, processed.errors.join("; "));
        toast.error(`Query processing error: ${processed.errors[0]}`);
        return;
      }

      processedQuery = processed.query;
      set(processedQueryAtom, processedQuery);

      console.log("Original query:", query);
      console.log("Processed query:", processedQuery);
      console.log("Interpolated variables:", processed.interpolatedVars);
    }

    // Execute the processed query
    const response = await axios.post(
      `${apiUrl}?db=${selectedDb}&format=ndjson`,
      {
        query: processedQuery,
      }
    );

    const result = response.data;

    // Store raw response for Raw tab
    set(rawQueryResponseAtom, result);

    const { records: parsedResults } = parseNDJSON(result);
    const executionTime = Date.now() - startTime;

    console.log("Raw NDJSON result:", result.substring(0, 500));
    console.log("Parsed results sample:", parsedResults.slice(0, 2));

    set(queryResultsAtom, parsedResults);
    set(queryExecutionTimeAtom, executionTime);
    set(queryMetricsAtom, {
      executionTime,
      rowCount: parsedResults.length,
      size: result.length,
      processedRows: parsedResults.length,
    });

    // Add to history
    const historyItem = {
      id: crypto.randomUUID(),
      query,
      processedQuery: hasTimeVariables ? processedQuery : undefined,
      database: selectedDb,
      timestamp: new Date().toISOString(),
      success: true,
      executionTime,
      rowCount: parsedResults.length,
    };

    const currentHistory = get(queryHistoryAtom);
    set(queryHistoryAtom, [historyItem, ...currentHistory.slice(0, 49)]);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Query failed";
    set(queryErrorAtom, errorMessage);
    toast.error(`Query failed: ${errorMessage}`);

    // Add failed query to history
    const historyItem = {
      id: crypto.randomUUID(),
      query,
      database: selectedDb,
      timestamp: new Date().toISOString(),
      success: false,
      error: errorMessage,
    };

    const currentHistory = get(queryHistoryAtom);
    set(queryHistoryAtom, [historyItem, ...currentHistory.slice(0, 49)]);
  } finally {
    set(queryLoadingAtom, false);
  }
});

export const clearQueryHistoryAtom = atom(null, (_get, set) => {
  set(queryHistoryAtom, []);
  toast.success("Query history cleared");
});

// Import atoms that this depends on
import {
  selectedDbAtom,
  selectedTableAtom,
  tableSchemaAtom,
} from "./database-atoms";
import { selectedTimeFieldAtom, timeRangeAtom } from "./time-atoms";
import { apiUrlAtom } from "./connection-atoms";
import { useAtom, useSetAtom } from "jotai";

// useQuery hook
export function useQuery() {
  const [query] = useAtom(queryAtom);
  const [results] = useAtom(queryResultsAtom);
  const [error] = useAtom(queryErrorAtom);
  const [loading] = useAtom(queryLoadingAtom);
  const [executionTime] = useAtom(queryExecutionTimeAtom);
  const [metrics] = useAtom(queryMetricsAtom);
  const [history] = useAtom(queryHistoryAtom);
  const [rawResponse] = useAtom(rawQueryResponseAtom);
  const [processedQuery] = useAtom(processedQueryAtom);

  const setQuery = useSetAtom(setQueryAtom);
  const clearQuery = useSetAtom(clearQueryAtom);
  const executeQuery = useSetAtom(executeQueryAtom);
  const clearHistory = useSetAtom(clearQueryHistoryAtom);

  return {
    // State
    query,
    results,
    error,
    loading,
    executionTime,
    metrics,
    history,
    rawResponse,
    processedQuery,

    // Actions
    setQuery,
    clearQuery,
    executeQuery,
    clearHistory,
  };
}
