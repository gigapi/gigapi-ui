/**
 * Auto-execution engine for AI-proposed queries
 * Handles automatic execution, result feedback, and smart suggestions
 */

import { QueryProcessor } from "@/lib/query-processor";
import { QuerySanitizer } from "@/lib/query-sanitizer";
import parseNDJSON from "@/lib/parsers/ndjson";
import axios from "axios";
import type {
  AutoExecutionConfig,
  ExecutionResult,
  ExecutionContext,
  AutoExecutionEvent,
  SmartExecutionSuggestion,
} from "./types";
import type { ProposalArtifact } from "@/types/chat.types";

// Export types for convenience
export type {
  AutoExecutionConfig,
  ExecutionResult,
  ExecutionContext,
  AutoExecutionEvent,
  SmartExecutionSuggestion,
} from "./types";

export class AutoExecutionEngine {
  private config: AutoExecutionConfig;
  private apiUrl: string;
  private eventListeners: Map<string, (event: AutoExecutionEvent) => void> = new Map();

  constructor(apiUrl: string, config: Partial<AutoExecutionConfig> = {}) {
    this.apiUrl = apiUrl;
    this.config = {
      enabled: true,
      max_retries: 3,
      retry_delay: 1000,
      timeout: 30000,
      auto_approve_simple_queries: false,
      require_confirmation_for_mutations: true,
      ...config,
    };
  }

