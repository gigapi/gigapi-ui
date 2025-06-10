import { z } from "zod";

// Core time-related types
export interface TimeRange {
  from: string;
  to: string;
  display?: string;
  enabled?: boolean;
}

export interface ResolvedTimeRange {
  fromDate: Date;
  toDate: Date;
}

export const TIME_UNITS = {
  NANOSECOND: "ns",
  MICROSECOND: "us",
  MILLISECOND: "ms",
  SECOND: "s",
} as const;

export type TimeUnit = (typeof TIME_UNITS)[keyof typeof TIME_UNITS];

// Database schema types
export interface ColumnSchema {
  columnName: string;
  dataType?: string;
  timeUnit?: TimeUnit;
}

export interface DatabaseSchema {
  name: string;
  tables: TableSchema[];
}

export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
}

// Query-related types
export interface QueryMetadata {
  id: string;
  query: string;
  timestamp: string;
  db?: string;
  table?: string;
  timeField?: string;
  timeRange?: TimeRange;
  executionTime?: number;
  rowCount?: number;
  success?: boolean;
  bytesProcessed?: number;
}

export interface QueryAnalysis {
  complexity: "low" | "medium" | "high";
  hasJoins: boolean;
  hasSubqueries: boolean;
  hasAggregations: boolean;
  estimatedCost: number;
  tableCount: number;
  suggestions: string[];
}

export interface QueryValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

// Error handling types
export interface ConnectionError {
  type: "connection" | "timeout" | "network" | "server" | "unknown";
  message: string;
  detail?: string;
  statusCode?: number;
  originalError?: unknown;
}

export interface QueryError {
  type: "syntax" | "execution" | "timeout" | "permission" | "unknown";
  message: string;
  detail?: string;
  line?: number;
  column?: number;
  originalError?: unknown;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

// Performance metrics
export interface PerformanceMetrics {
  executionTime: number;
  querySize: number;
  resultSize: number;
  rowCount: number;
  bytesProcessed?: number;
  memoryUsage?: number;
}

// Storage types
export interface StorageInfo {
  used: number;
  available: number;
  total: number;
  percentage: number;
}

export interface UIPreferences {
  theme: "light" | "dark" | "system";
  compactMode: boolean;
  showLineNumbers: boolean;
  autoComplete: boolean;
  fontSize: number;
}

// Time variable replacement types
export interface TimeVariableReplacements {
  timeField?: string;
  timeFilter?: string;
  timeFrom?: string;
  timeTo?: string;
}

// URL hash query types
export interface HashQueryParams {
  query?: string;
  db?: string;
  table?: string;
  timeField?: string;
  timeFrom?: string;
  timeTo?: string;
}

// Time validation types
export interface TimeValidationResult {
  isValid: boolean;
  errors: string[];
  fromDate?: Date;
  toDate?: Date;
}

// Timezone types
export interface TimezoneInfo {
  name: string;
  displayName: string;
  offset: string;
  abbreviation: string;
}

// API response types
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  success: boolean;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface QueryResult<T = unknown> {
  data: T[];
  rowCount: number;
  executionTime: number;
  columns: ColumnSchema[];
  hasMore?: boolean;
  nextCursor?: string;
}

// Configuration types
export interface ConnectionConfig {
  apiUrl: string;
  timeout: number;
  retries: number;
  headers?: Record<string, string>;
}

export interface QueryConfig {
  maxRows: number;
  timeout: number;
  enableCache: boolean;
  autoFormat: boolean;
}

// Zod schemas for runtime validation
export const TimeRangeSchema = z.object({
  from: z.string().min(1, "From time is required"),
  to: z.string().min(1, "To time is required"),
  display: z.string().min(1, "Display name is required"),
  enabled: z.boolean(),
});

export const ColumnSchemaValidator = z.object({
  columnName: z.string().min(1, "Column name is required"),
  dataType: z.string().optional(),
  timeUnit: z.enum(["ns", "us", "ms", "s"]).optional(),
});

export const HashQueryParamsSchema = z.object({
  query: z.string().optional(),
  db: z.string().optional(),
  table: z.string().optional(),
  timeField: z.string().optional(),
  timeFrom: z.string().optional(),
  timeTo: z.string().optional(),
});

export const UIPreferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).default("system"),
  compactMode: z.boolean().default(false),
  showLineNumbers: z.boolean().default(true),
  autoComplete: z.boolean().default(true),
  fontSize: z.number().min(10).max(24).default(14),
});

// Type guards
export const isConnectionError = (error: unknown): error is ConnectionError => {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    "message" in error &&
    ["connection", "timeout", "network", "server", "unknown"].includes(
      (error as ConnectionError).type
    )
  );
};

