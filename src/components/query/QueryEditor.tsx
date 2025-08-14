import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useAtom, useSetAtom } from "jotai";
import {
  queryAtom,
  queryResultsAtom,
  executeQueryAtom,
  queryLoadingAtom,
  setQueryAtom,
  selectedDbAtom,
  selectedTableAtom,
  getColumnsAtom,
  setSelectedTableAtom,
  autoCompleteSchemaAtom,
  timeRangeAtom,
  selectedTimeFieldAtom,
  hasTimeVariablesAtom,
  setTimeRangeAtom,
  setSelectedTimeFieldAtom,
  setHasTimeVariablesAtom,
  forceReloadCurrentTableSchemaAtom,
} from "@/atoms";
import { toast } from "sonner";
import ChatPanelCompact from "@/components/chat/ChatPanelCompact";
import { QueryEditorToolbar, QueryEditorSelectors, MonacoSqlEditor } from "./";
import { checkForTimeVariables, detectTimeFieldsFromSchema } from "@/lib/query-processor";

export default function QueryEditor() {
  const [query] = useAtom(queryAtom);
  const [queryResults] = useAtom(queryResultsAtom);
  const [isLoading] = useAtom(queryLoadingAtom);
  const [selectedDb] = useAtom(selectedDbAtom);
  const [selectedTable] = useAtom(selectedTableAtom);
  const [timeRange] = useAtom(timeRangeAtom);
  const [selectedTimeField] = useAtom(selectedTimeFieldAtom);
  const [hasTimeVariables] = useAtom(hasTimeVariablesAtom);
  const [getColumns] = useAtom(getColumnsAtom);
  const [autoCompleteSchema] = useAtom(autoCompleteSchemaAtom);
  const setQuery = useSetAtom(setQueryAtom);
  const executeQuery = useSetAtom(executeQueryAtom);
  const setSelectedTableAction = useSetAtom(setSelectedTableAtom);
  const setSelectedTimeField = useSetAtom(setSelectedTimeFieldAtom);
  const setHasTimeVariables = useSetAtom(setHasTimeVariablesAtom);
  const forceReloadSchema = useSetAtom(forceReloadCurrentTableSchemaAtom);

  // Use schema to get columns for table
  const getColumnsForTable = (tableName: string) => getColumns(tableName);

  // Load chat panel state from localStorage
  const [showChatPanel, setShowChatPanel] = useState(() => {
    const saved = localStorage.getItem("gigaapi_show_chat_panel");
    return saved !== null ? saved === "true" : false; // Default to closed
  });

  // Create refs for editor
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  // Get time field options from schema
  const timeFieldOptions = useMemo(() => {
    if (!selectedTable) return [];
    const columns = getColumnsForTable(selectedTable);
    const detectedTimeFields = columns
      ? detectTimeFieldsFromSchema(columns)
      : [];

    return detectedTimeFields;
  }, [selectedTable, getColumnsForTable]);

  // Handle time field selection
  const handleTimeFieldChange = useCallback(
    (value: string) => {
      if (value === "_NO_TIME_FIELDS_") {
        return;
      }
      setSelectedTimeField(value);
    },
    [setSelectedTimeField]
  );

  // Handle time range change
  const setTimeRange = useSetAtom(setTimeRangeAtom);
  const [shouldAutoExecute, setShouldAutoExecute] = useState(false);
  
  const handleTimeRangeChange = useCallback(
    (newTimeRange: any) => {
      setTimeRange(newTimeRange);
      
      // Mark that we should auto-execute if conditions are met
      if (queryResults && queryResults.length > 0 && hasTimeVariables && query.trim()) {
        setShouldAutoExecute(true);
      }
    },
    [setTimeRange, queryResults, hasTimeVariables, query]
  );
  
  // Auto-execute query when time range changes and conditions are met
  useEffect(() => {
    if (shouldAutoExecute) {
      handleRunQuery();
      setShouldAutoExecute(false);
    }
  }, [shouldAutoExecute]);

  // Handle running query with timeout protection - NOT using useCallback to avoid stale closures
  const handleRunQuery = async () => {
    // Force sync the editor content before running
    let finalQuery = query;
    if (editorRef.current) {
      const currentEditorContent = editorRef.current.getValue() || "";
      if (currentEditorContent !== query) {
        setQuery(currentEditorContent);
        finalQuery = currentEditorContent; // Use the editor content immediately
      }
    }

    if (!selectedDb) {
      toast.error("Please select a database first");
      return;
    }

    // Prevent empty query execution
    const trimmedQuery = finalQuery.trim();
    if (!trimmedQuery) {
      toast.error("Please enter a query to execute");
      return;
    }
    executeQuery();
  };

  // Handle clearing query
  const handleClearQuery = useCallback(() => {
    setQuery("");
    if (editorRef.current) {
      editorRef.current.setValue("");
    }
  }, [setQuery]);

  // Handle refreshing schema
  const handleRefreshSchema = useCallback(() => {
    forceReloadSchema();
  }, [forceReloadSchema]);

  // Handle editor change - FIXED: immediate update, no debounce
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      const newQuery = value || "";

      // Update immediately - the editor is the source of truth
      setQuery(newQuery);

      // Check for time variables and update immediately
      const hasTimeVars = checkForTimeVariables(newQuery);

      if (hasTimeVars !== hasTimeVariables) {
        setHasTimeVariables(hasTimeVars);
      }

      // Auto-select first time field if time variables are detected and no field is selected
      if (hasTimeVars && !selectedTimeField && timeFieldOptions.length > 0) {
        setSelectedTimeField(timeFieldOptions[0]);
      }
    },
    [
      setQuery,
      hasTimeVariables,
      setHasTimeVariables,
      selectedTimeField,
      timeFieldOptions,
      setSelectedTimeField,
    ]
  );

  // Handle editor mount
  const handleEditorMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Apply theme
    editor.updateOptions({
      theme: "vs-dark", // You can make this dynamic based on theme
    });

    // Layout editor
    setTimeout(() => editor.layout(), 0);
  }, []);

  // Add a getter for the time field details
  const getTimeFieldDetails = useCallback(
    (fieldName: string) => {
      if (!selectedDb || !selectedTable) return null;
      const columns = getColumnsForTable(selectedTable);
      if (!columns) return null;
      return columns.find((col) => col.columnName === fieldName) || null;
    },
    [selectedDb, selectedTable, getColumnsForTable]
  );

  // Save chat panel state to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("gigaapi_show_chat_panel", showChatPanel.toString());
  }, [showChatPanel]);

  // Add global keyboard shortcut handler for Cmd+R
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if Cmd+R (Mac) or Ctrl+R (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === "r") {
        // Only prevent default and run query if the editor is focused
        const activeElement = document.activeElement;
        const isEditorFocused =
          activeElement?.closest(".monaco-editor") !== null;

        if (isEditorFocused) {
          e.preventDefault();
          e.stopPropagation();
          handleRunQuery();
        }
      }
    };

    // Add event listener
    window.addEventListener("keydown", handleKeyDown, true);

    // Cleanup
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [selectedDb, query]); // Dependencies for handleRunQuery

  // Check for time variables on initial mount and when query changes from outside
  useEffect(() => {
    const hasTimeVars = checkForTimeVariables(query);

    if (hasTimeVars !== hasTimeVariables) {
      setHasTimeVariables(hasTimeVars);
    }
  }, [query, hasTimeVariables, setHasTimeVariables]);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Query Editor Toolbar */}
      <div className="space-y-2 flex">
        <QueryEditorToolbar
          isLoading={isLoading}
          selectedDb={selectedDb}
          selectedTable={selectedTable || undefined}
          selectedTimeField={selectedTimeField}
          timeRange={timeRange}
          query={query}
          mcpConnected={false}
          showChatPanel={showChatPanel}
          chatSessionsCount={0}
          onRunQuery={handleRunQuery}
          onClearQuery={handleClearQuery}
          onToggleChat={() => {
            setShowChatPanel(!showChatPanel);
          }}
          onRefreshSchema={handleRefreshSchema}
        />

        {/* Database, Table, and Time Selectors */}
        <QueryEditorSelectors
          selectedDb={selectedDb}
          selectedTable={selectedTable || undefined}
          selectedTimeField={selectedTimeField}
          timeRange={timeRange}
          hasTimeVariables={hasTimeVariables}
          timeFieldOptions={timeFieldOptions}
          onTableChange={setSelectedTableAction}
          onTimeFieldChange={handleTimeFieldChange}
          onTimeRangeChange={handleTimeRangeChange}
          getTimeFieldDetails={getTimeFieldDetails}
        />
      </div>

      {/* Main content area with optional split view */}
      <div className="flex-1 flex gap-2 min-h-0">
        {/* Monaco SQL Editor */}
        <div
          className={`${
            showChatPanel ? "w-1/2" : "w-full"
          } h-full flex flex-col transition-all duration-300`}
        >
          <MonacoSqlEditor
            query={query}
            isLoading={isLoading}
            schema={autoCompleteSchema}
            selectedDb={selectedDb}
            onChange={handleEditorChange}
            onMount={handleEditorMount}
            onRunQuery={handleRunQuery}
          />
        </div>

        {/* Chat Panel */}
        {showChatPanel && (
          <div className="w-1/2 h-full">
            <ChatPanelCompact
              query={query}
              selectedDb={selectedDb}
              selectedTable={selectedTable}
              onInsertSuggestion={(suggestion) => {
                // Insert suggestion at current cursor position or replace selection
                if (editorRef.current) {
                  const selection = editorRef.current.getSelection();
                  const id = { major: 1, minor: 1 };
                  const text = suggestion;
                  const op = {
                    identifier: id,
                    range: selection,
                    text: text,
                    forceMoveMarkers: true,
                  };
                  editorRef.current.executeEdits("insert-suggestion", [op]);
                  editorRef.current.focus();
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
