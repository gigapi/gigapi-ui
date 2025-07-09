/**
 * Centralized Time Processing Utilities
 * Consolidates all time parsing, formatting, and manipulation functions
 */

import { formatInTimeZone } from "date-fns-tz";

export type TimeUnit = 'ns' | 'us' | 'μs' | 'ms' | 's';

// Re-export timezone utilities
export * from "@/lib/utils/timezone";

/**
 * Parse various time value formats into Date objects
 * Handles timestamps in different units, ISO strings, and Date objects
 */
export function parseTimeValue(value: any): Date | null {
  if (!value) return null;
  
  if (value instanceof Date) return value;
  
  // Try to parse as timestamp (various units)
  if (typeof value === 'number' || (typeof value === 'string' && !isNaN(Number(value)))) {
    const numValue = Number(value);
    
    // Auto-detect timestamp format based on value size
    if (numValue > 1e15) {
      // Nanoseconds
      return new Date(numValue / 1000000);
    } else if (numValue > 1e12) {
      // Microseconds  
      return new Date(numValue / 1000);
    } else if (numValue > 1e10) {
      // Milliseconds
      return new Date(numValue);
    } else {
      // Seconds
      return new Date(numValue * 1000);
    }
  }
  
  // Try to parse as ISO string
  try {
    return new Date(value);
  } catch {
    return null;
  }
}

/**
 * Parse timestamp with explicit unit specification
 */
export function parseTimestamp(value: number | string, unit: TimeUnit): Date {
  const numValue = typeof value === 'string' ? Number(value) : value;
  
  switch (unit) {
    case 'ns':
      return new Date(numValue / 1000000);
    case 'us':
    case 'μs':
      return new Date(numValue / 1000);
    case 'ms':
      return new Date(numValue);
    case 's':
      return new Date(numValue * 1000);
    default:
      throw new Error(`Unsupported time unit: ${unit}`);
  }
}

/**
 * Parse relative time strings like "now-1h", "now-30m", "now-1d"
 */
export function parseRelativeTime(timeStr: string): Date {
  const now = new Date();
  
  if (timeStr.toLowerCase() === 'now') {
    return now;
  }
  
  // Parse relative time like "now-1h", "now-30m", "now-1d"
  const match = timeStr.match(/^now-(\d+)([smhdw])$/i);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    const date = new Date(now);
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
    }
    return date;
  }
  
  // Try to parse as ISO date
  try {
    return new Date(timeStr);
  } catch {
    return now;
  }
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString();
  } catch {
    return 'Invalid Date';
  }
}

/**
 * Format time value for display with timezone support
 */
export function formatTimeValue(date: Date, timeZone: string = 'UTC'): string {
  try {
    return formatInTimeZone(date, timeZone, 'yyyy-MM-dd HH:mm:ss zzz');
  } catch {
    return date.toISOString();
  }
}

/**
 * Get display time for UI
 */
export function getDisplayTime(timeStr: string): string {
  try {
    const date = new Date(timeStr);
    return date.toLocaleString();
  } catch {
    return timeStr;
  }
}

/**
 * Format duration in milliseconds
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  } else if (ms < 3600000) {
    return `${(ms / 60000).toFixed(2)}m`;
  } else {
    return `${(ms / 3600000).toFixed(2)}h`;
  }
}

/**
 * Format execution time for display
 */
export function formatExecutionTime(startTime: number, endTime?: number): string {
  const duration = endTime !== undefined ? endTime - startTime : startTime;
  if (duration < 1000) {
    return `${duration.toFixed(0)} ms`;
  } else {
    return `${(duration / 1000).toFixed(2)} s`;
  }
}

/**
 * Format bytes for display
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1048576) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  } else if (bytes < 1073741824) {
    return `${(bytes / 1048576).toFixed(2)} MB`;
  } else {
    return `${(bytes / 1073741824).toFixed(2)} GB`;
  }
}

/**
 * Convert date input to ISO string
 */
