
export function isTimestamp(value: string): boolean {
  const num = Number(value);
  if (isNaN(num)) return false;
  
  // Unix timestamp in seconds (1970-2100 range roughly)
  if (num >= 0 && num <= 4102444800) return true;
  
  // Unix timestamp in milliseconds (1970-2100 range roughly)
  if (num >= 0 && num <= 4102444800000) return true;
  
  return false;
}

/**
 * Checks if a string could be an ISO date or similar date format
 */
export function isDateString(value: string): boolean {
  // Check common date formats (ISO, SQL date, etc.)
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return true;
  if (/^\d{4}\/\d{2}\/\d{2}/.test(value)) return true;
  
  // RFC 3339 format with timezone
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return true;
  
  return false;
}

/**
 * Formats a timestamp (in seconds or milliseconds) to a human-readable date string
 */
export function formatTimestamp(timestamp: number | string): string {
  try {
    const num = typeof timestamp === 'string' ? Number(timestamp) : timestamp;
    if (isNaN(num)) return String(timestamp);
    
    const date = new Date(num < 10000000000 ? num * 1000 : num);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) return String(timestamp);
    
    return formatDate(date);
  } catch (err) {
    return String(timestamp);
  }
}

/**
 * Formats a date string to a human-readable date string
 */
export function formatDateString(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) return dateStr;
    
    return formatDate(date);
  } catch (err) {
    return dateStr;
  }
}

/**
 * Formats a Date object to a human-readable string
 */
function formatDate(date: Date): string {
  // For recent dates (today), show time only
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const isToday = date.toDateString() === now.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();
  
  if (isToday) {
    return date.toLocaleTimeString(undefined, { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  }
  
  if (isYesterday) {
    return `Yesterday, ${date.toLocaleTimeString(undefined, { 
      hour: '2-digit', 
      minute: '2-digit'
    })}`;
  }
  
  // Current year - show month and day
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  // Different year - show full date
  return date.toLocaleDateString(undefined, { 
    year: 'numeric',
    month: 'short', 
    day: 'numeric'
  });
}

/**
 * Auto-detects and formats a potential date/time value
 */
export function autoFormatDateTime(value: any): string {
  if (value === null || value === undefined) return '';
  
  const strValue = String(value);
  
  // Check if it's a numeric timestamp
  if (isTimestamp(strValue)) {
    return formatTimestamp(strValue);
  }
  
  // Check if it's a date string
  if (isDateString(strValue)) {
    return formatDateString(strValue);
  }
  
  // Not a recognized date/time format
  return strValue;
}

/**
 * Detects if a field name likely contains date or time information
 */
export function isDateTimeField(fieldName: string): boolean {
  const lowerField = fieldName.toLowerCase();
  return (
    lowerField.includes('date') ||
    lowerField.includes('time') ||
    lowerField.includes('timestamp') ||
    lowerField.includes('created') ||
    lowerField.includes('updated') ||
    lowerField.includes('modified') ||
    lowerField.includes('occurred') ||
    lowerField === 'ts'
  );
}