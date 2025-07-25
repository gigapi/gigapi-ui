import { useState, useCallback, useEffect } from "react";
import { useAtom } from "jotai";
import { apiUrlAtom } from "@/atoms";
import { useArtifact } from "@/contexts/ArtifactContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Database,
  BarChart3,
  Table,
  FileText,
  Lightbulb,
  Activity,
  Bug,
  RefreshCw,
  Download,
  Edit,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import axios from "axios";

// Import artifact types and type guards
import {
  type EnhancedArtifact,
  isQueryArtifact,
  isChartArtifact,
  isTableArtifact,
  isSummaryArtifact,
  isInsightArtifact,
  isMetricArtifact,
  type ArtifactRendererConfig,
} from "@/types/artifact.types";

// Import specialized renderers
import TableArtifact from "./TableArtifact";
import MetricArtifact from "./MetricArtifact";
import SummaryArtifact from "./SummaryArtifact";
import InsightArtifact from "./InsightArtifact";
import TimeFieldSelector from "./TimeFieldSelector";
import ChatArtifactEnhanced from "../ChatArtifactEnhanced";
import ArtifactDebugPanel from "../ArtifactDebugPanel";
import parseNDJSON from "@/lib/parsers/ndjson";
import { QueryProcessor } from "@/lib/query-processor";
import { QuerySanitizer } from "@/lib/query-sanitizer";
import type { ChatSession } from "@/types/chat.types";

interface ArtifactRendererProps {
  artifact: EnhancedArtifact;
  session: ChatSession;
  config?: Partial<ArtifactRendererConfig>;
}

