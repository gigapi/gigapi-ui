import { useRef, useEffect, useState, useCallback } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import { Skeleton } from "@/components/ui/skeleton";
import Loader from "@/components/Loader";
import { useTheme } from "@/components/theme-provider";
import type { SchemaInfo } from "@/types";

interface MonacoSqlEditorProps {
  query: string;
  isLoading: boolean;
  schema?: SchemaInfo;
  selectedDb?: string;
  onChange: (value: string | undefined) => void;
  onMount: (editor: any, monaco: any) => void;
  onRunQuery: () => void;
}

export default function MonacoSqlEditor({
  query,
  isLoading,
  schema,
  selectedDb,
  onChange,
  onMount,
  onRunQuery,
}: MonacoSqlEditorProps) {
  const { theme } = useTheme();
  const [isEditorReady, setIsEditorReady] = useState(false);
  const completionDisposableRef = useRef<any>(null);
  const keyboardDisposableRef = useRef<any>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  // Get Monaco instance
  const monaco = useMonaco();

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
      onRunQuery
    );

    if (disposable && typeof disposable !== "string") {
      keyboardDisposableRef.current = disposable;
    }
  }, [onRunQuery]);

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
        provideCompletionItems: (_model: any, position: any) => {
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
                endLineNumber: position.lineNumber,
                startColumn: position.column,
                endColumn: position.column,
              },
            });
          });

          // Add table names
          currentDbSchema.forEach((table) => {
            suggestions.push({
              label: table.tableName,
              kind: monacoInstance.languages.CompletionItemKind.Class,
              detail: "Table",
              insertText: table.tableName,
              range: {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: position.column,
                endColumn: position.column,
              },
            });

            // Add column names for this table
            if (table.columns) {
              table.columns.forEach((column) => {
                suggestions.push({
                  label: column.columnName,
                  kind: monacoInstance.languages.CompletionItemKind.Field,
                  detail: `Column (${column.dataType || "unknown"})`,
                  insertText: column.columnName,
                  range: {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: position.column,
                    endColumn: position.column,
                  },
                });
              });
            }
          });

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

    editor.theme = theme === "light" ? "vs-light" : "vs-dark";

    // Layout editor
    setTimeout(() => editor.layout(), 0);

    // Call parent onMount handler
    onMount(editor, monacoInstance);
  }

  // Update keyboard shortcut when dependencies change
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
      isEditorReady
    ) {
      setupIntellisense();
    }
  }, [setupIntellisense, selectedDb, schema, isEditorReady]);

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
  const editorTheme = theme === "light" ? "light" : "vs-dark";

  return (
    <div className="h-full w-full border rounded-md overflow-hidden bg-background">
      {!isEditorReady && <Skeleton className="h-full w-full" />}
      <Editor
        height="100%"
        defaultLanguage="sql"
        defaultValue={query}
        theme={editorTheme}
        onChange={onChange}
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
          readOnly: isLoading,
        }}
        loading={<Loader className="h-10 w-10" />}
      />
    </div>
  );
}
