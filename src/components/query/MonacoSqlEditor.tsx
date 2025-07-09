import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import { Skeleton } from "@/components/ui/skeleton";
import Loader from "@/components/Loader";
import { useTheme } from "@/components/theme-provider";
import type { SchemaInfo } from "@/types";
import { 
  analyzeQueryContext, 
  getWordAtPosition, 
  extractTableAliases,
  getContextualSuggestions,
} from "@/lib/utils/sql-autocomplete";

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
  const isMountedRef = useRef(true);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Get Monaco instance
  const monaco = useMonaco();

  // PERFORMANCE FIX 1: Memoize the schema structure to prevent unnecessary recalculations
  const memoizedSchema = useMemo(() => {
    if (!schema || !selectedDb || !schema[selectedDb]) {
      return null;
    }
    return schema[selectedDb];
  }, [schema, selectedDb]);

  // PERFORMANCE FIX 2: Memoize the completion provider to prevent recreation
  const createCompletionProvider = useCallback((monacoInstance: any, currentDbSchema: any) => {
    return {
      provideCompletionItems: (model: any, position: any) => {
        const suggestions: any[] = [];
        
        // Get current query and analyze context
        const lines = model.getLinesContent();
        const query = lines.join('\n');
        const context = analyzeQueryContext(query, position, lines);
        const currentWord = getWordAtPosition(lines, position);
        const tableAliases = extractTableAliases(query);
        
        // Add time variables as suggestions - always show at top priority
        const timeVariables = [
          {
            label: "$__timeFilter",
            detail: "Time range filter condition",
            documentation:
              "Expands to a WHERE condition for the selected time field and range",
            sortText: "0_$__timeFilter", // Ensure time vars appear first
          },
          {
            label: "$__timeField",
            detail: "Selected time field name",
            documentation: "Expands to the selected time field name",
            sortText: "0_$__timeField",
          },
          {
            label: "$__timeFrom",
            detail: "Start of time range",
            documentation:
              "Expands to the SQL representation of the start time",
            sortText: "0_$__timeFrom",
          },
          {
            label: "$__timeTo",
            detail: "End of time range",
            documentation:
              "Expands to the SQL representation of the end time",
            sortText: "0_$__timeTo",
          },
        ];

        timeVariables.forEach((variable) => {
          if (!currentWord || variable.label.toLowerCase().includes(currentWord.toLowerCase())) {
            suggestions.push({
              label: variable.label,
              kind: monacoInstance.languages.CompletionItemKind.Variable,
              detail: variable.detail,
              documentation: variable.documentation,
              insertText: variable.label,
              sortText: variable.sortText,
              range: {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: position.column - currentWord.length,
                endColumn: position.column,
              },
            });
          }
        });
        
        // Get context-aware suggestions
        const contextualSuggestions = getContextualSuggestions(
          monacoInstance,
          context,
          currentDbSchema,
          currentWord,
          tableAliases
        );
        
        // Create proper range for replacements
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column - currentWord.length,
          endColumn: position.column,
        };
        
        // Add range to all suggestions
        contextualSuggestions.forEach(suggestion => {
          suggestion.range = range;
        });
        
        suggestions.push(...contextualSuggestions);

        return { suggestions };
      },
    };
  }, []);

  // PERFORMANCE FIX 3: Setup keyboard shortcut with proper memoization and error handling
  const setupKeyboardShortcut = useCallback((editor: any, monacoInstance: any) => {
    // Dispose of previous keyboard shortcut
    if (keyboardDisposableRef.current) {
      try {
        if (typeof keyboardDisposableRef.current.dispose === 'function') {
          keyboardDisposableRef.current.dispose();
        }
      } catch (e) {
        // Silently ignore Monaco disposal errors
      } finally {
        keyboardDisposableRef.current = null;
      }
    }

    try {
      // Create Ctrl+Enter shortcut to run query
      const disposable = editor.addCommand(
        monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter,
        () => {
          console.log("🔥 MONACO KEYBOARD SHORTCUT TRIGGERED");
          // Get the current editor content and call onRunQuery
          const currentContent = editor.getValue();
          console.log("🔥 MONACO SHORTCUT CONTENT:", { currentContent });
          onRunQuery();
        }
      );

      if (disposable && typeof disposable !== "string") {
        keyboardDisposableRef.current = disposable;
      }
    } catch (e) {
      // Silently ignore Monaco command registration errors
    }
  }, [onRunQuery]);

  // PERFORMANCE FIX 4: Setup intellisense with debouncing and safer disposal
  const setupIntellisense = useCallback((monacoInstance: any, currentDbSchema: any) => {
    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Debounce the setup to prevent rapid re-registration
    debounceTimerRef.current = setTimeout(() => {
      // Only proceed if component is still mounted
      if (!isMountedRef.current) return;
      
      // Dispose of previous completion provider if exists
      if (completionDisposableRef.current) {
        try {
          if (typeof completionDisposableRef.current.dispose === 'function') {
            completionDisposableRef.current.dispose();
          }
        } catch (e) {
          // Silently ignore Monaco disposal errors
        } finally {
          completionDisposableRef.current = null;
        }
      }

      try {
        const disposable = monacoInstance.languages.registerCompletionItemProvider(
          "sql",
          createCompletionProvider(monacoInstance, currentDbSchema)
        );

        // Store the disposable in ref
        completionDisposableRef.current = disposable;
      } catch (e) {
        // Silently ignore Monaco registration errors
      }
    }, 100); // 100ms debounce
  }, [createCompletionProvider]);

  // PERFORMANCE FIX 5: Optimized editor mount handler
  const handleEditorDidMount = useCallback((editor: any, monacoInstance: any) => {
    if (!isMountedRef.current) return;
    
    editorRef.current = editor;
    monacoRef.current = monacoInstance;
    
    // Set initial value from query prop
    if (query && query !== editor.getValue()) {
      console.log("🔥 MONACO SETTING INITIAL VALUE:", { query, currentValue: editor.getValue() });
      editor.setValue(query);
    }

    // Configure SQL language settings
    monacoInstance.languages.setLanguageConfiguration("sql", {
      comments: {
        lineComment: "--",
        blockComment: ["/*", "*/"],
      },
      brackets: [
        ["[", "]"],
        ["(", ")"],
      ],
      autoClosingPairs: [
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: "'", close: "'", notIn: ["string"] },
        { open: '"', close: '"', notIn: ["string"] },
      ],
      surroundingPairs: [
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: "'", close: "'" },
        { open: '"', close: '"' },
      ],
    });

    // Setup keyboard shortcut
    setupKeyboardShortcut(editor, monacoInstance);

    // Setup intellisense if schema is available
    if (memoizedSchema) {
      setupIntellisense(monacoInstance, memoizedSchema);
    }

    // Mark editor as ready
    setIsEditorReady(true);

    // Layout editor
    setTimeout(() => editor.layout(), 0);

    // Call parent onMount handler
    onMount(editor, monacoInstance);
  }, [query, onMount, setupKeyboardShortcut, setupIntellisense, memoizedSchema]);

  // PERFORMANCE FIX 6: Consolidated effect for Monaco instance and setup
  useEffect(() => {
    if (!monaco || !isEditorReady) return;

    monacoRef.current = monaco;

    // Setup intellisense when schema changes
    if (editorRef.current && memoizedSchema) {
      setupIntellisense(monaco, memoizedSchema);
    }
  }, [monaco, isEditorReady, memoizedSchema, setupIntellisense]);

  // Sync external query changes to Monaco editor
  useEffect(() => {
    if (editorRef.current && query !== undefined && query !== editorRef.current.getValue()) {
      console.log("🔥 SYNCING EXTERNAL QUERY CHANGE:", { query, currentValue: editorRef.current.getValue() });
      editorRef.current.setValue(query);
    }
  }, [query]);

  // PERFORMANCE FIX 7: Cleanup with proper disposal and error handling
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      
      // Clear any pending debounce
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      
      // Dispose completion provider with better error handling
      if (completionDisposableRef.current) {
        try {
          // Check if dispose method exists before calling
          if (typeof completionDisposableRef.current.dispose === 'function') {
            completionDisposableRef.current.dispose();
          }
        } catch (e) {
          // Silently ignore Monaco disposal errors - they're expected during cleanup
        } finally {
          completionDisposableRef.current = null;
        }
      }
      
      // Dispose keyboard shortcut with better error handling
      if (keyboardDisposableRef.current) {
        try {
          // Check if dispose method exists before calling
          if (typeof keyboardDisposableRef.current.dispose === 'function') {
            keyboardDisposableRef.current.dispose();
          }
        } catch (e) {
          // Silently ignore Monaco disposal errors - they're expected during cleanup
        } finally {
          keyboardDisposableRef.current = null;
        }
      }
    };
  }, []);

  // Determine Monaco theme based on app theme
  const editorTheme = theme === "light" ? "light" : "vs-dark";

  return (
    <div className="h-full w-full border rounded-md overflow-hidden bg-background relative">
      {!isEditorReady && (
        <div className="absolute inset-0 z-10">
          <Skeleton className="h-full w-full" />
        </div>
      )}
      <Editor
        height="100%"
        defaultLanguage="sql"
        defaultValue={query || ""} // Use defaultValue - controlled mode causes issues
        theme={editorTheme}
        onChange={(value) => {
          console.log("🔥 MONACO EDITOR onChange:", { value, timestamp: new Date().toISOString() });
          onChange(value);
        }}
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