export function convertDateInput(input: string): string {
  try {
    if (input.toLowerCase() === 'now') {
      return new Date().toISOString();
    }
    
    const date = parseRelativeTime(input);
    return date.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Validate time inputs
 */
export function validateTimeInputs(from: string, to: string): { isValid: boolean; error?: string } {
  if (!from || !to) {
    return { isValid: false, error: "Both from and to times are required" };
  }
  
  try {
    const fromDate = parseRelativeTime(from);
    const toDate = parseRelativeTime(to);
    
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return { isValid: false, error: "Invalid date format" };
    }
    
    if (fromDate >= toDate) {
      return { isValid: false, error: "From time must be before to time" };
    }
    
    return { isValid: true };
  } catch {
    return { isValid: false, error: "Error parsing dates" };
  }
}

/**
 * Validate individual time input
 */
export function validateTimeInput(input: string, options?: { required?: boolean }, fieldName?: string): string | null {
  if (!input && options?.required) {
    return `${fieldName || 'Field'} is required`;
  }
  
  if (!input) return null;
  
  if (input.toLowerCase() === 'now') return null;
  
  // Check relative time format (now-1h, now-30m, etc.)
  if (/^now-\d+[smhdw]$/i.test(input)) return null;
  
  // Check if it's a valid date
  try {
    const date = new Date(input);
    if (isNaN(date.getTime())) {
      return `${fieldName || 'Field'} must be a valid date or relative time (e.g., now-1h, now-30m)`;
    }
    return null;
  } catch {
    return `${fieldName || 'Field'} has invalid format`;
  }
}

/**
 * Auto-detect timestamp format based on value
 */
export function detectTimeFormat(value: any): TimeUnit | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || isNaN(Number(value)))) {
    return null;
  }
  
  const numValue = Number(value);
  
  if (numValue > 1e15) {
    return 'ns'; // Nanoseconds
  } else if (numValue > 1e12) {
    return 'us'; // Microseconds
  } else if (numValue > 1e10) {
    return 'ms'; // Milliseconds
  } else {
    return 's'; // Seconds
  }
}

/**
 * Convert timestamp between different units
 */
export function convertTimeUnit(value: number, fromUnit: TimeUnit, toUnit: TimeUnit): number {
  // Convert to milliseconds first
  let msValue: number;
  
  switch (fromUnit) {
    case 'ns':
      msValue = value / 1000000;
      break;
    case 'us':
    case 'μs':
      msValue = value / 1000;
      break;
    case 'ms':
      msValue = value;
      break;
    case 's':
      msValue = value * 1000;
      break;
    default:
      throw new Error(`Unsupported source time unit: ${fromUnit}`);
  }
  
  // Convert from milliseconds to target unit
  switch (toUnit) {
    case 'ns':
      return msValue * 1000000;
    case 'us':
    case 'μs':
      return msValue * 1000;
    case 'ms':
      return msValue;
    case 's':
      return msValue / 1000;
    default:
      throw new Error(`Unsupported target time unit: ${toUnit}`);
  }
}

/**
 * Create time range from relative string
 */
export function createTimeRange(from: string, to: string = 'now'): { from: Date; to: Date } {
  return {
    from: parseRelativeTime(from),
    to: parseRelativeTime(to)
  };
}

/**
 * Check if a value looks like a timestamp
 */
export function isTimestampLike(value: any): boolean {
  if (typeof value !== 'number' && (typeof value !== 'string' || isNaN(Number(value)))) {
    return false;
  }
  
  const numValue = Number(value);
  
  // Reasonable timestamp range (Unix epoch to year 3000)
  return numValue > 0 && numValue < 32503680000000; // Year 3000 in milliseconds
}

/**
 * Parse field value that might be a time value
 */
export function parseFieldValue(value: any, fieldName?: string): Date | number | string | null {
  if (value === null || value === undefined) return null;
  
  // If field name suggests it's a time field, try to parse as time
  if (fieldName && (
    fieldName.toLowerCase().includes('time') ||
    fieldName.toLowerCase().includes('date') ||
    fieldName.toLowerCase().includes('timestamp') ||
    fieldName.toLowerCase().includes('created') ||
    fieldName.toLowerCase().includes('updated')
  )) {
    const timeValue = parseTimeValue(value);
    if (timeValue) return timeValue;
  }
  
  // Try numeric conversion
  if (typeof value === 'string' && !isNaN(Number(value))) {
    return Number(value);
  }
  
  return value;
}

