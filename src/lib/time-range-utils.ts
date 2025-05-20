import type { TimeRange } from "../components/TimeRangeSelector";

// Field type constants
export const TIME_FIELD_TYPES = [
  "timestamp", "datetime", "date", "time", "bigint"
];

/**
 * Detect if a value is a timestamp of any format
 */
export function isTimestamp(value: string | number): boolean {
  if (value === null || value === undefined) return false;

  // For string values, try to parse as number
  const numValue = typeof value === 'string' ? Number(value) : value;

  // Not a number
  if (isNaN(numValue)) return false;

  // Check common timestamp ranges
  if (numValue > 1e18) return true; // Nanoseconds (19+ digits)
  if (numValue > 1e15) return true; // Microseconds (16+ digits)
  if (numValue > 1e12) return true; // Milliseconds (13+ digits)

  // Seconds-based timestamps (must be within reasonable date range)
  if (numValue >= 1000000000 && numValue <= 9999999999) return true; // Seconds from ~2001 to ~2286

  return false;
}

/**
 * Determines the scale of a timestamp (seconds, milliseconds, etc.)
 */
export function getTimestampScale(value: number): 's' | 'ms' | 'us' | 'ns' {
  if (value > 1e18) return 'ns'; // Nanoseconds
  if (value > 1e15) return 'us'; // Microseconds
  if (value > 1e12) return 'ms'; // Milliseconds
  return 's'; // Seconds
}

/**
 * Normalize a timestamp to milliseconds, regardless of its original scale
 */
export function normalizeTimestampToMs(value: number): number {
  const scale = getTimestampScale(value);

  switch (scale) {
    case 'ns': return Math.floor(value / 1000000);
    case 'us': return Math.floor(value / 1000);
    case 's': return value * 1000;
    case 'ms': return value;
  }
}

// Identify all time fields in the schema
export function identifyTimeFields(schema: any): string[] {
  if (!schema) return [];

  const timeFields: string[] = [];

  // Look through all tables and columns
  Object.values(schema).forEach((tables: any) => {
    if (!Array.isArray(tables)) return;

    tables.forEach((table: any) => {
      if (!table.columns) return;

      table.columns.forEach((column: any) => {
        // Check column name for time-related keywords
        const colName = column.columnName?.toLowerCase() || '';
        const dataType = column.dataType?.toLowerCase() || '';

        // Check if it's a known timestamp field
        if (colName === '__timestamp' ||
          colName === 'time' ||
          colName === 'timestamp' ||
          colName === 'date' ||
          colName === 'time_sec' ||
          colName === 'time_usec' ||
          colName === 'created_at' ||
          colName === 'updated_at' ||
          colName === 'create_date' ||
          colName.includes('date') ||
          colName.includes('time')) {
          timeFields.push(column.columnName);
        }
        // Check data type for time-related types
        else if (
          dataType.includes('timestamp') ||
          dataType.includes('datetime') ||
          dataType.includes('date') ||
          dataType.includes('time') ||
          // BigInt fields might be timestamps in some databases
          (dataType.includes('bigint') &&
            (colName.includes('time') || colName.includes('date')))
        ) {
          timeFields.push(column.columnName);
        }
      });
    });
  });

  return [...new Set(timeFields)]; // Remove duplicates
}

// Identify time fields for a specific table
export function identifyTimeFieldsForTable(schema: any, dbName: string, tableName: string): string[] {
  if (!schema || !dbName || !tableName || !schema[dbName]) return [];

  const timeFields: string[] = [];

  // Find the specified table
  const tableSchema = schema[dbName].find((table: any) => table.tableName === tableName);

  if (!tableSchema || !tableSchema.columns) {
    return [];
  }

  // Scan columns for time fields
  tableSchema.columns.forEach((column: any) => {
    const colName = column.columnName?.toLowerCase() || '';
    const dataType = column.dataType?.toLowerCase() || '';

    // Check if it's a time-related field based on name
    if (colName === '__timestamp' ||
      colName === 'time' ||
      colName === 'timestamp' ||
      colName === 'date' ||
      colName === 'time_sec' ||
      colName === 'time_usec' ||
      colName === 'created_at' ||
      colName === 'updated_at' ||
      colName === 'create_date' ||
      colName.includes('date') ||
      colName.includes('time')) {
      timeFields.push(column.columnName);
    }
    // Check data type for time-related types
    else if (
      dataType.includes('timestamp') ||
      dataType.includes('datetime') ||
      dataType.includes('date') ||
      dataType.includes('time') ||
      // BigInt fields might be timestamps in some databases
      (dataType.includes('bigint') &&
        (colName.includes('time') || colName.includes('date')))
    ) {
      timeFields.push(column.columnName);
    }
  });

  return timeFields;
}

