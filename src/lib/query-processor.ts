/**
 * Unified Query Processor for GigAPI UI
 * Handles both dashboard and main query processing with full time interpolation support
 */

import { type TimeRange as DashboardTimeRange } from "@/types/dashboard.types";
import {
  type TimeRange as QueryTimeRange,
  type ColumnSchema,
  TIME_VARIABLE_PATTERNS,
} from "@/types/utils.types";
import { sub } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { QuerySanitizer } from "./query-sanitizer";

// Union type to handle both dashboard and main query time range formats
export type TimeRangeUnion = DashboardTimeRange | QueryTimeRange;

export type TimeUnit = "ns" | "us" | "μs" | "ms" | "s";

export interface QueryOptions {
  database: string;
  query: string;
  timeRange?: TimeRangeUnion;
  timeColumn?: string;
  timeField?: string;
  timeColumnDetails?: ColumnSchema | null;
  timeZone?: string;
  maxDataPoints?: number;
  table?: string;
}

export interface ProcessedQuery {
  query: string;
  database: string;
  hasTimeVariables: boolean;
  interpolatedVars: Record<string, any>;
  errors: string[];
}

/**
 * Unified Query Processor class - combines all query processing functionality
 */
export class QueryProcessor {
  /**
   * Main entry point for query processing
   */
  static process(options: QueryOptions): ProcessedQuery {
    const {
      database,
      query,
      timeRange,
      timeColumn,
      timeColumnDetails,
      timeZone = "UTC",
      maxDataPoints = 1000,
    } = options;

    if (!query || typeof query !== "string") {
      return {
        query: "",
        database,
        hasTimeVariables: false,
        interpolatedVars: {},
        errors: ["Invalid query provided"],
      };
    }

    // First, sanitize the query
    let processedQuery = QuerySanitizer.stripAtSymbols(query);
    processedQuery = QuerySanitizer.fixTimeFilter(processedQuery);

    const interpolatedVars: Record<string, any> = {};
    const errors: string[] = [];

    // Validate the sanitized query
    const sanitizerValidation = QuerySanitizer.validate(processedQuery);
    if (!sanitizerValidation.isValid) {
      errors.push(...sanitizerValidation.errors);
    }

    const hasTimeVariables = this.checkForTimeVariables(processedQuery);

    // Handle time field replacement
    let effectiveTimeColumn = timeColumn;

    // Auto-detect time field if not provided but query uses $__timeField
    if (processedQuery.includes("$__timeField") && !effectiveTimeColumn) {
      // Try to detect from query context
      const timeFieldMatch = processedQuery.match(
        /SELECT\s+([\w.]+)\s+AS\s+time/i
      );
      if (timeFieldMatch) {
        effectiveTimeColumn = timeFieldMatch[1].replace(
          /\$__timeField/g,
          "__timestamp"
        );
      } else {
        // Check for common time field patterns in the query
        const timeFieldPatterns = [
          "__timestamp",
          "timestamp",
          "time",
          "created_at",
          "updated_at",
          "event_time",
          "log_time",
        ];

        for (const pattern of timeFieldPatterns) {
          if (processedQuery.toLowerCase().includes(pattern.toLowerCase())) {
            effectiveTimeColumn = pattern;
            break;
          }
        }

        // Default fallback
        if (!effectiveTimeColumn) {
          effectiveTimeColumn = "__timestamp";
        }
      }
    }

    if (effectiveTimeColumn) {
      processedQuery = processedQuery.replace(
        /\$__timeField/g,
        effectiveTimeColumn
      );
      interpolatedVars.timeField = effectiveTimeColumn;

      // Fix GROUP BY and ORDER BY clauses when using time field aliases
      // Find all aliases for the time column (e.g., "SELECT timeColumn as time", "SELECT timeColumn as t")
      const timeAliasPattern = new RegExp(
        `${this.escapeRegex(effectiveTimeColumn)}\\s+as\\s+(\\w+)\\b`,
        "gi"
      );
      const aliasMatches = [...processedQuery.matchAll(timeAliasPattern)];

      aliasMatches.forEach((match) => {
        const alias = match[1];

        // Special case: If timeColumn equals the alias (e.g., "SELECT time as time")
        // This creates ambiguous references, so we need to handle it differently
        if (effectiveTimeColumn.toLowerCase() === alias.toLowerCase()) {
          // For ambiguous cases like "SELECT time as time", we should avoid the alias altogether
          // Replace "SELECT timeColumn as alias" with "SELECT timeColumn" when they're the same
          processedQuery = processedQuery.replace(
            new RegExp(
              `${this.escapeRegex(
                effectiveTimeColumn
              )}\\s+as\\s+${this.escapeRegex(alias)}\\b`,
              "gi"
            ),
            effectiveTimeColumn
          );

          // In this case, GROUP BY and ORDER BY should reference the original column directly
          // No changes needed since they already reference the correct column name
        } else {
          // Normal case: timeColumn != alias (e.g., "SELECT __timestamp as time")
          // Replace "GROUP BY alias" with "GROUP BY timeColumn"
          processedQuery = processedQuery.replace(
            new RegExp(`\\bGROUP\\s+BY\\s+${this.escapeRegex(alias)}\\b`, "gi"),
            `GROUP BY ${effectiveTimeColumn}`
          );
          // Replace "ORDER BY alias" with "ORDER BY timeColumn"
          processedQuery = processedQuery.replace(
            new RegExp(`\\bORDER\\s+BY\\s+${this.escapeRegex(alias)}\\b`, "gi"),
            `ORDER BY ${effectiveTimeColumn}`
          );
        }
      });
    }

    // Handle time filter interpolation
    if (processedQuery.includes("$__timeFilter") && timeRange) {
      const timeFilter = this.generateTimeFilter(
        timeRange,
        effectiveTimeColumn,
        timeColumnDetails,
        timeZone
      );
      if (timeFilter) {
        processedQuery = processedQuery.replace(/\$__timeFilter/gi, timeFilter);
        interpolatedVars.timeFilter = timeFilter;
      } else {
        // Remove or neutralize the filter if we can't generate it
        processedQuery = processedQuery
          .replace(/WHERE\s+\$__timeFilter/gi, "")
          .replace(/\$__timeFilter/gi, "1=1");
      }
    }

    // Handle interval interpolation
    if (processedQuery.includes("$__interval") && timeRange) {
      const interval = this.calculateInterval(timeRange, maxDataPoints);
      processedQuery = processedQuery.replace(/\$__interval/g, `${interval}s`);
      interpolatedVars.interval = interval;
    }

    // Handle from/to timestamps
    if (timeRange) {
      const bounds = this.getTimeBounds(timeRange);
      if (bounds) {
        const { from, to } = bounds;
        const timeUnit =
          timeColumnDetails?.timeUnit ||
          this.inferTimeUnitFromColumnName(
            effectiveTimeColumn || "",
            timeColumnDetails?.dataType
          );

        const fromValue = this.convertDateToEpoch(from, timeUnit);
        const toValue = this.convertDateToEpoch(to, timeUnit);

        processedQuery = processedQuery.replace(
          /\$__timeFrom/g,
          fromValue.toString()
        );
        processedQuery = processedQuery.replace(
          /\$__timeTo/g,
          toValue.toString()
        );
        interpolatedVars.from = fromValue;
        interpolatedVars.to = toValue;
      }
    }

    return {
      query: processedQuery,
      database,
      hasTimeVariables,
      interpolatedVars,
      errors,
    };
  }

