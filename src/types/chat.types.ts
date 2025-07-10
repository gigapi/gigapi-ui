export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;

  // AI Provider Configuration
  connection: AIConnection;
  aiConnectionId: string; // ID of the AI connection used
  model: string; // Selected model

  // Data Context Configuration
  context: ChatContext;

  // Chat Messages
  messages: ChatMessage[];
}

export interface AIConnection {
  id: string;
  name: string;
  provider: "openai" | "anthropic" | "ollama" | "deepseek" | "custom";
  baseUrl: string;
  modelsUrl?: string;
  headers: Record<string, string>;
  isActive?: boolean;
}

export interface ChatContext {
  databases: {
    selected: string[]; // List of selected database names
    includeAll: boolean; // Flag to include all databases
  };

  // Table Configuration (per database)
  tables: Record<
    string,
    {
      selected: string[]; // List of selected table names
      includeAll: boolean; // Flag to include all tables in this database
    }
  >;

  // Schema Information (per database -> per table)
  schemas: Record<string, Record<string, ColumnSchema[]>>;

  // Custom Instructions
  instructions: {
    system: string; // System-level instructions (not editable by user)
    user: string[]; // Chat-specific user instructions
    active: boolean[]; // Which user instructions are active
  };
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;

  // Optional metadata
  metadata?: {
    // Query/Chart artifacts
    artifacts?: ChatArtifact[];

    // Context snapshot at time of message
    contextSnapshot?: {
      database?: string;
      table?: string;
      timeRange?: TimeRange;
    };

    // Execution metadata
    executionTime?: number;
    error?: string;
  };
}

export interface ChatArtifact {
  id: string;
  type: "query" | "chart" | "dashboard" | "insight";

  // Common fields
  title?: string;
  description?: string;

  // Type-specific data
  data: QueryArtifact | ChartArtifact | DashboardArtifact | InsightArtifact;
}

// ============================================================================
// Artifact Types
// ============================================================================

export interface QueryArtifact {
  query: string;
  database?: string;
  table?: string;
  executionTime?: number;
  rowCount?: number;
  error?: string;
}

export interface ChartArtifact {
  type: "timeseries" | "bar" | "pie" | "scatter" | "gauge" | "stat";
  query: string;
  database: string;

  // Chart configuration
  fieldMapping?: {
    xField?: string;
    yField?: string;
    seriesField?: string;
  };

  fieldConfig?: {
    defaults: {
      unit?: string;
      decimals?: number;
      min?: number;
      max?: number;
    };
  };

  options?: Record<string, any>;
}

export interface DashboardArtifact {
  name: string;
  panels: ChartArtifact[];
}

export interface InsightArtifact {
  type: "summary" | "anomaly" | "trend" | "recommendation";
  content: string;
  confidence?: number;
  relatedQueries?: string[];
}

// ============================================================================
// Supporting Types
// ============================================================================

export interface TableSchema {
  tableName: string;
  columns: ColumnSchema[];
  rowCount?: number;
  sizeBytes?: number;
  lastModified?: string;
}

export interface ColumnSchema {
  column_name: string;
  column_type: string;
  null: string; // "YES" or "NO"
  default: any;
  key: string | null; // "PRI", "UNI", etc.
  extra: string | null;
}

export interface TimeRange {
  from: string;
  to: string;
  display?: string;
}

// ============================================================================
// Store Action Types
// ============================================================================

export interface CreateSessionOptions {
  title?: string;
  connectionId: string;
  context?: Partial<ChatContext>;
}

export interface UpdateContextOptions {
  sessionId: string;
  context: ChatContext;
}

export interface SendMessageOptions {
  sessionId: string;
  message: string;
  stream?: boolean;
}

// ============================================================================
// UI State Types
// ============================================================================

export interface ChatUIState {
  activeSessionId: string | null;
  isContextDialogOpen: boolean;
  isSidebarOpen: boolean;
  messageInput: string;
  isLoading: boolean;
  error: string | null;
}

// ============================================================================
// AI Provider Constants
// ============================================================================

export const AI_PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    type: "openai" as const,
    model_list_url: "https://api.openai.com/v1/models",
    apiKeyRequired: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    type: "anthropic" as const,
    model_list_url: "https://api.anthropic.com/v1/models",
    apiKeyRequired: true,
  },
  {
    id: "ollama",
    name: "Ollama",
    type: "ollama" as const,
    model_list_url: "http://localhost:11434/v1/models",
    apiKeyRequired: false,
  },
];
