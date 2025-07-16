/**
 * SQL-specific instructions for query generation and time macros
 */

export const SQL_INSTRUCTIONS = `
# SQL Query Generation Instructions

## Time Filter Macro - CRITICAL RULES

🚨 **ABSOLUTE REQUIREMENT**: Use \`$__timeFilter\` as a MACRO, NOT a function

### ✅ CORRECT Usage:
\`\`\`sql
SELECT * FROM table WHERE $__timeFilter
SELECT * FROM events WHERE $__timeFilter AND status = 'error'
SELECT time, value FROM metrics WHERE $__timeFilter ORDER BY time
\`\`\`

### ❌ INCORRECT Usage (NEVER DO THIS):
\`\`\`sql
SELECT * FROM table WHERE $__timeFilter(time)
SELECT * FROM table WHERE $__timeFilter(timestamp)
SELECT * FROM table WHERE "$__timeFilter"
SELECT * FROM table WHERE '$__timeFilter'
SELECT * FROM table WHERE $__timeFilter('time_column')
\`\`\`

## Time Filter Rules
- \`$__timeFilter\` is a macro that expands to proper WHERE conditions
- It automatically uses the selected time field from the TimeFieldSelector
- It handles time range filtering based on dashboard or widget settings
- The macro works with any time column type (timestamp, datetime, date, etc.)

## Time Field Macro
- \`$__timeField\` is replaced with the actual time column name (e.g., timestamp, __timestamp, created_at)
- Use it when you need to reference the time column in SELECT, GROUP BY, or ORDER BY clauses
- Example: \`SELECT $__timeField AS time, COUNT(*) FROM table WHERE $__timeFilter GROUP BY $__timeField ORDER BY $__timeField\`

## Common Time Filter Mistakes in Artifacts

### ❌ WRONG - Function-style usage:
\`\`\`json
{
  "query": "SELECT * FROM metrics WHERE $__timeFilter(timestamp)",
  "database": "monitoring"
}
\`\`\`

### ✅ CORRECT - Macro usage:
\`\`\`json
{
  "query": "SELECT * FROM metrics WHERE $__timeFilter",
  "database": "monitoring"
}
\`\`\`

### ❌ WRONG - Quoted macro:
\`\`\`json
{
  "query": "SELECT * FROM logs WHERE '$__timeFilter'",
  "database": "logs"
}
\`\`\`

### ✅ CORRECT - Unquoted macro:
\`\`\`json
{
  "query": "SELECT * FROM logs WHERE $__timeFilter",
  "database": "logs"
}
\`\`\`

## Time-Based Query Examples

1. **Simple time filter**:
   \`SELECT * FROM events WHERE $__timeFilter\`

2. **With additional conditions**:
   \`SELECT * FROM metrics WHERE $__timeFilter AND cpu > 80\`

3. **Time series aggregation with time field**:
   \`SELECT $__timeField AS time, AVG(value) FROM data WHERE $__timeFilter GROUP BY $__timeField ORDER BY $__timeField\`

4. **Multiple conditions**:
   \`SELECT * FROM logs WHERE $__timeFilter AND level = 'error' AND service = 'api'\`

5. **Proper time field usage**:
   \`SELECT $__timeField AS time, COUNT(*) as count FROM events WHERE $__timeFilter GROUP BY $__timeField ORDER BY $__timeField\`

## SQL Best Practices
- Use proper SQL syntax for the target database system
- Include appropriate GROUP BY clauses for aggregations
- Use meaningful column aliases for chart data
- Optimize queries for performance with large datasets
- Handle NULL values appropriately in aggregations

## Query Structure
- SELECT clause: Choose relevant columns and aggregations
- FROM clause: Specify table without @ prefixes
- WHERE clause: Include $__timeFilter for time-based queries
- GROUP BY clause: Group by time intervals and dimensions
- ORDER BY clause: Sort results appropriately for visualization

## Common Patterns
- Time series: GROUP BY time intervals with aggregations
- Metrics: Calculate counts, sums, averages, percentiles
- Dimensions: Group by categorical fields
- Filters: Apply business logic filters alongside time filters

## Database Compatibility
- Generate queries compatible with the target database system
- Use appropriate date/time functions for each database type
- Handle database-specific syntax differences
- Optimize for the specific database engine being used
`;