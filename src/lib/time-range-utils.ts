import type { TimeRange } from "../components/TimeRangeSelector";

// Field type constants
export const TIME_FIELD_TYPES = [
  "timestamp", "datetime", "date", "time", "bigint"
];

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

// Generate SQL time filters based on the selected time range
export function generateTimeFilter(timeRange: TimeRange, timeField: string): string {
  // Check if time filtering is enabled
  if (!timeRange || !timeField || timeRange.enabled === false || !timeRange.from || !timeRange.to) {
    return '';
  }
  
  const { from, to } = timeRange;
  let fromSql = '';
  let toSql = '';
  
  // Process the 'from' time value
  if (from === 'now') {
    fromSql = 'NOW()';
  } else if (from.startsWith('now-')) {
    // Relative time in the past
    const match = from.match(/^now-(\d+)([mhdwMy])(?:\/([mhdwMy]))?$/);
    if (match) {
      const [, amount, unit, snapTo] = match;
      let interval = '';
      
      // Convert to SQL interval format
      switch (unit) {
        case 'm': interval = `${amount} MINUTE`; break;
        case 'h': interval = `${amount} HOUR`; break;
        case 'd': interval = `${amount} DAY`; break;
        case 'w': interval = `${amount} WEEK`; break;
        case 'M': interval = `${amount} MONTH`; break;
        case 'y': interval = `${amount} YEAR`; break;
      }
      
      // If snapTo is defined, use truncate/date_trunc function (syntax varies by database)
      if (snapTo) {
        fromSql = `DATE_TRUNC('${getSnapUnit(snapTo)}', NOW() - INTERVAL '${interval}')`;
      } else {
        fromSql = `NOW() - INTERVAL '${interval}'`;
      }
    } else {
      // Fallback if we can't parse the relative time
      fromSql = `NOW() - INTERVAL '24 HOUR'`;
    }
  } else if (from.startsWith('now/')) {
    // Time aligned to a boundary
    const unit = from.substring(4);
    fromSql = `DATE_TRUNC('${getSnapUnit(unit)}', NOW())`;
  } else {
    // Try to parse as absolute datetime
    try {
      const date = new Date(from);
      if (!isNaN(date.getTime())) {
        // Format as ISO string for SQL
        fromSql = `'${date.toISOString()}'`;
      } else {
        // Fallback
        fromSql = `NOW() - INTERVAL '24 HOUR'`;
      }
    } catch (e) {
      // If parsing fails, use a default
      fromSql = `NOW() - INTERVAL '24 HOUR'`;
    }
  }
  
  // Process the 'to' time value using the same logic
  if (to === 'now') {
    toSql = 'NOW()';
  } else if (to.startsWith('now-')) {
    const match = to.match(/^now-(\d+)([mhdwMy])(?:\/([mhdwMy]))?$/);
    if (match) {
      const [, amount, unit, snapTo] = match;
      let interval = '';
      
      switch (unit) {
        case 'm': interval = `${amount} MINUTE`; break;
        case 'h': interval = `${amount} HOUR`; break;
        case 'd': interval = `${amount} DAY`; break;
        case 'w': interval = `${amount} WEEK`; break;
        case 'M': interval = `${amount} MONTH`; break;
        case 'y': interval = `${amount} YEAR`; break;
      }
      
      if (snapTo) {
        toSql = `DATE_TRUNC('${getSnapUnit(snapTo)}', NOW() - INTERVAL '${interval}')`;
      } else {
        toSql = `NOW() - INTERVAL '${interval}'`;
      }
    } else {
      toSql = 'NOW()';
    }
  } else if (to.startsWith('now/')) {
    const unit = to.substring(4);
    toSql = `DATE_TRUNC('${getSnapUnit(unit)}', NOW())`;
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
  
  // Build the SQL WHERE conditions based on field type
  if (timeField.toLowerCase().includes('timestamp') || 
      timeField.toLowerCase().includes('time') ||
      timeField.toLowerCase().includes('_sec') ||
      timeField.toLowerCase().includes('_usec') ||
      timeField === 'create_date') {
    // For numeric timestamp fields (milliseconds since epoch)
    return `${timeField} >= CAST(EXTRACT(EPOCH FROM ${fromSql}) AS BIGINT) * 1000 AND ${timeField} <= CAST(EXTRACT(EPOCH FROM ${toSql}) AS BIGINT) * 1000`;
  } else {
    // For datetime fields
    return `${timeField} >= ${fromSql} AND ${timeField} <= ${toSql}`;
  }
}

// Helper function to convert unit character to SQL date_trunc unit
function getSnapUnit(unit: string): string {
  switch (unit) {
    case 'm': return 'minute';
    case 'h': return 'hour';
    case 'd': return 'day';
    case 'w': return 'week';
    case 'M': return 'month';
    case 'y': return 'year';
    default: return 'hour';
  }
}

// Adapt SQL time filter based on database dialect
export function adaptTimeFilterForDbType(filter: string, dbType: string): string {
  if (!filter) return '';
  
  switch (dbType.toLowerCase()) {
    case 'mysql':
      // MySQL uses different timestamp functions
      return filter
        .replace(/DATE_TRUNC\('(\w+)', ([^)]+)\)/g, 'DATE_FORMAT($2, "%Y-%m-%d %H:%i:%s")')
        .replace(/EXTRACT\(EPOCH FROM ([^)]+)\)/g, 'UNIX_TIMESTAMP($1)');
      
    case 'clickhouse':
      // ClickHouse uses toStartOf functions instead of DATE_TRUNC
      return filter
        .replace(/DATE_TRUNC\('day', ([^)]+)\)/g, 'toStartOfDay($1)')
        .replace(/DATE_TRUNC\('month', ([^)]+)\)/g, 'toStartOfMonth($1)')
        .replace(/DATE_TRUNC\('year', ([^)]+)\)/g, 'toStartOfYear($1)')
        .replace(/DATE_TRUNC\('week', ([^)]+)\)/g, 'toMonday($1)')
        .replace(/EXTRACT\(EPOCH FROM ([^)]+)\)/g, 'toUnixTimestamp($1)');
        
    case 'influxdb':
      // InfluxDB has its own time functions
      return filter
        .replace(/DATE_TRUNC\('[^']+', ([^)]+)\)/g, '$1')
        .replace(/NOW\(\)/g, 'now()')
        .replace(/INTERVAL '(\d+) (\w+)'/g, '-$1$2') // -1h instead of INTERVAL '1 HOUR'
        .replace(/EXTRACT\(EPOCH FROM ([^)]+)\)/g, '$1');
        
    default:
      // Default is PostgreSQL/SQLite compatible syntax
      return filter;
  }
}

