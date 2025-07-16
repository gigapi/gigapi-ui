import { useState, useEffect } from "react";
import {
  Download,
  Trash2,
  AlertCircle,
  Info,
  AlertTriangle,
  Bug,
  Clock,
  Database,
  Zap,
  Eye,
  Copy,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useArtifact } from "@/contexts/ArtifactContext";
import type { LogLevel } from "@/contexts/ArtifactContext";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils/class-utils";

interface ArtifactDebugPanelProps {
  artifactId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ArtifactDebugPanel({
  artifactId,
  open,
  onOpenChange,
}: ArtifactDebugPanelProps) {
  // Add keyboard shortcut (Cmd/Ctrl + D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "d" && open) {
        e.preventDefault();
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);
  const {
    getArtifactLogs,
    getArtifactOperations,
    metrics,
    clearLogs,
    exportDebugReport,
  } = useArtifact();

  const [activeTab, setActiveTab] = useState("logs");
  const [logFilter, setLogFilter] = useState<LogLevel | "all">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const logs = getArtifactLogs(artifactId);
  const operations = getArtifactOperations(artifactId);
  const artifactMetrics = metrics[artifactId] || { errorCount: 0 };

  const filteredLogs =
    logFilter === "all" ? logs : logs.filter((log) => log.level === logFilter);

