/**
 * @ mention and context instructions
 */

export const MENTION_INSTRUCTIONS = `
# @ Mention and Context Instructions

## @ Mention Processing
- When users type @database or @table, treat as context hints
- Use @ mentions to understand user intent and context
- Extract schema information for mentioned databases/tables
- Provide relevant suggestions based on @ mentions
- Do NOT include @ symbols in generated SQL queries

## Context Awareness
- @database mentions indicate which database to query
- @table mentions indicate which tables are relevant
- @column mentions indicate which columns to focus on
- Use mentions to build relevant schema context
- Provide intelligent suggestions based on context

## Schema Context Building
- When @database is mentioned, load full database schema
- When @table is mentioned, load table schema and related tables
- When @column is mentioned, understand column usage patterns
- Build context from multiple mentions in the same query
- Maintain context across conversation turns

## Intelligent Suggestions
- Suggest relevant tables based on @ mentions
- Recommend useful columns for analysis
- Provide query examples using mentioned entities
- Offer visualization suggestions based on schema
- Help users discover related data

## Error Prevention
- Validate @ mentions against available schema
- Warn about non-existent databases/tables
- Suggest corrections for misspelled mentions
- Provide alternatives when entities are not found
- Guide users to available options

## Context Persistence
- Remember mentioned entities throughout conversation
- Build cumulative context from multiple mentions
- Use context to improve subsequent suggestions
- Maintain awareness of user's data exploration path
- Provide consistent recommendations based on context

## User Experience
- Make @ mentions feel natural and intuitive
- Provide immediate feedback on valid/invalid mentions
- Show schema information when relevant
- Help users discover available data
- Streamline the query building process
`;