// Modify a SQL query to add a time filter if needed
export function addTimeFilterToQuery(query: string, timeFilter: string, timeRange?: TimeRange, selectedTimeField?: string | null): string {
  // Skip if no query or no time filter or time filtering is disabled
  if (!query || !timeFilter || (timeRange && timeRange.enabled === false) || !selectedTimeField) {
    console.log("Skipping time filter - disabled or no field selected");
    return query;
  }
  
  // Check if a time filter already exists
  if (hasTimeFilter(query)) {
    console.log("Query already has time filter, not adding");
    return query;
  }
  
  const trimmedQuery = query.trim();
  console.log("Adding time filter for field:", selectedTimeField);
  
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
export function findBestTimeField(schema: any, tableName: string): string | null {
  if (!schema || !tableName) return null;
  
  // Look through the tables in schema
  for (const dbName in schema) {
    const tables = schema[dbName];
    if (!Array.isArray(tables)) continue;
    
    for (const table of tables) {
      if (table.tableName !== tableName || !table.columns) continue;
      
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
        const found = table.columns.find((col: any) => 
          col.columnName?.toLowerCase() === fieldName.toLowerCase()
        );
        if (found) return found.columnName;
      }
      
      // If none of the priority fields exist, check for fields with time-related names
      for (const col of table.columns) {
        const colName = col.columnName?.toLowerCase() || '';
        if (colName.includes('time') || colName.includes('date')) {
          return col.columnName;
        }
      }
      
      // If still no match, check data types
      for (const col of table.columns) {
        const dataType = col.dataType?.toLowerCase() || '';
        if (dataType.includes('timestamp') || 
            dataType.includes('datetime') || 
            dataType.includes('date')) {
          return col.columnName;
        }
      }
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
    console.log("No WHERE clause detected");
    return false; // No WHERE clause means no time filter
  }
  
  // Check only the part after WHERE
  const whereClause = lowerQuery.substring(whereIndex);
  
  // More specific checks for time-related conditions
  const hasTimeCondition = (
    // Check for common time field names in WHERE conditions with operators
    /where\s+.*?(timestamp|time|date|datetime|created_at|updated_at|__timestamp|time_sec|time_usec|create_date)\s*(>=|<=|>|<|=|between|!=)/i.test(whereClause) ||
    
    // Check for time functions
    /where.*?\b(now|current_timestamp|date_trunc|extract\s*\(\s*epoch)\b/i.test(whereClause) ||
    
    // Check for date literals
    /where.*?'\d{4}-\d{2}-\d{2}'/i.test(whereClause) ||
    
    // Check for epoch timestamps
    /where.*?\b\d{10,13}\b/i.test(whereClause)
  );
  
  console.log("Time filter detection result:", hasTimeCondition);
  return hasTimeCondition;
} 