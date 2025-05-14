import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useQuery } from "../contexts/QueryContext";
import Editor, { type OnChange } from "@monaco-editor/react";
import { Button } from "./ui/button";
import { Play, Copy, Calendar, Wand, HelpCircle } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
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

  // Check if we have time fields to show
  const hasTimeFields = timeFieldOptions.length > 0;

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
    console.log("Time field changed to:", value);
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
    console.log("Time range changed:", newTimeRange);

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
      console.log("Query builder is disabled, not applying time filter");
      return;
    }

    if (!editorRef.current || !timeField || !selectedTable) return;

    const currentQuery = editorRef.current.getValue();
    if (!currentQuery.trim()) return;

    // Insert time filter variable instead of actual filter
    let newQuery = currentQuery;

    // Use variables approach instead of direct SQL injection
    // First check if the query already has a WHERE clause
    if (!/\bWHERE\b/i.test(newQuery) && !newQuery.includes("$__timeFilter")) {
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
    }
    // If there's a WHERE clause but no time variable, we don't modify the query automatically
    // The user needs to add the variable manually in the right position

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

  // Auto-generate simple query when a table is selected
  useEffect(() => {
    // Only generate a query if:
    // 1. Query builder is enabled
    // 2. A table is selected
    // 3. The table name is not "_NONE_"
    // 4. A database is selected
    // 5. The editor is ready
    // 6. The editor is empty or contains default text
    if (
      queryBuilderEnabled &&
      selectedTable &&
      selectedTable !== "_NONE_" &&
      selectedDb &&
      editorRef.current &&
      (!query.trim() ||
        query.trim().toUpperCase() === "SELECT * FROM" ||
        query.trim().toUpperCase() === "SELECT")
    ) {
      console.log("Auto-generating query for table:", selectedTable);
      const newQuery = `SELECT * FROM ${selectedTable}`;

      // Update the editor content
      editorRef.current.setValue(newQuery);

      // Also update the context query state
      setQuery(newQuery);

      // If we have a time field selected, add time filter
      if (selectedTimeField) {
        setTimeout(() => {
          updateEditorQueryWithTimeFilter(selectedTimeField);
        }, 100);
      }
    }
  }, [
    selectedTable,
    selectedDb,
    query,
    setQuery,
    queryBuilderEnabled,
    selectedTimeField,
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
      console.log("Query builder disabled, removing time filters");
      updateEditorQueryWithoutTimeFilter();
    }
  }, [queryBuilderEnabled]);


  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col gap-2 mb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-grow flex-wrap">
            <Button
              onClick={handleExecuteQuery}
              disabled={isLoading || !selectedDb}
              className="w-24"
            >
              {isLoading ? (
                <Loader className="h-4 w-4" />
              ) : (
                <>
                  <Play className="mr-1 h-3 w-3" /> Run
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={copyQuery}
              title="Copy query"
              className="flex-shrink-0"
            >
              <Copy className="h-4 w-4" />
            </Button>

            {/* Query Builder Toggle */}
            <div className="flex items-center gap-2 ml-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2">
                      <Wand
                        className={`h-4 w-4 ${
                          queryBuilderEnabled
                            ? "text-primary"
                            : "text-muted-foreground"
                        }`}
                      />
                      <span className="text-sm font-medium">Query Builder</span>
                      <Switch
                        checked={queryBuilderEnabled}
                        onCheckedChange={handleQueryBuilderToggle}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Toggle query builder mode</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Query builder tools - only show when enabled */}
            {queryBuilderEnabled && (
              <div className="flex items-center gap-2">
                {/* Variables Help Button */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                      >
                        <HelpCircle className="h-4 w-4" />
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
              </div>
            )}

            {/* Time and Table Controls - Only show when query builder is enabled */}
            {selectedDb && queryBuilderEnabled && (
              <div className="flex items-center gap-2 ml-2 flex-wrap">
                {/* Table Selector */}
                <TableSelector />

                {/* Time Field Selector - only show if table is selected and has time fields */}
                {selectedTable && (
                  <>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center">
                            <Calendar className="h-4 w-4 mr-1 text-primary" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Time field to filter by</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {hasTimeFields ? (
                      <div className="flex items-center gap-2">
                        <Select
                          value={selectedTimeField || "_NONE_"}
                          onValueChange={handleTimeFieldChange}
                        >
                          <SelectTrigger className="w-[220px] h-9 text-sm">
                            <SelectValue placeholder="Select time field">
                              {selectedTimeField || "No time filter"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_NONE_">
                              No time filter
                            </SelectItem>
                            {timeFieldOptions.map((field) => (
                              <SelectItem
                                key={field}
                                value={field}
                                className="text-sm"
                              >
                                {field}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Variable usage indicator */}
                        {queryBuilderEnabled && hasVariablesInQuery && (
                          <Badge
                            variant="outline"
                            className="bg-primary/10 text-xs"
                          >
                            Time filter applied
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground px-3 py-1 border rounded-md bg-muted/20">
                        No time fields detected
                      </div>
                    )}

                    {/* Time Range Selector - only show if time field is selected */}
                    {selectedTimeField && (
                      <TimeRangeSelector
                        timeRange={timeRange}
                        onTimeRangeChange={handleTimeRangeChange}
                        className="min-w-[280px]"
                        fieldName={selectedTimeField}
                        tableName={selectedTable}
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

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
