import { useState, useEffect } from "react";
import { useAtom, useSetAtom } from "jotai";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Database,
  AlertTriangle,
  FileText,
  RefreshCw,
  CheckCircle,
  Loader2,
  ChevronRight,
  ChevronDown,
  Info,
  Settings,
  Code,
  X,
  Plus,
  Table,
  LucideCheckSquare,
  Bot,
  Cpu,
} from "lucide-react";
import { toast } from "sonner";
import type { ChatSession } from "@/types/chat.types";
import {
  availableDatabasesAtom,
  tablesListForAIAtom,
  fetchAllSchemasAtom,
  aiConnectionsAtom,
  activeConnectionIdAtom,
  updateSessionConnectionAtom,
  fetchModelsForConnectionAtom,
} from "@/atoms";

interface ChatContextSheetProps {
  isOpen: boolean;
  onClose: () => void;
  session: ChatSession;
  onUpdate: (context: ChatSession["context"]) => void;
}

export default function ChatContextSheet({
  isOpen,
  onClose,
  session,
  onUpdate,
}: ChatContextSheetProps) {
  // Get data from atoms
  const [availableDatabases] = useAtom(availableDatabasesAtom);
  const [tablesForAI] = useAtom(tablesListForAIAtom);
  const [aiConnections] = useAtom(aiConnectionsAtom);
  const [activeConnectionId] = useAtom(activeConnectionIdAtom);
  const [localContext, setLocalContext] = useState(session.context);
  const [showAllWarning, setShowAllWarning] = useState(false);
  const [isFetchingSchemas, setIsFetchingSchemas] = useState(false);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState(
    session.aiConnectionId || activeConnectionId || ""
  );
  const [selectedModel, setSelectedModel] = useState(session.model || "");
  const fetchAllSchemas = useSetAtom(fetchAllSchemasAtom);
  const updateSessionConnection = useSetAtom(updateSessionConnectionAtom);
  const fetchModelsForConnection = useSetAtom(fetchModelsForConnectionAtom);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  // Sync session context changes to local context
  useEffect(() => {
    setLocalContext(session.context);
  }, [session.context]);

  // Predefined models for each provider
  const predefinedModels: Record<string, string[]> = {
    openai: [
      "gpt-4-turbo-preview",
      "gpt-4",
      "gpt-3.5-turbo",
      "gpt-3.5-turbo-16k",
    ],
    anthropic: [
      "claude-3-opus-20240229",
      "claude-3-sonnet-20240229",
      "claude-3-haiku-20240307",
    ],
    deepseek: ["deepseek-chat", "deepseek-coder"],
  };

  // Load models when connection changes
  useEffect(() => {
    const selectedConnection = aiConnections.find(
      (c) => c.id === selectedConnectionId
    );
    if (selectedConnection) {
      if (selectedConnection.provider === "ollama") {
        // For Ollama, we'll fetch models dynamically
        setAvailableModels([]);
      } else if (selectedConnection.provider in predefinedModels) {
        // For known providers, use predefined models
        setAvailableModels(predefinedModels[selectedConnection.provider]);
      } else {
        // For custom providers, empty list
        setAvailableModels([]);
      }
    }
  }, [selectedConnectionId, aiConnections]);

  const handleDatabaseToggle = (database: string, checked: boolean) => {
    const newSelected = checked
      ? [...localContext.databases.selected, database]
      : localContext.databases.selected.filter((db) => db !== database);

    setLocalContext({
      ...localContext,
      databases: {
        ...localContext.databases,
        selected: newSelected,
      },
    });
    setHasUnsavedChanges(true);
  };

  const handleSelectAllDatabases = (checked: boolean) => {
    setShowAllWarning(checked);
    setLocalContext({
      ...localContext,
      databases: {
        selected: checked ? availableDatabases : [],
        includeAll: checked,
      },
    });
    setHasUnsavedChanges(true);
  };

  const handleTableToggle = (
    database: string,
    table: string,
    checked: boolean
  ) => {
    const dbTables = localContext.tables[database] || {
      selected: [],
      includeAll: false,
    };
    const newSelected = checked
      ? [...dbTables.selected, table]
      : dbTables.selected.filter((t) => t !== table);

    setLocalContext({
      ...localContext,
      tables: {
        ...localContext.tables,
        [database]: {
          ...dbTables,
          selected: newSelected,
        },
      },
    });
    setHasUnsavedChanges(true);
  };

  const handleFetchSchemas = async () => {
    setIsFetchingSchemas(true);
    try {
      const result = await fetchAllSchemas(session.id);

      // The schemas are already saved in the atom, but we also update local state
      // The useEffect will sync this back when session.context changes
      if (result.errors.length > 0) {
        toast.warning(`Fetched schemas with ${result.errors.length} errors`);
      } else {
        const schemaCount = Object.values(result.schemas).reduce(
          (sum, tables) => sum + Object.keys(tables).length,
          0
        );
        toast.success(`Fetched ${schemaCount} table schemas successfully`);
      }
    } catch (error) {
      toast.error("Failed to fetch schemas");
      console.error("Error fetching schemas:", error);
    } finally {
      setIsFetchingSchemas(false);
    }
  };

  const handleSave = async () => {
    // Update context
    onUpdate(localContext);

    // Update AI connection and model if changed
    if (
      selectedConnectionId !== session.aiConnectionId ||
      selectedModel !== session.model
    ) {
      await updateSessionConnection(
        session.id,
        selectedConnectionId,
        selectedModel
      );
    }

    setHasUnsavedChanges(false);
    onClose();
    toast.success("Chat context updated");
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[700px] sm:max-w-[700px] flex flex-col overflow-hidden p-0 bg-background/95 backdrop-blur-sm border-l border-border/40">
        <div className="px-6 pt-6 pb-3 border-b border-border/40">
          <SheetHeader>
            <SheetTitle className="text-xl font-semibold tracking-tight">
              Chat Context Configuration
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              Configure what data and instructions are sent with every message
              in this chat.
            </SheetDescription>
          </SheetHeader>
        </div>

        <Tabs
          defaultValue="ai"
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="px-6 py-3 border-b border-border/40">
            <TabsList className="grid w-full grid-cols-3 h-10">
              <TabsTrigger
                value="ai"
                className="flex items-center gap-2 text-sm"
              >
                <Bot className="w-4 h-4" />
                AI Model
              </TabsTrigger>
              <TabsTrigger
                value="data"
                className="flex items-center gap-2 text-sm"
              >
                <Database className="w-4 h-4" />
                Data Sources
              </TabsTrigger>
              <TabsTrigger
                value="instructions"
                className="flex items-center gap-2 text-sm"
              >
                <FileText className="w-4 h-4" />
                Instructions
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1">
            <div className="px-6 py-4">
              <TabsContent value="ai" className="space-y-6 mt-0">
                {/* AI Model Selection */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium text-sm">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-medium">
                        AI Provider & Model
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Select which AI provider and model to use for this chat
                      </p>
                    </div>
                  </div>

                  {/* Provider Selection */}
                  <div className="space-y-3">
                    <div>
                      <Label
                        htmlFor="ai-provider"
                        className="text-sm font-medium"
                      >
                        AI Provider
                      </Label>
                      {aiConnections.length === 0 ? (
                        <div className="mt-2 p-4 border-2 border-dashed rounded-lg text-center">
                          <Bot className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground mb-3">
                            No AI connections configured yet
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              onClose();
                              // Open AI connection sheet
                              const event = new CustomEvent(
                                "openAIConnectionSheet"
                              );
                              window.dispatchEvent(event);
                            }}
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Add AI Connection
                          </Button>
                        </div>
                      ) : (
                        <Select
                          value={selectedConnectionId}
                          onValueChange={(value) => {
                            setSelectedConnectionId(value);
                            setSelectedModel(""); // Reset model when provider changes
                            setHasUnsavedChanges(true);
                          }}
                        >
                          <SelectTrigger
                            id="ai-provider"
                            className="w-full mt-2"
                          >
                            <SelectValue placeholder="Select an AI provider" />
                          </SelectTrigger>
                          <SelectContent>
                            {aiConnections.map((connection) => (
                              <SelectItem
                                key={connection.id}
                                value={connection.id}
                              >
                                <div className="flex items-center gap-2">
                                  <Bot className="w-4 h-4" />
                                  <span>{connection.name}</span>
                                  <Badge
                                    variant="outline"
                                    className="ml-2 text-xs"
                                  >
                                    {connection.provider}
                                  </Badge>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {/* Model Selection */}
                    {selectedConnectionId &&
                      (() => {
                        const selectedConnection = aiConnections.find(
                          (c) => c.id === selectedConnectionId
                        );

                        return (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <Label
                                htmlFor="ai-model"
                                className="text-sm font-medium"
                              >
                                Model
                              </Label>
                              {selectedConnection?.modelsUrl && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={async () => {
                                    setIsFetchingModels(true);
                                    try {
                                      const models =
                                        await fetchModelsForConnection(
                                          selectedConnectionId
                                        );
                                      setAvailableModels(models);
                                      toast.success(
                                        `Found ${models.length} models`
                                      );
                                    } catch (error) {
                                      toast.error("Failed to fetch models");
                                    } finally {
                                      setIsFetchingModels(false);
                                    }
                                  }}
                                  disabled={isFetchingModels}
                                  className="h-7 text-xs"
                                >
                                  {isFetchingModels ? (
                                    <>
                                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />{" "}
                                      Fetching...
                                    </>
                                  ) : (
                                    <>
                                      <RefreshCw className="w-3 h-3 mr-1" />{" "}
                                      Fetch Models
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                            <Select
                              value={selectedModel}
                              onValueChange={(value) => {
                                setSelectedModel(value);
                                setHasUnsavedChanges(true);
                              }}
                            >
                              <SelectTrigger
                                id="ai-model"
                                className="w-full mt-2"
                              >
                                <SelectValue placeholder="Select a model" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableModels.length === 0 ? (
                                  <SelectItem value="none" disabled>
                                    No models available
                                  </SelectItem>
                                ) : (
                                  availableModels.map((model: string) => (
                                    <SelectItem key={model} value={model}>
                                      <div className="flex items-center justify-between w-full">
                                        <span className="font-mono text-sm">
                                          {model}
                                        </span>
                                      </div>
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                            {selectedConnection && (
                              <div className="mt-2 text-xs text-muted-foreground">
                                Using {selectedConnection.provider} at{" "}
                                {selectedConnection.baseUrl}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                  </div>

                  {/* Current Status */}
                  {selectedConnectionId && selectedModel && (
                    <Alert className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/30">
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <AlertDescription className="text-xs text-green-800 dark:text-green-300">
                        This chat will use <strong>{selectedModel}</strong> from{" "}
                        {
                          aiConnections.find(
                            (c) => c.id === selectedConnectionId
                          )?.name
                        }
                      </AlertDescription>
                    </Alert>
                  )}

                  {!selectedConnectionId && aiConnections.length > 0 && (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        No AI provider selected. Please select a provider and
                        model above.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="data" className="space-y-6 mt-0">
                {/* Step 1: Database Selection */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium text-sm">
                      1
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-medium">
                          Select Databases
                        </h3>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="all-databases"
                            checked={localContext.databases.includeAll}
                            onCheckedChange={handleSelectAllDatabases}
                            className="h-4 w-4 rounded-sm"
                          />
                          <Label
                            htmlFor="all-databases"
                            className="text-xs font-normal cursor-pointer"
                          >
                            Select all databases
                          </Label>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Choose which databases to include in this chat context
                      </p>
                    </div>
                  </div>

                  {showAllWarning && (
                    <Alert
                      variant="destructive"
                      className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/30 text-amber-800 dark:text-amber-300"
                    >
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Selecting all databases will significantly increase
                        token usage and costs. Only recommended for
                        comprehensive analysis tasks.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-1 mt-2">
                    {availableDatabases.length === 0 ? (
                      <div className="text-center py-6 text-sm text-muted-foreground">
                        No databases available
                      </div>
                    ) : (
                      <div className="grid gap-1">
                        {availableDatabases.map((db) => (
                          <div key={db} className="rounded-lg overflow-hidden">
                            <div
                              className={`flex items-center p-2.5 ${
                                localContext.databases.selected.includes(db)
                                  ? "bg-muted/80 rounded-t-lg"
                                  : "hover:bg-muted/50 rounded-lg"
                              } transition-colors`}
                            >
                              <Checkbox
                                id={`db-${db}`}
                                checked={localContext.databases.selected.includes(
                                  db
                                )}
                                onCheckedChange={(checked) =>
                                  handleDatabaseToggle(db, checked as boolean)
                                }
                                className="h-4 w-4 rounded-sm"
                              />
                              <Label
                                htmlFor={`db-${db}`}
                                className="flex items-center justify-between flex-1 text-sm font-medium cursor-pointer ml-3"
                              >
                                <div className="flex items-center gap-2">
                                  <Database className="w-3.5 h-3.5 text-primary/70" />
                                  {db}
                                </div>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 h-5 bg-background/80 dark:bg-background/30"
                                >
                                  {tablesForAI[db]?.length || 0} tables
                                </Badge>
                              </Label>
                            </div>

                            {/* Table Selection for this database */}
                            {localContext.databases.selected.includes(db) &&
                              tablesForAI[db] && (
                                <div className="bg-muted/40 border-t border-border/20 rounded-b-lg overflow-hidden">
                                  <div className="px-3 py-2 flex items-center justify-between text-xs border-b border-border/10">
                                    <span className="text-muted-foreground">
                                      Tables in {db}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        const allTables = tablesForAI[db] || [];
                                        setLocalContext({
                                          ...localContext,
                                          tables: {
                                            ...localContext.tables,
                                            [db]: {
                                              selected: allTables,
                                              includeAll: true,
                                            },
                                          },
                                        });
                                        setHasUnsavedChanges(true);
                                      }}
                                      className="h-6 text-xs px-2"
                                    >
                                      <LucideCheckSquare className="h-3 w-3 mr-1" />
                                      Select all tables
                                    </Button>
                                  </div>

                                  <div className="p-1">
                                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                                      {(tablesForAI[db] || []).map(
                                        (table: string) => (
                                          <div
                                            key={table}
                                            className="flex items-center py-1 px-2 hover:bg-muted/70 rounded-md transition-colors"
                                          >
                                            <Checkbox
                                              id={`table-${db}-${table}`}
                                              checked={
                                                localContext.tables[
                                                  db
                                                ]?.selected.includes(table) ||
                                                false
                                              }
                                              onCheckedChange={(checked) =>
                                                handleTableToggle(
                                                  db,
                                                  table,
                                                  checked as boolean
                                                )
                                              }
                                              className="h-3.5 w-3.5 rounded-sm"
                                            />
                                            <Label
                                              htmlFor={`table-${db}-${table}`}
                                              className="flex items-center text-xs cursor-pointer ml-2 truncate"
                                            >
                                              <Table className="w-3 h-3 mr-1.5 text-muted-foreground" />
                                              <span className="truncate">
                                                {table}
                                              </span>
                                            </Label>
                                          </div>
                                        )
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 2: Schema Fetching Section */}
                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium text-sm">
                      2
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-medium">Table Schemas</h3>
                        <Button
                          onClick={handleFetchSchemas}
                          disabled={
                            isFetchingSchemas ||
                            localContext.databases.selected.length === 0
                          }
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5"
                        >
                          {isFetchingSchemas ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Fetching...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3.5 h-3.5" />
                              Fetch All Schemas
                            </>
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Load column information for accurate SQL generation
                      </p>
                    </div>
                  </div>

                  {Object.keys(localContext.schemas || {}).length === 0 &&
                    localContext.databases.selected.length > 0 && (
                      <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 py-3">
                        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <AlertDescription className="text-xs text-blue-800 dark:text-blue-300">
                          Click "Fetch All Schemas" to load column information
                          for the selected tables. This helps the AI generate
                          more accurate SQL queries.
                        </AlertDescription>
                      </Alert>
                    )}

                  {/* Schema Preview */}
                  {Object.keys(localContext.schemas || {}).length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                        <CheckCircle className="w-4 h-4" />
                        <span className="font-medium">Loaded Schemas</span>
                      </div>
                      <div className="rounded-lg overflow-hidden border border-border/40 divide-y divide-border/40">
                        {Object.entries(localContext.schemas || {}).map(
                          ([db, tables], dbIndex) => (
                            <div
                              key={db}
                              className={
                                dbIndex !== 0 ? "border-t border-border/40" : ""
                              }
                            >
                              <div className="bg-muted/30 px-3 py-2 font-medium text-xs flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <Database className="w-3.5 h-3.5 text-primary/70" />
                                  {db}
                                </div>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 h-5 bg-background/50"
                                >
                                  {Object.keys(tables).length} tables
                                </Badge>
                              </div>
                              <div className="divide-y divide-border/20">
                                {Object.entries(tables).map(
                                  ([table, schema]) => {
                                    const tableKey = `${db}.${table}`;
                                    const isExpanded =
                                      expandedTables.has(tableKey);

                                    return (
                                      <Collapsible
                                        key={table}
                                        open={isExpanded}
                                        onOpenChange={(open) => {
                                          const newExpanded = new Set(
                                            expandedTables
                                          );
                                          if (open) {
                                            newExpanded.add(tableKey);
                                          } else {
                                            newExpanded.delete(tableKey);
                                          }
                                          setExpandedTables(newExpanded);
                                        }}
                                      >
                                        <CollapsibleTrigger className="w-full text-left">
                                          <div className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-muted/50 transition-colors">
                                            <div className="w-4 h-4 flex items-center justify-center text-muted-foreground">
                                              {isExpanded ? (
                                                <ChevronDown className="w-3.5 h-3.5" />
                                              ) : (
                                                <ChevronRight className="w-3.5 h-3.5" />
                                              )}
                                            </div>
                                            <Table className="w-3.5 h-3.5 text-primary/80" />
                                            <span className="font-mono text-xs truncate">
                                              {table}
                                            </span>
                                            <Badge
                                              variant="secondary"
                                              className="ml-1.5 text-[10px] px-1.5 h-5"
                                            >
                                              {schema.length} columns
                                            </Badge>
                                          </div>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent>
                                          <div className="bg-muted/20 border-t border-border/10 overflow-x-auto">
                                            <table className="w-full border-collapse text-xs">
                                              <thead className="bg-muted/40">
                                                <tr className="text-[10px] text-muted-foreground">
                                                  <th className="px-3 py-1.5 text-left font-medium">
                                                    Column
                                                  </th>
                                                  <th className="px-3 py-1.5 text-left font-medium">
                                                    Type
                                                  </th>
                                                  <th className="px-3 py-1.5 text-left font-medium">
                                                    Attributes
                                                  </th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-border/10">
                                                {schema.map((col, idx) => {
                                                  const isPrimaryKey =
                                                    col.key === "PRI";
                                                  const isNullable =
                                                    col.null === "YES";
                                                  const isTimeField =
                                                    col.column_name
                                                      .toLowerCase()
                                                      .includes("time") ||
                                                    col.column_type
                                                      .toLowerCase()
                                                      .includes("timestamp");

                                                  return (
                                                    <tr
                                                      key={idx}
                                                      className="hover:bg-muted/40 transition-colors"
                                                    >
                                                      <td className="px-3 py-1.5 font-mono">
                                                        {isPrimaryKey && (
                                                          <span className="inline-block w-2 h-2 mr-1.5 rounded-full bg-amber-500" />
                                                        )}
                                                        {col.column_name}
                                                      </td>
                                                      <td className="px-3 py-1.5 font-mono text-primary whitespace-nowrap">
                                                        {col.column_type}
                                                        {isTimeField && (
                                                          <span className="text-[10px] ml-1.5 text-sky-500">
                                                            TIME
                                                          </span>
                                                        )}
                                                      </td>
                                                      <td className="px-3 py-1.5">
                                                        <div className="flex gap-1.5 flex-wrap">
                                                          {isPrimaryKey && (
                                                            <Badge
                                                              variant="outline"
                                                              className="text-[10px] px-1 py-0 h-4 border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-400"
                                                            >
                                                              PRIMARY
                                                            </Badge>
                                                          )}
                                                          {!isNullable && (
                                                            <Badge
                                                              variant="outline"
                                                              className="text-[10px] px-1 py-0 h-4 border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/50 dark:bg-rose-950/30 dark:text-rose-400"
                                                            >
                                                              NOT NULL
                                                            </Badge>
                                                          )}
                                                        </div>
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        </CollapsibleContent>
                                      </Collapsible>
                                    );
                                  }
                                )}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="instructions" className="space-y-6 mt-0">
                {/* System Instructions */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-medium text-sm">
                      <Settings className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-medium">
                        System Instructions
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Built-in instructions for accurate responses
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg overflow-hidden border border-border/40">
                    <div className="bg-muted/30 px-3 py-2 text-xs font-medium flex items-center gap-2 border-b border-border/40">
                      <Code className="w-3.5 h-3.5 text-primary/70" />
                      System Prompt
                    </div>
                    <div className="p-3 bg-muted/10 text-xs font-mono leading-relaxed overflow-auto max-h-[200px]">
                      {localContext.instructions.system}
                    </div>
                  </div>
                </div>

                {/* Custom Instructions */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium text-sm">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-medium">
                        Custom Instructions
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Add specific instructions for this chat session
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {localContext.instructions.user.length === 0 ? (
                      <div className="bg-muted/20 rounded-lg p-6 flex flex-col items-center justify-center">
                        <p className="text-sm text-muted-foreground text-center max-w-md">
                          No custom instructions yet. Add instructions to guide
                          the AI's responses in this chat session.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setLocalContext({
                              ...localContext,
                              instructions: {
                                ...localContext.instructions,
                                user: [...localContext.instructions.user, ""],
                                active: [
                                  ...localContext.instructions.active,
                                  true,
                                ],
                              },
                            });
                            setHasUnsavedChanges(true);
                          }}
                          className="mt-3"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1.5" />
                          Add First Instruction
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {localContext.instructions.user.map(
                            (instruction, idx) => (
                              <div
                                key={idx}
                                className="group rounded-lg border border-border/40 overflow-hidden"
                              >
                                <div className="bg-muted/30 px-3 py-2 flex items-center justify-between border-b border-border/40">
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      checked={
                                        localContext.instructions.active[idx]
                                      }
                                      onCheckedChange={(checked) => {
                                        const newActive = [
                                          ...localContext.instructions.active,
                                        ];
                                        newActive[idx] = checked as boolean;
                                        setLocalContext({
                                          ...localContext,
                                          instructions: {
                                            ...localContext.instructions,
                                            active: newActive,
                                          },
                                        });
                                        setHasUnsavedChanges(true);
                                      }}
                                      className="h-4 w-4 rounded-sm"
                                    />
                                    <span
                                      className={`text-xs font-medium ${
                                        !localContext.instructions.active[idx]
                                          ? "text-muted-foreground"
                                          : ""
                                      }`}
                                    >
                                      Instruction {idx + 1}
                                    </span>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const newInstructions =
                                        localContext.instructions.user.filter(
                                          (_, i) => i !== idx
                                        );
                                      const newActive =
                                        localContext.instructions.active.filter(
                                          (_, i) => i !== idx
                                        );
                                      setLocalContext({
                                        ...localContext,
                                        instructions: {
                                          ...localContext.instructions,
                                          user: newInstructions,
                                          active: newActive,
                                        },
                                      });
                                      setHasUnsavedChanges(true);
                                    }}
                                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                                <Textarea
                                  value={instruction}
                                  onChange={(e) => {
                                    const newInstructions = [
                                      ...localContext.instructions.user,
                                    ];
                                    newInstructions[idx] = e.target.value;
                                    setLocalContext({
                                      ...localContext,
                                      instructions: {
                                        ...localContext.instructions,
                                        user: newInstructions,
                                      },
                                    });
                                    setHasUnsavedChanges(true);
                                  }}
                                  className={`w-full min-h-[80px] border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 ${
                                    !localContext.instructions.active[idx]
                                      ? "opacity-60"
                                      : ""
                                  }`}
                                  placeholder="Enter custom instruction..."
                                />
                              </div>
                            )
                          )}
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setLocalContext({
                              ...localContext,
                              instructions: {
                                ...localContext.instructions,
                                user: [...localContext.instructions.user, ""],
                                active: [
                                  ...localContext.instructions.active,
                                  true,
                                ],
                              },
                            });
                            setHasUnsavedChanges(true);
                          }}
                          className="w-full"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1.5" />
                          Add Another Instruction
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <div className="px-6 py-4 mt-auto border-t border-border/40 bg-background/95 backdrop-blur-sm">
          <SheetFooter className="flex-row items-center justify-between w-full">
            <div className="text-xs text-muted-foreground">
              {(() => {
                const dbCount = localContext.databases.selected.length;
                const tableCount = Object.values(localContext.tables).reduce(
                  (acc, db) => acc + (db.selected?.length || 0),
                  0
                );
                const schemaCount = Object.values(
                  localContext.schemas || {}
                ).reduce((acc, db) => acc + Object.keys(db).length, 0);

                return (
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="px-1.5 h-5 bg-background"
                    >
                      {dbCount} database{dbCount !== 1 ? "s" : ""}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="px-1.5 h-5 bg-background"
                    >
                      {tableCount} table{tableCount !== 1 ? "s" : ""}
                    </Badge>
                    {schemaCount > 0 && (
                      <Badge
                        variant="outline"
                        className="px-1.5 h-5 bg-background"
                      >
                        {schemaCount} schema{schemaCount !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} size="sm">
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                size="sm"
                variant={hasUnsavedChanges ? "default" : "secondary"}
                className="min-w-[100px] relative"
              >
                {hasUnsavedChanges && (
                  <span className="absolute top-1 left-2 w-1.5 h-1.5 rounded-full bg-background animate-pulse" />
                )}
                Save Context
              </Button>
            </div>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
