import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAtom, useSetAtom } from "jotai";
import { useDashboardSafely } from "@/atoms";
import { apiUrlAtom, availableDatabasesAtom, schemaAtom, loadSchemaForDbAtom, setSelectedDbAtom, selectedTableAtom } from "@/atoms";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, RefreshCw, Play } from "lucide-react";
import { MonacoSqlEditor } from "@/components/query";
import { Label } from "@/components/ui/label";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { EnhancedPanel, PanelDataProvider } from "@/components/dashboard/PanelDataProvider";
import { DashboardTimeFilter } from "@/components/dashboard/DashboardTimeFilter";
import { PanelConfigurationForm } from "@/components/dashboard/PanelConfigurationForm";
import { DashboardUnifiedSelector } from "@/components/dashboard/DashboardUnifiedSelector";
import { type PanelConfig } from "@/types/dashboard.types";
import { toast } from "sonner";
import Loader from "@/components/Loader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { SchemaAnalyzer } from "@/lib/dashboard/schema-analyzer";
import { PanelFactory } from "@/lib/dashboard/panel-factory";
import { usePanelQuery } from "@/hooks/usePanelQuery";

interface PanelEditProps {
  dashboardId?: string;
  panelId?: string;
  onSaveSuccess?: () => void;
  onCancel?: () => void;
}

