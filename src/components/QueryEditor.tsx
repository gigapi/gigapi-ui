import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useQuery } from "@/contexts/QueryContext";
import Editor, { useMonaco } from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { Play, Copy, Eraser } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import Loader from "@/components/Loader";
import TimeRangeSelector from "@/components/TimeRangeSelector";
import TableSelector from "@/components/TableSelector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { extractTableName } from "@/lib/time-range-utils";
import { Badge } from "@/components/ui/badge";

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
    hasTimeVariables,
  } = useQuery();

  const { theme } = useTheme();
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [detectedTableName, setDetectedTableName] = useState<
    string | undefined
  >(undefined);
  const [hasManualEdits, setHasManualEdits] = useState(false);

  // Create refs for editor and Monaco
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const completionDisposableRef = useRef<any>(null);
  const keyboardDisposableRef = useRef<any>(null);

  // Get Monaco instance
  const monaco = useMonaco();

  // Update editor query with time filter - modified to not auto-add
  const updateEditorQueryWithTimeFilter = useCallback(
    (timeField: string, customTimeRange = timeRange) => {
      // If manual edits flag is set, don't modify the query
      if (hasManualEdits) {
        return;
      }

      if (!editorRef.current || !timeField || !selectedTable) return;

      const currentQuery = editorRef.current.getValue();
      if (!currentQuery.trim()) return;

      // Only update if the query already has time variables
      if (currentQuery.includes("$__timeFilter")) {
        // Don't need to add the variable, it's already there
        // Just update the editor which will trigger the context update
        editorRef.current.setValue(currentQuery);
        setQuery(currentQuery);
      }
      // Don't add variables if they're not already there
    },
    [timeRange, setQuery, hasManualEdits, selectedTable]
  );

  // Remove time filter from query - only when explicitly requested
  const updateEditorQueryWithoutTimeFilter = useCallback(
    (updateEditor = true) => {
      if (!editorRef.current) return "";

      const currentQuery = editorRef.current.getValue();
      if (!currentQuery.trim()) return currentQuery;

      // Only remove if manually requested, not automatically
      // This function would now be called explicitly rather than automatically

      // Remove time filter variable from WHERE clause
      let newQuery = currentQuery;

      // Pattern to match "$__timeFilter AND " or "WHERE $__timeFilter"
      const timeFilterAndPattern = /(\$__timeFilter\s+AND\s+)/i;
      const whereTimeFilterPattern = /(\s+WHERE\s+\$__timeFilter\s+)/i;

      if (timeFilterAndPattern.test(newQuery)) {
        newQuery = newQuery.replace(timeFilterAndPattern, "");
      } else if (whereTimeFilterPattern.test(newQuery)) {
        // If it's the only condition in the WHERE clause, remove the entire WHERE
        newQuery = newQuery.replace(whereTimeFilterPattern, " ");

        // Clean up empty WHERE clauses
        newQuery = newQuery.replace(
          /(\s+WHERE\s+)(GROUP BY|ORDER BY|LIMIT)/i,
          " $2"
        );
      }

      // Clean up extra spaces
      newQuery = newQuery.replace(/\s{2,}/g, " ").trim();

      if (updateEditor && newQuery !== currentQuery) {
        // Update editor and context only if changed
        editorRef.current.setValue(newQuery);
        setQuery(newQuery);
      }

      return newQuery;
    },
    [setQuery]
  );

  // Handle time field selection
  const handleTimeFieldChange = useCallback(
    (value: string) => {
      if (value === "_none_") {
        setSelectedTimeField(null);

        // When disabling time field, also ensure time range is disabled
        if (timeRange && timeRange.enabled !== false) {
          setTimeRange({
            ...timeRange,
            enabled: false,
          });
        }

        // Don't automatically remove time filter from query
        // Let user manage variables manually
      } else {
        setSelectedTimeField(value);

        // When enabling time field, ensure time range is enabled
        if (timeRange && timeRange.enabled === false) {
          setTimeRange({
            ...timeRange,
            enabled: true,
          });
        }

        // Don't automatically add time filter to query
        // Let user add it explicitly using the "Use filter" button
      }
    },
    [
      timeRange,
      setTimeRange,
      setSelectedTimeField,
    ]
  );

  // Handle execution with validation
  const handleRunQuery = useCallback(() => {
    if (!selectedDb) {
      toast.error("Please select a database first");
      return;
    }
    // Reset manual edits flag when running a query
    setHasManualEdits(false);
    executeQuery();
  }, [selectedDb, executeQuery]);

  // Copy query to clipboard
  const copyQuery = useCallback(() => {
    if (editorRef.current) {
      const currentQuery = editorRef.current.getValue();
      navigator.clipboard.writeText(currentQuery);
      toast.success("Query copied to clipboard");
    }
  }, []);

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

  // Handle time range changes from TimeRangeSelector
  const handleTimeRangeChange = useCallback(
    (newTimeRange: any) => {
      // If the user disables time filtering from the TimeRangeSelector,
      // also clear the selected time field
      if (newTimeRange.enabled === false) {
        setSelectedTimeField(null);
        // Don't automatically remove time filter from query, just update the time range
      } else if (selectedTimeField && hasTimeVariables) {
        // Only update the query if it already has time variables and time field is selected
        updateEditorQueryWithTimeFilter(selectedTimeField, newTimeRange);
      }

      setTimeRange(newTimeRange);
    },
    [
      selectedTimeField,
      setSelectedTimeField,
      setTimeRange,
      updateEditorQueryWithTimeFilter,
      updateEditorQueryWithoutTimeFilter,
      hasTimeVariables
    ]
  );

  // Handle editor onChange with type safety
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      // If the current query contains time variables but the new value doesn't,
      // or if the query structure has significantly changed, mark as manually edited
      if (query && value) {
        const hadTimeVars = /\$__time(Filter|Field|From|To)/i.test(query);
        const hasTimeVars = /\$__time(Filter|Field|From|To)/i.test(value);

        // Check if query has time variables but no selected time field
        if (
          hasTimeVars &&
          (!selectedTimeField || selectedTimeField === "_none_") &&
          timeFieldOptions.length > 0
        ) {
          // Auto-select the first time field if time variables are detected
          setSelectedTimeField(timeFieldOptions[0]);
          
          // Make sure time filter is enabled
          if (timeRange && timeRange.enabled === false) {
            setTimeRange({
              ...timeRange,
              enabled: true,
            });
          }
        }

        if (
          (hadTimeVars && !hasTimeVars) ||
          query.includes("WHERE") !== value.includes("WHERE") ||
          query.includes("FROM") !== value.includes("FROM")
        ) {
          setHasManualEdits(true);
        }
      }

      setQuery(value || "");
    },
    [
      query,
      setQuery,
      selectedTimeField,
      timeFieldOptions,
      setSelectedTimeField,
      timeRange,
      setTimeRange,
    ]
  );

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
        provideCompletionItems: (model: any, position: any) => {
          const suggestions: any[] = [];

          // Add time variables as suggestions - always show variables
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

  function handleEditorDidMount(editor: any, monacoInstance: any) {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;
    setIsEditorReady(true);

    // Check if query already contains variables
    const currentQuery = editor.getValue();
    if (currentQuery) {
      // Don't set hasManualEdits when initially detecting variables
      // Just let the context state handle it
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
  }, [setupKeyboardShortcut]);

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

  // Update Monaco instance when it's available
  useEffect(() => {
    if (monaco) {
      monacoRef.current = monaco;
    }
  }, [monaco]);

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

  // Update editor content when query changes from context (e.g., query history selection)
  useEffect(() => {
    if (editorRef.current && isEditorReady) {
      const currentEditorValue = editorRef.current.getValue();
      if (query !== currentEditorValue) {
        editorRef.current.setValue(query);
        // Reset manual edits flag when loading a query from history
        setHasManualEdits(false);
      }
    }
  }, [query, isEditorReady]);

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

  // Clear query handler - reset manual edits flag
  const handleClearQuery = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.setValue("");
      setQuery("");
      setHasManualEdits(false);
    }
  }, [setQuery]);

  // Improved real-time sync when table/db changes
  useEffect(() => {
    if (!editorRef.current || hasManualEdits) return;

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
      setHasManualEdits(false); // Reset manual edits flag for empty/basic queries

      if (selectedTimeField) {
        // Wait for the editor to update before adding time filter
        // Add proper cleanup for setTimeout to prevent cancellation errors
        const timeoutId = setTimeout(
          () => updateEditorQueryWithTimeFilter(selectedTimeField),
          50
        );
        // Return cleanup function to clear the timeout if component unmounts
        return () => clearTimeout(timeoutId);
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

    // Only update time filters if there are no manual edits
    if (!hasManualEdits) {
      // If time field changed, update/add/remove time filter
      if (selectedTimeField && !currentQuery.includes("$__timeFilter")) {
        updateEditorQueryWithTimeFilter(selectedTimeField);
        return;
      }
      if (!selectedTimeField && currentQuery.includes("$__timeFilter")) {
        updateEditorQueryWithoutTimeFilter();
        return;
      }
    }
    
    // Add empty cleanup function for consistent behavior
    return () => {};
  }, [
    selectedTable,
    selectedDb,
    selectedTimeField,
    hasManualEdits,
    setQuery,
    updateEditorQueryWithTimeFilter,
    updateEditorQueryWithoutTimeFilter,
  ]);

  // Add a separate effect for time range changes
  useEffect(() => {
    if (
      selectedTimeField &&
      editorRef.current &&
      editorRef.current.getValue().includes("$__timeFilter") &&
      !hasManualEdits
    ) {
      // Just update time filter without changing query structure
      const currentQuery = editorRef.current.getValue();
      setQuery(currentQuery);
    }
  }, [timeRange, selectedTimeField, setQuery, hasManualEdits]);

  // Add function to highlight time variables in the editor
  const highlightTimeVariables = useCallback(() => {
    if (!editorRef.current || !monacoRef.current) return;

    try {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      const model = editor.getModel();
      if (!model) return;

      // Remove any existing decorations
      const oldDecorations = editor
        .getModel()
        .getAllDecorations()
        .filter((d: any) => d.options.className === "time-variable-highlight")
        .map((d: any) => d.id);

      if (oldDecorations.length > 0) {
        editor.deltaDecorations(oldDecorations, []);
      }

      // If time variables are being used, add decorations
      if (hasTimeVariables) {
        const text = model.getValue();
        const timeVarRegex = /\$__time(Filter|Field|From|To)/g;
        let match;
        const decorations = [];

        while ((match = timeVarRegex.exec(text)) !== null) {
          const startPos = model.getPositionAt(match.index);
          const endPos = model.getPositionAt(match.index + match[0].length);

          decorations.push({
            range: new monaco.Range(
              startPos.lineNumber,
              startPos.column,
              endPos.lineNumber,
              endPos.column
            ),
            options: {
              inlineClassName: "time-variable-highlight",
              hoverMessage: {
                value: "Time variable - will be replaced with actual values",
              },
            },
          });
        }

        if (decorations.length > 0) {
          editor.deltaDecorations([], decorations);
        }
      }
    } catch (err) {
      // Silently catch errors that might occur during editor operations
      // These are often due to the editor being disposed or the component unmounting
      console.debug("Suppressed editor decoration error:", err);
    }
  }, [hasTimeVariables]);

  // Call highlight function when editor is ready or variables change
  useEffect(() => {
    let isMounted = true;
    let timeoutId: number | null = null;
    
    if (isEditorReady && isMounted) {
      try {
        // Use timeout to ensure we don't have race conditions with editor updates
        timeoutId = window.setTimeout(() => {
          if (isMounted) {
            highlightTimeVariables();
          }
        }, 0);
      } catch (err) {
        // Suppress errors during highlighting
      }
    }
    
    return () => {
      isMounted = false;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isEditorReady, hasTimeVariables, highlightTimeVariables]);

  // Update Monaco instance when it's available
  useEffect(() => {
    let styleElement: HTMLStyleElement | null = null;
    let isMounted = true;
    
    if (monaco && isMounted) {
      try {
        monacoRef.current = monaco;

        // Add CSS for time variable highlighting
        styleElement = document.createElement("style");
        styleElement.textContent = `
          .time-variable-highlight {
            background-color: rgba(59, 130, 246, 0.2);
            border-radius: 2px;
            text-decoration: none !important;
          }
        `;
        document.head.appendChild(styleElement);
      } catch (err) {
        console.debug("Suppressed Monaco initialization error:", err);
      }
    }

    return () => {
      isMounted = false;
      if (styleElement && document.head.contains(styleElement)) {
        try {
          document.head.removeChild(styleElement);
        } catch (err) {
          // Suppress cleanup errors
        }
      }
    };
  }, [monaco]);

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* Unified query header with toolbar */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between bg-card rounded-md border p-2">
          <div className="flex items-center gap-2">
            <Button
              onClick={handleRunQuery}
              disabled={isLoading || !selectedDb}
              className="h-8 px-3"
              variant="default"
            >
              {isLoading ? (
                <>
                  <Loader className="h-4 w-4" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="mr-1.5 h-3.5 w-3.5" /> Run Query
                </>
              )}
            </Button>

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
                      onClick={handleClearQuery}
                    >
                      <Eraser className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">Clear query</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Add table and time controls inline */}
            {selectedDb && (
              <div className="flex items-center gap-2 ml-2">
                <div className="h-5 bg-border mx-1"></div>

                {/* Table Selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">FROM</span>
                  <TableSelector />
                </div>

                {/* Time Field Selector */}
                {selectedTable && (
                  <div className="flex items-center gap-1.5 ml-2">
                    <span className="text-xs text-muted-foreground">
                      TIME BY
                    </span>
                    <Select
                      value={selectedTimeField || "_none_"}
                      onValueChange={handleTimeFieldChange}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="None">
                          <div className="flex items-center">
                            {selectedTimeField || "None"}
                            {selectedTimeField &&
                              renderTimeFieldTypeBadge(selectedTimeField)}
                          </div>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          key="none"
                          value="_none_"
                          className="text-xs"
                        >
                          <div className="flex items-center">
                            <span>None</span>
                          </div>
                        </SelectItem>
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
                )}

                {/* Time Range Selector */}
                {selectedTable && selectedTimeField && (
                  <div className="flex items-center gap-1.5 ml-2">
                    <TimeRangeSelector
                      timeRange={timeRange}
                      onTimeRangeChange={handleTimeRangeChange}
                      fieldName={selectedTimeField}
                      tableName={selectedTable}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
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
            fontSize: 12,
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
          loading={<Loader className="h-10 w-10" />}
        />
      </div>
    </div>
  );
}