export default function ArtifactRenderer({
  artifact,
  session,
  config = {},
}: ArtifactRendererProps) {
  const [apiUrl] = useAtom(apiUrlAtom);
  const { log, startOperation, endOperation } = useArtifact();

  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [selectedTimeRange] = useState("1h");
  const [selectedTimeField, setSelectedTimeField] = useState<string>(
    (artifact.data as any).timeField || ""
  );

  const {
    maxHeight = 400,
    interactive = true,
    showDebug: showDebugButton = true,
    onSave,
    onEdit,
    onExport,
  } = config;

  // Extract validation info from metadata
  const validationErrors = (artifact as any).metadata?.validationErrors || [];
  const validationWarnings =
    (artifact as any).metadata?.validationWarnings || [];

  // Get artifact icon
  const getArtifactIcon = () => {
    switch (artifact.type) {
      case "query":
        return <Database className="w-4 h-4" />;
      case "chart":
        return <BarChart3 className="w-4 h-4" />;
      case "table":
        return <Table className="w-4 h-4" />;
      case "summary":
        return <FileText className="w-4 h-4" />;
      case "insight":
        return <Lightbulb className="w-4 h-4" />;
      case "metric":
        return <Activity className="w-4 h-4" />;
    }
  };

  // Extract query and database from artifact
  const getQueryInfo = () => {
    if (
      isQueryArtifact(artifact) ||
      isTableArtifact(artifact) ||
      isMetricArtifact(artifact)
    ) {
      return {
        query: artifact.data.query,
        database: QuerySanitizer.stripAtSymbols(artifact.data.database),
      };
    }
    if (isChartArtifact(artifact)) {
      return {
        query: artifact.data.query,
        database: QuerySanitizer.stripAtSymbols(artifact.data.database),
      };
    }
    if (isSummaryArtifact(artifact) || isInsightArtifact(artifact)) {
      return {
        query: artifact.data.query || null,
        database: artifact.data.database ? QuerySanitizer.stripAtSymbols(artifact.data.database) : null,
      };
    }
    return { query: null, database: null };
  };

  const { query, database } = getQueryInfo();

  // Execute query
  const executeQuery = useCallback(async () => {
    if (!query || !database) {
      // For summary/insight artifacts without queries, use provided data
      if (isSummaryArtifact(artifact) || isInsightArtifact(artifact)) {
        log(artifact.id, "info", "Using pre-generated data for artifact");
        return;
      }

      setError("Missing query or database");
      return;
    }

    const opId = startOperation(artifact.id, "query", { query, database });
    setIsLoading(true);
    setError(null);

    try {
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
        const timeRange = { 
          type: "relative" as const,
          from: `now-${selectedTimeRange}`, 
          to: "now"
        };
        
        const processedResult = QueryProcessor.process({
          database,
          query: finalQuery,
          timeRange,
          timeColumn: selectedTimeField || (isChartArtifact(artifact) ? artifact.data.fieldMapping?.xField : undefined),
          timeZone: "UTC",
          maxDataPoints: 1000,
        });

        if (processedResult.errors.length > 0) {
          throw new Error(processedResult.errors.join(", "));
        }

        finalQuery = processedResult.query;
        log(artifact.id, "info", "Time variables processed", { 
          originalQuery: query,
          finalQuery,
          interpolatedVars: processedResult.interpolatedVars,
        });
      } else {
        log(artifact.id, "info", "Simple query, no time variables", {
          originalQuery: query,
          finalQuery,
        });
      }

      const response = await axios.post(
        `${apiUrl}?db=${encodeURIComponent(database)}&format=ndjson`,
        { query: finalQuery },
        { responseType: "text", timeout: 30000 }
      );

      const parseResult = parseNDJSON(response.data);

      if (parseResult.errors.length > 0) {
        throw new Error(parseResult.errors.join(", "));
      }

      const results = parseResult.records;

      setData(results);
      log(artifact.id, "info", "Query executed successfully", {
        rowCount: results.length,
      });

      endOperation(opId, { rowCount: results.length });
    } catch (err: any) {
      const errorMessage =
        err.response?.data || err.message || "Failed to execute query";
      setError(errorMessage);
      log(artifact.id, "error", "Query execution failed", {
        error: errorMessage,
      });
      endOperation(opId, undefined, err);
    } finally {
      setIsLoading(false);
    }
  }, [
    query,
    database,
    apiUrl,
    artifact,
    selectedTimeRange,
    log,
    startOperation,
    endOperation,
  ]);

  // Auto-execute on mount only for non-query/chart artifacts
  // Query and chart artifacts are handled by ChatArtifactEnhanced
  useEffect(() => {
    if (query && database && artifact.type !== "query" && artifact.type !== "chart") {
      executeQuery();
    }
  }, []);

  // Handle export
  const handleExport = (format: "png" | "csv" | "json") => {
    if (onExport) {
      onExport(format);
    } else {
      // Default export implementation
      if (format === "json") {
        const exportData = {
          artifact,
          data,
          timestamp: new Date().toISOString(),
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${artifact.type}-${artifact.id}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Exported as JSON");
      }
      // Add CSV and PNG export logic here
    }
  };

  // Render based on artifact type
  const renderContent = () => {
    // Use ChatArtifactEnhanced for query and chart types for backward compatibility
    if (isQueryArtifact(artifact) || isChartArtifact(artifact)) {
      return (
        <ChatArtifactEnhanced artifact={artifact as any} session={session} />
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-32 text-red-500">
          <p className="text-sm">{error}</p>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-32">
          <RefreshCw className="w-6 h-6 animate-spin" />
        </div>
      );
    }

    // Render specialized artifacts
    if (isTableArtifact(artifact)) {
      return <TableArtifact artifact={artifact} data={data} />;
    }

    if (isMetricArtifact(artifact)) {
      return <MetricArtifact artifact={artifact} data={data} />;
    }

    if (isSummaryArtifact(artifact)) {
      return <SummaryArtifact artifact={artifact} />;
    }

    if (isInsightArtifact(artifact)) {
      return <InsightArtifact artifact={artifact} />;
    }

    return (
      <div className="text-center text-neutral-500 py-8">
        Unsupported artifact type: {(artifact as any).type}
      </div>
    );
  };

  // For query and chart artifacts, use the enhanced component directly
  if (isQueryArtifact(artifact) || isChartArtifact(artifact)) {
    return (
      <>
        <ChatArtifactEnhanced artifact={artifact as any} session={session} />
        {showDebug && (
          <ArtifactDebugPanel
            artifactId={artifact.id}
            open={showDebug}
            onOpenChange={setShowDebug}
          />
        )}
      </>
    );
  }

  // For other artifact types, use the new card layout
  return (
    <>
      <Card className="w-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1.5">
                {getArtifactIcon()}
                {artifact.type.charAt(0).toUpperCase() + artifact.type.slice(1)}
              </Badge>
              {artifact.title && (
                <h3 className="text-base font-medium">{artifact.title}</h3>
              )}
            </div>

            <div className="flex items-center gap-2">
              {query && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={executeQuery}
                  disabled={isLoading}
                >
                  <RefreshCw
                    className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
                  />
                </Button>
              )}

              {onEdit && interactive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(artifact)}
                >
                  <Edit className="w-4 h-4" />
                </Button>
              )}

              {onSave && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSave(artifact)}
                >
                  <Save className="w-4 h-4" />
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleExport("json")}
              >
                <Download className="w-4 h-4" />
              </Button>

              {showDebugButton && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDebug(true)}
                >
                  <Bug className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Display validation warnings/errors if any */}
          {(validationErrors.length > 0 || validationWarnings.length > 0) && (
            <div className="mb-3 space-y-2">
              {validationErrors.map((error: any, index: number) => (
                <div
                  key={index}
                  className="flex items-start gap-2 text-sm text-red-600"
                >
                  <span className="font-semibold">Error:</span>
                  <span>{error.message}</span>
                </div>
              ))}
              {validationWarnings.map((warning: any, index: number) => (
                <div
                  key={index}
                  className="flex items-start gap-2 text-sm text-yellow-600"
                >
                  <span className="font-semibold">Warning:</span>
                  <span>{warning.message}</span>
                  {warning.suggestion && (
                    <span className="text-xs text-muted-foreground ml-2">
                      ({warning.suggestion})
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Time Field Selector for non-chart artifacts with time filter */}
          {query &&
            query.includes("$__timeFilter") &&
            !isChartArtifact(artifact) && (
              <div className="mb-4">
                <TimeFieldSelector
                  query={query}
                  database={database || undefined}
                  value={selectedTimeField}
                  onChange={setSelectedTimeField}
                  className="max-w-xs"
                />
              </div>
            )}

          <div
            style={{ maxHeight: `${maxHeight}px` }}
            className="overflow-auto"
          >
            {renderContent()}
          </div>
        </CardContent>
      </Card>

      {showDebug && (
        <ArtifactDebugPanel
          artifactId={artifact.id}
          open={showDebug}
          onOpenChange={setShowDebug}
        />
      )}
    </>
  );
}
