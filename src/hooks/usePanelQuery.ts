import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  panelDataAtom,
  panelLoadingStatesAtom,
  type Dashboard,
  type PanelConfig,
} from "@/atoms/dashboard-atoms";
import { apiUrlAtom, isConnectedAtom } from "@/atoms/connection-atoms";
import { selectedDbAtom } from "@/atoms/database-atoms";
import { QueryProcessor } from "@/lib/query-processor";
import type { TimeUnit } from "@/types";
import parseNDJSON from "@/lib/parsers/ndjson";
import {
  transformDataForPanel,
  type TransformedData,
} from "@/lib/dashboard/data-transformers";
import {
  selectedTimeZoneAtom,
  selectedTimeFieldAtom,
} from "@/atoms/time-atoms";
import axios from "axios";
import type { NDJSONRecord } from "@/types/dashboard.types";

export interface PanelQueryOptions {
  panelId: string;
  config: PanelConfig;
  dashboard: Dashboard;
  onSuccess?: (data: NDJSONRecord[]) => void;
  onError?: (error: Error) => void;
}

export interface PanelQueryResult {
  data: NDJSONRecord[] | null;
  transformedData: TransformedData | null;
  loading: boolean;
  error: Error | null;
  execute: (options?: { force?: boolean }) => Promise<void>;
  cancel: () => void;
}

/**
 * Hook for executing panel queries with consistent error handling and caching
 */
export function usePanelQuery({
  panelId,
  config,
  dashboard,
  onSuccess,
  onError,
}: PanelQueryOptions): PanelQueryResult {
  const apiUrl = useAtomValue(apiUrlAtom);
  const isConnected = useAtomValue(isConnectedAtom);
  const selectedDb = useAtomValue(selectedDbAtom);
  const timeZone = useAtomValue(selectedTimeZoneAtom);
  const selectedTimeField = useAtomValue(selectedTimeFieldAtom);

  const [panelData, setPanelData] = useAtom(panelDataAtom);
  const [loadingStates, setLoadingStates] = useAtom(panelLoadingStatesAtom);

  const lastQueryRef = useRef<string>("");
  const loadingStatesRef = useRef(loadingStates);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Update ref when loadingStates changes
  useEffect(() => {
    loadingStatesRef.current = loadingStates;
  }, [loadingStates]);

  // Get current state for this panel
  const panelState = panelData.get(panelId);
  const currentData = panelState?.data || null;
  const currentError = panelState?.error ? new Error(panelState.error) : null;
  const isLoading = loadingStates.get(panelId) || false;

  // Transform data if available and config is valid
  const transformedData =
    currentData && config ? transformDataForPanel(currentData, config) : null;

  /**
   * Cancel any ongoing query
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  /**
   * Execute the panel query
   */
  const execute = useCallback(
    async (options?: { force?: boolean }) => {
      // Get current loading state dynamically
      const currentlyLoading = loadingStatesRef.current.get(panelId) || false;

      // Skip if already loading (unless forced)
      if (currentlyLoading && !options?.force) {
        return;
      }

      // Validate prerequisites
      if (!isConnected) {
        const error = new Error("Not connected to GigAPI");
        setPanelData((prev) =>
          new Map(prev).set(panelId, { data: [], error: error.message })
        );
        onError?.(error);
        return;
      }

      if (!config || !config.query?.trim()) {
        setPanelData((prev) => new Map(prev).set(panelId, { data: [] }));
        return;
      }

      const database = config.database || selectedDb || "mydb";

      // Process query with time variables using the unified processor
      const timeColumn =
        config.fieldMapping?.timeField || config.timeField || selectedTimeField;
      const result = QueryProcessor.process({
        database,
        query: config.query,
        timeRange: dashboard.timeRange,
        timeColumn,
        timeZone,
        timeColumnDetails: config.fieldMapping?.timeUnit
          ? {
              timeUnit: config.fieldMapping.timeUnit as TimeUnit,
              columnName: timeColumn || "",
              dataType: "BIGINT",
            }
          : null,
      });

      const { query: processedQuery, errors } = result;

      if (errors.length > 0) {
        const error = new Error(errors.join(", "));
        setPanelData((prev) =>
          new Map(prev).set(panelId, { data: [], error: error.message })
        );
        onError?.(error);
        return;
      }

      // Check if query has changed
      const queryKey = `${database}:${processedQuery}`;
      if (queryKey === lastQueryRef.current && currentData && !options?.force) {
        return;
      }

      // Only cancel if there's an active request
      if (abortControllerRef.current && loadingStatesRef.current.get(panelId)) {
        cancel();
      }

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      // Atomically set loading state and clear errors
      setPanelData((prev) => {
        const current = prev.get(panelId);
        return new Map(prev).set(panelId, {
          data: current?.data || [],
          error: undefined,
        });
      });
      setLoadingStates((prev) => new Map(prev).set(panelId, true));

      try {
        // Use axios for consistent query execution
        const response = await axios.post(
          `${apiUrl}?db=${database}&format=ndjson`,
          {
            query: processedQuery,
          },
          {
            signal: abortControllerRef.current!.signal,
          }
        );

        const rawData = response.data;

        // Success path - process the response

        const { records, errors: parseErrors } =
          parseNDJSON<NDJSONRecord>(rawData);

        if (parseErrors.length > 0) {
          console.warn(
            `[usePanelQuery] Parse errors for panel ${panelId}:`,
            parseErrors
          );
        }

        // Update state
        setPanelData((prev) => new Map(prev).set(panelId, { data: records }));
        lastQueryRef.current = queryKey;

        onSuccess?.(records);
      } catch (error) {
        // Skip AbortError - request was canceled
        if (axios.isCancel(error)) {
          return;
        }

        // Handle axios errors and other errors
        const errorObj =
          error instanceof Error ? error : new Error(String(error));

        setPanelData((prev) =>
          new Map(prev).set(panelId, { data: [], error: errorObj.message })
        );
        onError?.(errorObj);

        // Show toast for user feedback
        toast.error(`Panel query failed: ${errorObj.message}`);
      } finally {
        setLoadingStates((prev) => new Map(prev).set(panelId, false));
      }
    },
    [
      panelId,
      config,
      dashboard,
      isConnected,
      apiUrl,
      selectedDb,
      timeZone,
      selectedTimeField,
      setPanelData,
      setLoadingStates,
      onSuccess,
      onError,
    ]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  return {
    data: currentData,
    transformedData,
    loading: isLoading,
    error: currentError,
    execute,
    cancel,
  };
}
