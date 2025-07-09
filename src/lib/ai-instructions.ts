/**
 * AI Instructions and Context Builder for Gigapi
 *
 * This file contains all the AI instruction templates and context building logic
 * for the MCP (Model Context Protocol) integration.
 */

import type { CustomInstruction } from "@/types";

// Function to get saved AI context data from atoms
export function getSavedAIContext(): {
  databases: string[];
  tables: Record<string, string[]>;
  schemas: Record<string, Record<string, any[]>>;
} {
  try {
    // Retrieve saved data from localStorage (where atoms store the data)
    const databases = JSON.parse(localStorage.getItem("gigapi_databases") || "[]");
    const tables = JSON.parse(localStorage.getItem("gigapi_tables") || "{}");
    const schemas = JSON.parse(localStorage.getItem("gigapi_schema") || "{}");
    
    return { databases, tables, schemas };
  } catch (error) {
    console.warn("Failed to retrieve AI context from storage:", error);
    return { databases: [], tables: {}, schemas: {} };
  }
}

// Enhanced context builder using saved AI data
export function buildEnhancedDataContext(
  currentDatabase?: string,
  currentTable?: string,
  customInstructions: CustomInstruction[] = []
): string {
  const { databases, tables, schemas } = getSavedAIContext();
  
  console.log('[AI Context] Building enhanced context with:', {
    currentDatabase,
    currentTable,
    databases,
    tables,
    schemasKeys: Object.keys(schemas),
    hasSchemas: Object.keys(schemas).length > 0
  });
  
  let context = BASE_AI_INSTRUCTIONS;
  
  // Add custom instructions
  const activeInstructions = customInstructions.filter((i) => i.isActive);
  if (activeInstructions.length > 0) {
    context += `\n🔧 MANDATORY USER INSTRUCTIONS:\nYou MUST follow these user instructions UNLESS they violate safety guidelines:\n\n`;
    activeInstructions.forEach((instruction, index) => {
      context += `${index + 1}. [${instruction.name}]: ${instruction.content}\n`;
    });
    context += "\nEND OF MANDATORY USER INSTRUCTIONS\n";
  }
  
  // Add comprehensive database context
  context += `\n📊 AVAILABLE DATABASE CONTEXT:\n`;
  
  if (databases.length > 0) {
    context += `Available Databases: ${databases.join(', ')}\n`;
  }
  
  if (currentDatabase) {
    context += `\nSelected Database: ${currentDatabase}\n`;
    
    if (tables[currentDatabase]) {
      context += `Available Tables in ${currentDatabase}: ${tables[currentDatabase].join(', ')}\n`;
    }
    
    if (currentTable && schemas[currentDatabase]?.[currentTable]) {
      context += `\nSelected Table: ${currentTable}\n`;
      context += `Schema for ${currentDatabase}.${currentTable}:\n`;
      
      const tableSchema = schemas[currentDatabase][currentTable];
      tableSchema.forEach((col: any) => {
        const colName = col.column_name || col.name;
        const colType = col.column_type || col.type || 'unknown';
        context += `  - ${colName}: ${colType}\n`;
      });
      
      // Add field type suggestions
      context += generateFieldTypeSuggestions(tableSchema);
    }
  }
  
  // Add all available schemas for reference
  if (Object.keys(schemas).length > 0) {
    context += `\n📋 ALL AVAILABLE SCHEMAS:\n`;
    Object.entries(schemas).forEach(([dbName, dbTables]) => {
      context += `\nDatabase: ${dbName}\n`;
      Object.entries(dbTables).forEach(([tableName, tableSchema]) => {
        context += `  Table: ${tableName}\n`;
        (tableSchema as any[]).forEach((col: any) => {
          const colName = col.column_name || col.name;
          const colType = col.column_type || col.type || 'unknown';
          context += `    - ${colName}: ${colType}\n`;
        });
      });
    });
  }
  
  context += DUCKDB_SQL_RULES;
  
  return context;
}

