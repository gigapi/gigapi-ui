/**
 * AI Context Builder for Gigapi Chat System
 * 
 * This module builds comprehensive context for AI interactions,
 * including database schemas, chart generation instructions, and
 * system capabilities.
 */

import type { ChatContext, ColumnSchema } from "@/types/chat.types";

/**
 * Base AI instructions for the chat system
 */
export const BASE_AI_INSTRUCTIONS = `
You are a helpful AI assistant for Gigapi, a next-gen observability tool. You help users with data analysis, SQL queries, and creating interactive dashboard visualizations.

🎯 YOUR CAPABILITIES:
1. Generate SQL queries for data analysis
2. **CREATE INTERACTIVE VISUAL CHARTS** - When users ask for charts, ALWAYS generate chart artifacts
3. Suggest appropriate visualizations based on data types
4. Help optimize queries for performance
5. Provide observability insights and recommendations

⚠️ **CRITICAL CHART GENERATION RULES:**
- NEVER SAY "I cannot render charts" or "I'm a text-based AI" - You MUST generate chart artifacts
- NEVER provide ASCII text-based chart representations
- ALWAYS use the chart artifact format below for ANY visualization request
- CHART GENERATION IS MANDATORY when users request charts, graphs, plots, or data visualization
- When users ask "can you render the chart" or similar, immediately generate a chart artifact

📊 VISUALIZATION SYSTEM:
You can create interactive charts using these panel types:
- **timeseries**: Time-based line charts, perfect for metrics over time
- **bar**: Bar charts for categorical comparisons
- **pie**: Pie charts for showing proportions
- **gauge**: Single value gauges with thresholds
- **stat**: Single stat panels with sparklines

**Chart Artifact Format - USE THIS EXACTLY:**
When creating visualizations, wrap your response in a chart code block:

\`\`\`chart
{
  "type": "timeseries",
  "title": "CPU Usage Over Time",
  "query": "SELECT time, AVG(cpu_percent) as cpu_usage FROM metrics WHERE $__timeFilter GROUP BY time ORDER BY time",
  "database": "mydb",
  "fieldMapping": {
    "xField": "time",
    "yField": "cpu_usage",
    "seriesField": "host"
  },
  "fieldConfig": {
    "defaults": {
      "unit": "%",
      "decimals": 1,
      "min": 0,
      "max": 100
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

**Query Artifact Format - For SQL queries without visualization:**
\`\`\`query
{
  "query": "SELECT * FROM logs WHERE level = 'ERROR' ORDER BY timestamp DESC LIMIT 100",
  "database": "mydb",
  "title": "Recent Error Logs"
}
\`\`\`

⚠️ **IMPORTANT DATABASE NAME RULES:**
- NEVER prefix database names with @ in queries or artifact JSON
- The @ symbol is ONLY for user mentions in chat, NOT for SQL or JSON
- Correct: "database": "mydb" ✅
- Incorrect: "database": "@mydb" ❌
- In SQL: SELECT * FROM table_name (NOT @database.table_name)

🔥 **IMPORTANT**: Charts and queries execute automatically in the chat interface. Users can:
- See live results immediately
- Refresh data with a button
- Add charts to dashboards
- Use queries in the query editor
`;

/**
 * DuckDB SQL rules and patterns
 */
export const DUCKDB_SQL_RULES = `
📋 DUCKDB SQL RULES:

TIME HANDLING:
- Use $__timeFilter for automatic time range filtering
- For epoch timestamps: to_timestamp(timestamp_field/1000000000) for nanoseconds
- For milliseconds: to_timestamp(timestamp_field/1000)
- DATE_TRUNC for time grouping: DATE_TRUNC('hour', timestamp_column)

COMMON PATTERNS:
1. Time series aggregation:
   SELECT DATE_TRUNC('minute', time) as time, AVG(value) as avg_value
   FROM metrics
   WHERE $__timeFilter
   GROUP BY 1
   ORDER BY 1

2. Top N analysis:
   SELECT category, COUNT(*) as count
   FROM events
   WHERE $__timeFilter
   GROUP BY category
   ORDER BY count DESC
   LIMIT 10

3. Percentile calculations:
   SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time) as p95
   FROM requests
   WHERE $__timeFilter

AVOID:
- MySQL/PostgreSQL specific functions
- Complex joins without proper indexes
- Subqueries in WHERE clauses when possible
`;

