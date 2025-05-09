import { useRef, useEffect, useState, useCallback } from "react";
import { useQuery } from "../contexts/QueryContext";
import Editor, { type OnChange } from "@monaco-editor/react";
import { Button } from "./ui/button";
import { Play, Copy, Calendar } from "lucide-react";
import { useTheme } from "./theme-provider";
import { Skeleton } from "./ui/skeleton";
import { toast } from "sonner";
import * as monaco from "monaco-editor";
import Loader from "./Loader";
import TimeRangeSelector from "./TimeRangeSelector";
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

export default function QueryEditor() {
  const {
    query,
    setQuery,
    executeQuery,
    isLoading,
    selectedDb,
    schema,
    isLoadingSchema,
    timeRange,
    setTimeRange,
    timeFields,
    selectedTimeField,
    setSelectedTimeField,
    detectableTimeFields,
  } = useQuery();

  const { theme } = useTheme();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [detectedTableName, setDetectedTableName] = useState<string | undefined>(undefined);

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

  // Get the time field options for the current database
  const timeFieldOptions = timeFields.filter(
    (_) => selectedDb && schema && schema[selectedDb]
  );

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
          enabled: false
        });
      }
    } else {
      setSelectedTimeField(value);
      
      // When enabling time field, ensure time range is enabled
      if (timeRange && timeRange.enabled === false) {
        setTimeRange({
          ...timeRange,
          enabled: true
        });
      }
    }
  };

  // Handle time range changes from TimeRangeSelector
  const handleTimeRangeChange = (newTimeRange: any) => {
    console.log("Time range changed:", newTimeRange);
    
    // If the user disables time filtering from the TimeRangeSelector,
    // also clear the selected time field
    if (newTimeRange.enabled === false) {
      setSelectedTimeField(null);
    }
    
    setTimeRange(newTimeRange);
  };

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
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col gap-2 mb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-grow">
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

            {/* Time Range Controls - only show if we have time fields */}
            {detectableTimeFields && (
              <div className="flex items-center gap-2 ml-2">
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
                    <SelectItem value="_NONE_">No time filter</SelectItem>
                    {timeFieldOptions.map((field) => (
                      <SelectItem key={field} value={field} className="text-sm">
                        {field}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedTimeField && (
                  <TimeRangeSelector
                    timeRange={timeRange}
                    onTimeRangeChange={handleTimeRangeChange}
                    className="min-w-[280px]"
                    fieldName={selectedTimeField}
                    tableName={detectedTableName}
                  />
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