// Generate field type suggestions for better AI context
function generateFieldTypeSuggestions(schema: any[]): string {
  const timeFields: string[] = [];
  const numericFields: string[] = [];
  const stringFields: string[] = [];
  
  schema.forEach((col: any) => {
    const colName = col.column_name || col.name;
    const colType = (col.column_type || col.type || '').toLowerCase();
    
    if (colType.includes('timestamp') || colType.includes('datetime') || colType.includes('date') || colName.includes('time')) {
      timeFields.push(colName);
    } else if (colType.includes('int') || colType.includes('float') || colType.includes('double') || colType.includes('decimal')) {
      numericFields.push(colName);
    } else {
      stringFields.push(colName);
    }
  });
  
  let suggestions = `\n💡 FIELD SUGGESTIONS:\n`;
  if (timeFields.length > 0) {
    suggestions += `  Time Fields (use for time series and $__timeFilter): ${timeFields.join(', ')}\n`;
  }
  if (numericFields.length > 0) {
    suggestions += `  Numeric Fields (use for aggregations like SUM, AVG, COUNT): ${numericFields.join(', ')}\n`;
  }
  if (stringFields.length > 0) {
    suggestions += `  String Fields (use for grouping and filtering): ${stringFields.join(', ')}\n`;
  }
  
  return suggestions;
}

export interface DataContext {
  selectedDb?: string | null;
  selectedTable?: string | null;
  schema?: any;
  timeRange?: any;
  currentDashboard?: any;
  panels?: Map<string, any>;
}

/**
 * Build comprehensive context for AI requests including custom instructions
 */
export function buildDataContext(
  dataContext: DataContext,
  customInstructions: CustomInstruction[]
): string {
  const {
    selectedDb,
    selectedTable,
    schema,
    timeRange,
    currentDashboard,
    panels,
  } = dataContext;

  // Add active custom instructions to the context
  const activeInstructions = customInstructions.filter((i) => i.isActive);
  let instructionsContext = "";

  if (activeInstructions.length > 0) {
    instructionsContext = `\n🔧 MANDATORY USER INSTRUCTIONS:\nYou MUST follow these user instructions UNLESS they violate safety guidelines, ask for harmful content, or request illegal activities. These take precedence over general behavior:\n\n`;
    activeInstructions.forEach((instruction, index) => {
      instructionsContext += `${index + 1}. [${instruction.name}]: ${
        instruction.content
      }\n`;
    });
    instructionsContext += "\nEND OF MANDATORY USER INSTRUCTIONS\n";
  }

  let context =
    BASE_AI_INSTRUCTIONS + instructionsContext + DATABASE_CONTEXT_TEMPLATE;

  // Add current database context
  if (selectedDb) {
    context += `CURRENT DATABASE: ${selectedDb}\n`;
  }

  if (selectedTable) {
    context += `CURRENT TABLE: ${selectedTable}\n`;
  }

  // Add schema information
  if (schema && selectedDb && schema[selectedDb]) {
    context += "\nAVAILABLE TABLES AND SCHEMAS:\n";
    schema[selectedDb].forEach((table: any) => {
      context += `\nTable: ${table.tableName}\n`;
      if (table.columns && table.columns.length > 0) {
        context += "Columns:\n";
        table.columns.forEach((col: any) => {
          const timeUnit = col.timeUnit ? ` (time unit: ${col.timeUnit})` : "";
          context += `  - ${col.columnName}: ${col.dataType}${timeUnit}\n`;
        });
      }
    });
  }

  // Add time range context
  if (timeRange && timeRange.enabled) {
    context += `\nCURRENT TIME RANGE: ${timeRange.from} to ${timeRange.to}\n`;
  }

  // Add dashboard context
  context += buildDashboardContext(currentDashboard, panels);

  // Add DuckDB SQL rules
  context += DUCKDB_SQL_RULES;

  return context;
}

/**
 * Base AI instructions for Gigapi
 */
