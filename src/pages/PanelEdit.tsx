import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDashboardSafely } from "@/contexts/DashboardContext";
import { useConnection } from "@/contexts/ConnectionContext";
import { useDatabase } from "@/contexts/DatabaseContext";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Save,
  RefreshCw,
  Play,
  Settings,
  Clock,
  Hash,
  Type,
} from "lucide-react";
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
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { PANEL_TYPES } from "@/components/dashboard/panels";
import DashboardPanel from "@/components/dashboard/DashboardPanel";
import { DashboardTimeFilter } from "@/components/dashboard/DashboardTimeFilter";
import {
  type PanelConfig,
  type PanelTypeDefinition,
} from "@/types/dashboard.types";
import { toast } from "sonner";
import Loader from "@/components/Loader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import axios from "axios";
import QueryProcessor from "@/lib/query-processor";
import { PanelFactory } from "@/lib/panel-factory";

interface PanelEditProps {
  dashboardId?: string;
  panelId?: string;
  onSaveSuccess?: () => void;
  onCancel?: () => void;
}

// Field type analysis helper functions (same as QueryResults)
function analyzeFieldType(
  fieldName: string,
  value: any,
  schemaType?: string
): { type: string; format?: string } {
  const fieldLower = fieldName.toLowerCase();

  // Use schema type if available
  if (schemaType) {
    const typeLower = schemaType.toLowerCase();
    if (typeLower.includes("datetime") || typeLower.includes("timestamp")) {
      return { type: "DATETIME", format: "Time" };
    }
    if (typeLower.includes("bigint")) {
      if (fieldLower.includes("time") || fieldLower.includes("timestamp")) {
        return { type: "BIGINT", format: "Time (ns)" };
      }
      return { type: "BIGINT" };
    }
    if (typeLower.includes("int")) {
      return { type: "INTEGER" };
    }
    if (typeLower.includes("double") || typeLower.includes("float")) {
      return { type: "DOUBLE" };
    }
    if (typeLower.includes("string") || typeLower.includes("varchar")) {
      return { type: "VARCHAR" };
    }
  }

  // Fallback to value-based analysis
  if (
    fieldLower.includes("time") ||
    fieldLower.includes("date") ||
    fieldLower.includes("timestamp")
  ) {
    if (typeof value === "number") {
      if (value > 1e15) {
        return { type: "BIGINT", format: "Time (ns)" };
      } else if (value > 1e12) {
        return { type: "BIGINT", format: "Time (μs)" };
      } else if (value > 1e10) {
        return { type: "BIGINT", format: "Time (ms)" };
      } else {
        return { type: "INTEGER", format: "Time (s)" };
      }
    }
    return { type: "DATETIME", format: "Time" };
  }

  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { type: "INTEGER" };
    }
    return { type: "DOUBLE" };
  }

  if (typeof value === "string") {
    if (!isNaN(Number(value))) {
      return { type: "VARCHAR", format: "Numeric String" };
    }
    if (!isNaN(Date.parse(value))) {
      return { type: "VARCHAR", format: "Date String" };
    }
    return { type: "VARCHAR" };
  }

  if (typeof value === "boolean") {
    return { type: "BOOLEAN" };
  }

  return { type: "UNKNOWN" };
}

function getFieldTypeIcon(fieldType: { type: string; format?: string }) {
  if (fieldType.format?.includes("Time") || fieldType.type === "DATETIME") {
    return Clock;
  }
  if (
    fieldType.type === "INTEGER" ||
    fieldType.type === "DOUBLE" ||
    fieldType.type === "BIGINT"
  ) {
    return Hash;
  }
  if (fieldType.type === "VARCHAR") {
    return Type;
  }
  return Type;
}

