/**
 * Schema Context Manager
 * 
 * Provides schema-aware enhancements and validations for artifacts.
 */

import type { ChatArtifact, QueryArtifact, ChartArtifact } from '@/types/chat.types';
import type { SchemaContext, EnhancementSuggestion } from './types';

export class SchemaContextManager {
  /**
   * Enhance artifact with schema awareness
   */
  static enhanceWithSchema(
    artifact: ChatArtifact,
    schemaContext: SchemaContext
  ): { artifact: ChatArtifact; suggestions: EnhancementSuggestion[] } {
    const suggestions: EnhancementSuggestion[] = [];
    
    switch (artifact.type) {
      case 'query':
      case 'chart':
      case 'table':
      case 'metric':
        const enhanced = this.enhanceQueryWithSchema(
          artifact.data as QueryArtifact,
          schemaContext,
          suggestions
        );
        return {
          artifact: { ...artifact, data: enhanced },
          suggestions
        };
    }
    
    return { artifact, suggestions };
  }

  /**
   * Enhance query with schema information
   */
  private static enhanceQueryWithSchema(
    data: QueryArtifact | ChartArtifact,
    schemaContext: SchemaContext,
    suggestions: EnhancementSuggestion[]
  ): QueryArtifact | ChartArtifact {
    const { query, database } = data;
    
    if (!database || !schemaContext.databases[database]) {
      return data;
    }
    
    const dbSchema = schemaContext.databases[database];
    
    // Extract table references
    const tables = this.extractTableReferences(query, database, dbSchema);
    
    // Generate column suggestions
    if (query.toLowerCase().includes('select *')) {
      const columns = this.suggestColumns(tables, dbSchema);
      if (columns.length > 0) {
        suggestions.push({
          type: 'aggregation',
          message: 'Consider selecting specific columns instead of *',
          code: columns.join(', '),
          impact: 'medium'
        });
      }
    }
    
    // Suggest indexes for WHERE clauses
    const whereColumns = this.extractWhereColumns(query);
    for (const col of whereColumns) {
      const tableInfo = this.findColumnTable(col, tables, dbSchema);
      if (tableInfo && !this.hasIndex(col, tableInfo.table, dbSchema)) {
        suggestions.push({
          type: 'index',
          message: `Consider adding index on ${tableInfo.table}.${col}`,
          impact: 'high'
        });
      }
    }
    
    // Suggest time-based optimizations
    if (this.hasTimeColumn(tables, dbSchema)) {
      this.suggestTimeOptimizations(query, suggestions);
    }
    
    // Enhance field mappings for charts
    if ('fieldMapping' in data && data.fieldMapping) {
      data.fieldMapping = this.validateFieldMapping(data.fieldMapping, tables, dbSchema);
    }
    
    return {
      ...data,
      metadata: {
        ...data.metadata,
        tables: Array.from(tables),
        schemaValidated: true
      }
    };
  }

  /**
   * Extract table references from query
   */
  private static extractTableReferences(
    query: string,
    _database: string,
    dbSchema: any
  ): Set<string> {
    const tables = new Set<string>();
    const queryLower = query.toLowerCase();
    
    // Simple extraction - can be improved with proper SQL parsing
    const fromMatch = queryLower.match(/from\s+([a-z0-9_,\s]+)(?:where|group|order|limit|$)/);
    if (fromMatch) {
      const tableList = fromMatch[1].split(',').map(t => t.trim());
      for (const table of tableList) {
        const tableName = table.split(/\s+/)[0]; // Handle aliases
        if (dbSchema.tables.includes(tableName)) {
          tables.add(tableName);
        }
      }
    }
    
    // Also check JOIN clauses
    const joinRegex = /join\s+([a-z0-9_]+)/gi;
    let joinMatch;
    while ((joinMatch = joinRegex.exec(query)) !== null) {
      const tableName = joinMatch[1];
      if (dbSchema.tables.includes(tableName)) {
        tables.add(tableName);
      }
    }
    
    return tables;
  }

  /**
   * Extract columns from WHERE clause
   */
  private static extractWhereColumns(query: string): string[] {
    const columns: string[] = [];
    const whereMatch = query.match(/where\s+(.+?)(?:group|order|limit|$)/i);
    
    if (whereMatch) {
      const whereClause = whereMatch[1];
      // Simple column extraction - matches word.word or just word before operators
      const columnRegex = /(\w+\.)?(\w+)\s*(?:=|>|<|!=|like|in)/gi;
      let match;
      while ((match = columnRegex.exec(whereClause)) !== null) {
        columns.push(match[2]);
      }
    }
    
    return columns;
  }

