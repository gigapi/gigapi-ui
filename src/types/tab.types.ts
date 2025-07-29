import type { PanelConfig } from "./dashboard.types";

export interface TimeRange {
  type: "relative" | "absolute";
  from: string;
  to: string;
  field?: string;
  display?: string;
}

export interface QueryTab {
  id: string;
  name: string;
  database: string;
  table: string;
  timeField: string;
  timeRange: TimeRange;
  timeZone: string;
  query: string;
  queryHistory: QueryHistoryItem[];
  // Query execution state
  queryResults: any[] | null;
  queryError: string | null;
  queryLoading: boolean;
  queryExecutionTime: number;
  queryMetrics: {
    executionTime: number;
    rowCount: number;
    size: number;
    processedRows: number;
  };
  rawQueryResponse: string;
  processedQuery: string;
  // Panel configuration
  panelConfig: PanelConfig;
  userModifiedFields: {
    xField?: boolean;
    yField?: boolean;
    seriesField?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface QueryHistoryItem {
  id: string;
  query: string;
  processedQuery?: string;
  database: string;
  db?: string; // Alias for database for backward compatibility
  table: string | null;
  timeField: string | null;
  timeRange: TimeRange | null;
  timestamp: string;
  success: boolean;
  error?: string;
  executionTime?: number;
  rowCount?: number;
}

export interface TabsState {
  tabs: QueryTab[];
  activeTabId: string | null;
}