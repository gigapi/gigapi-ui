/**
 * Artifact Intelligence Types
 */

import type { ChatArtifact } from '@/types/chat.types';

export interface SchemaContext {
  databases: Record<string, {
    tables: string[];
    schemas: Record<string, Array<{
      column_name: string;
      column_type: string;
      key?: string;
      null?: string;
    }>>;
  }>;
}

export interface TimeContext {
  timeRange: {
    from: string | number;
    to: string | number;
    raw?: { from: string; to: string };
  };
  timeZone: string;
  interval?: string;
  timeField?: string;
}

export interface QueryContext {
  selectedDatabase?: string;
  selectedTable?: string;
  timeContext?: TimeContext;
  schemaContext?: SchemaContext;
  globalInstructions?: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: EnhancementSuggestion[];
}

export interface ValidationError {
  type: 'syntax' | 'schema' | 'reference' | 'security' | 'logic';
  message: string;
  field?: string;
  line?: number;
  column?: number;
}

export interface ValidationWarning {
  type: 'performance' | 'deprecated' | 'best-practice';
  message: string;
  field?: string;
  suggestion?: string;
}

export interface EnhancementSuggestion {
  type: 'index' | 'join' | 'aggregation' | 'time-range' | 'limit';
  message: string;
  code?: string;
  impact: 'high' | 'medium' | 'low';
}

export interface EnhancedArtifact {
  original: ChatArtifact;
  enhanced: ChatArtifact;
  validation: ValidationResult;
  metadata: {
    schemaUsed: boolean;
    timeContextApplied: boolean;
    optimizationsApplied: string[];
    processingTime: number;
  };
}

export interface ArtifactProcessor {
  validate(artifact: ChatArtifact, context: QueryContext): Promise<ValidationResult>;
  enhance(artifact: ChatArtifact, context: QueryContext): Promise<EnhancedArtifact>;
  optimize(artifact: ChatArtifact, context: QueryContext): Promise<ChatArtifact>;
}

export interface TimeVariable {
  name: string;
  value: string | number;
  format?: string;
  description: string;
}

export interface SchemaValidation {
  database: string;
  table?: string;
  columns: string[];
  missingColumns: string[];
  invalidColumns: string[];
  suggestions: string[];
}