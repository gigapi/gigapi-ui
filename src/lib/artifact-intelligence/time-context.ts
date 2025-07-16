/**
 * Time Context Manager
 * 
 * Handles time range injection and time variable processing for artifacts.
 */

import type { ChatArtifact, QueryArtifact, ChartArtifact } from '@/types/chat.types';
import type { TimeContext, TimeVariable } from './types';

export class TimeContextManager {
  /**
   * Apply time context to an artifact
   */
  static applyTimeContext(
    artifact: ChatArtifact,
    timeContext: TimeContext
  ): ChatArtifact {
    const enhancedArtifact = { ...artifact };
    
    // Apply time context based on artifact type
    switch (artifact.type) {
      case 'query':
      case 'chart':
      case 'table':
      case 'metric':
        enhancedArtifact.data = this.enhanceQueryWithTimeContext(
          artifact.data as QueryArtifact,
          timeContext
        );
        break;
    }

    return enhancedArtifact;
  }

  /**
   * Enhance query with time context
   */
  private static enhanceQueryWithTimeContext(
    data: QueryArtifact | ChartArtifact,
    timeContext: TimeContext
  ): QueryArtifact | ChartArtifact {
    let { query } = data;
    
    // If query already has time filter, validate it
    if (query.includes('$__timeFilter')) {
      // Query is already time-aware, just ensure context is set
      return {
        ...data,
        metadata: {
          ...data.metadata,
          timeContext: {
            from: timeContext.timeRange.from,
            to: timeContext.timeRange.to,
            timeZone: timeContext.timeZone
          }
        }
      };
    }

    // Auto-inject time filter if appropriate
    const shouldInjectTimeFilter = this.shouldInjectTimeFilter(query, data);
    if (shouldInjectTimeFilter) {
      query = this.injectTimeFilter(query, timeContext, data);
    }

    return {
      ...data,
      query,
      metadata: {
        ...data.metadata,
        timeContext: {
          from: timeContext.timeRange.from,
          to: timeContext.timeRange.to,
          timeZone: timeContext.timeZone
        },
        timeFilterInjected: shouldInjectTimeFilter
      }
    };
  }

  /**
   * Determine if time filter should be injected
   */
  private static shouldInjectTimeFilter(
    query: string,
    data: QueryArtifact | ChartArtifact
  ): boolean {
    const queryLower = query.toLowerCase();
    
    // Don't inject if already has time conditions
    if (queryLower.includes('where') && 
        (queryLower.includes('time') || queryLower.includes('timestamp') || queryLower.includes('date'))) {
      return false;
    }

    // Inject for time series charts
    if ('type' in data && (data.type === 'timeseries' || data.chartType === 'timeseries')) {
      return true;
    }

    // Inject if query references common time columns
    const timeColumns = ['time', 'timestamp', 'created_at', 'updated_at', 'date', 'datetime'];
    return timeColumns.some(col => queryLower.includes(col));
  }

  /**
   * Inject time filter into query
   */
  private static injectTimeFilter(
    query: string,
    timeContext: TimeContext,
    _data: QueryArtifact | ChartArtifact
  ): string {
    const queryLower = query.toLowerCase();
    const timeField = this.detectTimeField(query) || timeContext.timeField || 'time';
    
    // Determine where to inject
    if (queryLower.includes('where')) {
      // Add to existing WHERE clause
      return query.replace(/where/i, `WHERE $__timeFilter(${timeField}) AND`);
    } else if (queryLower.includes('group by')) {
      // Insert before GROUP BY
      return query.replace(/group by/i, `WHERE $__timeFilter(${timeField}) GROUP BY`);
    } else if (queryLower.includes('order by')) {
      // Insert before ORDER BY
      return query.replace(/order by/i, `WHERE $__timeFilter(${timeField}) ORDER BY`);
    } else {
      // Add at the end
      return query + ` WHERE $__timeFilter(${timeField})`;
    }
  }

  /**
   * Detect time field from query
   */
  private static detectTimeField(query: string): string | null {
    const queryLower = query.toLowerCase();
    
    // First check if $__timeFilter is already used with a field
    const timeFilterMatch = query.match(/\$__timeFilter\s*\(\s*([^)]+)\s*\)/i);
    if (timeFilterMatch) {
      return timeFilterMatch[1].trim();
    }
    
    // Common time column patterns
    const timeColumns = [
      '__timestamp', // ClickHouse/TimescaleDB common
      'time',
      'timestamp', 
      'created_at',
      'updated_at',
      'event_time',
      'date',
      'datetime',
      'ts'
    ];
    
    // Look for time columns in SELECT or WHERE
    for (const col of timeColumns) {
      if (queryLower.includes(col)) {
        // Try to find the exact column name (with table prefix if any)
        const regex = new RegExp(`(\\w+\\.)?${col}\\b`, 'i');
        const match = query.match(regex);
        if (match) {
          return match[0];
        }
      }
    }
    
    return null;
  }

  /**
   * Get available time variables for the current context
   */
  static getTimeVariables(timeContext: TimeContext): TimeVariable[] {
    const { from, to } = timeContext.timeRange;
    
    return [
      {
        name: '$__timeFilter',
        value: `time >= ${from} AND time <= ${to}`,
        description: 'Time range filter for WHERE clause'
      },
      {
        name: '$__timeFrom',
        value: from,
        format: typeof from === 'string' ? 'string' : 'unix',
        description: 'Start of time range'
      },
      {
        name: '$__timeTo', 
        value: to,
        format: typeof to === 'string' ? 'string' : 'unix',
        description: 'End of time range'
      },
      {
        name: '$__timeField',
        value: timeContext.timeField || 'time',
        description: 'Default time field name'
      },
      {
        name: '$__interval',
        value: timeContext.interval || 'auto',
        description: 'Time grouping interval'
      }
    ];
  }

  /**
   * Suggest time range based on data characteristics
   */
  static suggestTimeRange(
    query: string,
    _schemaContext?: any
  ): { from: string; to: string; reason: string } | null {
    const queryLower = query.toLowerCase();
    
    // Recent data queries
    if (queryLower.includes('error') || queryLower.includes('alert') || queryLower.includes('warning')) {
      return {
        from: 'now-1h',
        to: 'now',
        reason: 'Error/alert queries typically need recent data'
      };
    }
    
    // Metric queries
    if (queryLower.includes('avg') || queryLower.includes('sum') || queryLower.includes('count')) {
      return {
        from: 'now-24h',
        to: 'now',
        reason: 'Aggregation queries benefit from 24 hour windows'
      };
    }
    
    // Historical analysis
    if (queryLower.includes('trend') || queryLower.includes('compare')) {
      return {
        from: 'now-7d',
        to: 'now',
        reason: 'Trend analysis requires longer time periods'
      };
    }
    
    return null;
  }

  /**
   * Optimize time-based queries
   */
  static optimizeTimeQuery(query: string, timeContext: TimeContext): string {
    let optimized = query;
    
    // Add time-based optimizations
    if (timeContext.interval && !query.toLowerCase().includes('date_trunc')) {
      // Suggest using DATE_TRUNC for time grouping
      const timeField = this.detectTimeField(query) || 'time';
      if (query.toLowerCase().includes('group by')) {
        optimized = optimized.replace(
          /group by/i,
          `GROUP BY DATE_TRUNC('${timeContext.interval}', ${timeField}),`
        );
      }
    }
    
    return optimized;
  }
}