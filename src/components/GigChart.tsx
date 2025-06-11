import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from "react";
import * as echarts from "echarts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Download,
  Upload,
  BarChart3,
  LineChart,
  AreaChart,
  ChevronRight,
  ChevronDown,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { toast } from "sonner";
import type {
  ChartConfiguration,
  QueryResult,
  ColumnInfo,
  ColumnSchema,
} from "@/types";
import {
  analyzeColumns,
  createDefaultChartConfiguration,
  updateChartConfiguration,
  exportChartConfiguration,
  importChartConfiguration,
} from "@/lib/charts/chart-analysis";
import { useTheme } from "@/components/theme-provider";
import { useDatabase } from "@/contexts/DatabaseContext";

function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
  immediate = false
): {
  debouncedCallback: (...args: Parameters<T>) => void;
  cancel: () => void;
  flush: () => void;
} {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const immediateRef = useRef<boolean>(immediate);
  const callbackRef = useRef<T>(callback);
  const argsRef = useRef<Parameters<T> | null>(null);

  // Update callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    immediateRef.current = immediate;
  }, [immediate]);

  const flush = useCallback(() => {
    if (timeoutRef.current && argsRef.current) {
      cancel();
      callbackRef.current(...argsRef.current);
      argsRef.current = null;
    }
  }, [cancel]);

  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      argsRef.current = args;

      if (immediateRef.current) {
        immediateRef.current = false;
        callbackRef.current(...args);
        return;
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
        timeoutRef.current = null;
        argsRef.current = null;
      }, delay);
    },
    [delay]
  );

  useEffect(() => {
    return cancel;
  }, [cancel]);

  return { debouncedCallback, cancel, flush };
}

interface GigChartProps {
  data: QueryResult[];
  initialConfiguration?: ChartConfiguration;
  onConfigurationChange?: (config: ChartConfiguration) => void;
  height?: number;
  debounceDelay?: number;
  schemaColumns?: ColumnSchema[]; // Optional schema information
}

const chartTypeIcons = {
  line: LineChart,
  bar: BarChart3,
  area: AreaChart,
} as const;

const chartTypeLabels = {
  line: "Time series",
  bar: "Bar chart",
  area: "Area chart",
} as const;

