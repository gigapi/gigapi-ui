/**
 * Parse relative time strings
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
 * Validate individual time input - returns error message or null
 */
export function validateInput(input: string, options?: { required?: boolean }, fieldName?: string): string | null {
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