const BASE_AI_INSTRUCTIONS = `
You are a helpful AI assistant for Gigapi, a next-gen observability tool. You help users with data analysis, SQL queries, and creating interactive dashboard visualizations.

IMPORTANT LINKS: 
- GIGAPI Repo: https://github.com/gigapi/gigapi 
- GIGAPI Docs: https://gigapipe.com/docs/index.html

🎯 YOUR CAPABILITIES:
1. Generate SQL queries for data analysis
2. **CREATE INTERACTIVE VISUAL CHARTS** - When users ask for charts, ALWAYS generate chart artifacts using chart format
3. Suggest appropriate visualizations based on data types
4. Help optimize queries for performance
5. Provide observability insights and recommendations

⚠️ **CRITICAL CHART GENERATION RULES:**
- NEVER SAY "I cannot render charts" or "I'm a text-based AI" - You MUST generate chart artifacts
- NEVER provide ASCII text-based chart representations like "Temperature Over Time: 08:00 | 22.5°C"
- ALWAYS use the chart artifact format below for ANY visualization request
- CHART GENERATION IS MANDATORY when users request charts, graphs, plots, or data visualization
- When users ask "can you render the chart" or similar, immediately generate a chart artifact
- Replace any text-based chart attempts with proper chart artifacts

📊 DASHBOARD & VISUALIZATION SYSTEM:
You can create interactive charts using these panel types:

**Available Panel Types:**
- **timeseries**: Time-based line charts, perfect for metrics over time
- **pie**: Categorical data breakdown with percentages  

**Chart Artifacts - REQUIRED FORMAT:**
When creating visualizations, you MUST use this EXACT format (the chart will execute the query and render live data):

\`\`\`chart
{
  "type": "timeseries",
  "title": "CPU Usage Over Time",
  "query": "SELECT $__timeField as time, AVG(cpu_percent) as cpu_usage FROM metrics WHERE $__timeFilter GROUP BY time ORDER BY time",
  "database": "CURRENT_DATABASE_NAME",
  "fieldMapping": {
    "xField": "time",
    "yField": "cpu_usage",
    "seriesField": "optional_grouping_field"
  },
  "fieldConfig": {
    "defaults": {
      "unit": "%",
      "decimals": 1
    }
  },
  "options": {
    "legend": {
      "showLegend": true,
      "placement": "bottom"
    }
  }
}
\`\`\`

**IMPORTANT DATABASE RULES:**
- Always use the CURRENT DATABASE name in the "database" field
- Never hardcode database names like "weather_db" or "metrics_db"
- Use table names that exist in the current database schema provided below

🔥 **CHART BEHAVIOR**: Charts will automatically execute queries and show LIVE DATA in the chat. Users can:
- See real-time charts with actual data
- Refresh data with a button click
- Add charts to dashboards with one click
- Interact with live charts

**Query Best Practices for Charts:**
- ALWAYS use $__timeFilter for time-based queries (automatically handles current time range)
- Use $__timeField to reference the time column
- For non-time queries, write standard SQL
- Include proper field mappings for chart types
- Consider data volume (charts work best with <1000 points)

**Field Mapping Guidelines:**
- **timeseries/line/area**: xField (time), yField (metric), seriesField (optional grouping)
- **pie/donut**: yField (values), seriesField (categories)

`;

/**
 * Database context template placeholder
 */
const DATABASE_CONTEXT_TEMPLATE = ``;

/**
 * Build dashboard-specific context
 */
function buildDashboardContext(
  currentDashboard: any,
  panels: Map<string, any> | undefined
): string {
  if (currentDashboard) {
    let context = `\n📈 CURRENT DASHBOARD CONTEXT:\n`;
    context += `Dashboard: "${currentDashboard.name}"\n`;
    if (currentDashboard.description) {
      context += `Description: ${currentDashboard.description}\n`;
    }

    const panelArray = Array.from(panels?.values() || []);
    if (panelArray.length > 0) {
      context += `\nExisting Panels (${panelArray.length}):\n`;
      panelArray.forEach((panel) => {
        context += `- "${panel.title}" (${panel.type}): ${
          panel.query ? "Has query" : "No query"
        }\n`;
      });
    }
    context += `\nYou can suggest adding charts to this dashboard or create new ones.\n`;
    return context;
  } else {
    return `\n📈 DASHBOARD CONTEXT: No dashboard currently loaded. You can suggest creating charts that users can add to dashboards.\n`;
  }
}

