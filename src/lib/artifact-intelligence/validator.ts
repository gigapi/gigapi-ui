/**
 * Artifact Validator
 * 
 * Validates AI-generated artifacts for correctness, security, and compatibility.
 */

import type { ChatArtifact, QueryArtifact, ChartArtifact } from '@/types/chat.types';
import { QuerySanitizer } from '@/lib/query-sanitizer';
import type { 
  ValidationResult, 
  ValidationError, 
  ValidationWarning, 
  QueryContext,
  SchemaValidation,
  EnhancementSuggestion
} from './types';

export class ArtifactValidator {
  /**
   * Validate an artifact against schema and best practices
   */
  static async validate(
    artifact: ChatArtifact, 
    context: QueryContext
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: EnhancementSuggestion[] = [];

    try {
      // Type-specific validation
      switch (artifact.type) {
        case 'query':
          await this.validateQueryArtifact(artifact.data as QueryArtifact, context, errors, warnings);
          break;
        case 'chart':
          await this.validateChartArtifact(artifact.data as ChartArtifact, context, errors, warnings);
          break;
        case 'table':
          await this.validateTableArtifact(artifact.data, context, errors, warnings);
          break;
        case 'metric':
          await this.validateMetricArtifact(artifact.data, context, errors, warnings);
          break;
      }

      // Common validations
      this.validateDatabase(artifact.data, context, errors);
      this.validateSecurity(artifact.data, errors);
      this.checkPerformance(artifact.data, warnings);

    } catch (error) {
      errors.push({
        type: 'syntax',
        message: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * Validate query artifacts
   */
  private static async validateQueryArtifact(
    data: QueryArtifact,
    context: QueryContext,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    // Check if query exists
    if (!data.query || data.query.trim() === '') {
      errors.push({
        type: 'syntax',
        message: 'Query cannot be empty',
        field: 'query'
      });
      return;
    }

    // Validate SQL syntax (basic)
    const query = data.query.toLowerCase();
    const originalQuery = data.query;
    
    // Check for @ symbols - CRITICAL validation
    if (originalQuery.includes('@')) {
      errors.push({
        type: 'syntax',
        message: 'Query contains @ symbols. Database references should not include @ symbols. Use format: SELECT * FROM database.table or just table_name',
        field: 'query'
      });
    }
    
    // Validate using QuerySanitizer
    const validation = QuerySanitizer.validate(originalQuery);
    if (!validation.isValid) {
      validation.errors.forEach(error => {
        errors.push({
          type: 'syntax',
          message: error,
          field: 'query'
        });
      });
    }
    
    // Check for dangerous operations
    const dangerousKeywords = ['drop', 'truncate', 'delete', 'update', 'insert', 'alter', 'create'];
    for (const keyword of dangerousKeywords) {
      if (query.includes(keyword)) {
        errors.push({
          type: 'security',
          message: `Query contains potentially dangerous operation: ${keyword.toUpperCase()}`,
          field: 'query'
        });
      }
    }

    // Validate table references against schema
    if (context.schemaContext && data.database) {
      const schemaValidation = this.validateSchemaReferences(data.query, data.database, context.schemaContext);
      
      if (schemaValidation.invalidColumns.length > 0) {
        errors.push({
          type: 'schema',
          message: `Invalid columns: ${schemaValidation.invalidColumns.join(', ')}`,
          field: 'query'
        });
      }

      if (schemaValidation.missingColumns.length > 0) {
        warnings.push({
          type: 'best-practice',
          message: `Columns not found in schema: ${schemaValidation.missingColumns.join(', ')}`,
          field: 'query'
        });
      }
    }

    // Check for missing LIMIT in large result queries
    if (!query.includes('limit') && query.includes('select')) {
      warnings.push({
        type: 'performance',
        message: 'Query has no LIMIT clause - consider adding one for better performance',
        field: 'query',
        suggestion: 'Add LIMIT 1000 to avoid loading too much data'
      });
    }

    // Check for time filter usage
    if (context.timeContext && !query.includes('$__timefilter')) {
      warnings.push({
        type: 'best-practice',
        message: 'Query does not use time filtering - consider using $__timeFilter',
        field: 'query'
      });
    }
  }

  /**
   * Validate chart artifacts
   */
  private static async validateChartArtifact(
    data: ChartArtifact,
    context: QueryContext,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    // First validate as query
    await this.validateQueryArtifact(data as QueryArtifact, context, errors, warnings);

    // Chart-specific validations
    if (!data.type && !data.chartType) {
      errors.push({
        type: 'syntax',
        message: 'Chart type must be specified',
        field: 'type'
      });
    }

    const chartType = data.type || data.chartType;
    const validChartTypes = ['timeseries', 'bar', 'pie', 'stat'];
    if (chartType && !validChartTypes.includes(chartType)) {
      errors.push({
        type: 'syntax',
        message: `Invalid chart type: ${chartType}. Must be one of: ${validChartTypes.join(', ')}`,
        field: 'type'
      });
    }

    // Validate field mapping
    if (data.fieldMapping) {
      if (chartType === 'timeseries' && !data.fieldMapping.xField) {
        errors.push({
          type: 'syntax',
          message: 'Time series charts require xField in fieldMapping',
          field: 'fieldMapping.xField'
        });
      }
      if (!data.fieldMapping.yField && chartType !== 'pie') {
        errors.push({
          type: 'syntax',
          message: 'Charts require yField in fieldMapping',
          field: 'fieldMapping.yField'
        });
      }
    } else if (chartType !== 'stat') {
      errors.push({
        type: 'syntax',
        message: 'Charts require fieldMapping configuration',
        field: 'fieldMapping'
      });
    }

    // Time series specific validation
    if (chartType === 'timeseries' && !data.query.toLowerCase().includes('order by')) {
      warnings.push({
        type: 'best-practice',
        message: 'Time series queries should include ORDER BY time clause',
        field: 'query'
      });
    }
  }

  /**
   * Validate table artifacts
   */
  private static async validateTableArtifact(
    data: any,
    context: QueryContext,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    await this.validateQueryArtifact(data as QueryArtifact, context, errors, warnings);

    // Table-specific validations
    if (data.columns && Array.isArray(data.columns)) {
      for (const col of data.columns) {
        if (!col.field) {
          errors.push({
            type: 'syntax',
            message: 'Table column must have a field property',
            field: 'columns'
          });
        }
      }
    }
  }

  /**
   * Validate metric artifacts
   */
  private static async validateMetricArtifact(
    data: any,
    context: QueryContext,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    if (data.query) {
      await this.validateQueryArtifact(data as QueryArtifact, context, errors, warnings);
    }

    // Metric-specific validations
    if (!data.value && !data.query) {
      errors.push({
        type: 'syntax',
        message: 'Metric must have either a value or a query',
        field: 'value'
      });
    }

    if (data.thresholds) {
      if (typeof data.thresholds.warning !== 'number' || typeof data.thresholds.critical !== 'number') {
        warnings.push({
          type: 'best-practice',
          message: 'Threshold values should be numbers',
          field: 'thresholds'
        });
      }
    }
  }

  /**
   * Validate database references
   */
  private static validateDatabase(
    data: any,
    context: QueryContext,
    errors: ValidationError[]
  ): void {
    if (!data.database) {
      errors.push({
        type: 'reference',
        message: 'Database must be specified',
        field: 'database'
      });
      return;
    }

    // Check if database starts with @
    if (data.database.startsWith('@')) {
      errors.push({
        type: 'syntax',
        message: 'Database name should not start with @. The @ symbol is only for mentions in chat.',
        field: 'database'
      });
    }

    // Validate against schema context
    if (context.schemaContext && !context.schemaContext.databases[data.database]) {
      errors.push({
        type: 'reference',
        message: `Database '${data.database}' not found in schema`,
        field: 'database'
      });
    }
  }

  /**
   * Security validation
   */
  private static validateSecurity(
    data: any,
    errors: ValidationError[]
  ): void {
    const query = data.query?.toLowerCase() || '';
    
    // Check for SQL injection patterns
    const injectionPatterns = [
      /;\s*(drop|delete|truncate|update|insert)/,
      /union\s+select/,
      /\/\*.*\*\//,
      /--\s*$/m
    ];

    for (const pattern of injectionPatterns) {
      if (pattern.test(query)) {
        errors.push({
          type: 'security',
          message: 'Query contains potential SQL injection pattern',
          field: 'query'
        });
      }
    }
  }

  /**
   * Performance checks
   */
  private static checkPerformance(
    data: any,
    warnings: ValidationWarning[]
  ): void {
    const query = data.query?.toLowerCase() || '';
    
    // Check for missing indexes hints
    if (query.includes('where') && !query.includes('limit')) {
      warnings.push({
        type: 'performance',
        message: 'Consider adding LIMIT to queries with WHERE clauses',
        field: 'query'
      });
    }

    // Check for SELECT *
    if (query.includes('select *')) {
      warnings.push({
        type: 'performance',
        message: 'Avoid SELECT * - specify only needed columns',
        field: 'query',
        suggestion: 'List specific columns instead of using *'
      });
    }

    // Check for large time ranges without aggregation
    if (query.includes('$__timefilter') && !query.includes('group by')) {
      warnings.push({
        type: 'performance',
        message: 'Consider aggregating data when querying large time ranges',
        field: 'query'
      });
    }
  }

  /**
   * Validate schema references in query
   */
  private static validateSchemaReferences(
    query: string,
    database: string,
    schemaContext: any
  ): SchemaValidation {
    const result: SchemaValidation = {
      database,
      columns: [],
      missingColumns: [],
      invalidColumns: [],
      suggestions: []
    };

    // Extract table references from query (simplified)
    const tableMatches = query.match(/from\s+(\w+)/gi);
    if (tableMatches) {
      for (const match of tableMatches) {
        const tableName = match.replace(/from\s+/i, '');
        if (schemaContext.databases[database]?.schemas[tableName]) {
          result.table = tableName;
          // Could add column validation here
        }
      }
    }

    return result;
  }
}