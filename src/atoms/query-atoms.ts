import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import axios from "axios";
import { QueryProcessor } from "@/lib/query-processor";
import { toast } from "sonner";
import parseNDJSON from "@/lib/parsers/ndjson";

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
export const queryResultsAtom = atom<any[] | null>(null);
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
  set(queryResultsAtom, null); // Clear previous results

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

    // Check if result is already parsed JSON or NDJSON string
    let parsedResults: any[];
    let rawResponse: string;

    console.log("API Response type:", typeof result);
    console.log("API Response sample:", typeof result === 'string' ? result.substring(0, 200) : result);

    if (typeof result === 'string') {
      rawResponse = result;
      
      // First, try to parse as JSON array
      try {
        const jsonParsed = JSON.parse(result);
        if (Array.isArray(jsonParsed)) {
          parsedResults = jsonParsed;
          console.log("Parsed as JSON array:", parsedResults.length, "records");
        } else if (jsonParsed && typeof jsonParsed === 'object') {
          // Single JSON object
          parsedResults = [jsonParsed];
          console.log("Parsed as single JSON object");
        } else {
          // Try NDJSON parsing
          const { records } = parseNDJSON(result);
          parsedResults = records;
          console.log("Parsed as NDJSON:", records.length, "records");
        }
      } catch (e) {
        // Not valid JSON, try NDJSON
        const { records } = parseNDJSON(result);
        parsedResults = records;
        console.log("Parsed as NDJSON after JSON parse failed:", records.length, "records");
      }
    } else if (Array.isArray(result)) {
      // Result is already an array of records
      parsedResults = result;
      rawResponse = JSON.stringify(result, null, 2);
      console.log("Result is already an array:", result.length, "records");
    } else {
      // Result is a single object or wrapped response
      if (result.data && Array.isArray(result.data)) {
        parsedResults = result.data;
        rawResponse = JSON.stringify(result.data, null, 2);
      } else if (result.records && Array.isArray(result.records)) {
        parsedResults = result.records;
        rawResponse = JSON.stringify(result.records, null, 2);
      } else {
        // Treat as single record
        parsedResults = [result];
        rawResponse = JSON.stringify(result, null, 2);
      }
      console.log("Result is an object, parsed to:", parsedResults.length, "records");
    }

    // Store raw response for Raw tab
    set(rawQueryResponseAtom, rawResponse);

    const executionTime = Date.now() - startTime;
    console.log("Parsed results sample:", parsedResults.slice(0, 2));

    console.log("Setting queryResultsAtom with:", parsedResults);
    set(queryResultsAtom, parsedResults);
    set(queryExecutionTimeAtom, executionTime);
    
    // Calculate size properly based on the raw response
    const responseSize = typeof result === 'string' ? result.length : JSON.stringify(result).length;
    
    set(queryMetricsAtom, {
      executionTime,
      rowCount: parsedResults.length,
      size: responseSize,
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
  } catch (error: any) {
    let errorMessage = "Query failed";

    // Extract detailed error message from axios response
    if (error.response) {
      // Handle HTTP error responses
      if (error.response.data) {
        // If the response has an error field, use it
        if (
          typeof error.response.data === "object" &&
          error.response.data.error
        ) {
          errorMessage = error.response.data.error;
        } else if (typeof error.response.data === "string") {
          // Try to parse JSON error response
          try {
            const parsed = JSON.parse(error.response.data);
            if (parsed.error) {
              errorMessage = parsed.error;
            }
          } catch {
            // If not JSON, use as is
            errorMessage = error.response.data;
          }
        }
      } else if (error.response.statusText) {
        errorMessage = `${error.response.status}: ${error.response.statusText}`;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }

    set(queryErrorAtom, errorMessage);
    set(queryResultsAtom, null); // Clear results on error

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