  const handleExport = () => {
    const report = exportDebugReport(artifactId);
    const blob = new Blob([report], { type: "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `artifact-debug-${artifactId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getLogIcon = (level: LogLevel) => {
    switch (level) {
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case "warn":
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case "info":
        return <Info className="w-4 h-4 text-blue-500" />;
      case "debug":
        return <Bug className="w-4 h-4 " />;
    }
  };

  const getOperationIcon = (type: string) => {
    switch (type) {
      case "query":
        return <Database className="w-4 h-4" />;
      case "transform":
        return <Zap className="w-4 h-4" />;
      case "render":
        return <Eye className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "-";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[800px] sm:w-[900px] lg:w-[1000px] xl:w-[1200px] sm:max-w-[90vw] h-full flex flex-col p-0">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <Bug className="w-5 h-5" />
              Artifact Debug Panel
              <Badge
                variant="secondary"
                className="ml-2 font-mono text-xs max-w-[200px] truncate"
              >
                {artifactId}
              </Badge>
            </SheetTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExport}
                className="h-8"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => clearLogs(artifactId)}
                className="h-8 text-red-500 hover:text-red-400"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear
              </Button>
            </div>
          </div>
          <SheetDescription className="sr-only">
            Debug information for artifact {artifactId}
          </SheetDescription>
        </SheetHeader>

        <div className="p-2 bg-muted">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-xs  mb-1">Query Time</div>
              <div className="text-lg font-mono">
                {formatDuration(artifactMetrics.queryExecutionTime)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs  mb-1">Transform Time</div>
              <div className="text-lg font-mono">
                {formatDuration(artifactMetrics.dataTransformTime)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs  mb-1">Render Time</div>
              <div className="text-lg font-mono">
                {formatDuration(artifactMetrics.renderTime)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs  mb-1">Total Time</div>
              <div className="text-lg font-mono font-semibold">
                {formatDuration(artifactMetrics.totalTime)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs  mb-1">Errors</div>
              <div
                className={cn(
                  "text-lg font-mono",
                  artifactMetrics.errorCount > 0 && "text-red-500"
                )}
              >
                {artifactMetrics.errorCount}
              </div>
            </div>
          </div>
          {artifactMetrics.rowCount !== undefined && (
            <div className="mt-2 text-center text-xs ">
              {artifactMetrics.rowCount} rows processed
            </div>
          )}
        </div>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="px-6 bg-transparent flex-wrap h-auto">
            <TabsTrigger
              value="logs"
              className="gap-2 data-[state=active]:bg-muted"
            >
              <Bug className="w-4 h-4" />
              <span className="hidden sm:inline">Logs</span>
              <Badge variant="secondary" className="ml-1 text-xs">
                {logs.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="operations"
              className="gap-2 data-[state=active]:bg-muted"
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Operations</span>
              <Badge variant="secondary" className="ml-1 text-xs">
                {operations.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="data"
              className="gap-2 data-[state=active]:bg-muted"
            >
              <Database className="w-4 h-4" />
              <span className="hidden sm:inline">Raw Data</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="logs"
            className="flex-1 p-0 m-0 overflow-hidden flex flex-col"
          >
            <div className="px-6 py-3">
              <div className="flex gap-2">
                <Button
                  variant={logFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLogFilter("all")}
                  className="h-7"
                >
                  All
                </Button>
                <Button
                  variant={logFilter === "error" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLogFilter("error")}
                  className="h-7"
                >
                  Errors
                </Button>
                <Button
                  variant={logFilter === "warn" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLogFilter("warn")}
                  className="h-7"
                >
                  Warnings
                </Button>
                <Button
                  variant={logFilter === "info" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLogFilter("info")}
                  className="h-7"
                >
                  Info
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="px-6 py-4 space-y-3">
                {filteredLogs.length === 0 ? (
                  <div className="text-center  py-8">No logs to display</div>
                ) : (
                  filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className={cn(
                        "group relative",
                        "flex gap-3 p-4 rounded-lg font-mono text-sm",
                        log.level === "error" &&
                          "bg-red-500/10 border border-red-500/20",
                        log.level === "warn" &&
                          "bg-yellow-500/10 border border-yellow-500/20",
                        log.level === "info" &&
                          "bg-blue-500/10 border border-blue-500/20",
                        log.level === "debug" && "bg-muted/50"
                      )}
                    >
                      <div className="flex-shrink-0">
                        {getLogIcon(log.level)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className=" break-words">{log.message}</div>
                            {log.data && (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-xs  hover:">
                                  View data
                                </summary>
                                <pre className="mt-2  text-xs overflow-x-auto bg-neutral-900 p-2 rounded">
                                  {JSON.stringify(log.data, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                          <div className=" ml-4 flex items-center gap-2">
                            <span className="whitespace-nowrap">
                              {log.timestamp.toLocaleTimeString()}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                copyToClipboard(
                                  JSON.stringify(log, null, 2),
                                  log.id
                                )
                              }
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              {copiedId === log.id ? (
                                <CheckCircle className="w-3 h-3 text-green-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="operations"
            className="flex-1 p-0 m-0 overflow-hidden"
          >
            <ScrollArea className="h-full">
              <div className="px-6 py-4 space-y-4">
                {operations.length === 0 ? (
                  <div className="text-center  py-8">
                    No operations recorded
                  </div>
                ) : (
                  operations.map((op) => (
                    <div
                      key={op.operationId}
                      className="border border-muted rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {getOperationIcon(op.type)}
                          <span className="font-medium capitalize">
                            {op.type} Operation
                          </span>
                          <Badge
                            variant={
                              op.status === "success"
                                ? "default"
                                : op.status === "error"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {op.status}
                          </Badge>
                        </div>
                        <div className="text-sm ">
                          {formatDuration(
                            op.endTime
                              ? op.endTime.getTime() - op.startTime.getTime()
                              : undefined
                          )}
                        </div>
                      </div>

                      {op.input && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-xs  mb-1">
                            <span>Input:</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                copyToClipboard(
                                  JSON.stringify(op.input, null, 2),
                                  `${op.operationId}-input`
                                )
                              }
                              className="h-5 px-2 text-xs"
                            >
                              {copiedId === `${op.operationId}-input` ? (
                                <CheckCircle className="w-3 h-3 text-green-500 mr-1" />
                              ) : (
                                <Copy className="w-3 h-3 mr-1" />
                              )}
                              Copy
                            </Button>
                          </div>
                          <pre className="text-xs bg-neutral-900 p-3 rounded overflow-x-auto max-h-32 overflow-y-auto">
                            {JSON.stringify(op.input, null, 2)}
                          </pre>
                        </div>
                      )}

                      {op.output && (
                        <div className="mb-3">
                          <div className="text-xs  mb-1">Output:</div>
                          <pre className="text-xs bg-neutral-900 p-3 rounded overflow-x-auto max-h-32 overflow-y-auto">
                            {JSON.stringify(op.output, null, 2)}
                          </pre>
                        </div>
                      )}

                      {op.error && (
                        <div className="mb-3">
                          <div className="text-xs text-red-500 mb-1">
                            Error:
                          </div>
                          <pre className="text-xs bg-red-500/10 border border-red-500/20 p-2 rounded text-red-400">
                            {op.error.message}
                            {op.error.stack && `\n\n${op.error.stack}`}
                          </pre>
                        </div>
                      )}

                      {op.logs.length > 0 && (
                        <div>
                          <div className="text-xs  mb-1">
                            Logs ({op.logs.length}):
                          </div>
                          <div className="space-y-1">
                            {op.logs.map((log) => (
                              <div key={log.id} className="flex gap-2 text-xs">
                                {getLogIcon(log.level)}
                                <span className="">{log.message}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="data" className="flex-1 p-0 m-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="px-6 py-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium ">
                      Complete Debug Data
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const data = JSON.stringify(
                          {
                            artifactId,
                            operations,
                            metrics: artifactMetrics,
                            logs,
                          },
                          null,
                          2
                        );
                        copyToClipboard(data, "raw-data");
                      }}
                      className="h-7 text-xs"
                    >
                      {copiedId === "raw-data" ? (
                        <CheckCircle className="w-3 h-3 text-green-500 mr-1" />
                      ) : (
                        <Copy className="w-3 h-3 mr-1" />
                      )}
                      Copy All
                    </Button>
                  </div>
                  <pre className="text-xs font-mono  bg-neutral-900 p-4 rounded-lg overflow-x-auto">
                    {JSON.stringify(
                      {
                        artifactId,
                        operations,
                        metrics: artifactMetrics,
                        logs,
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
