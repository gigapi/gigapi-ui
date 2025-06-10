import { 
  subDays, 
  subHours, 
  subMinutes, 
  subMonths, 
  subYears, 
  startOfWeek 
} from "date-fns";
import { TIME_PATTERNS, TIME_UNITS, type TimeUnit } from "../../types/utils.types";

/**
 * Parse relative time expressions like "now-1h", "now+30m"
 */
export function parseRelativeTime(
  timeStr: string,
  baseDate: Date = new Date()
): Date | null {
  if (!timeStr || typeof timeStr !== "string") return null;

  if (timeStr === "now") {
    return new Date(baseDate);
  }

  if (!timeStr.startsWith("now")) {
    // Try to parse as absolute date
    try {
      const date = new Date(timeStr);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }

  // Handle complex patterns like "now-1d/d" (start of yesterday)
  const complexMatch = timeStr.match(TIME_PATTERNS.COMPLEX_RELATIVE);
  if (complexMatch) {
    const [, amount, unit, snapTo] = complexMatch;
    const value = parseInt(amount, 10);
    if (isNaN(value)) return null;

    let result = applyTimeShift(baseDate, -value, unit);
    return snapToTimeUnit(result, snapTo);
  }

  // Handle "now/unit" patterns (start of current unit)
  const nowSnapMatch = timeStr.match(TIME_PATTERNS.NOW_SNAP);
  if (nowSnapMatch) {
    const snapTo = nowSnapMatch[1];
    return snapToTimeUnit(new Date(baseDate), snapTo);
  }

  // Handle standard relative patterns
  const match = timeStr.match(TIME_PATTERNS.RELATIVE);
  if (!match) return null;

  const [, operator, value, unit] = match;
  if (!operator || !value || !unit) return new Date(baseDate);

  const amount = parseInt(value, 10);
  if (isNaN(amount)) return new Date(baseDate);

  const adjustedAmount = operator === "-" ? -amount : amount;
  return applyTimeShift(baseDate, adjustedAmount, unit);
}

/**
 * Apply time shift to a date
 */
export function applyTimeShift(date: Date, amount: number, unit: string): Date {
  try {
    switch (unit) {
      case "s":
        return new Date(date.getTime() + amount * 1000);
      case "m":
        return subMinutes(date, -amount);
      case "h":
        return subHours(date, -amount);
      case "d":
        return subDays(date, -amount);
      case "w":
        return subDays(date, -amount * 7);
      case "M":
        return subMonths(date, -amount);
      case "y":
        return subYears(date, -amount);
      default:
        return new Date(date);
    }
  } catch (error) {
    console.error("Error applying time shift:", error);
    return new Date(date);
  }
}

/**
 * Snap date to start of time unit
 */
export function snapToTimeUnit(date: Date, unit: string): Date {
  const result = new Date(date);

  switch (unit) {
    case "s":
      result.setMilliseconds(0);
      break;
    case "m":
      result.setSeconds(0, 0);
      break;
    case "h":
      result.setMinutes(0, 0, 0);
      break;
    case "d":
      result.setHours(0, 0, 0, 0);
      break;
    case "w":
      const startOfWeekDate = startOfWeek(result, { weekStartsOn: 1 }); // Monday
      return startOfWeekDate;
    case "M":
      result.setDate(1);
      result.setHours(0, 0, 0, 0);
      break;
    case "y":
      result.setMonth(0, 1);
      result.setHours(0, 0, 0, 0);
      break;
    default:
      return result;
  }

  return result;
}

/**
 * Check if a date string is absolute (not relative)
 */
export function isAbsoluteDate(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== "string") return false;
  return !dateStr.startsWith("now") && TIME_PATTERNS.ISO_DATE.test(dateStr);
}

/**
 * Convert date to scaled epoch based on time unit
 */
export function convertDateToScaledEpoch(date: Date, timeUnit: TimeUnit): number {
  const ms = date.getTime();

  switch (timeUnit) {
    case TIME_UNITS.SECOND:
      return Math.floor(ms / 1000);
    case TIME_UNITS.MILLISECOND:
      return ms;
    case TIME_UNITS.MICROSECOND:
      return ms * 1000;
    case TIME_UNITS.NANOSECOND:
      return ms * 1000000;
    default:
      return Math.floor(ms / 1000); // Default to seconds
  }
}
