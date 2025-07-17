import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { useAtomValue } from "jotai";
import { panelDataAtom, useDashboard } from "@/atoms/dashboard-atoms";
import { usePanelQuery } from "@/hooks/usePanelQuery";
import {
  type PanelConfig,
  type Dashboard,
  type NDJSONRecord,
} from "@/types/dashboard.types";
import { type TransformedData } from "@/lib/dashboard/data-transformers";
import { PanelRenderer } from "./PanelRenderer";
import Loader from "@/components/shared/Loader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PanelErrorBoundary } from "./PanelErrorBoundary";
import { getPanelComponent } from "./panels";

interface PanelDataContextValue {
  data: NDJSONRecord[] | null;
  transformedData: TransformedData | null;
  loading: boolean;
  error: Error | null;
  execute: (options?: { force?: boolean }) => Promise<void>;
}

const PanelDataContext = createContext<PanelDataContextValue | null>(null);

export function usePanelData() {
  const context = useContext(PanelDataContext);
  if (!context) {
    throw new Error("usePanelData must be used within PanelDataProvider");
  }
  return context;
}

interface PanelDataProviderProps {
  panelId: string;
  config: PanelConfig;
  dashboard: Dashboard;
  children: React.ReactNode;
  autoRefresh?: boolean;
  refreshTrigger?: number; // External trigger to force refresh
}

export function PanelDataProvider({
  panelId,
  config,
  dashboard,
  children,
  autoRefresh = true,
  refreshTrigger,
}: PanelDataProviderProps) {
  const { data, transformedData, loading, error, execute } = usePanelQuery({
    panelId,
    config,
    dashboard,
  });

  const lastExecutionRef = useRef<string>("");
  const executeRef = useRef(execute);

  // Update execute ref when it changes
  useEffect(() => {
    executeRef.current = execute;
  }, [execute]);

  // Single effect to handle all execution triggers
  useEffect(() => {
    if (!autoRefresh) return;

    const shouldExecute = config.query && config.query.trim();

    if (shouldExecute) {
      // Create a unique key for this execution
      const executionKey = `${panelId}-${config.query}-${JSON.stringify(
        dashboard.timeRange
      )}-${refreshTrigger}`;

      // Skip if this exact execution already happened
      if (executionKey === lastExecutionRef.current) {
        return;
      }

      lastExecutionRef.current = executionKey;

      // Use ref to avoid dependency on execute
      executeRef.current({ force: !!refreshTrigger });
    }
  }, [panelId, config.query, dashboard.timeRange, refreshTrigger, autoRefresh]);

  const contextValue: PanelDataContextValue = {
    data,
    transformedData,
    loading,
    error,
    execute,
  };

  return (
    <PanelErrorBoundary panelId={panelId}>
      <PanelDataContext.Provider value={contextValue}>
        {children}
      </PanelDataContext.Provider>
    </PanelErrorBoundary>
  );
}

/**
 * Enhanced Panel component that uses PanelDataProvider
 */
interface EnhancedPanelProps {
  panelId: string;
  config: PanelConfig;
  dashboard: Dashboard;
  className?: string;
  onEdit?: () => void;
  isEditMode?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
}

export function EnhancedPanel({
  config,
  className,
  isEditMode = false,
  isSelected = false,
  onSelect,
}: EnhancedPanelProps) {
  const { data, loading, error } = usePanelData();
  const PanelComponent = getPanelComponent(config.type);
  const { updateDashboardTimeRange } = useDashboard();

  const handleTimeRangeUpdate = useCallback(
    (timeRange: any) => {
      if (updateDashboardTimeRange) {
        updateDashboardTimeRange(timeRange);
      }
    },
    [updateDashboardTimeRange]
  );

  // Show loading state if loading and no data yet
  // This prevents showing "No data available" before the first query completes
  if (loading || (!data && !error)) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <Loader className="w-8 h-8" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 ${className}`}>
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load panel data: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Check if PanelComponent exists
  if (!PanelComponent) {
    return (
      <div className={`p-4 ${className}`}>
        <Alert variant="destructive">
          <AlertDescription>Unknown panel type: {config.type}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Use the unified PanelRenderer
  return (
    <PanelRenderer
      config={config}
      data={data || []}
      isEditMode={isEditMode}
      isSelected={isSelected}
      onSelect={onSelect}
      onTimeRangeUpdate={handleTimeRangeUpdate}
      className={className}
    />
  );
}

/**
 * Wrapper component that combines provider and panel
 */
export function PanelWithData(props: EnhancedPanelProps) {
  // Watch for refresh requests from the dashboard
  const panelData = useAtomValue(panelDataAtom);
  const refreshTrigger = panelData.get(props.panelId)?._refreshRequested;

  return (
    <PanelDataProvider
      panelId={props.panelId}
      config={props.config}
      dashboard={props.dashboard}
      refreshTrigger={refreshTrigger}
    >
      <EnhancedPanel {...props} />
    </PanelDataProvider>
  );
}
