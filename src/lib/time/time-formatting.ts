import { formatISO } from "date-fns";
import { parseRelativeTime } from "./time-parsing";

/**
 * Convert display time string for input components
 */
export function getDisplayTime(timeStr: string): string {
  if (!timeStr || typeof timeStr !== "string") return "now";
  if (timeStr === "now") return "now";

  try {
    if (timeStr.startsWith("now")) {
      const date = parseRelativeTime(timeStr);
      return date ? formatISO(date, { representation: "complete" }) : timeStr;
    }

    const date = new Date(timeStr);
    if (!isNaN(date.getTime())) {
      return formatISO(date, { representation: "complete" });
    }
  } catch (error) {
    console.error("Error getting display time:", error);
  }

  return timeStr;
}

/**
 * Convert date input to appropriate format
 */
export function convertDateInput(input: string): string {
  if (!input || typeof input !== "string") return "now";

  // If it's already a relative time expression, return as is
  if (input.startsWith("now")) return input;

  // Try to parse as a date and convert to ISO string
  try {
    const date = new Date(input);
    if (!isNaN(date.getTime())) {
      return formatISO(date, { representation: "complete" });
    }
  } catch (error) {
    console.error("Error converting date input:", error);
  }

  return input;
}

/**
 * Format date for SQL queries
 */
export function formatDateForSql(date: Date): string {
  return `'${formatISO(date, { representation: "complete" })}'`;
}

/**
 * Format date in consistent format
 */
export function formatDate(
  dateInput: string | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;

  if (isNaN(date.getTime())) {
    return "Invalid Date";
  }

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  };

  return new Intl.DateTimeFormat("en-US", defaultOptions).format(date);
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  } else if (ms < 3600000) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  } else {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }
}

/**
 * Format execution time specifically for queries
 */
export function formatExecutionTime(milliseconds: number): string {
  return formatDuration(milliseconds);
}
