import type { 
  TimeRange, 
  ColumnSchema, 
  TimeVariableReplacements 
} from "@/types/utils.types";
import { TIME_VARIABLE_PATTERNS } from "@/types/utils.types";
import { 
  buildTimeFilter, 
  buildTimeValues, 
  replaceTimeVariables 
} from "@/lib/time/time-range";

/**
 * Detect time fields from column schema
 */
export function detectTimeFieldsFromSchema(columns: ColumnSchema[]): string[] {
  if (!Array.isArray(columns)) {
    console.warn(
      "Invalid columns array provided to detectTimeFieldsFromSchema"
    );
    return [];
  }

  const timeFields: string[] = [];

  columns.forEach((column) => {
    if (!column || typeof column.columnName !== "string") {
      return;
    }

    const colName = column.columnName.toLowerCase();
    const dataType = (column.dataType || "").toLowerCase();

    const isTimeColumn =
      colName === "__timestamp" ||
      colName === "time" ||
      colName === "timestamp" ||
      colName === "date" ||
      colName === "time_sec" ||
      colName === "time_usec" ||
      colName === "created_at" ||
      colName === "updated_at" ||
      colName === "create_date" ||
      colName.includes("date") ||
      colName.includes("time") ||
      dataType.includes("timestamp") ||
      dataType.includes("datetime") ||
      dataType.includes("date") ||
      dataType.includes("time") ||
      (dataType.includes("bigint") &&
        (colName.includes("time") || colName.includes("date")));

    if (isTimeColumn) {
      timeFields.push(column.columnName);
    }
  });

  return timeFields;
}

/**
 * Process query with time variables - main function
 */
export function processQueryWithTimeVariables(
  query: string,
  selectedTimeField: string | undefined,
  timeRange: TimeRange,
  selectedTimeFieldDetails?: ColumnSchema | null,
  timeZone = "UTC"
): { processedQuery: string; hasTimeVariables: boolean; error?: string } {
  try {
    const hasTimeVars = checkForTimeVariables(query);

    if (!hasTimeVars) {
      return {
        processedQuery: query,
        hasTimeVariables: false,
      };
    }

    if (!selectedTimeField) {
      return {
        processedQuery: query,
        hasTimeVariables: true,
        error: "Time variables found but no time field selected",
      };
    }

    const timeFilter = buildTimeFilter(
      selectedTimeField,
      timeRange,
      selectedTimeFieldDetails,
      timeZone
    );

    const { timeFrom, timeTo } = buildTimeValues(
      timeRange,
      selectedTimeFieldDetails,
      timeZone
    );

    const replacements: TimeVariableReplacements = {
      timeField: selectedTimeField,
      timeFilter,
      timeFrom,
      timeTo,
    };

    const processedQuery = replaceTimeVariables(query, replacements);

    return {
      processedQuery,
      hasTimeVariables: true,
    };
  } catch (error) {
    return {
      processedQuery: query,
      hasTimeVariables: true,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if query contains time variables
 */
export function checkForTimeVariables(query: string): boolean {
  if (!query || typeof query !== "string") return false;
  const result = TIME_VARIABLE_PATTERNS.ALL_TIME_VARS.test(query);
  // Reset regex for next use
  TIME_VARIABLE_PATTERNS.ALL_TIME_VARS.lastIndex = 0;
  return result;
}

/**
 * Generate a unique query ID for tracking
 */
export function generateQueryId(): string {
  return `query_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 9)}`;
}
