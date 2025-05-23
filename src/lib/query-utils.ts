import type { TimeRange, ColumnSchema } from "@/types";
import { isAbsoluteDate, formatDateForSql } from "@/lib/time-range-utils";
import { resolveTimeRangeToDates, convertDateToScaledEpoch } from "@/lib/utils";

export interface QueryVariableContext {
  selectedTimeField: string | null;
  timeRange: TimeRange;
  selectedTimeZone: string;
  getColumnsForTable: (tableName: string) => ColumnSchema[] | null;
  selectedTable: string | null;
}

/**
 * Check if a query contains time variables
 */
export function checkForTimeVariables(queryText: string): boolean {
  return /\$__time(Filter|Field|From|To)/i.test(queryText);
}

/**
 * Replace query variables with actual values
 */
export function replaceQueryVariables(
  rawQuery: string,
  context: QueryVariableContext
): string {
  const {
    selectedTimeField,
    timeRange,
    selectedTimeZone,
    getColumnsForTable,
    selectedTable,
  } = context;

  // Exit early if we don't have a query or time field
  if (!rawQuery || !selectedTimeField) {
    return rawQuery;
  }

  // Calculate actual time range values
  const { fromDate: startTime, toDate: endTime } = resolveTimeRangeToDates(
    { from: timeRange.from, to: timeRange.to },
    selectedTimeZone,
    isAbsoluteDate
  );

  let processedQuery = rawQuery;

  // Replace timeField variable with the actual field name
  if (processedQuery.includes("$__timeField")) {
    processedQuery = processedQuery.replace(
      /\$__timeField/g,
      selectedTimeField
    );
  }

  // Replace timeFilter variable with the actual WHERE condition
  if (processedQuery.includes("$__timeFilter")) {
    const timeCondition = buildTimeCondition(
      selectedTimeField,
      startTime,
      endTime,
      timeRange,
      getColumnsForTable(selectedTable || "")
    );

    processedQuery = processedQuery.replace(/\$__timeFilter/g, timeCondition);
  }

  // Replace timeFrom and timeTo variables with actual values
  if (processedQuery.includes("$__timeFrom")) {
    const fromStr = isAbsoluteDate(timeRange.from)
      ? `'${formatDateForSql(startTime)}'`
      : `'${formatDateForSql(startTime)}'`;
    processedQuery = processedQuery.replace(/\$__timeFrom/g, fromStr);
  }

  if (processedQuery.includes("$__timeTo")) {
    const toStr = isAbsoluteDate(timeRange.to)
      ? `'${formatDateForSql(endTime)}'`
      : `'${formatDateForSql(endTime)}'`;
    processedQuery = processedQuery.replace(/\$__timeTo/g, toStr);
  }

  return processedQuery;
}

/**
 * Build the time condition for the WHERE clause
 */
function buildTimeCondition(
  selectedTimeField: string,
  startTime: Date,
  endTime: Date,
  timeRange: TimeRange,
  columns: ColumnSchema[] | null
): string {
  // Get field details to determine type and format
  const fieldDetails = columns?.find(
    (col) => col.columnName === selectedTimeField
  );

  let timeType = "timestamp"; // Default to timestamp
  if (fieldDetails) {
    const dataType = fieldDetails.dataType.toLowerCase();
    if (dataType.includes("int") || dataType.includes("long")) {
      timeType = "epoch";
      // Use timeUnit if available
      if (fieldDetails.timeUnit) {
        timeType = `epoch_${fieldDetails.timeUnit}`;
      }
    }
  }

  // Format dates based on timeType
  if (timeType === "timestamp") {
    // Use SQL format for timestamps
    return `${selectedTimeField} BETWEEN ${
      isAbsoluteDate(timeRange.from)
        ? `'${formatDateForSql(startTime)}'`
        : `'${formatDateForSql(startTime)}'`
    } AND ${
      isAbsoluteDate(timeRange.to)
        ? `'${formatDateForSql(endTime)}'`
        : `'${formatDateForSql(endTime)}'`
    }`;
  } else if (timeType.startsWith("epoch")) {
    // For epoch time, convert to seconds, milliseconds, etc.
    const startEpoch = convertDateToScaledEpoch(
      startTime,
      fieldDetails?.timeUnit
    );
    const endEpoch = convertDateToScaledEpoch(endTime, fieldDetails?.timeUnit);
    return `${selectedTimeField} BETWEEN ${startEpoch} AND ${endEpoch}`;
  }

  return "";
}

/**
 * Generate unique ID for query history entries
 */
export function generateQueryId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
}

/**
 * Save data to localStorage with error handling
 */
export function saveToLocalStorage(key: string, data: any): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Failed to save to localStorage (${key}):`, e);
  }
}

/**
 * Load data from localStorage with error handling
 */
export function loadFromLocalStorage<T>(key: string, defaultValue: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error(`Failed to load from localStorage (${key}):`, e);
  }
  return defaultValue;
}
