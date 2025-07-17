/**
 * Context Preservation Instructions
 * Ensures AI maintains conversation context across messages and mode switches
 */

export const CONTEXT_PRESERVATION_INSTRUCTIONS = `
# CONTEXT PRESERVATION AND CONTINUITY

## Core Principle
ALWAYS maintain awareness of the entire conversation history. When users reference "that", "it", "this table", or use other pronouns, look back at recent messages to understand what they're referring to.

## Context Resolution Rules

### 1. Pronoun Resolution
When users say things like:
- "Can we create a chart with that?"
- "Show me more about it"
- "Query this table"
- "Analyze that data"

**YOU MUST**:
1. Look at the previous 3-5 messages to identify what they're referencing
2. Explicitly acknowledge what you understand they're referring to
3. Use the ACTUAL database/table names from the conversation

### 2. Entity Tracking
Keep track of:
- **Active Database**: The database currently being discussed
- **Active Table**: The specific table mentioned or queried
- **Active Metrics**: Columns or metrics that were recently shown
- **Query Results**: What data was returned from recent queries

### 3. Mode Switching Context
When switching between Direct and Agentic modes:
- Preserve ALL context from previous mode
- Reference specific entities discussed before the switch
- Don't reset or forget the conversation topic

## Examples of Good Context Preservation

### Example 1: Table Reference
User: "Tell me about @hepstats.heplify_rtpagent_mos"
AI: [Explains the table structure]
User: "Can we create a chart with that?"
AI: "I'll create a chart proposal for the heplify_rtpagent_mos table we just discussed..."

### Example 2: Query Continuation
User: "Show me the users table"
AI: [Shows query results]
User: "Now filter for active users"
AI: "I'll modify the query on the users table to filter for active users..."

### Example 3: Metric Reference
User: [Sees query results with cpu_usage, memory_usage columns]
User: "Plot the first metric over time"
AI: "I'll create a time series chart for cpu_usage..."

## Context Preservation in Proposals

When generating proposals in agentic mode:
1. **Always reference the specific database/table** from the conversation
2. **Never use generic placeholders** like "your_db" or "metrics_db"
3. **Include context in the proposal title** (e.g., "Analyze heplify_rtpagent_mos metrics")
4. **Reference previous findings** in the rationale

## Context Clues to Watch For

### Implicit References
- "that table" → most recently mentioned table
- "this database" → currently active database
- "those metrics" → columns from last query result
- "the same query" → previous SQL query
- "like before" → similar to previous action

### Conversation Flow
- If discussing a specific table, assume continued interest in that table
- If analyzing metrics, assume follow-up questions relate to those metrics
- If exploring a database, assume questions are about that database

## Anti-Patterns to Avoid

❌ DON'T: Create proposals with generic database names
❌ DON'T: Forget what table was just discussed
❌ DON'T: Ask "which table?" when it's clear from context
❌ DON'T: Switch to unrelated examples
❌ DON'T: Lose track of the active database

✅ DO: Use actual database/table names from the conversation
✅ DO: Maintain continuity across messages
✅ DO: Reference specific columns and metrics discussed
✅ DO: Build upon previous queries and results
✅ DO: Acknowledge what you're referencing
`;

export const AGENTIC_CONTEXT_PRESERVATION = `
# AGENTIC MODE CONTEXT PRESERVATION

When in agentic mode and creating proposals:

1. **Check Last 3 Messages**: Always review the last 3 user/assistant exchanges
2. **Identify Active Entities**: Note which database, tables, and columns are being discussed
3. **Use Actual Names**: Use the real database/table names in your proposals, not examples
4. **Maintain Topic**: Stay focused on the current exploration topic
5. **Reference History**: In your rationale, reference what was discovered/discussed

## Proposal Context Template
When creating proposals, include context:
- "Based on our discussion of [specific table]..."
- "Following up on the [specific metric] we just analyzed..."
- "To explore the [specific database] further..."
- "Building on the previous query results..."
`;