  /**
   * Check if query contains time variables
   */
  static checkForTimeVariables(query: string): boolean {
    if (!query || typeof query !== "string") return false;
    return TIME_VARIABLE_PATTERNS.ALL_TIME_VARS.test(query);
  }

  /**
   * Generate time filter for the query
   */
  private static generateTimeFilter(
    timeRange: TimeRangeUnion,
    timeColumn?: string,
    timeColumnDetails?: ColumnSchema | null,
    timeZone: string = "UTC"
  ): string | null {
    const bounds = this.getTimeBounds(timeRange);
    if (!bounds) return null;

    const { from, to } = bounds;
    const columnName = timeColumn || "__timestamp";
    const timeUnit =
      timeColumnDetails?.timeUnit ||
      this.inferTimeUnitFromColumnName(columnName, timeColumnDetails?.dataType);

    // Check if we should use epoch format
    if (this.shouldUseEpochFormat(columnName, timeUnit)) {
      const fromValue = this.convertDateToEpoch(from, timeUnit);
      const toValue = this.convertDateToEpoch(to, timeUnit);
      return `${columnName} >= ${fromValue} AND ${columnName} <= ${toValue}`;
    } else {
      // Use string format for databases that expect string timestamps
      const fromFormatted = formatInTimeZone(
        from,
        timeZone,
        "yyyy-MM-dd HH:mm:ss"
      );
      const toFormatted = formatInTimeZone(to, timeZone, "yyyy-MM-dd HH:mm:ss");
      return `${columnName} >= '${fromFormatted}' AND ${columnName} <= '${toFormatted}'`;
    }
  }

