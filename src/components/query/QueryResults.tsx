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
} from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatExecutionTime, formatBytes } from "@/lib/time";
import { useAtom, useSetAtom } from "jotai";
import {
  queryResultsAtom,
  queryMetricsAtom,
  queryLoadingAtom,
  queryErrorAtom,
  queryHistoryAtom,
  queryAtom,
  rawQueryResponseAtom,
  processedQueryAtom,
} from "@/atoms";
import { selectedDbAtom, selectedTableAtom } from "@/atoms";
import { timeRangeAtom, selectedTimeFieldAtom } from "@/atoms";
import { createDashboardAtom, addPanelAtom } from "@/atoms";
import GigTable from "@/components/shared/GigTable";
import Loader from "@/components/shared/Loader";
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
import PanelFactory from "@/lib/dashboard/panel-factory";
import {
  type PanelConfig,
  type Dashboard,
  type NDJSONRecord,
} from "@/types/dashboard.types";
import { PanelRenderer } from "@/components/dashboard/PanelRenderer";
import { PanelPreviewContainer } from "@/components/dashboard/PanelPreviewContainer";
import { PanelConfigurationForm } from "@/components/dashboard/PanelConfigurationForm";
import { SchemaAnalyzer } from "@/lib/dashboard/schema-analyzer";
import { useNavigate } from "react-router-dom";

// Local interface for display-specific performance metrics
interface DisplayPerformanceMetrics {
  totalTime: number;
  serverTime: number;
  networkTime: number;
  clientTime: number;
}

