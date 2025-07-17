/**
 * Query Sanitizer
 * 
 * Central utility for sanitizing and fixing common query issues
 */

export class QuerySanitizer {
  /**
   * Remove @ symbols from database references in queries
   */
  static stripAtSymbols(query: string): string {
    if (!query) return query;
    
    // Pattern 1: @database.table -> database.table
    let sanitized = query.replace(/@(\w+)\./g, '$1.');
    
    // Pattern 2: FROM @database -> FROM database
    sanitized = sanitized.replace(/FROM\s+@(\w+)/gi, 'FROM $1');
    
    // Pattern 3: JOIN @database -> JOIN database
    sanitized = sanitized.replace(/JOIN\s+@(\w+)/gi, 'JOIN $1');
    
    // Pattern 4: Any remaining @ before word characters
    sanitized = sanitized.replace(/@(\w+)/g, '$1');
    
    return sanitized;
  }
  
  /**
   * Fix common $__timeFilter mistakes
   */
  static fixTimeFilter(query: string): string {
    if (!query) return query;
    
    // Fix function-style usage: $__timeFilter(column) -> $__timeFilter
    let fixed = query.replace(/\$__timeFilter\s*\([^)]*\)/g, '$__timeFilter');
    
    // Fix quotes around macro: "$__timeFilter" -> $__timeFilter
    fixed = fixed.replace(/["']\$__timeFilter["']/g, '$__timeFilter');
    
    // Fix spaces: $ __timeFilter -> $__timeFilter
    fixed = fixed.replace(/\$\s+__timeFilter/g, '$__timeFilter');
    
    return fixed;
  }

  /**
   * Replace $__timeField with a fallback time column if no specific column is provided
   */
  static fixTimeField(query: string, timeColumn: string = '__timestamp'): string {
    if (!query) return query;
    
    // Replace $__timeField with actual column name
    return query.replace(/\$__timeField/g, timeColumn);
  }
  
  /**
   * Clean database name by removing @ and other invalid characters
   */
  static cleanDatabaseName(database: string): string {
    if (!database) return database;
    
    // Remove @ symbol
    let cleaned = database.replace(/^@/, '');
    
    // Remove any other special characters that might cause issues
    cleaned = cleaned.replace(/[^a-zA-Z0-9_.-]/g, '');
    
    return cleaned;
  }
  
  /**
   * Extract query string from various formats
   */
  static extractQueryString(query: any): string {
    if (typeof query === 'string') {
      return query;
    } else if (Array.isArray(query)) {
      // If query is an array of query objects, take the first one's SQL
      if (query.length > 0 && query[0] && typeof query[0] === 'object' && query[0].sql) {
        return query[0].sql;
      } else if (query.length > 0 && typeof query[0] === 'string') {
        return query[0];
      } else {
        console.warn('Invalid query array format:', query);
        return '';
      }
    } else if (typeof query === 'object' && query !== null) {
      // If it's an object, try to extract SQL
      if (query.sql) {
        return query.sql;
      } else if (query.query) {
        return query.query;
      } else {
        console.warn('Invalid query object format:', query);
        return '';
      }
    } else {
      return String(query);
    }
  }

  /**
   * Sanitize a complete query artifact
   * Note: For full query processing including time variables, use QueryProcessor.process()
   */
  static sanitizeQueryArtifact(artifact: any): any {
    if (!artifact) return artifact;
    
    const sanitized = { ...artifact };
    
    // Handle different query formats and ensure we always get a string
    if (artifact.query) {
      const queryString = this.extractQueryString(artifact.query);
      if (queryString) {
        // Basic sanitization only - QueryProcessor handles time variables
        sanitized.query = this.stripAtSymbols(queryString);
        sanitized.query = this.fixTimeFilter(sanitized.query);
      } else {
        // Invalid format, remove query
        console.warn('Failed to extract query string from:', artifact.query);
        delete sanitized.query;
      }
    }
    
    // Sanitize the database name
    if (sanitized.database) {
      sanitized.database = this.cleanDatabaseName(sanitized.database);
    }
    
    return sanitized;
  }
  
  /**
   * Validate that a query doesn't contain common issues
   */
  static validate(query: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check for @ symbols
    if (query.includes('@')) {
      errors.push('Query contains @ symbols. Database references should not include @ symbols.');
    }
    
    // Check for function-style timeFilter
    if (/\$__timeFilter\s*\([^)]*\)/.test(query)) {
      errors.push('$__timeFilter is a macro, not a function. Use $__timeFilter without parentheses.');
    }
    
    // Check for quoted timeFilter
    if (/["']\$__timeFilter["']/.test(query)) {
      errors.push('$__timeFilter should not be quoted.');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Extract database name from a mention (e.g., @mydb.table -> mydb)
   */
  static extractDatabaseFromMention(mention: string): string {
    // Remove @ and get database part before the dot
    const match = mention.match(/@?(\w+)(?:\.|\s|$)/);
    return match ? match[1] : '';
  }
  
  /**
   * Extract table name from a mention (e.g., @mydb.table -> table)
   */
  static extractTableFromMention(mention: string): string {
    // Get table part after the dot
    const match = mention.match(/\.(\w+)/);
    return match ? match[1] : '';
  }
}