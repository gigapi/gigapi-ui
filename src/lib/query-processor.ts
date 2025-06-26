/**
 * Simplified Query Processor for GigAPI UI
 * Handles query processing and time interpolation with Grafana-like approach
 * Removes legacy complexity and focuses on core functionality
 */

import { type TimeRange } from "@/types/dashboard.types";
import { sub } from "date-fns";


export type TimeUnit = 'ns' | 'us' | 'μs' | 'ms' | 's';

export interface QueryOptions {
  database: string;
  query: string;
  timeRange?: TimeRange;
  timeZone?: string;
  maxDataPoints?: number;
}

export interface ProcessedQuery {
  query: string;
  database: string;
  interpolatedVars: Record<string, any>;
}

/**
 * Main query processor class - simplified for Grafana-like approach
 */
export class QueryProcessor {
  
  /**
   * Process a query with time interpolation and common variables
   */
  static process(options: QueryOptions): ProcessedQuery {
    const { database, query, timeRange, timeZone = 'UTC', maxDataPoints = 1000 } = options;
    
    let processedQuery = query;
    const interpolatedVars: Record<string, any> = {};
    
    // 1. Handle time filter interpolation
    if (processedQuery.includes('$__timeFilter') && timeRange) {
      const timeFilter = this.generateTimeFilter(timeRange);
      processedQuery = processedQuery.replace(/\$__timeFilter/gi, timeFilter);
      interpolatedVars.timeFilter = timeFilter;
    }
    
    // 2. Handle interval interpolation
    if (processedQuery.includes('$__interval') && timeRange) {
      const interval = this.calculateInterval(timeRange, maxDataPoints);
      processedQuery = processedQuery.replace(/\$__interval/g, `${interval}s`);
      interpolatedVars.interval = interval;
    }
    
    // 3. Handle from/to timestamps
    if (timeRange) {
      const { from, to } = this.getTimeBounds(timeRange);
      processedQuery = processedQuery.replace(/\$__from/g, from.getTime().toString());
      processedQuery = processedQuery.replace(/\$__to/g, to.getTime().toString());
      interpolatedVars.from = from.getTime();
      interpolatedVars.to = to.getTime();
    }
    
    return {
      query: processedQuery,
      database,
      interpolatedVars
    };
  }
  
  /**
   * Generate a simple time filter for the most common case
   */
  private static generateTimeFilter(timeRange: TimeRange): string {
    const { from, to } = this.getTimeBounds(timeRange);
    
    // Simple approach: use __timestamp (nanoseconds) if available, otherwise timestamp (milliseconds)
    // This covers the majority of use cases without complex detection logic
    const fromNs = from.getTime() * 1000000; // Convert to nanoseconds
    const toNs = to.getTime() * 1000000;
    
    return `__timestamp >= ${fromNs} AND __timestamp <= ${toNs}`;
  }
  
  /**
   * Get time bounds from time range
   */
  private static getTimeBounds(timeRange: TimeRange): { from: Date; to: Date } {
    const now = new Date();
    
    if (timeRange.type === 'relative') {
      const to = now;
      const from = this.parseRelativeTime(timeRange.from, now);
      return { from, to };
    } else {
      const from = timeRange.from instanceof Date ? timeRange.from : new Date(timeRange.from);
      const to = timeRange.to instanceof Date ? timeRange.to : new Date(timeRange.to);
      return { from, to };
    }
  }
  
  /**
   * Parse relative time string like "5m", "1h", "24h"
   */
  private static parseRelativeTime(timeStr: string, baseTime: Date): Date {
    if (timeStr === 'now') return baseTime;
    
    // Handle "now-5m" format
    if (timeStr.startsWith('now-')) {
      timeStr = timeStr.substring(4);
    }
    
    const match = timeStr.match(/^(\d+)([smhdwMy])$/);
    if (!match) {
      console.warn('Invalid relative time format:', timeStr);
      return sub(baseTime, { minutes: 5 }); // Default fallback
    }
    
    const value = parseInt(match[1], 10);
    const unit = match[2];
    
    switch (unit) {
      case 's': return sub(baseTime, { seconds: value });
      case 'm': return sub(baseTime, { minutes: value });
      case 'h': return sub(baseTime, { hours: value });
      case 'd': return sub(baseTime, { days: value });
      case 'w': return sub(baseTime, { weeks: value });
      case 'M': return sub(baseTime, { months: value });
      case 'y': return sub(baseTime, { years: value });
      default:
        console.warn('Unknown time unit:', unit);
        return sub(baseTime, { minutes: 5 });
    }
  }
  
  
  /**
   * Calculate optimal interval for data aggregation
   */
  private static calculateInterval(timeRange: TimeRange, maxDataPoints: number = 1000): number {
    const { from, to } = this.getTimeBounds(timeRange);
    const durationMs = to.getTime() - from.getTime();
    const intervalMs = Math.max(1000, Math.floor(durationMs / maxDataPoints));
    
    return Math.floor(intervalMs / 1000);
  }
}

/**
 * Data transformation utilities
 */
export class DataTransformer {
  
  /**
   * Convert timestamp values to JavaScript Date objects
   */
  static convertTimestamp(value: any, timeUnit: TimeUnit): Date | null {
    if (value === null || value === undefined) return null;
    
    let timestamp: number;
    
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed)) {
        timestamp = parsed;
      } else {
        return new Date(value);
      }
    } else if (typeof value === 'number') {
      timestamp = value;
    } else {
      return null;
    }
    
    // Convert to milliseconds based on time unit
    let timestampMs: number;
    switch (timeUnit) {
      case 'ns': timestampMs = timestamp / 1000000; break;
      case 'us':
      case 'μs': timestampMs = timestamp / 1000; break;
      case 'ms': timestampMs = timestamp; break;
      case 's': timestampMs = timestamp * 1000; break;
      default: timestampMs = timestamp;
    }
    
    return new Date(timestampMs);
  }
  
  /**
   * Parse NDJSON data with error handling
   */
  static parseNDJSON(rawData: string): { records: any[]; errors: string[] } {
    const records: any[] = [];
    const errors: string[] = [];
    
    if (!rawData || typeof rawData !== 'string') {
      return { records, errors: ['Invalid NDJSON input'] };
    }
    
    const lines = rawData.trim().split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      try {
        const parsed = JSON.parse(line);
        records.push(parsed);
      } catch (error) {
        const errorMsg = `Failed to parse NDJSON line ${i + 1}: ${line}`;
        errors.push(errorMsg);
        console.warn(errorMsg, error);
      }
    }
    
    return { records, errors };
  }
}

export { QueryProcessor as default };