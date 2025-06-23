import { useState, useEffect, useRef } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Copy,
  Share,
  Timer,
  Server,
} from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBytes, formatExecutionTime } from "@/lib/utils/formatting";
import { useQuery } from "@/contexts/QueryContext";
import { useDatabase } from "@/contexts/DatabaseContext";
import { useTime } from "@/contexts/TimeContext";
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

// Local interface for display-specific performance metrics
interface DisplayPerformanceMetrics {
  totalTime: number;
  serverTime: number;
  networkTime: number;
  clientTime: number;
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

  const [activeTab, setActiveTab] = useState("results");
  const [currentExecutedQuery, setCurrentExecutedQuery] = useState(query);
  const [transformedQuery, setTransformedQuery] = useState("");

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
      </Tabs>
    </div>
  );
}
