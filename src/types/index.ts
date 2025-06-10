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
export type AIProvider = "ollama" | "openai" | "anthropic" | "custom";

export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
  maxTokens?: number;
  supportsStreaming?: boolean;
  size?: number; // For local models like Ollama
  modifiedAt?: string; // For local models
}

export interface MCPConnection {
  id: string;
  name: string;
  provider: AIProvider;
  baseUrl?: string; // For Ollama or custom
  apiKey?: string; // For OpenAI, Anthropic, etc.
  model?: string; // Default model for this connection
  isConnected: boolean;
  lastUsed?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: {
    queryGenerated?: string;
    dataContext?: {
      database?: string;
      table?: string;
      timeRange?: TimeRange;
    };
    // Add other relevant metadata
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
  // Add other capabilities as needed
}

export interface MCPContextType {
  // Connection management
  connections: MCPConnection[];
  activeConnection: MCPConnection | null;
  addConnection: (
    connection: Omit<MCPConnection, "id" | "isConnected">
  ) => Promise<void>;
  removeConnection: (connectionId: string) => void;
  testConnection: (connectionId: string) => Promise<boolean>;
  setActiveConnection: (connectionId: string | null) => void;
  fetchModels: (baseUrl: string) => Promise<AIModel[]>;

  // Chat functionality
  chatSessions: ChatSession[];
  activeSession: ChatSession | null;
  createChatSession: (title?: string) => ChatSession;
  switchChatSession: (sessionId: string) => void;
  deleteChatSession: (sessionId: string) => void;
  renameChatSession: (sessionId: string, newTitle: string) => void;
  sendMessage: (content: string) => Promise<void>;

  // AI capabilities
  generateQuery: (prompt: string) => Promise<string>;
  analyzeData: (data: any[], prompt: string) => Promise<string>;
  optimizeQuery: (query: string) => Promise<string>;

  // State
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  availableModels: AIModel[];
  capabilities: MCPServerCapabilities;
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
  performanceMetrics: PerformanceMetrics | null; // Changed from any
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
  // Allow other keys for flexibility with different metric sources
  [key: string]: any;
}

// ============================================================================
// Chart Configuration Types
// ============================================================================

export type ChartLibrary = "recharts" | "echarts" | "custom" | "none";

export type ChartType =
  | "line"
  | "bar"
  | "area"
  | "scatter"
  | "pie"
  | "table"
  | "histogram"
  | "number" // For single number display / KPI
  | "composed"; // For Recharts mixed charts

export interface DataField {
  name: string;
  label?: string;
  type: DataType;
  role?: ColumnRole;
  contentType?: ColumnContentType;
}

export interface ChartFieldMapping {
  xAxis?: string | DataField | null;
  yAxis?: (string | DataField)[] | string | DataField | null;
  series?: string | DataField | null;
  colorBy?: string | DataField | null;
  sizeBy?: string | DataField | null;
  groupBy?: string | DataField | null;
  // Additional fields for specific chart needs
  latitude?: string | DataField | null; // For geo charts
  longitude?: string | DataField | null; // For geo charts
  value?: string | DataField | null; // For pie charts or single value displays
  errorBars?: {
    plus: string | DataField;
    minus: string | DataField;
  } | null;
  tooltipFields?: (string | DataField)[];
}

export interface ChartStyling {
  width?: string | number;
  height?: string | number;
  showLegend?: boolean;
  legendPosition?: "top" | "bottom" | "left" | "right" | "inside" | "center";
  showGridLines?: boolean;
  colors?: string[];
  backgroundColor?: string;
  fontSize?: number;
  fontFamily?: string;
  tooltipEnabled?: boolean;
  xAxisName?: string;
  yAxisName?: string;
  timeFormatting?: string; // e.g., 'YYYY-MM-DD HH:mm'
  customChartOptions?: Record<string, any>; // For library-specific options
  // Styling for specific elements
  axisLabelColor?: string;
  axisLineColor?: string;
  gridColor?: string;
  legendTextColor?: string;
  numberFormatting?: {
    // For 'number' chart type or numeric tooltips/labels
    prefix?: string;
    suffix?: string;
    decimals?: number;
    useGrouping?: boolean;
  };
}

export interface ChartConfig {
  id: string;
  name: string;
  dataId: string;
  chartType: ChartType;
  library: ChartLibrary;
  fieldMapping: ChartFieldMapping;
  description?: string;
  styling?: ChartStyling;
  filters?: any[];
  sort?: { field: string; direction: "asc" | "desc" }[];
  version?: string;
  lastUpdated?: string;
  timeRange?: TimeRange;
  queryOverride?: string;
  maxDataPoints?: number;
  nullHandling?: "zero" | "ignore" | "connect";
}

export type ChartData = Record<string, any>;

export interface FieldDefinition {
  name: string;
  label: string;
  type: DataType;
  role?: ColumnRole;
  contentType?: ColumnContentType;
  isNumeric?: boolean;
  isTemporal?: boolean;
  isCategorical?: boolean;
  stats?: Partial<ColumnStats>;
  format?: string;
}

export interface SeriesOption {
  name: string;
  dataKey: string;
  type?: ChartType;
  color?: string;
  yAxisId?: string | number;
  stackId?: string;
}

export interface ChartConfiguration {
  id: string;
  title: string;
  type: "line" | "bar" | "area";
  fieldMapping: {
    xAxis: string | null;
    yAxis: string | null;
    groupBy: string | null;
  };
  timeFormatting?: {
    enabled: boolean;
    sourceTimeUnit?: TimeUnit;
  };
  styling?: {
    width?: number;
    height?: number;
    showLegend?: boolean;
    showGrid?: boolean;
    smooth?: boolean;
    stack?: boolean;
  };
  echartsConfig: any;
  createdAt: string;
  updatedAt: string;
}

export interface ChartPanel {
  id: string;
  configuration: ChartConfiguration;
  data?: QueryResult[];
}

export interface ColumnInfo {
  name: string;
  label?: string;
  type: DataType;
  isTimeField?: boolean;
  timeUnit?: TimeUnit;
  role?: ColumnRole;
  contentType?: ColumnContentType;
  stats?: ColumnStats;
}

export interface ThemeColors {
  textColor?: string;
  axisColor?: string;
  tooltipBackgroundColor?: string;
  tooltipTextColor?: string;
  seriesColors?: string[];
  gridColor?: string;
  chartBackgroundColor?: string;
}

// ============================================================================
// Utility Types (from previous utils.types.ts, to be integrated or kept separate)
// ============================================================================

// It seems many types from the old utils.types.ts are context-specific or UI-specific
// rather than core data types. Reviewing which ones belong here.

// Core time-related types (already have TimeRange, TimeUnit)
export interface ResolvedTimeRange {
  fromDate: Date;
  toDate: Date;
  fromEpochMs: number;
  toEpochMs: number;
  fromEpochNs: bigint;
  toEpochNs: bigint;
  display: string;
  raw: TimeRange;
}

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
  [key: string]: string | undefined; // Allow dynamic keys for pattern matching
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

// QueryResult is already defined, this one is more specific
// export interface QueryResult<T = unknown> {
//   data: T[];
//   rowCount: number;
//   executionTime: number;
//   columns: ColumnSchema[];
//   hasMore?: boolean;
//   nextCursor?: string;
// }

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

export type DataType =
  | "string"
  | "integer"
  | "float"
  | "boolean"
  | "datetime"
  | "timestamp"
  | "date"
  | "time"
  | "array"
  | "object"
  | "unknown"
  | "datetime-string"
  | "bigint";

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