function getSmartFieldLabel(
  fieldType: { type: string; format?: string },
  panelType: string,
  isXField: boolean = false
) {
  if (isXField && (panelType === "bar" || panelType === "scatter")) {
    if (fieldType.format?.includes("Time") || fieldType.type === "DATETIME") {
      return "Date Field";
    }
    return "Category Field";
  }

  if (
    isXField &&
    (panelType === "timeseries" || panelType === "line" || panelType === "area")
  ) {
    return "Time Field";
  }

  return isXField ? "X-Axis Field" : "Value Field (Y-Axis)";
}

// Smart field defaults - auto-select best fields (same as QueryResults)
function getSmartFieldDefaults(
  fields: string[],
  fieldTypes: Record<string, { type: string; format?: string }>,
  schemaFields: { name: string; type: string }[]
): any {
  const mapping: any = {};

  // Combine schema and runtime field analysis
  const allFieldTypes: Record<string, { type: string; format?: string }> = {
    ...fieldTypes,
  };
  schemaFields.forEach((field) => {
    if (!allFieldTypes[field.name]) {
      allFieldTypes[field.name] = analyzeFieldType(
        field.name,
        null,
        field.type
      );
    }
  });

  const allFields = [
    ...new Set([...fields, ...schemaFields.map((f) => f.name)]),
  ];

  // Find time fields (prioritize timestamp fields with Time format)
  const timeFields = allFields.filter((field) => {
    const fieldType = allFieldTypes[field];
    return (
      fieldType?.format?.includes("Time") ||
      fieldType?.type === "DATETIME" ||
      field.toLowerCase().includes("time") ||
      field.toLowerCase().includes("timestamp") ||
      field.toLowerCase().includes("date") ||
      field === "__timestamp"
    );
  });

  // Find numeric fields for Y-axis
  const numericFields = allFields.filter((field) => {
    const fieldType = allFieldTypes[field];
    return (
      fieldType?.type === "DOUBLE" ||
      fieldType?.type === "INTEGER" ||
      (fieldType?.type === "BIGINT" && !fieldType?.format?.includes("Time"))
    );
  });

  // Auto-select X field (time/timestamp first priority)
  if (timeFields.length > 0) {
    // Prefer __timestamp or fields with Time format
    const preferredTimeField =
      timeFields.find((field) => field === "__timestamp") ||
      timeFields.find((field) =>
        allFieldTypes[field]?.format?.includes("Time")
      ) ||
      timeFields[0];
    mapping.xField = preferredTimeField;
  } else if (allFields.length > 0) {
    // Fallback to first field
    mapping.xField = allFields[0];
  }

  // Auto-select Y field (first numeric field)
  if (numericFields.length > 0) {
    // Prefer DOUBLE over INTEGER over BIGINT
    const preferredNumField =
      numericFields.find((field) => allFieldTypes[field]?.type === "DOUBLE") ||
      numericFields.find((field) => allFieldTypes[field]?.type === "INTEGER") ||
      numericFields[0];
    mapping.yField = preferredNumField;
  }

  // Series field is left empty by default - user can choose to group by any field

  return mapping;
}

