import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useQuery } from "../contexts/QueryContext";
import Editor, { type OnChange } from "@monaco-editor/react";
import { Button } from "./ui/button";
import {
  Play,
  Copy,
  Wand,
  HelpCircle,
  Clock,
  ListFilter,
  ArrowDownUp,
  BarChart4,
  Database,
  Eraser,
} from "lucide-react";
import { useTheme } from "./theme-provider";
import { Skeleton } from "./ui/skeleton";
import { toast } from "sonner";
import * as monaco from "monaco-editor";
import Loader from "./Loader";
import TimeRangeSelector from "./TimeRangeSelector";
import TableSelector from "./TableSelector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { extractTableName } from "@/lib/time-range-utils";
import { Badge } from "./ui/badge";

export default function QueryEditor() {
  const {
    query,
    setQuery,
    executeQuery,
    isLoading,
    selectedDb,
    selectedTable,
    schema,
    isLoadingSchema,
    timeRange,
    setTimeRange,
    timeFields,
    selectedTimeField,
    setSelectedTimeField,
    queryBuilderEnabled,
    setQueryBuilderEnabled,
  } = useQuery();

  const { theme } = useTheme();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [detectedTableName, setDetectedTableName] = useState<
    string | undefined
  >(undefined);
  const [hasVariablesInQuery, setHasVariablesInQuery] = useState(false);

  // Use refs instead of state for disposables to avoid re-render cycles
  const completionDisposableRef = useRef<monaco.IDisposable | null>(null);
  const keyboardDisposableRef = useRef<monaco.IDisposable | null>(null);

  // Copy query to clipboard
  const copyQuery = () => {
    if (!editorRef.current) return;
    const currentQuery = editorRef.current.getValue();
    if (!currentQuery.trim()) return;

    navigator.clipboard
      .writeText(currentQuery)
      .then(() => toast.success("Query copied to clipboard"))
      .catch(() => toast.error("Failed to copy query"));
  };

  // Handle execution with validation
  const handleExecuteQuery = useCallback(() => {
    if (!selectedDb) {
      toast.error("Please select a database first");
      return;
    }
    executeQuery();
  }, [selectedDb, executeQuery]);

  // Get the time field options for the current database and table
  const timeFieldOptions = useMemo(() => {
    if (!selectedDb || !schema || !schema[selectedDb]) return [];

    // If we have a selected table, filter time fields for that table
    if (selectedTable) {
      const tableSchema = schema[selectedDb].find(
        (t) => t.tableName === selectedTable
      );
      if (tableSchema && tableSchema.columns) {
        const fields: string[] = [];

        tableSchema.columns.forEach((column) => {
          const colName = column.columnName?.toLowerCase() || "";
          const dataType = column.dataType?.toLowerCase() || "";

          // Check if it's a time field
          if (
            colName === "__timestamp" ||
            colName === "time" ||
            colName === "timestamp" ||
            colName === "date" ||
            colName === "time_sec" ||
            colName === "time_usec" ||
            colName === "created_at" ||
            colName === "updated_at" ||
            colName === "create_date" ||
            colName.includes("date") ||
            colName.includes("time") ||
            dataType.includes("timestamp") ||
            dataType.includes("datetime") ||
            dataType.includes("date") ||
            dataType.includes("time")
          ) {
            fields.push(column.columnName);
          }
        });

        return fields;
      }
    }

    // Return all time fields if no table is selected
    return timeFields;
  }, [selectedDb, selectedTable, schema, timeFields]);

  // Detect table name from query
  useEffect(() => {
    if (query) {
      const tableName = extractTableName(query);
      setDetectedTableName(tableName || undefined);
    } else {
      setDetectedTableName(undefined);
    }
  }, [query]);

  // Handle time field selection
  const handleTimeFieldChange = (value: string) => {
    if (value === "_NONE_") {
      setSelectedTimeField(null);

      // When disabling time field, also ensure time range is disabled
      if (timeRange && timeRange.enabled !== false) {
        setTimeRange({
          ...timeRange,
          enabled: false,
        });
      }

      // Remove time filter from query if it exists
      updateEditorQueryWithoutTimeFilter();
    } else {
      setSelectedTimeField(value);

      // When enabling time field, ensure time range is enabled
      if (timeRange && timeRange.enabled === false) {
        setTimeRange({
          ...timeRange,
          enabled: true,
        });
      }

      // Add time filter to query
      updateEditorQueryWithTimeFilter(value);
    }
  };

  // Handle time range changes from TimeRangeSelector
  const handleTimeRangeChange = (newTimeRange: any) => {
    // If the user disables time filtering from the TimeRangeSelector,
    // also clear the selected time field
    if (newTimeRange.enabled === false) {
      setSelectedTimeField(null);
      // Remove time filter from query
      updateEditorQueryWithoutTimeFilter();
    } else if (selectedTimeField) {
      // Update query with new time range
      updateEditorQueryWithTimeFilter(selectedTimeField, newTimeRange);
    }

    setTimeRange(newTimeRange);
  };

  // Update editor query with time filter
  const updateEditorQueryWithTimeFilter = (
    timeField: string,
    customTimeRange = timeRange
  ) => {
    // Check if query builder is enabled
    if (!queryBuilderEnabled) {
      return;
    }

    if (!editorRef.current || !timeField || !selectedTable) return;

    const currentQuery = editorRef.current.getValue();
    if (!currentQuery.trim()) return;

    // Insert time filter variable instead of actual filter
    let newQuery = currentQuery;

    // Check if we need to add the time filter
    const hasTimeFilter = newQuery.includes("$__timeFilter");
    const hasWhereClause = /\bWHERE\b/i.test(newQuery);
    const hasAndClause = /\bAND\b/i.test(newQuery);

    // Use variables approach instead of direct SQL injection
    if (!hasTimeFilter) {
      if (!hasWhereClause) {
        // No WHERE clause and no time variable, add WHERE with variable
        const orderByMatch = /\bORDER BY\b/i.exec(newQuery);
        const groupByMatch = /\bGROUP BY\b/i.exec(newQuery);
        const limitMatch = /\bLIMIT\b/i.exec(newQuery);

        let insertPosition = newQuery.length;
        if (orderByMatch) insertPosition = orderByMatch.index;
        else if (groupByMatch) insertPosition = groupByMatch.index;
        else if (limitMatch) insertPosition = limitMatch.index;

        newQuery =
          newQuery.substring(0, insertPosition) +
          ` WHERE $__timeFilter ` +
          newQuery.substring(insertPosition);
      } else if (!hasAndClause && !/WHERE\s+\$/i.test(newQuery)) {
        // Has WHERE but no AND and not already using a variable
        // Find the position right after WHERE
        const whereMatch = /\bWHERE\b\s+/i.exec(newQuery);
        if (whereMatch) {
          // Add the time filter variable after WHERE
          const insertPosition = whereMatch.index + whereMatch[0].length;
          newQuery =
            newQuery.substring(0, insertPosition) +
            `$__timeFilter AND ` +
            newQuery.substring(insertPosition);
        }
      }
    }

    // Update editor and context
    editorRef.current.setValue(newQuery);
    setQuery(newQuery);
  };

  // Remove time filter from query
  const updateEditorQueryWithoutTimeFilter = (updateEditor = true) => {
    if (!editorRef.current) return "";

    const currentQuery = editorRef.current.getValue();
    if (!currentQuery.trim()) return currentQuery;

    // Instead of removing time filters directly, we will leave any variables in place
    // Only remove the auto-inserted WHERE $__timeFilter if it exists
    let newQuery = currentQuery.replace(/\sWHERE\s+\$__timeFilter\s+/i, " ");

    // Clean up extra spaces
    newQuery = newQuery.replace(/\s{2,}/g, " ");

    if (updateEditor && newQuery !== currentQuery) {
      // Update editor and context only if changed
      editorRef.current.setValue(newQuery);
      setQuery(newQuery);
    }

    return newQuery;
  };

  // Toggle query builder mode
  const handleQueryBuilderToggle = (enabled: boolean) => {
    setQueryBuilderEnabled(enabled);

    // If disabling and we have time filters, remove them from the query
    if (!enabled && selectedTimeField) {
      updateEditorQueryWithoutTimeFilter();
    } else if (enabled && selectedTimeField) {
      // If enabling and we have time filters, add them to the query
      updateEditorQueryWithTimeFilter(selectedTimeField);
    }
  };

  // Real-time sync: update query in editor whenever builder controls change
  useEffect(() => {
    if (!queryBuilderEnabled || !editorRef.current) return;

    // Get current query from editor
    const currentQuery = editorRef.current.getValue();

    // If no table selected, do nothing
    if (!selectedTable || !selectedDb) return;

    // If query is empty or basic, generate new query
    if (
      !currentQuery.trim() ||
      currentQuery.trim().toUpperCase() === "SELECT * FROM" ||
      currentQuery.trim().toUpperCase() === "SELECT"
    ) {
      let newQuery = `SELECT * FROM ${selectedTable}`;
      editorRef.current.setValue(newQuery);
      setQuery(newQuery);
      if (selectedTimeField) {
        setTimeout(
          () => updateEditorQueryWithTimeFilter(selectedTimeField),
          100
        );
      }
      return;
    }

    // If table changed, update FROM clause
    if (!currentQuery.toLowerCase().includes(selectedTable.toLowerCase())) {
      const fromMatch = /\bFROM\s+(\w+)/i.exec(currentQuery);
      if (fromMatch) {
        const oldTable = fromMatch[1];
        if (oldTable.toLowerCase() !== selectedTable.toLowerCase()) {
          let newQuery = currentQuery.replace(
            new RegExp(`\\bFROM\\s+${oldTable}\\b`, "i"),
            `FROM ${selectedTable}`
          );
          editorRef.current.setValue(newQuery);
          setQuery(newQuery);
          return;
        }
      }
    }

    // If time field changed, update/add/remove time filter
    if (selectedTimeField && !currentQuery.includes("$__timeFilter")) {
      updateEditorQueryWithTimeFilter(selectedTimeField);
      return;
    }
    if (!selectedTimeField && currentQuery.includes("$__timeFilter")) {
      updateEditorQueryWithoutTimeFilter();
      return;
    }

    // If time range changes and time filter is present, update query
    if (selectedTimeField && currentQuery.includes("$__timeFilter")) {
      updateEditorQueryWithTimeFilter(selectedTimeField, timeRange);
    }
  }, [
    selectedTable,
    selectedDb,
    selectedTimeField,
    timeRange,
    queryBuilderEnabled,
  ]);

  // Setup keyboard shortcut
  const setupKeyboardShortcut = useCallback(() => {
    if (!editorRef.current || !monacoRef.current) return;

    // Dispose of previous keyboard shortcut
    if (keyboardDisposableRef.current) {
      keyboardDisposableRef.current.dispose();
      keyboardDisposableRef.current = null;
    }

    // Create new shortcut with current selectedDb value
    const disposable = editorRef.current.addCommand(
      monacoRef.current.KeyMod.CtrlCmd | monacoRef.current.KeyCode.Enter,
      () => {
        if (!selectedDb) {
          toast.error("Please select a database first");
          return;
        }
        executeQuery();
      }
    );

    // Only store if it's a valid disposable (not null or string)
    if (disposable && typeof disposable !== "string") {
      keyboardDisposableRef.current = disposable;
    }
  }, [selectedDb, executeQuery]);

  // Set up Monaco intellisense for SQL
  const setupIntellisense = useCallback(() => {
    if (!monacoRef.current || !schema || !selectedDb || !schema[selectedDb])
      return;

    // Dispose of previous completion provider if exists
    if (completionDisposableRef.current) {
      completionDisposableRef.current.dispose();
      completionDisposableRef.current = null;
    }

    const currentDbSchema = schema[selectedDb];
    const monacoInstance = monacoRef.current;

    const disposable = monacoInstance.languages.registerCompletionItemProvider(
      "sql",
      {
        provideCompletionItems: (
          model: monaco.editor.ITextModel,
          position: monaco.Position
        ) => {
          const suggestions: monaco.languages.CompletionItem[] = [];

          // Add time variables as suggestions
          if (queryBuilderEnabled) {
            const timeVariables = [
              {
                label: "$__timeFilter",
                detail: "Time range filter condition",
                documentation:
                  "Expands to a WHERE condition for the selected time field and range",
              },
              {
                label: "$__timeField",
                detail: "Selected time field name",
                documentation: "Expands to the selected time field name",
              },
              {
                label: "$__timeFrom",
                detail: "Start of time range",
                documentation:
                  "Expands to the SQL representation of the start time",
              },
              {
                label: "$__timeTo",
                detail: "End of time range",
                documentation:
                  "Expands to the SQL representation of the end time",
              },
            ];

            timeVariables.forEach((variable) => {
              suggestions.push({
                label: variable.label,
                kind: monacoInstance.languages.CompletionItemKind.Variable,
                detail: variable.detail,
                documentation: variable.documentation,
                insertText: variable.label,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: model.getWordUntilPosition(position).startColumn,
                  endLineNumber: position.lineNumber,
                  endColumn: model.getWordUntilPosition(position).endColumn,
                },
              });
            });
          }

          // SQL Keywords
          const keywords = [
            "SELECT",
            "FROM",
            "WHERE",
            "GROUP BY",
            "ORDER BY",
            "LIMIT",
            "INSERT",
            "UPDATE",
            "DELETE",
            "CREATE",
            "TABLE",
            "DATABASE",
            "SHOW",
            "DESCRIBE",
            "DISTINCT",
            "JOIN",
            "INNER JOIN",
            "LEFT JOIN",
            "RIGHT JOIN",
            "HAVING",
            "COUNT",
            "SUM",
            "AVG",
            "MIN",
            "MAX",
            "AS",
            "CASE",
            "WHEN",
            "THEN",
            "ELSE",
            "END",
            "AND",
            "OR",
            "NOT",
            "IN",
            "LIKE",
            "BETWEEN",
            "IS NULL",
            "IS NOT NULL",
          ];

          keywords.forEach((k) =>
            suggestions.push({
              label: k,
              kind: monacoInstance.languages.CompletionItemKind.Keyword,
              insertText: k,
              range: {
                startLineNumber: position.lineNumber,
                startColumn: model.getWordUntilPosition(position).startColumn,
                endLineNumber: position.lineNumber,
                endColumn: model.getWordUntilPosition(position).endColumn,
              },
            })
          );

          // Tables and columns from schema
          if (currentDbSchema) {
            currentDbSchema.forEach((table) => {
              suggestions.push({
                label: table.tableName,
                kind: monacoInstance.languages.CompletionItemKind.Folder,
                insertText: table.tableName,
                detail: `Table in ${selectedDb}`,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: model.getWordUntilPosition(position).startColumn,
                  endLineNumber: position.lineNumber,
                  endColumn: model.getWordUntilPosition(position).endColumn,
                },
              });

              // Add table columns
              table.columns?.forEach((column) => {
                suggestions.push({
                  label: `${table.tableName}.${column.columnName}`,
                  kind: monacoInstance.languages.CompletionItemKind.Field,
                  insertText: column.columnName,
                  detail: `${column.dataType?.toUpperCase() || "UNKNOWN"} - ${
                    table.tableName
                  }`,
                  range: {
                    startLineNumber: position.lineNumber,
                    startColumn:
                      model.getWordUntilPosition(position).startColumn,
                    endLineNumber: position.lineNumber,
                    endColumn: model.getWordUntilPosition(position).endColumn,
                  },
                });
              });
            });
          }

          return { suggestions };
        },
      }
    );

    // Store the disposable in ref
    completionDisposableRef.current = disposable;
  }, [schema, selectedDb]);

  function handleEditorDidMount(
    editor: monaco.editor.IStandaloneCodeEditor,
    monacoInstance: typeof monaco
  ) {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;
    setIsEditorReady(true);

    // Check if query already contains variables
    const currentQuery = editor.getValue();
    if (currentQuery) {
      const hasVars = /\$__time(Filter|Field|From|To)/i.test(currentQuery);
      setHasVariablesInQuery(hasVars);
    }

    // Just apply the default theme based on light/dark mode
    try {
      editor.updateOptions({
        theme: theme === "dark" ? "vs-dark" : "vs",
      });
    } catch (e) {
      console.error("Failed to set editor theme:", e);
    }

    setTimeout(() => editor.layout(), 0);
  }

  // Update keyboard shortcut when selectedDb changes
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      setupKeyboardShortcut();
    }
  }, [setupKeyboardShortcut, editorRef, monacoRef]);

  // Update intellisense when schema or selectedDb changes
  useEffect(() => {
    if (
      monacoRef.current &&
      selectedDb &&
      schema &&
      schema[selectedDb] &&
      !isLoadingSchema
    ) {
      setupIntellisense();
    }
  }, [setupIntellisense, selectedDb, schema, isLoadingSchema]);

  // Cleanup disposables on unmount
  useEffect(() => {
    return () => {
      if (completionDisposableRef.current) {
        completionDisposableRef.current.dispose();
      }
      if (keyboardDisposableRef.current) {
        keyboardDisposableRef.current.dispose();
      }
    };
  }, []);

  // Determine Monaco theme based on app theme
  const editorTheme = theme === "dark" ? "vs-dark" : "light";

  // Handle editor onChange with type safety
  const handleEditorChange: OnChange = (value) => {
    setQuery(value || "");

    // Check if query contains variables
    if (value) {
      const hasVars = /\$__time(Filter|Field|From|To)/i.test(value);
      setHasVariablesInQuery(hasVars);
    } else {
      setHasVariablesInQuery(false);
    }
  };

  // Listen for changes to query builder enabled state
  useEffect(() => {
    // If query builder is disabled, remove any time filters from the query
    if (!queryBuilderEnabled && editorRef.current) {
      updateEditorQueryWithoutTimeFilter();
    }
  }, [queryBuilderEnabled]);

  // Add a getter for the time field details
  const getTimeFieldDetails = useCallback(
    (fieldName: string) => {
      if (!selectedDb || !schema[selectedDb] || !selectedTable) return null;

      const tableSchema = schema[selectedDb].find(
        (table) => table.tableName === selectedTable
      );
      if (!tableSchema || !tableSchema.columns) return null;

      return (
        tableSchema.columns.find((col) => col.columnName === fieldName) || null
      );
    },
    [selectedDb, schema, selectedTable]
  );

  // Add a new component to render the type badge
  const renderTimeFieldTypeBadge = (fieldName: string) => {
    const fieldDetails = getTimeFieldDetails(fieldName);
    if (!fieldDetails) return null;

    const { dataType, timeUnit } = fieldDetails;
    const displayType = dataType.toUpperCase();
    const displayUnit = timeUnit ? ` (${timeUnit})` : "";

    return (
      <Badge variant="outline" className="ml-1 text-xs font-mono">
        {displayType}
        {displayUnit}
      </Badge>
    );
  };

  // Add this useEffect to auto-select the first time field
  useEffect(() => {
    if (timeFieldOptions.length > 0 && !selectedTimeField) {
      handleTimeFieldChange(timeFieldOptions[0]);
    }
  }, [timeFieldOptions, selectedTimeField]);

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* Grafana-like query header with toolbar */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between bg-card rounded-md border p-2">
          <div className="flex items-center gap-2">
            <Button
              onClick={handleExecuteQuery}
              disabled={isLoading || !selectedDb}
              className="h-8 px-3"
              variant="default"
            >
              {isLoading ? (
                <Loader className="h-4 w-4" />
              ) : (
                <>
                  <Play className="mr-1.5 h-3.5 w-3.5" /> Run Query
                </>
              )}
            </Button>

            <div className="h-5 w-[1px] bg-border mx-1"></div>

            {/* Query Builder Mode Toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={queryBuilderEnabled ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() =>
                      handleQueryBuilderToggle(!queryBuilderEnabled)
                    }
                    className={`h-8 px-3 gap-1.5 ${
                      queryBuilderEnabled ? "bg-primary/10" : ""
                    }`}
                  >
                    <Wand className="h-3.5 w-3.5" />
                    <span>Builder</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">Toggle query builder mode</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Common Query Actions */}
            <div className="flex items-center">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={copyQuery}
                      className="h-8 w-8 p-0"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">Copy query</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        if (editorRef.current) {
                          editorRef.current.setValue("");
                          setQuery("");
                        }
                      }}
                    >
                      <Eraser className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">Clear query</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Query variables help */}
              {queryBuilderEnabled && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <HelpCircle className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      align="start"
                      className="max-w-[400px]"
                    >
                      <div className="text-sm space-y-2">
                        <p className="font-bold">Query Variables:</p>
                        <ul className="space-y-1 list-disc pl-4">
                          <li>
                            <code className="bg-muted px-1 rounded">
                              $__timeFilter
                            </code>{" "}
                            - Complete time filter for the selected field
                          </li>
                          <li>
                            <code className="bg-muted px-1 rounded">
                              $__timeField
                            </code>{" "}
                            - Selected time field name
                          </li>
                          <li>
                            <code className="bg-muted px-1 rounded">
                              $__timeFrom
                            </code>{" "}
                            - Start of the selected time range
                          </li>
                          <li>
                            <code className="bg-muted px-1 rounded">
                              $__timeTo
                            </code>{" "}
                            - End of the selected time range
                          </li>
                        </ul>
                        <p className="text-xs mt-2">
                          Example:
                          <code className="bg-muted px-1 rounded block mt-1">
                            WHERE $__timeFilter
                          </code>
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>

          {/* Right side - Query metadata */}
          <div className="flex items-center gap-3">
            {/* Time filter indicator */}
            {queryBuilderEnabled && hasVariablesInQuery && (
              <Badge variant="outline" className="bg-primary/10 gap-1.5">
                <Clock className="h-3 w-3" />
                <span>Time filtered</span>
              </Badge>
            )}

            {/* Current table indicator */}
            {selectedTable && (
              <Badge variant="outline" className="bg-card gap-1.5">
                <Database className="h-3 w-3" />
                <span>{selectedTable}</span>
              </Badge>
            )}
          </div>
        </div>

        {/* Query Builder Panel - Grafana style */}
        {queryBuilderEnabled && selectedDb && (
          <div className="flex flex-wrap items-center gap-2 bg-muted/40 rounded-md border p-2">
            {/* Table Selector - First element */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">FROM</span>
              <TableSelector />
            </div>

            {/* Time controls - Show when table is selected */}
            {selectedTable && (
              <>
                {/* Time Field Selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">TIME BY</span>
                  <Select
                    value={selectedTimeField || ""}
                    onValueChange={handleTimeFieldChange}
                  >
                    <SelectTrigger className="h-8 w-[180px] text-xs">
                      <SelectValue placeholder="Select time field">
                        <div className="flex items-center">
                          {selectedTimeField || "Select time field"}
                          {selectedTimeField &&
                            renderTimeFieldTypeBadge(selectedTimeField)}
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {timeFieldOptions.map((field) => (
                        <SelectItem
                          key={field}
                          value={field}
                          className="text-xs"
                        >
                          <div className="flex items-center">
                            <span>{field}</span>
                            {renderTimeFieldTypeBadge(field)}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Time Range Selector */}
                {selectedTimeField && (
                  <div className="flex items-center gap-1.5">
                    <TimeRangeSelector
                      timeRange={timeRange}
                      onTimeRangeChange={handleTimeRangeChange}
                      className="min-w-[220px]"
                      fieldName={selectedTimeField}
                      tableName={selectedTable}
                    />
                  </div>
                )}

                {/* Query builder action buttons */}
                <div className="flex items-center ml-auto gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 px-2"
                    onClick={() => {
                      // Add simple WHERE clause if not present
                      if (editorRef.current) {
                        const currentQuery = editorRef.current.getValue();
                        if (!currentQuery.includes(" WHERE ")) {
                          // Insert a WHERE clause before any ORDER BY, GROUP BY, or LIMIT
                          const insertPosition = currentQuery.search(
                            /\b(ORDER BY|GROUP BY|LIMIT)\b/i
                          );
                          if (insertPosition !== -1) {
                            // Insert before the clause
                            const newQuery =
                              currentQuery.slice(0, insertPosition) +
                              " WHERE your_column = 'value' " +
                              currentQuery.slice(insertPosition);
                            editorRef.current.setValue(newQuery);
                          } else {
                            // Append at the end
                            editorRef.current.setValue(
                              currentQuery + " WHERE your_column = 'value'"
                            );
                          }
                        } else {
                          // Add AND condition to existing clause
                          const wherePos =
                            currentQuery.indexOf(" WHERE ") + " WHERE ".length;
                          const restQuery = currentQuery.slice(wherePos);
                          const newQuery =
                            currentQuery.slice(0, wherePos) +
                            "your_column = 'value' AND " +
                            restQuery;
                          editorRef.current.setValue(newQuery);
                        }
                      }
                    }}
                  >
                    <ListFilter className="h-3 w-3" />
                    <span>Filters</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 px-2"
                    onClick={() => {
                      // Add ORDER BY clause if not present
                      if (editorRef.current) {
                        const currentQuery = editorRef.current.getValue();
                        if (!currentQuery.includes(" ORDER BY ")) {
                          // Insert an ORDER BY before any LIMIT
                          const limitPos = currentQuery.search(/\bLIMIT\b/i);
                          if (limitPos !== -1) {
                            // Insert before the LIMIT
                            const newQuery =
                              currentQuery.slice(0, limitPos) +
                              " ORDER BY your_column DESC " +
                              currentQuery.slice(limitPos);
                            editorRef.current.setValue(newQuery);
                          } else {
                            // Append at the end
                            editorRef.current.setValue(
                              currentQuery + " ORDER BY your_column DESC"
                            );
                          }
                        }
                      }
                    }}
                  >
                    <ArrowDownUp className="h-3 w-3" />
                    <span>Order By</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 px-2"
                    onClick={() => {
                      // Add GROUP BY clause if not present
                      if (editorRef.current) {
                        const currentQuery = editorRef.current.getValue();
                        if (!currentQuery.includes(" GROUP BY ")) {
                          // Insert a GROUP BY before any ORDER BY or LIMIT
                          const insertPos =
                            currentQuery.search(/\b(ORDER BY|LIMIT)\b/i);
                          if (insertPos !== -1) {
                            // Insert before the clause
                            const newQuery =
                              currentQuery.slice(0, insertPos) +
                              " GROUP BY your_column " +
                              currentQuery.slice(insertPos);
                            editorRef.current.setValue(newQuery);
                          } else {
                            // Append at the end
                            editorRef.current.setValue(
                              currentQuery + " GROUP BY your_column"
                            );
                          }

                          // If the query doesn't start with SELECT, but uses SELECT *, modify it to add aggregation
                          if (currentQuery.includes("SELECT *")) {
                            const newQuery = currentQuery.replace(
                              "SELECT *",
                              "SELECT your_column, COUNT(*) as count"
                            );
                            editorRef.current.setValue(newQuery);
                          }
                        }
                      }
                    }}
                  >
                    <BarChart4 className="h-3 w-3" />
                    <span>Group By</span>
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Monaco SQL Editor */}
      <div className="flex-grow relative min-h-[200px] border rounded-md overflow-hidden">
        {!isEditorReady && <Skeleton className="h-full w-full" />}
        <Editor
          defaultLanguage="sql"
          defaultValue={query}
          theme={editorTheme}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontFamily: "monospace",
            fontSize: 13,
            padding: {
              top: 10,
              bottom: 10,
            },
            lineNumbers: "on",
            tabSize: 2,
            wordWrap: "on",
            automaticLayout: true,
          }}
          className="h-full"
        />
      </div>
    </div>
  );
}
