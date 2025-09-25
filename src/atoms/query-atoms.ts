import { atom } from "jotai";
import axios from "axios";
import { QueryProcessor } from "@/lib/query-processor";
import { toast } from "sonner";
import parseNDJSON from "@/lib/parsers/ndjson";
import { v4 as uuidv4 } from "uuid";
import type { QueryHistoryItem } from "@/types/tab.types";

// Re-export for backward compatibility
export type { QueryHistoryItem };

// Import tab atoms
import { 
  currentTabQueryAtom, 
  currentTabQueryHistoryAtom, 
  clearTabQueryHistoryAtom,
  currentTabQueryResultsAtom,
  currentTabQueryErrorAtom,
  currentTabQueryLoadingAtom,
  currentTabQueryMetricsAtom,
  currentTabRawQueryResponseAtom,
  currentTabProcessedQueryAtom,
  activeTabIdAtom,
  addRunningQueryAtom,
  removeRunningQueryAtom,
  updateTabQueryResultsByIdAtom,
  updateTabQueryErrorByIdAtom,
  updateTabQueryLoadingByIdAtom,
  updateTabQueryMetricsByIdAtom,
  updateTabRawResponseByIdAtom,
  updateTabProcessedQueryByIdAtom,
  addToTabQueryHistoryByIdAtom,
  getTabByIdAtom
} from "./tab-atoms";

// Alias the tab-aware atoms for backward compatibility
export const queryAtom = currentTabQueryAtom;
export const queryResultsAtom = currentTabQueryResultsAtom;
export const queryErrorAtom = currentTabQueryErrorAtom;
export const queryLoadingAtom = currentTabQueryLoadingAtom;
export const queryMetricsAtom = currentTabQueryMetricsAtom;
export const rawQueryResponseAtom = currentTabRawQueryResponseAtom;
export const processedQueryAtom = currentTabProcessedQueryAtom;

// Alias the tab-aware query history atom for backward compatibility
export const queryHistoryAtom = currentTabQueryHistoryAtom;

// Store abort controllers for each tab's running query
const abortControllersAtom = atom<Map<string, AbortController>>(new Map());

// Actions
export const setQueryAtom = atom(null, (_get, set, query: string) => {
  set(queryAtom, query);
});

// Cancel query action
export const cancelQueryAtom = atom(null, (get, set, tabId?: string) => {
  const activeTabId = tabId || get(activeTabIdAtom);
  if (!activeTabId) return;

  const controllers = get(abortControllersAtom);
  const controller = controllers.get(activeTabId);

  if (controller) {
    // Actual query is running, cancel it
    controller.abort();
    controllers.delete(activeTabId);
    set(abortControllersAtom, new Map(controllers));
    toast.info("Query cancelled");
  } else {
    // No controller means it's a stale loading state
    // Just reset the UI state
    const getTabById = get(getTabByIdAtom);
    const tab = getTabById(activeTabId);
    if (tab?.queryLoading) {
      toast.info("Clearing stale query state");
    }
  }

  // Always update UI state, whether there was a controller or not
  set(updateTabQueryLoadingByIdAtom, { tabId: activeTabId, loading: false });
  set(removeRunningQueryAtom, activeTabId);
});

