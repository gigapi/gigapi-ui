import { useState, useCallback } from "react";
import { Editor } from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Play,
  Save,
  RefreshCw,
  Clock,
  Database,
  Info,
} from "lucide-react";
import { type PanelConfig } from "@/types/dashboard.types";
import { useDashboard } from "@/contexts/DashboardContext";
import { toast } from "sonner";

interface QueryEditorProps {
  config: PanelConfig;
  onConfigChange: (updates: Partial<PanelConfig>) => void;
  className?: string;
}

export default function QueryEditor({
  config,
  onConfigChange,
  className = "",
}: QueryEditorProps) {
  const [query, setQuery] = useState(config.query);
  const [isExecuting, setIsExecuting] = useState(false);
  const { refreshPanelData, updatePanel } = useDashboard();

  const handleQueryChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setQuery(value);
    }
  }, []);

  const handleSaveQuery = useCallback(async () => {
    try {
      await updatePanel(config.id, { query });
      onConfigChange({ query });
      toast.success("Query saved successfully");
    } catch (error) {
      toast.error("Failed to save query");
      console.error("Error saving query:", error);
    }
  }, [config.id, query, updatePanel, onConfigChange]);

  const handleRunQuery = useCallback(async () => {
    if (!query.trim()) {
      toast.error("Please enter a query");
      return;
    }

    setIsExecuting(true);
    try {
      // Save query first if it's different
      if (query !== config.query) {
        await updatePanel(config.id, { query });
        onConfigChange({ query });
      }
      
      // Refresh panel data
      await refreshPanelData(config.id);
      toast.success("Query executed successfully");
    } catch (error) {
      toast.error("Failed to execute query");
      console.error("Error executing query:", error);
    } finally {
      setIsExecuting(false);
    }
  }, [query, config.id, config.query, updatePanel, onConfigChange, refreshPanelData]);

  const hasUnsavedChanges = query !== config.query;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4" />
          <span className="font-medium text-sm">SQL Query Editor</span>
          {hasUnsavedChanges && (
            <Badge variant="secondary" className="text-xs">
              Unsaved
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Info className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="max-w-sm">
                  <p className="font-medium mb-1">SQL Query Tips:</p>
                  <ul className="text-xs space-y-1">
                    <li>• Use <code>$__timeFilter</code> for automatic time filtering</li>
                    <li>• Example: <code>WHERE timestamp $__timeFilter</code></li>
                    <li>• Queries should return NDJSON format</li>
                    <li>• Use Ctrl+Enter to run query</li>
                  </ul>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveQuery}
            disabled={!hasUnsavedChanges}
          >
            <Save className="w-4 h-4 mr-2" />
            Save
          </Button>
          
          <Button
            variant="default"
            size="sm"
            onClick={handleRunQuery}
            disabled={isExecuting || !query.trim()}
          >
            {isExecuting ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Run
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 relative">
        <Editor
          height="100%"
          defaultLanguage="sql"
          value={query}
          onChange={handleQueryChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            lineNumbers: "on",
            renderWhitespace: "selection",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            wordWrap: "on",
            bracketPairColorization: {
              enabled: true,
            },
            suggest: {
              showKeywords: true,
              showSnippets: true,
            },
            quickSuggestions: {
              other: true,
              comments: false,
              strings: false,
            },
            tabSize: 2,
            insertSpaces: true,
          }}
          onMount={(editor, monaco) => {
            // Add SQL keywords and functions
            monaco.languages.registerCompletionItemProvider('sql', {
              provideCompletionItems: (model, position) => {
                const word = model.getWordUntilPosition(position);
                const range = {
                  startLineNumber: position.lineNumber,
                  endLineNumber: position.lineNumber,
                  startColumn: word.startColumn,
                  endColumn: word.endColumn,
                };

                const suggestions = [
                  {
                    label: '$__timeFilter',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: '$__timeFilter',
                    documentation: 'Automatic time filter based on dashboard time range',
                    range,
                  },
                  {
                    label: 'SELECT ... FROM ... WHERE $__timeFilter',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: 'SELECT ${1:*} FROM ${2:table_name} WHERE ${3:timestamp_column} $__timeFilter',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    documentation: 'Basic query template with time filter',
                    range,
                  },
                ];
                
                return { suggestions };
              },
            });

            // Add keyboard shortcuts
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
              handleRunQuery();
            });

            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
              handleSaveQuery();
            });
          }}
        />
      </div>

      {/* Footer with metadata */}
      <div className="flex items-center justify-between p-2 border-t bg-muted/30 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Panel: {config.title}</span>
          </div>
          <div className="flex items-center gap-1">
            <Database className="w-3 h-3" />
            <span>Type: {config.type}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <span>Ctrl+Enter to run • Ctrl+S to save</span>
        </div>
      </div>
    </div>
  );
}