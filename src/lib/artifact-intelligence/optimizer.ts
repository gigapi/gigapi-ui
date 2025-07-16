/**
 * Artifact Optimizer
 * 
 * Optimizes queries and configurations for better performance.
 */

import type { ChatArtifact, QueryArtifact, ChartArtifact } from '@/types/chat.types';
import type { QueryContext } from './types';

export class ArtifactOptimizer {
  /**
   * Optimize an artifact for better performance
   */
  static async optimize(
    artifact: ChatArtifact,
    context: QueryContext
  ): Promise<ChatArtifact> {
    switch (artifact.type) {
      case 'query':
      case 'chart':
      case 'table':
      case 'metric':
        return {
          ...artifact,
          data: await this.optimizeQuery(artifact.data as QueryArtifact, context)
        };
      default:
        return artifact;
    }
  }

  /**
   * Optimize query for better performance
   */
  private static async optimizeQuery(
    data: QueryArtifact | ChartArtifact,
    context: QueryContext
  ): Promise<QueryArtifact | ChartArtifact> {
    let { query } = data;
    const optimizations: string[] = [];
    
    // Apply various optimizations
    query = this.addLimitIfMissing(query, data, optimizations);
    query = this.optimizeSelectClause(query, optimizations);
    query = this.optimizeTimeAggregation(query, context, optimizations);
    query = this.optimizeJoins(query, optimizations);
    query = this.addIndexHints(query, context, optimizations);
    
    return {
      ...data,
      query,
      metadata: {
        ...data.metadata,
        optimizations
      }
    };
  }

  /**
   * Add LIMIT clause if missing
   */
  private static addLimitIfMissing(
    query: string,
    data: QueryArtifact | ChartArtifact,
    optimizations: string[]
  ): string {
    const queryLower = query.toLowerCase();
    
    // Don't add limit to aggregation queries or charts that need all data
    if (queryLower.includes('group by') || 
        queryLower.includes('limit') ||
        ('type' in data && ['pie', 'gauge', 'stat'].includes(data.type || data.chartType || ''))) {
      return query;
    }
    
    // Add reasonable limit
    const limit = ('type' in data && data.type === 'timeseries') ? 10000 : 1000;
    optimizations.push(`Added LIMIT ${limit}`);
    
    return query.trim() + ` LIMIT ${limit}`;
  }

  /**
   * Optimize SELECT clause
   */
  private static optimizeSelectClause(
    query: string,
    optimizations: string[]
  ): string {
    // Replace SELECT * with specific columns if possible
    if (query.toLowerCase().includes('select *')) {
      // In a real implementation, we'd use schema context to suggest columns
      optimizations.push('Consider replacing SELECT * with specific columns');
    }
    
    return query;
  }

  /**
   * Optimize time-based aggregation
   */
  private static optimizeTimeAggregation(
    query: string,
    context: QueryContext,
    optimizations: string[]
  ): string {
    if (!context.timeContext) return query;
    
    const queryLower = query.toLowerCase();
    
    // If query has time filter but no aggregation, suggest adding it
    if (queryLower.includes('$__timefilter') && 
        !queryLower.includes('date_trunc') && 
        !queryLower.includes('group by')) {
      
      // Calculate appropriate interval based on time range
      const interval = this.calculateOptimalInterval(context.timeContext);
      if (interval) {
        optimizations.push(`Consider adding time aggregation with ${interval} interval`);
      }
    }
    
    return query;
  }

  /**
   * Calculate optimal time interval based on range
   */
  private static calculateOptimalInterval(timeContext: any): string | null {
    if (!timeContext.timeRange) return null;
    
    // Parse time range to determine duration
    // This is simplified - in production, parse actual time values
    const { from, to: _to } = timeContext.timeRange;
    
    if (typeof from === 'string' && from.includes('now-')) {
      const match = from.match(/now-(\d+)([hdwM])/);
      if (match) {
        const value = parseInt(match[1]);
        const unit = match[2];
        
        // Suggest interval based on range
        switch (unit) {
          case 'h':
            return value <= 6 ? '5 minutes' : '30 minutes';
          case 'd':
            return value <= 2 ? '1 hour' : '6 hours';
          case 'w':
            return '1 day';
          case 'M':
            return '1 week';
        }
      }
    }
    
    return '1 hour'; // Default
  }

  /**
   * Optimize JOIN operations
   */
  private static optimizeJoins(
    query: string,
    optimizations: string[]
  ): string {
    const queryLower = query.toLowerCase();
    
    // Check for potential N+1 query patterns
    if (queryLower.includes('join') && !queryLower.includes('left join')) {
      // Count number of joins
      const joinCount = (query.match(/join/gi) || []).length;
      if (joinCount > 2) {
        optimizations.push('Multiple JOINs detected - consider query restructuring');
      }
    }
    
    return query;
  }

  /**
   * Add index hints based on schema
   */
  private static addIndexHints(
    query: string,
    context: QueryContext,
    optimizations: string[]
  ): string {
    if (!context.schemaContext) return query;
    
    // This would analyze WHERE clauses and suggest index usage
    // For now, just add a suggestion
    if (query.toLowerCase().includes('where') && !query.toLowerCase().includes('index')) {
      optimizations.push('Ensure WHERE clause columns are indexed');
    }
    
    return query;
  }

  /**
   * Optimize chart-specific queries
   */
  static optimizeChartQuery(
    artifact: ChatArtifact,
    maxDataPoints: number = 1000
  ): ChatArtifact {
    if (artifact.type !== 'chart') return artifact;
    
    const data = artifact.data as ChartArtifact;
    const chartType = data.type || data.chartType;
    
    // Time series specific optimizations
    if (chartType === 'timeseries') {
      // Ensure proper ordering
      if (!data.query.toLowerCase().includes('order by')) {
        data.query += ' ORDER BY time';
      }
      
      // Add sampling for large datasets
      if (!data.query.toLowerCase().includes('sample') && maxDataPoints < 10000) {
        // Could add TABLESAMPLE or similar
      }
    }
    
    // Pie chart optimizations
    if (chartType === 'pie') {
      // Limit to top N categories
      if (!data.query.toLowerCase().includes('limit')) {
        data.query += ' LIMIT 10';
      }
    }
    
    return { ...artifact, data };
  }
}