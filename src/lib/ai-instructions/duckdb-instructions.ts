/**
 * DuckDB-specific instructions for query generation
 */

export const DUCKDB_INSTRUCTIONS = `
# DuckDB Query Engine Instructions

## CRITICAL: You are working with DuckDB SQL Engine

🦆 **IMPORTANT**: This system uses DuckDB as the query engine. ALL queries must be DuckDB-compatible SQL.

### DuckDB Overview
- DuckDB is an in-process SQL OLAP database management system
- Optimized for analytical queries on large datasets
- Supports standard SQL with many PostgreSQL-compatible features
- Excellent for time-series data and analytics

## DuckDB-Specific SQL Syntax

### ✅ DuckDB Features You Can Use:

1. **Standard SQL**:
   - SELECT, FROM, WHERE, GROUP BY, ORDER BY, HAVING
   - JOINs (INNER, LEFT, RIGHT, FULL OUTER, CROSS)
   - CTEs (WITH clause)
   - Window functions
   - Subqueries

2. **Data Types**:
   - INTEGER, BIGINT, DOUBLE, DECIMAL
   - VARCHAR, TEXT
   - DATE, TIME, TIMESTAMP, TIMESTAMPTZ
   - BOOLEAN
   - BLOB, JSON

3. **Date/Time Functions**:
   \`\`\`sql
   -- Extract parts
   EXTRACT(YEAR FROM timestamp_col)
   EXTRACT(MONTH FROM timestamp_col)
   EXTRACT(DAY FROM timestamp_col)
   EXTRACT(HOUR FROM timestamp_col)
   
   -- Date arithmetic
   date_col + INTERVAL '1 day'
   timestamp_col - INTERVAL '1 hour'
   
   -- Formatting
   strftime('%Y-%m-%d', timestamp_col)
   strftime('%Y-%m-%d %H:%M:%S', timestamp_col)
   
   -- Truncation
   date_trunc('hour', timestamp_col)
   date_trunc('day', timestamp_col)
   date_trunc('month', timestamp_col)
   \`\`\`

4. **Aggregate Functions**:
   - COUNT(*), COUNT(DISTINCT col)
   - SUM, AVG, MIN, MAX
   - STDDEV, VARIANCE
   - PERCENTILE_CONT, PERCENTILE_DISC
   - LIST (array aggregation)
   - STRING_AGG

5. **Window Functions**:
   \`\`\`sql
   ROW_NUMBER() OVER (PARTITION BY col ORDER BY col2)
   RANK() OVER (ORDER BY col)
   LAG(col, 1) OVER (ORDER BY timestamp)
   LEAD(col, 1) OVER (ORDER BY timestamp)
   SUM(col) OVER (PARTITION BY group_col)
   \`\`\`

6. **String Functions**:
   - CONCAT, ||
   - SUBSTRING, SUBSTR
   - UPPER, LOWER
   - TRIM, LTRIM, RTRIM
   - REPLACE
   - REGEXP_MATCHES, REGEXP_REPLACE

7. **JSON Functions**:
   \`\`\`sql
   json_extract(json_col, '$.field')
   json_extract_string(json_col, '$.field')
   json_array_length(json_col)
   \`\`\`

### ❌ Features NOT Available in DuckDB:

1. **No Stored Procedures or Functions**
2. **No CREATE PROCEDURE/FUNCTION**
3. **No DECLARE variables** (use CTEs instead)
4. **No IF/ELSE statements** (use CASE WHEN)
5. **No FOR/WHILE loops**
6. **No MySQL-specific syntax** (e.g., LIMIT with OFFSET syntax differs)
7. **No SQL Server specific syntax** (e.g., TOP, GETDATE())

## Time-Series Queries in DuckDB

### Best Practices for Time-Series Data:

1. **Time Bucketing**:
   \`\`\`sql
   -- Group by hour
   SELECT 
     date_trunc('hour', timestamp_col) as hour,
     AVG(value) as avg_value
   FROM metrics
   WHERE $__timeFilter
   GROUP BY hour
   ORDER BY hour
   \`\`\`

2. **Moving Averages**:
   \`\`\`sql
   SELECT 
     timestamp_col,
     value,
     AVG(value) OVER (
       ORDER BY timestamp_col 
       ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
     ) as moving_avg_7
   FROM metrics
   WHERE $__timeFilter
   ORDER BY timestamp_col
   \`\`\`

3. **Time-based Joins**:
   \`\`\`sql
   -- ASOF JOIN for time-series alignment
   SELECT 
     a.timestamp,
     a.value as metric_a,
     b.value as metric_b
   FROM metrics_a a
   ASOF JOIN metrics_b b
     ON a.timestamp >= b.timestamp
   WHERE $__timeFilter
   \`\`\`

## Query Optimization Tips

1. **Use appropriate data types** - BIGINT for timestamps in nanoseconds
2. **Filter early** - Put WHERE conditions as early as possible
3. **Use column statistics** - DuckDB automatically maintains them
4. **Avoid SELECT *** - Select only needed columns
5. **Use EXPLAIN** to understand query plans

## Common Query Patterns

### 1. Time-Series Aggregation:
\`\`\`sql
SELECT 
  date_trunc('minute', $__timeField) as time,
  AVG(cpu_usage) as avg_cpu,
  MAX(cpu_usage) as max_cpu,
  COUNT(*) as sample_count
FROM system_metrics
WHERE $__timeFilter
GROUP BY time
ORDER BY time
\`\`\`

### 2. Top-N Analysis:
\`\`\`sql
SELECT 
  user_id,
  COUNT(*) as event_count
FROM events
WHERE $__timeFilter
GROUP BY user_id
ORDER BY event_count DESC
LIMIT 10
\`\`\`

### 3. Pivot/Unpivot Operations:
\`\`\`sql
-- DuckDB supports PIVOT and UNPIVOT
PIVOT (
  SELECT region, product, sales
  FROM sales_data
  WHERE $__timeFilter
) ON product USING SUM(sales)
\`\`\`

### 4. Recursive CTEs:
\`\`\`sql
WITH RECURSIVE hierarchy AS (
  SELECT id, parent_id, name, 1 as level
  FROM categories
  WHERE parent_id IS NULL
  
  UNION ALL
  
  SELECT c.id, c.parent_id, c.name, h.level + 1
  FROM categories c
  JOIN hierarchy h ON c.parent_id = h.id
)
SELECT * FROM hierarchy
\`\`\`

## Error Prevention

### Common Mistakes to Avoid:

1. **Wrong LIMIT syntax**:
   ❌ \\\`SELECT * FROM table LIMIT 10, 20\\\` (MySQL style)
   ✅ \\\`SELECT * FROM table LIMIT 10 OFFSET 20\\\`

2. **Wrong timestamp handling**:
   ❌ \\\`WHERE timestamp = '2024-01-01'\\\` (for timestamp columns)
   ✅ \\\`WHERE timestamp >= '2024-01-01' AND timestamp < '2024-01-02'\\\`

3. **Wrong string concatenation**:
   ❌ \\\`SELECT CONCAT_WS('-', col1, col2)\\\` (MySQL)
   ✅ \\\`SELECT col1 || '-' || col2\\\`

4. **Wrong date functions**:
   ❌ \\\`SELECT NOW()\\\` (PostgreSQL/MySQL)
   ✅ \\\`SELECT CURRENT_TIMESTAMP\\\`

## REMEMBER:
- Always generate DuckDB-compatible SQL
- Use $__timeFilter macro for time filtering
- Test complex queries with EXPLAIN
- Optimize for columnar storage patterns
- Leverage DuckDB's excellent aggregation performance
`;