export default function PanelEdit(props?: PanelEditProps) {
  const { dashboardId: routeDashboardId, panelId: routePanelId } = useParams<{
    dashboardId: string;
    panelId?: string;
  }>();
  const navigate = useNavigate();

  const dashboardId = props?.dashboardId || routeDashboardId;
  const panelId = props?.panelId || routePanelId;

  const dashboardContext = useDashboardSafely();

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

  const { apiUrl } = useConnection();
  const { availableDatabases } = useDatabase();

  const [localConfig, setLocalConfig] = useState<Partial<PanelConfig> | null>(
    null
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoadingPanel, setIsLoadingPanel] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [schemaFields, setSchemaFields] = useState<
    { name: string; type: string }[]
  >([]);

  const isNewPanel = !panelId;

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
      // Create new panel with Grafana-like structure
      const newPanel = PanelFactory.createPanel({
        type: "timeseries",
        title: "New Panel",
        database: "",
        dashboardId: dashboardId,
      });

      setLocalConfig(newPanel);
      setHasChanges(true);
      setIsLoadingPanel(false);
    } else if (panelId && currentDashboard) {
      const panel = getPanelById(panelId);
      if (panel) {
        setLocalConfig({
          ...panel,
          useParentTimeFilter: true,
        });
        setHasChanges(false);
        setIsLoadingPanel(false);

        // Mark that we should auto-run query after component is ready
        if (panel.query && panel.database && currentDashboard?.timeRange) {
          setTimeout(() => {
            const event = new CustomEvent("autoRunQuery");
            window.dispatchEvent(event);
          }, 200); // Small delay to ensure component is fully loaded
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
    },
    [localConfig]
  );

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
    try {
      // Process query with simplified QueryProcessor
      const processedResult = QueryProcessor.process({
        database: localConfig.database,
        query: localConfig.query,
        timeRange: currentDashboard.timeRange,
        timeZone: currentDashboard.timeZone || "UTC",
        maxDataPoints: 1000,
      });

      let processedQuery = processedResult.query;

      // Add LIMIT if not present
      if (
        processedQuery.trim().toUpperCase().startsWith("SELECT") &&
        !processedQuery.toUpperCase().includes("LIMIT")
      ) {
        processedQuery += " LIMIT 1000";
      }

      const response = await axios.post(
        `${apiUrl}?db=${encodeURIComponent(
          localConfig.database
        )}&format=ndjson`,
        { query: processedQuery },
        { responseType: "text", timeout: 60000 }
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

      toast.success(`Query executed successfully - ${results.length} rows`);
      setPreviewData(results);

      // Extract available fields from the first result
      if (results.length > 0) {
        const fields = Object.keys(results[0]);
        setAvailableFields(fields);

        // Auto-suggest field mappings if none are set
        if (
          !localConfig.fieldMapping?.yField &&
          !localConfig.fieldMapping?.xField
        ) {
          const firstRecord = results[0];

          // Find numeric fields for Y-axis
          const numericFields = fields.filter((field) => {
            const value = firstRecord[field];
            return (
              typeof value === "number" ||
              (typeof value === "string" && !isNaN(Number(value)))
            );
          });

          // Find time fields for X-axis
          const timeFields = fields.filter((field) => {
            const lower = field.toLowerCase();
            return (
              lower.includes("time") ||
              lower.includes("date") ||
              lower.includes("timestamp") ||
              field === "__timestamp"
            );
          });

          // Find string fields that could be categories or series (excluding time fields)
          const stringFields = fields.filter((field) => {
            const value = firstRecord[field];
            const lower = field.toLowerCase();
            const isTimeField =
              lower.includes("time") ||
              lower.includes("date") ||
              lower.includes("timestamp") ||
              field === "__timestamp";
            return (
              typeof value === "string" && isNaN(Number(value)) && !isTimeField
            );
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

          // For series field, prefer non-time string fields like "location", "region", etc.
          if (stringFields.length > 0) {
            // Look for common series field names first
            const seriesCandidate =
              stringFields.find((field) => {
                const lower = field.toLowerCase();
                return (
                  lower.includes("location") ||
                  lower.includes("region") ||
                  lower.includes("zone") ||
                  lower.includes("name") ||
                  lower.includes("type") ||
                  lower.includes("category")
                );
              }) || stringFields[0]; // fallback to first string field

            suggestedMapping.seriesField = seriesCandidate;
          }

          if (Object.keys(suggestedMapping).length > 0) {
            handleConfigChange({
              fieldMapping: {
                ...localConfig.fieldMapping,
                ...suggestedMapping,
              },
            });
            toast.success(
              `Auto-detected field mappings: ${Object.entries(suggestedMapping)
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ")}`
            );
          }
        }
      } else {
        setAvailableFields([]);
      }
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error ||
        error.message ||
        "Query execution failed";
      toast.error(`Failed to execute query: ${errorMessage}`);
      console.error("Query execution error:", error);
    } finally {
      setIsExecuting(false);
    }
  }, [localConfig, apiUrl, currentDashboard]);

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

  // Auto-load schema when database or query changes
  useEffect(() => {
    if (!localConfig?.database || !localConfig?.query?.trim()) return;

    const loadSchemaFields = async () => {
      try {
        // Try to introspect schema from the query
        const response = await axios.post(
          `${apiUrl}?db=${encodeURIComponent(
            localConfig.database!
          )}&format=ndjson`,
          {
            query: `DESCRIBE ${localConfig.query!
              .replace(/WHERE.*$/i, "")
              .replace(/LIMIT.*$/i, "")
              .trim()} LIMIT 1`,
          },
          { responseType: "text", timeout: 10000 }
        );

        const textData = response.data;
        const lines = textData
          .split("\n")
          .filter((line: string) => line.trim());
        const schemaInfo: { name: string; type: string }[] = [];

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const record = JSON.parse(line);
            if (record.column_name && record.column_type) {
              schemaInfo.push({
                name: record.column_name,
                type: record.column_type,
              });
            }
          } catch (e) {
            // Skip invalid lines
          }
        }

        setSchemaFields(schemaInfo);

        // Auto-suggest field mappings based on schema
        if (
          schemaInfo.length > 0 &&
          !localConfig?.fieldMapping?.xField &&
          !localConfig?.fieldMapping?.yField
        ) {
          const timeFields = schemaInfo.filter((field) => {
            const lower = field.name.toLowerCase();
            const isTime =
              lower.includes("time") ||
              lower.includes("date") ||
              lower.includes("timestamp") ||
              field.name === "__timestamp";
            return isTime;
          });

          const numericFields = schemaInfo.filter((field) => {
            const type = field.type.toLowerCase();
            return (
              type.includes("int") ||
              type.includes("float") ||
              type.includes("double") ||
              type.includes("decimal") ||
              type.includes("number")
            );
          });

          const stringFields = schemaInfo.filter((field) => {
            const type = field.type.toLowerCase();
            const lower = field.name.toLowerCase();
            const isTime =
              lower.includes("time") ||
              lower.includes("date") ||
              lower.includes("timestamp") ||
              field.name === "__timestamp";
            return (
              type.includes("string") ||
              type.includes("varchar") ||
              (type.includes("text") && !isTime)
            );
          });

          const suggestedMapping: any = {};

          if (timeFields.length > 0) {
            suggestedMapping.xField = timeFields[0].name;
          }

          if (numericFields.length > 0) {
            suggestedMapping.yField = numericFields[0].name;
          }

          // Smart series field suggestion
          if (stringFields.length > 0) {
            const seriesCandidate =
              stringFields.find((field) => {
                const lower = field.name.toLowerCase();
                return (
                  lower.includes("location") ||
                  lower.includes("region") ||
                  lower.includes("zone") ||
                  lower.includes("name") ||
                  lower.includes("type") ||
                  lower.includes("category") ||
                  lower.includes("group") ||
                  lower.includes("class")
                );
              }) || stringFields[0];

            suggestedMapping.seriesField = seriesCandidate.name;
          }

          if (Object.keys(suggestedMapping).length > 0) {
            handleConfigChange({
              fieldMapping: {
                ...localConfig?.fieldMapping,
                ...suggestedMapping,
              },
            });
            toast.success(`Auto-detected field mappings from schema`);
          }
        } else {
          // Use smart defaults even without explicit suggestion logic
          const smartMapping = getSmartFieldDefaults(
            availableFields,
            {},
            schemaInfo
          );
          if (Object.keys(smartMapping).length > 0) {
            handleConfigChange({
              fieldMapping: {
                ...localConfig?.fieldMapping,
                ...smartMapping,
              },
            });
          }
        }
      } catch (error) {
        // Schema detection failed, not critical
        console.warn("Schema detection failed:", error);
      }
    };

    const timeoutId = setTimeout(loadSchemaFields, 1000); // Debounce for 1 second

    return () => clearTimeout(timeoutId);
  }, [localConfig?.database, localConfig?.query, apiUrl, handleConfigChange]);

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
          ...localConfig,
          useParentTimeFilter: true,
        } as Omit<PanelConfig, "id">);
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
                <div className="h-full flex flex-col border-b">
                  <div className="p-4 border-b bg-muted/30">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-medium">Panel Preview</h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRunQuery}
                        disabled={!localConfig.query?.trim()}
                      >
                        <RefreshCw className="h-3 w-3 mr-1.5" />
                        Refresh
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 p-4 overflow-auto">
                    <div className="h-full border rounded-lg bg-muted/20">
                      {localConfig.type &&
                      currentData?.data &&
                      currentData.data.length > 0 ? (
                        <DashboardPanel
                          config={
                            {
                              ...localConfig,
                              id: panelId || "preview",
                            } as PanelConfig
                          }
                          data={currentData.data}
                          isEditMode={false}
                          onEditPanel={() => {}}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center text-muted-foreground">
                            <p className="mb-2">
                              {!localConfig.query?.trim()
                                ? "Write a query to see preview"
                                : !currentData?.data?.length
                                ? "No data - run query to see results"
                                : !localConfig.type
                                ? "Select a panel type"
                                : "Configure panel to see preview"}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </ResizablePanel>

              <ResizableHandle />

              {/* Bottom: Query Editor */}
              <ResizablePanel defaultSize={60} minSize={40}>
                <div className="h-full flex flex-col">
                  <div className="p-4 border-b bg-muted/30">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-medium">Query Editor</h3>
                      <Button
                        onClick={handleRunQuery}
                        disabled={!localConfig?.query?.trim() || isExecuting}
                        size="sm"
                      >
                        <Play className="h-4 w-4 mr-2" />
                        {isExecuting ? "Running..." : "Run Query"}
                      </Button>
                    </div>

                    {/* Simple Database Selector */}
                    <div className="mb-4">
                      <Label
                        htmlFor="database-select"
                        className="text-sm font-medium"
                      >
                        Database
                      </Label>
                      <Select
                        value={localConfig?.database || "none"}
                        onValueChange={(value) =>
                          handleConfigChange({
                            database: value === "none" ? "" : value,
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select database" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableDatabases.map((db) => (
                            <SelectItem key={db} value={db}>
                              {db}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle />

          {/* Right Panel: Settings */}
          <ResizablePanel defaultSize={30} minSize={20}>
            <div className="h-full overflow-auto">
              <div className="p-4 border-b bg-muted/30">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Panel Settings
                </h3>
              </div>
              <div className="p-4 space-y-6">
                {/* Basic Settings */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="panel-title">Panel Title</Label>
                    <Input
                      id="panel-title"
                      value={localConfig.title || ""}
                      onChange={(e) =>
                        handleConfigChange({ title: e.target.value })
                      }
                      placeholder="e.g., CPU Usage Over Time"
                    />
                  </div>
                  <div>
                    <Label htmlFor="panel-type">Panel Type</Label>
                    <Select
                      value={localConfig.type || ""}
                      onValueChange={(value) =>
                        handleConfigChange({
                          type: value as PanelConfig["type"],
                        })
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

                {/* Field Mapping */}
                {localConfig.type && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium border-b pb-2">
                      Field Mapping
                    </h4>
                    <div className="space-y-3">
                      {/* X Field (Time/Category) */}
                      <div>
                        <Label>
                          {getSmartFieldLabel(
                            { type: "", format: "" },
                            localConfig.type || "",
                            true
                          )}
                        </Label>
                        <Select
                          value={localConfig.fieldMapping?.xField || ""}
                          onValueChange={(value) =>
                            handleConfigChange({
                              fieldMapping: {
                                ...localConfig.fieldMapping,
                                xField: value || undefined,
                              },
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select field" />
                          </SelectTrigger>
                          <SelectContent>
                            {/* Show current field mapping even if not in other lists */}
                            {localConfig.fieldMapping?.xField &&
                              !availableFields.includes(
                                localConfig.fieldMapping.xField
                              ) &&
                              !schemaFields.some(
                                (f) =>
                                  f.name === localConfig.fieldMapping?.xField
                              ) && (
                                <SelectItem
                                  value={localConfig.fieldMapping.xField}
                                >
                                  <div className="flex items-center gap-2 w-full">
                                    <Type className="h-3 w-3 text-muted-foreground" />
                                    <span className="flex-1">
                                      {localConfig.fieldMapping.xField}
                                    </span>
                                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                      CURRENT
                                    </span>
                                  </div>
                                </SelectItem>
                              )}
                            {/* Show schema fields first (with enhanced type info) */}
                            {schemaFields.map((field) => {
                              const fieldType = analyzeFieldType(
                                field.name,
                                null,
                                field.type
                              );
                              const IconComponent = getFieldTypeIcon(fieldType);
                              return (
                                <SelectItem
                                  key={`schema-${field.name}`}
                                  value={field.name}
                                >
                                  <div className="flex items-center gap-2 w-full">
                                    <IconComponent className="h-3 w-3 text-muted-foreground" />
                                    <span className="flex-1">{field.name}</span>
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                        {fieldType.type}
                                      </span>
                                      {fieldType.format && (
                                        <span className="text-xs bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded text-blue-700 dark:text-blue-300">
                                          {fieldType.format}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </SelectItem>
                              );
                            })}
                            {/* Show runtime fields from query results */}
                            {availableFields
                              .filter(
                                (field) =>
                                  !schemaFields.some((sf) => sf.name === field)
                              )
                              .map((field) => {
                                const fieldType = analyzeFieldType(
                                  field,
                                  previewData?.[0]?.[field]
                                );
                                const IconComponent =
                                  getFieldTypeIcon(fieldType);
                                return (
                                  <SelectItem
                                    key={`runtime-${field}`}
                                    value={field}
                                  >
                                    <div className="flex items-center gap-2 w-full">
                                      <IconComponent className="h-3 w-3 text-muted-foreground" />
                                      <span className="flex-1">{field}</span>
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                          {fieldType.type}
                                        </span>
                                        {fieldType.format && (
                                          <span className="text-xs bg-green-100 dark:bg-green-900 px-1.5 py-0.5 rounded text-green-700 dark:text-green-300">
                                            {fieldType.format}
                                          </span>
                                        )}
                                        <span className="text-xs bg-orange-100 dark:bg-orange-900 px-1.5 py-0.5 rounded text-orange-700 dark:text-orange-300">
                                          Query
                                        </span>
                                      </div>
                                    </div>
                                  </SelectItem>
                                );
                              })}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Y Field (Value) */}
                      <div>
                        <Label>Value Field (Y-Axis)</Label>
                        <Select
                          value={localConfig.fieldMapping?.yField || ""}
                          onValueChange={(value) =>
                            handleConfigChange({
                              fieldMapping: {
                                ...localConfig.fieldMapping,
                                yField: value || undefined,
                              },
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select field" />
                          </SelectTrigger>
                          <SelectContent>
                            {/* Show current field mapping even if not in other lists */}
                            {localConfig.fieldMapping?.yField &&
                              !availableFields.includes(
                                localConfig.fieldMapping.yField
                              ) &&
                              !schemaFields.some(
                                (f) =>
                                  f.name === localConfig.fieldMapping?.yField
                              ) && (
                                <SelectItem
                                  value={localConfig.fieldMapping.yField}
                                >
                                  <div className="flex items-center gap-2 w-full">
                                    <Type className="h-3 w-3 text-muted-foreground" />
                                    <span className="flex-1">
                                      {localConfig.fieldMapping.yField}
                                    </span>
                                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                      CURRENT
                                    </span>
                                  </div>
                                </SelectItem>
                              )}
                            {/* Show schema fields first (with enhanced type info) */}
                            {schemaFields.map((field) => {
                              const fieldType = analyzeFieldType(
                                field.name,
                                null,
                                field.type
                              );
                              const IconComponent = getFieldTypeIcon(fieldType);
                              return (
                                <SelectItem
                                  key={`schema-${field.name}`}
                                  value={field.name}
                                >
                                  <div className="flex items-center gap-2 w-full">
                                    <IconComponent className="h-3 w-3 text-muted-foreground" />
                                    <span className="flex-1">{field.name}</span>
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                        {fieldType.type}
                                      </span>
                                      {fieldType.format && (
                                        <span className="text-xs bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded text-blue-700 dark:text-blue-300">
                                          {fieldType.format}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </SelectItem>
                              );
                            })}
                            {/* Show runtime fields from query results */}
                            {availableFields
                              .filter(
                                (field) =>
                                  !schemaFields.some((sf) => sf.name === field)
                              )
                              .map((field) => {
                                const fieldType = analyzeFieldType(
                                  field,
                                  previewData?.[0]?.[field]
                                );
                                const IconComponent =
                                  getFieldTypeIcon(fieldType);
                                return (
                                  <SelectItem
                                    key={`runtime-${field}`}
                                    value={field}
                                  >
                                    <div className="flex items-center gap-2 w-full">
                                      <IconComponent className="h-3 w-3 text-muted-foreground" />
                                      <span className="flex-1">{field}</span>
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                          {fieldType.type}
                                        </span>
                                        {fieldType.format && (
                                          <span className="text-xs bg-green-100 dark:bg-green-900 px-1.5 py-0.5 rounded text-green-700 dark:text-green-300">
                                            {fieldType.format}
                                          </span>
                                        )}
                                        <span className="text-xs bg-orange-100 dark:bg-orange-900 px-1.5 py-0.5 rounded text-orange-700 dark:text-orange-300">
                                          Query
                                        </span>
                                      </div>
                                    </div>
                                  </SelectItem>
                                );
                              })}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Series Field (optional) */}
                      <div>
                        <Label>Group by (optional)</Label>
                        <Select
                          value={
                            localConfig.fieldMapping?.seriesField || "none"
                          }
                          onValueChange={(value) =>
                            handleConfigChange({
                              fieldMapping: {
                                ...localConfig.fieldMapping,
                                seriesField:
                                  value === "none" ? undefined : value,
                              },
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select field" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {/* Show current field mapping even if not in other lists */}
                            {localConfig.fieldMapping?.seriesField &&
                              !availableFields.includes(
                                localConfig.fieldMapping.seriesField
                              ) &&
                              !schemaFields.some(
                                (f) =>
                                  f.name ===
                                  localConfig.fieldMapping?.seriesField
                              ) && (
                                <SelectItem
                                  value={localConfig.fieldMapping.seriesField}
                                >
                                  <div className="flex items-center gap-2 w-full">
                                    <Type className="h-3 w-3 text-muted-foreground" />
                                    <span className="flex-1">
                                      {localConfig.fieldMapping.seriesField}
                                    </span>
                                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                      CURRENT
                                    </span>
                                  </div>
                                </SelectItem>
                              )}
                            {/* Show schema fields first (with enhanced type info) */}
                            {schemaFields.map((field) => {
                              const fieldType = analyzeFieldType(
                                field.name,
                                null,
                                field.type
                              );
                              const IconComponent = getFieldTypeIcon(fieldType);
                              return (
                                <SelectItem
                                  key={`schema-${field.name}`}
                                  value={field.name}
                                >
                                  <div className="flex items-center gap-2 w-full">
                                    <IconComponent className="h-3 w-3 text-muted-foreground" />
                                    <span className="flex-1">{field.name}</span>
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                        {fieldType.type}
                                      </span>
                                      {fieldType.format && (
                                        <span className="text-xs bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded text-blue-700 dark:text-blue-300">
                                          {fieldType.format}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </SelectItem>
                              );
                            })}
                            {/* Show runtime fields from query results */}
                            {availableFields
                              .filter(
                                (field) =>
                                  !schemaFields.some((sf) => sf.name === field)
                              )
                              .map((field) => {
                                const fieldType = analyzeFieldType(
                                  field,
                                  previewData?.[0]?.[field]
                                );
                                const IconComponent =
                                  getFieldTypeIcon(fieldType);
                                return (
                                  <SelectItem
                                    key={`runtime-${field}`}
                                    value={field}
                                  >
                                    <div className="flex items-center gap-2 w-full">
                                      <IconComponent className="h-3 w-3 text-muted-foreground" />
                                      <span className="flex-1">{field}</span>
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                          {fieldType.type}
                                        </span>
                                        {fieldType.format && (
                                          <span className="text-xs bg-green-100 dark:bg-green-900 px-1.5 py-0.5 rounded text-green-700 dark:text-green-300">
                                            {fieldType.format}
                                          </span>
                                        )}
                                        <span className="text-xs bg-orange-100 dark:bg-orange-900 px-1.5 py-0.5 rounded text-orange-700 dark:text-orange-300">
                                          Query
                                        </span>
                                      </div>
                                    </div>
                                  </SelectItem>
                                );
                              })}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {!availableFields.length && !schemaFields.length && (
                      <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
                        {localConfig.database && localConfig.query
                          ? "Run a query to see available fields"
                          : "Select database and write a query to see field suggestions"}
                      </div>
                    )}

                    {schemaFields.length > 0 && (
                      <div className="text-sm text-muted-foreground p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                        Found {schemaFields.length} fields from schema analysis
                      </div>
                    )}
                  </div>
                )}

                {/* Field Configuration */}
                {localConfig.type && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium border-b pb-2">
                      Field Configuration
                    </h4>
                    <div>
                      <Label htmlFor="unit">Unit</Label>
                      <Input
                        id="unit"
                        value={localConfig.fieldConfig?.defaults?.unit || ""}
                        onChange={(e) =>
                          handleConfigChange({
                            fieldConfig: {
                              ...localConfig.fieldConfig,
                              defaults: {
                                ...localConfig.fieldConfig?.defaults,
                                unit: e.target.value,
                              },
                            },
                          })
                        }
                        placeholder="e.g., %, ms, MB"
                      />
                    </div>
                    <div>
                      <Label htmlFor="decimals">Decimals</Label>
                      <Input
                        id="decimals"
                        type="number"
                        value={
                          localConfig.fieldConfig?.defaults?.decimals || ""
                        }
                        onChange={(e) =>
                          handleConfigChange({
                            fieldConfig: {
                              ...localConfig.fieldConfig,
                              defaults: {
                                ...localConfig.fieldConfig?.defaults,
                                decimals: parseInt(e.target.value) || 0,
                              },
                            },
                          })
                        }
                        placeholder="2"
                      />
                    </div>
                  </div>
                )}

                {/* Panel Options */}
                {localConfig.type && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium border-b pb-2">
                      Panel Options
                    </h4>
                    <div>
                      <Label>Legend Placement</Label>
                      <Select
                        value={
                          localConfig.options?.legend?.placement || "bottom"
                        }
                        onValueChange={(value) =>
                          handleConfigChange({
                            options: {
                              ...localConfig.options,
                              legend: {
                                ...localConfig.options?.legend,
                                placement: value as any,
                                showLegend: localConfig.options?.legend?.showLegend ?? true,
                                displayMode: localConfig.options?.legend?.displayMode ?? "list",
                              },
                            },
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bottom">Bottom</SelectItem>
                          <SelectItem value="top">Top</SelectItem>
                          <SelectItem value="right">Right</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
