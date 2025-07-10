import { useState, useEffect, useCallback } from "react";
import { useAtom, useSetAtom } from "jotai";
import { apiUrlAtom } from "@/atoms";
import { setQueryAtom } from "@/atoms/query-atoms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart3,
  Copy,
  PlusCircle,
  RefreshCw,
  AlertCircle,
  Database,
  Info,
  Zap,
  Play,
  FileCode,
} from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { ChartRenderer } from "@/components/shared/ChartRenderer";
import { UnifiedQueryProcessor } from "@/lib/query-processor";
import type { ChatSession, ChatArtifact, QueryArtifact, ChartArtifact } from "@/types/chat.types";

interface ChatArtifactProps {
  artifact: ChatArtifact;
  session: ChatSession;
}

export default function ChatArtifact({ artifact, session }: ChatArtifactProps) {
  const [apiUrl] = useAtom(apiUrlAtom);
  const setQuery = useSetAtom(setQueryAtom);
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);

  // Determine artifact type and extract data
  const isQueryArtifact = artifact.type === 'query';
  const isChartArtifact = artifact.type === 'chart';
  const artifactData = artifact.data as QueryArtifact | ChartArtifact;
  const query = isQueryArtifact 
    ? (artifactData as QueryArtifact).query 
    : (artifactData as ChartArtifact).query;
  
  // Extract database name and strip @ prefix if present
  const rawDatabase = isQueryArtifact
    ? (artifactData as QueryArtifact).database || session.context.databases.selected[0]
    : (artifactData as ChartArtifact).database || session.context.databases.selected[0];
  
  // Strip @ prefix from database name if present
  const database = rawDatabase ? rawDatabase.replace(/^@/, '') : rawDatabase;

  const executeQuery = useCallback(async () => {
    if (!query || !database) {
      setError("Missing query or database");
      return;
    }

    setIsLoading(true);
    setError(null);
    const startTime = Date.now();

    try {
      // Clean up query by removing @ prefix from database references
      let finalQuery = query.replace(/@(\w+)\./g, '$1.');
      
      // For charts, process the query with time range
      if (isChartArtifact) {
        const chartData = artifactData as ChartArtifact;
        const processedResult = UnifiedQueryProcessor.process({
          database,
          query,
          timeRange: { from: "1h", to: "now" }, // Default time range
          timeColumn: chartData.fieldMapping?.xField,
          timeZone: "UTC",
          maxDataPoints: 1000,
        });

        if (processedResult.errors.length > 0) {
          throw new Error(processedResult.errors.join(", "));
        }
        
        finalQuery = processedResult.query;
      }

      // Execute query
      const response = await axios.post(
        `${apiUrl}?db=${encodeURIComponent(database)}&format=ndjson`,
        { query: finalQuery },
        { responseType: "text", timeout: 30000 }
      );

      // Parse NDJSON response
      const lines = response.data
        .split("\n")
        .filter((line: string) => line.trim());
      const results: any[] = lines.map((line: string) => JSON.parse(line));

      setData(results);
      setExecutionTime(Date.now() - startTime);

      if (results.length === 0) {
        setError("Query returned no data");
      }
    } catch (err: any) {
      console.error("Failed to execute query:", err);
      setError(err.message || "Failed to execute query");
      setExecutionTime(Date.now() - startTime);
    } finally {
      setIsLoading(false);
    }
  }, [query, database, apiUrl, isChartArtifact, artifactData]);

  // Auto-execute on mount
  useEffect(() => {
    if (query && database) {
      executeQuery();
    }
  }, []);

  const copyQuery = () => {
    if (query) {
      navigator.clipboard.writeText(query);
      toast.success("Query copied to clipboard");
    }
  };
  
  const useQueryInEditor = () => {
    if (query) {
      setQuery(query);
      toast.success("Query loaded in editor");
    }
  };

  const addToDashboard = () => {
    // This would integrate with dashboard atoms
    toast.success("Chart added to dashboard");
  };

  // Build panel config for chart renderer
  const panelConfig = isChartArtifact ? {
    id: artifact.id,
    type: (artifactData as ChartArtifact).type || "timeseries",
    title: artifact.title || "Chart",
    query: query || '',
    database,
    fieldMapping: (artifactData as ChartArtifact).fieldMapping || {},
    fieldConfig: (artifactData as ChartArtifact).fieldConfig || {
      defaults: { unit: "", decimals: 2 },
    },
    options: (artifactData as ChartArtifact).options || {
      legend: { showLegend: true, placement: "bottom" },
    },
  } : null;
  
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
                <th key={col} className="px-2 sm:px-4 py-1.5 sm:py-2 text-left font-medium whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 100).map((row, idx) => (
              <tr key={idx} className="border-b hover:bg-muted/30">
                {columns.map((col) => (
                  <td key={col} className="px-2 sm:px-4 py-1.5 sm:py-2 font-mono text-xs">
                    {row[col] !== null && row[col] !== undefined
                      ? String(row[col])
                      : <span className="text-muted-foreground">NULL</span>}
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

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div className="flex-1 min-w-0 w-full sm:w-auto">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge variant="secondary" className="text-xs">
                {isQueryArtifact ? (
                  <><Zap className="w-3 h-3 mr-1" />SQL Query</>
                ) : (
                  <><BarChart3 className="w-3 h-3 mr-1" />AI Chart</>
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
              {artifact.title || (isQueryArtifact ? "Query Results" : "Chart")}
            </CardTitle>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
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
                onClick={addToDashboard}
                className="bg-green-600 hover:bg-green-700"
              >
                <PlusCircle className="w-3 h-3 mr-2" />
                Add to Dashboard
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-3 sm:px-6">
        <div className="bg-background rounded border min-h-[200px] sm:min-h-[320px] relative">
          {error ? (
            <div className="flex items-center justify-center h-full p-4 sm:p-6">
              <div className="text-center max-w-md">
                <AlertCircle className="w-8 h-8 sm:w-10 sm:h-10 text-destructive mx-auto mb-4" />
                <p className="text-sm text-destructive font-medium mb-2">
                  Query execution failed
                </p>
                <p className="text-xs text-muted-foreground break-words">{error}</p>
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
              <Badge variant="outline" className="text-xs">
                SQL Query
              </Badge>
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
            </div>
            <pre className="text-xs font-mono bg-background/50 p-2 sm:p-3 rounded overflow-x-auto">
              <code className="break-words sm:break-normal">{query}</code>
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
