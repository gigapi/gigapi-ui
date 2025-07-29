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
  
  // Extract query and database from artifact - moved here to be available for state initialization
  const getQueryInfo = useCallback(() => {
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
  }, [artifact]);
  
  // Helper function to extract time field from query
  const extractTimeFieldFromQuery = useCallback((query: string): string => {
    if (!query) return "";
    
    // Common time field patterns in SQL queries
    const timeFieldPatterns = [
      // Look for explicit time fields in WHERE clauses, GROUP BY, ORDER BY
      /(?:WHERE|GROUP BY|ORDER BY).*?([a-zA-Z_][a-zA-Z0-9_]*\.?[a-zA-Z_][a-zA-Z0-9_]*)\s*(?:>=|<=|>|<|=|\bBETWEEN\b)/gi,
      // Look for DATE_TRUNC, DATE_FORMAT functions with time fields
      /(?:DATE_TRUNC|DATE_FORMAT|EXTRACT)\s*\(\s*[^,]+,\s*([a-zA-Z_][a-zA-Z0-9_]*\.?[a-zA-Z_][a-zA-Z0-9_]*)\s*\)/gi,
      // Look for time fields in SELECT with AS time/timestamp
      /SELECT.*?([a-zA-Z_][a-zA-Z0-9_]*\.?[a-zA-Z_][a-zA-Z0-9_]*)\s+AS\s+(?:time|timestamp)/gi,
      // Look for common time field names
      /\b([a-zA-Z_]*(?:time|timestamp|date)[a-zA-Z0-9_]*)\b/gi
    ];
    
    const potentialFields = new Set<string>();
    
    // Extract potential time fields using patterns
    timeFieldPatterns.forEach(pattern => {
      const matches = query.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          // Clean up the field name (remove table prefixes if any)
          const field = match[1].split('.').pop() || match[1];
          potentialFields.add(field);
        }
      }
    });
    
    // Priority order for time fields
    const timeFieldPriority = [
      '__timestamp',
      'timestamp',
      'time',
      'created_at',
      'updated_at',
      'event_time',
      'date_time',
      'datetime',
      'ts'
    ];
    
    // Return the highest priority time field found
    for (const priorityField of timeFieldPriority) {
      for (const field of potentialFields) {
        if (field.toLowerCase() === priorityField.toLowerCase()) {
          return field;
        }
      }
    }
    
    // Return the first time-like field found
    return Array.from(potentialFields)[0] || "";
  }, []);

  const [selectedTimeField, setSelectedTimeField] = useState<string>(() => {
    // Try to get time field from artifact data first
    const artifactTimeField = (artifact.data as any).timeField;
    if (artifactTimeField) return artifactTimeField;
    
    // Extract time field from query if not explicitly provided
    const { query } = getQueryInfo();
    return extractTimeFieldFromQuery(query || "");
  });

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
        
        // Determine the time column to use with enhanced fallback logic
        let timeColumn = selectedTimeField || 
                        (isChartArtifact(artifact) ? artifact.data.fieldMapping?.xField : undefined) ||
                        extractTimeFieldFromQuery(finalQuery);
        
        // Enhanced fallback: if no time column detected, try common defaults
        if (!timeColumn) {
          const commonTimeFields = ['__timestamp', 'timestamp', 'time', 'created_at', 'updated_at'];
          log(artifact.id, "warn", "No time field detected, trying common defaults", {
            commonTimeFields,
            originalQuery: query,
            finalQuery
          });
          
          // Use the first common time field as fallback
          timeColumn = commonTimeFields[0]; // Default to '__timestamp'
        }
        
        log(artifact.id, "info", "Processing time variables", {
          hasTimeVariables,
          selectedTimeField,
          extractedTimeField: extractTimeFieldFromQuery(finalQuery),
          finalTimeColumn: timeColumn,
          timeRange,
          originalQuery: query,
          usedFallback: !selectedTimeField && !extractTimeFieldFromQuery(finalQuery)
        });
        
        if (!timeColumn) {
          const errorMsg = "No time field could be determined for query with time variables. Please specify a time field or ensure your query includes time column references.";
          log(artifact.id, "error", errorMsg, { 
            query: finalQuery,
            selectedTimeField,
            extractedFromQuery: extractTimeFieldFromQuery(finalQuery),
            artifactData: artifact.data 
          });
          throw new Error(errorMsg);
        }
        
        const processedResult = QueryProcessor.process({
          database,
          query: finalQuery,
          timeRange,
          timeColumn,
          timeZone: "UTC",
          maxDataPoints: 1000,
        });

        if (processedResult.errors.length > 0) {
          log(artifact.id, "error", "Query processing failed", {
            errors: processedResult.errors,
            originalQuery: query,
            finalQuery,
            timeColumn,
            timeRange
          });
          throw new Error(processedResult.errors.join(", "));
        }

        finalQuery = processedResult.query;
        log(artifact.id, "info", "Time variables processed successfully", { 
          originalQuery: query,
          finalQuery,
          timeColumn,
          interpolatedVars: processedResult.interpolatedVars,
        });
      } else {
        log(artifact.id, "info", "Simple query, no time variables", {
          originalQuery: query,
          finalQuery,
        });
      }

      log(artifact.id, "info", "Executing final query", {
        finalQuery,
        database,
        apiUrl: `${apiUrl}?db=${encodeURIComponent(database)}&format=ndjson`
      });

      const response = await axios.post(
        `${apiUrl}?db=${encodeURIComponent(database)}&format=ndjson`,
        { query: finalQuery },
        { responseType: "text", timeout: 30000 }
      );

      const parseResult = parseNDJSON(response.data);

      if (parseResult.errors.length > 0) {
        log(artifact.id, "error", "NDJSON parsing failed", {
          parseErrors: parseResult.errors,
          rawResponse: response.data?.substring(0, 500)
        });
        throw new Error(`Query result parsing failed: ${parseResult.errors.join(", ")}`);
      }

      const results = parseResult.records;

      setData(results);
      log(artifact.id, "info", "Query executed successfully", {
        rowCount: results.length,
        firstRowSample: results.length > 0 ? Object.keys(results[0]).slice(0, 5) : []
      });

      endOperation(opId, { rowCount: results.length });
    } catch (err: any) {
      let errorMessage = "Failed to execute query";
      let errorDetails: any = {};

      if (err.response) {
        // Server responded with error status
        const status = err.response.status;
        const responseData = err.response.data;
        
        if (status === 500) {
          errorMessage = "Server error (500): Query execution failed on the database server";
          errorDetails = {
            status,
            serverResponse: responseData?.substring ? responseData.substring(0, 200) : responseData,
            possibleCauses: [
              "Invalid SQL syntax",
              "Missing or incorrect time field references", 
              "Database connection issues",
              "Query timeout"
            ]
          };
        } else if (status === 400) {
          errorMessage = "Bad request (400): Query is malformed or invalid";
          errorDetails = { status, serverResponse: responseData };
        } else {
          errorMessage = `HTTP ${status}: ${responseData || err.message}`;
          errorDetails = { status, serverResponse: responseData };
        }
      } else if (err.code === 'ECONNABORTED') {
        errorMessage = "Query timeout: The query took too long to execute (30s limit)";
        errorDetails = { timeout: true, limit: "30 seconds" };
      } else if (err.message) {
        errorMessage = err.message;
        errorDetails = { originalError: err.message };
      }

      setError(errorMessage);
      log(artifact.id, "error", "Query execution failed", {
        error: errorMessage,
        errorDetails,
        query: finalQuery,
        database,
        timeColumn,
        timeRange: hasTimeVariables ? timeRange : undefined
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
    selectedTimeField,
    extractTimeFieldFromQuery,
    getQueryInfo,
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
                  table={isTableArtifact(artifact) ? artifact.data.query.match(/FROM\s+(\w+)/i)?.[1] : undefined}
                  value={selectedTimeField}
                  onChange={setSelectedTimeField}
                  className="max-w-xs"
                  dynamic={true} // Enable dynamic mode for chat artifacts
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
