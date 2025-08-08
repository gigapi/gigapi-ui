/**
 * SQL Autocomplete utilities for Monaco Editor
 * Provides context-aware SQL suggestions including keywords, functions, and schema objects
 */

import type { TableSchema } from "@/types";

// SQL Keywords grouped by category
const SQL_KEYWORDS = {
  // DDL Keywords
  ddl: [
    "CREATE", "ALTER", "DROP", "TRUNCATE", "RENAME", "COMMENT"
  ],
  
  // DML Keywords
  dml: [
    "SELECT", "INSERT", "UPDATE", "DELETE", "MERGE", "UPSERT"
  ],
  
  // Query clauses
  clauses: [
    "FROM", "WHERE", "GROUP BY", "HAVING", "ORDER BY", "LIMIT", 
    "OFFSET", "UNION", "UNION ALL", "EXCEPT", "INTERSECT"
  ],
  
  // Join types
  joins: [
    "JOIN", "INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "FULL JOIN", 
    "CROSS JOIN", "LEFT OUTER JOIN", "RIGHT OUTER JOIN", "FULL OUTER JOIN"
  ],
  
  // Conditional keywords
  conditionals: [
    "AND", "OR", "NOT", "IN", "EXISTS", "BETWEEN", "LIKE", "ILIKE",
    "IS", "IS NOT", "IS NULL", "IS NOT NULL", "AS"
  ],
  
  // Other keywords
  other: [
    "DISTINCT", "ALL", "ANY", "SOME", "CASE", "WHEN", "THEN", "ELSE", 
    "END", "CAST", "WITH", "RECURSIVE", "VALUES", "DEFAULT", "NULL"
  ]
};

// Common SQL Functions grouped by category
const SQL_FUNCTIONS = {
  // Aggregate functions
  aggregate: [
    { name: "COUNT", signature: "COUNT(*)", detail: "Count rows" },
    { name: "COUNT", signature: "COUNT(column)", detail: "Count non-null values" },
    { name: "SUM", signature: "SUM(column)", detail: "Sum of values" },
    { name: "AVG", signature: "AVG(column)", detail: "Average value" },
    { name: "MIN", signature: "MIN(column)", detail: "Minimum value" },
    { name: "MAX", signature: "MAX(column)", detail: "Maximum value" },
    { name: "GROUP_CONCAT", signature: "GROUP_CONCAT(column)", detail: "Concatenate values" },
    { name: "STRING_AGG", signature: "STRING_AGG(column, delimiter)", detail: "Aggregate strings" }
  ],
  
  // String functions
  string: [
    { name: "CONCAT", signature: "CONCAT(str1, str2, ...)", detail: "Concatenate strings" },
    { name: "LENGTH", signature: "LENGTH(string)", detail: "String length" },
    { name: "LOWER", signature: "LOWER(string)", detail: "Convert to lowercase" },
    { name: "UPPER", signature: "UPPER(string)", detail: "Convert to uppercase" },
    { name: "TRIM", signature: "TRIM(string)", detail: "Remove leading/trailing spaces" },
    { name: "SUBSTRING", signature: "SUBSTRING(string, start, length)", detail: "Extract substring" },
    { name: "REPLACE", signature: "REPLACE(string, old, new)", detail: "Replace substring" },
    { name: "SPLIT", signature: "SPLIT(string, delimiter)", detail: "Split string" }
  ],
  
  // Date/Time functions
  datetime: [
    { name: "NOW", signature: "NOW()", detail: "Current timestamp" },
    { name: "CURRENT_DATE", signature: "CURRENT_DATE", detail: "Current date" },
    { name: "CURRENT_TIME", signature: "CURRENT_TIME", detail: "Current time" },
    { name: "DATE", signature: "DATE(timestamp)", detail: "Extract date" },
    { name: "EXTRACT", signature: "EXTRACT(part FROM date)", detail: "Extract date part" },
    { name: "DATE_ADD", signature: "DATE_ADD(date, INTERVAL value unit)", detail: "Add to date" },
    { name: "DATE_SUB", signature: "DATE_SUB(date, INTERVAL value unit)", detail: "Subtract from date" },
    { name: "DATEDIFF", signature: "DATEDIFF(date1, date2)", detail: "Difference in days" },
    { name: "DATE_FORMAT", signature: "DATE_FORMAT(date, format)", detail: "Format date" },
    { name: "STRFTIME", signature: "STRFTIME(format, timestamp)", detail: "Format timestamp" }
  ],
  
  // Math functions
  math: [
    { name: "ABS", signature: "ABS(number)", detail: "Absolute value" },
    { name: "ROUND", signature: "ROUND(number, decimals)", detail: "Round number" },
    { name: "CEIL", signature: "CEIL(number)", detail: "Round up" },
    { name: "FLOOR", signature: "FLOOR(number)", detail: "Round down" },
    { name: "POWER", signature: "POWER(base, exponent)", detail: "Raise to power" },
    { name: "SQRT", signature: "SQRT(number)", detail: "Square root" },
    { name: "MOD", signature: "MOD(n, m)", detail: "Modulo" }
  ],
  
  // Type conversion
  conversion: [
    { name: "CAST", signature: "CAST(expression AS type)", detail: "Type conversion" },
    { name: "CONVERT", signature: "CONVERT(expression, type)", detail: "Type conversion" },
    { name: "TO_CHAR", signature: "TO_CHAR(value)", detail: "Convert to string" },
    { name: "TO_NUMBER", signature: "TO_NUMBER(string)", detail: "Convert to number" },
    { name: "TO_DATE", signature: "TO_DATE(string, format)", detail: "Convert to date" }
  ]
};

