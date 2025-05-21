import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { subDays, subHours, subMinutes, subMonths, subYears, parseISO } from "date-fns"
import { toZonedTime } from "date-fns-tz"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB"]
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(size < 10 ? 2 : 1)}${units[unitIndex]}`
}

export function formatDuration(ms: number) {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`
  } else {
    // Format as minutes:seconds for clearer display
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    
    if (seconds === 0) {
      return `${minutes}m`;
    } else {
      return `${minutes}m ${seconds}s`;
    }
  }
}

/**
 * Parses a relative date string (e.g., "now-5m", "now-24h") based on a given baseDate.
 * Uses date-fns for robust date manipulation.
 * @param relativeString The relative time string to parse
 * @param baseDate The reference date (defaults to current date if not provided)
 * @returns A Date object representing the relative time
 */
export function parseRelativeDate(
  relativeString: string,
  baseDate: Date = new Date()
): Date {
  // Handle current time
  if (relativeString.toLowerCase() === "now") {
    return baseDate;
  }

  // Parse relative time expressions like "now-5m", "now-24h"
  const match = relativeString.match(/^now-(\d+)([mhdwMy])$/);
  if (!match) return baseDate;

  const amount = parseInt(match[1], 10);
  const unit = match[2];

  // Handle complex cases like now-1d/d (start of yesterday)
  const complexMatch = relativeString.match(
    /^now-(\d+)([mhdwMy])\/([mhdwMy])$/
  );
  if (complexMatch) {
    const [, complexAmount, complexUnit, snapTo] = complexMatch;
    const value = parseInt(complexAmount, 10);

    // Apply the time shift using date-fns
    let result: Date;
    switch (complexUnit) {
      case "m":
        result = subMinutes(baseDate, value);
        break;
      case "h":
        result = subHours(baseDate, value);
        break;
      case "d":
        result = subDays(baseDate, value);
        break;
      case "w":
        result = subDays(baseDate, value * 7);
        break;
      case "M":
        result = subMonths(baseDate, value);
        break;
      case "y":
        result = subYears(baseDate, value);
        break;
      default:
        result = new Date(baseDate);
        break;
    }

    // Then snap to the unit boundary
    const date = new Date(result);
    switch (snapTo) {
      case "d": // Start of day
        return new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
          0,
          0,
          0,
          0
        );
      case "w": // Start of week (Sunday)
        return new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate() - date.getDay(),
          0,
          0,
          0,
          0
        );
      case "M": // Start of month
        return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
      case "y": // Start of year
        return new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
      default:
        return result;
    }
  }

  // Handle now/unit (start of current unit)
  const nowSnapMatch = relativeString.match(/^now\/([mhdwMy])$/);
  if (nowSnapMatch) {
    const snapTo = nowSnapMatch[1];
    const date = new Date(baseDate);

    switch (snapTo) {
      case "d": // Start of day
        return new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
          0,
          0,
          0,
          0
        );
      case "w": // Start of week (Sunday)
        return new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate() - date.getDay(),
          0,
          0,
          0,
          0
        );
      case "M": // Start of month
        return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
      case "y": // Start of year
        return new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
      default:
        return date;
    }
  }

  // Apply time shift using date-fns for standard expressions
  switch (unit) {
    case "m":
      return subMinutes(baseDate, amount);
    case "h":
      return subHours(baseDate, amount);
    case "d":
      return subDays(baseDate, amount);
    case "w":
      return subDays(baseDate, amount * 7);
    case "M":
      return subMonths(baseDate, amount);
    case "y":
      return subYears(baseDate, amount);
    default:
      return baseDate;
  }
}

/**
 * Resolves a TimeRange object to absolute Date objects with timezone handling.
 * For "now" or relative strings, it uses the current time.
 * For absolute date strings, it parses them.
 */
export function resolveTimeRangeToDates(
  timeRange: { from: string; to: string },
  selectedTimeZone: string,
  isAbsoluteDate: (dateStr: string) => boolean
): { fromDate: Date; toDate: Date } {
  const now = new Date();
  let fromDate: Date;
  let toDate: Date;

  // Apply timezone if set (otherwise use browser local time)
  const applyTimezone = (date: Date): Date => {
    if (
      selectedTimeZone &&
      selectedTimeZone !== "UTC" &&
      selectedTimeZone !== "GMT"
    ) {
      try {
        return toZonedTime(date, selectedTimeZone);
      } catch (e) {
        console.warn("Error converting to timezone:", e);
        return date;
      }
    }
    return date;
  };

  // Handle 'from' date
  if (isAbsoluteDate(timeRange.from)) {
    // Parse ISO date string
    try {
      fromDate = parseISO(timeRange.from);
    } catch (e) {
      console.warn("Error parsing from date:", e);
      fromDate = now;
    }
  } else if (timeRange.from.toLowerCase() === "now") {
    fromDate = now;
  } else {
    // Relative time (e.g., "now-5m")
    fromDate = parseRelativeDate(timeRange.from, now);
  }

  // Handle 'to' date
  if (isAbsoluteDate(timeRange.to)) {
    // Parse ISO date string
    try {
      toDate = parseISO(timeRange.to);
    } catch (e) {
      console.warn("Error parsing to date:", e);
      toDate = now;
    }
  } else if (timeRange.to.toLowerCase() === "now") {
    toDate = now;
  } else {
    // Relative time (e.g., "now-5m")
    toDate = parseRelativeDate(timeRange.to, now);
  }

  // Apply timezone to both dates
  fromDate = applyTimezone(fromDate);
  toDate = applyTimezone(toDate);

  // Basic validation to ensure fromDate is not after toDate
  if (fromDate.getTime() > toDate.getTime()) {
    console.warn(
      "Time range warning: 'from' date is after 'to' date. Swapping them."
    );
    return { fromDate: toDate, toDate: fromDate };
  }

  return { fromDate, toDate };
}

/**
 * Converts a JavaScript Date object to a numeric epoch value, scaled to the target unit.
 * Uses date-fns for more accurate timestamp generation.
 */
export function convertDateToScaledEpoch(
  date: Date,
  unit: "s" | "ms" | "us" | "ns" | undefined
): number {
  // Get the timestamp in milliseconds
  const millis = date.getTime();

  // Apply scaling based on the unit
  switch (unit) {
    case "s": // Seconds
      return Math.floor(millis / 1000);
    case "ms": // Milliseconds (default for JS)
      return millis;
    case "us": // Microseconds
      return millis * 1000;
    case "ns": // Nanoseconds
      return millis * 1000000;
    default:
      // If unit is undefined, log a warning and default to milliseconds
      console.warn(
        `convertDateToScaledEpoch called with undefined unit for date ${date.toISOString()}. Defaulting to milliseconds.`
      );
      return millis;
  }
}