  /**
   * Execute a proposal artifact with auto-execution capabilities
   */
  async executeProposal(
    proposal: ProposalArtifact,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    // Validate proposal structure
    if (!proposal || !proposal.data) {
      throw new Error("Invalid proposal: missing data property");
    }
    
    if (!proposal.data.query) {
      throw new Error("Invalid proposal: missing query property");
    }
    
    const query = proposal.data.query;
    const database = proposal.data.database || 'default';
    
    this.emitEvent({
      id: `exec-${Date.now()}`,
      type: "execution_started",
      artifact_id: proposal.title || proposal.id,
      timestamp: new Date().toISOString(),
      data: { query, database },
    });

    try {
      // Validate and sanitize query
      const sanitizedQuery = this.sanitizeQuery(query);
      
      // Check for mutations if configured
      if (this.config.require_confirmation_for_mutations && this.isMutationQuery(sanitizedQuery)) {
        throw new Error("Mutation queries require explicit confirmation");
      }

      // Process query with time variables
      const processedQuery = await this.processQuery(sanitizedQuery, database, context);

      // Execute the query
      const result = await this.executeQuery(processedQuery, database);

      const executionTime = Date.now() - startTime;
      const executionResult: ExecutionResult = {
        success: true,
        data: result.data,
        execution_time: executionTime,
        timestamp: new Date().toISOString(),
        query: processedQuery,
        database,
        row_count: result.data?.length || 0,
        metadata: {
          columns: result.data?.[0] ? Object.keys(result.data[0]) : [],
          query_stats: result.metadata,
        },
      };

      this.emitEvent({
        id: `exec-${Date.now()}`,
        type: "execution_completed",
        artifact_id: proposal.title || proposal.id,
        timestamp: new Date().toISOString(),
        data: executionResult,
      });

      return executionResult;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const executionResult: ExecutionResult = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        execution_time: executionTime,
        timestamp: new Date().toISOString(),
        query,
        database,
      };

      this.emitEvent({
        id: `exec-${Date.now()}`,
        type: "execution_failed",
        artifact_id: proposal.title || proposal.id,
        timestamp: new Date().toISOString(),
        error: executionResult.error,
      });

      return executionResult;
    }
  }

  /**
   * Execute with retry logic
   */
  async executeWithRetry(
    proposal: ProposalArtifact,
    context: ExecutionContext,
    retryCount: number = 0
  ): Promise<ExecutionResult> {
    try {
      return await this.executeProposal(proposal, context);
    } catch (error) {
      if (retryCount < this.config.max_retries) {
        this.emitEvent({
          id: `retry-${Date.now()}`,
          type: "retry_attempted",
          artifact_id: proposal.title || proposal.id,
          timestamp: new Date().toISOString(),
          data: { retry_count: retryCount + 1, error: error instanceof Error ? error.message : "Unknown error" },
        });

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, this.config.retry_delay));
        
        return this.executeWithRetry(proposal, context, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Sanitize query before execution
   */
  private sanitizeQuery(query: string): string {
    let sanitized = QuerySanitizer.stripAtSymbols(query);
    sanitized = QuerySanitizer.fixTimeFilter(sanitized);
    
    // Additional sanitization for auto-execution
    sanitized = sanitized.replace(/;\s*$/, ""); // Remove trailing semicolon
    sanitized = sanitized.trim();
    
    return sanitized;
  }

  /**
   * Process query with time variables and context
   */
  private async processQuery(
    query: string,
    database: string,
    context: ExecutionContext
  ): Promise<string> {
    // Check if query has time variables
    if (QueryProcessor.checkForTimeVariables(query)) {
      const processed = QueryProcessor.process({
        database,
        query,
        timeRange: context.time_range,
        timeColumn: context.selected_fields?.[0], // Use first selected field as time column
        timeZone: "UTC",
        maxDataPoints: 1000,
      });

      if (processed.errors.length > 0) {
        throw new Error(`Query processing failed: ${processed.errors.join(", ")}`);
      }

      return processed.query;
    }

    return query;
  }

  /**
   * Execute query against the API
   */
  private async executeQuery(query: string, database: string): Promise<{ data: any[]; metadata?: any }> {
    const response = await axios.post(
      `${this.apiUrl}?db=${encodeURIComponent(database)}&format=ndjson`,
      { query },
      { 
        responseType: "text", 
        timeout: this.config.timeout,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    // Parse NDJSON response
    const parseResult = parseNDJSON(response.data);
    
    if (parseResult.errors.length > 0) {
      throw new Error(`Response parsing failed: ${parseResult.errors.join(", ")}`);
    }

    return {
      data: parseResult.records,
      metadata: parseResult.metadata,
    };
  }

  /**
   * Check if query is a mutation (INSERT, UPDATE, DELETE, etc.)
   */
  private isMutationQuery(query: string): boolean {
    const mutationKeywords = [
      "INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER", 
      "TRUNCATE", "REPLACE", "MERGE", "UPSERT"
    ];
    
    const upperQuery = query.toUpperCase().trim();
    return mutationKeywords.some(keyword => upperQuery.startsWith(keyword));
  }

  /**
   * Generate smart execution suggestions based on query and context
   */
  generateSuggestions(
    query: string,
    previousResults?: ExecutionResult[]
  ): SmartExecutionSuggestion[] {
    const suggestions: SmartExecutionSuggestion[] = [];

    // Suggest adding time filters if missing
    if (!query.includes("$__timeFilter") && !query.includes("WHERE")) {
      suggestions.push({
        type: "optimization",
        title: "Add time filter",
        description: "Consider adding a time filter to improve query performance",
        query_modification: query.replace("FROM", "FROM") + " WHERE $__timeFilter",
        confidence: 0.7,
        estimated_improvement: "Faster execution, more relevant results",
      });
    }

    // Suggest LIMIT if missing
    if (!query.toUpperCase().includes("LIMIT")) {
      suggestions.push({
        type: "optimization",
        title: "Add LIMIT clause",
        description: "Add LIMIT to prevent returning too many rows",
        query_modification: query + " LIMIT 1000",
        confidence: 0.8,
        estimated_improvement: "Faster execution, reduced memory usage",
      });
    }

    // Suggest follow-up queries based on previous results
    if (previousResults && previousResults.length > 0) {
      const lastResult = previousResults[previousResults.length - 1];
      if (lastResult.success && lastResult.row_count && lastResult.row_count > 0) {
        suggestions.push({
          type: "follow_up",
          title: "Analyze trends",
          description: "Create a time series analysis of this data",
          confidence: 0.6,
          estimated_improvement: "Better insights into data patterns",
        });
      }
    }

    return suggestions;
  }

  /**
   * Add event listener for execution events
   */
  addEventListener(eventType: string, listener: (event: AutoExecutionEvent) => void): void {
    this.eventListeners.set(eventType, listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(eventType: string): void {
    this.eventListeners.delete(eventType);
  }

  /**
   * Emit execution event
   */
  private emitEvent(event: AutoExecutionEvent): void {
    const listener = this.eventListeners.get(event.type);
    if (listener) {
      listener(event);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AutoExecutionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): AutoExecutionConfig {
    return { ...this.config };
  }
}