// Determine the type of timestamp based on field name and database type
export function determineTimestampType(
  fieldName: string,
  dataType: string = ""
): "milliseconds" | "seconds" | "datetime" {
  // Normalize inputs for case-insensitive checks
  const field = fieldName.toLowerCase();
  const type = dataType.toLowerCase();

  // 1. Check if it's a known timestamp field by name
  if (field === "__timestamp" || field === "create_date") {
    return "milliseconds"; // These are known to be epoch milliseconds
  }

  // 2. Check if it's a datetime field by data type
  if (
    type.includes("timestamp") ||
    type.includes("datetime") ||
    type.includes("date")
  ) {
    return "datetime";
  }

  // 3. Check if it's a millisecond or second timestamp based on naming pattern
  if (field.endsWith("_ms") || field.includes("millis")) {
    return "milliseconds";
  }

  if (field.endsWith("_sec") || field.endsWith("_s") || field.includes("seconds")) {
    return "seconds";
  }

  // 4. For DuckDB, most bigint timestamp fields are milliseconds
  if (type.includes("bigint") &&
    (field.includes("time") || field.includes("date"))) {
    return "milliseconds";
  }

  // 5. Default to milliseconds if it has 'time' in the name as best guess
  if (field.includes("time") || field.includes("timestamp")) {
    return "milliseconds";
  }

  // 6. Default fallback
  return "datetime";
}

// Generate SQL time filters based on the selected time range
export function generateTimeFilter(
  timeRange: TimeRange,
  timeField: string,
  fieldDataType: string = ""
): string {
  // Check if time filtering is enabled
  if (!timeRange || !timeField || timeRange.enabled === false || !timeRange.from || !timeRange.to) {
    return '';
  }

  // Determine timestamp type
  const timestampType = determineTimestampType(timeField, fieldDataType);

  const { from, to } = timeRange;
  let fromSql = '';
  let toSql = '';

  // Check if we're dealing with absolute dates
  const isFromAbsolute = isAbsoluteDate(from);
  const isToAbsolute = isAbsoluteDate(to);

  if (isFromAbsolute) {
    // Handle absolute from date
    fromSql = formatDateForSql(from);
  } else {
    // Handle relative from time (now-based)
    // DuckDB syntax
    const fromAmount = getTimeRangeAmount(from);
    const fromUnit = getTimeRangeUnitForDatabase(from);

    if (from === 'now') {
      fromSql = 'NOW()';
    } else if (from.startsWith('now-')) {
      fromSql = `NOW() - INTERVAL ${fromAmount} ${fromUnit}`;
    } else if (from.startsWith('now/')) {
      // DuckDB date_trunc has different format
      const unit = from.substring(4).toUpperCase();
      fromSql = `DATE_TRUNC('${unit}', NOW())`;
    } else {
      // Fallback
      fromSql = `NOW() - INTERVAL 24 HOUR`;
    }
  }

  if (isToAbsolute) {
    // Handle absolute to date
    toSql = formatDateForSql(to);
  } else {
    // Handle relative to time (now-based)
    // To time is usually simpler
    if (to === 'now') {
      toSql = 'NOW()';
    } else {
      // Similar handling for other to time formats
      const toAmount = getTimeRangeAmount(to);
      const toUnit = getTimeRangeUnitForDatabase(to);

      if (to.startsWith('now-')) {
        toSql = `NOW() - INTERVAL ${toAmount} ${toUnit}`;
      } else if (to.startsWith('now/')) {
        const unit = to.substring(4).toUpperCase();
        toSql = `DATE_TRUNC('${unit}', NOW())`;
      } else {
        try {
          const date = new Date(to);
          if (!isNaN(date.getTime())) {
            toSql = `'${date.toISOString()}'`;
          } else {
            toSql = 'NOW()';
          }
        } catch (e) {
          toSql = 'NOW()';
        }
      }
    }
  }

  // Format SQL based on timestamp type for DuckDB
  if (timestampType === "milliseconds") {
    // For millisecond timestamps, use epoch_ms for now-based expressions
    // For absolute dates, convert them to milliseconds
    let fromEpoch = isFromAbsolute ? `epoch_ms(${fromSql})` : `epoch_ms(${fromSql})`;
    let toEpoch = isToAbsolute ? `epoch_ms(${toSql})` : `epoch_ms(${toSql})`;
    
    return `${timeField} >= ${fromEpoch} AND ${timeField} <= ${toEpoch}`;
  } else if (timestampType === "seconds") {
    // For second timestamps, use epoch for now-based expressions
    // For absolute dates, convert them to seconds
    let fromEpoch = isFromAbsolute ? `epoch(${fromSql})` : `epoch(${fromSql})`;
    let toEpoch = isToAbsolute ? `epoch(${toSql})` : `epoch(${toSql})`;
    
    return `${timeField} >= ${fromEpoch} AND ${timeField} <= ${toEpoch}`;
  } else {
    // Datetime fields - use the timestamp directly for comparison
    return `${timeField} >= ${fromSql} AND ${timeField} <= ${toSql}`;
  }
}