export const executeQueryAtom = atom(null, async (get, set) => {
  // Capture the tab ID at the start of execution
  const executeTabId = get(activeTabIdAtom);
  if (!executeTabId) {
    toast.error("No active tab");
    return;
  }

  // Get the tab data at the time of execution
  const getTabById = get(getTabByIdAtom);
  const executeTab = getTabById(executeTabId);
  if (!executeTab) {
    toast.error("Tab not found");
    return;
  }

  // Use the tab's data at execution time
  const query = executeTab.query;
  const selectedDb = executeTab.database;
  const selectedTable = executeTab.table;
  const selectedTimeField = executeTab.timeField;
  const timeRange = executeTab.timeRange;
  const tableSchema = get(tableSchemaAtom);
  const apiUrl = get(apiUrlAtom);
  const selectedConnection = get(selectedConnectionAtom);

  if (!query.trim()) {
    toast.error("Please enter a query");
    return;
  }

  if (!selectedDb) {
    toast.error("Please select a database");
    return;
  }

  // Update loading state for the specific tab
  set(updateTabQueryLoadingByIdAtom, { tabId: executeTabId, loading: true });
  set(updateTabQueryErrorByIdAtom, { tabId: executeTabId, error: null });
  set(updateTabQueryResultsByIdAtom, { tabId: executeTabId, results: null }); // Clear previous results
  
  // Mark this tab as having a running query
  set(addRunningQueryAtom, executeTabId);

  // Create abort controller for this query
  const abortController = new AbortController();
  const controllers = get(abortControllersAtom);
  controllers.set(executeTabId, abortController);
  set(abortControllersAtom, new Map(controllers));

  const startTime = Date.now();

  try {
    // Process query with QueryProcessor
    let processedQuery = query;
    let hasTimeVariables = false;

    // Check if we need to process the query for any variables
    if (QueryProcessor.checkForVariables(query)) {
      // Check specifically for time variables for the hasTimeVariables flag
      hasTimeVariables = QueryProcessor.checkForTimeVariables(query);

      // Get time field details from schema
      let timeFieldDetails = null;
      if (selectedTimeField && tableSchema) {
        const columnData = tableSchema.find(
          (col) =>
            col.column_name === selectedTimeField ||
            col.columnName === selectedTimeField
        );
        
        if (columnData) {
          timeFieldDetails = {
            columnName: columnData.column_name || columnData.columnName,
            dataType: columnData.column_type || columnData.dataType,
            timeUnit: columnData.timeUnit,
          };
        }
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
        set(updateTabQueryErrorByIdAtom, { tabId: executeTabId, error: processed.errors.join("; ") });
        toast.error(`Query processing error: ${processed.errors[0]}`);
        return;
      }

      processedQuery = processed.query;
      set(updateTabProcessedQueryByIdAtom, { tabId: executeTabId, query: processedQuery });
    }

    // Execute the processed query with API key configuration
    const { url: requestUrl, headers } = buildApiRequestConfig(
      selectedConnection, 
      apiUrl, 
      { db: selectedDb, format: 'ndjson' }
    );
    
    const response = await axios.post(
      requestUrl,
      {
        query: processedQuery,
      },
      {
        headers,
        signal: abortController.signal,
        timeout: 300000 // 5 minute timeout
      }
    );

    const result = response.data;

    // Check if result is already parsed JSON or NDJSON string
    let parsedResults: any[];
    let rawResponse: string;

    if (typeof result === "string") {
      rawResponse = result;

      // First, try to parse as JSON array
      try {
        const jsonParsed = JSON.parse(result);
        if (Array.isArray(jsonParsed)) {
          parsedResults = jsonParsed;
        } else if (jsonParsed && typeof jsonParsed === "object") {
          // Single JSON object
          parsedResults = [jsonParsed];
        } else {
          // Try NDJSON parsing
          const { records } = parseNDJSON(result);
          parsedResults = records;
        }
      } catch (e) {
        // Not valid JSON, try NDJSON
        const { records } = parseNDJSON(result);
        parsedResults = records;
      }
    } else if (Array.isArray(result)) {
      // Result is already an array of records
      parsedResults = result;
      rawResponse = JSON.stringify(result, null, 2);
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
    }

    // Store raw response for Raw tab
    set(updateTabRawResponseByIdAtom, { tabId: executeTabId, response: rawResponse });

    const executionTime = Date.now() - startTime;
    set(updateTabQueryResultsByIdAtom, { tabId: executeTabId, results: parsedResults });

    // Calculate size properly based on the raw response
    const responseSize =
      typeof result === "string"
        ? result.length
        : JSON.stringify(result).length;

    set(updateTabQueryMetricsByIdAtom, {
      tabId: executeTabId,
      metrics: {
        executionTime,
        rowCount: parsedResults.length,
        size: responseSize,
        processedRows: parsedResults.length,
      }
    });

    // Add to history with full context
    const historyItem: QueryHistoryItem = {
      id: uuidv4(),
      query,
      processedQuery: hasTimeVariables ? processedQuery : undefined,
      database: selectedDb,
      db: selectedDb, // Alias for backward compatibility
      table: selectedTable || null,
      timeField: selectedTimeField || null,
      timeRange: timeRange || null,
      timestamp: new Date().toISOString(),
      success: true,
      executionTime,
      rowCount: parsedResults.length,
    };

    // Add to the specific tab's history
    set(addToTabQueryHistoryByIdAtom, { tabId: executeTabId, historyItem });
  } catch (error: any) {
    // Handle cancellation
    if (axios.isCancel(error)) {
      // Query was cancelled, don't show error
      return;
    }

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
            } else {
              // Use the string as is if no error field
              errorMessage = error.response.data || "Query failed with unknown error";
            }
          } catch {
            // If not JSON, use as is
            errorMessage = error.response.data || "Query failed with unknown error";
          }
        } else {
          // If data is another type, try to stringify it
          errorMessage = JSON.stringify(error.response.data) || "Query failed with unknown error";
        }
      } else if (error.response.statusText) {
        errorMessage = `${error.response.status}: ${error.response.statusText}`;
      } else {
        errorMessage = `HTTP Error ${error.response.status || 'unknown'}`;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }

    // Ensure errorMessage is never empty
    if (!errorMessage || errorMessage.trim() === "") {
      errorMessage = "Query failed with unknown error";
      console.error("Query execution error:", error); // Log full error for debugging
    }

    set(updateTabQueryErrorByIdAtom, { tabId: executeTabId, error: errorMessage });
    set(updateTabQueryResultsByIdAtom, { tabId: executeTabId, results: null }); // Clear results on error

    // Show toast with validated error message
    if (errorMessage && errorMessage.trim() !== "") {
      toast.error(errorMessage);
    } else {
      toast.error("Query failed. Check console for details.");
    }

    // Add failed query to history with full context
    const historyItem: QueryHistoryItem = {
      id: uuidv4(),
      query,
      database: selectedDb,
      db: selectedDb, // Alias for backward compatibility
      table: selectedTable || null,
      timeField: selectedTimeField || null,
      timeRange: timeRange || null,
      timestamp: new Date().toISOString(),
      success: false,
      error: errorMessage,
    };

    // Add to the specific tab's history
    set(addToTabQueryHistoryByIdAtom, { tabId: executeTabId, historyItem });
  } finally {
    // Update loading state for the specific tab
    set(updateTabQueryLoadingByIdAtom, { tabId: executeTabId, loading: false });

    // Remove this tab from running queries
    set(removeRunningQueryAtom, executeTabId);

    // Clean up abort controller
    const controllers = get(abortControllersAtom);
    controllers.delete(executeTabId);
    set(abortControllersAtom, new Map(controllers));
  }
});

export const clearQueryHistoryAtom = atom(null, (_get, set) => {
  set(clearTabQueryHistoryAtom);
  toast.success("Query history cleared");
});

// Import atoms that this depends on
import { tableSchemaAtom } from "./database-atoms";
import { apiUrlAtom, selectedConnectionAtom, buildApiRequestConfig } from "./connection-atoms";
