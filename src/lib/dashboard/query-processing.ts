import { type TimeRange as DashboardTimeRange } from "@/types/dashboard.types";
import { type TimeRange as QueryTimeRange } from "@/types/utils.types";
import { sub } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

// Union type to handle both dashboard and main query time range formats
type TimeRangeUnion = DashboardTimeRange | QueryTimeRange;

// A basic function to replace time variables in a query for dashboards
export function processDashboardQueryWithTime(
  query: string,
  timeRange?: TimeRangeUnion,
  timeZone = "UTC",
  timeColumn?: string
): string {
  console.log("processDashboardQueryWithTime called with:", { query, timeRange, timeZone, timeColumn });
  
  if (!query.includes("$__timeFilter")) {
    console.log("Query does not contain $__timeFilter, returning as-is");
    return query;
  }

  if (!timeRange || (timeRange as QueryTimeRange).enabled === false) {
    console.log("No time range provided or disabled, removing time filter");
    // If no time range is provided, remove the filter to avoid query errors
    // Handle both "WHERE $__timeFilter" and standalone "$__timeFilter"
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
      default:
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

  // Format dates in the specified timezone
  const fromFormatted = formatInTimeZone(from, timeZone, "yyyy-MM-dd HH:mm:ss");
  const toFormatted = formatInTimeZone(to, timeZone, "yyyy-MM-dd HH:mm:ss");

  // Use the provided time column or default to "timestamp"
  const columnName = timeColumn || "timestamp";
  
  const timeFilter = `${columnName} >= '${fromFormatted}' AND ${columnName} <= '${toFormatted}'`;

  console.log("Generated time filter:", timeFilter);

  // Replace the time filter placeholder with the actual filter
  // Handle both "WHERE $__timeFilter" and standalone "$__timeFilter"
  const result = query.replace(/\$__timeFilter/gi, timeFilter);
  
  console.log("Final processed query:", result);
  
  return result;
}
