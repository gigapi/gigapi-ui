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

export type TimeUnit = "s" | "ms" | "us" | "ns";

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
  confidence: "high" | "medium" | "low";
}

// ============================================================================
// Query and Execution Types
// ============================================================================

export type QueryStatus = "idle" | "loading" | "success" | "error";

export type ResponseFormat = "ndjson";

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
  queryTime?: number;
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

export interface DatabaseState {
  selectedDb: string;
  selectedTable: string | null;
  availableTables: string[];
  schema: SchemaInfo;
  isLoadingSchema: boolean;
}

export type DatabaseAction =
  | { type: "SET_SELECTED_DB"; payload: string }
  | { type: "SET_SELECTED_TABLE"; payload: string | null }
  | { type: "SET_AVAILABLE_TABLES"; payload: string[] }
  | { type: "SET_SCHEMA"; payload: { db: string; schema: TableSchema[] } }
  | { type: "SET_LOADING_SCHEMA"; payload: boolean }
  | { type: "RESET_STATE" };

// Connection Context Specific Types
export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "error"
  | "empty";

export interface SavedConnection {
  apiUrl: string;
  lastConnected: string;
  databases: number;
}

// MCP Context Types
export interface MCPConnection {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  isConnected: boolean;
}

export interface CustomInstruction {
  id: string;
  name: string;
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: {
    queryGenerated?: string;
    chartArtifact?: any;
    dataContext?: {
      database?: string;
      table?: string;
      timeRange?: TimeRange;
    };
  };
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  modelUsed?: string;
  context?: {
    currentDatabase?: string;
    currentTable?: string;
    availableSchema?: SchemaInfo;
  };
}

export interface MCPServerCapabilities {
  queryGeneration: boolean;
  dataAnalysis: boolean;
  chartSuggestions: boolean;
  naturalLanguageToSQL: boolean;
  sqlOptimization: boolean;
}

export interface MCPContextType {
  connections: MCPConnection[];
  activeConnection: MCPConnection | null;
  addConnection: (
    connection: Omit<MCPConnection, "id" | "isConnected">
  ) => Promise<void>;
  removeConnection: (connectionId: string) => Promise<void>;
  testConnection: (connectionId: string) => Promise<boolean>;
  setActiveConnection: (connectionId: string | null) => Promise<void>;

