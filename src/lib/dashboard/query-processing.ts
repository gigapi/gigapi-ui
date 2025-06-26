import { type TimeRange as DashboardTimeRange } from "@/types/dashboard.types";
import { type TimeRange as QueryTimeRange, type ColumnSchema } from "@/types/utils.types";
import { sub } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { inferTimeUnitFromColumnName, shouldUseEpochFormat, validateTimeRange } from "./utils";

// Union type to handle both dashboard and main query time range formats
type TimeRangeUnion = DashboardTimeRange | QueryTimeRange;

/**
 * Convert Date object to epoch based on time unit
 */
function convertDateToEpoch(date: Date, timeUnit: string): number {
  const epochMs = date.getTime();
  
  // Validate epoch milliseconds
  if (isNaN(epochMs)) {
    console.warn('Invalid epoch time generated');
    return Date.now(); // Fallback to current timestamp
  }
  
  switch (timeUnit) {
    case 'ns':
      return Math.floor(epochMs * 1000000);
    case 'us':
    case 'μs':
      return Math.floor(epochMs * 1000);
    case 'ms':
      return Math.floor(epochMs);
    case 's':
      return Math.floor(epochMs / 1000);
    default:
      console.warn('Unknown time unit for conversion:', timeUnit, 'defaulting to milliseconds');
      return Math.floor(epochMs);
  }
}


/**
 * Process dashboard query with time variables - enhanced to work like main query processing
 */
export function processDashboardQueryWithTime(
  query: string,
  timeRange?: TimeRangeUnion,
  timeZone = "UTC",
  timeColumn?: string,
  timeColumnDetails?: ColumnSchema | null
): string {
  console.log("processDashboardQueryWithTime called with:", { query, timeRange, timeZone, timeColumn, timeColumnDetails });
  
  // Input validation
  if (!query || typeof query !== 'string') {
    console.warn("Invalid query provided");
    return '';
  }
  
  if (!query.includes("$__timeFilter")) {
    console.log("Query does not contain $__timeFilter, returning as-is");
    return query;
  }

  if (!timeRange || (timeRange as QueryTimeRange).enabled === false) {
    console.log("No time range provided or disabled, removing time filter");
    // If no time range is provided, remove the filter to avoid query errors
    return query
      .replace(/WHERE\s+\$__timeFilter/gi, "")
      .replace(/\$__timeFilter/gi, "1=1");
  }

  // Validate time range format
  if (!validateTimeRange(timeRange)) {
    console.warn("Invalid time range format, removing time filter");
    return query
      .replace(/WHERE\s+\$__timeFilter/gi, "")
      .replace(/\$__timeFilter/gi, "1=1");
  }

  // Default to a recent time range if none is provided
  const now = new Date();
  let from: Date, to: Date;

  // Handle both dashboard TimeRange format and main query TimeRange format
  if ('type' in timeRange && timeRange.type === "relative") {
    // Dashboard format: RelativeTimeRange
    const fromString = timeRange.from;
    const unit = fromString.slice(-1);
    const value = parseInt(fromString.slice(0, -1), 10);
    to = now;

    console.log(`Parsing relative time: ${fromString}, unit: ${unit}, value: ${value}`);

    switch (unit) {
      case "s":
        from = sub(now, { seconds: value });
        break;
      case "m":
        from = sub(now, { minutes: value });
        break;
      case "h":
        from = sub(now, { hours: value });
        break;
      case "d":
        from = sub(now, { days: value });
        break;
      case "w":
        from = sub(now, { weeks: value });
        break;
      default:
        console.warn(`Unknown time unit: ${unit}, defaulting to 5 minutes`);
        from = sub(now, { minutes: 5 }); // Default case
    }
  } else if ('type' in timeRange && timeRange.type === "absolute") {
    // Dashboard format: AbsoluteTimeRange
    from = new Date(timeRange.from);
    to = new Date(timeRange.to);
  } else {
    // Main query format: QueryTimeRange (from/to strings like "now-1h", "now")
    const queryTimeRange = timeRange as QueryTimeRange;
    
    // Handle "to" time (usually "now")
    if (queryTimeRange.to === "now") {
      to = now;
    } else {
      to = new Date(queryTimeRange.to);
    }
    
    // Handle "from" time (e.g. "now-1h", "now-24h")
    if (queryTimeRange.from === "now") {
      from = now;
    } else if (queryTimeRange.from.startsWith("now-")) {
      const relativeString = queryTimeRange.from.substring(4); // Remove "now-"
      const unit = relativeString.slice(-1);
      const value = parseInt(relativeString.slice(0, -1), 10);
      
      switch (unit) {
        case "m":
          from = sub(now, { minutes: value });
          break;
        case "h":
          from = sub(now, { hours: value });
          break;
        case "d":
          from = sub(now, { days: value });
          break;
        case "w":
          from = sub(now, { weeks: value });
          break;
        default:
          from = sub(now, { minutes: 5 }); // Default case
      }
    } else {
      from = new Date(queryTimeRange.from);
    }
  }

  // Use the provided time column or default to "timestamp"
  const columnName = timeColumn || "timestamp";
  
  // Get time unit from column details or try to infer from column name
  const timeUnit = timeColumnDetails?.timeUnit || inferTimeUnitFromColumnName(columnName);
  
  let timeFilter: string;
  
  // Try epoch-based filtering first (common for time-series databases)
  if (shouldUseEpochFormat(columnName, timeUnit)) {
    const fromValue = convertDateToEpoch(from, timeUnit);
    const toValue = convertDateToEpoch(to, timeUnit);
    console.log(`Converting to epoch with timeUnit ${timeUnit}:`, {
      columnName,
      fromDate: from.toISOString(),
      toDate: to.toISOString(),
      fromValue,
      toValue
    });
    timeFilter = `${columnName} >= ${fromValue} AND ${columnName} <= ${toValue}`;
  } else {
    // Fallback to string format for databases that expect string timestamps
    const fromFormatted = formatInTimeZone(from, timeZone, "yyyy-MM-dd HH:mm:ss");
    const toFormatted = formatInTimeZone(to, timeZone, "yyyy-MM-dd HH:mm:ss");
    console.log(`Using string format for timeColumn ${columnName}:`, {
      fromFormatted,
      toFormatted
    });
    timeFilter = `${columnName} >= '${fromFormatted}' AND ${columnName} <= '${toFormatted}'`;
  }

  console.log("Generated time filter:", timeFilter);

  // Replace the time filter placeholder with the actual filter
  const result = query.replace(/\$__timeFilter/gi, timeFilter);
  
  console.log("Final processed query:", result);
  
  return result;
}
