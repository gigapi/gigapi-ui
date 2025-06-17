import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useQuery } from "@/contexts/QueryContext";
import { useDatabase } from "@/contexts/DatabaseContext";
import { useTime } from "@/contexts/TimeContext";
import { useMCP } from "@/contexts/MCPContext";
import Editor, { useMonaco } from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { Play, Copy, Eraser, Share, MessageCircle, Bot } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import Loader from "@/components/Loader";
import TimeRangeSelector from "@/components/TimeRangeSelector";
import TableSelector from "@/components/TableSelector";
import ChatPanel from "@/components/ChatPanel";
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
import { Badge } from "@/components/ui/badge";
import {
  HashQueryUtils,
  checkForTimeVariables,
  detectTimeFieldsFromSchema,
} from "@/lib/";
import { isLoadingFromUrl } from "@/components/AppContent";

export default function QueryEditor() {
  const { query, setQuery, executeQuery, isLoading } = useQuery();
  const {
    selectedDb,
    selectedTable,
    schema,
    getColumnsForTable,
    isLoadingSchema,
  } = useDatabase();
  const {
    timeRange,
    setTimeRange,
    selectedTimeField,
    setSelectedTimeField,
    hasTimeVariables,
    setHasTimeVariables,
    updateTimeFieldsFromSchema,
  } = useTime();
  const { isConnected: mcpConnected } = useMCP();

  const { theme } = useTheme();
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);

  // Create refs for editor and Monaco
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const completionDisposableRef = useRef<any>(null);
  const keyboardDisposableRef = useRef<any>(null);

  // Get Monaco instance
  const monaco = useMonaco();

  // Handle time field selection
  const handleTimeFieldChange = useCallback(
    (value: string) => {
      if (value === "_NO_TIME_FIELDS_") {
        // This is a disabled placeholder item, do nothing
        return;
      }
      if (value === "_none_") {
        // Check if query has time variables before allowing None selection
        if (hasTimeVariables) {
          toast.error("Cannot set time field to None", {
            description:
              "Query contains time variables that require a time field. Remove time variables first or select a time field.",
          });
          return;
        }
        setSelectedTimeField(undefined);
      } else {
        setSelectedTimeField(value);
        // Ensure time range is enabled when selecting a time field
        if (timeRange && !timeRange.enabled) {
          setTimeRange({ ...timeRange, enabled: true });
        }
      }
    },
    [hasTimeVariables, setSelectedTimeField, timeRange, setTimeRange]
  );

  // Handle execution with validation
  const handleRunQuery = useCallback(() => {
    if (!selectedDb) {
      toast.error("Please select a database first");
      return;
    }

    // Get the current query from the editor and update context
    const currentQuery = editorRef.current?.getValue() || "";
    setQuery(currentQuery);

    // Execute query
    executeQuery();
  }, [selectedDb, executeQuery, setQuery]);

  // Copy query to clipboard
  const copyQuery = useCallback(() => {
    if (editorRef.current) {
      const currentQuery = editorRef.current.getValue();
      navigator.clipboard.writeText(currentQuery);
      toast.success("Query copied to clipboard");
    }
  }, []);

  // Get the time field options for the current table
  const timeFieldOptions = useMemo(() => {
    if (!selectedTable) return [];

    const columns = getColumnsForTable(selectedTable);
    if (!columns) return [];

    return detectTimeFieldsFromSchema(columns);
  }, [selectedTable, getColumnsForTable]);

  // Handle time range changes from TimeRangeSelector
  const handleTimeRangeChange = useCallback(
    (newTimeRange: any) => {
      // If time filtering is disabled, clear the selected time field
      if (newTimeRange.enabled === false) {
        setSelectedTimeField(undefined);
      }
      setTimeRange(newTimeRange);
    },
    [setSelectedTimeField, setTimeRange]
  );

  // Handle editor onChange - simplified to only update query and time variables
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      const newQuery = value || "";
      setQuery(newQuery);

      // Update time variables detection
      const hasTimeVars = checkForTimeVariables(newQuery);
      setHasTimeVariables(hasTimeVars);

      // Auto-select first time field if time variables are detected and no field is selected
      if (hasTimeVars && !selectedTimeField && timeFieldOptions.length > 0) {
        setSelectedTimeField(timeFieldOptions[0]);
        if (timeRange && !timeRange.enabled) {
          setTimeRange({ ...timeRange, enabled: true });
        }
      }
    },
    [
      setQuery,
      setHasTimeVariables,
      selectedTimeField,
      timeFieldOptions,
      setSelectedTimeField,
      timeRange,
      setTimeRange,
    ]
  );

  // Setup keyboard shortcut for Ctrl+Enter
  const setupKeyboardShortcut = useCallback(() => {
    if (!editorRef.current || !monacoRef.current) return;

    // Dispose of previous keyboard shortcut
    if (keyboardDisposableRef.current) {
      keyboardDisposableRef.current.dispose();
      keyboardDisposableRef.current = null;
    }

    // Create Ctrl+Enter shortcut to run query
    const disposable = editorRef.current.addCommand(
      monacoRef.current.KeyMod.CtrlCmd | monacoRef.current.KeyCode.Enter,
      handleRunQuery
    );

    if (disposable && typeof disposable !== "string") {
      keyboardDisposableRef.current = disposable;
    }
  }, [handleRunQuery]);

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

    // Apply theme
    editor.updateOptions({
      theme: theme === "dark" ? "vs-dark" : "vs",
    });

    // Layout editor
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

  // Sync editor content when query changes from context (e.g., query history)
  useEffect(() => {
    console.log('QueryEditor: query changed:', query);
    console.log('QueryEditor: isEditorReady:', isEditorReady);
    console.log('QueryEditor: editorRef.current exists:', !!editorRef.current);
    
    if (
      editorRef.current &&
      isEditorReady &&
      query !== editorRef.current.getValue()
    ) {
      console.log('QueryEditor: Setting editor value to:', query);
      editorRef.current.setValue(query);
    } else {
      console.log('QueryEditor: Not updating editor. Current editor value:', editorRef.current?.getValue());
    }
  }, [query, isEditorReady]);

  // Debug: Log when query from context changes
  useEffect(() => {
    console.log('QueryContext query changed to:', query);
  }, [query]);

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

  // Update time fields when table changes
  useEffect(() => {
    if (!selectedTable) return;

    const columns = getColumnsForTable(selectedTable);
    if (columns) {
      updateTimeFieldsFromSchema(columns);

      // Auto-select first time field if available and none is selected
      if (!selectedTimeField && timeFieldOptions.length > 0) {
        setSelectedTimeField(timeFieldOptions[0]);
      }
    }
  }, [
    selectedTable,
    getColumnsForTable,
    updateTimeFieldsFromSchema,
    selectedTimeField,
    setSelectedTimeField,
    timeFieldOptions,
  ]);

  // Clear query handler
  const handleClearQuery = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.setValue("");
      setQuery("");
    }
  }, [setQuery]);

  // Generate simple query when table is selected and editor is empty
  useEffect(() => {
    if (!selectedTable || !editorRef.current || isLoadingFromUrl) return;

    const currentQuery = editorRef.current.getValue().trim();
    const contextQuery = query.trim();
    
    // Only generate a simple query if both editor and context are empty
    if (!currentQuery && !contextQuery) {
      console.log('QueryEditor: Generating simple query for table:', selectedTable);
      const newQuery = `SELECT * FROM ${selectedTable}`;
      editorRef.current.setValue(newQuery);
      setQuery(newQuery);
    } else {
      console.log('QueryEditor: Not generating simple query. Editor has:', currentQuery, 'Context has:', contextQuery);
    }
  }, [selectedTable, setQuery, query]);

  // Update Monaco instance when available
  useEffect(() => {
    if (monaco) {
      monacoRef.current = monaco;
    }
  }, [monaco]);

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* Unified query header with toolbar */}
      <div className="flex flex-col gap-2">
        {/* Desktop Layout */}
        <div className="hidden lg:flex items-center justify-between bg-card rounded-md border p-2">
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
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        const params = {
                          query: editorRef.current.getValue(),
                          db: selectedDb,
                          table: selectedTable || undefined,
                          timeField: selectedTimeField || undefined,
                          timeFrom: timeRange?.from,
                          timeTo: timeRange?.to,
                        };

                        HashQueryUtils.copyShareableUrl(params).then(
                          (success: boolean) => {
                            if (success) {
                              toast.success(
                                "Shareable URL copied to clipboard"
                              );
                            } else {
                              toast.error("Failed to copy URL");
                            }
                          }
                        );
                      }}
                    >
                      <Share className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">Copy shareable URL</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

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

              <div className="h-5 w-px bg-border mx-1"></div>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={showChatPanel ? "default" : "ghost"}
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setShowChatPanel(!showChatPanel)}
                    >
                      {mcpConnected ? (
                        <Bot className="h-3.5 w-3.5" />
                      ) : (
                        <MessageCircle className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">
                      <Badge
                        variant="outline"
                        className="mr-1 bg-purple-100 text-purple-800"
                      >
                        Alpha
                      </Badge>
                      {mcpConnected
                        ? "AI chat (Connected)"
                        : "AI chat (Disconnected)"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>                {/* Add table and time controls inline */}
            {selectedDb && (
              <div className="flex items-center gap-2 ml-2">
                <div className="h-5 w-px bg-border mx-1"></div>

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
                      value={selectedTimeField}
                      onValueChange={handleTimeFieldChange}
                    >
                      <SelectTrigger
                        className={`h-8 text-xs ${
                          hasTimeVariables && !selectedTimeField
                            ? "border-destructive bg-destructive/10"
                            : ""
                        }`}
                      >
                        <SelectValue placeholder="">
                          <div className="flex items-center">
                            {selectedTimeField ||
                              (hasTimeVariables ? "⚠️ Required" : "None")}
                            {selectedTimeField &&
                              renderTimeFieldTypeBadge(selectedTimeField)}
                          </div>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {hasTimeVariables && timeFieldOptions.length === 0 && (
                          <SelectItem
                            key="no-time-fields"
                            value="_NO_TIME_FIELDS_"
                            disabled
                            className="text-xs text-muted-foreground"
                          >
                            <div className="flex items-center">
                              <span>No time fields available</span>
                            </div>
                          </SelectItem>
                        )}
                        {timeFieldOptions.map((field: string) => (
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

        {/* Mobile/Tablet Layout */}
        <div className="lg:hidden bg-card rounded-md border p-2 space-y-2">
          {/* First Row: Run Query and Action Buttons */}
          <div className="flex items-center justify-between">
            <Button
              onClick={handleRunQuery}
              disabled={isLoading || !selectedDb}
              className="h-8 px-3 flex-shrink-0"
              variant="default"
            >
              {isLoading ? (
                <>
                  <Loader className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1">Running...</span>
                </>
              ) : (
                <>
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Run Query</span>
                  <span className="sm:hidden">Run</span>
                </>
              )}
            </Button>

            {/* Action Buttons */}
            <div className="flex items-center gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        const params = {
                          query: editorRef.current.getValue(),
                          db: selectedDb,
                          table: selectedTable || undefined,
                          timeField: selectedTimeField || undefined,
                          timeFrom: timeRange?.from,
                          timeTo: timeRange?.to,
                        };

                        HashQueryUtils.copyShareableUrl(params).then(
                          (success: boolean) => {
                            if (success) {
                              toast.success(
                                "Shareable URL copied to clipboard"
                              );
                            } else {
                              toast.error("Failed to copy URL");
                            }
                          }
                        );
                      }}
                    >
                      <Share className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">Copy shareable URL</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

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

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={showChatPanel ? "default" : "ghost"}
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setShowChatPanel(!showChatPanel)}
                    >
                      {mcpConnected ? (
                        <Bot className="h-3.5 w-3.5" />
                      ) : (
                        <MessageCircle className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">
                      <Badge
                        variant="outline"
                        className="mr-1 bg-purple-100 text-purple-800"
                      >
                        Alpha
                      </Badge>
                      {mcpConnected
                        ? "AI chat (Connected)"
                        : "AI chat (Disconnected)"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Second Row: Table and Time Controls */}
          {selectedDb && (
            <div className="flex flex-col sm:flex-row gap-2">
              {/* Table Selector */}
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="text-xs text-muted-foreground flex-shrink-0">FROM</span>
                <div className="min-w-0 flex-1">
                  <TableSelector />
                </div>
              </div>

              {/* Time Field Selector */}
              {selectedTable && (
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    TIME BY
                  </span>
                  <div className="min-w-0 flex-1">
                    <Select
                      value={selectedTimeField}
                      onValueChange={handleTimeFieldChange}
                    >
                      <SelectTrigger
                        className={`h-8 text-xs ${
                          hasTimeVariables && !selectedTimeField
                            ? "border-destructive bg-destructive/10"
                            : ""
                        }`}
                      >
                        <SelectValue placeholder="">
                          <div className="flex items-center">
                            {selectedTimeField ||
                              (hasTimeVariables ? "⚠️ Required" : "None")}
                            {selectedTimeField &&
                              renderTimeFieldTypeBadge(selectedTimeField)}
                          </div>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {hasTimeVariables && timeFieldOptions.length === 0 && (
                          <SelectItem
                            key="no-time-fields"
                            value="_NO_TIME_FIELDS_"
                            disabled
                            className="text-xs text-muted-foreground"
                          >
                            <div className="flex items-center">
                              <span>No time fields available</span>
                            </div>
                          </SelectItem>
                        )}
                        {timeFieldOptions.map((field: string) => (
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
                </div>
              )}
            </div>
          )}

          {/* Third Row: Time Range Selector */}
          {selectedTable && selectedTimeField && (
            <div className="flex items-center gap-1.5">
              <TimeRangeSelector
                timeRange={timeRange}
                onTimeRangeChange={handleTimeRangeChange}
                fieldName={selectedTimeField}
                tableName={selectedTable}
              />
            </div>
          )}
        </div>
      </div>

      {/* Main content area with optional split view */}
      <div className="flex-1 flex gap-2 min-h-0">
        {/* Monaco SQL Editor */}
        <div
          className={`flex-grow relative min-h-[200px] border rounded-md overflow-hidden ${
            showChatPanel ? "w-1/2" : "w-full"
          }`}
        >
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

        {/* Chat Panel */}
        {showChatPanel && (
          <div className="w-1/2 min-h-[200px]">
            <ChatPanel
              isOpen={showChatPanel}
              onClose={() => setShowChatPanel(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