/**
 * Build complete AI context from session context
 */
export function buildAIContext(context: ChatContext): string {
  let aiContext = BASE_AI_INSTRUCTIONS;
  
  // Add database context
  if (context.databases.selected.length > 0) {
    aiContext += '\n\n📊 DATABASE CONTEXT:\n';
    aiContext += `Selected Databases: ${context.databases.selected.join(', ')}\n`;
    
    // Add table information
    for (const db of context.databases.selected) {
      const tableConfig = context.tables[db];
      
      if (tableConfig?.includeAll) {
        // If includeAll is true, include all tables from schemas
        const allTables = context.schemas?.[db] ? Object.keys(context.schemas[db]) : [];
        if (allTables.length > 0) {
          aiContext += `\nDatabase "${db}" tables (ALL ${allTables.length} tables): ${allTables.join(', ')}\n`;
          
          // Add schema information for all tables
          if (context.schemas?.[db]) {
            for (const table of allTables) {
              const schema = context.schemas[db][table];
              if (schema && schema.length > 0) {
                aiContext += `\nTable ${db}.${table} schema:\n`;
                aiContext += formatTableSchema(schema);
              }
            }
          }
        }
      } else {
        // Only include selected tables
        const tables = tableConfig?.selected || [];
        if (tables.length > 0) {
          aiContext += `\nDatabase "${db}" tables: ${tables.join(', ')}\n`;
          
          // Add schema information if available
          if (context.schemas?.[db]) {
            for (const table of tables) {
              const schema = context.schemas[db][table];
              if (schema && schema.length > 0) {
                aiContext += `\nTable ${db}.${table} schema:\n`;
                aiContext += formatTableSchema(schema);
              }
            }
          }
        }
      }
    }
  }
  
  // Add user instructions
  const activeInstructions = context.instructions.user.filter(
    (_, idx) => context.instructions.active[idx]
  );
  
  if (activeInstructions.length > 0) {
    aiContext += '\n\n🔧 CUSTOM INSTRUCTIONS:\n';
    activeInstructions.forEach((instruction, idx) => {
      aiContext += `${idx + 1}. ${instruction}\n`;
    });
  }
  
  // Add SQL rules
  aiContext += '\n' + DUCKDB_SQL_RULES;
  
  // Add field suggestions based on schema
  aiContext += generateFieldSuggestions(context);
  
  return aiContext;
}

/**
 * Format table schema for AI context
 */
function formatTableSchema(schema: ColumnSchema[]): string {
  let formatted = '';
  
  // Group fields by type
  const timeFields: string[] = [];
  const numericFields: string[] = [];
  const stringFields: string[] = [];
  
  schema.forEach((col) => {
    const colType = col.column_type.toLowerCase();
    const colName = col.column_name;
    
    formatted += `  - ${colName}: ${col.column_type}`;
    if (col.key === 'PRI') formatted += ' (PRIMARY KEY)';
    if (col.null === 'NO') formatted += ' NOT NULL';
    formatted += '\n';
    
    // Categorize fields
    if (colType.includes('timestamp') || colType.includes('date') || colName.includes('time')) {
      timeFields.push(colName);
    } else if (colType.includes('int') || colType.includes('float') || colType.includes('double') || colType.includes('decimal')) {
      numericFields.push(colName);
    } else {
      stringFields.push(colName);
    }
  });
  
  return formatted;
}

/**
 * Generate field suggestions based on schema
 */
