import { useState, useEffect, useCallback, useMemo } from "react";

import { useAtom, useSetAtom } from "jotai";
import { selectedDbAtom, schemaAtom } from "@/atoms";
import { createDashboardAtom, addPanelAtom } from "@/atoms";
import { apiUrlAtom } from "@/atoms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BarChart3,
  Copy,
  PlusCircle,
  Play,
  RefreshCw,
  AlertCircle,
  Zap,
  Clock,
  Database,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import Loader from "@/components/Loader";
import {
  getPanelComponent,
  ChartRenderer,
} from "@/components/dashboard/panels";
import { UnifiedSelector } from "@/components/shared/DbTableTimeSelector";
import {
  UnifiedQueryProcessor,
  checkForTimeVariables,
} from "@/lib/query-processor";
import { SchemaAnalyzer } from "@/lib/dashboard/schema-analyzer";
import type {
  PanelConfig,
  TimeRange,
  Dashboard,
} from "@/types/dashboard.types";
import axios from "axios";

interface ChatArtifactProps {
  chartArtifact: any;
  onAddToDashboard?: (chartArtifact: any) => void;
  currentDashboard?: any;
}

export default function ChatArtifact({ chartArtifact }: ChatArtifactProps) {
  const [apiUrl] = useAtom(apiUrlAtom);
  const [selectedDb] = useAtom(selectedDbAtom);
  const [schema] = useAtom(schemaAtom);
  const createDashboard = useSetAtom(createDashboardAtom);
  const addPanel = useSetAtom(addPanelAtom);

  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastExecuted, setLastExecuted] = useState<Date | null>(null);
  const [localTimeRange, setLocalTimeRange] = useState<TimeRange>({
    type: "relative",
    from: "5m",
    to: "now",
  });
  const [selectedTimeField, setSelectedTimeField] = useState<string>("");
  const [showSaveToDashboard, setShowSaveToDashboard] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState("");
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>("new");
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);

  // Check if query has time variables
  const hasTimeVariables = checkForTimeVariables(chartArtifact.query || "");

  // Get time field options from database schema
  const timeFieldOptions = useMemo(() => {
    if (!selectedDb || !schema?.[selectedDb]) return [];

    const dbSchema = schema[selectedDb];
    const allTimeFields: string[] = [];

    // Get all columns from all tables and detect time fields
    dbSchema.forEach((table: any) => {
      if (table.columns && Array.isArray(table.columns)) {
        table.columns.forEach((column: any) => {
          // Ensure column has a name before processing (use columnName property)
          if (!column || !column.columnName) {
            console.warn("Column missing columnName:", column);
            return;
          }

          try {
            const fieldType = SchemaAnalyzer.analyzeFieldType(
              column.columnName,
              null,
              column.dataType
            );
            const columnNameLower = column.columnName.toLowerCase();

            if (
              fieldType.semantic === "timestamp" ||
              fieldType.format?.includes("Time") ||
              columnNameLower.includes("time") ||
              columnNameLower.includes("date") ||
              columnNameLower.includes("timestamp") ||
              column.columnName === "__timestamp"
            ) {
              if (!allTimeFields.includes(column.columnName)) {
                allTimeFields.push(column.columnName);
              }
            }
          } catch (error) {
            console.warn(
              "Error analyzing field type for column:",
              column.columnName,
              error
            );
          }
        });
      }
    });

    // Prioritize __timestamp if it exists
    if (allTimeFields.includes("__timestamp")) {
      allTimeFields.sort((a, b) =>
        a === "__timestamp" ? -1 : b === "__timestamp" ? 1 : 0
      );
    }

    return allTimeFields;
  }, [selectedDb, schema]);

  // Auto-select first time field if available and none selected
  useEffect(() => {
    if (hasTimeVariables && !selectedTimeField) {
      if (timeFieldOptions.length > 0) {
        // Prefer __timestamp if available, otherwise use first option
        const preferredField = timeFieldOptions.includes("__timestamp")
          ? "__timestamp"
          : timeFieldOptions[0];
        setSelectedTimeField(preferredField);
      } else {
        // Fallback to __timestamp if no schema fields available
        setSelectedTimeField("__timestamp");
      }
    }
  }, [hasTimeVariables, selectedTimeField, timeFieldOptions]);

  // Create panel config from chart artifact with enhanced field mapping
  const panelConfig: PanelConfig = useMemo(() => {
    try {
      const baseConfig = {
        id: `artifact_${Date.now()}`,
        type: chartArtifact?.type || "timeseries",
        title: chartArtifact?.title || "AI Generated Chart",
        query: chartArtifact?.query || "",
        database: chartArtifact?.database || selectedDb || "",
        fieldMapping: chartArtifact?.fieldMapping || {},
        fieldConfig: chartArtifact?.fieldConfig || {
          defaults: {
            unit: chartArtifact?.fieldConfig?.defaults?.unit || "",
            decimals: chartArtifact?.fieldConfig?.defaults?.decimals || 2,
            color: {
              mode: "palette-classic",
            },
            custom: {
              drawStyle: "line",
              lineInterpolation: "smooth",
              lineWidth: 2,
              fillOpacity: 0.1,
            },
          },
        },
        options: chartArtifact?.options || {
          legend: {
            showLegend: true,
            placement: "bottom",
            displayMode: "list",
          },
          tooltip: {
            mode: "single",
            sort: "none",
          },
        },
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        maxDataPoints: 1000,
        useParentTimeFilter: false,
      };

      // Enhance field mapping if we have data
      if (
        data &&
        data.length > 0 &&
        Object.keys(baseConfig.fieldMapping).length === 0
      ) {
        try {
          const enhancedAnalysis = SchemaAnalyzer.analyzeDataset(data, 100);
          const smartMapping = SchemaAnalyzer.getEnhancedSmartDefaults(
            enhancedAnalysis,
            baseConfig.type
          );

          // Override xField with user's selected time field if this has time variables
          if (hasTimeVariables && selectedTimeField) {
            smartMapping.xField = selectedTimeField;
          }

          baseConfig.fieldMapping = smartMapping;
        } catch (error) {
          console.warn("Error enhancing field mapping:", error);
          // Continue with base config if enhancement fails
        }
      } else if (baseConfig.fieldMapping) {
        // Fix any placeholder field names in existing mapping
        const fixedMapping = { ...baseConfig.fieldMapping };

        // Replace __timeField placeholder with actual selected time field
        if (
          fixedMapping.xField === "__timeField" &&
          hasTimeVariables &&
          selectedTimeField
        ) {
          fixedMapping.xField = selectedTimeField;
        }

        // Ensure all field mappings use actual column names, not placeholders
        Object.keys(fixedMapping).forEach((key) => {
          if (
            typeof fixedMapping[key] === "string" &&
            fixedMapping[key].startsWith("__") &&
            !fixedMapping[key].startsWith("__timestamp")
          ) {
            // If it's a placeholder (starts with __ but not __timestamp), try to replace it
            if (key === "xField" && hasTimeVariables && selectedTimeField) {
              fixedMapping[key] = selectedTimeField;
            }
          }
        });

        baseConfig.fieldMapping = fixedMapping;
      }

      return baseConfig;
    } catch (error) {
      console.error("Error creating panel config:", error);
      // Return minimal safe config
      return {
        id: `artifact_${Date.now()}`,
        type: "timeseries",
        title: "AI Generated Chart",
        query: "",
        database: selectedDb || "",
        fieldMapping: {},
        fieldConfig: { defaults: {} },
        options: {
          legend: {
            showLegend: true,
            placement: "bottom",
            displayMode: "list",
          },
        },
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        maxDataPoints: 1000,
        useParentTimeFilter: false,
      };
    }
  }, [chartArtifact, selectedDb, data]);

  const executeChartQuery = useCallback(async () => {
    if (!panelConfig.query?.trim() || !panelConfig.database) {
      setError("No query or database specified");
      return;
    }

    // Check if time variables are present but no time field is selected
    if (hasTimeVariables && !selectedTimeField) {
      setError(
        "This query uses time variables but no time field is selected. Please select a time field above."
      );
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Find the column schema details for the selected time field
      let timeColumnDetails = null;
      if (
        hasTimeVariables &&
        selectedTimeField &&
        selectedDb &&
        schema?.[selectedDb]
      ) {
        for (const table of schema[selectedDb]) {
          if (table.columns && Array.isArray(table.columns)) {
            const column = table.columns.find(
              (col: any) => col.columnName === selectedTimeField
            );
            if (column) {
              timeColumnDetails = {
                columnName: column.columnName,
                dataType: column.dataType,
                timeUnit: column.timeUnit,
              };
              console.log("Found time column details:", timeColumnDetails);
              break;
            }
          }
        }
      }

      // Process the query with proper time range and field using UnifiedQueryProcessor
      const processedResult = UnifiedQueryProcessor.process({
        database: panelConfig.database,
        query: panelConfig.query,
        timeRange: hasTimeVariables ? localTimeRange : undefined,
        timeColumn: hasTimeVariables ? selectedTimeField : undefined,
        timeColumnDetails: timeColumnDetails,
        timeZone: "UTC",
        maxDataPoints: 1000,
      });

      // Check for processing errors
      if (processedResult.errors.length > 0) {
        throw new Error(
          `Query processing failed: ${processedResult.errors.join(", ")}`
        );
      }

      let processedQuery = processedResult.query;

      // Add LIMIT if not present for safety
      if (
        processedQuery.trim().toUpperCase().startsWith("SELECT") &&
        !processedQuery.toUpperCase().includes("LIMIT")
      ) {
        processedQuery += " LIMIT 1000";
      }

      // Show debug info in console for development
      console.log("Original query:", panelConfig.query);
      console.log("Processed query:", processedQuery);
      console.log("Time field:", selectedTimeField);
      console.log("Time range:", localTimeRange);
      console.log("Has time variables:", hasTimeVariables);
      console.log("Interpolated variables:", processedResult.interpolatedVars);

      // Execute the query using direct API call (same as PanelEdit)
      const response = await axios.post(
        `${apiUrl}?db=${encodeURIComponent(
          panelConfig.database
        )}&format=ndjson`,
        { query: processedQuery },
        {
          responseType: "text",
          timeout: 10000,
        }
      );

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

      setData(results);
      setLastExecuted(new Date());

      // If we have results and a time field, analyze the time values to improve future queries
      if (results.length > 0 && hasTimeVariables && selectedTimeField) {
        try {
          const timeValues = results
            .map((row) => row[selectedTimeField])
            .filter((val) => typeof val === "number" && !isNaN(val) && val > 0)
            .slice(0, 10); // Sample first 10 values

          if (timeValues.length > 0) {
            const inferredUnit =
              UnifiedQueryProcessor.inferTimeUnitFromSampleValues(timeValues);
            console.log(
              `Inferred time unit for ${selectedTimeField}:`,
              inferredUnit,
              "from sample values:",
              timeValues.slice(0, 3)
            );

            // Log the analysis for debugging
            console.log(
              `Sample analysis: avg=${
                timeValues.reduce((a, b) => a + b) / timeValues.length
              }, unit=${inferredUnit}`
            );
          }
        } catch (error) {
          console.warn("Error analyzing time values:", error);
        }
      }

      if (results.length === 0) {
        let noDataMessage = "Query executed successfully but returned no data";
        if (hasTimeVariables) {
          noDataMessage +=
            "\n\nTip: Try adjusting the time range or check if data exists for the selected time period.";
        }
        setError(noDataMessage);
      } else {
        setError(null);
      }
    } catch (err: any) {
      console.error("Failed to execute chart query:", err);
      let errorMessage =
        err.response?.data?.error || err.message || "Failed to execute query";

      // Add helpful context based on the error and query state
      if (hasTimeVariables && !selectedTimeField) {
        errorMessage +=
          "\n\nHint: This query uses time variables but no time field is selected. Try selecting a time field above.";
      }
      if (hasTimeVariables && errorMessage.includes("time")) {
        errorMessage +=
          "\n\nThis appears to be a time-related error. Check that:";
        errorMessage += "\n• A time field is selected";
        errorMessage += "\n• The time range is valid";
        errorMessage += "\n• The time field exists in your data";
      }

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [
    panelConfig.query,
    panelConfig.database,
    localTimeRange,
    selectedTimeField,
    hasTimeVariables,
    apiUrl,
  ]);

  // Auto-execute query when component mounts if we have query and database
  useEffect(() => {
    if (panelConfig.query && panelConfig.database) {
      // For queries with time variables, wait until time field is selected
      if (hasTimeVariables && !selectedTimeField) {
        return; // Don't execute yet
      }
      // Small delay to ensure all dependencies are ready
      const timer = setTimeout(() => {
        executeChartQuery();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [
    panelConfig.query,
    panelConfig.database,
    hasTimeVariables,
    selectedTimeField,
  ]);

  // Re-execute query when time range or time field changes for queries with time variables
  useEffect(() => {
    if (
      hasTimeVariables &&
      panelConfig.query &&
      panelConfig.database &&
      selectedTimeField &&
      data.length > 0 // Only re-execute if we already have data
    ) {
      const timer = setTimeout(() => {
        executeChartQuery();
      }, 300); // Debounce changes
      return () => clearTimeout(timer);
    }
  }, [localTimeRange.from, selectedTimeField]);

  // Chart types that use the unified ChartRenderer
  const CHART_TYPES = [
    "timeseries",
    "line",
    "area",
    "bar",
    "scatter",
    "pie",
    "donut",
  ];
  const isChartType = CHART_TYPES.includes(panelConfig.type);

  const PanelComponent = isChartType
    ? null
    : getPanelComponent(panelConfig.type);

  const copyConfig = () => {
    navigator.clipboard.writeText(JSON.stringify(chartArtifact, null, 2));
    toast.success("Chart configuration copied to clipboard");
  };

  // Load dashboards for the save dialog
  useEffect(() => {
    const loadDashboards = () => {
      try {
        // Get dashboards from localStorage
        const storedDashboards = localStorage.getItem("gigapi_dashboards");
        if (storedDashboards) {
          const dashboardList = JSON.parse(storedDashboards);
          setDashboards(dashboardList);
        } else {
          setDashboards([]);
        }
      } catch (error) {
        console.error("Failed to load dashboards:", error);
        setDashboards([]);
      }
    };

    if (showSaveToDashboard) {
      loadDashboards();
    }
  }, [showSaveToDashboard]);

  const handleAddToDashboard = async () => {
    try {
      let dashboardId = selectedDashboardId;

      // Create new dashboard if needed
      if (selectedDashboardId === "new") {
        if (!newDashboardName.trim()) {
          toast.error("Please enter a dashboard name");
          return;
        }

        const newDashboard = await createDashboard({
          name: newDashboardName,
          description: `Dashboard created from AI chart: ${panelConfig.title}`,
          timeRange: { type: "relative", from: "1h", to: "now" },
          timeZone: "UTC",
          layout: { panels: [] },
        });

        dashboardId = newDashboard.id;
      }

      // Extract table from query if not provided
      const extractTableFromQuery = (query: string): string | undefined => {
        const match = query.match(/FROM\s+([`"]?)(\w+)\1/i);
        return match?.[2];
      };
      
      const query = chartArtifact.query || panelConfig.query || "";
      const table = chartArtifact.table || extractTableFromQuery(query) || "";
      
      // Create panel with current configuration - ensure all required fields
      const finalConfig = {
        ...panelConfig,
        query,
        database:
          chartArtifact.database || selectedDb || panelConfig.database || "",
        table,
        title: chartArtifact.title || panelConfig.title || "AI Generated Chart",
        type: chartArtifact.type || panelConfig.type || "timeseries",
        fieldMapping: (() => {
          // Start with the artifact's field mapping or panel config mapping
          const mapping = {
            ...(chartArtifact.fieldMapping || panelConfig.fieldMapping || {}),
          };

          // Fix any placeholder values
          if (
            mapping.xField === "__timeField" ||
            (hasTimeVariables && !mapping.xField)
          ) {
            mapping.xField = selectedTimeField || "__timestamp";
          }

          // Ensure we have valid field mappings from the data if available
          if (data && data.length > 0 && Object.keys(mapping).length === 0) {
            // No mapping exists, create smart defaults
            const fields = Object.keys(data[0]);
            const timeFields = fields.filter(
              (f) =>
                f === "__timestamp" ||
                f.toLowerCase().includes("time") ||
                f.toLowerCase().includes("date")
            );
            const numericFields = fields.filter(
              (f) => typeof data[0][f] === "number" && !timeFields.includes(f)
            );

            if (timeFields.length > 0) {
              mapping.xField = selectedTimeField || timeFields[0];
            }
            if (numericFields.length > 0) {
              mapping.yField = numericFields[0];
            }
          }

          return mapping;
        })(),
        fieldConfig: panelConfig.fieldConfig || {
          defaults: {
            unit: "",
            decimals: 2,
          },
        },
        options: panelConfig.options || {
          legend: {
            showLegend: true,
            placement: "bottom",
          },
        },
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        maxDataPoints: 1000,
        useParentTimeFilter: hasTimeVariables, // Use dashboard time filter if chart has time variables
        timeField: hasTimeVariables ? selectedTimeField : undefined, // Store the time field for dashboard to use
      };

      console.log("Saving AI chart panel config:", finalConfig);
      console.log("Target dashboard ID:", dashboardId);

      // Add panel to the specified dashboard
      await addPanel({ panelData: finalConfig, dashboardId });

      toast.success(
        `Chart "${finalConfig.title}" saved to dashboard successfully!`
      );
      setShowSaveToDashboard(false);
      setNewDashboardName("");
      setSelectedDashboardId("new"); // Reset for next use
    } catch (error) {
      console.error("Failed to add chart to dashboard:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to add chart to dashboard"
      );
    }
  };

  return (
    <Card className="w-full border-border/40 shadow-sm">
      {/* Compact Header */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          {/* Left side - Title and badges */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary" className="text-xs px-2 py-1 shrink-0">
                <BarChart3 className="w-3 h-3 mr-1" />
                AI Chart
              </Badge>
              <Badge variant="outline" className="text-xs px-2 py-1 shrink-0">
                {panelConfig.type}
              </Badge>
              {hasTimeVariables && (
                <Badge
                  variant="outline"
                  className="text-xs px-2 py-1 border-orange-200 text-orange-700 bg-orange-50 shrink-0"
                >
                  <Clock className="w-3 h-3 mr-1" />
                  Time-based
                </Badge>
              )}
            </div>
            <CardTitle className="text-lg font-semibold truncate">
              {panelConfig.title}
            </CardTitle>
          </div>

          {/* Right side - Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3"
                    onClick={executeChartQuery}
                    disabled={isLoading || !panelConfig.query}
                  >
                    {isLoading ? (
                      <Loader className="w-3 h-3 mr-1" />
                    ) : (
                      <RefreshCw className="w-3 h-3 mr-1" />
                    )}
                    {isLoading ? "Running" : "Refresh"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isLoading ? "Executing query..." : "Refresh chart data"}
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
                    onClick={copyConfig}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy configuration</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 px-3 bg-green-600 hover:bg-green-700"
                    disabled={isLoading}
                    onClick={() => setShowSaveToDashboard(true)}
                  >
                    <PlusCircle className="w-3 h-3 mr-1" />
                    Add to Dashboard
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isLoading
                    ? "Wait for query to complete"
                    : hasTimeVariables
                    ? "Add to dashboard (will use dashboard time filter)"
                    : "Add chart to dashboard"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Dialog
              open={showSaveToDashboard}
              onOpenChange={setShowSaveToDashboard}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Save Chart to Dashboard</DialogTitle>
                  <DialogDescription>
                    Choose an existing dashboard or create a new one for this AI
                    generated chart.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Dashboard</Label>
                    <Select
                      value={selectedDashboardId}
                      onValueChange={setSelectedDashboardId}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">
                          Create New Dashboard
                        </SelectItem>
                        {dashboards.map((dashboard) => (
                          <SelectItem key={dashboard.id} value={dashboard.id}>
                            {dashboard.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedDashboardId === "new" && (
                    <div className="space-y-2">
                      <Label>New Dashboard Name</Label>
                      <Input
                        value={newDashboardName}
                        onChange={(e) => setNewDashboardName(e.target.value)}
                        placeholder="Enter dashboard name"
                      />
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowSaveToDashboard(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleAddToDashboard}>Save Chart</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Configuration Controls */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t">
          {/* Database info */}
          <div className="flex items-center gap-2 text-sm">
            <Database className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">DB:</span>
            <span className="font-medium">
              {panelConfig.database || "None"}
            </span>
          </div>

          {/* Time configuration for time-based queries */}
          {hasTimeVariables && (
            <>
              <UnifiedSelector
                type="timeField"
                context="artifact"
                style="select"
                value={selectedTimeField}
                onChange={setSelectedTimeField}
                database={selectedDb}
                table={panelConfig.table}
                className="h-8 w-32"
                showIcon={true}
                label=""
                placeholder="Time field"
              />

              <Select
                value={
                  typeof localTimeRange.from === "string"
                    ? localTimeRange.from
                    : "5m"
                }
                onValueChange={(value) => {
                  setLocalTimeRange({
                    type: "relative",
                    from: value,
                    to: "now",
                  });
                }}
              >
                <SelectTrigger className="h-8 w-36">
                  <Clock className="w-3 h-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5m">Last 5 minutes</SelectItem>
                  <SelectItem value="15m">Last 15 minutes</SelectItem>
                  <SelectItem value="30m">Last 30 minutes</SelectItem>
                  <SelectItem value="1h">Last 1 hour</SelectItem>
                  <SelectItem value="3h">Last 3 hours</SelectItem>
                  <SelectItem value="6h">Last 6 hours</SelectItem>
                  <SelectItem value="12h">Last 12 hours</SelectItem>
                  <SelectItem value="24h">Last 24 hours</SelectItem>
                  <SelectItem value="2d">Last 2 days</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}

          {/* Status indicators */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground ml-auto">
            {lastExecuted && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{lastExecuted.toLocaleTimeString()}</span>
              </div>
            )}
            {data.length > 0 && (
              <div className="flex items-center gap-1">
                <Info className="w-3 h-3" />
                <span>{data.length} rows</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Chart Area */}
        <div className="bg-background rounded border min-h-[320px] relative overflow-hidden mb-4">
          {error ? (
            <div className="flex items-center justify-center h-full p-6">
              <div className="text-center max-w-md">
                <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-4" />
                <p className="text-sm text-destructive font-medium mb-3">
                  Query execution failed
                </p>
                <div className="text-xs text-muted-foreground break-words whitespace-pre-wrap bg-muted/50 p-3 rounded text-left max-h-32 overflow-y-auto">
                  {error}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={executeChartQuery}
                  className="mt-4"
                  disabled={isLoading}
                >
                  <RefreshCw className="w-3 h-3 mr-2" />
                  Retry Query
                </Button>
              </div>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader className="w-8 h-8 mx-auto mb-4" />
                <p className="text-sm text-muted-foreground font-medium">
                  Executing query...
                </p>
                {hasTimeVariables && selectedTimeField && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Using time field: {selectedTimeField}
                  </p>
                )}
              </div>
            </div>
          ) : !data || data.length === 0 ? (
            <div className="flex items-center justify-center h-full p-6">
              <div className="text-center">
                <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground font-medium mb-2">
                  No data to display
                </p>
                {panelConfig.query ? (
                  <>
                    <p className="text-xs text-muted-foreground mb-4">
                      Query completed successfully but returned no results
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={executeChartQuery}
                      disabled={isLoading}
                    >
                      <Play className="w-3 h-3 mr-2" />
                      Run Again
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No query specified
                  </p>
                )}
              </div>
            </div>
          ) : isChartType ? (
            <div className="p-3 h-[320px]">
              <ChartRenderer
                config={panelConfig}
                data={data}
                isEditMode={false}
                height="100%"
                width="100%"
              />
            </div>
          ) : PanelComponent ? (
            <div className="p-3 h-[320px]">
              <PanelComponent
                config={panelConfig}
                data={data}
                timeZone="UTC"
                isEditMode={false}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full p-6">
              <div className="text-center">
                <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground font-medium">
                  Unsupported panel type
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  "{panelConfig.type}" is not supported
                </p>
                <p className="text-xs text-muted-foreground mt-1 opacity-75">
                  Available: timeseries, stat, gauge, bar, table
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Query Section */}
        {panelConfig.query && (
          <div className="bg-muted/30 rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs px-2 py-1">
                  <Zap className="w-3 h-3 mr-1" />
                  SQL Query
                </Badge>
                {hasTimeVariables && (
                  <Badge
                    variant="outline"
                    className="text-xs px-2 py-1 bg-blue-50 border-blue-200 text-blue-700"
                  >
                    Variables processed
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(panelConfig.query);
                  toast.success("Query copied to clipboard");
                }}
              >
                <Copy className="w-3 h-3 mr-1" />
                Copy
              </Button>
            </div>
            <div className="bg-background rounded border p-3 overflow-x-auto">
              <pre className="text-xs font-mono whitespace-pre-wrap break-words text-muted-foreground">
                <code>{panelConfig.query}</code>
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