// Extract the amount from a time range string (e.g., "now-24h" -> "24")
export function getTimeRangeAmount(timeRangeStr: string): string {
  if (timeRangeStr.startsWith("now-")) {
    const match = timeRangeStr.match(/^now-(\d+)([mhdwMy])(?:\/([mhdwMy]))?$/);
    if (match) {
      return match[1];
    }
  }
  return "24"; // Default to 24 if parsing fails
}

// Convert time unit to database-specific format
export function getTimeRangeUnitForDatabase(timeRangeStr: string): string {
  if (timeRangeStr.startsWith("now-")) {
    const match = timeRangeStr.match(/^now-(\d+)([mhdwMy])(?:\/([mhdwMy]))?$/);
    if (match) {
      const unit = match[2];

      // DuckDB requires uppercase units
      switch (unit) {
        case "m": return "MINUTE";
        case "h": return "HOUR";
        case "d": return "DAY";
        case "w": return "WEEK";
        case "M": return "MONTH";
        case "y": return "YEAR";
        default: return "HOUR";
      }
    }
  }

  return "HOUR"; // Default
}

// No longer needed since we only support DuckDB
export function adaptTimeFilterForDbType(filter: string): string {
  return filter; // No adaptation needed, already in DuckDB format
}

// Modify a SQL query to add a time filter if needed
export function addTimeFilterToQuery(query: string, timeFilter: string, timeRange?: TimeRange, selectedTimeField?: string | null): string {
  // Skip if no query or no time filter or time filtering is disabled
  if (!query || !timeFilter || (timeRange && timeRange.enabled === false) || !selectedTimeField) {
    return query;
  }

  // Check if a time filter already exists
  if (hasTimeFilter(query)) {
    return query;
  }

  const trimmedQuery = query.trim();

  // Extract components of the query
  const whereIndex = trimmedQuery.toUpperCase().indexOf(' WHERE ');
  const groupByIndex = trimmedQuery.toUpperCase().indexOf(' GROUP BY ');
  const orderByIndex = trimmedQuery.toUpperCase().indexOf(' ORDER BY ');
  const limitIndex = trimmedQuery.toUpperCase().indexOf(' LIMIT ');

  // Store all clauses that should come after the WHERE
  const clauses = [];
  let queryBase = "";

  if (whereIndex !== -1) {
    // Add time filter to existing WHERE clause
    queryBase = trimmedQuery.substring(0, whereIndex + 7); // +7 for " WHERE "
    let whereClause = "";

    if (groupByIndex !== -1 && groupByIndex > whereIndex) {
      whereClause = trimmedQuery.substring(whereIndex + 7, groupByIndex);
      clauses.push(trimmedQuery.substring(groupByIndex));
    } else if (orderByIndex !== -1 && orderByIndex > whereIndex) {
      whereClause = trimmedQuery.substring(whereIndex + 7, orderByIndex);
      clauses.push(trimmedQuery.substring(orderByIndex));
    } else if (limitIndex !== -1 && limitIndex > whereIndex) {
      whereClause = trimmedQuery.substring(whereIndex + 7, limitIndex);
      clauses.push(trimmedQuery.substring(limitIndex));
    } else {
      whereClause = trimmedQuery.substring(whereIndex + 7);
    }

    return `${queryBase}${timeFilter} AND (${whereClause.trim()})${clauses.join('')}`;
  } else {
    // Need to add a new WHERE clause
    let insertPos = trimmedQuery.length;

    // Find the position to insert the WHERE clause
    if (groupByIndex !== -1) {
      insertPos = groupByIndex;
      clauses.push(trimmedQuery.substring(groupByIndex));
    } else if (orderByIndex !== -1) {
      insertPos = orderByIndex;
      clauses.push(trimmedQuery.substring(orderByIndex));
    } else if (limitIndex !== -1) {
      insertPos = limitIndex;
      clauses.push(trimmedQuery.substring(limitIndex));
    }

    queryBase = trimmedQuery.substring(0, insertPos);
    return `${queryBase} WHERE ${timeFilter}${clauses.join('')}`;
  }
}