/**
 * DuckDB SQL rules and best practices
 */
const DUCKDB_SQL_RULES = `\nDUCKDB SQL GENERATION RULES FOR GIGAPI BACKEND:

CRITICAL CONSTRAINTS:
- Backend uses DuckDB with specific time handling patterns
- Time filtering MUST use epoch conversion for numeric timestamp fields
- All temporal queries must be compatible with DuckDB SQL syntax

TIME FILTER VARIABLES (use these in your SQL queries):

CRITICAL: These variables are mutually exclusive - do NOT combine them in the same query!

1. $__timeFilter 
   - This is a COMPLETE WHERE condition that includes both the time field and the range
   - Automatically handles epoch conversion based on field type and timeUnit
   - Use this when you want automatic time filtering
   - Example: SELECT * FROM logs WHERE $__timeFilter
   - DO NOT use with other time variables ($__timeFrom, $__timeTo, $__timeField)

2. $__timeField 
   - This expands to just the time column name
   - Use when you need to reference the time column in your query
   - Example: SELECT $__timeField, count(*) FROM logs GROUP BY $__timeField

3. $__timeFrom and $__timeTo 
   - These are the start and end timestamps (properly scaled for field's timeUnit)
   - Use when you want to manually construct time conditions
   - Example: SELECT * FROM logs WHERE timestamp >= $__timeFrom AND timestamp <= $__timeTo

DUCKDB TIME HANDLING PATTERNS: (ONLY IF NEEDED AND USER HASN'T USED $__timeFilter, AVOID MIXING, and always choose to use $__timeFilter if available)

1. EPOCH TIME CONVERSION:
   - For BIGINT/INT timestamp fields, use EXTRACT(EPOCH FROM date) functions
   - Time units: 's' (seconds), 'ms' (milliseconds), 'us' (microseconds), 'ns' (nanoseconds)
   - Common patterns:
     * EXTRACT(EPOCH FROM NOW()) - seconds since Unix epoch
     * EXTRACT(EPOCH FROM NOW()) * 1000 - milliseconds  
     * EXTRACT(EPOCH FROM NOW()) * 1000000 - microseconds
     * EXTRACT(EPOCH FROM NOW()) * 1000000000 - nanoseconds

2. TIME FIELD DETECTION:
   - Fields ending with '_ns', '_us', '_ms', '_s' indicate time units
   - Common time fields: __timestamp, time, timestamp, created_at, updated_at
   - '__timestamp' fields typically use nanosecond precision
   - 'created_at'/'updated_at' fields typically use millisecond precision


 SQL BEST PRACTICES FOR GIGAPI:

1. TIME FILTERING:
   SELECT * FROM logs WHERE $__timeFilter
   SELECT * FROM logs WHERE __timestamp >= $__timeFrom AND __timestamp <= $__timeTo
   SELECT * FROM logs WHERE __timestamp >= EXTRACT(EPOCH FROM NOW() - INTERVAL 1 HOUR) * 1000000000

2. TIME GROUPING:
    SELECT DATE_TRUNC('hour', to_timestamp(__timestamp/1000000000)), COUNT(*)
       FROM logs WHERE $__timeFilter GROUP BY 1
    SELECT $__timeField, COUNT(*) FROM logs WHERE $__timeFilter GROUP BY $__timeField

3. AGGREGATIONS WITH TIME:
    SELECT COUNT(*), AVG(response_time), MAX(error_rate) 
       FROM metrics WHERE $__timeFilter
    SELECT DATE_TRUNC('minute', to_timestamp(time_ns/1000000000)), AVG(cpu_usage)
       FROM system_metrics WHERE $__timeFilter GROUP BY 1 ORDER BY 1

4. OBSERVABILITY PATTERNS:
   SELECT service_name, COUNT(*) as request_count, AVG(duration_ms)
       FROM traces WHERE $__timeFilter GROUP BY service_name
   SELECT level, COUNT(*) FROM logs 
       WHERE $__timeFilter AND level IN ('ERROR', 'WARN') GROUP BY level

EXAMPLES OF INCORRECT USAGE:
SELECT * FROM logs WHERE $__timeFilter AND timestamp >= $__timeFrom
SELECT * FROM logs WHERE $__timeFilter BETWEEN $__timeFrom AND $__timeTo
Using MySQL/PostgreSQL specific functions (use DuckDB equivalents)
Mixing timestamp formats without proper conversion

SCHEMA-AWARE RECOMMENDATIONS:
- Use appropriate time conversion functions based on detected field types
- Suggest time-based grouping for observability queries
- Recommend efficient time range queries using available indexes
- Avoid unnecessary complexity in time filtering AND JOINS since gigapi-querier is under active development


USER ERRORS RESPONSES: 

- If user asks for time filtering without specifying a time field, suggest using $__timeFilter
- IF user insists on an error, remind that gigapi and gigapi-querier are under active development and may not support all SQL features.
- If users makes a compiling case that it should work ask him to fill a new issue in github in gigapi-querier repo: https://github.com/gigapi/gigapi-querier/issues, tell him to be specific and clear with his request, and that it the team will do what it can to fix it.
`;

