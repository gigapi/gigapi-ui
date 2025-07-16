import { useState, useEffect, useCallback } from "react";
import { useAtom, useSetAtom } from "jotai";
import { apiUrlAtom } from "@/atoms";
import { setQueryAtom } from "@/atoms/query-atoms";
import {
  dashboardListAtom,
  createDashboardAtom,
  addPanelAtom,
} from "@/atoms/dashboard-atoms";
import { chatSessionsAtom } from "@/atoms/chat-atoms";
import { schemaCacheAtom } from "@/atoms/database-atoms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BarChart3,
  Copy,
  RefreshCw,
  AlertCircle,
  Database,
  Info,
  Zap,
  Play,
  FileCode,
  Save,
  Bug,
  Clock,
  Calendar,
  Edit,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { ChartRenderer } from "@/components/dashboard/panels";
import { QueryProcessor } from "@/lib/query-processor";
import { QuerySanitizer } from "@/lib/query-sanitizer";
import { useArtifact } from "@/contexts/ArtifactContext";
import ArtifactDebugPanel from "./ArtifactDebugPanel";
import TimeFieldSelector from "./artifacts/TimeFieldSelector";
import type {
  ChatSession,
  ChatArtifact,
  QueryArtifact,
  ChartArtifact,
} from "@/types/chat.types";
import type { Dashboard, TimeRange } from "@/types/dashboard.types";
import parseNDJSON from "@/lib/parsers/ndjson";

interface ChatArtifactEnhancedProps {
  artifact: ChatArtifact;
  session: ChatSession;
  dashboardTimeRange?: TimeRange;
}