export default function PanelEdit(props?: PanelEditProps) {
  const { dashboardId: routeDashboardId, panelId: routePanelId } = useParams<{
    dashboardId: string;
    panelId?: string;
  }>();
  const navigate = useNavigate();

  const dashboardId = props?.dashboardId || routeDashboardId;
  const panelId = props?.panelId || routePanelId;
  
  console.log("🔥 PANEL EDIT RENDER:", { dashboardId, panelId, props: !!props, timestamp: new Date().toISOString() });

  const dashboardContext = useDashboardSafely();
  
  console.log("🔥 DASHBOARD CONTEXT:", { hasContext: !!dashboardContext, timestamp: new Date().toISOString() });

  if (!dashboardContext) {
    return (
      <div className="p-4 flex-grow flex items-center justify-center">
        <Loader className="w-8 h-8" />
        <p className="ml-2 text-muted-foreground">
          Initializing dashboard context...
        </p>
      </div>
    );
  }

  const {
    currentDashboard,
    loadDashboard,
    updatePanel,
    addPanel,
    getPanelById,
  } = dashboardContext;

  const [apiUrl] = useAtom(apiUrlAtom);
  const [availableDatabases] = useAtom(availableDatabasesAtom);
  const [selectedTable] = useAtom(selectedTableAtom);
  const [schema] = useAtom(schemaAtom);
  const loadSchemaForDb = useSetAtom(loadSchemaForDbAtom);
  const setSelectedDb = useSetAtom(setSelectedDbAtom);

  const [localConfig, setLocalConfig] = useState<Partial<PanelConfig> | null>(
    null
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoadingPanel, setIsLoadingPanel] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const isNewPanel = !panelId;
  
  console.log("🔥 PANEL EDIT STATE:", { 
    currentDashboard: !!currentDashboard, 
    apiUrl, 
    availableDatabases: availableDatabases.length, 
    schema: Object.keys(schema).length, 
    localConfig: !!localConfig, 
    isLoadingPanel, 
    isExecuting, 
    queryError, 
    isNewPanel,
    timestamp: new Date().toISOString() 
  });

  // Helper function to extract table name from SQL query
  const extractTableFromQuery = (query: string): string | null => {
    if (!query) return null;

    // Simple regex to match "FROM table_name" - case insensitive
    const fromMatch = query.match(/FROM\s+([`"]?)(\w+)\1/i);
    if (fromMatch && fromMatch[2]) {
      return fromMatch[2];
    }

    return null;
  };

  const handleConfigChange = useCallback(
    (updates: Partial<PanelConfig>) => {
      if (!localConfig) return;
      const updatedConfig = { ...localConfig, ...updates };
      setLocalConfig(updatedConfig);
      setHasChanges(true);
    },
    [localConfig]
  );

  // Load dashboard context
  useEffect(() => {
    if (
      dashboardId &&
      (!currentDashboard || currentDashboard.id !== dashboardId)
    ) {
      loadDashboard(dashboardId).catch((err) => {
        console.error("Failed to load dashboard for panel edit:", err);
        toast.error("Error loading dashboard context for this panel.");
      });
    }
  }, [dashboardId, currentDashboard, loadDashboard]);

  // Initialize panel config
  useEffect(() => {
    if (!isLoadingPanel) return;

    if (isNewPanel) {
      // Create new panel with structure
      const newPanel = PanelFactory.createPanel({
        type: "timeseries",
        title: "New Panel",
        database: availableDatabases[0] || "",
        table: selectedTable || undefined,
        dashboardId: dashboardId,
      });

      setLocalConfig(newPanel);
      setHasChanges(true);
      setIsLoadingPanel(false);
    } else if (panelId && currentDashboard) {
      const panel = getPanelById(panelId);
      if (panel) {
        // Extract table from query if not already set
        let table = panel.table;
        if (!table && panel.query) {
          table = extractTableFromQuery(panel.query) || undefined;
        }

        // Create a deep copy of the panel to avoid direct mutations
        const panelCopy = JSON.parse(JSON.stringify(panel));
        
        setLocalConfig({
          ...panelCopy,
          table, // Set extracted or existing table
          useParentTimeFilter: true,
        });
        setHasChanges(false);
        setIsLoadingPanel(false);

        // Mark that we should auto-run query after component is ready
        if (panel.query && panel.database && currentDashboard?.timeRange) {
          setTimeout(() => {
            const event = new CustomEvent("autoRunQuery");
            window.dispatchEvent(event);
          }, 200); //  Delay to ensure component is fully loaded
        }
      } else {
        toast.error(
          `Panel with ID ${panelId} not found in the current dashboard.`
        );
        setIsLoadingPanel(false);
      }
    }
  }, [
    isNewPanel,
    panelId,
    currentDashboard,
    getPanelById,
    isLoadingPanel,
    dashboardId,
  ]);

  const handleQueryChange = useCallback(
    (newQuery: string | undefined) => {
      if (!localConfig) return;

      const updatedConfig = { ...localConfig, query: newQuery || "" };
      setLocalConfig(updatedConfig);
      setHasChanges(true);

      // Clear query error when query changes
      if (queryError) {
        setQueryError(null);
      }
    },
    [localConfig, queryError]
  );

  // Create panel config for query execution
  const queryConfig = localConfig ? {
    ...localConfig,
    id: panelId || 'preview',
    title: localConfig.title || 'Preview Panel',
    type: localConfig.type || 'timeseries',
  } as PanelConfig : null;

  // Use the centralized panel query hook
  const { execute: executeQuery } = usePanelQuery({
    panelId: panelId || 'preview',
    config: queryConfig!,
    dashboard: currentDashboard!,
    onSuccess: (data) => {
      setPreviewData(data);
      setIsExecuting(false);
      
      // Extract available fields from the first result
      if (data.length > 0) {
        const fields = Object.keys(data[0]);
        setAvailableFields(fields);
        
        // Auto-suggest field mappings if none are set
        if (!localConfig?.fieldMapping?.yField && !localConfig?.fieldMapping?.xField) {
          const firstRecord = data[0];
          
          // Find numeric fields for Y-axis
          const numericFields = fields.filter((field) => {
            const value = firstRecord[field];
            return typeof value === "number" || (typeof value === "string" && !isNaN(Number(value)));
          });
          
          // Find time fields for X-axis
          const timeFields = fields.filter((field) => {
            const lower = field.toLowerCase();
            return lower.includes("time") || lower.includes("date") || lower.includes("timestamp") || field === "__timestamp";
          });
          
          // Find string fields that could be categories or series
          const stringFields = fields.filter((field) => {
            const value = firstRecord[field];
            const lower = field.toLowerCase();
            const isTimeField = lower.includes("time") || lower.includes("date") || lower.includes("timestamp") || field === "__timestamp";
            return typeof value === "string" && isNaN(Number(value)) && !isTimeField;
          });
          
          // Auto-suggest mappings
          const suggestedMapping: any = {};
          
          if (timeFields.length > 0) {
            suggestedMapping.xField = timeFields[0];
          } else if (stringFields.length > 0) {
            suggestedMapping.xField = stringFields[0];
          }
          
          if (numericFields.length > 0) {
            suggestedMapping.yField = numericFields[0];
          }
          
          // For series field, prefer non-time string fields
          if (stringFields.length > 0) {
            const seriesCandidate = stringFields.find((field) => {
              const lower = field.toLowerCase();
              return lower.includes("location") || lower.includes("region") || lower.includes("zone") || 
                     lower.includes("name") || lower.includes("type") || lower.includes("category");
            }) || stringFields[0];
            
            suggestedMapping.seriesField = seriesCandidate;
          }
          
          if (Object.keys(suggestedMapping).length > 0) {
            handleConfigChange({
              fieldMapping: {
                ...localConfig?.fieldMapping,
                ...suggestedMapping,
              },
            });
            toast.success(`Auto-detected field mappings: ${Object.entries(suggestedMapping).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
          }
        }
      }
      
      toast.success(`Query executed successfully - ${data.length} rows`);
    },
    onError: (error) => {
      setQueryError(error.message);
      setIsExecuting(false);
      toast.error(`Failed to execute query: ${error.message}`);
    }
  });

  const handleRunQuery = useCallback(async () => {
    if (!localConfig?.query?.trim()) {
      toast.error("Please enter a query first");
      return;
    }

    if (!localConfig.database) {
      toast.error("Please select a database first");
      return;
    }

    if (!currentDashboard?.timeRange) {
      toast.error("Dashboard time range not available");
      return;
    }

    setIsExecuting(true);
    setQueryError(null);
    setRefreshTrigger(Date.now()); // Trigger refresh in preview panel
    await executeQuery({ force: true });
  }, [localConfig, currentDashboard, executeQuery]);

  // Load tables when database changes
  useEffect(() => {
    if (localConfig?.database) {
      // Set the selected database to load tables
      setSelectedDb(localConfig.database);
      
      // Also load schema if not already loaded
      if (
        !schema[localConfig.database] ||
        Object.keys(schema[localConfig.database]).length === 0
      ) {
        loadSchemaForDb(localConfig.database);
      }
    }
  }, [localConfig?.database, schema, loadSchemaForDb, setSelectedDb]);

  // Listen for auto-run query event
  useEffect(() => {
    const handleAutoRunQuery = () => {
      if (localConfig?.query && localConfig?.database) {
        handleRunQuery();
      }
    };

    window.addEventListener("autoRunQuery", handleAutoRunQuery);
    return () => window.removeEventListener("autoRunQuery", handleAutoRunQuery);
  }, [handleRunQuery, localConfig]);

  // Schema detection is now handled by atoms

  // Auto-suggest field mappings when available fields are loaded
  useEffect(() => {
    if (
      availableFields.length > 0 &&
      !localConfig?.fieldMapping?.xField &&
      !localConfig?.fieldMapping?.yField
    ) {
      const smartMapping = SchemaAnalyzer.getSmartFieldDefaults(
        availableFields,
        {},
        [] // No schema fields needed
      );
      if (Object.keys(smartMapping).length > 0) {
        handleConfigChange({
          fieldMapping: {
            ...localConfig?.fieldMapping,
            ...smartMapping,
          },
        });
        toast.success(`Auto-detected field mappings from schema`);
      }
    }
  }, [localConfig?.fieldMapping, availableFields]);

  const handleSave = useCallback(async () => {
    if (!localConfig || !dashboardId) return;
    if (!localConfig.title?.trim()) {
      toast.error("Panel title cannot be empty.");
      return;
    }
    if (!localConfig.type) {
      toast.error("Panel type must be selected.");
      return;
    }

    try {
      if (isNewPanel) {
        await addPanel({
          panelData: {
            ...localConfig,
            useParentTimeFilter: true,
          },
          dashboardId: dashboardId!,
        });
        toast.success("Panel created successfully");
      } else if (panelId) {
        await updatePanel(panelId, {
          ...localConfig,
          useParentTimeFilter: true,
        } as PanelConfig);
        toast.success("Panel saved successfully");
      }
      setHasChanges(false);
      navigate(`/dashboard/${dashboardId}`);
    } catch (error) {
      toast.error(
        isNewPanel ? "Failed to create panel" : "Failed to save panel"
      );
      console.error("Error saving panel:", error);
    }
  }, [
    localConfig,
    dashboardId,
    isNewPanel,
    addPanel,
    panelId,
    updatePanel,
    navigate,
  ]);

  const handleCancel = useCallback(() => {
    navigate(`/dashboard/${dashboardId}`);
  }, [navigate, dashboardId]);

  if (!dashboardId) {
    return (
      <div className="p-4 flex-grow flex items-center justify-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Dashboard context is not available. Cannot edit panel.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoadingPanel) {
    return (
      <div className="p-4 flex-grow flex items-center justify-center">
        <Loader className="w-8 h-8" />
        <p className="ml-2 text-muted-foreground">
          Loading panel configuration...
        </p>
      </div>
    );
  }

  if (!localConfig) {
    return (
      <div className="p-4 flex-grow flex items-center justify-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Panel configuration could not be loaded or initialized.
            {panelId ? ` (Panel ID: ${panelId})` : " (New Panel)"}
          </AlertDescription>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            className="mt-4"
          >
            Go Back
          </Button>
        </Alert>
      </div>
    );
  }

  const currentData = previewData ? { data: previewData } : undefined;

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleCancel}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">
            {isNewPanel ? "Create Panel" : "Edit Panel"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {currentDashboard && (
            <DashboardTimeFilter
              timeRange={
                currentDashboard.timeRange || {
                  type: "relative" as const,
                  from: "1h",
                  to: "now" as const,
                }
              }
              timeZone={currentDashboard.timeZone || "UTC"}
              onTimeRangeChange={() => {}}
              onTimeZoneChange={() => {}}
              disabled={true}
              showTimeZone={false}
            />
          )}
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges && !isNewPanel}>
            <Save className="h-4 w-4 mr-2" />
            Save Panel
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Left Panel: Preview + Query Editor */}
          <ResizablePanel defaultSize={70} minSize={50}>
            <ResizablePanelGroup direction="vertical">
              {/* Top: Panel Preview */}
              <ResizablePanel defaultSize={40} minSize={25}>
                <div className="h-full flex flex-col bg-background">
                  {/* Preview Content */}
                  <div className="flex-1 p-6 overflow-auto bg-muted/20">
                    <div className="h-full rounded-lg border bg-background shadow-sm overflow-hidden">
                      {localConfig.type &&
                      currentDashboard &&
                      previewData &&
                      previewData.length > 0 ? (
                        <PanelDataProvider
                          panelId={panelId || "preview"}
                          config={{
                            ...localConfig,
                            id: panelId || "preview",
                          } as PanelConfig}
                          dashboard={currentDashboard}
                          autoRefresh={false}
                          refreshTrigger={refreshTrigger}
                        >
                          <EnhancedPanel
                            panelId={panelId || "preview"}
                            config={{
                              ...localConfig,
                              id: panelId || "preview",
                            } as PanelConfig}
                            dashboard={currentDashboard}
                            className="w-full h-full"
                            isEditMode={false}
                          />
                        </PanelDataProvider>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center max-w-md">
                            {!localConfig.query?.trim() ? (
                              <div className="space-y-3">
                                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto">
                                  <Play className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <h4 className="text-sm font-medium text-foreground">
                                  Write a Query
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                  Start by writing a SQL query to fetch data for
                                  your panel
                                </p>
                              </div>
                            ) : queryError ? (
                              <div className="space-y-3">
                                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                                  <AlertCircle className="h-6 w-6 text-red-600" />
                                </div>
                                <h4 className="text-sm font-medium text-foreground">
                                  Query Error
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                  Fix the query error to see the panel preview
                                </p>
                              </div>
                            ) : !currentData?.data?.length ? (
                              <div className="space-y-3">
                                <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center mx-auto">
                                  <AlertCircle className="h-6 w-6 text-orange-600" />
                                </div>
                                <h4 className="text-sm font-medium text-foreground">
                                  No Data
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                  Run your query to see results and preview the
                                  panel
                                </p>
                              </div>
                            ) : !localConfig.type ? (
                              <div className="space-y-3">
                                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
                                  <RefreshCw className="h-6 w-6 text-blue-600" />
                                </div>
                                <h4 className="text-sm font-medium text-foreground">
                                  Select Panel Type
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                  Choose a visualization type from the settings
                                  panel
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto">
                                  <RefreshCw className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <h4 className="text-sm font-medium text-foreground">
                                  Configure Panel
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                  Complete the panel configuration to see the
                                  preview
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Bottom: Query Editor */}
              <ResizablePanel defaultSize={60} minSize={40}>
                <div className="h-full flex flex-col bg-background">
                  {/* Query Editor Header */}
                  <div className="px-6 py-3 border-b bg-background">
                    <div className="flex items-center justify-between gap-4">
                      {/* Left Side - Title, Database Selector, and Status */}
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                            Database:
                          </Label>
                          <DashboardUnifiedSelector
                            type="database"
                            value={localConfig?.database || ""}
                            onChange={(value) =>
                              handleConfigChange({
                                database: value === "" ? "" : value,
                                table: "", // Reset table when database changes
                                timeField: "", // Reset time field when database changes
                              })
                            }
                            className="w-[180px] h-8 text-sm"
                            showIcon={false}
                            label={null}
                          />
                        </div>

                        {/* Table Selector */}
                        {localConfig?.database && (
                          <div className="flex items-center gap-2">
                            <Label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                              Table:
                            </Label>
                            <DashboardUnifiedSelector
                              type="table"
                              database={localConfig?.database}
                              value={localConfig?.table || ""}
                              onChange={(value) => {
                                const updates: Partial<PanelConfig> = {
                                  table: value === "" ? "" : value,
                                  timeField: "", // Reset time field when table changes
                                };

                                // Auto-select first time field if available
                                if (value && localConfig?.database && schema[localConfig.database]) {
                                  // Schema structure is { database: { table: [...columns] } }
                                  const tableSchema = schema[localConfig.database][value];
                                  if (tableSchema && Array.isArray(tableSchema)) {
                                    const timeColumns = tableSchema.filter(
                                      (col: any) => {
                                        const colName = (col.column_name || col.name || '').toLowerCase();
                                        const dataType = (col.column_type || col.type || '').toLowerCase();
                                        return (
                                          colName.includes("time") ||
                                          colName.includes("date") ||
                                          colName.includes("timestamp") ||
                                          colName === "__timestamp" ||
                                          dataType.includes("timestamp") ||
                                          dataType.includes("datetime")
                                        );
                                      }
                                    );

                                    if (timeColumns && timeColumns.length > 0) {
                                      // Prefer __timestamp or first available time column
                                      const preferredTimeField =
                                        timeColumns.find(
                                          (col: any) =>
                                            (col.column_name || col.name) === "__timestamp"
                                        ) || timeColumns[0];
                                      updates.timeField =
                                        preferredTimeField.column_name || preferredTimeField.name;
                                    }
                                  }
                                }

                                  // Update query to use selected table
                                  if (
                                    localConfig.query &&
                                    localConfig.query.includes("your_table")
                                  ) {
                                    updates.query = localConfig.query.replace(
                                      /your_table/g,
                                      value
                                    );
                                  }

                                handleConfigChange(updates);
                              }}
                              className="w-[180px] h-8 text-sm"
                              showIcon={false}
                              label={null}
                            />
                          </div>
                        )}

                        {/* Time Field Selector */}
                        {localConfig?.database && localConfig?.table && (
                          <div className="flex items-center gap-2">
                            <Label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                              Time Field:
                            </Label>
                            <DashboardUnifiedSelector
                              type="timeField"
                              database={localConfig?.database}
                              table={localConfig?.table}
                              value={localConfig?.timeField || ""}
                              onChange={(value) =>
                                handleConfigChange({
                                  timeField: value === "" ? "" : value,
                                })
                              }
                              className="w-[180px] h-8 text-sm"
                              showIcon={false}
                              label={null}
                            />
                          </div>
                        )}

                        {/* Query Status */}
                        {previewData && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            {previewData.length} rows returned
                          </div>
                        )}

                        {queryError && (
                          <div className="flex items-center gap-2 text-xs text-red-600">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            Query failed
                          </div>
                        )}
                      </div>

                      {/* Right Side - Run Button */}
                      <Button
                        onClick={handleRunQuery}
                        disabled={!localConfig?.query?.trim() || isExecuting}
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                      >
                        <Play className="h-3 w-3 mr-1.5" />
                        {isExecuting ? "Running..." : "Run Query"}
                      </Button>
                    </div>
                  </div>

                  {/* Error Display */}
                  {queryError && (
                    <div className="px-6 py-3 bg-red-50 border-b border-red-200">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-red-800">
                            Query Error
                          </p>
                          <p className="text-sm text-red-700 mt-1 font-mono break-all">
                            {queryError}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setQueryError(null)}
                          className="text-red-600 hover:text-red-800 hover:bg-red-100"
                        >
                          ✕
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Monaco Editor Container */}
                  <div className="flex-1 overflow-hidden relative">
                    <div className="absolute inset-0 border border-border rounded-none">
                      <MonacoSqlEditor
                        query={localConfig?.query || ""}
                        isLoading={isExecuting}
                        schema={schema}
                        selectedDb={localConfig?.database || ""}
                        onChange={handleQueryChange}
                        onMount={() => {}}
                        onRunQuery={handleRunQuery}
                      />
                    </div>

                    {/* Loading Overlay */}
                    {isExecuting && (
                      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10">
                        <div className="flex items-center gap-3 bg-card border rounded-lg px-4 py-3 shadow-lg">
                          <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                          <span className="text-sm font-medium">
                            Executing query...
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Query Footer */}
                  <div className="px-6 py-3 border-t bg-card/50 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span>Press Ctrl+Enter to run query</span>
                        {localConfig?.query && (
                          <span>
                            • {localConfig.query.split("\n").length} lines
                          </span>
                        )}
                      </div>
                      {localConfig?.database && (
                        <div className="flex items-center gap-2">
                          <span>Connected to:</span>
                          <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                            {localConfig.database}
                          </code>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle />

          {/* Right Panel: Settings */}
          <ResizablePanel defaultSize={30} minSize={20}>
            <div className="h-full flex flex-col">
              {/* Settings Header */}
              <div className="px-6 py-4 border-b bg-background">
                <h3 className="text-base font-semibold text-foreground">
                  Panel Configuration
                </h3>
              </div>

              {/* Settings Content */}
              <div className="flex-1 overflow-auto p-6">
                <PanelConfigurationForm
                  config={localConfig}
                  onConfigChange={handleConfigChange}
                  availableFields={availableFields}
                  schemaFields={[]}
                  previewData={previewData || undefined}
                  showAdvancedOptions={true}
                />
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
