/**
 * Comprehensive type definitions for the GIGAPI UI application
 */

// ============================================================================
// Core Data Types
// ============================================================================

export interface Database {
  database_name: string;
  tables_count?: number;
}

export interface ColumnSchema {
  columnName: string;
  dataType: string;
  timeUnit?: TimeUnit;
  nullable?: boolean;
  defaultValue?: string;
}

export interface TableSchema {
  tableName: string;
  columns: ColumnSchema[];
  rowCount?: number;
}

export type SchemaInfo = Record<string, TableSchema[]>;

export type QueryResult = Record<string, any>;

// ============================================================================
// Time and Date Types
// ============================================================================

export type TimeUnit = 's' | 'ms' | 'us' | 'ns';

export interface TimeRange {
  from: string;
  to: string;
  display?: string;
  enabled?: boolean;
  raw?: {
    from: Date | string;
    to: Date | string;
  };
}

export interface TimeFieldDetails extends ColumnSchema {
  isDetected: boolean;
  confidence: 'high' | 'medium' | 'low';
}

// ============================================================================
// Query and Execution Types
// ============================================================================

export type QueryStatus = 'idle' | 'loading' | 'success' | 'error';

export type ResponseFormat = 'ndjson';

export interface QueryHistoryEntry {
  id: string;
  query: string;
  db: string;
  table: string | null;
  timestamp: string;
  timeField: string | null;
  timeRange: TimeRange | null;
  success: boolean;
  error?: string;
  executionTime?: number;
  rowCount?: number;
  format?: ResponseFormat;
}

export interface QueryMetrics {
  executionTime?: number;
  rowCount?: number;
  responseSize?: number;
  queryTime?: number; // Server-side execution time
  networkTime?: number;
  renderTime?: number;
}

export interface QueryExecution {
  query: string;
  transformedQuery?: string;
  status: QueryStatus;
  results?: QueryResult[];
  rawResponse?: any;
  error?: string;
  errorDetail?: string;
  metrics?: QueryMetrics;
  startTime?: number;
}

// ============================================================================
// Connection and API Types
// ============================================================================

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error' | 'empty';

export interface ApiConnection {
  url: string;
  state: ConnectionState;
  error?: string | null;
  lastConnected?: string;
  formatSupport?: {
    ndjson: boolean;
  };
}

export interface ApiResponse<T = any> {
  data?: T;
  results?: T[];
  _metric?: QueryMetrics;
  _processed_query?: string;
  error?: string;
  message?: string;
}

// ============================================================================
// UI and Component Types
// ============================================================================

export type TabType = 'results' | 'raw' | 'charts' | 'query' | 'performance';

export interface ComponentError {
  message: string;
  code?: string;
  recoverable?: boolean;
  timestamp: number;
}

export interface LoadingState {
  isLoading: boolean;
  loadingMessage?: string;
  progress?: number;
}

// ============================================================================
// Configuration and Settings Types
// ============================================================================

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  timezone: string;
  defaultFormat: ResponseFormat;
  autoComplete: boolean;
  queryTimeout: number; // in seconds
  maxQueryHistory: number;
  debugMode: boolean;
}

export interface UserPreferences {
  defaultTimeRange: TimeRange;
  favoriteQueries: string[];
  recentDatabases: string[];
  uiLayout: {
    sidebarWidth: number;
    showQueryHistory: boolean;
    defaultTab: TabType;
  };
}

// ============================================================================
// Form and Validation Types
// ============================================================================

export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: any) => string | null;
}

export interface FormField<T = any> {
  value: T;
  error?: string;
  touched: boolean;
  rules?: ValidationRule;
}

export interface FormState {
  [key: string]: FormField;
}

// ============================================================================
// Event and Action Types
// ============================================================================

export type AppEvent = 
  | { type: 'QUERY_EXECUTED'; payload: QueryExecution }
  | { type: 'CONNECTION_CHANGED'; payload: ApiConnection }
  | { type: 'SETTINGS_UPDATED'; payload: Partial<AppSettings> }
  | { type: 'ERROR_OCCURRED'; payload: ComponentError }
  | { type: 'USER_ACTION'; payload: { action: string; context?: any } };

// ============================================================================
// Utility Types
// ============================================================================

export type Nullable<T> = T | null;

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;

export type NonEmptyArray<T> = [T, ...T[]];

// ============================================================================
// Type Guards
// ============================================================================

export function isQueryResult(obj: any): obj is QueryResult {
  return obj && typeof obj === 'object' && !Array.isArray(obj);
}

export function isDatabase(obj: any): obj is Database {
  return obj && typeof obj === 'object' && typeof obj.database_name === 'string';
}

export function isColumnSchema(obj: any): obj is ColumnSchema {
  return obj && 
    typeof obj === 'object' && 
    typeof obj.columnName === 'string' && 
    typeof obj.dataType === 'string';
}

export function isTimeRange(obj: any): obj is TimeRange {
  return obj && 
    typeof obj === 'object' && 
    typeof obj.from === 'string' && 
    typeof obj.to === 'string';
}

export function isValidTimeUnit(value: string): value is TimeUnit {
  return ['s', 'ms', 'us', 'ns'].includes(value);
}

export function isValidResponseFormat(value: string): value is ResponseFormat {
  return value === 'ndjson';
}

export function isValidConnectionState(value: string): value is ConnectionState {
  return ['idle', 'connecting', 'connected', 'error', 'empty'].includes(value);
}

// ============================================================================
// Constants TODO: USE! 
// ============================================================================

export const TIME_UNITS: readonly TimeUnit[] = ['s', 'ms', 'us', 'ns'] as const;

export const RESPONSE_FORMATS: readonly ResponseFormat[] = ['ndjson'] as const;

export const CONNECTION_STATES: readonly ConnectionState[] = ['idle', 'connecting', 'connected', 'error', 'empty'] as const;

export const TAB_TYPES: readonly TabType[] = ['results', 'raw', 'charts', 'query', 'performance'] as const;

// ============================================================================
// Default Values TODO: Use those! 
// ============================================================================

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'dark',
  timezone: 'UTC',
  defaultFormat: 'ndjson',
  autoComplete: true,
  queryTimeout: 600,
  maxQueryHistory: 40,
  debugMode: false,
};

export const DEFAULT_TIME_RANGE: TimeRange = {
  from: 'now-24h',
  to: 'now',
  display: 'Last 24 hours',
  enabled: true,
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  defaultTimeRange: DEFAULT_TIME_RANGE,
  favoriteQueries: [],
  recentDatabases: [],
  uiLayout: {
    sidebarWidth: 300,
    showQueryHistory: true,
    defaultTab: 'results',
  },
};