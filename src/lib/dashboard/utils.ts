import { type TimeUnit } from "@/types/utils.types";

/**
 * Enhanced time column detection for dashboard panels
 */
export function detectTimeColumns(columns: string[]): string[] {
  return columns.filter(columnName => {
    const lowerColName = columnName.toLowerCase();
    
    return (
      // Explicit timestamp patterns
      lowerColName === '__timestamp' ||
      lowerColName.includes('timestamp') ||
      lowerColName.includes('time') ||
      lowerColName.includes('date') ||
      
      // Common time column patterns
      lowerColName.includes('created') ||
      lowerColName.includes('updated') ||
      lowerColName.endsWith('_at') ||
      lowerColName.endsWith('_time') ||
      lowerColName.endsWith('_ts') ||
      lowerColName.endsWith('_date') ||
      
      // Time-series database patterns
      lowerColName.includes('epoch') ||
      lowerColName.includes('unix')
    );
  });
}

/**
 * Infer time unit from column name and data type with enhanced patterns
 */
export function inferTimeUnitFromColumnName(columnName: string, dataType?: string): TimeUnit {
  const lowerName = columnName.toLowerCase();
  const lowerDataType = dataType?.toLowerCase() || '';
  
  // Explicit time unit suffixes
  if (lowerName.includes('_ns') || lowerName.endsWith('_ns')) return 'ns';
  if (lowerName.includes('_us') || lowerName.endsWith('_us')) return 'us';
  if (lowerName.includes('_ms') || lowerName.endsWith('_ms')) return 'ms';
  if (lowerName.includes('_s') || lowerName.endsWith('_s')) return 's';
  
  // Special cases for common time-series patterns
  if (columnName === '__timestamp') return 'ns'; // Common in time-series DBs
  if (lowerName.includes('nano')) return 'ns';
  if (lowerName.includes('micro')) return 'us';
  if (lowerName.includes('milli')) return 'ms';
  
  // Data type-based inference
  if (lowerDataType.includes('bigint') || lowerDataType.includes('int64')) {
    // BigInt is often used for nanosecond timestamps
    return 'ns';
  }
  
  // Common patterns for epoch timestamps
  if (lowerName.includes('epoch') || lowerName.includes('unix')) return 's';
  if (lowerName.includes('timestamp')) return 'ms'; // Most common default
  if (lowerName === 'time') return 'ms';
  
  // Default to milliseconds for most time columns
  return 'ms';
}

/**
 * Determine if we should use epoch format based on column characteristics
 */
export function shouldUseEpochFormat(columnName: string, timeUnit: TimeUnit): boolean {
  const lowerName = columnName.toLowerCase();
  
  // Always use epoch for __timestamp (common in time-series DBs)
  if (columnName === '__timestamp') return true;
  
  // Always use epoch for explicit time unit columns
  if (timeUnit !== 'ms' || lowerName.includes('_ns') || lowerName.includes('_us') || 
      lowerName.includes('_ms') || lowerName.includes('_s')) {
    return true;
  }
  
  // Use epoch for common time-series patterns
  if (lowerName.includes('epoch') || lowerName.includes('unix') || 
      lowerName === 'time' || lowerName === 'timestamp') {
    return true;
  }
  
  // Default to string format for date-like columns
  if (lowerName.includes('date') || lowerName.includes('created') || lowerName.includes('updated')) {
    return false;
  }
  
  // Default to epoch for most time columns (common in time-series DBs)
  return true;
}

/**
 * Parse NDJSON string into array of records with proper error handling
 */
export function parseNDJSON(rawJson: string): { records: any[]; errors: string[] } {
  const records: any[] = [];
  const errors: string[] = [];
  
  if (!rawJson || typeof rawJson !== 'string') {
    return { records, errors: ['Invalid NDJSON input'] };
  }
  
  const lines = rawJson.trim().split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines
    
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

/**
 * Create optimal time column details for query processing
 */
export function createTimeColumnDetails(timeColumn: string, dataType?: string) {
  const timeUnit = inferTimeUnitFromColumnName(timeColumn, dataType);
  return {
    columnName: timeColumn,
    dataType,
    timeUnit,
  };
}

/**
 * Convert timestamp value to JavaScript Date object
 */
export function convertTimestampToDate(value: any, timeUnit: TimeUnit): Date | null {
  if (value === null || value === undefined) return null;
  
  let timestamp: number;
  
  // Handle different input types
  if (typeof value === 'string') {
    // Try parsing as number first
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed)) {
      timestamp = parsed;
    } else {
      // Try parsing as date string
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
    case 'ns':
      timestampMs = timestamp / 1000000;
      break;
    case 'us':
      timestampMs = timestamp / 1000;
      break;
    case 'ms':
      timestampMs = timestamp;
      break;
    case 's':
      timestampMs = timestamp * 1000;
      break;
    default:
      timestampMs = timestamp;
  }
  
  return new Date(timestampMs);
}

/**
 * Validate dashboard time range
 */
export function validateTimeRange(timeRange: any): boolean {
  if (!timeRange || typeof timeRange !== 'object') return false;
  
  if (timeRange.type === 'relative') {
    return typeof timeRange.from === 'string' && 
           typeof timeRange.to === 'string' && 
           timeRange.to === 'now';
  }
  
  if (timeRange.type === 'absolute') {
    return (timeRange.from instanceof Date || typeof timeRange.from === 'string') && 
           (timeRange.to instanceof Date || typeof timeRange.to === 'string');
  }
  
  // Handle main query time range format
  if (timeRange.from && timeRange.to) {
    return typeof timeRange.from === 'string' && typeof timeRange.to === 'string';
  }
  
  return false;
}

/**
 * Generate safe SQL query with time filtering
 */
export function generateTimeFilteredQuery(table: string, timeColumn?: string): string {
  const safeTimeColumn = timeColumn || 'timestamp';
  return `SELECT * FROM ${table} WHERE $__timeFilter ORDER BY ${safeTimeColumn} DESC LIMIT 1000`;
}