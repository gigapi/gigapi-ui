import { format } from "date-fns";

/**
 * Parse relative time expressions into timestamp
 */
export function parseRelativeTime(relativeTime: string): number {
  if (!relativeTime) return Date.now();

  if (relativeTime === "now") {
    return Date.now();
  }

  // Handle simple relative time patterns (now-1h, now-7d, etc.)
  if (relativeTime.startsWith("now-")) {
    const simpleMatch = relativeTime.match(/^now-(\d+)([mhdwMy])$/);
    if (simpleMatch) {
      return parseSimpleRelativeTime(simpleMatch);
    }

    // Handle complex formats like "now-1d/d" (start of yesterday)
    const complexMatch = relativeTime.match(/^now-(\d+)([mhdwMy])\/([mhdwMy])$/);
    if (complexMatch) {
      return parseComplexRelativeTime(complexMatch);
    }
  }

  // Handle snap-to patterns (now/d, now/w, etc.)
  if (relativeTime.startsWith("now/")) {
    return parseSnapToTime(relativeTime);
  }

  // Try to parse as ISO date or timestamp
  try {
    const timestamp = Date.parse(relativeTime);
    if (!isNaN(timestamp)) {
      return timestamp;
    }
  } catch (e) {
    console.error("Error parsing time:", e);
  }

  // If cannot parse, return current time
  return Date.now();
}

/**
 * Parse simple relative time patterns
 */
function parseSimpleRelativeTime(match: RegExpMatchArray): number {
  const [, amount, unit] = match;
  const value = parseInt(amount, 10);
  const now = Date.now();

  const multipliers = {
    m: 60 * 1000,                    // minutes
    h: 60 * 60 * 1000,              // hours
    d: 24 * 60 * 60 * 1000,         // days
    w: 7 * 24 * 60 * 60 * 1000,     // weeks
    M: 30 * 24 * 60 * 60 * 1000,    // months (approximate)
    y: 365 * 24 * 60 * 60 * 1000,   // years (approximate)
  };

  const multiplier = multipliers[unit as keyof typeof multipliers];
  return multiplier ? now - value * multiplier : now;
}

/**
 * Parse complex relative time patterns with snap-to
 */
function parseComplexRelativeTime(match: RegExpMatchArray): number {
  const [, amount, unit, snapTo] = match;
  const value = parseInt(amount, 10);
  let timestamp = Date.now();

  // First apply the subtraction
  const multipliers = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    M: 30 * 24 * 60 * 60 * 1000,
    y: 365 * 24 * 60 * 60 * 1000,
  };

  const multiplier = multipliers[unit as keyof typeof multipliers];
  if (multiplier) {
    timestamp -= value * multiplier;
  }

  // Then snap to the unit boundary
  return snapToTimeUnit(timestamp, snapTo);
}

/**
 * Parse snap-to time patterns (now/d, now/w, etc.)
 */
function parseSnapToTime(relativeTime: string): number {
  const unit = relativeTime.substring(4);
  return snapToTimeUnit(Date.now(), unit);
}

/**
 * Snap timestamp to unit boundary
 */
function snapToTimeUnit(timestamp: number, unit: string): number {
  const date = new Date(timestamp);
  
  switch (unit) {
    case "d": // Start of day
      date.setHours(0, 0, 0, 0);
      break;
    case "w": // Start of week (Sunday)
      const day = date.getDay();
      date.setDate(date.getDate() - day);
      date.setHours(0, 0, 0, 0);
      break;
    case "M": // Start of month
      date.setDate(1);
      date.setHours(0, 0, 0, 0);
      break;
    case "y": // Start of year
      date.setMonth(0, 1);
      date.setHours(0, 0, 0, 0);
      break;
    default:
      break;
  }
  
  return date.getTime();
}

/**
 * Convert relative expressions to display format
 */
export function getDisplayTime(timeStr: string): string {
  if (!timeStr) return "now";

  if (timeStr === "now") {
    return "now";
  }

  try {
    if (timeStr.startsWith("now-") || timeStr.startsWith("now/")) {
      const timestamp = parseRelativeTime(timeStr);
      return format(new Date(timestamp), "yyyy-MM-dd HH:mm:ss");
    }

    // Try to parse as ISO string or timestamp
    const date = new Date(timeStr);
    if (!isNaN(date.getTime())) {
      return format(date, "yyyy-MM-dd HH:mm:ss");
    }
  } catch (e) {
    console.error("Error parsing time:", e);
  }

  return timeStr;
}

/**
 * Get browser timezone safely
 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (e) {
    console.error("Error getting browser timezone:", e);
    return "UTC";
  }
}

/**
 * Format timezone for display
 */
export function formatTimezone(timezone: string): string {
  if (!timezone) return "UTC";

  try {
    // Format: Continent/City -> City (UTC+XX:XX)
    const parts = timezone.split("/");
    const city =
      parts.length > 1 ? parts[parts.length - 1].replace(/_/g, " ") : timezone;

    // Get the UTC offset
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      timeZoneName: "short",
    });
    const formatted = formatter.format(now);
    const tzPart = formatted.split(" ").pop() || "";

    return `${city} (${tzPart})`;
  } catch (e) {
    console.error("Error formatting timezone:", e);
    return timezone;
  }
}

/**
 * Get timezone offset in UTC format
 */
export function getTimezoneOffset(timezone: string): string {
  try {
    // Special handling for Browser Time
    if (timezone === "Browser_Time") {
      const offset = -new Date().getTimezoneOffset();
      const hours = Math.floor(Math.abs(offset) / 60);
      const minutes = Math.abs(offset) % 60;
      const sign = offset >= 0 ? "+" : "-";
      return `UTC${sign}${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}`;
    }

    // For all other timezones
    const now = new Date();
    const tzString = now.toLocaleString("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    });
    const match = tzString.match(/GMT([+-]\d{1,2}(?::\d{2})?)/);

    if (match && match[1]) {
      // Format to UTC+XX:XX
      let offset = match[1].replace("GMT", "UTC");
      // Add minutes if they're not present
      if (!offset.includes(":")) {
        offset += ":00";
      }
      return offset;
    }

    // Standard UTC if timezone is UTC/GMT
    if (timezone === "UTC" || timezone === "GMT") {
      return "UTC+00:00";
    }

    // Fallback
    return timezone.includes("UTC") ? timezone : "UTC";
  } catch (e) {
    console.error("Error getting timezone offset:", e);
    return "UTC";
  }
}

/**
 * Validate time range inputs
 */
export function validateTimeInputs(fromInput: string, toInput: string): boolean {
  if (!fromInput || !toInput) {
    return false;
  }

  try {
    const fromTime = parseRelativeTime(fromInput);
    const toTime = parseRelativeTime(toInput);
    
    // Check if both parse to valid timestamps
    return !isNaN(fromTime) && !isNaN(toTime) && fromTime < toTime;
  } catch {
    return false;
  }
}

/**
 * Convert formatted date input to appropriate value
 */
export function convertDateInput(input: string): string {
  if (input.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
    const date = new Date(input.replace(" ", "T"));
    return date.toISOString();
  }
  return input;
}