export default function QueryResults() {
  const [results] = useAtom(queryResultsAtom);
  const [isLoading] = useAtom(queryLoadingAtom);
  const [error] = useAtom(queryErrorAtom);
  const [queryMetrics] = useAtom(queryMetricsAtom);
  const [query] = useAtom(queryAtom);
  const [queryHistory] = useAtom(queryHistoryAtom);
  const [selectedDb] = useAtom(selectedDbAtom);
  const [selectedTable] = useAtom(selectedTableAtom);
  const [selectedTimeField] = useAtom(selectedTimeFieldAtom);
  const [timeRange] = useAtom(timeRangeAtom);
  const [rawQueryResponse] = useAtom(rawQueryResponseAtom);
  const [processedQuery] = useAtom(processedQueryAtom);
  const createDashboard = useSetAtom(createDashboardAtom);
  const addPanel = useSetAtom(addPanelAtom);

  const navigate = useNavigate();


  // Extract values from metrics
  const executionTime = queryMetrics?.executionTime || null;
  const responseSize = queryMetrics?.size || null;
  const rawJson = rawQueryResponse; // Now using the atom
  const queryErrorDetail = error; // Use the error from atom
  const actualExecutedQuery = processedQuery; // Now using the atom

  const [activeTab, setActiveTab] = useState("results");
  const [currentExecutedQuery, setCurrentExecutedQuery] = useState(query);
  const [transformedQuery, setTransformedQuery] = useState("");

  // Panel creation states - initialize with empty field mapping
  const [panelConfig, setPanelConfig] = useState<PanelConfig>(() => {
    const initial = PanelFactory.createPanel({
      type: "line",
      title: "Query Panel",
      database: selectedDb || "",
      query: query,
    });
    // Clear field mapping to allow smart defaults to work
    initial.fieldMapping = {};
    return initial;
  });
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  
  // Track which fields have been manually set by the user
  const [userModifiedFields, setUserModifiedFields] = useState<{
    xField?: boolean;
    yField?: boolean;
    seriesField?: boolean;
  }>({});
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
      const fields = Object.keys(results[0]).filter((key) => {
        // Include __timestamp but exclude other internal fields
        if (key === "__timestamp") return true;
        // Exclude other fields starting with _ (like _processed_query)
        return !key.startsWith("_");
      });
      setAvailableFields(fields);
    } else {
      setAvailableFields([]);
    }
  }, [results]);

  // Smart field mapping - only when panel type changes or initial setup
  useEffect(() => {
    if (availableFields.length > 0) {
      let smartMapping: any = {};

      // Use enhanced analyzer if we have actual results data
      if (results && results.length > 0) {
        const enhancedAnalysis = SchemaAnalyzer.analyzeDataset(results, 500);

        smartMapping = SchemaAnalyzer.getEnhancedSmartDefaults(
          enhancedAnalysis,
          panelConfig.type || "timeseries"
        );
      } else {
        // Fallback to basic field mapping
        const fieldTypes: Record<string, any> = {};

        smartMapping = SchemaAnalyzer.getSmartFieldDefaults(
          availableFields,
          fieldTypes,
          [], // No schema fields needed
          panelConfig.type || "timeseries"
        );
      }

      // Only update field mapping if we actually have smart mapping suggestions
      if (smartMapping && (smartMapping.xField || smartMapping.yField)) {
        setPanelConfig((prev) => {
          const newMapping: any = {};
          
          // For xField: use existing if valid and user modified, otherwise use smart default
          if (userModifiedFields.xField && prev.fieldMapping?.xField && availableFields.includes(prev.fieldMapping.xField)) {
            newMapping.xField = prev.fieldMapping.xField;
          } else {
            newMapping.xField = smartMapping.xField;
          }
          
          // For yField: use existing if valid and user modified, otherwise use smart default
          if (userModifiedFields.yField && prev.fieldMapping?.yField && availableFields.includes(prev.fieldMapping.yField)) {
            newMapping.yField = prev.fieldMapping.yField;
          } else {
            newMapping.yField = smartMapping.yField;
          }
          
          // For seriesField: use existing if valid and user modified, otherwise use smart default
          if (userModifiedFields.seriesField && prev.fieldMapping?.seriesField && availableFields.includes(prev.fieldMapping.seriesField)) {
            newMapping.seriesField = prev.fieldMapping.seriesField;
          } else {
            newMapping.seriesField = smartMapping.seriesField;
          }
          
          return {
            ...prev,
            fieldMapping: {
              ...newMapping,
              // Ensure we don't have undefined values
              xField: newMapping.xField || undefined,
              yField: newMapping.yField || undefined,
              seriesField: newMapping.seriesField || undefined,
            },
          };
        });
      }
    }
  }, [panelConfig.type, availableFields, results, userModifiedFields]);

  // Update panel config when query changes
  useEffect(() => {
    setPanelConfig((prev) => {
      if (query === prev.query) {
        return prev; // No change needed
      }
      
      return {
        ...prev,
        query: query,
        // Let the smart field mapping useEffect handle field validation
        // Don't reset field mapping here - let it be handled by the smart mapping logic
      };
    });
  }, [query]);

  // Update panel config when database changes
  useEffect(() => {
    setPanelConfig((prev) => {
      if ((selectedDb || "") === prev.database) {
        return prev; // No change needed
      }
      
      return {
        ...prev,
        database: selectedDb || "",
        // Let the smart field mapping useEffect handle field validation
      };
    });
    
    // Reset user modified flags when database changes since schema may be different
    setUserModifiedFields({});
  }, [selectedDb]);

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
        setDashboards([]);
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
      const detailedError = queryErrorDetail || error;

      const formattedError = detailedError.split("\n").map((line, i) => {
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

    if (results === null) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <Database className="h-12 w-12 mb-4 opacity-50" />
          <p className="text-lg">Execute a query to see results</p>
        </div>
      );
    }

    if (Array.isArray(results)) {
      if (results.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mb-4 text-green-500" />
            <p className="text-lg">Query executed successfully</p>
            <p className="text-sm mt-2">No results returned</p>
          </div>
        );
      }
      return <GigTable data={results} initialPageSize={25} />;
    }

    // If results is not an array, wrap it in an array
    return <GigTable data={[results]} initialPageSize={25} />;
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

    if (error || !results || (Array.isArray(results) && results.length === 0)) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <BarChart3 className="h-12 w-12 mb-4 opacity-50" />
          <p className="text-lg">Execute a query to create a panel</p>
          <p className="text-sm mt-2">
            Your query results will be visualized here
          </p>
        </div>
      );
    }

    return (
      <div className="h-full flex gap-3 p-3 grid grid-cols-12">
        <div className="flex-1 flex flex-col min-h-0 col-span-9">
          <div className="min-h-[400px] max-h-[800px] rounded resize-y col-span-10">
            {renderPanelPreview()}
          </div>
        </div>

        {/* Panel Configuration - Right Side */}
        <div className="w-80 flex flex-col space-y-4  col-span-1">
          <PanelConfigurationForm
            config={panelConfig}
            schemaFields={availableFields}
            onConfigChange={(updates) => {
              // Track which fields were manually changed
              if (updates.fieldMapping) {
                const newUserModified = { ...userModifiedFields };
                
                // Check if field mappings were changed
                if (updates.fieldMapping.xField !== undefined) {
                  newUserModified.xField = true;
                }
                if (updates.fieldMapping.yField !== undefined) {
                  newUserModified.yField = true;
                }
                if (updates.fieldMapping.seriesField !== undefined) {
                  newUserModified.seriesField = true;
                }
                
                setUserModifiedFields(newUserModified);
              }
              
              setPanelConfig((prev) => ({ ...prev, ...updates }));
            }}
            availableFields={availableFields}
            previewData={results}
            showAdvancedOptions={false}
          />

          {/* Save to Dashboard */}
          <div>
            <CardContent className="pt-6">
              <Dialog
                open={showSaveToDashboard}
                onOpenChange={setShowSaveToDashboard}
              >
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
                      Choose an existing dashboard or create a new one for this
                      panel.
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
                    <Button onClick={handleSaveToDashboard}>Save Panel</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </div>
        </div>
      </div>
    );
  }

  function renderPanelPreview() {
    if (!results || (Array.isArray(results) && results.length === 0)) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <div className="text-center">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No data to preview</p>
          </div>
        </div>
      );
    }

    // Prepare data as NDJSONRecord array
    let records: NDJSONRecord[];
    if (Array.isArray(results)) {
      records = results;
    } else if (results && typeof results === "object") {
      records = [results];
    } else {
      records = [];
    }

    // Use the unified PanelRenderer with key to force re-render on type change
    return (
      <PanelPreviewContainer config={panelConfig}>
        <PanelRenderer
          key={`${panelConfig.type}-${panelConfig.id}`}
          config={panelConfig}
          data={records}
          isPreview={true}
          height="100%"
          width="100%"
        />
      </PanelPreviewContainer>
    );
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
          name: newDashboardName,
          description: `Dashboard created from query: ${query.slice(0, 50)}...`,
          timeRange: { type: "relative", from: "now-1h", to: "now" },
          timeZone: "UTC",
          layout: { panels: [] },
        });

        dashboardId = newDashboard.id;
      }

      // Create panel with current configuration - ensure all required fields
      const finalConfig = {
        ...panelConfig,
        query: query || panelConfig.query || "",
        database: selectedDb || panelConfig.database || "",
        table: selectedTable || panelConfig.table || "",
        timeField: selectedTimeField || panelConfig.timeField || "",
        title: panelConfig.title || "Query Panel",
        type: panelConfig.type || "timeseries",
        fieldMapping: panelConfig.fieldMapping || {},
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
      };

      // Add panel to the specified dashboard (no need to load it first)
      await addPanel({ panelData: finalConfig, dashboardId });

      toast.success(`Panel saved to dashboard successfully!`, {
        action: {
          label: "Go to dashboard",
          onClick: () => navigate(`/dashboard/${dashboardId}`),
        },
      });
      setShowSaveToDashboard(false);
      setNewDashboardName("");
      setSelectedDashboardId("new"); // Reset for next use
    } catch (error) {
      console.error("Error saving panel:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save panel to dashboard"
      );
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

                {processedQuery && processedQuery !== query && (
                  <div>
                    <h3 className="text-xs uppercase text-muted-foreground mb-1 font-bold">
                      Processed Query (Variables Replaced)
                    </h3>
                    <pre className="bg-muted p-3 rounded-md overflow-x-auto text-sm break-words whitespace-pre-wrap">
                      {processedQuery}
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
