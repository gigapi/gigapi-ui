import { parseISO } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import type { 
  TimeRange, 
  ColumnSchema, 
  ResolvedTimeRange, 
  TimeVariableReplacements
} from "@/types/utils.types";
import { TIME_UNITS, TIME_VARIABLE_PATTERNS } from "@/types/utils.types";
import { parseRelativeTime, isAbsoluteDate, convertDateToScaledEpoch } from "./time-parsing";
import { formatDateForSql } from "./time-formatting";

/**
 * Resolve time range to concrete dates
 */
export function resolveTimeRangeToDates(
  timeRange: Pick<TimeRange, "from" | "to">,
  timeZone: string = "UTC"
): ResolvedTimeRange {
  if (!timeRange.from || !timeRange.to) {
    throw new Error("Time range must have both from and to values");
  }

  const now = new Date();

  const parseTimeString = (timeStr: string): Date => {
    if (isAbsoluteDate(timeStr)) {
      try {
        const parsed = parseISO(timeStr);
        if (isNaN(parsed.getTime())) {
          throw new Error(`Invalid ISO date: ${timeStr}`);
        }
        return timeZone === "UTC" ? parsed : fromZonedTime(parsed, timeZone);
      } catch (error) {
        console.error(`Error parsing absolute date "${timeStr}":`, error);
        return now;
      }
    }

    const relativeDate = parseRelativeTime(timeStr, now);
    return relativeDate || now;
  };

  const fromDate = parseTimeString(timeRange.from);
  const toDate = parseTimeString(timeRange.to);

  return { fromDate, toDate };
}

/**
 * Detect time field type from column schema
 */
export function detectTimeFieldType(
  column: ColumnSchema
): "timestamp" | "epoch" {
  if (!column?.dataType) return "timestamp";

  const dataType = column.dataType.toLowerCase();

  // Check for integer/numeric types that might be epoch timestamps
  if (
    dataType.includes("int") ||
    dataType.includes("long") ||
    dataType.includes("bigint") ||
    dataType.includes("number")
  ) {
    return "epoch";
  }

  // Default to timestamp for date/time types
  return "timestamp";
}

/**
 * Build time filter condition based on field type and time range
 */
export function buildTimeFilter(
  timeField: string,
  timeRange: Pick<TimeRange, "from" | "to">,
  fieldDetails?: ColumnSchema | null,
  timeZone = "UTC"
): string {
  if (!timeField || !timeRange.from || !timeRange.to) {
    return "";
  }

  const { fromDate, toDate } = resolveTimeRangeToDates(timeRange, timeZone);
  const fieldType = fieldDetails
    ? detectTimeFieldType(fieldDetails)
    : "timestamp";

  if (fieldType === "epoch") {
    const timeUnit = fieldDetails?.timeUnit || TIME_UNITS.NANOSECOND;
    const startEpoch = convertDateToScaledEpoch(fromDate, timeUnit);
    const endEpoch = convertDateToScaledEpoch(toDate, timeUnit);
    return `${timeField} >= ${startEpoch} AND ${timeField} < ${endEpoch}`;
  } else {
    const startSql = formatDateForSql(fromDate);
    const endSql = formatDateForSql(toDate);
    return `${timeField} >= ${startSql} AND ${timeField} < ${endSql}`;
  }
}

/**
 * Build individual time values for $__timeFrom and $__timeTo
 */
export function buildTimeValues(
  timeRange: Pick<TimeRange, "from" | "to">,
  fieldDetails?: ColumnSchema | null,
  timeZone = "UTC"
): { timeFrom: string; timeTo: string } {
  const { fromDate, toDate } = resolveTimeRangeToDates(timeRange, timeZone);
  const fieldType = fieldDetails
    ? detectTimeFieldType(fieldDetails)
    : "timestamp";

  if (fieldType === "epoch") {
    const timeUnit = fieldDetails?.timeUnit || TIME_UNITS.NANOSECOND;
    const startEpoch = convertDateToScaledEpoch(fromDate, timeUnit);
    const endEpoch = convertDateToScaledEpoch(toDate, timeUnit);
    return {
      timeFrom: startEpoch.toString(),
      timeTo: endEpoch.toString(),
    };
  } else {
    return {
      timeFrom: formatDateForSql(fromDate),
      timeTo: formatDateForSql(toDate),
    };
  }
}

/**
 * Replace all time variables in a query
 */
export function replaceTimeVariables(
  query: string,
  replacements: TimeVariableReplacements
): string {
  if (!query) return "";

  let processedQuery = query;

  // Replace in order of dependency to avoid conflicts
  if (replacements.timeField !== undefined) {
    processedQuery = processedQuery.replace(
      TIME_VARIABLE_PATTERNS.TIME_FIELD,
      replacements.timeField
    );
  }

  if (replacements.timeFilter !== undefined) {
    processedQuery = processedQuery.replace(
      TIME_VARIABLE_PATTERNS.TIME_FILTER,
      replacements.timeFilter
    );
  }

  if (replacements.timeFrom !== undefined) {
    processedQuery = processedQuery.replace(
      TIME_VARIABLE_PATTERNS.TIME_FROM,
      replacements.timeFrom
    );
  }

  if (replacements.timeTo !== undefined) {
    processedQuery = processedQuery.replace(
      TIME_VARIABLE_PATTERNS.TIME_TO,
      replacements.timeTo
    );
  }

  // Reset regex lastIndex for future uses
  Object.values(TIME_VARIABLE_PATTERNS).forEach((pattern) => {
    if (pattern instanceof RegExp) {
      pattern.lastIndex = 0;
    }
  });

  return processedQuery;
}