  // Chat functionality
  chatSessions: ChatSession[];
  activeSession: ChatSession | null;
  createChatSession: (title?: string) => Promise<ChatSession>;
  switchChatSession: (sessionId: string) => Promise<void>;
  deleteChatSession: (sessionId: string) => Promise<void>;
  renameChatSession: (sessionId: string, newTitle: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;

  // Custom Instructions
  customInstructions: CustomInstruction[];
  addCustomInstruction: (instruction: Omit<CustomInstruction, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  updateCustomInstruction: (id: string, updates: Partial<Omit<CustomInstruction, "id" | "createdAt">>) => Promise<void>;
  deleteCustomInstruction: (id: string) => Promise<void>;
  toggleCustomInstruction: (id: string) => Promise<void>;

  // AI capabilities
  generateQuery: (prompt: string) => Promise<string>;
  analyzeData: (data: any[], prompt: string) => Promise<string>;
  optimizeQuery: (query: string) => Promise<string>;
  addChartToDashboard: (
    chartArtifact: any,
    dashboardId?: string
  ) => Promise<string>;

  // State
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  capabilities: MCPServerCapabilities;
  isInitialized: boolean;
}

// Query Context Types
export interface QueryContextType {
  // Query execution
  query: string;
  setQuery: (query: string) => void;
  executeQuery: () => Promise<void>;
  clearQuery: () => void;

  // Results
  results: QueryResult[] | null;
  rawJson: any;
  isLoading: boolean;
  error: string | null;
  queryErrorDetail: string | null;

  // Performance metrics
  startTime: number | null;
  executionTime: number | null;
  responseSize: number | null;
  performanceMetrics: PerformanceMetrics | null;
  actualExecutedQuery: string | null;

  // Query history
  queryHistory: QueryHistoryEntry[];
  addToQueryHistory: (
    entry: Omit<QueryHistoryEntry, "id" | "timestamp">
  ) => void;
  clearQueryHistory: () => void;
  getShareableUrlForQuery: (query: string) => string;

  // Properties from useDatabase, made available through QueryContext for convenience in some components
  selectedDb: string;
  selectedTable: string | null;
  schema: SchemaInfo;
  getColumnsForTable: (tableName: string) => ColumnSchema[] | null;

  // Add setters from useDatabase if they need to be exposed via useQuery
  setSelectedDb: (db: string) => void;
  setSelectedTable: (table: string | null) => void;
}

export interface PerformanceMetrics {
  _metric_gigapi_ui?: {
    // Optional to allow for other metrics sources
    queryTime: number;
    rowCount: number;
    apiResponseTime: number;
  };
  [key: string]: any;
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

// Storage types
export interface StorageInfo {
  used: number;
  available: number;
  total: number;
  percentage: number;
  totalBytes: number;
  itemCount: number;
  items: Record<string, { size: number; type: string }>;
  limitBytes: number;
  storageType: string;
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
  [key: string]: string | undefined;
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

// ============================================================================
// Types for Column Analysis and Data Processing
// ============================================================================


// DUCK-DB ONES 
export type DataType =
  | "tinyint" // 8-bit signed
  | "smallint" // 16-bit signed
  | "integer" // 32-bit signed
  | "bigint" // 64-bit signed
  | "hugeint" // 128-bit signed
  | "utinyint" // 8-bit unsigned
  | "usmallint" // 16-bit unsigned
  | "uinteger" // 32-bit unsigned
  | "ubigint" // 64-bit unsigned
  | "uhugeint" // 128-bit unsigned
  | "float" // real
  | "double" // double precision
  | "decimal" // fixed precision
  | "boolean" // true/false
  | "varchar" // variable-length text
  | "blob" // binary large object
  | "date"
  | "time"
  | "timestamp" // no TZ
  | "timestamptz" // with TZ
  | "interval" // time span
  | "array" // fixed-length list
  | "list" // variable-length list
  | "struct" // named fields
  | "map" // key→value
  | "enum" // dictionary encoding
  | "union" // tagged union
  | "unknown";

/**
 * Detailed information about a column, including its type, role, and statistics.
 */
export interface ColumnInfo {
  name: string;
  label?: string;
  type: DataType;
  isTimeField?: boolean;
  timeUnit?: TimeUnit;
  role?: ColumnRole;
  contentType?: ColumnContentType;
  stats?: ColumnStats;
  originalType?: string; // Original database schema type
}

/**
 * Potential roles a column can play in data analysis or visualization.
 */
export type ColumnRole =
  | "dimension"
  | "measure"
  | "identifier"
  | "timeAxis"
  | "series"
  | "color"
  | "size";

/**
 * Semantic content type of the data in a column, beyond its base data type.
 */
export type ColumnContentType =
  | "numeric"
  | "categorical"
  | "temporal"
  | "boolean"
  | "text"
  | "geo"
  | "datetime-string"
  | "timestamp-seconds"
  | "timestamp-ms"
  | "timestamp-us"
  | "timestamp-ns"
  | "other";

/**
 * Basic statistics for a column.
 */
export interface ColumnStats {
  cardinality: number;
  min?: any;
  max?: any;
  avg?: number;
  distinctValues?: any[];
  trueCount?: number; // For booleans
  falseCount?: number; // For booleans
  emptyCount?: number;
  patternFrequency?: Record<string, number>; // For strings, to detect date formats etc.
  mean?: number;
  median?: number;
  stddev?: number;
  sum?: number;
  variance?: number;
  uniqueCount?: number;
  distribution?: Record<string, number>;
}

/**
 * Represents a candidate field that might be a time field, along with analysis details.
 */
export interface TimeFieldCandidate extends ColumnSchema {
  confidence: number;
  analysis: TimestampAnalysis[];
  coverage: number;
  isDateTimeType: boolean;
}

/**
 * Analysis result for a single timestamp value.
 */
export interface TimestampAnalysis {
  isLikelyTimestamp: boolean;
  bestTimeUnit: TimeUnit | null;
  confidence: number;
  details: string;
  parsedAs?: Partial<Record<TimeUnit, number | undefined>>;
}

/**
 * Options for formatting a date.
 */
export interface FormatDateOptions {
  locale?: string;
  timeZone?: string;
  relative?: boolean;
  baseDate?: Date;
  sourceTimeUnit?: TimeUnit;
}
