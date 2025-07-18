// ============================================================================
// AI Connection Types
// ============================================================================

export interface AIConnection {
  id: string;
  name: string;
  provider: "openai" | "ollama" | "deepseek" | "custom";
  baseUrl: string;
  model: string; // The specific model for this connection
  headers?: Record<string, string>;
  params?: Record<string, string>;
  isActive?: boolean;
}

// ============================================================================
// Chat Types (Simplified - NO CONTEXT!)
// ============================================================================

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;

  // AI Configuration
  aiConnectionId: string;
  connection?: AIConnection; // The full connection object

  // Messages
  messages: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: {
    artifacts?: ChatArtifact[];
    error?: string;
    isStreaming?: boolean;
    thinking?: string; // Hidden thinking/reasoning content
    isAgentic?: boolean; // Whether this message was sent in agentic mode
    edited?: boolean; // Whether this message has been edited
    editedAt?: string; // When the message was edited
    wasCancelled?: boolean; // Whether this message was cancelled
  };
}

export interface ChatArtifact {
  id: string;
  type: "query" | "chart" | "table" | "metric" | "proposal";
  title: string;
  data: QueryArtifact | ChartArtifact | ProposalArtifact;
}

export interface QueryArtifact {
  query: string;
  database?: string;
  timeField?: string; // The timestamp column to use for time filtering
  metadata?: any;
}

export interface ChartArtifact {
  query: string;
  database?: string;
  type?: string; // Chart type (bar, line, etc)
  chartType?: string; // Alternative property name
  chartConfig?: any;
  fieldMapping?: any;
  fieldConfig?: any;
  options?: any;
  timeField?: string; // The timestamp column to use for time filtering
  metadata?: any;
}

export interface ProposalArtifact {
  type: "query_proposal" | "chart_proposal";
  title: string;
  description: string;
  query: string;
  database: string;
  rationale: string;
  next_steps: string[];
  approved?: boolean;
  executed?: boolean;
  results?: any[];
  
  // Chart-related fields (optional)
  chart_type?: string; // e.g., "bar", "line", "pie", etc.
  x_axis?: string; // Column name for x-axis
  y_axes?: string[]; // Column names for y-axis
  
  // Auto-execution fields
  auto_execute?: boolean; // Whether to auto-execute after approval
  execution_status?: "pending" | "executing" | "completed" | "failed"; // Current execution status
  execution_error?: string; // Error message if execution failed
  execution_time?: number; // Time taken to execute (ms)
  execution_timestamp?: string; // When execution completed
  retry_count?: number; // Number of execution retries
  result_summary?: string; // AI-generated summary of results
}

// ============================================================================
// Action Types
// ============================================================================

export interface CreateSessionOptions {
  connectionId: string;
  title?: string;
}

export interface SendMessageOptions {
  sessionId: string;
  message: string;
  isAgentic?: boolean;
}
