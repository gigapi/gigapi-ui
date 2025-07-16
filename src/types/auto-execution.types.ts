/**
 * Auto-execution and result feedback types for enhanced AI integration
 */

export interface AutoExecutionConfig {
  enabled: boolean;
  max_retries: number;
  retry_delay: number; // milliseconds
  timeout: number; // milliseconds
  auto_approve_simple_queries: boolean;
  require_confirmation_for_mutations: boolean;
}

export interface ExecutionResult {
  success: boolean;
  data?: any[];
  error?: string;
  execution_time: number;
  timestamp: string;
  query: string;
  database: string;
  row_count?: number;
  metadata?: {
    columns?: string[];
    data_types?: Record<string, string>;
    query_stats?: Record<string, any>;
  };
}

export interface ResultFeedback {
  artifact_id: string;
  result: ExecutionResult;
  summary: string;
  insights: string[];
  recommendations: string[];
  follow_up_questions: string[];
  confidence_score: number; // 0-1
  data_quality_score: number; // 0-1
}

export interface AutoExecutionEvent {
  id: string;
  type: "execution_started" | "execution_completed" | "execution_failed" | "retry_attempted";
  artifact_id: string;
  timestamp: string;
  data?: any;
  error?: string;
}

export interface ExecutionContext {
  session_id: string;
  user_id?: string;
  database: string;
  table?: string;
  time_range?: any;
  selected_fields?: string[];
  previous_results?: ExecutionResult[];
  chat_history?: any[];
}

export interface SmartExecutionSuggestion {
  type: "optimization" | "error_fix" | "alternative_approach" | "follow_up";
  title: string;
  description: string;
  query_modification?: string;
  confidence: number;
  estimated_improvement?: string;
}

export interface ExecutionPattern {
  id: string;
  pattern_type: "successful_query" | "common_error" | "optimization_opportunity";
  query_pattern: string;
  database_pattern?: string;
  success_rate: number;
  average_execution_time: number;
  common_modifications: string[];
  recommendation: string;
}