export const isQueryError = (error: unknown): error is QueryError => {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    "message" in error &&
    ["syntax", "execution", "timeout", "permission", "unknown"].includes(
      (error as QueryError).type
    )
  );
};

export const isTimeRange = (value: unknown): value is TimeRange => {
  try {
    TimeRangeSchema.parse(value);
    return true;
  } catch {
    return false;
  }
};

// Constants
export const STORAGE_KEYS = {
  API_URL: "gigapi_api_url",
  CONNECTION: "gigapi_connection",
  LAST_QUERY: "gigapi_last_query",
  QUERY_HISTORY: "gigapi_query_history",
  SELECTED_DB: "gigapi_selected_db",
  SELECTED_TABLE: "gigapi_selected_table",
  SELECTED_TIME_FIELD: "gigapi_selected_time_field",
  TIME_RANGE: "gigapi_time_range",
  TIME_FIELDS: "gigapi_time_fields",
  SELECTED_TIME_ZONE: "gigapi_selected_time_zone",
  QUERY_VARIABLES: "gigapi_query_variables",
  THEME: "gigapi_theme",
  UI_PREFERENCES: "gigapi_ui_preferences",
  STORAGE_VERSION: "gigapi_storage_version",
} as const;

export const TIME_VARIABLE_PATTERNS = {
  TIME_FILTER: /\$__timeFilter/g,
  TIME_FIELD: /\$__timeField/g,
  TIME_FROM: /\$__timeFrom/g,
  TIME_TO: /\$__timeTo/g,
  ALL_TIME_VARS: /\$__(timeFilter|timeField|timeFrom|timeTo)/g,
} as const;

export const TIME_PATTERNS = {
  RELATIVE: /^now(?:([+-])(\d+)([smhdwMy]))?$/,
  ISO_DATE: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
  TIMESTAMP_NUMERIC: /^\d{10,19}$/,
  COMPLEX_RELATIVE: /^now-(\d+)([mhdwMy])\/([mhdwMy])$/,
  NOW_SNAP: /^now\/([mhdwMy])$/,
} as const;

export const DEFAULT_TIME_RANGES: TimeRange[] = [
  { display: "Last 5 minutes", from: "now-5m", to: "now", enabled: true },
  { display: "Last 15 minutes", from: "now-15m", to: "now", enabled: true },
  { display: "Last 30 minutes", from: "now-30m", to: "now", enabled: true },
  { display: "Last 1 hour", from: "now-1h", to: "now", enabled: true },
  { display: "Last 3 hours", from: "now-3h", to: "now", enabled: true },
  { display: "Last 6 hours", from: "now-6h", to: "now", enabled: true },
  { display: "Last 12 hours", from: "now-12h", to: "now", enabled: true },
  { display: "Last 24 hours", from: "now-24h", to: "now", enabled: true },
  { display: "Last 2 days", from: "now-2d", to: "now", enabled: true },
  { display: "Last 7 days", from: "now-7d", to: "now", enabled: true },
  { display: "Last 30 days", from: "now-30d", to: "now", enabled: true },
  { display: "Last 90 days", from: "now-90d", to: "now", enabled: true },
];

export const DEFAULT_TIME_RANGE: TimeRange = {
  from: "now-1h",
  to: "now",
  display: "Last 1 hour",
  enabled: true,
};

export const NO_TIME_FILTER: TimeRange = {
  display: "No time filter",
  from: "",
  to: "",
  enabled: false,
};

export const QUICK_RANGES: TimeRange[] = [
  {
    display: "Last 5 minutes",
    from: "now-5m",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 15 minutes",
    from: "now-15m",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 30 minutes",
    from: "now-30m",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 1 hour",
    from: "now-1h",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 3 hours",
    from: "now-3h",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 6 hours",
    from: "now-6h",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 12 hours",
    from: "now-12h",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 24 hours",
    from: "now-1d",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 2 days",
    from: "now-2d",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 7 days",
    from: "now-7d",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 30 days",
    from: "now-30d",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 90 days",
    from: "now-90d",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 6 months",
    from: "now-6M",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 1 year",
    from: "now-1y",
    to: "now",
    enabled: true,
  },
  {
    display: "Today",
    from: "now/d",
    to: "now",
    enabled: true,
  },
  {
    display: "Yesterday",
    from: "now-1d/d",
    to: "now-1d/d+1d",
    enabled: true,
  },
  {
    display: "This week",
    from: "now/w",
    to: "now",
    enabled: true,
  },
  {
    display: "This month",
    from: "now/M",
    to: "now",
    enabled: true,
  },
];
