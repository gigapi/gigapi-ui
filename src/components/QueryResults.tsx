import { useState, useEffect, useRef } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Copy,
  Share,
  Timer,
  Server,
  BarChart3,
  Save,
  Clock,
  Hash,
  Type,
} from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBytes, formatExecutionTime } from "@/lib/utils/formatting";
import { useQuery } from "@/contexts/QueryContext";
import { useDatabase } from "@/contexts/DatabaseContext";
import { useTime } from "@/contexts/TimeContext";
import { useDashboard } from "@/contexts/DashboardContext";
import GigTable from "@/components/GigTable";
import Loader from "@/components/Loader";
import { Button } from "@/components/ui/button";
import { HashQueryUtils } from "@/lib/";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { PanelFactory } from "@/lib/panel-factory";
import { PANEL_TYPES } from "@/components/dashboard/panels";
import { transformDataForPanel, parseNDJSON } from "@/lib/dashboard/data-transformers";
import { 
  type PanelConfig, 
  type FieldMapping,
  type Dashboard,
  type NDJSONRecord 
} from "@/types/dashboard.types";
import TimeSeriesPanel from "@/components/dashboard/panels/TimeSeriesPanel";
import StatPanel from "@/components/dashboard/panels/StatPanel";
import GaugePanel from "@/components/dashboard/panels/GaugePanel";
import TablePanel from "@/components/dashboard/panels/TablePanel";

// Local interface for display-specific performance metrics
interface DisplayPerformanceMetrics {
  totalTime: number;
  serverTime: number;
  networkTime: number;
  clientTime: number;
}

// Field type analysis
function analyzeFieldType(fieldName: string, value: any): { type: string; format?: string } {
  const fieldLower = fieldName.toLowerCase();
  
  // Time field detection
  if (fieldLower.includes('time') || fieldLower.includes('date') || fieldLower.includes('timestamp')) {
    if (typeof value === 'number') {
      // Detect timestamp precision
      if (value > 1e15) {
        return { type: 'BIGINT', format: 'Time (ns)' };
      } else if (value > 1e12) {
        return { type: 'BIGINT', format: 'Time (μs)' };
      } else if (value > 1e10) {
        return { type: 'BIGINT', format: 'Time (ms)' };
      } else {
        return { type: 'INTEGER', format: 'Time (s)' };
      }
    }
    return { type: 'DATETIME', format: 'Time' };
  }
  
  // Numeric field detection
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { type: 'INTEGER' };
    }
    return { type: 'DOUBLE' };
  }
  
  // String field detection
  if (typeof value === 'string') {
    // Check if it's a parseable number
    if (!isNaN(Number(value))) {
      return { type: 'VARCHAR', format: 'Numeric String' };
    }
    // Check if it's a date string
    if (!isNaN(Date.parse(value))) {
      return { type: 'VARCHAR', format: 'Date String' };
    }
    return { type: 'VARCHAR' };
  }
  
  // Boolean
  if (typeof value === 'boolean') {
    return { type: 'BOOLEAN' };
  }
  
  // Default
  return { type: 'UNKNOWN' };
}

// Field type icon mapping
function getFieldTypeIcon(fieldType: { type: string; format?: string }) {
  if (fieldType.format?.includes('Time') || fieldType.type === 'DATETIME') {
    return Clock;
  }
  if (fieldType.type === 'INTEGER' || fieldType.type === 'DOUBLE' || fieldType.type === 'BIGINT') {
    return Hash;
  }
  if (fieldType.type === 'VARCHAR') {
    return Type;
  }
  return Type;
}

// Smart field label for different panel types
function getSmartFieldLabel(fieldType: { type: string; format?: string }, panelType: string, isXField: boolean = false) {
  if (isXField && (panelType === 'bar' || panelType === 'scatter')) {
    // For bar/scatter charts, time fields become "Date" on X-axis
    if (fieldType.format?.includes('Time') || fieldType.type === 'DATETIME') {
      return 'Date Field';
    }
    return 'Category Field';
  }
  
  if (isXField && (panelType === 'timeseries' || panelType === 'line' || panelType === 'area')) {
    return 'Time Field';
  }
  
  return isXField ? 'X Field' : 'Value Field';
}