/**
 * Chart artifact validation and enhancement
 */
export function enhanceChartArtifact(
  rawArtifact: any,
  selectedDb: string | null,
  selectedTable: string | null,
  timeRange: any
): any {
  if (!rawArtifact || !rawArtifact.type || !rawArtifact.title) {
    console.warn("Chart artifact missing required fields (type, title)");
    return undefined;
  }

  const chartArtifact = { ...rawArtifact };

  // Set default database if not specified or if placeholder is used
  if (
    (!chartArtifact.database ||
      chartArtifact.database === "CURRENT_DATABASE_NAME") &&
    selectedDb
  ) {
    chartArtifact.database = selectedDb;
  }

  // Ensure field mapping exists with sensible defaults
  if (!chartArtifact.fieldMapping) {
    chartArtifact.fieldMapping = {};
  }

  // Add default field configuration if missing
  if (!chartArtifact.fieldConfig) {
    chartArtifact.fieldConfig = {
      defaults: {
        unit: "",
        decimals: 2,
      },
    };
  }

  // Ensure options exist
  if (!chartArtifact.options) {
    chartArtifact.options = {
      legend: {
        showLegend: true,
        placement: "bottom",
        displayMode: "list",
      },
    };
  }

  // Validate query contains proper time variables if chart type suggests time-based data
  if (
    chartArtifact.query &&
    ["timeseries", "line", "area"].includes(chartArtifact.type)
  ) {
    const hasTimeVars = /\$__time(Filter|Field|From|To)/.test(
      chartArtifact.query
    );
    const hasTimeColumn =
      /\b(time|timestamp|__timestamp|created_at|updated_at)\b/i.test(
        chartArtifact.query
      );

    if (!hasTimeVars && !hasTimeColumn) {
      console.warn(
        "Time-based chart without time variables detected. Consider using $__timeFilter for better time handling."
      );
    }
  }

  // Add metadata for better tracking
  chartArtifact.metadata = {
    generated_at: new Date().toISOString(),
    context: {
      database: selectedDb,
      table: selectedTable,
      hasTimeRange: !!timeRange?.enabled,
    },
    version: "1.0",
  };

  return chartArtifact;
}

/**
 * Extract chart artifacts from AI response content
 */
export function extractChartArtifact(content: string): any | undefined {
  const chartMatches = content.match(/```chart\n([\s\S]*?)\n```/);
  if (!chartMatches || !chartMatches[1]) {
    return undefined;
  }

  try {
    return JSON.parse(chartMatches[1].trim());
  } catch (error) {
    console.warn("Failed to parse chart artifact:", error);
    return undefined;
  }
}

/**
 * Extract SQL queries from AI response content
 */
export function extractSQLQuery(content: string): string | undefined {
  const sqlMatches = content.match(/```sql\n([\s\S]*?)\n```/);
  if (!sqlMatches || !sqlMatches[1]) {
    return undefined;
  }

  return sqlMatches[1].trim();
}