  /**
   * Get time bounds from any time range format
   */
  private static getTimeBounds(
    timeRange?: TimeRangeUnion
  ): { from: Date; to: Date } | null {
    if (!timeRange) return null;

    const now = new Date();
    let from: Date, to: Date;

    // Handle DashboardTimeRange format
    if ("type" in timeRange) {
      if (timeRange.type === "relative") {
        to = now;
        from = this.parseRelativeTime(timeRange.from, now);
      } else {
        from =
          timeRange.from instanceof Date
            ? timeRange.from
            : new Date(timeRange.from);
        to =
          timeRange.to instanceof Date ? timeRange.to : new Date(timeRange.to);
      }
    }
    // Handle QueryTimeRange format
    else {
      const queryTimeRange = timeRange as QueryTimeRange;

      // Skip if not enabled
      if (!queryTimeRange.enabled) return null;

      // Handle "to" time
      if (queryTimeRange.to === "now") {
        to = now;
      } else {
        to = new Date(queryTimeRange.to);
      }

      // Handle "from" time
      if (queryTimeRange.from === "now") {
        from = now;
      } else if (queryTimeRange.from.startsWith("now-")) {
        from = this.parseRelativeTime(queryTimeRange.from.substring(4), now);
      } else {
        from = new Date(queryTimeRange.from);
      }
    }

    // Validate dates
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return null;
    }