// Smart field defaults - auto-select best fields
function getSmartFieldDefaults(fields: string[], fieldTypes: Record<string, { type: string; format?: string }>): FieldMapping {
  const mapping: FieldMapping = {};
  
  // Find time fields (prioritize timestamp fields with Time format)
  const timeFields = fields.filter(field => {
    const fieldType = fieldTypes[field];
    return fieldType?.format?.includes('Time') || 
           fieldType?.type === 'DATETIME' ||
           field.toLowerCase().includes('time') ||
           field.toLowerCase().includes('timestamp') ||
           field.toLowerCase().includes('date') ||
           field === '__timestamp';
  });
  
  // Find numeric fields for Y-axis
  const numericFields = fields.filter(field => {
    const fieldType = fieldTypes[field];
    return fieldType?.type === 'DOUBLE' || 
           fieldType?.type === 'INTEGER' || 
           fieldType?.type === 'BIGINT' && !fieldType?.format?.includes('Time');
  });
  
  // Auto-select X field (time/timestamp first priority)
  if (timeFields.length > 0) {
    // Prefer __timestamp or fields with Time format
    const preferredTimeField = timeFields.find(field => field === '__timestamp') ||
                              timeFields.find(field => fieldTypes[field]?.format?.includes('Time')) ||
                              timeFields[0];
    mapping.xField = preferredTimeField;
  } else if (fields.length > 0) {
    // Fallback to first field
    mapping.xField = fields[0];
  }
  
  // Auto-select Y field (first numeric field)
  if (numericFields.length > 0) {
    // Prefer DOUBLE over INTEGER over BIGINT
    const preferredNumField = numericFields.find(field => fieldTypes[field]?.type === 'DOUBLE') ||
                             numericFields.find(field => fieldTypes[field]?.type === 'INTEGER') ||
                             numericFields[0];
    mapping.yField = preferredNumField;
  }
  
  // Series field is left empty by default - user can choose to group by any field
  
  return mapping;
}

