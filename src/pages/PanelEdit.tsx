import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useDashboard } from "@/contexts/DashboardContext";
import { useConnection } from "@/contexts/ConnectionContext";
import { DatabaseTableSelector } from "@/components/dashboard/DatabaseTableSelector";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, RefreshCw, Play } from "lucide-react";
import { MonacoSqlEditor } from "@/components/query";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PANEL_TYPES } from "@/components/dashboard/panels";
import DashboardPanel from "@/components/dashboard/DashboardPanel";
import {
  type PanelConfig,
  type PanelTypeDefinition,
} from "@/types/dashboard.types";
import { toast } from "sonner";
import Loader from "@/components/Loader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import axios from "axios";

interface PanelEditProps {
  dashboardId: string;
  panelId?: string;
  onSaveSuccess: () => void;
  onCancel: () => void;
}

export default function PanelEdit({
  dashboardId: propDashboardId,
  panelId: propPanelId,
  onSaveSuccess,
  onCancel,
}: PanelEditProps) {
  const { dashboardId: routeDashboardId, panelId: routePanelId } = useParams<{
    dashboardId: string;
    panelId?: string;
  }>();

  const currentDashboardId = propDashboardId || routeDashboardId;
  const currentPanelIdFromRouteOrProp = propPanelId || routePanelId;

  const {
    currentDashboard,
    loadDashboard,
    updatePanel,
    addPanel,
    getPanelById,
  } = useDashboard();

  // Get API connection for query execution (don't sync with global state)
  const { apiUrl } = useConnection();

  const [localConfig, setLocalConfig] = useState<Partial<PanelConfig> | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoadingPanel, setIsLoadingPanel] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [timeColumns, setTimeColumns] = useState<string[]>([]);
  const [selectedDb, setSelectedDb] = useState<string>("");

  const isNewPanel = !currentPanelIdFromRouteOrProp;
  const workingPanelId = currentPanelIdFromRouteOrProp;

  // Load dashboard context
  useEffect(() => {
    if (
      currentDashboardId &&
      (!currentDashboard || currentDashboard.id !== currentDashboardId)
    ) {
      loadDashboard(currentDashboardId).catch((err) => {
        console.error("Failed to load dashboard for panel edit:", err);
        toast.error("Error loading dashboard context for this panel.");
      });
    }
  }, [currentDashboardId, currentDashboard, loadDashboard]);

  // Initialize panel config - simplified to prevent loops and auto-execution
  useEffect(() => {
    if (!isLoadingPanel) return; // Only run once
    
    if (isNewPanel) {
      // For new panels, just initialize local config without creating a real panel yet
      const tempConfig: Partial<PanelConfig> = {
        title: "New Panel",
        type: "timeseries",
        query: "", // Start with empty query - user will select database/table first
        database: "", // Will be set when user selects database
        dataMapping: { valueColumn: "" },
        visualization: {},
      };
      
      setLocalConfig(tempConfig);
      setHasChanges(true);
      setIsLoadingPanel(false);
    } else if (currentPanelIdFromRouteOrProp && currentDashboard) {
      // For existing panels, get the config but DON'T auto-load data
      const panel = getPanelById(currentPanelIdFromRouteOrProp);
      if (panel) {
        setLocalConfig({ ...panel });
        setHasChanges(false);
        setIsLoadingPanel(false);
      } else {
        toast.error(
          `Panel with ID ${currentPanelIdFromRouteOrProp} not found in the current dashboard.`
        );
        setIsLoadingPanel(false);
      }
    } else if (!currentDashboard && currentDashboardId) {
      // Dashboard is still loading, stay in loading state
      // This will be handled by the dashboard loading effect
    } else {
      // Fallback: stop loading if we can't determine state
      setIsLoadingPanel(false);
    }
  }, [
    isNewPanel,
    currentPanelIdFromRouteOrProp,
    currentDashboard,
    currentDashboardId,
    getPanelById,
    isLoadingPanel
  ]);

  // Remove the automatic query sync and data refresh effects that cause loops
  // Users will manually run queries and save panels instead

  const handleQueryChange = (newQuery: string | undefined) => {
    if (!localConfig) return;
    
    const updatedConfig = { ...localConfig, query: newQuery || "" };
    setLocalConfig(updatedConfig);
    setHasChanges(true);
  };

  const handleRunQuery = async () => {
    if (!localConfig?.query?.trim()) {
      toast.error("Please enter a query first");
      return;
    }

    if (!selectedDb) {
      toast.error("Please select a database first");
      return;
    }

    setIsExecuting(true);
    try {
      // Execute query directly using the same API as QueryContext
      const response = await axios.post(
        `${apiUrl}?db=${encodeURIComponent(selectedDb)}&format=ndjson`,
        { query: localConfig.query },
        { 
          responseType: "text",
          timeout: 60000 
        }
      );

      // Parse NDJSON response like QueryContext does
      const textData = response.data;
      const lines = textData.split("\n").filter((line: string) => line.trim());
      const results: any[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          results.push(JSON.parse(line));
        } catch (e) {
          console.error("Error parsing NDJSON line:", e);
        }
      }

      toast.success(`Query executed successfully - ${results.length} rows`);
      
      // Store results for preview
      setPreviewData(results);
      
      // Auto-detect column mappings from the first row
      if (results.length > 0 && localConfig) {
        const firstRow = results[0];
        const columns = Object.keys(firstRow);
        
        // Auto-detect value column (first numeric column or first column)
        const valueColumn = columns.find(col => typeof firstRow[col] === 'number') || columns[0] || '';
        
        // Auto-detect time column (columns with time-related names)
        const timeColumn = columns.find(col => 
          col.toLowerCase().includes('time') || 
          col.toLowerCase().includes('date') || 
          col.toLowerCase().includes('timestamp') ||
          col.toLowerCase().includes('created') ||
          col.toLowerCase().includes('updated')
        );
        
        // Auto-detect series column (string columns that aren't time or value)
        const seriesColumn = columns.find(col => 
          col !== valueColumn && 
          col !== timeColumn && 
          typeof firstRow[col] === 'string'
        );
        
        // Update config with auto-detected mappings
        const updatedMapping = {
          valueColumn,
          ...(timeColumn && { timeColumn }),
          ...(seriesColumn && { seriesColumn })
        };
        
        setLocalConfig({
          ...localConfig,
          dataMapping: updatedMapping
        });
        setHasChanges(true);
        
        toast.success(`Auto-detected mappings: Value: ${valueColumn}${timeColumn ? `, Time: ${timeColumn}` : ''}${seriesColumn ? `, Series: ${seriesColumn}` : ''}`);
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || "Query execution failed";
      toast.error(`Failed to execute query: ${errorMessage}`);
      console.error("Query execution error:", error);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleConfigChange = (updates: Partial<PanelConfig>) => {
    if (!localConfig) return;
    
    const updatedConfig = { ...localConfig, ...updates };
    setLocalConfig(updatedConfig);
    setHasChanges(true);

    // DO NOT auto-update the panel - user must manually save
    // The auto-debounce was causing unwanted panel updates and data refreshes
  };

  const handleSave = async () => {
    if (!localConfig || !currentDashboardId) return;
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
        // For new panels, create the panel now
        await addPanel(localConfig as Omit<PanelConfig, "id">);
        toast.success("Panel created successfully");
      } else if (currentPanelIdFromRouteOrProp) {
        await updatePanel(currentPanelIdFromRouteOrProp, localConfig as PanelConfig);
        toast.success("Panel saved successfully");
      }
      setHasChanges(false);
      onSaveSuccess();
    } catch (error) {
      toast.error(isNewPanel ? "Failed to create panel" : "Failed to save panel");
      console.error("Error saving panel:", error);
    }
  };

  const handleCancel = async () => {
    // For new panels, just navigate away without saving
    // For existing panels, just navigate away
    onCancel();
  };

  const handleRefreshPreview = async () => {
    if (!localConfig?.query?.trim()) {
      toast.info("Write a query first to see preview.");
      return;
    }
    // Re-run the query to refresh the local preview data
    await handleRunQuery();
  };

  // Handle schema loading from DatabaseTableSelector
  const handleSchemaLoad = (columns: string[], detectedTimeColumns: string[]) => {
    setAvailableColumns(columns);
    setTimeColumns(detectedTimeColumns);
    
    // Auto-update dataMapping if we have a localConfig
    if (localConfig && columns.length > 0) {
      const currentMapping = localConfig.dataMapping || { valueColumn: "" };
      const updates: any = {};
      
      // Set valueColumn if not already set
      if (!currentMapping.valueColumn && columns.length > 0) {
        updates.valueColumn = columns[0];
      }
      
      // Set timeColumn if we detected time columns and none is set
      if (!currentMapping.timeColumn && detectedTimeColumns.length > 0) {
        updates.timeColumn = detectedTimeColumns[0];
      }
      
      if (Object.keys(updates).length > 0) {
        handleConfigChange({
          dataMapping: { ...currentMapping, ...updates }
        });
      }
    }
  };

  // Handle database/table selection from DatabaseTableSelector
  const handleSelectionChange = (database: string, _table: string | null) => {
    setSelectedDb(database);
    // Also update the panel config with the database
    if (localConfig) {
      handleConfigChange({ database });
    }
  };

  // Handle query updates from DatabaseTableSelector
  const handleQueryUpdate = (newQuery: string) => {
    if (localConfig) {
      handleConfigChange({ query: newQuery });
    }
  };

  if (!currentDashboardId) {
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
            {currentPanelIdFromRouteOrProp
              ? ` (Panel ID: ${currentPanelIdFromRouteOrProp})`
              : " (New Panel)"}
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

  // Use local preview data instead of global panel data for immediate feedback
  const currentData = previewData ? { data: previewData } : undefined;

  return (
    <div className="flex flex-col h-full bg-muted/20">
      {/* Header with Actions */}
      <div className="flex items-center justify-between p-4 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleCancel}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-semibold">
            {isNewPanel ? "Add New Panel" : "Edit Panel"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges && !isNewPanel}>
            <Save className="h-4 w-4 mr-2" />
            Save Panel
          </Button>
        </div>
      </div>

      {/* Main Content Area - Layout: Left (Settings), Right (Preview + Editor) */}
      <div className="flex-grow flex flex-row overflow-hidden">
        {/* Left Sidebar: Panel Configuration */}
        <div className="w-1/4 min-w-[250px] max-w-[300px] p-4 space-y-6 overflow-y-auto border-r bg-background">
          {/* General Settings */}
          <div className="space-y-4">
            <h3 className="text-md font-medium border-b pb-2">
              Panel Settings
            </h3>
            <div>
              <Label htmlFor="panel-title">Panel Title</Label>
              <Input
                id="panel-title"
                value={localConfig.title || ""}
                onChange={(e) => handleConfigChange({ title: e.target.value })}
                placeholder="e.g., CPU Usage Over Time"
              />
            </div>
            <div>
              <Label htmlFor="panel-type">Panel Type</Label>
              <Select
                value={localConfig.type || ""}
                onValueChange={(value) =>
                  handleConfigChange({ type: value as PanelConfig["type"] })
                }
              >
                <SelectTrigger id="panel-type">
                  <SelectValue placeholder="Select panel type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(PANEL_TYPES).map(
                    (type: PanelTypeDefinition) => (
                      <SelectItem key={type.type} value={type.type}>
                        {type.name}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Data Mapping Configuration */}
          {localConfig.type && (
            <div className="space-y-4">
              <h3 className="text-md font-medium border-b pb-2">
                Data Mapping
              </h3>
              <div>
                <Label htmlFor="value-column">Value Column</Label>
                {availableColumns.length > 0 ? (
                  <Select
                    value={localConfig.dataMapping?.valueColumn || undefined}
                    onValueChange={(value) =>
                      handleConfigChange({
                        dataMapping: {
                          ...localConfig.dataMapping,
                          valueColumn: value,
                        },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select value column" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableColumns.map((column) => (
                        <SelectItem key={column} value={column}>
                          {column}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground">
                    Select a table to see columns
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="time-column">Time Column (optional)</Label>
                {availableColumns.length > 0 ? (
                  <Select
                    value={localConfig.dataMapping?.timeColumn || "none"}
                    onValueChange={(value) =>
                      handleConfigChange({
                        dataMapping: {
                          valueColumn: localConfig.dataMapping?.valueColumn || "",
                          ...localConfig.dataMapping,
                          timeColumn: value === "none" ? undefined : value,
                        },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select time column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {timeColumns.map((column) => (
                        <SelectItem key={column} value={column}>
                          {column} (detected)
                        </SelectItem>
                      ))}
                      {availableColumns.filter(col => !timeColumns.includes(col)).map((column) => (
                        <SelectItem key={column} value={column}>
                          {column}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground">
                    Select a table to see columns
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="series-column">Series Column (optional)</Label>
                <Input
                  id="series-column"
                  value={localConfig.dataMapping?.seriesColumn || ""}
                  onChange={(e) =>
                    handleConfigChange({
                      dataMapping: {
                        valueColumn: localConfig.dataMapping?.valueColumn || "",
                        ...localConfig.dataMapping,
                        seriesColumn: e.target.value,
                      },
                    })
                  }
                  placeholder="e.g., category, host, region"
                />
              </div>
            </div>
          )}

          {/* Visualization Options */}
          {localConfig.type && (
            <div className="space-y-4">
              <h3 className="text-md font-medium border-b pb-2">
                Visualization
              </h3>
              <div>
                <Label htmlFor="y-axis-label">Y-Axis Label</Label>
                <Input
                  id="y-axis-label"
                  value={localConfig.visualization?.yAxisLabel || ""}
                  onChange={(e) =>
                    handleConfigChange({
                      visualization: {
                        ...localConfig.visualization,
                        yAxisLabel: e.target.value,
                      },
                    })
                  }
                  placeholder="e.g., Requests/sec, CPU %"
                />
              </div>
              <div>
                <Label htmlFor="unit">Unit</Label>
                <Input
                  id="unit"
                  value={localConfig.visualization?.unit || ""}
                  onChange={(e) =>
                    handleConfigChange({
                      visualization: {
                        ...localConfig.visualization,
                        unit: e.target.value,
                      },
                    })
                  }
                  placeholder="e.g., %, ms, MB"
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Preview (Top) and Editor (Bottom) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top: Panel Preview */}
          <div className="flex-1 min-h-0 p-4 border-b bg-background">
            <div className="h-full flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-md font-medium">Panel Preview</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRefreshPreview}
                  disabled={!localConfig.query?.trim()}
                >
                  <RefreshCw className="h-3 w-3 mr-1.5" />
                  Refresh
                </Button>
              </div>
              
              <div className="flex-1 min-h-0 border rounded-lg p-4 bg-muted/50">
                {localConfig.type && currentData?.data && currentData.data.length > 0 ? (
                  <DashboardPanel
                    config={
                      {
                        ...localConfig,
                        id: workingPanelId || 'preview',
                      } as PanelConfig
                    }
                    data={currentData.data}
                    isEditMode={false}
                    onEditPanel={() => {}}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <p className="text-muted-foreground mb-2">
                        {!localConfig.query?.trim()
                          ? "Write a query to see preview"
                          : !currentData?.data?.length
                          ? "No data available - click 'Run Query' to execute your query"
                          : !localConfig.type
                          ? "Select a panel type to see preview"
                          : "Configure panel to see preview"}
                      </p>
                      {localConfig.query?.trim() && !currentData?.data?.length && (
                        <p className="text-xs text-muted-foreground">
                          Click the "Run Query" button to execute your query and see results
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom: Query Editor */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="p-4 border-b bg-background">
              <div className="flex justify-between items-center">
                <h3 className="text-md font-medium">Query Editor</h3>
                <Button
                  onClick={handleRunQuery}
                  disabled={!localConfig?.query?.trim() || isExecuting}
                  size="sm"
                >
                  <Play className="h-4 w-4 mr-2" />
                  {isExecuting ? "Running..." : "Run Query"}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Write your SQL query here. Click Run Query to see results in the preview.
              </p>
              
              {/* Data Source Selection */}
              <div className="mt-4">
                <DatabaseTableSelector
                  onSchemaLoad={handleSchemaLoad}
                  onSelectionChange={handleSelectionChange}
                  onQueryUpdate={handleQueryUpdate}
                />
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <MonacoSqlEditor
                query={localConfig?.query || ""}
                isLoading={isExecuting}
                schema={{}}
                selectedDb=""
                onChange={handleQueryChange}
                onMount={() => {}}
                onRunQuery={handleRunQuery}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