// Time range presets
const TIME_PRESETS = [
  { label: "Last 5 minutes", value: "5m" },
  { label: "Last 15 minutes", value: "15m" },
  { label: "Last 30 minutes", value: "30m" },
  { label: "Last 1 hour", value: "1h" },
  { label: "Last 3 hours", value: "3h" },
  { label: "Last 6 hours", value: "6h" },
  { label: "Last 12 hours", value: "12h" },
  { label: "Last 24 hours", value: "24h" },
  { label: "Last 2 days", value: "2d" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
];

export default function ChatArtifactEnhanced({
  artifact,
  session,
  dashboardTimeRange,
}: ChatArtifactEnhancedProps) {
  // Debug logging
  useEffect(() => {
    console.log(`[ChatArtifactEnhanced] Mounting artifact ${artifact.id}`, {
      type: artifact.type,
      title: artifact.title,
      hasPersistedData: !!(artifact as any).metadata?.cachedData,
      persistedDataLength: (artifact as any).metadata?.cachedData?.length || 0,
    });
    
    return () => {
      console.log(`[ChatArtifactEnhanced] Unmounting artifact ${artifact.id}`);
    };
  }, [artifact.id]);
  const [apiUrl] = useAtom(apiUrlAtom);
  const setQuery = useSetAtom(setQueryAtom);
  const [dashboards] = useAtom(dashboardListAtom);
  const createDashboard = useSetAtom(createDashboardAtom);
  const addPanel = useSetAtom(addPanelAtom);
  const [chatSessions, setChatSessions] = useAtom(chatSessionsAtom);
  const [schemaCache] = useAtom(schemaCacheAtom);

  // Artifact context for logging
  const {
    log,
    startOperation,
    endOperation,
    setSelectedArtifactId,
    setShowDebugPanel: _setShowDebugPanel, // Currently unused
  } = useArtifact();

  // Check if artifact has persisted data
  const persistedData = (artifact as any).metadata?.cachedData;
  const persistedExecutionTime = (artifact as any).metadata?.executionTime;
  const persistedError = (artifact as any).metadata?.executionError;

  const [data, setData] = useState<any[]>(persistedData || []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(persistedError || null);
  const [executionTime, setExecutionTime] = useState<number | null>(persistedExecutionTime || null);
  const [showDebugDialog, setShowDebugDialog] = useState(false);
  const [isEditingQuery, setIsEditingQuery] = useState(false);
  const [editedQuery, setEditedQuery] = useState("");
  
  // Determine artifact type and extract data first
  const isQueryArtifact = artifact.type === "query";
  const isChartArtifact = artifact.type === "chart";
  const artifactData = artifact.data as QueryArtifact | ChartArtifact;

  // Extract validation info from metadata
  const validationErrors = (artifact as any).metadata?.validationErrors || [];
  const validationWarnings = (artifact as any).metadata?.validationWarnings || [];

  // Time range state
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>("1h");
  
  // Get the original query first (needed for time field detection)
  const originalQuery = isQueryArtifact
    ? (artifactData as QueryArtifact).query
    : (artifactData as ChartArtifact).query;
  
  // Time field state (QueryProcessor will auto-detect if needed)
  const [selectedTimeField, setSelectedTimeField] = useState<string>(
    artifactData.timeField || ""
  );

  // Dashboard save dialog state
  const [showSaveToDashboard, setShowSaveToDashboard] = useState(false);
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>("new");
  const [newDashboardName, setNewDashboardName] = useState("");
  
  // Use edited query if available, otherwise use original
  const query = editedQuery || originalQuery;

  // Extract database name and strip @ prefix if present
  const rawDatabase = isQueryArtifact
    ? (artifactData as QueryArtifact).database || "default"
    : (artifactData as ChartArtifact).database || "default";

  // Strip @ prefix from database name if present
  const database = rawDatabase ? QuerySanitizer.stripAtSymbols(rawDatabase) : rawDatabase;

  // Get effective time range
  const getEffectiveTimeRange = useCallback((): TimeRange => {
    if (dashboardTimeRange) {
      return dashboardTimeRange;
    }

    return {
      type: "relative",
      from: `now-${selectedTimeRange}`,
      to: "now",
    };
  }, [dashboardTimeRange, selectedTimeRange]);

  const executeQuery = useCallback(async () => {
    if (!query || !database) {
      setError("Missing query or database");
      log(artifact.id, "error", "Missing query or database", {
        query,
        database,
      });
      return;
    }

    const opId = startOperation(artifact.id, "query", {
      query,
      database,
      timeRange: getEffectiveTimeRange(),
    });

    setIsLoading(true);
    setError(null);
    const startTime = Date.now();

    try {
      log(artifact.id, "info", "Starting query execution", { database, query });

      // Start with basic sanitization
      let finalQuery = QuerySanitizer.stripAtSymbols(query);
      finalQuery = QuerySanitizer.fixTimeFilter(finalQuery);
      
      // Only use QueryProcessor for queries with time variables
      const hasTimeVariables = finalQuery.includes('$__timeFilter') || 
                               finalQuery.includes('$__timeField') ||
                               finalQuery.includes('$__timeFrom') ||
                               finalQuery.includes('$__timeTo') ||
                               finalQuery.includes('$__interval');
      
      if (hasTimeVariables) {
        const timeRange = getEffectiveTimeRange();
        const chartData = isChartArtifact ? (artifactData as ChartArtifact) : null;
        
        log(artifact.id, "info", "Processing query with time variables", {
          timeRange,
          selectedTimeField,
          hasTimeVariables,
        });

        // Get column details for the time field if available
        let timeColumnDetails: any = null;
        if ((selectedTimeField || chartData?.fieldMapping?.xField) && schemaCache) {
          const timeColumn = selectedTimeField || chartData?.fieldMapping?.xField;
          // Search for column details in schema cache
          const dbData = schemaCache.databases[database];
          if (dbData) {
            for (const table of dbData.tables) {
              const tableSchema = dbData.schemas[table];
              if (tableSchema) {
                const columnDetail = tableSchema.find((col: any) => col.column_name === timeColumn);
                if (columnDetail) {
                  // Convert to ColumnSchema format expected by QueryProcessor
                  timeColumnDetails = {
                    columnName: columnDetail.column_name,
                    dataType: columnDetail.column_type,
                  };
                  // If it's a BIGINT column and looks like a time field, set timeUnit to 'ns'
                  if (columnDetail.column_type?.toLowerCase().includes('bigint') && 
                      (timeColumn.toLowerCase().includes('time') || timeColumn === '__timestamp')) {
                    timeColumnDetails.timeUnit = 'ns';
                  }
                  break;
                }
              }
            }
          }
        }

        const processedResult = QueryProcessor.process({
          database,
          query: finalQuery,
          timeRange,
          timeColumn: selectedTimeField || chartData?.fieldMapping?.xField,
          timeColumnDetails,
          timeZone: "UTC",
          maxDataPoints: 1000,
        });

        if (processedResult.errors.length > 0) {
          throw new Error(processedResult.errors.join(", "));
        }

        finalQuery = processedResult.query;
        log(artifact.id, "debug", "Time variables processed", {
          originalQuery: query,
          finalQuery,
          interpolatedVars: processedResult.interpolatedVars,
        });
      } else {
        log(artifact.id, "debug", "Simple query, no time variables", {
          originalQuery: query,
          finalQuery,
        });
      }

      // Execute query
      log(artifact.id, "info", "Executing query against API", {
        url: apiUrl,
        database,
      });

      const response = await axios.post(
        `${apiUrl}?db=${encodeURIComponent(database)}&format=ndjson`,
        { query: finalQuery },
        { responseType: "text", timeout: 30000 }
      );

      // Parse NDJSON response
      const transformOpId = startOperation(artifact.id, "transform", {
        responseSize: response.data.length,
      });

      try {
        log(artifact.id, "debug", "Parsing API response", {
          responseType: typeof response.data,
          responseLength: response.data?.length || 0,
          responseSample: typeof response.data === 'string' ? response.data.substring(0, 100) : response.data,
        });

        const parseResult = parseNDJSON(response.data);

        if (parseResult.errors.length > 0) {
          log(artifact.id, "warn", "NDJSON parsing errors", {
            errors: parseResult.errors,
            metadata: parseResult.metadata,
          });
          throw new Error(parseResult.errors.join(", "));
        }

        const results = parseResult.records;

        setData(results);
        const execTime = Date.now() - startTime;
        setExecutionTime(execTime);

        endOperation(transformOpId, { rowCount: results.length });

        log(artifact.id, "info", "Query executed successfully", {
          rowCount: results.length,
          executionTime: execTime,
        });

        if (results.length === 0) {
          log(artifact.id, "info", "Query returned no data - this is normal for some queries");
          // Don't set this as an error - no data can be a valid result
        }

        // Persist data to artifact metadata
        const currentSession = chatSessions[session.id];
        if (currentSession) {
          const updatedMessages = currentSession.messages.map((message) => {
            if (message.metadata?.artifacts) {
              const updatedArtifacts = message.metadata.artifacts.map((art: any) => {
                if (art.id === artifact.id) {
                  return {
                    ...art,
                    metadata: {
                      ...art.metadata,
                      cachedData: results,
                      executionTime: execTime,
                      executionError: null,
                      lastExecuted: new Date().toISOString(),
                    },
                  };
                }
                return art;
              });
              return {
                ...message,
                metadata: {
                  ...message.metadata,
                  artifacts: updatedArtifacts,
                },
              };
            }
            return message;
          });

          setChatSessions({
            ...chatSessions,
            [session.id]: {
              ...currentSession,
              messages: updatedMessages,
              updatedAt: new Date().toISOString(),
            },
          });
        }

        endOperation(opId, {
          rowCount: results.length,
          executionTime: execTime,
        });
      } catch (err) {
        endOperation(transformOpId, undefined, err as Error);
        throw err;
      }
    } catch (err: any) {
      console.error("Failed to execute query:", err);

      // Extract the actual error message from axios response
      let errorMessage = "Failed to execute query";
      if (err.response?.data) {
        // Try to extract error from response data
        if (typeof err.response.data === "string") {
          errorMessage = err.response.data;
        } else if (err.response.data.error) {
          errorMessage = err.response.data.error;
        } else if (err.response.data.message) {
          errorMessage = err.response.data.message;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      const errorExecTime = Date.now() - startTime;
      setExecutionTime(errorExecTime);

      log(artifact.id, "error", "Query execution failed", {
        error: errorMessage,
        response: err.response?.data,
        status: err.response?.status,
        stack: err.stack,
      });

      // Persist error state to artifact metadata
      const currentSession = chatSessions[session.id];
      if (currentSession) {
        const updatedMessages = currentSession.messages.map((message) => {
          if (message.metadata?.artifacts) {
            const updatedArtifacts = message.metadata.artifacts.map((art: any) => {
              if (art.id === artifact.id) {
                return {
                  ...art,
                  metadata: {
                    ...art.metadata,
                    cachedData: [],
                    executionTime: errorExecTime,
                    executionError: errorMessage,
                    lastExecuted: new Date().toISOString(),
                  },
                };
              }
              return art;
            });
            return {
              ...message,
              metadata: {
                ...message.metadata,
                artifacts: updatedArtifacts,
              },
            };
          }
          return message;
        });

        setChatSessions({
          ...chatSessions,
          [session.id]: {
            ...currentSession,
            messages: updatedMessages,
            updatedAt: new Date().toISOString(),
          },
        });
      }

      // Create a proper error object with the extracted message
      const properError = new Error(errorMessage);
      properError.stack = err.stack;
      endOperation(opId, undefined, properError);
    } finally {
      setIsLoading(false);
    }
  }, [
    query,
    database,
    apiUrl,
    isChartArtifact,
    artifactData,
    artifact.id,
    log,
    startOperation,
    endOperation,
    getEffectiveTimeRange,
    selectedTimeField,
    schemaCache,
    chatSessions,
    setChatSessions,
    session.id,
  ]);

  // Auto-execute on mount only if no persisted data
  useEffect(() => {
    if (query && database && !persistedData) {
      log(artifact.id, "info", "Auto-executing query on mount (no cached data)");
      executeQuery();
    } else if (persistedData) {
      log(artifact.id, "info", "Using cached data from previous execution", {
        rowCount: persistedData.length,
        executionTime: persistedExecutionTime,
      });
    }
  }, []);

  // Re-execute when time range changes
  useEffect(() => {
    if (query && database && data.length > 0) {
      log(artifact.id, "info", "Re-executing query due to time range change");
      executeQuery();
    }
  }, [selectedTimeRange]);

  const copyQuery = () => {
    if (query) {
      navigator.clipboard.writeText(query);
      toast.success("Query copied to clipboard");
      log(artifact.id, "info", "Query copied to clipboard");
    }
  };

  const useQueryInEditor = () => {
    if (query) {
      setQuery(query);
      toast.success("Query loaded in editor");
      log(artifact.id, "info", "Query loaded in editor");
    }
  };

  const handleSaveToDashboard = async () => {
    const opId = startOperation(artifact.id, "save", {
      dashboardId: selectedDashboardId,
      newDashboardName,
    });

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
          description: `Dashboard created from chat: ${artifact.title}`,
          timeRange: getEffectiveTimeRange(),
          timeZone: "UTC",
          layout: { panels: [] },
        });

        dashboardId = newDashboard.id;
        log(artifact.id, "info", "Created new dashboard", {
          dashboardId,
          name: newDashboardName,
        });
      }

      // Create panel configuration based on artifact
      const chartData = artifactData as ChartArtifact;
      const panelConfig = {
        title: artifact.title || "AI Generated Chart",
        type: (chartData.type || chartData.chartType || "timeseries") as any,
        query: query || "",
        database: database || "",
        fieldMapping: chartData.fieldMapping || {},
        fieldConfig: chartData.fieldConfig || {
          defaults: {
            unit: "",
            decimals: 2,
          },
        },
        options: chartData.options || {
          legend: {
            showLegend: true,
            placement: "bottom",
          },
        },
        timeField: selectedTimeField || undefined,
        useParentTimeFilter: true,
      };

      // Add panel to dashboard
      await addPanel({ panelData: panelConfig, dashboardId });

      toast.success(`Chart saved to dashboard successfully!`);
      log(artifact.id, "info", "Panel saved to dashboard", {
        dashboardId,
        panelConfig,
      });

      endOperation(opId, { dashboardId, panelId: panelConfig.title });

      setShowSaveToDashboard(false);
      setNewDashboardName("");
      setSelectedDashboardId("new");
    } catch (error) {
      console.error("Error saving panel:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to save chart to dashboard";
      toast.error(errorMessage);

      log(artifact.id, "error", "Failed to save panel", {
        error: errorMessage,
      });
      endOperation(opId, undefined, error as Error);
    }
  };

  const openDebugPanel = () => {
    setSelectedArtifactId(artifact.id);
    setShowDebugDialog(true);
  };

  const startQueryEdit = () => {
    setEditedQuery(query);
    setIsEditingQuery(true);
  };

  const saveQueryEdit = () => {
    setIsEditingQuery(false);
    
    // Update the artifact data with the edited query
    if (isQueryArtifact) {
      (artifact.data as QueryArtifact).query = editedQuery;
    } else if (isChartArtifact) {
      (artifact.data as ChartArtifact).query = editedQuery;
    }
    
    // Update the chat session to persist the changes
    const currentSession = chatSessions[session.id];
    if (currentSession) {
      const updatedMessages = currentSession.messages.map((message) => {
        if (message.metadata?.artifacts) {
          const updatedArtifacts = message.metadata.artifacts.map((art: any) => {
            if (art.id === artifact.id) {
              return { ...art, data: { ...art.data, query: editedQuery } };
            }
            return art;
          });
          return {
            ...message,
            metadata: {
              ...message.metadata,
              artifacts: updatedArtifacts,
            },
          };
        }
        return message;
      });
      
      setChatSessions({
        ...chatSessions,
        [session.id]: {
          ...currentSession,
          messages: updatedMessages,
          updatedAt: new Date().toISOString(),
        },
      });
    }
    
    // Execute the query with the new edited query
    executeQuery();
    
    toast.success("Query updated successfully");
    log(artifact.id, "info", "Query manually edited and saved", {
      originalQuery: originalQuery,
      editedQuery: editedQuery,
    });
  };

  const cancelQueryEdit = () => {
    setEditedQuery("");
    setIsEditingQuery(false);
  };

  const resetToOriginal = () => {
    setEditedQuery("");
    setIsEditingQuery(false);
    executeQuery();
  };

  // Build panel config for chart renderer
  const panelConfig = isChartArtifact
    ? {
        id: artifact.id,
        type: ((artifactData as ChartArtifact).type ||
          (artifactData as ChartArtifact).chartType ||
          "timeseries") as any,
        title: artifact.title || "Chart",
        query: query || "",
        database,
        fieldMapping: (artifactData as ChartArtifact).fieldMapping || {},
        fieldConfig: (artifactData as ChartArtifact).fieldConfig || {
          defaults: { unit: "", decimals: 2 },
        },
        options: (artifactData as ChartArtifact).options || {
          legend: { showLegend: true, placement: "bottom" as const },
        },
        timeField: selectedTimeField || undefined,
        useParentTimeFilter: true,
      }
    : null;

  // Render table for query results
  const renderQueryResults = () => {
    if (data.length === 0) return null;

    const columns = Object.keys(data[0]);

    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-2 sm:px-4 py-1.5 sm:py-2 text-left font-medium whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 100).map((row, idx) => (
              <tr key={idx} className="border-b hover:bg-muted/30">
                {columns.map((col) => (
                  <td
                    key={col}
                    className="px-2 sm:px-4 py-1.5 sm:py-2 font-mono text-xs"
                  >
                    {row[col] !== null && row[col] !== undefined ? (
                      String(row[col])
                    ) : (
                      <span className="text-muted-foreground">NULL</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.length > 100 && (
          <div className="text-center py-2 text-xs text-muted-foreground">
            Showing first 100 of {data.length} rows
          </div>
        )}
      </div>
    );
  };

  // Start render operation when component renders with data
  useEffect(() => {
    if (data.length > 0 && !error) {
      console.log(`[ChatArtifactEnhanced] Data available for rendering artifact ${artifact.id}`, {
        dataLength: data.length,
        chartType: panelConfig?.type,
        isChart: isChartArtifact,
      });
      
      const renderOpId = startOperation(artifact.id, "render", {
        dataRows: data.length,
        chartType: panelConfig?.type,
      });

      // End render operation after a short delay to capture render time
      const timer = setTimeout(() => {
        endOperation(renderOpId, { rendered: true });
      }, 100);

      return () => clearTimeout(timer);
    } else if (data.length === 0 && !isLoading && !error) {
      console.log(`[ChatArtifactEnhanced] No data for artifact ${artifact.id}`, {
        isLoading,
        hasError: !!error,
      });
    }
  }, [data, error]);

  return (
    <>
      <Card className="w-full">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
            <div className="flex-1 min-w-0 w-full sm:w-auto">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge variant="secondary" className="text-xs">
                  {isQueryArtifact ? (
                    <>
                      <Zap className="w-3 h-3 mr-1" />
                      SQL Query
                    </>
                  ) : (
                    <>
                      <BarChart3 className="w-3 h-3 mr-1" />
                      AI Chart
                    </>
                  )}
                </Badge>
                {isChartArtifact && panelConfig && (
                  <Badge variant="outline" className="text-xs">
                    {panelConfig.type}
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs">
                  <Database className="w-3 h-3 mr-1" />
                  {database}
                </Badge>
                {executionTime !== null && (
                  <Badge variant="outline" className="text-xs">
                    {executionTime}ms
                  </Badge>
                )}
              </div>
              <CardTitle className="text-base sm:text-lg">
                {artifact.title ||
                  (isQueryArtifact ? "Query Results" : "Chart")}
              </CardTitle>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {/* Time Range Selector */}
              {(query.includes("$__timeFilter") || query.includes("$__timeFrom") || query.includes("$__timeTo") || query.includes("$__interval")) && !dashboardTimeRange && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Clock className="w-3 h-3 mr-2" />
                      {TIME_PRESETS.find((p) => p.value === selectedTimeRange)
                        ?.label || "Custom"}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Time Range</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {TIME_PRESETS.map((preset) => (
                      <DropdownMenuItem
                        key={preset.value}
                        onClick={() => setSelectedTimeRange(preset.value)}
                        className="text-sm"
                      >
                        <Calendar className="w-3 h-3 mr-2" />
                        {preset.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={executeQuery}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <div className="w-3 h-3 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                    Loading
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3 mr-2" />
                    Refresh
                  </>
                )}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={openDebugPanel}
                className="text-neutral-400 hover:text-neutral-200"
              >
                <Bug className="w-3 h-3" />
              </Button>

              <Button variant="ghost" size="sm" onClick={copyQuery}>
                <Copy className="w-3 h-3" />
              </Button>

              {isQueryArtifact && (
                <Button variant="ghost" size="sm" onClick={useQueryInEditor}>
                  <FileCode className="w-3 h-3" />
                </Button>
              )}

              {isChartArtifact && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowSaveToDashboard(true)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Save className="w-3 h-3 mr-2" />
                  Save to Dashboard
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-3 sm:px-6">
          {/* Display validation warnings/errors if any */}
          {(validationErrors.length > 0 || validationWarnings.length > 0) && (
            <div className="mb-3 space-y-2">
              {validationErrors.map((error: any, index: number) => (
                <div key={index} className="flex items-start gap-2 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold">Error:</span> {error.message}
                  </div>
                </div>
              ))}
              {validationWarnings.map((warning: any, index: number) => (
                <div key={index} className="flex items-start gap-2 text-sm text-yellow-600">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold">Warning:</span> {warning.message}
                    {warning.suggestion && (
                      <div className="text-xs text-muted-foreground mt-1">
                        💡 {warning.suggestion}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Time Field Selector for queries with time filter */}
          {query.includes("$__timeFilter") && (
            <div className="mb-4">
              <TimeFieldSelector
                query={query}
                database={database}
                value={selectedTimeField}
                onChange={setSelectedTimeField}
                className="max-w-xs"
                schemaColumns={(() => {
                  // Try to get schema columns from localStorage
                  try {
                    const schemaCache = localStorage.getItem("gigapi_schema_cache");
                    if (schemaCache && database) {
                      const parsed = JSON.parse(schemaCache);
                      const dbSchema = parsed.databases?.[database];
                      if (dbSchema?.schemas) {
                        // Collect all timestamp columns from all tables
                        const timeColumns: string[] = [];
                        Object.values(dbSchema.schemas).forEach((columns: any) => {
                          if (Array.isArray(columns)) {
                            columns.forEach((col: any) => {
                              if (col.column_type?.toLowerCase().includes('time') ||
                                  col.column_type?.toLowerCase().includes('date') ||
                                  col.column_name?.toLowerCase().includes('time') ||
                                  col.column_name?.toLowerCase().includes('date') ||
                                  col.column_name === '__timestamp') {
                                timeColumns.push(col.column_name);
                              }
                            });
                          }
                        });
                        return [...new Set(timeColumns)]; // Remove duplicates
                      }
                    }
                  } catch (e) {
                    console.error("Failed to parse schema cache:", e);
                  }
                  return [];
                })()}
              />
            </div>
          )}
          
          <div className="bg-background rounded border min-h-[200px] sm:min-h-[320px] relative">
            {error ? (
              <div className="flex items-center justify-center h-full p-4 sm:p-6">
                <div className="text-center max-w-md">
                  <AlertCircle className="w-8 h-8 sm:w-10 sm:h-10 text-destructive mx-auto mb-4" />
                  <p className="text-sm text-destructive font-medium mb-2">
                    Query execution failed
                  </p>
                  <p className="text-xs text-muted-foreground break-words">
                    {error}
                  </p>
                </div>
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground">
                    Executing query...
                  </p>
                </div>
              </div>
            ) : data.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <BarChart3 className="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground">
                    No data to display
                  </p>
                </div>
              </div>
            ) : isChartArtifact && panelConfig ? (
              <div className="p-2 sm:p-3 h-[200px] sm:h-[320px]">
                <ChartRenderer
                  config={panelConfig}
                  data={data}
                  isEditMode={false}
                  height="100%"
                  width="100%"
                />
              </div>
            ) : isQueryArtifact ? (
              <div className="max-h-[300px] sm:max-h-[400px] overflow-auto">
                {renderQueryResults()}
              </div>
            ) : null}
          </div>

          {/* Query Display */}
          {query && (
            <div className="mt-4 bg-muted/30 rounded-lg border p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    SQL Query
                  </Badge>
                  {editedQuery && editedQuery !== originalQuery && (
                    <Badge variant="secondary" className="text-xs">
                      Modified
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-muted-foreground">
                    {data.length > 0 && (
                      <>
                        <div className="flex items-center gap-1">
                          <Info className="w-3 h-3" />
                          <span>{data.length} rows</span>
                        </div>
                        {executionTime !== null && (
                          <div className="flex items-center gap-1">
                            <Play className="w-3 h-3" />
                            <span>{executionTime}ms</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  
                  {/* Edit Query Button */}
                  {!isEditingQuery ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={startQueryEdit}
                        className="h-6 px-2 text-xs"
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      {editedQuery && editedQuery !== originalQuery && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={resetToOriginal}
                          className="h-6 px-2 text-xs text-orange-600 hover:text-orange-700"
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Reset
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={saveQueryEdit}
                        className="h-6 px-2 text-xs text-green-600 hover:text-green-700"
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelQueryEdit}
                        className="h-6 px-2 text-xs text-red-600 hover:text-red-700"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Query Editor */}
              {isEditingQuery ? (
                <Textarea
                  value={editedQuery}
                  onChange={(e) => setEditedQuery(e.target.value)}
                  className="text-xs font-mono min-h-[100px] resize-none bg-background/50"
                  placeholder="Enter your SQL query..."
                />
              ) : (
                <pre className="text-xs font-mono bg-background/50 p-2 sm:p-3 rounded overflow-x-auto">
                  <code className="break-words sm:break-normal">{query}</code>
                </pre>
              )}
            </div>
          )}
        </CardContent>

        {/* Save to Dashboard Dialog */}
        {isChartArtifact && (
          <Dialog
            open={showSaveToDashboard}
            onOpenChange={setShowSaveToDashboard}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save Chart to Dashboard</DialogTitle>
                <DialogDescription>
                  Choose an existing dashboard or create a new one for this
                  chart.
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
                      {dashboards.map((dashboard: Dashboard) => (
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
                <Button onClick={handleSaveToDashboard}>Save Chart</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </Card>

      {/* Debug Panel */}
      <ArtifactDebugPanel
        artifactId={artifact.id}
        open={showDebugDialog}
        onOpenChange={setShowDebugDialog}
      />
    </>
  );
}
