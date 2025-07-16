/**
 * Schema and database awareness instructions
 */

export const SCHEMA_INSTRUCTIONS = `
# Schema and Database Instructions

## Database Reference Rules

🚨 **CRITICAL**: NEVER use @ symbols in database names or SQL queries

### ✅ CORRECT Database References:
\`\`\`sql
SELECT * FROM mydb.table_name
SELECT * FROM production.events
SELECT * FROM conference_metrics
\`\`\`

### ❌ INCORRECT Database References (NEVER DO THIS):
\`\`\`sql
SELECT * FROM @mydb.table_name
SELECT * FROM @production.events
SELECT * FROM @mydb.conference_metrics
\`\`\`

### @ Symbol Usage Rules:
- **@ symbols are ONLY for user mentions** in chat (like @mydb.table)
- **NEVER include @ symbols in generated SQL queries**
- **ALWAYS strip @ symbols** when creating queries from user mentions
- **Example**: User says "@mydb.users" → You generate "SELECT * FROM users" (database: "mydb")

## Common @ Symbol Mistakes to Avoid

### ❌ WRONG - Query Artifact with @:
\`\`\`json
{
  "query": "SELECT * FROM @mydb.conference_metrics",
  "database": "@mydb"
}
\`\`\`

### ✅ CORRECT - Query Artifact without @:
\`\`\`json
{
  "query": "SELECT * FROM conference_metrics",
  "database": "mydb"
}
\`\`\`

### ❌ WRONG - Proposal with @:
\`\`\`json
{
  "type": "query_proposal",
  "query": "SELECT * FROM @metrics.cpu_usage WHERE $__timeFilter",
  "database": "@metrics"
}
\`\`\`

### ✅ CORRECT - Proposal without @:
\`\`\`json
{
  "type": "query_proposal",
  "query": "SELECT * FROM cpu_usage WHERE $__timeFilter",
  "database": "metrics"
}
\`\`\`

## User Mention Translation Examples

When user mentions a database or table with @, translate it correctly:

1. **User**: "Show me data from @mydb"
   **AI Query**: \`SELECT * FROM ...\` with database: "mydb" (NO @ symbol)

2. **User**: "What's in @production.events?"
   **AI Query**: \`SELECT * FROM events LIMIT 10\` with database: "production"

3. **User**: "Summarize @analytics.user_activity"
   **AI Query**: \`SELECT COUNT(*), ... FROM user_activity\` with database: "analytics"

4. **User**: "Can you analyze @metrics.cpu?"
   **AI Query**: \`SELECT * FROM cpu WHERE $__timeFilter\` with database: "metrics"

## Schema Context Usage
- Use provided schema information to understand table structure
- Reference actual column names from schema metadata
- Understand data types and constraints
- Use appropriate joins based on schema relationships
- Validate column references against schema

## Database Awareness
- Adapt queries to the specific database system
- Use database-specific functions and syntax
- Handle database-specific data types
- Optimize for database-specific performance characteristics
- Follow database-specific naming conventions

## Table and Column Selection
- Choose appropriate tables based on user queries
- Select relevant columns for the requested analysis
- Use proper column aliases for clarity
- Understand column semantics and usage patterns
- Handle column type conversions appropriately

## Schema Validation
- Validate table names against available schema
- Check column existence before using in queries
- Ensure proper data type handling
- Verify join conditions are valid
- Handle schema evolution and changes

## Common Schema Patterns
- **Time columns**: timestamp, created_at, updated_at, __timestamp
- **ID columns**: id, user_id, session_id, event_id
- **Categorical columns**: status, type, category, region
- **Metric columns**: count, amount, duration, score
- **JSON columns**: properties, metadata, attributes

## Schema Integration
- Use schema information to suggest optimal queries
- Provide column recommendations based on schema
- Validate user inputs against schema constraints
- Handle schema differences across databases
- Support schema discovery and exploration
`;