export default function QueryResults() {
  const {
    results,
    rawJson,
    isLoading,
    error,
    queryErrorDetail,
    executionTime, // This is server execution time
    responseSize,
    query,
    queryHistory,
    actualExecutedQuery, // Added from previous context reading
  } = useQuery();

  const { selectedDb, selectedTable } = useDatabase();
  const { selectedTimeField, timeRange } = useTime();
  const { createDashboard, addPanel, loadDashboard } = useDashboard();

  const [activeTab, setActiveTab] = useState("results");
  const [currentExecutedQuery, setCurrentExecutedQuery] = useState(query);
  const [transformedQuery, setTransformedQuery] = useState("");

  // Panel creation states
  const [panelConfig, setPanelConfig] = useState<PanelConfig>(() => 
    PanelFactory.createPanel('timeseries', 'Query Panel', query)
  );
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({});
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [fieldTypes, setFieldTypes] = useState<Record<string, { type: string; format?: string }>>({});
  const [showSaveToDashboard, setShowSaveToDashboard] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState("");
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>("new");
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);

  const [localPerformanceMetrics, setLocalPerformanceMetrics] =
    useState<DisplayPerformanceMetrics>({
      totalTime: 0,
      serverTime: 0,
      networkTime: 0,
      clientTime: 0,
    });

  const renderStartTime = useRef(0);
  const queryStartTime = useRef(0); // For overall client-perceived time

  useEffect(() => {
    if (isLoading) {
      renderStartTime.current = performance.now();
      queryStartTime.current = performance.now(); // Start of client-perceived operation
    } else if (
      results !== null &&
      executionTime !== null &&
      executionTime !== undefined
    ) {
      const clientRenderTime = performance.now() - renderStartTime.current;
      const overallClientPerceivedTime =
        performance.now() - queryStartTime.current;

      const serverProcTime = executionTime; // from useQuery, assumed as server processing time
      const clientProcTime = clientRenderTime;

      let netTime =
        overallClientPerceivedTime - serverProcTime - clientProcTime;
      if (netTime < 0) {
        // Sanity check, network time can't be negative
        netTime = 0;
      }

      setLocalPerformanceMetrics({
        totalTime: overallClientPerceivedTime,
        serverTime: serverProcTime,
        networkTime: netTime,
        clientTime: clientProcTime,
      });
    }
  }, [results, isLoading, executionTime]); // Removed rawJson as extractServerMetrics is no longer used here

  useEffect(() => {
    if (queryHistory.length > 0) {
      const latestQuery = queryHistory[0];
      setCurrentExecutedQuery(latestQuery.query || query);
    } else {
      setCurrentExecutedQuery(query);
    }
  }, [queryHistory, query]);

  const extractTransformedQuery = (jsonData: any): string | undefined => {
    if (
      typeof jsonData === "object" &&
      jsonData !== null &&
      jsonData._processed_query
    ) {
      return jsonData._processed_query;
    }
    if (typeof jsonData === "string") {
      try {
        const parsed = JSON.parse(jsonData);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          parsed._processed_query
        ) {
          return parsed._processed_query;
        }
      } catch (e) {
        // Not a parseable JSON object string or doesn't contain the field
      }
    }
    return undefined;
  };

  useEffect(() => {
    if (actualExecutedQuery) {
      setTransformedQuery(actualExecutedQuery);
    } else {
      const extracted = extractTransformedQuery(rawJson);
      if (extracted) {
        setTransformedQuery(extracted);
      } else {
        setTransformedQuery(""); // Clear if not found
      }
    }
  }, [actualExecutedQuery, rawJson]);

  // Update available fields when results change
  useEffect(() => {
    if (results && results.length > 0) {
      const fields = Object.keys(results[0]).filter(key => !key.startsWith('_'));
      setAvailableFields(fields);
      
      // Analyze field types from sample data
      const types: Record<string, { type: string; format?: string }> = {};
      const sampleRow = results[0];
      
      fields.forEach(field => {
        const value = sampleRow[field];
        const fieldType = analyzeFieldType(field, value);
        types[field] = fieldType;
      });
      
      setFieldTypes(types);

      // Auto-select smart defaults if no mapping exists
      if (!fieldMapping.xField && !fieldMapping.yField) {
        const smartMapping = getSmartFieldDefaults(fields, types);
        setFieldMapping(smartMapping);
      }
    } else {
      setAvailableFields([]);
      setFieldTypes({});
    }
  }, [results]);

  // Update panel config when query changes
  useEffect(() => {
    setPanelConfig(prev => ({
      ...prev,
      query: query,
      fieldMapping: fieldMapping,
    }));
  }, [query, fieldMapping]);

  // Load dashboards for the save dialog
  useEffect(() => {
    const loadDashboards = async () => {
      try {
        const { dashboardStorage } = await import("@/lib/dashboard/storage");
        const dashboardList = await dashboardStorage.listDashboards();
        setDashboards(dashboardList.map(item => ({
          id: item.id,
          title: item.name,
          description: item.description || "",
          timeRange: { type: "relative" as const, from: "1h", to: "now" as const },
          timeZone: "UTC",
          layout: { panels: [] },
          metadata: {
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            tags: item.tags || []
          }
        })));
      } catch (error) {
        console.error("Failed to load dashboards:", error);
      }
    };

    if (showSaveToDashboard) {
      loadDashboards();
    }
  }, [showSaveToDashboard]);

  function renderResultsContent() {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-64">
          <Loader className="h-24 w-24" />
          <p className="mt-4 text-muted-foreground">Executing query...</p>
        </div>
      );
    }

    if (error) {
      // Use queryErrorDetail if available, otherwise fallback to simpler error handling
      const detailedError = queryErrorDetail || error;

      // Format SQL errors by preserving newlines and formatting code parts
      const formattedError = detailedError.split("\n").map((line, i) => {
        // Highlight SQL code snippets that often appear after "LINE X:"
        if (line.includes("LINE") && line.includes("^")) {
          const parts = line.split("^");
          return (
            <div key={i} className="font-mono">
              {parts[0]}
              <span className="text-red-500 font-bold">^</span>
              {parts[1] || ""}
            </div>
          );
        }
        // Highlight candidate column names
        else if (line.includes("Candidate bindings:")) {
          return (
            <div key={i} className="font-mono">
              Candidate bindings:
              <span className="text-yellow-500 font-semibold">
                {line.split("Candidate bindings:")[1]}
              </span>
            </div>
          );
        }
        // Return normal lines
        return (
          <div key={i} className="font-mono">
            {line}
          </div>
        );
      });

      return (
        <div className="flex flex-col items-center justify-center h-full w-full max-w-4xl mx-auto">
          <div className="w-full bg-red-950/30 border border-red-800 rounded-lg p-6 text-left">
            <div className="flex items-center mb-4">
              <AlertCircle className="h-6 w-6 text-red-500 mr-3" />
              <h3 className="text-lg font-semibold text-red-500">
                Query Error
              </h3>
              {error.includes("status code") && (
                <span className="ml-auto text-sm text-red-400">{error}</span>
              )}
            </div>

            <div className="text-sm whitespace-pre-wrap">{formattedError}</div>
          </div>

          <div className="mt-6 text-center text-muted-foreground">
            <p>Check your SQL syntax and column names, then try again.</p>
          </div>
        </div>
      );
    }

    if (!results) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <Database className="h-12 w-12 mb-4 opacity-50" />
          <p className="text-lg">Execute a query to see results</p>
        </div>
      );
    }
    if (results.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <CheckCircle2 className="h-12 w-12 mb-4 text-green-500" />
          <p className="text-lg">Query executed successfully</p>
          <p className="text-sm mt-2">No results returned</p>
        </div>
      );
    }
    return (
      <GigTable
        data={results}
        // Pass relevant performance data if GigTable uses it
        // executionTime={localPerformanceMetrics.serverTime}
        // responseSize={responseSize}
        initialPageSize={25}
      />
    );
  }

  function renderPanelContent() {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-64">
          <Loader className="h-24 w-24" />
          <p className="mt-4 text-muted-foreground">Executing query...</p>
        </div>
      );
    }

    if (error || !results || results.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <BarChart3 className="h-12 w-12 mb-4 opacity-50" />
          <p className="text-lg">Execute a query to create a panel</p>
          <p className="text-sm mt-2">Your query results will be visualized here</p>
        </div>
      );
    }

    return (
      <div className="h-full flex gap-4 p-4">
        {/* Panel Preview - Left Side */}
        <div className="flex-1 flex flex-col">
          <Card className="flex-1">
            <CardHeader>
              <CardTitle className="text-lg">Preview</CardTitle>
            </CardHeader>
            <CardContent className="h-[600px]">
              {renderPanelPreview()}
            </CardContent>
          </Card>
        </div>

        {/* Panel Configuration - Right Side */}
        <div className="w-80 flex flex-col space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Panel Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Panel Type */}
              <div className="space-y-2">
                <Label htmlFor="panel-type">Panel Type</Label>
                <Select
                  value={panelConfig.type}
                  onValueChange={(value: any) => {
                    const newConfig = PanelFactory.createPanel(value, panelConfig.title, query);
                    setPanelConfig({
                      ...newConfig,
                      fieldMapping: fieldMapping,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PANEL_TYPES).map(([key, panelType]) => (
                      <SelectItem key={key} value={key}>
                        {panelType.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Panel Title */}
              <div className="space-y-2">
                <Label htmlFor="panel-title">Panel Title</Label>
                <Input
                  id="panel-title"
                  value={panelConfig.title}
                  onChange={(e) => setPanelConfig(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Panel title"
                />
              </div>

              {/* Field Mapping */}
              {availableFields.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Field Mapping</Label>
                  
                  {/* X Field */}
                  <div className="space-y-2">
                    <Label htmlFor="x-field" className="text-xs text-muted-foreground">
                      {getSmartFieldLabel({ type: '', format: '' }, panelConfig.type, true)}
                    </Label>
                    <Select
                      value={fieldMapping.xField || ""}
                      onValueChange={(value) => setFieldMapping(prev => ({ 
                        ...prev, 
                        xField: value || undefined 
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableFields.map(field => {
                          const fieldType = fieldTypes[field] || { type: 'UNKNOWN' };
                          const IconComponent = getFieldTypeIcon(fieldType);
                          return (
                            <SelectItem key={field} value={field}>
                              <div className="flex items-center gap-2 w-full">
                                <IconComponent className="h-3 w-3 text-muted-foreground" />
                                <span className="flex-1">{field}</span>
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
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Y Field */}
                  <div className="space-y-2">
                    <Label htmlFor="y-field" className="text-xs text-muted-foreground">Value Field (Y-Axis)</Label>
                    <Select
                      value={fieldMapping.yField || ""}
                      onValueChange={(value) => setFieldMapping(prev => ({ 
                        ...prev, 
                        yField: value || undefined 
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableFields.map(field => {
                          const fieldType = fieldTypes[field] || { type: 'UNKNOWN' };
                          const IconComponent = getFieldTypeIcon(fieldType);
                          return (
                            <SelectItem key={field} value={field}>
                              <div className="flex items-center gap-2 w-full">
                                <IconComponent className="h-3 w-3 text-muted-foreground" />
                                <span className="flex-1">{field}</span>
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
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Series Field */}
                  <div className="space-y-2">
                    <Label htmlFor="series-field" className="text-xs text-muted-foreground">Group by (optional)</Label>
                    <Select
                      value={fieldMapping.seriesField || "none"}
                      onValueChange={(value) => setFieldMapping(prev => ({ 
                        ...prev, 
                        seriesField: value === "none" ? undefined : value 
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {availableFields.map(field => {
                          const fieldType = fieldTypes[field] || { type: 'UNKNOWN' };
                          const IconComponent = getFieldTypeIcon(fieldType);
                          return (
                            <SelectItem key={field} value={field}>
                              <div className="flex items-center gap-2 w-full">
                                <IconComponent className="h-3 w-3 text-muted-foreground" />
                                <span className="flex-1">{field}</span>
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
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Save to Dashboard */}
              <div className="pt-4 border-t">
                <Dialog open={showSaveToDashboard} onOpenChange={setShowSaveToDashboard}>
                  <DialogTrigger asChild>
                    <Button className="w-full">
                      <Save className="h-4 w-4 mr-2" />
                      Save to Dashboard
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Save Panel to Dashboard</DialogTitle>
                      <DialogDescription>
                        Choose an existing dashboard or create a new one for this panel.
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
                            <SelectItem value="new">Create New Dashboard</SelectItem>
                            {dashboards.map(dashboard => (
                              <SelectItem key={dashboard.id} value={dashboard.id}>
                                {dashboard.title}
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
                      <Button onClick={handleSaveToDashboard}>
                        Save Panel
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  function renderPanelPreview() {
    if (!results || results.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <div className="text-center">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No data to preview</p>
          </div>
        </div>
      );
    }

    try {
      // Parse NDJSON if needed
      let records: NDJSONRecord[];
      if (typeof rawJson === 'string') {
        records = parseNDJSON(rawJson);
      } else if (Array.isArray(results)) {
        records = results;
      } else {
        records = [results];
      }

      const configWithMapping = {
        ...panelConfig,
        fieldMapping: fieldMapping,
      };

      const transformedData = transformDataForPanel(records, configWithMapping);

      // Render the appropriate panel component
      const panelProps = {
        config: configWithMapping,
        data: records,
        transformedData,
        isLoading: false,
        error: null,
      };

      switch (panelConfig.type) {
        case 'timeseries':
        case 'line':
        case 'area':
          return <TimeSeriesPanel {...panelProps} />;
        case 'stat':
          return <StatPanel {...panelProps} />;
        case 'gauge':
          return <GaugePanel {...panelProps} />;
        case 'table':
          return <TablePanel {...panelProps} />;
        case 'bar':
        case 'scatter':
          return <TimeSeriesPanel {...panelProps} />;
        default:
          return <TimeSeriesPanel {...panelProps} />;
      }
    } catch (error) {
      console.error('Error rendering panel preview:', error);
      return (
        <div className="flex items-center justify-center h-full text-red-500">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4" />
            <p>Error rendering panel preview</p>
            <p className="text-sm mt-2">{String(error)}</p>
          </div>
        </div>
      );
    }
  }

  async function handleSaveToDashboard() {
    try {
      let dashboardId = selectedDashboardId;

      // Create new dashboard if needed
      if (selectedDashboardId === "new") {
        if (!newDashboardName.trim()) {
          toast.error("Please enter a dashboard name");
          return;
        }

        const newDashboard = await createDashboard({
          title: newDashboardName,
          description: `Dashboard created from query: ${query.slice(0, 50)}...`,
        });

        dashboardId = newDashboard.id;
        
        // Load the new dashboard to make it current
        await loadDashboard(dashboardId);
      } else {
        // Load the selected existing dashboard to make it current
        await loadDashboard(dashboardId);
      }

      // Create panel with current configuration
      const finalConfig = {
        ...panelConfig,
        fieldMapping: fieldMapping,
        query: query,
        database: selectedDb, // Add current database
      };

      await addPanel(finalConfig);

      toast.success(`Panel saved to dashboard successfully!`);
      setShowSaveToDashboard(false);
      setNewDashboardName("");
    } catch (error) {
      console.error('Error saving panel:', error);
      toast.error("Failed to save panel to dashboard");
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full w-full">
      <Tabs
        defaultValue="results"
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col h-full"
      >
        <div className="flex justify-between items-center mb-3 flex-shrink-0">
          <TabsList className="bg-muted p-1 rounded-lg">
            <TabsTrigger
              value="results"
              className="px-3 py-1 rounded-md text-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
            >
              Results
            </TabsTrigger>

            <TabsTrigger
              value="raw"
              className="px-3 py-1 rounded-md text-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
            >
              Raw
            </TabsTrigger>

            <TabsTrigger
              value="query"
              className="px-3 py-1 rounded-md text-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
            >
              Query
            </TabsTrigger>
            <TabsTrigger
              value="performance"
              className="px-3 py-1 rounded-md text-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
            >
              Performance
            </TabsTrigger>
            
            <TabsTrigger
              value="panel"
              className="px-3 py-1 rounded-md text-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
            >
              <BarChart3 className="h-4 w-4 mr-1" />
              Panel
            </TabsTrigger>
          </TabsList>

          {error && !error.includes("databases") && (
            <div className="flex items-center text-red-500 text-sm max-w-[80%] bg-red-500/15 rounded-md p-2 border border-red-500">
              <AlertCircle className="h-4 w-4 mr-2" />
              <span className="font-medium">
                {queryErrorDetail ? "SQL Error" : "Query failed"}
              </span>
              <span className="mx-2">•</span>
              <span className="text-xs">See Results tab for details</span>
            </div>
          )}
        </div>

        <TabsContent value="results" className="flex-1 overflow-auto min-h-0">
          {renderResultsContent()}
        </TabsContent>

        <TabsContent value="raw" className="flex-1 overflow-auto min-h-0">
          <ScrollArea className="h-full rounded-md border bg-card">
            <Button
              className="absolute top-2 right-2 z-10"
              onClick={() => {
                // Handle copying based on rawJson type
                const textToCopy =
                  typeof rawJson === "string"
                    ? rawJson
                    : JSON.stringify(rawJson, null, 2);
                navigator.clipboard.writeText(textToCopy);
                toast.success("Raw data copied to clipboard");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <pre className="p-4 text-sm font-mono text-card-foreground text-wrap break-words whitespace-pre-wrap">
              {isLoading ? (
                <>
                  <Loader className="h-12 w-12" />
                  <p>Loading...</p>
                </>
              ) : rawJson ? (
                typeof rawJson === "string" ? (
                  rawJson // Display raw string (NDJSON) as is
                ) : (
                  JSON.stringify(rawJson, null, 2)
                ) // Format JSON with indentation
              ) : (
                "No raw data available."
              )}
            </pre>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="query" className="flex-1 overflow-auto min-h-0">
          <ScrollArea className="h-full rounded-md border bg-card">
            <div className="absolute top-2 right-2 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(query);
                  toast.success("Query copied to clipboard");
                }}
              >
                <Copy className="h-4 w-4 mr-1" /> Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const params = {
                    query,
                    db: selectedDb,
                    table: selectedTable || undefined,
                    timeField: selectedTimeField || undefined,
                    timeFrom: timeRange?.from,
                    timeTo: timeRange?.to,
                  };
                  HashQueryUtils.copyShareableUrl(params).then(
                    (success: boolean) => {
                      if (success) {
                        toast.success("Shareable URL copied to clipboard");
                      } else {
                        toast.error("Failed to copy URL");
                      }
                    }
                  );
                }}
              >
                <Share className="h-4 w-4 mr-1" /> Share
              </Button>
            </div>
            <div className="p-4 text-sm font-mono text-card-foreground mt-12">
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-xs uppercase text-muted-foreground mb-1 font-bold">
                    Query (Editor)
                  </h3>
                  <pre className="bg-muted p-3 rounded-md overflow-x-auto">
                    {query || "No query executed yet."}
                  </pre>
                </div>

                {transformedQuery &&
                  transformedQuery !== currentExecutedQuery &&
                  transformedQuery !== query && (
                    <div>
                      <h3 className="text-xs uppercase text-muted-foreground mb-1 font-bold">
                        Processed Query (Variables Replaced)
                      </h3>
                      <pre className="bg-muted p-3 rounded-md overflow-x-auto text-sm break-words whitespace-pre-wrap">
                        {transformedQuery}
                      </pre>
                    </div>
                  )}

                <div>
                  <h3 className="text-xs uppercase text-muted-foreground mb-1 font-bold">
                    Database
                  </h3>
                  <p className="bg-muted p-3 rounded-md">
                    {selectedDb || "No database selected"}
                  </p>
                </div>

                {selectedTable && (
                  <div>
                    <h3 className="text-xs uppercase text-muted-foreground mb-1 font-bold">
                      Table
                    </h3>
                    <p className="bg-muted p-3 rounded-md">{selectedTable}</p>
                  </div>
                )}

                {executionTime && (
                  <div>
                    <h3 className="text-xs uppercase text-muted-foreground mb-1 font-bold">
                      Execution Time
                    </h3>
                    <p className="bg-muted p-3 rounded-md">
                      {formatExecutionTime(executionTime)}
                    </p>
                  </div>
                )}

                {responseSize && (
                  <div>
                    <h3 className="text-xs uppercase text-muted-foreground mb-1 font-bold">
                      Response Size
                    </h3>
                    <p className="bg-muted p-3 rounded-md">
                      {formatBytes(responseSize)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent
          value="performance"
          className="flex-1 overflow-auto min-h-0 p-4"
        >
          <ScrollArea className="h-full">
            <div className="space-y-4">
              <h3 className="text-xl font-semibold mb-6">
                Performance Metrics
              </h3>
              {isLoading ? (
                <Card>
                  <CardContent className="pt-6 text-center text-muted-foreground">
                    Loading metrics...
                  </CardContent>
                </Card>
              ) : localPerformanceMetrics.totalTime === 0 &&
                executionTime === null ? (
                <Card>
                  <CardContent className="pt-6 text-center text-muted-foreground">
                    No query executed yet, or metrics not available.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    {
                      title: "Total Time",
                      tooltip:
                        "Complete end-to-end query execution time (client-perceived)",
                      value: localPerformanceMetrics.totalTime,
                      icon: Timer,
                      unit: "time",
                    },
                    {
                      title: "Server Processing",
                      tooltip: "Database execution time on the server",
                      value: localPerformanceMetrics.serverTime,
                      icon: Server,
                      unit: "time",
                    },
                    {
                      title: "Network Transfer",
                      tooltip:
                        "Estimated time spent transferring data over the network",
                      value: localPerformanceMetrics.networkTime,
                      icon: Share,
                      unit: "time",
                    },
                    {
                      title: "Client Rendering",
                      tooltip: "Time spent rendering results in the browser",
                      value: localPerformanceMetrics.clientTime,
                      icon: CheckCircle2, // Example icon
                      unit: "time",
                    },
                  ].map((metric, idx) => (
                    <TooltipProvider key={idx}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                              <CardTitle className="text-sm font-medium text-muted-foreground">
                                {metric.title}
                              </CardTitle>
                              {metric.icon && (
                                <metric.icon className="h-4 w-4 text-muted-foreground" />
                              )}
                            </CardHeader>
                            <CardContent>
                              <div className="text-2xl font-bold">
                                {metric.unit === "time"
                                  ? formatExecutionTime(metric.value as number)
                                  : metric.value}
                              </div>
                            </CardContent>
                          </Card>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">{metric.tooltip}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="panel" className="flex-1 overflow-auto min-h-0">
          {renderPanelContent()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
