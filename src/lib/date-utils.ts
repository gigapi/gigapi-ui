/**
 * Utility functions for working with dates and timestamps
 */

/**
 * Check if a field name indicates it likely contains date-time values
 */
export function isDateTimeField(fieldName: string): boolean {
  if (!fieldName) return false;

  // Normalize field name for case-insensitive matching
  const name = fieldName.toLowerCase();
  
  // Check for common date/time field naming patterns
  return (
    name === 'date' ||
    name === 'time' ||
    name === 'datetime' ||
    name === 'timestamp' ||
    name === '__timestamp' ||
    name === 'created_at' ||
    name === 'updated_at' ||
    name === 'create_date' ||
    name === 'modified_date' ||
    name === 'date_hour' ||
    name.includes('date') ||
    name.includes('time') ||
    name.endsWith('_at') ||
    name.endsWith('_ts') ||
    name.endsWith('_dt')
  );
}

/**
 * Check if a string value appears to be a timestamp
 */
export function isTimestamp(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  
  // Check if it's a very large number that could be a timestamp
  if (typeof value === 'number') {
    // Milliseconds timestamp (13 digits typically)
    if (value > 1000000000000 && value < 10000000000000) return true;
    
    // Seconds timestamp (10 digits typically)
    if (value > 1000000000 && value < 10000000000) return true;
  }
  
  // For string values that contain only digits
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const numVal = Number(value);
    
    // Check if it parses to a valid timestamp range
    // Milliseconds (usually 13 digits)
    if (numVal > 1000000000000 && numVal < 10000000000000) return true;
    
    // Seconds (usually 10 digits)
    if (numVal > 1000000000 && numVal < 10000000000) return true;
  }
  
  return false;
}

/**
 * Check if a string value appears to be a date string (ISO, SQL, etc.)
 */
export function isDateString(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'string') return false;
  
  // Check for ISO date format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) return true;
  
  // Check for other common date formats
  if (/^\d{4}\/\d{2}\/\d{2}/.test(value)) return true; // YYYY/MM/DD
  if (/^\d{2}\/\d{2}\/\d{4}/.test(value)) return true; // MM/DD/YYYY or DD/MM/YYYY
  if (/^\d{2}-\d{2}-\d{4}/.test(value)) return true; // MM-DD-YYYY or DD-MM-YYYY
  
  // Try parsing as a date
  try {
    const date = new Date(value);
    return !isNaN(date.getTime());
  } catch (e) {
    return false;
  }
}

/**
 * Convert any timestamp format to a JavaScript Date object
 */
export function timestampToDate(timestamp: number | string): Date {
  if (typeof timestamp === 'string') {
    timestamp = Number(timestamp);
  }
  
  // If it's already a reasonable date in milliseconds (between years ~1970 and ~2070)
  if (timestamp > 0 && timestamp < 4102444800000) {
    return new Date(timestamp);
  }
  
  // If it's in seconds (UNIX timestamp)
  if (timestamp > 0 && timestamp < 4102444800) {
    return new Date(timestamp * 1000);
  }
  
  // If it's in microseconds
  if (timestamp > 4102444800000 && timestamp < 4102444800000000) {
    return new Date(timestamp / 1000);
  }
  
  // If it's in nanoseconds
  if (timestamp > 4102444800000000) {
    return new Date(timestamp / 1000000);
  }
  
  // Default fallback
  return new Date(timestamp);
}

/**
 * Format a date value for display with the appropriate format based on its value
 */
export function formatDateForDisplay(value: Date | number | string): string {
  let date: Date;
  
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'number') {
    date = timestampToDate(value);
  } else if (typeof value === 'string') {
    if (/^\d+$/.test(value)) {
      // Numeric string
      date = timestampToDate(Number(value));
    } else {
      // Try parsing as ISO or other format
      date = new Date(value);
    }
  } else {
    return String(value);
  }
  
  // Check if date is valid
  if (isNaN(date.getTime())) {
    return String(value);
  }
  
  // Format based on time precision needed
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isThisYear = date.getFullYear() === now.getFullYear();
  
  // Format with hours:minutes if it's today
  if (isToday) {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
  
  // Format with month and day if it's this year
  if (isThisYear) {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  // Full date format for older dates
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}