  /**
   * Suggest columns based on tables
   */
  private static suggestColumns(tables: Set<string>, dbSchema: any): string[] {
    const columns: string[] = [];
    
    for (const table of tables) {
      if (dbSchema.schemas[table]) {
        const tableColumns = dbSchema.schemas[table];
        // Suggest important columns (non-null, keys)
        for (const col of tableColumns) {
          if (col.key || col.null === 'NO') {
            columns.push(`${table}.${col.column_name}`);
          }
        }
      }
    }
    
    return columns.slice(0, 10); // Limit suggestions
  }

  /**
   * Find which table a column belongs to
   */
  private static findColumnTable(
    column: string,
    tables: Set<string>,
    dbSchema: any
  ): { table: string; column: any } | null {
    for (const table of tables) {
      if (dbSchema.schemas[table]) {
        const tableColumns = dbSchema.schemas[table];
        const col = tableColumns.find((c: any) => c.column_name === column);
        if (col) {
          return { table, column: col };
        }
      }
    }
    return null;
  }

  /**
   * Check if column has index
   */
  private static hasIndex(column: string, table: string, dbSchema: any): boolean {
    if (!dbSchema.schemas[table]) return false;
    
    const tableColumns = dbSchema.schemas[table];
    const col = tableColumns.find((c: any) => c.column_name === column);
    
    return col && (col.key === 'PRI' || col.key === 'MUL' || col.key === 'UNI');
  }

  /**
   * Check if tables have time columns
   */
  private static hasTimeColumn(tables: Set<string>, dbSchema: any): boolean {
    const timeColumns = ['time', 'timestamp', 'created_at', 'updated_at', 'event_time'];
    
    for (const table of tables) {
      if (dbSchema.schemas[table]) {
        const hasTime = dbSchema.schemas[table].some((col: any) => 
          timeColumns.includes(col.column_name.toLowerCase()) ||
          col.column_type.toLowerCase().includes('timestamp')
        );
        if (hasTime) return true;
      }
    }
    
    return false;
  }

  /**
   * Suggest time-based optimizations
   */
  private static suggestTimeOptimizations(
    query: string,
    suggestions: EnhancementSuggestion[]
  ): void {
    const queryLower = query.toLowerCase();
    
    // Suggest time filtering if not present
    if (!queryLower.includes('$__timefilter') && !queryLower.includes('where')) {
      suggestions.push({
        type: 'time-range',
        message: 'Add time filtering to improve query performance',
        code: 'WHERE $__timeFilter(time)',
        impact: 'high'
      });
    }
    
    // Suggest aggregation for time series
    if (queryLower.includes('select') && !queryLower.includes('group by')) {
      suggestions.push({
        type: 'aggregation',
        message: 'Consider aggregating time series data',
        code: "DATE_TRUNC('minute', time) as time_bucket",
        impact: 'medium'
      });
    }
  }

  /**
   * Validate and enhance field mapping
   */
  private static validateFieldMapping(
    fieldMapping: any,
    tables: Set<string>,
    dbSchema: any
  ): any {
    const enhanced = { ...fieldMapping };
    
    // Auto-detect time field if not specified
    if (!enhanced.xField || enhanced.xField === 'time') {
      for (const table of tables) {
        if (dbSchema.schemas[table]) {
          const timeCol = dbSchema.schemas[table].find((col: any) => 
            ['time', 'timestamp', 'created_at'].includes(col.column_name.toLowerCase())
          );
          if (timeCol) {
            enhanced.xField = timeCol.column_name;
            break;
          }
        }
      }
    }
    
    return enhanced;
  }

  /**
   * Get schema summary for AI context
   */
  static getSchemaContextForAI(
    database: string,
    tables: string[],
    schemaContext: SchemaContext
  ): string {
    const lines: string[] = [];
    
    if (!schemaContext.databases[database]) {
      return `Database '${database}' not found in schema`;
    }
    
    const dbSchema = schemaContext.databases[database];
    
    lines.push(`Database: ${database}`);
    lines.push(`Available tables: ${dbSchema.tables.join(', ')}`);
    lines.push('');
    
    // Add detailed schema for requested tables
    for (const table of tables) {
      if (dbSchema.schemas[table]) {
        lines.push(`Table: ${table}`);
        lines.push('Columns:');
        
        const columns = dbSchema.schemas[table];
        for (const col of columns) {
          const nullable = col.null === 'NO' ? ' NOT NULL' : '';
          const key = col.key ? ` [${col.key}]` : '';
          lines.push(`  - ${col.column_name} (${col.column_type})${nullable}${key}`);
        }
        lines.push('');
      }
    }
    
    return lines.join('\n');
  }
}