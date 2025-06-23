import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useQuery } from "@/contexts/QueryContext";
import { useDatabase } from "@/contexts/DatabaseContext";
import { useTime } from "@/contexts/TimeContext";
import { useMCP } from "@/contexts/MCPContext";
import { toast } from "sonner";
import ChatPanel from "@/components/MCP/ChatPanel";
import {
  TimeVariablesPreview,
  QueryEditorToolbar,
  QueryEditorSelectors,
  MonacoSqlEditor,
} from "./";
import {
  checkForTimeVariables,
  detectTimeFieldsFromSchema,
  previewProcessedQuery,
} from "@/lib/";

export default function QueryEditor() {
  const { query, setQuery, executeQuery, isLoading } = useQuery();
  const {
    selectedDb,
    selectedTable,
    schema,
    getColumnsForTable,
  } = useDatabase();
  const {
    timeRange,
    setTimeRange,
    selectedTimeField,
    setSelectedTimeField,
    hasTimeVariables,
    setHasTimeVariables,
  } = useTime();
  const { isConnected: mcpConnected } = useMCP();

  const [showChatPanel, setShowChatPanel] = useState(false);

  // Create refs for editor
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  // Get time field options from schema
  const timeFieldOptions = useMemo(() => {
    if (!selectedTable) return [];
    const columns = getColumnsForTable(selectedTable);
    return columns ? detectTimeFieldsFromSchema(columns) : [];
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
  const handleTimeRangeChange = useCallback(
    (newTimeRange: any) => {
      setTimeRange(newTimeRange);
    },
    [setTimeRange]
  );

  // Handle running query
  const handleRunQuery = useCallback(async () => {
    if (!selectedDb) {
      toast.error("Please select a database first");
      return;
    }

    // Force sync the editor content before running
    if (editorRef.current) {
      const currentEditorContent = editorRef.current.getValue() || "";
      if (currentEditorContent !== query) {
        setQuery(currentEditorContent);
      }
    }

    executeQuery();
  }, [selectedDb, executeQuery, query, setQuery]);

  // Handle clearing query
  const handleClearQuery = useCallback(() => {
    setQuery("");
    if (editorRef.current) {
      editorRef.current.setValue("");
    }
  }, [setQuery]);

  // Handle editor change with real-time time variables detection
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      const newQuery = value || "";
      
      console.log('Editor changed:', { newQuery, length: newQuery.length });
      
      // Always update the context with the current query immediately
      setQuery(newQuery);

      // Update time variables detection in real-time
      const hasTimeVars = checkForTimeVariables(newQuery);
      console.log('Time variables detected:', hasTimeVars);
      setHasTimeVariables(hasTimeVars);

      // Auto-select first time field if time variables are detected and no field is selected
      if (hasTimeVars && !selectedTimeField && timeFieldOptions.length > 0) {
        console.log('Auto-selecting time field:', timeFieldOptions[0]);
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

  // Get processed query preview - always use the most current content
  const processedQueryPreview = useMemo(() => {
    if (!hasTimeVariables) {
      return null;
    }
    
    // Always get the live content from the editor first, fall back to context
    const currentQuery = (editorRef.current?.getValue() || query || "");
    if (!currentQuery.trim()) {
      return null;
    }
    
    const columns = selectedTable ? getColumnsForTable(selectedTable) : null;
    const fieldDetails = columns?.find(col => col.columnName === selectedTimeField) || null;
    
    return previewProcessedQuery(
      currentQuery,
      selectedTimeField,
      timeRange,
      fieldDetails
    );
  }, [hasTimeVariables, query, selectedTimeField, timeRange, selectedTable, getColumnsForTable]);

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

  // Sync editor content when query changes from context (e.g., query history)
  useEffect(() => {
    if (
      editorRef.current &&
      query !== editorRef.current.getValue()
    ) {
      editorRef.current.setValue(query);
    }
  }, [query]);

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
          mcpConnected={mcpConnected}
          showChatPanel={showChatPanel}
          onRunQuery={handleRunQuery}
          onClearQuery={handleClearQuery}
          onToggleChat={() => setShowChatPanel(!showChatPanel)}
        />

        {/* Database, Table, and Time Selectors */}
        <QueryEditorSelectors
          selectedDb={selectedDb}
          selectedTable={selectedTable || undefined}
          selectedTimeField={selectedTimeField}
          timeRange={timeRange}
          hasTimeVariables={hasTimeVariables}
          timeFieldOptions={timeFieldOptions}
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
          } h-full flex flex-col`}
        >
          <MonacoSqlEditor
            query={query}
            isLoading={isLoading}
            schema={schema}
            selectedDb={selectedDb}
            onChange={handleEditorChange}
            onMount={handleEditorMount}
            onRunQuery={handleRunQuery}
          />
        </div>

        {/* Chat Panel */}
        {showChatPanel && (
          <div className="w-1/2 h-full">
            <ChatPanel
              isOpen={showChatPanel}
              onClose={() => setShowChatPanel(false)}
            />
          </div>
        )}
      </div>

      {/* Time Variables Preview Dialog */}
      <TimeVariablesPreview
        hasTimeVariables={hasTimeVariables}
        selectedTimeField={selectedTimeField}
        timeRange={timeRange}
        processedQueryPreview={processedQueryPreview}
        editorContent={editorRef.current?.getValue() || ""}
        contextQuery={query}
      />
    </div>
  );
}