interface PanelSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const PanelSection: React.FC<PanelSectionProps> = ({
  title,
  children,
  defaultOpen = true,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border last:border-b-0">
      <Button
        variant="ghost"
        className="w-full justify-between p-3 h-auto font-medium text-sm"
        onClick={() => setIsOpen(!isOpen)}
      >
        {title}
        {isOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </Button>
      {isOpen && <div className="p-3 pt-0 space-y-3">{children}</div>}
    </div>
  );
};

const GigChart: React.FC<GigChartProps> = ({
  data,
  initialConfiguration,
  onConfigurationChange,
  debounceDelay = 300,
  schemaColumns,
}) => {
  const { theme } = useTheme();
  const { selectedTable, getColumnsForTable } = useDatabase();
  const chartRef = useRef<HTMLDivElement>(null);
  const echartsInstanceRef = useRef<echarts.ECharts | null>(null);

  // Analyze columns and auto-configure with schema information
  const columns: ColumnInfo[] = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Get schema columns from props or database context
    let tableSchemaColumns = schemaColumns;
    if (!tableSchemaColumns && selectedTable) {
      tableSchemaColumns = getColumnsForTable(selectedTable) || undefined;
    }

    return analyzeColumns(data, tableSchemaColumns);
  }, [data, schemaColumns, selectedTable, getColumnsForTable]);

  // Internal configuration state with schema support
  const [configuration, setConfiguration] = useState<ChartConfiguration>(() => {
    if (initialConfiguration) return initialConfiguration;

    // Get schema columns for default configuration
    let tableSchemaColumns = schemaColumns;
    if (!tableSchemaColumns && selectedTable) {
      tableSchemaColumns = getColumnsForTable(selectedTable) || undefined;
    }

    return createDefaultChartConfiguration(data || [], columns);
  });

  // UI state
  const [showPanel, setShowPanel] = useState(true);

  // Get theme-based colors
  const themeColors = useMemo(() => {
    const isDark = theme === "dark";

    return {
      textColor: isDark ? "hsl(0 0% 98%)" : "hsl(240 10% 3.9%)",
      axisColor: isDark ? "hsl(240 5% 64.9%)" : "hsl(240 3.8% 46.1%)",
      tooltipBackgroundColor: isDark ? "hsl(240 10% 3.9%)" : "hsl(0 0% 100%)",
      tooltipTextColor: isDark ? "hsl(0 0% 98%)" : "hsl(240 10% 3.9%)",
      gridColor: isDark
        ? "hsl(240 5% 64.9% / 0.15)"
        : "hsl(240 3.8% 46.1% / 0.15)",
      chartBackgroundColor: "transparent",
    };
  }, [theme]);

  // Debounced configuration change handler
  const { debouncedCallback: debouncedConfigChange } = useDebounce(
    (config: ChartConfiguration) => {
      onConfigurationChange?.(config);
    },
    debounceDelay
  );

  // Internal configuration update handler
  const updateInternalConfiguration = useCallback(
    (newConfig: ChartConfiguration) => {
      setConfiguration(newConfig);
      debouncedConfigChange(newConfig);
    },
    [debouncedConfigChange]
  );

  // Auto-configure fields when data changes
  useEffect(() => {
    if (!columns.length) return;

    const currentFieldMapping = configuration.fieldMapping;
    const needsXAxisConfig = !currentFieldMapping.xAxis;
    const needsYAxisConfig = !currentFieldMapping.yAxis;

    if (!needsXAxisConfig && !needsYAxisConfig && initialConfiguration) return;

    const newFieldMapping = { ...currentFieldMapping };
    let modified = false;

    // Attempt to set X-axis if needed
    if (needsXAxisConfig) {
      const timeField = columns.find((col) => col.isTimeField);
      if (timeField) {
        newFieldMapping.xAxis = timeField.name;
        modified = true;
      } else {
        const numericXCandidate = columns.find(
          (col) =>
            (col.type === "integer" || col.type === "float") &&
            col.name !== newFieldMapping.yAxis
        );
        if (numericXCandidate) {
          newFieldMapping.xAxis = numericXCandidate.name;
          modified = true;
        } else {
          // Fallback: first column if nothing else fits (less ideal)
          if (columns.length > 0 && columns[0].name !== newFieldMapping.yAxis) {
            newFieldMapping.xAxis = columns[0].name;
            modified = true;
          }
        }
      }
    }

    // Attempt to set Y-axis if needed
    if (needsYAxisConfig) {
      // Prefer numeric field not used as X-axis and (ideally) not a time field if X is already time
      const xAxisIsTime = newFieldMapping.xAxis
        ? columns.find((col) => col.name === newFieldMapping.xAxis)?.isTimeField
        : false;

      let yCandidate = columns.find(
        (col) =>
          (col.type === "integer" || col.type === "float") &&
          col.name !== newFieldMapping.xAxis &&
          !(xAxisIsTime && col.isTimeField)
      );
      if (!yCandidate) {
        // Fallback: any numeric field not used for X-axis
        yCandidate = columns.find(
          (col) =>
            (col.type === "integer" || col.type === "float") &&
            col.name !== newFieldMapping.xAxis
        );
      }
      if (!yCandidate) {
        // Fallback: first numeric field available, even if it's the X-axis (chart will show something)
        yCandidate = columns.find(
          (col) => col.type === "integer" || col.type === "float"
        );
      }
      // Fallback: if no numeric field, use any field not X (less ideal)
      if (!yCandidate) {
        yCandidate = columns.find((col) => col.name !== newFieldMapping.xAxis);
      }

      if (yCandidate) {
        newFieldMapping.yAxis = yCandidate.name;
        modified = true;
      }
    }

    if (modified) {
      let newTimeFormatting = configuration.timeFormatting;
      const xAxisColumnDetails = columns.find(
        (col) => col.name === newFieldMapping.xAxis
      );

      if (xAxisColumnDetails?.isTimeField) {
        newTimeFormatting = {
          enabled: true,
          sourceTimeUnit: xAxisColumnDetails.timeUnit,
        };
      } else if (newFieldMapping.xAxis) {
        // If xAxis is set, but not a time field
        newTimeFormatting = { enabled: false, sourceTimeUnit: undefined };
      }

      const newConfig = {
        ...configuration,
        fieldMapping: newFieldMapping,
        timeFormatting: newTimeFormatting,
        updatedAt: new Date().toISOString(),
      };

      const updatedConfigWithTheme = updateChartConfiguration(
        newConfig,
        data,
        themeColors
      );
      setConfiguration(updatedConfigWithTheme);
      // Don't debounce auto-configuration - it should be immediate
      if (onConfigurationChange) {
        onConfigurationChange(updatedConfigWithTheme);
      }
    }
  }, [
    columns,
    configuration,
    initialConfiguration,
    onConfigurationChange,
    setConfiguration,
    data,
    themeColors,
  ]);

  // Update chart configuration when dependencies change
  useEffect(() => {
    if (!data?.length) return;

    const updatedConfig = updateChartConfiguration(
      configuration,
      data,
      themeColors
    );

    // Only update if the echarts config actually changed
    if (
      JSON.stringify(updatedConfig.echartsConfig) !==
      JSON.stringify(configuration.echartsConfig)
    ) {
      setConfiguration(updatedConfig);
    }
  }, [
    data,
    configuration.type,
    configuration.fieldMapping,
    configuration.styling,
    configuration.timeFormatting,
    themeColors,
  ]);

  // Initialize and update ECharts
  useEffect(() => {
    if (!chartRef.current || !configuration.echartsConfig) return;

    // Check if echarts is properly loaded and chartRef is valid
    if (!echarts) {
      console.error("ECharts library not loaded");
      return;
    }

    // Dispose of old instance if it exists
    if (echartsInstanceRef.current) {
      echartsInstanceRef.current.dispose();
    }

    try {
      // Initialize with current theme
      echartsInstanceRef.current = echarts.init(chartRef.current, theme);

      // Apply configuration
      echartsInstanceRef.current.setOption(configuration.echartsConfig, true);

      console.log(
        "Chart initialized successfully with config:",
        configuration.echartsConfig
      );
    } catch (error) {
      console.error("Error initializing or updating chart:", error);
    }

    const handleResize = () => {
      if (echartsInstanceRef.current) {
        echartsInstanceRef.current.resize();
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [configuration.echartsConfig, theme]);

  // Handle chart resize when panel is toggled
  useEffect(() => {
    const timer = setTimeout(() => {
      if (echartsInstanceRef.current) {
        echartsInstanceRef.current.resize();
      }
    }, 300); // Increased delay to ensure transition completes

    return () => clearTimeout(timer);
  }, [showPanel]);

  // Also handle resize when the container dimensions change
  useEffect(() => {
    if (!chartRef.current || !echartsInstanceRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (echartsInstanceRef.current) {
        echartsInstanceRef.current.resize();
      }
    });

    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (echartsInstanceRef.current) {
        echartsInstanceRef.current.dispose();
        echartsInstanceRef.current = null;
      }
    };
  }, []);

  // Configuration update helpers with proper debouncing
  const updateConfig = useCallback(
    (updates: Partial<ChartConfiguration>) => {
      const newConfig = {
        ...configuration,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      const updatedConfigWithData = updateChartConfiguration(
        newConfig,
        data,
        themeColors
      );

      updateInternalConfiguration(updatedConfigWithData);
    },
    [configuration, data, themeColors, updateInternalConfiguration]
  );

  const handleChartTypeChange = useCallback(
    (type: "line" | "bar" | "area") => {
      updateConfig({ type });
    },
    [updateConfig]
  );

  const handleFieldMappingChange = useCallback(
    (field: "xAxis" | "yAxis" | "groupBy", value: string | null) => {
      const newFieldMapping = { ...configuration.fieldMapping, [field]: value };

      let timeFormatting = configuration.timeFormatting;
      if (field === "xAxis" && value) {
        const column = columns.find((col) => col.name === value);
        if (column?.isTimeField) {
          timeFormatting = {
            enabled: true,
            sourceTimeUnit: column.timeUnit,
          };
        }
      }

      updateConfig({ fieldMapping: newFieldMapping, timeFormatting });
    },
    [
      configuration.fieldMapping,
      configuration.timeFormatting,
      columns,
      updateConfig,
    ]
  );

  const handleStylingChange = useCallback(
    (key: keyof NonNullable<ChartConfiguration["styling"]>, value: any) => {
      const newStyling = { ...configuration.styling, [key]: value };
      updateConfig({ styling: newStyling });
    },
    [configuration.styling, updateConfig]
  );

  // Export/Import handlers
  const handleExport = useCallback(() => {
    try {
      const jsonString = exportChartConfiguration(configuration);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `chart-config-${configuration.id}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Chart configuration exported");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export configuration");
    }
  }, [configuration]);

  const handleImport = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const jsonString = e.target?.result as string;
          const importedConfig = importChartConfiguration(
            jsonString,
            data,
            themeColors
          );

          setConfiguration(importedConfig);
          onConfigurationChange?.(importedConfig);
          toast.success("Chart configuration imported");
        } catch (error) {
          console.error("Import error:", error);
          toast.error(
            `Failed to import configuration: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      };
      reader.readAsText(file);
      event.target.value = "";
    },
    [data, themeColors, onConfigurationChange]
  );

  // Render loading state
  if (!data || data.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center text-muted-foreground">
            <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No data available for chart</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex h-full w-full">
      {/* Main Chart Area */}
      <div className="flex-1 flex flex-col">
        {/* Chart Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">
              {configuration.title || "Chart"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4" />
            </Button>
            <Label htmlFor="import-config" className="cursor-pointer">
              <Button variant="outline" size="sm" asChild>
                <span>
                  <Upload className="h-4 w-4" />
                </span>
              </Button>
            </Label>
            <input
              id="import-config"
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPanel(!showPanel)}
            >
              {showPanel ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Chart Canvas */}
        <div className="flex-1 relative bg-foreground/[0.02] rounded-lg m-2 min-h-[400px]">
          <div
            ref={chartRef}
            style={{ height: "100%", width: "100%" }}
            className="transition-all duration-300 p-2"
          />
        </div>
      </div>

      {/* Configuration Panel */}
      {showPanel && (
        <div className="w-80 border-l border-border bg-card transition-all duration-200">
          <ScrollArea className="h-full">
            <div className="p-3 border-b border-border">
              <h3 className="font-semibold text-sm">Chart Configuration</h3>
            </div>

            {/* Panel Options */}
            <PanelSection title="Panel options" defaultOpen={true}>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">
                  Title
                </Label>
                <Input
                  value={configuration.title || ""}
                  onChange={(e) => updateConfig({ title: e.target.value })}
                  placeholder="Panel title"
                  className="mt-1"
                />
              </div>
            </PanelSection>

            {/* Visualization */}
            <PanelSection title="Visualization" defaultOpen={true}>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">
                  Chart type
                </Label>
                <div className="grid grid-cols-3 gap-1 mt-2">
                  {(
                    Object.keys(chartTypeIcons) as Array<
                      keyof typeof chartTypeIcons
                    >
                  ).map((type) => {
                    const Icon = chartTypeIcons[type];
                    return (
                      <Button
                        key={type}
                        variant={
                          configuration.type === type ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => handleChartTypeChange(type)}
                        className="h-8 p-1 text-xs"
                        title={chartTypeLabels[type]}
                      >
                        <Icon className="h-4 w-4" />
                      </Button>
                    );
                  })}
                </div>
              </div>
            </PanelSection>

            {/* Query Configuration */}
            <PanelSection title="Query" defaultOpen={true}>
              <div className="space-y-3">
                {/* X-Axis */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">
                    X-Axis
                  </Label>
                  <Select
                    value={configuration.fieldMapping.xAxis || "none"}
                    onValueChange={(value) =>
                      handleFieldMappingChange(
                        "xAxis",
                        value === "none" ? null : value
                      )
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select X-Axis column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {columns.map((column) => (
                        <SelectItem key={column.name} value={column.name}>
                          <div className="flex items-center gap-2">
                            <span>{column.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {column.originalType || column.type}
                            </Badge>
                            {column.timeUnit && (
                              <Badge variant="secondary" className="text-xs">
                                {column.timeUnit}
                              </Badge>
                            )}
                            {column.isTimeField && (
                              <Badge variant="secondary" className="text-xs">
                                Time
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Y-Axis */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">
                    Y-Axis
                  </Label>
                  <Select
                    value={configuration.fieldMapping.yAxis || "none"}
                    onValueChange={(value) =>
                      handleFieldMappingChange(
                        "yAxis",
                        value === "none" ? null : value
                      )
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select Y-Axis column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {columns.map((column) => (
                        <SelectItem key={column.name} value={column.name}>
                          <div className="flex items-center gap-2">
                            <span>{column.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {column.originalType || column.type}
                            </Badge>
                            {column.timeUnit && (
                              <Badge variant="secondary" className="text-xs">
                                {column.timeUnit}
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Group By */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">
                    Group by
                  </Label>
                  <Select
                    value={configuration.fieldMapping.groupBy || "none"}
                    onValueChange={(value) =>
                      handleFieldMappingChange(
                        "groupBy",
                        value === "none" ? null : value
                      )
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select grouping column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {columns.map((column) => (
                        <SelectItem key={column.name} value={column.name}>
                          <div className="flex items-center gap-2">
                            <span>{column.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {column.originalType || column.type}
                            </Badge>
                            {column.timeUnit && (
                              <Badge variant="secondary" className="text-xs">
                                {column.timeUnit}
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PanelSection>

            {/* Standard Options */}
            <PanelSection title="Standard options" defaultOpen={false}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Show legend
                  </Label>
                  <Switch
                    checked={configuration.styling?.showLegend !== false}
                    onCheckedChange={(checked) =>
                      handleStylingChange("showLegend", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Show grid lines
                  </Label>
                  <Switch
                    checked={configuration.styling?.showGrid !== false}
                    onCheckedChange={(checked) =>
                      handleStylingChange("showGrid", checked)
                    }
                  />
                </div>
              </div>
            </PanelSection>

            {/* Chart-specific Options */}
            {configuration.type === "line" && (
              <PanelSection title="Line options" defaultOpen={false}>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Smooth lines
                  </Label>
                  <Switch
                    checked={configuration.styling?.smooth !== false}
                    onCheckedChange={(checked) =>
                      handleStylingChange("smooth", checked)
                    }
                  />
                </div>
              </PanelSection>
            )}

            {(configuration.type === "area" ||
              configuration.type === "bar") && (
              <PanelSection
                title={`${
                  configuration.type === "area" ? "Area" : "Bar"
                } options`}
                defaultOpen={false}
              >
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Stack series
                  </Label>
                  <Switch
                    checked={configuration.styling?.stack || false}
                    onCheckedChange={(checked) =>
                      handleStylingChange("stack", checked)
                    }
                  />
                </div>
              </PanelSection>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
};

export default GigChart;