// Find the best time field to use for a given table name
export function findBestTimeField(schema: any, dbName: string, tableName: string): string | null {
  if (!schema || !dbName || !tableName || !schema[dbName]) return null;

  const tableSchema = schema[dbName].find((table: any) => table.tableName === tableName);

  if (!tableSchema || !tableSchema.columns) {
    return null;
  }

  // Priority list for time fields
  const priorityFields = [
    '__timestamp',
    'time',
    'timestamp',
    'date',
    'created_at',
    'time_sec',
    'time_usec',
    'create_date',
    'datetime'
  ];

  // First check for priority fields
  for (const fieldName of priorityFields) {
    const found = tableSchema.columns.find((col: any) =>
      col.columnName?.toLowerCase() === fieldName.toLowerCase()
    );
    if (found) return found.columnName;
  }

  // If none of the priority fields exist, check for fields with time-related names
  for (const col of tableSchema.columns) {
    const colName = col.columnName?.toLowerCase() || '';
    if (colName.includes('time') || colName.includes('date')) {
      return col.columnName;
    }
  }

  // If still no match, check data types
  for (const col of tableSchema.columns) {
    const dataType = col.dataType?.toLowerCase() || '';
    if (dataType.includes('timestamp') ||
      dataType.includes('datetime') ||
      dataType.includes('date')) {
      return col.columnName;
    }
  }

  return null;
}

// Extract table name from a SQL query (basic implementation)
export function extractTableName(query: string): string | null {
  if (!query) return null;

  // Look for FROM clause followed by table name
  const fromMatch = query.match(/\sFROM\s+([a-zA-Z0-9_\.]+)/i);
  if (fromMatch && fromMatch[1]) {
    // Remove any schema prefix (e.g., "schema.table" -> "table")
    const parts = fromMatch[1].split('.');
    return parts[parts.length - 1];
  }
  return null;
}

// Determine if a query already has a time filter
export function hasTimeFilter(query: string): boolean {
  if (!query || query.trim() === '') {
    return false;
  }

  const lowerQuery = query.toLowerCase();

  // Make sure we're not matching time fields mentioned in SELECT clauses
  // First, check if there's a WHERE clause
  const whereIndex = lowerQuery.indexOf(' where ');
  if (whereIndex === -1) {
    return false; // No WHERE clause means no time filter
  }

  // Check only the part after WHERE
  const whereClause = lowerQuery.substring(whereIndex);

  // More specific checks for time-related conditions
  const hasTimeCondition = (
    // Most common patterns we generate - match these first
    /where\s+(.*?)\s*>=\s*now\(\)\s*-\s*interval/i.test(whereClause) ||

    // Check for common time field names in WHERE conditions with operators
    /where\s+.*?(timestamp|time|date|datetime|created_at|updated_at|__timestamp|time_sec|time_usec|create_date)\s*(>=|<=|>|<|=|between|!=)/i.test(whereClause) ||

    // Check for time functions using our new lowercase syntax
    /where.*?\b(now|now\(\)|current_timestamp|date_trunc|extract\s*\(\s*epoch|interval\s*')/i.test(whereClause) ||

    // Check for date literals
    /where.*?'\d{4}-\d{2}-\d{2}'/i.test(whereClause) ||

    // Check for epoch timestamps
    /where.*?\b\d{10,13}\b/i.test(whereClause)
  );

  return hasTimeCondition;
}

// Helper function to check if a string is a valid date or datetime
export function isAbsoluteDate(dateStr: string): boolean {
  if (!dateStr || dateStr.startsWith('now')) return false;
  
  try {
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
  } catch {
    return false;
  }
}

// Format a date string to ISO format for SQL (YYYY-MM-DD)
export function formatDateForSql(dateStr: string | Date): string {
  if (!dateStr) return '';
  
  try {
    const date = dateStr instanceof Date ? dateStr : new Date(dateStr);
    if (isNaN(date.getTime())) return typeof dateStr === 'string' ? `'${dateStr}'` : '';
    
    return `'${date.toISOString()}'`;
  } catch {
    return typeof dateStr === 'string' ? `'${dateStr}'` : '';
  }
}