export const DUCKDB_EXAMPLES = `
# DuckDB Query Examples

## Basic Queries
\`\`\`sql
-- Simple aggregation
SELECT COUNT(*), AVG(value), MIN(value), MAX(value)
FROM metrics
WHERE $__timeFilter

-- Group by with time bucket
SELECT 
  date_trunc('hour', $__timeField) as hour,
  sensor_id,
  AVG(temperature) as avg_temp
FROM sensor_data
WHERE $__timeFilter
GROUP BY hour, sensor_id
ORDER BY hour, sensor_id
\`\`\`

## Advanced Analytics
\`\`\`sql
-- Percentiles and statistics
SELECT 
  percentile_cont(0.50) WITHIN GROUP (ORDER BY response_time) as p50,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time) as p95,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY response_time) as p99,
  stddev(response_time) as std_dev
FROM api_metrics
WHERE $__timeFilter

-- Window functions for rate calculation
SELECT 
  timestamp,
  value,
  value - LAG(value, 1) OVER (ORDER BY timestamp) as delta,
  (value - LAG(value, 1) OVER (ORDER BY timestamp)) / 
    EXTRACT(EPOCH FROM (timestamp - LAG(timestamp, 1) OVER (ORDER BY timestamp))) as rate_per_second
FROM counter_metrics
WHERE $__timeFilter
ORDER BY timestamp
\`\`\`
`;