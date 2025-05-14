import { useState, useEffect, useRef } from "react";
import { AlertCircle, CheckCircle2, Clock, Database, Copy, Share } from "lucide-react";
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

export default function QueryResults() {
  const { 
    results, 
    rawJson, 
    isLoading, 
    error, 
    executionTime, 
    responseSize,
    query,
    selectedDb,
    selectedTable,
    selectedTimeField,
    timeRange,
    queryHistory
  } = useQuery();

  // Store the executed query separately from the editor query
  const [executedQuery, setExecutedQuery] = useState(query);
  const [activeTab, setActiveTab] = useState("results");
  const [chartsLoaded, setChartsLoaded] = useState(false);
  
  // Update executed query when new query is executed (track by queryHistory changes)
  const prevQueryHistoryLength = useRef(queryHistory.length);
  
  useEffect(() => {
    if (queryHistory.length > prevQueryHistoryLength.current && queryHistory.length > 0) {
      // A new query has been executed, update the executedQuery
      const lastQuery = queryHistory[0];
      setExecutedQuery(lastQuery.query || query);
    }
    prevQueryHistoryLength.current = queryHistory.length;
  }, [queryHistory, query]);
  
  // Load charts only when the tab is selected
  useEffect(() => {
    if (activeTab === "charts") {
      setChartsLoaded(true);
    }
  }, [activeTab]);

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
          {executionTime && (
            <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                Execution time: {formatExecutionTime(executionTime)}
                {responseSize && ` • ${formatBytes(responseSize)}`}
              </span>
            </div>
          )}
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
              Raw JSON
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
          </TabsList>

          {error && !error.includes("databases") && (
            <div className="flex items-center text-red-500 text-sm">
              <AlertCircle className="h-4 w-4 mr-1" />
              {error}
            </div>
          )}
        </div>

        <TabsContent value="results" className="flex-1 overflow-auto min-h-0">
          {renderResultsContent()}
        </TabsContent>

        <TabsContent value="raw" className="flex-1 overflow-auto min-h-0">
          <ScrollArea className="h-full rounded-md border bg-card">
            <Button
              variant="outline"
              className="absolute top-2 right-2"
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(rawJson, null, 2));
                toast.success("Raw JSON copied to clipboard");
              }}
            >
              Copy
            </Button>
            <pre className="p-4 text-sm font-mono text-card-foreground">
              {isLoading
                ? "Loading..."
                : rawJson
                ? JSON.stringify(rawJson, null, 2)
                : "No raw data available."}
            </pre>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="charts" className="flex-1 overflow-auto min-h-0">
          {chartsLoaded ? <QueryCharts /> : (
            <div className="flex flex-col items-center justify-center h-full">
              <p className="text-muted-foreground">Charts will load when this tab is selected</p>
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
                    timeTo: timeRange?.to
                  };
                  
                  HashQueryUtils.copyShareableUrl(params).then(success => {
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
                  <h3 className="text-xs uppercase text-muted-foreground mb-1 font-bold">Query (Editor)</h3>
                  <pre className="bg-muted p-3 rounded-md overflow-x-auto">{query || "No query executed yet."}</pre>
                </div>
                
                <div>
                  <h3 className="text-xs uppercase text-muted-foreground mb-1 font-bold">Executed Query</h3>
                  <pre className="bg-muted p-3 rounded-md overflow-x-auto">{executedQuery || "No query executed yet."}</pre>
                </div>
                
                {selectedTimeField && (
                  <div>
                    <h3 className="text-xs uppercase text-muted-foreground mb-1 font-bold">Time Filter</h3>
                    <div className="bg-muted p-3 rounded-md">
                      <p><span className="text-muted-foreground">Field:</span> {selectedTimeField}</p>
                      <p><span className="text-muted-foreground">Range:</span> {timeRange?.from} to {timeRange?.to}</p>
                      <p><span className="text-muted-foreground">Display:</span> {timeRange?.display}</p>
                    </div>
                  </div>
                )}
                
                <div>
                  <h3 className="text-xs uppercase text-muted-foreground mb-1 font-bold">Database</h3>
                  <p className="bg-muted p-3 rounded-md">{selectedDb || "No database selected"}</p>
                </div>
                
                {selectedTable && (
                  <div>
                    <h3 className="text-xs uppercase text-muted-foreground mb-1 font-bold">Table</h3>
                    <p className="bg-muted p-3 rounded-md">{selectedTable}</p>
                  </div>
                )}
                
                {executionTime && (
                  <div>
                    <h3 className="text-xs uppercase text-muted-foreground mb-1 font-bold">Execution Time</h3>
                    <p className="bg-muted p-3 rounded-md">{formatExecutionTime(executionTime)}</p>
                  </div>
                )}
                
                {responseSize && (
                  <div>
                    <h3 className="text-xs uppercase text-muted-foreground mb-1 font-bold">Response Size</h3>
                    <p className="bg-muted p-3 rounded-md">{formatBytes(responseSize)}</p>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
