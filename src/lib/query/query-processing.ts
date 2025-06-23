import type { ColumnSchema, TimeRange } from "@/types/utils.types";
import { TIME_VARIABLE_PATTERNS } from "@/types/utils.types";

/**
 * Detect time fields from column schema
 */
export function detectTimeFieldsFromSchema(columns: ColumnSchema[]): string[] {
  return columns
    .filter((col) => {
      const colName = col.columnName.toLowerCase();
      const dataType = col.dataType?.toLowerCase() || "";
      
      // Check for explicit time units
      if (col.timeUnit) return true;
      
      // Check for common time field patterns
      return (
        colName.includes("time") ||
        colName.includes("date") ||
        colName.includes("timestamp") ||
        colName === "__timestamp" ||
        colName === "created_at" ||
        colName === "updated_at" ||
        colName.endsWith("_at") ||
        colName.endsWith("_time") ||
        colName.endsWith("_date") ||
        colName.endsWith("_ts") ||
        colName.endsWith("_ns") ||
        colName.endsWith("_us") ||
        colName.endsWith("_ms") ||
        colName.endsWith("_s") ||
        dataType.includes("timestamp") ||
        dataType.includes("datetime") ||
        dataType.includes("date")
      );
    })
    .map((col) => col.columnName);
}

/**
 * Check if query contains time variables
 */
export function checkForTimeVariables(query: string): boolean {
  if (!query || typeof query !== 'string') return false;
  
  // Check for any time variables using non-global regex
  return TIME_VARIABLE_PATTERNS.ALL_TIME_VARS.test(query);
}

/**
 * Validate time variable context
 */
export function validateTimeVariableContext(
  query: string,
  selectedTimeField: string | undefined,
  timeRange: TimeRange
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!checkForTimeVariables(query)) {
    return { isValid: true, errors: [] };
  }
  
  // Check if time field is selected when needed
  if (query.includes('$__timeFilter') && !selectedTimeField) {
    errors.push("Time field must be selected when using $__timeFilter");
  }
  
  // Check if time range is enabled
  if (!timeRange.enabled) {
    errors.push("Time range must be enabled when using time variables");
  }
  
  // Check if time range has valid values
  if (!timeRange.from || !timeRange.to) {
    errors.push("Time range must have valid from and to values");
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Process query with time variables - simplified version
 */
export function processQueryWithTimeVariables(
  query: string,
  selectedTimeField: string | undefined,
  timeRange: TimeRange,
  selectedTimeFieldDetails?: ColumnSchema | null,
  _timeZone = "UTC"
): { processedQuery: string; hasTimeVariables: boolean; error?: string } {
  const hasTimeVariables = checkForTimeVariables(query);
  
  if (!hasTimeVariables) {
    return { processedQuery: query, hasTimeVariables: false };
  }
  
  try {
    let processedQuery = query;
    
    // Replace $__timeField
    if (selectedTimeField) {
      processedQuery = processedQuery.replace(/\$__timeField/g, selectedTimeField);
    }
    
    // Replace $__timeFilter with a basic implementation
    if (selectedTimeField && timeRange.enabled) {
      const timeUnit = selectedTimeFieldDetails?.timeUnit || 'ms';
      const fromValue = convertTimeToEpoch(timeRange.from, timeUnit);
      const toValue = convertTimeToEpoch(timeRange.to, timeUnit);
      
      const timeFilter = `${selectedTimeField} >= ${fromValue} AND ${selectedTimeField} <= ${toValue}`;
      processedQuery = processedQuery.replace(/\$__timeFilter/g, timeFilter);
    }
    
    // Replace $__timeFrom and $__timeTo
    if (timeRange.enabled) {
      const timeUnit = selectedTimeFieldDetails?.timeUnit || 'ms';
      const fromValue = convertTimeToEpoch(timeRange.from, timeUnit);
      const toValue = convertTimeToEpoch(timeRange.to, timeUnit);
      
      processedQuery = processedQuery.replace(/\$__timeFrom/g, fromValue.toString());
      processedQuery = processedQuery.replace(/\$__timeTo/g, toValue.toString());
    }
    
    return { processedQuery, hasTimeVariables: true };
  } catch (error) {
    return {
      processedQuery: query,
      hasTimeVariables: true,
      error: error instanceof Error ? error.message : "Unknown error processing time variables"
    };
  }
}

/**
 * Convert time string to epoch based on time unit
 */
function convertTimeToEpoch(timeStr: string, timeUnit: string): number {
  let date: Date;
  
  // Handle relative time strings
  if (timeStr.toLowerCase() === 'now') {
    date = new Date();
  } else if (timeStr.match(/^now-(\d+)([smhdwMy])$/)) {
    // Parse relative time like "now-1h", "now-30m", etc.
    const match = timeStr.match(/^now-(\d+)([smhdwMy])$/);
    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2];
      
      date = new Date();
      switch (unit) {
        case 's':
          date.setSeconds(date.getSeconds() - value);
          break;
        case 'm':
          date.setMinutes(date.getMinutes() - value);
          break;
        case 'h':
          date.setHours(date.getHours() - value);
          break;
        case 'd':
          date.setDate(date.getDate() - value);
          break;
        case 'w':
          date.setDate(date.getDate() - (value * 7));
          break;
        case 'M':
          date.setMonth(date.getMonth() - value);
          break;
        case 'y':
          date.setFullYear(date.getFullYear() - value);
          break;
        default:
          date = new Date(timeStr);
      }
    } else {
      date = new Date(timeStr);
    }
  } else {
    // Try parsing as regular date
    date = new Date(timeStr);
  }
  
  const epochMs = date.getTime();
  
  switch (timeUnit) {
    case 'ns':
      return epochMs * 1000000;
    case 'us':
      return epochMs * 1000;
    case 'ms':
      return epochMs;
    case 's':
      return Math.floor(epochMs / 1000);
    default:
      return epochMs;
  }
}

/**
 * Preview what the processed query will look like without executing
 */
export function previewProcessedQuery(
  query: string,
  selectedTimeField: string | undefined,
  timeRange: TimeRange,
  selectedTimeFieldDetails?: ColumnSchema | null,
  timeZone = "UTC"
): { processedQuery: string; hasTimeVariables: boolean; errors: string[] } {
  const hasTimeVariables = checkForTimeVariables(query);
  
  if (!hasTimeVariables) {
    return { processedQuery: query, hasTimeVariables: false, errors: [] };
  }
  
  // Validate first
  const validation = validateTimeVariableContext(query, selectedTimeField, timeRange);
  if (!validation.isValid) {
    return { 
      processedQuery: query, 
      hasTimeVariables: true, 
      errors: validation.errors 
    };
  }
  
  // Process the query
  const result = processQueryWithTimeVariables(
    query, 
    selectedTimeField, 
    timeRange, 
    selectedTimeFieldDetails, 
    timeZone
  );
  
  return {
    processedQuery: result.processedQuery,
    hasTimeVariables: result.hasTimeVariables,
    errors: result.error ? [result.error] : []
  };
}
