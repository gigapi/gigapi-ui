import { useState, useEffect, useRef } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Copy,
  Share,
  Timer,
  Server,
  MonitorPlay,
  Wifi,
  FileJson,
} from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "./ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { formatBytes } from "../lib/utils";
import { useQuery } from "../contexts/QueryContext";
import QueryCharts from "./QueryCharts";
import GigTable from "./GigTable";
import Loader from "./Loader";
import { Button } from "./ui/button";
import HashQueryUtils from "@/lib/hash-query-utils";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export default function QueryResults() {
  const {
    results,
    rawJson,
    isLoading,
    error,
    queryErrorDetail,
    executionTime,
    responseSize,
    query,
    selectedDb,
    selectedTable,
    selectedTimeField,
    timeRange,
    queryHistory,
  } = useQuery();

  // Performance metrics
  const [performanceMetrics, setPerformanceMetrics] = useState({
    apiResponseTime: 0,
    renderTime: 0,
    totalTime: 0,
    clientProcessingTime: 0,
    networkTime: 0,
    parseTime: 0,
  });

  // Store the executed query separately from the editor query
  const [executedQuery, setExecutedQuery] = useState(() => {
    // Initialize with the most recent history item if available
    if (queryHistory && queryHistory.length > 0) {
      return queryHistory[0].query || query;
    }
    return query;
  });
  const [activeTab, setActiveTab] = useState("results");
  const [chartsLoaded, setChartsLoaded] = useState(false);

  // Ref for render timing
  const renderStartTime = useRef(0);

  // Measure render time
  useEffect(() => {
    if (results && !isLoading) {
      const now = performance.now();
      if (renderStartTime.current > 0) {
        const renderTime = now - renderStartTime.current;
        setPerformanceMetrics((prev) => ({
          ...prev,
          renderTime,
          // Estimate client processing as the difference between total time and API response time
          clientProcessingTime: Math.max(
            0,
            (executionTime || 0) - prev.apiResponseTime
          ),
          // Estimate network time (rough approximation)
          networkTime: Math.max(
            0,
            (executionTime || 0) - prev.apiResponseTime - renderTime
          ),
          // Total time is the full execution time
          totalTime: executionTime || 0,
        }));
      }
    } else if (isLoading) {
      renderStartTime.current = performance.now();
    }
  }, [results, isLoading, executionTime]);

  // Update executed query when new query is executed (track by queryHistory changes)
  const prevQueryHistoryLength = useRef(queryHistory.length);

  useEffect(() => {
    if (
      queryHistory.length > prevQueryHistoryLength.current &&
      queryHistory.length > 0
    ) {
      // A new query has been executed, update the executedQuery
      const lastQuery = queryHistory[0];
      setExecutedQuery(lastQuery.query || query);
    } else if (queryHistory.length > 0) {
      // Just in case, always ensure we have the latest query
      setExecutedQuery(queryHistory[0].query || query);
    }
    prevQueryHistoryLength.current = queryHistory.length;
  }, [queryHistory, query]);

  // Load charts only when the tab is selected
  useEffect(() => {
    if (activeTab === "charts") {
      setChartsLoaded(true);
    }
  }, [activeTab]);

  // Performance timing for query execution
  useEffect(() => {
    if (rawJson && rawJson.metrics) {
      // Try to extract server-side metrics if available
      const serverMetrics = rawJson.metrics;

      // Update performance metrics with server-side data
      setPerformanceMetrics((prev) => ({
        ...prev,
        apiResponseTime: serverMetrics.queryTime || 0,
        parseTime: serverMetrics.parseTime || 0,
        // Update other metrics based on server data
        ...serverMetrics,
      }));
    }
  }, [rawJson]);

  // Format execution time properly
  const formatExecutionTime = (timeMs: number | null) => {
    if (timeMs === null || timeMs === undefined) return "";

    // Format as milliseconds if less than 1 second
    if (timeMs < 1000) {
      return `${timeMs.toFixed(1)}ms`;
    }

    // Format as seconds if less than 60 seconds
    if (timeMs < 60000) {
      return `${(timeMs / 1000).toFixed(1)}s`;
    }

    // Format as minutes:seconds for longer durations
    const minutes = Math.floor(timeMs / 60000);
    const seconds = ((timeMs % 60000) / 1000).toFixed(1);
    return `${minutes}m ${seconds}s`;
  };

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
        executionTime={executionTime}
        responseSize={responseSize}
        initialPageSize={25} // Enable pagination with smaller initial page size
      />
    );
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
              value="charts"
              className="px-3 py-1 rounded-md text-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
            >
              Charts
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
                navigator.clipboard.writeText(JSON.stringify(rawJson, null, 2));
                toast.success("Raw data copied to clipboard");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <pre className="p-4 text-sm font-mono text-card-foreground text-wrap break-words whitespace-pre-wrap">
              {isLoading
                ? "Loading..."
                : rawJson
                ? JSON.stringify(rawJson, null, 2)
                : "No raw data available."}
            </pre>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="charts" className="flex-1 overflow-auto min-h-0">
          {activeTab === "charts" ? (
            <QueryCharts />
          ) : (
            <div className="flex flex-col items-center justify-center h-full">
              <p className="text-muted-foreground">
                Charts will load when this tab is selected
              </p>
            </div>
          )}
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
                  // Generate shareable URL with current query params
                  const params = {
                    query,
                    db: selectedDb,
                    table: selectedTable || undefined,
                    timeField: selectedTimeField || undefined,
                    timeFrom: timeRange?.from,
                    timeTo: timeRange?.to,
                  };

                  HashQueryUtils.copyShareableUrl(params).then((success) => {
                    if (success) {
                      toast.success("Shareable URL copied to clipboard");
                    } else {
                      toast.error("Failed to copy URL");
                    }
                  });
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

                <div>
                  <h3 className="text-xs uppercase text-muted-foreground mb-1 font-bold">
                    Executed Query
                  </h3>
                  <pre className="bg-muted p-3 rounded-md overflow-x-auto text-sm break-words whitespace-pre-wrap">
                    {executedQuery || "No query executed yet."}
                  </pre>
                </div>

                {selectedTimeField && (
                  <div>
                    <h3 className="text-xs uppercase text-muted-foreground mb-1 font-bold">
                      Time Filter
                    </h3>
                    <div className="bg-muted p-3 rounded-md">
                      <p>
                        <span className="text-muted-foreground">Field:</span>{" "}
                        {selectedTimeField}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Range:</span>{" "}
                        {timeRange?.from} to {timeRange?.to}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Display:</span>{" "}
                        {timeRange?.display}
                      </p>
                    </div>
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
              ) : executionTime === null || executionTime === undefined ? (
                <Card>
                  <CardContent className="pt-6 text-center text-muted-foreground">
                    No query executed yet, or metrics not available.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    {
                      title: "Total Execution Time",
                      value: performanceMetrics.totalTime,
                      icon: Timer,
                      unit: "time",
                    },
                    {
                      title: "Server DB Query Time",
                      value: performanceMetrics.apiResponseTime,
                      icon: Server,
                      unit: "time",
                    },
                    {
                      title: "Render Time (UI)",
                      value: performanceMetrics.renderTime,
                      icon: MonitorPlay,
                      unit: "time",
                    },
                    {
                      title: "Network & Other Processing",
                      value: performanceMetrics.networkTime,
                      icon: Wifi,
                      unit: "time",
                    },
                    {
                      title: "JSON Parse Time (Server)",
                      value: performanceMetrics.parseTime,
                      icon: FileJson,
                      unit: "time",
                    },
                  ].map((metric, idx) => (
                    <Card key={idx}>
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
                  ))}

                  {rawJson?.metrics &&
                    Object.entries(rawJson.metrics).map(([key, value]) => {
                      if (
                        ["queryTime", "parseTime", "totalTime"].includes(key) ||
                        performanceMetrics.hasOwnProperty(key)
                      )
                        return null;

                      const formattedKey = key
                        .replace(/([A-Z])/g, " $1")
                        .replace(/^./, (str) => str.toUpperCase());

                      return (
                        <Card key={key}>
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                              {formattedKey}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">
                              {typeof value === "number"
                                ? formatExecutionTime(value)
                                : String(value)}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