// SQL Operators
const SQL_OPERATORS = [
  "=", "!=", "<>", "<", ">", "<=", ">=", 
  "+", "-", "*", "/", "%", "||"
];

// Context types for autocomplete
export const SqlContext = {
  SELECT_CLAUSE: "select",
  FROM_CLAUSE: "from", 
  WHERE_CLAUSE: "where",
  GROUP_BY_CLAUSE: "groupby",
  ORDER_BY_CLAUSE: "orderby",
  JOIN_CLAUSE: "join",
  FUNCTION_ARGS: "function",
  COLUMN_LIST: "columns",
  TABLE_LIST: "tables",
  GENERAL: "general"
} as const;

export type SqlContext = typeof SqlContext[keyof typeof SqlContext];

/**
 * Analyze SQL query context at cursor position
 */
export function analyzeQueryContext(
  _query: string, 
  position: { lineNumber: number; column: number },
  lines: string[]
): SqlContext {
  // Get text before cursor
  const textBeforeCursor = lines
    .slice(0, position.lineNumber)
    .join(' ')
    .substring(0, position.column)
    .toLowerCase();
    
  // Check for various SQL contexts
  if (/select\s+[^(]*$/i.test(textBeforeCursor) && !/(from|where|group|order)/i.test(textBeforeCursor)) {
    return SqlContext.SELECT_CLAUSE;
  }
  
  if (/from\s+[^(]*$/i.test(textBeforeCursor) && !/(where|group|order)/i.test(textBeforeCursor)) {
    return SqlContext.FROM_CLAUSE;
  }
  
  if (/where\s+[^(]*$/i.test(textBeforeCursor) && !/(group|order)/i.test(textBeforeCursor)) {
    return SqlContext.WHERE_CLAUSE;
  }
  
  if (/group\s+by\s+[^(]*$/i.test(textBeforeCursor)) {
    return SqlContext.GROUP_BY_CLAUSE;
  }
  
  if (/order\s+by\s+[^(]*$/i.test(textBeforeCursor)) {
    return SqlContext.ORDER_BY_CLAUSE;
  }
  
  if (/join\s+[^(]*$/i.test(textBeforeCursor)) {
    return SqlContext.JOIN_CLAUSE;
  }
  
  // Check if we're inside function arguments
  const openParens = (textBeforeCursor.match(/\(/g) || []).length;
  const closeParens = (textBeforeCursor.match(/\)/g) || []).length;
  if (openParens > closeParens && /\w+\s*\([^)]*$/i.test(textBeforeCursor)) {
    return SqlContext.FUNCTION_ARGS;
  }
  
  return SqlContext.GENERAL;
}

/**
 * Get word at cursor position
 */
export function getWordAtPosition(
  lines: string[],
  position: { lineNumber: number; column: number }
): string {
  const line = lines[position.lineNumber - 1] || "";
  let start = position.column - 1;
  let end = position.column - 1;
  
  // Find word boundaries
  while (start > 0 && /[a-zA-Z0-9_$]/.test(line[start - 1])) {
    start--;
  }
  
  while (end < line.length && /[a-zA-Z0-9_$]/.test(line[end])) {
    end++;
  }
  
  return line.substring(start, end);
}

/**
 * Get table aliases from query
 */
export function extractTableAliases(query: string): Map<string, string> {
  const aliases = new Map<string, string>();
  
  // Match patterns like "table_name AS alias" or "table_name alias"
  const aliasPattern = /(\w+)\s+(?:as\s+)?(\w+)(?:\s|,|$)/gi;
  const fromMatch = query.match(/from\s+([^where|group|order|limit]+)/i);
  
  if (fromMatch) {
    const fromClause = fromMatch[1];
    let match;
    
    while ((match = aliasPattern.exec(fromClause)) !== null) {
      const [, tableName, alias] = match;
      // Skip SQL keywords
      if (!SQL_KEYWORDS.clauses.includes(alias.toUpperCase())) {
        aliases.set(alias, tableName);
      }
    }
  }
  
  return aliases;
}

/**
 * Filter suggestions based on current input
 */
function filterSuggestions(
  suggestions: any[],
  currentWord: string
): any[] {
  if (!currentWord) return suggestions;
  
  const lowerWord = currentWord.toLowerCase();
  return suggestions.filter(suggestion => 
    suggestion.label.toLowerCase().startsWith(lowerWord)
  );
}

/**
 * Create suggestion item for Monaco
 */
function createSuggestion(
  monaco: any,
  label: string,
  kind: any,
  detail: string,
  insertText: string,
  documentation?: string,
  sortText?: string
): any {
  return {
    label,
    kind,
    detail,
    insertText,
    documentation,
    sortText: sortText || label,
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
  };
}

/**
 * Get context-aware suggestions
 */
export function getContextualSuggestions(
  monaco: any,
  context: SqlContext,
  schema: TableSchema[],
  currentWord: string,
  tableAliases: Map<string, string>
): any[] {
  const suggestions: any[] = [];
  
  switch (context) {
    case SqlContext.SELECT_CLAUSE:
      // Add column suggestions and aggregate functions
      suggestions.push(...getColumnSuggestions(monaco, schema, tableAliases));
      suggestions.push(...getFunctionSuggestions(monaco, SQL_FUNCTIONS.aggregate));
      break;
      
    case SqlContext.FROM_CLAUSE:
    case SqlContext.JOIN_CLAUSE:
      // Add table suggestions
      suggestions.push(...getTableSuggestions(monaco, schema));
      break;
      
    case SqlContext.WHERE_CLAUSE:
      // Add columns, operators, and comparison functions
      suggestions.push(...getColumnSuggestions(monaco, schema, tableAliases));
      suggestions.push(...getOperatorSuggestions(monaco));
      break;
      
    case SqlContext.GROUP_BY_CLAUSE:
    case SqlContext.ORDER_BY_CLAUSE:
      // Add column suggestions
      suggestions.push(...getColumnSuggestions(monaco, schema, tableAliases));
      break;
      
    case SqlContext.GENERAL:
    default:
      // Add all keywords and common functions
      suggestions.push(...getKeywordSuggestions(monaco));
      suggestions.push(...getAllFunctionSuggestions(monaco));
      break;
  }
  
  return filterSuggestions(suggestions, currentWord);
}

/**
 * Get column suggestions
 */
function getColumnSuggestions(
  monaco: any,
  schema: TableSchema[],
  tableAliases: Map<string, string>
): any[] {
  const suggestions: any[] = [];
  
  schema.forEach(table => {
    table.columns.forEach(column => {
      // Add plain column name
      suggestions.push(createSuggestion(
        monaco,
        column.columnName,
        monaco.languages.CompletionItemKind.Field,
        `${table.tableName}.${column.columnName} (${column.dataType || 'unknown'})`,
        column.columnName,
        `Column from ${table.tableName}`,
        `1_${column.columnName}` // Sort columns first
      ));
      
      // Add qualified column name (table.column)
      suggestions.push(createSuggestion(
        monaco,
        `${table.tableName}.${column.columnName}`,
        monaco.languages.CompletionItemKind.Field,
        column.dataType || 'unknown',
        `${table.tableName}.${column.columnName}`,
        `Qualified column reference`,
        `2_${table.tableName}.${column.columnName}`
      ));
      
      // Add alias.column if table has alias
      tableAliases.forEach((tableName, alias) => {
        if (tableName === table.tableName) {
          suggestions.push(createSuggestion(
            monaco,
            `${alias}.${column.columnName}`,
            monaco.languages.CompletionItemKind.Field,
            `${column.dataType || 'unknown'} (via alias ${alias})`,
            `${alias}.${column.columnName}`,
            `Column via table alias`,
            `2_${alias}.${column.columnName}`
          ));
        }
      });
    });
  });
  
  return suggestions;
}

/**
 * Get table suggestions
 */
function getTableSuggestions(monaco: any, schema: TableSchema[]): any[] {
  return schema.map(table => createSuggestion(
    monaco,
    table.tableName,
    monaco.languages.CompletionItemKind.Class,
    `Table (${table.columns.length} columns)`,
    table.tableName,
    `Columns: ${table.columns.slice(0, 5).map(c => c.columnName).join(', ')}${table.columns.length > 5 ? '...' : ''}`,
    `0_${table.tableName}` // Sort tables first
  ));
}

/**
 * Get keyword suggestions
 */
function getKeywordSuggestions(monaco: any): any[] {
  const suggestions: any[] = [];
  
  Object.entries(SQL_KEYWORDS).forEach(([category, keywords]) => {
    keywords.forEach(keyword => {
      suggestions.push(createSuggestion(
        monaco,
        keyword,
        monaco.languages.CompletionItemKind.Keyword,
        `SQL ${category} keyword`,
        keyword,
        undefined,
        `3_${keyword}` // Sort keywords after tables/columns
      ));
    });
  });
  
  return suggestions;
}

/**
 * Get function suggestions
 */
function getFunctionSuggestions(monaco: any, functions: any[]): any[] {
  return functions.map(func => createSuggestion(
    monaco,
    func.name,
    monaco.languages.CompletionItemKind.Function,
    func.detail,
    func.signature,
    `Usage: ${func.signature}`,
    `4_${func.name}` // Sort functions after keywords
  ));
}

/**
 * Get all function suggestions
 */
function getAllFunctionSuggestions(monaco: any): any[] {
  const suggestions: any[] = [];
  
  Object.values(SQL_FUNCTIONS).forEach(functionGroup => {
    suggestions.push(...getFunctionSuggestions(monaco, functionGroup));
  });
  
  return suggestions;
}

/**
 * Get operator suggestions
 */
function getOperatorSuggestions(monaco: any): any[] {
  return SQL_OPERATORS.map(op => createSuggestion(
    monaco,
    op,
    monaco.languages.CompletionItemKind.Operator,
    'SQL operator',
    op,
    undefined,
    `5_${op}` // Sort operators last
  ));
}