    return { from, to };
  }

  /**
   * Parse relative time string like "5m", "1h", "24h", "now-1h"
   */
  private static parseRelativeTime(timeStr: string, baseTime: Date): Date {
    if (timeStr === "now") return baseTime;

    // Remove "now-" prefix if present
    if (timeStr.startsWith("now-")) {
      timeStr = timeStr.substring(4);
    }

    const match = timeStr.match(/^(\d+)([smhdwMy])$/);
    if (!match) {
      console.warn("Invalid relative time format:", timeStr);
      return sub(baseTime, { minutes: 5 }); // Default fallback
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case "s":
        return sub(baseTime, { seconds: value });
      case "m":
        return sub(baseTime, { minutes: value });
      case "h":
        return sub(baseTime, { hours: value });
      case "d":
        return sub(baseTime, { days: value });
      case "w":
        return sub(baseTime, { weeks: value });
      case "M":
        return sub(baseTime, { months: value });
      case "y":
        return sub(baseTime, { years: value });
      default:
        console.warn("Unknown time unit:", unit);
        return sub(baseTime, { minutes: 5 });
    }
  }

  /**
   * Calculate optimal interval for data aggregation
   */
  private static calculateInterval(
    timeRange: TimeRangeUnion,
    maxDataPoints: number = 1000
  ): number {
    const bounds = this.getTimeBounds(timeRange);
    if (!bounds) return 60; // Default to 1 minute

    const { from, to } = bounds;
    const durationMs = to.getTime() - from.getTime();
    const intervalMs = Math.max(1000, Math.floor(durationMs / maxDataPoints));

    return Math.floor(intervalMs / 1000);
  }

  /**
   * Convert Date to epoch based on time unit
   */
  private static convertDateToEpoch(date: Date, timeUnit: string): number {
    const epochMs = date.getTime();

    if (isNaN(epochMs)) {
      console.warn("Invalid epoch time generated");
      return Date.now();
    }

    switch (timeUnit) {
      case "ns":
        return Math.floor(epochMs * 1000000);
      case "us":
      case "μs":
        return Math.floor(epochMs * 1000);
      case "ms":
        return Math.floor(epochMs);
      case "s":
        return Math.floor(epochMs / 1000);
      default:
        console.warn(
          "Unknown time unit for conversion:",
          timeUnit,
          "defaulting to milliseconds"
        );
        return Math.floor(epochMs);
    }
  }

  /**
   * Infer time unit from sample timestamp values
   */
  static inferTimeUnitFromSampleValues(values: number[]): TimeUnit {
    if (!values || values.length === 0) return "ms";

    // Filter out invalid values
    const validValues = values.filter(
      (v) => typeof v === "number" && !isNaN(v) && v > 0
    );
    if (validValues.length === 0) return "ms";

    // Get the average magnitude of the timestamps
    const avgValue =
      validValues.reduce((sum, v) => sum + v, 0) / validValues.length;

    // Determine time unit based on the magnitude
    // These ranges are based on typical timestamp values
    if (avgValue > 1e18) {
      // Values > 1e18 are likely nanoseconds (e.g., 1640995200000000000)
      return "ns";
    } else if (avgValue > 1e15) {
      // Values > 1e15 are likely microseconds (e.g., 1640995200000000)
      return "us";
    } else if (avgValue > 1e12) {
      // Values > 1e12 are likely milliseconds (e.g., 1640995200000)
      return "ms";
    } else if (avgValue > 1e9) {
      // Values > 1e9 are likely seconds (e.g., 1640995200)
      return "s";
    } else {
      // Smaller values might be relative time or other units
      return "ms"; // Default fallback
    }
  }

  /**
   * Infer time unit from column name and data type
   */
  private static inferTimeUnitFromColumnName(
    columnName: string,
    dataType?: string
  ): TimeUnit {
    const lowerName = columnName.toLowerCase();
    const lowerType = dataType?.toLowerCase() || "";

    // 1. Check for explicit time unit suffixes in column name (highest priority)
    if (lowerName.includes("_ns")) {
      return "ns";
    } else if (lowerName.includes("_us") || lowerName.includes("_μs")) {
      return "us";
    } else if (lowerName.includes("_ms")) {
      return "ms";
    } else if (lowerName.includes("_s") && !lowerName.includes("_ms")) {
      return "s";
    }

    // 2. Special case for __timestamp (commonly nanoseconds in time-series databases)
    if (lowerName === "__timestamp") {
      return "ns";
    }

    // 3. Analyze data type for precision hints
    if (lowerType.includes("timestamp") || lowerType.includes("datetime")) {
      // Database native timestamp types are typically milliseconds or seconds
      return "ms";
    }

    // 4. For BIGINT columns that look like time fields, analyze by field name
    if (
      lowerType === "bigint" ||
      lowerType === "int64" ||
      lowerType === "long"
    ) {
      // BIGINT time fields are commonly high precision
      if (lowerName.includes("time") || lowerName.includes("timestamp")) {
        // For generic time/timestamp fields in BIGINT, prefer nanoseconds
        // This is common in time-series databases like ClickHouse, InfluxDB, etc.
        return "ns";
      }

      if (
        lowerName.includes("date") ||
        lowerName === "created_at" ||
        lowerName === "updated_at"
      ) {
        // Created/updated timestamps are often milliseconds
        return "ms";
      }
    }

    // 5. For other integer types (INT, INTEGER), likely seconds or milliseconds
    if (lowerType.includes("int") && !lowerType.includes("bigint")) {
      return "s"; // Regular integers for time are typically Unix seconds
    }

    // 6. Default based on common patterns
    if (lowerName.includes("time") || lowerName.includes("timestamp")) {
      // Default to milliseconds for time fields without clear indicators
      return "ms";
    }

    // 7. Fallback to milliseconds
    return "ms";
  }

  /**
   * Check if we should use epoch format based on column name and time unit
   */
  private static shouldUseEpochFormat(
    columnName: string,
    timeUnit?: string
  ): boolean {
    const lowerName = columnName.toLowerCase();

    // Always use epoch for known timestamp columns
    if (lowerName === "__timestamp" || lowerName === "timestamp") {
      return true;
    }

    // Use epoch if we have a specific time unit
    if (timeUnit && ["ns", "us", "μs", "ms", "s"].includes(timeUnit)) {
      return true;
    }

    // Use epoch for columns that look like epoch timestamps
    if (
      lowerName.includes("epoch") ||
      lowerName.includes("_ts") ||
      lowerName.includes("_ns") ||
      lowerName.includes("_ms") ||
      lowerName.includes("_us")
    ) {
      return true;
    }

    // Otherwise, use string format
    return false;
  }

  /**
   * Detect time fields from column schema
   */
  static detectTimeFieldsFromSchema(columns: ColumnSchema[]): string[] {
    return columns
      .filter((col) => {
        if (!col.columnName) return false;

        const colName = col.columnName.toLowerCase();
        const dataType = col.dataType?.toLowerCase() || "";

        // Check for explicit time units
        if (col.timeUnit) return true;

        // Check for common time field patterns
        return (
          colName.includes("time") ||
          colName.includes("date") ||
          colName.includes("timestamp") ||
          colName === "__timestamp" ||
          colName === "created_at" ||
          colName === "updated_at" ||
          colName.endsWith("_at") ||
          colName.endsWith("_time") ||
          colName.endsWith("_date") ||
          colName.endsWith("_ts") ||
          colName.endsWith("_ns") ||
          colName.endsWith("_us") ||
          colName.endsWith("_ms") ||
          colName.endsWith("_s") ||
          dataType.includes("timestamp") ||
          dataType.includes("datetime") ||
          dataType.includes("date")
        );
      })
      .map((col) => col.columnName);
  }

  /**
   * Escape special regex characters in a string
   */
  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

// Export standalone functions for backward compatibility
export function checkForTimeVariables(query: string): boolean {
  return QueryProcessor.checkForTimeVariables(query);
}

export function detectTimeFieldsFromSchema(columns: ColumnSchema[]): string[] {
  return QueryProcessor.detectTimeFieldsFromSchema(columns);
}