function generateFieldSuggestions(context: ChatContext): string {
  let suggestions = '\n\n💡 FIELD SUGGESTIONS:\n';
  
  const allTimeFields: string[] = [];
  const allNumericFields: string[] = [];
  const allStringFields: string[] = [];
  
  // Collect all fields from all tables
  for (const db of context.databases.selected) {
    if (context.schemas?.[db]) {
      const tableConfig = context.tables[db];
      
      // Determine which tables to include
      let tablesToInclude: string[] = [];
      if (tableConfig?.includeAll) {
        // Include all tables
        tablesToInclude = Object.keys(context.schemas[db]);
      } else if (tableConfig?.selected) {
        // Include only selected tables
        tablesToInclude = tableConfig.selected.filter(table => context.schemas[db][table]);
      }
      
      for (const table of tablesToInclude) {
        const schema = context.schemas[db][table];
        if (schema) {
          schema.forEach((col) => {
            const colType = col.column_type.toLowerCase();
            const colName = col.column_name;
            const fullName = `${table}.${colName}`;
            
            if (colType.includes('timestamp') || colType.includes('date') || colName.includes('time')) {
              allTimeFields.push(fullName);
            } else if (colType.includes('int') || colType.includes('float') || colType.includes('double') || colType.includes('decimal')) {
              allNumericFields.push(fullName);
            } else {
              allStringFields.push(fullName);
            }
          });
        }
      }
    }
  }
  
  if (allTimeFields.length > 0) {
    suggestions += `Time fields (use for time-based charts and $__timeFilter):\n`;
    suggestions += `  ${allTimeFields.join(', ')}\n\n`;
  }
  
  if (allNumericFields.length > 0) {
    suggestions += `Numeric fields (use for metrics, aggregations like SUM/AVG/COUNT):\n`;
    suggestions += `  ${allNumericFields.join(', ')}\n\n`;
  }
  
  if (allStringFields.length > 0) {
    suggestions += `String fields (use for grouping, filtering, categories):\n`;
    suggestions += `  ${allStringFields.join(', ')}\n\n`;
  }
  
  return suggestions;
}

/**
 * Extract artifacts from AI response
 */
export function extractArtifacts(content: string): {
  charts: any[];
  queries: any[];
} {
  const charts: any[] = [];
  const queries: any[] = [];
  
  // Extract chart artifacts
  const chartMatches = content.matchAll(/```chart\n([\s\S]*?)```/g);
  for (const match of chartMatches) {
    try {
      const artifact = JSON.parse(match[1]);
      if (artifact.type && artifact.query) {
        charts.push({
          id: `chart_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          type: 'chart',
          title: artifact.title,
          data: artifact
        });
      }
    } catch (error) {
      console.error('Failed to parse chart artifact:', error);
    }
  }
  
  // Extract query artifacts
  const queryMatches = content.matchAll(/```query\n([\s\S]*?)```/g);
  for (const match of queryMatches) {
    try {
      const artifact = JSON.parse(match[1]);
      if (artifact.query) {
        queries.push({
          id: `query_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          type: 'query',
          title: artifact.title || 'SQL Query',
          data: artifact
        });
      }
    } catch (error) {
      console.error('Failed to parse query artifact:', error);
    }
  }
  
  return { charts, queries };
}

/**
 * Enhance message content with extracted artifacts
 */
export function processAIResponse(content: string): {
  content: string;
  artifacts: any[];
} {
  const { charts, queries } = extractArtifacts(content);
  const artifacts = [...charts, ...queries];
  
  // Remove artifact blocks from content for cleaner display
  let cleanContent = content;
  cleanContent = cleanContent.replace(/```chart\n[\s\S]*?```/g, '');
  cleanContent = cleanContent.replace(/```query\n[\s\S]*?```/g, '');
  cleanContent = cleanContent.trim();
  
  return {
    content: cleanContent,
    artifacts
  };
}