import { useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Database } from "lucide-react";
import { ScrollArea } from "./ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { formatBytes, formatDuration } from "../lib/utils";
import { useQuery } from "../contexts/QueryContext";
import QueryCharts from "./QueryCharts";
import GigTable from "./GigTable";
import Loader from "./Loader";
import { Button } from "./ui/button";

export default function QueryResults() {
  const { results, rawJson, isLoading, error, executionTime, responseSize } =
    useQuery();

  const [activeTab, setActiveTab] = useState("results");

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
                Execution time: {formatDuration(executionTime)}
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
          <QueryCharts />
        </TabsContent>
      </Tabs>
    </div>
  );
}
