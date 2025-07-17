import { useMemo, useRef, useEffect } from "react";
import * as echarts from "echarts";
import { type PanelProps } from "@/types/dashboard.types";
import { withPanelWrapper } from "./BasePanel";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils/class-utils";

function GaugePanel({ config, data, isEditMode }: PanelProps) {
  // Check if we have multiple series (grouped data)
  const hasMultipleSeries = useMemo(() => {
    if (!data || data.length === 0) return false;
    const series = new Set(data.map(d => d.series));
    return series.size > 1 || (series.size === 1 && !series.has('gauge'));
  }, [data]);

  // If we have multiple series, render multiple gauge panels
  if (hasMultipleSeries) {
    return <MultiGaugePanel config={config} data={data} isEditMode={isEditMode} />;
  }

  const { theme } = useTheme();
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  const gaugeData = useMemo(() => {
    if (!data || data.length === 0) return null;

    // Use field mapping if available
    const fieldMapping = config.fieldMapping;
    let valueField: string;

    if (fieldMapping?.yField) {
      valueField = fieldMapping.yField;
    } else {
      // Auto-detect numeric field
      const firstRecord = data[0];
      const numericFields = Object.keys(firstRecord).filter((key) => {
        const value = firstRecord[key];
        return (
          typeof value === "number" ||
          (typeof value === "string" && !isNaN(Number(value)))
        );
      });

      if (numericFields.length === 0) return null;
      valueField = numericFields[0];
    }

    // Get the latest value
    let currentValue: number | null = null;
    for (let i = data.length - 1; i >= 0; i--) {
      const value = parseFloat(String(data[i][valueField]));
      if (!isNaN(value)) {
        currentValue = value;
        break;
      }
    }

    if (currentValue === null) return null;

    // Use field configuration
    const fieldConfig = config.fieldConfig?.defaults || {};
    const min = fieldConfig.min ?? 0;
    const max = fieldConfig.max ?? Math.max(100, currentValue * 1.2); // Auto-scale if needed
    const unit = fieldConfig.unit || "";

    // Calculate threshold zones with better defaults
    const zones = [];
    const defaultZones = [
      { min: 0, max: 0.6, color: "#52c41a" }, // Green
      { min: 0.6, max: 0.8, color: "#faad14" }, // Yellow
      { min: 0.8, max: 1, color: "#ff4d4f" }, // Red
    ];

    if (
      fieldConfig.thresholds?.steps &&
      fieldConfig.thresholds.steps.length > 1
    ) {
      const steps = fieldConfig.thresholds.steps;
      for (let i = 0; i < steps.length - 1; i++) {
        zones.push({
          min: steps[i].value,
          max: steps[i + 1].value,
          color: steps[i].color || defaultZones[i % defaultZones.length].color,
        });
      }
    } else {
      // Use default zones based on min/max
      defaultZones.forEach((zone) => {
        zones.push({
          min: min + (max - min) * zone.min,
          max: min + (max - min) * zone.max,
          color: zone.color,
        });
      });
    }

    return {
      value: currentValue,
      min,
      max,
      unit,
      zones,
      percentage: ((currentValue - min) / (max - min)) * 100,
    };
  }, [data, config]);

  const chartOption = useMemo(() => {
    if (!gaugeData) return null;

    const { value, min, max, unit, zones } = gaugeData;

    // Theme-aware colors
    const isDark = theme === "dark";
    const textColor = isDark ? "#e2e8f0" : "#475569";

    return {
      backgroundColor: "transparent",
      series: [
        {
          name: config.title,
          type: "gauge",
          startAngle: 180,
          endAngle: 0,
          center: ["50%", "75%"],
          radius: "90%",
          min,
          max,
          splitNumber: 10,
          axisLine: {
            lineStyle: {
              width: 8,
              color:
                zones.length > 0
                  ? zones.map((zone) => [
                      (zone?.max ? zone.max - min : 0) / (max - min),
                      zone.color,
                    ])
                  : [[1, "#52c41a"]],
            },
          },
          axisTick: {
            length: 8,
            distance: 0,
            lineStyle: {
              color: "auto",
              width: 1,
            },
          },
          splitLine: {
            length: 12,
            distance: -14,
            lineStyle: {
              color: "auto",
              width: 2,
            },
          },
          axisLabel: {
            color: textColor,
            fontSize: 10,
            distance: -25,
            formatter: function (value: number) {
              if (Math.abs(value) >= 1000000) {
                return (value / 1000000).toFixed(1) + "M";
              } else if (Math.abs(value) >= 1000) {
                return (value / 1000).toFixed(1) + "K";
              }
              return value.toFixed(0);
            },
          },
          title: {
            show: false,
          },
          detail: {
            fontSize: 16,
            fontWeight: "bold",
            offsetCenter: [0],
            formatter: function (value: number) {
              let formattedValue: string;
              if (Math.abs(value) >= 1e6) {
                formattedValue = (value / 1e6).toFixed(1) + "M";
              } else if (Math.abs(value) >= 1e3) {
                formattedValue = (value / 1e3).toFixed(1) + "K";
              } else {
                const decimals = config.fieldConfig?.defaults?.decimals ?? 1;
                formattedValue = value.toFixed(decimals);
              }
              return formattedValue + (unit ? " " + unit : "");
            },
            color: textColor,
          },
          data: [
            {
              value,
              name: config.title || "Value",
            },
          ],
        },
      ],
    };
  }, [gaugeData, config, isEditMode, theme]);

  // Initialize chart
  useEffect(() => {
    if (!chartRef.current) return;

    chartInstance.current = echarts.init(chartRef.current);

    return () => {
      chartInstance.current?.dispose();
    };
  }, []);

  // Update chart option
  useEffect(() => {
    if (!chartInstance.current || !chartOption) return;

    chartInstance.current.setOption(chartOption, true);
  }, [chartOption]);

  // Handle resize
  useEffect(() => {
    const resizeChart = () => {
      chartInstance.current?.resize();
    };

    const resizeObserver = new ResizeObserver(resizeChart);
    if (chartRef.current) {
      resizeObserver.observe(chartRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  if (!gaugeData) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <div className="text-sm">No data available</div>
          <div className="text-xs mt-1">Check your query configuration</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Title */}
      {config.title && (
        <div className="text-center text-sm font-medium text-muted-foreground mb-2 px-2">
          {config.title}
        </div>
      )}

      {/* Gauge Chart */}
      <div className="flex-1 relative min-h-0">
        <div ref={chartRef} className="w-full h-full" />
      </div>

      {/* Stats below gauge */}
      <div className="px-4 pb-2">
        <div className="flex justify-between items-center text-xs text-muted-foreground">
          <span>
            Min: {gaugeData.min}
            {gaugeData.unit}
          </span>
          <span>{gaugeData.percentage.toFixed(1)}%</span>
          <span>
            Max: {gaugeData.max}
            {gaugeData.unit}
          </span>
        </div>
      </div>
    </div>
  );
}

// Component for multiple gauges (grouped data)
function MultiGaugePanel({ config, data }: PanelProps) {
  const groupedGauges = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // Group data by series
    const groups = new Map<string, any[]>();
    data.forEach(d => {
      const series = d.series || 'default';
      if (!groups.has(series)) {
        groups.set(series, []);
      }
      groups.get(series)!.push(d);
    });
    
    return Array.from(groups.entries());
  }, [data]);

  return (
    <div className="h-full p-3">
      <div className={cn(
        "grid gap-3 h-full",
        groupedGauges.length === 1 ? "grid-cols-1" :
        groupedGauges.length === 2 ? "grid-cols-2" :
        groupedGauges.length === 3 ? "grid-cols-3" :
        groupedGauges.length === 4 ? "grid-cols-2 grid-rows-2" :
        "grid-cols-3 grid-rows-2"
      )}>
        {groupedGauges.map(([series, values]) => {
          // Get the value (should be single value per series in gauge transformation)
          const value = values[0]?.y || 0;
          const label = values[0]?.x || series;
          
          return (
            <div
              key={series}
              className="flex flex-col items-center justify-center text-center border rounded-lg p-3 bg-card"
            >
              <SingleGauge
                config={config}
                value={value}
                label={label}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Single gauge component for use in multi-gauge panel
function SingleGauge({ config, value, label }: { config: any; value: number; label: string }) {
  const { theme } = useTheme();
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  const gaugeData = useMemo(() => {
    // Use field configuration
    const fieldConfig = config.fieldConfig?.defaults || {};
    const min = fieldConfig.min ?? 0;
    const max = fieldConfig.max ?? Math.max(100, value * 1.2); // Auto-scale if needed
    const unit = fieldConfig.unit || "";

    // Calculate threshold zones with better defaults
    const zones = [];
    const defaultZones = [
      { min: 0, max: 0.6, color: "#52c41a" }, // Green
      { min: 0.6, max: 0.8, color: "#faad14" }, // Yellow
      { min: 0.8, max: 1, color: "#ff4d4f" }, // Red
    ];

    if (
      fieldConfig.thresholds?.steps &&
      fieldConfig.thresholds.steps.length > 1
    ) {
      const steps = fieldConfig.thresholds.steps;
      for (let i = 0; i < steps.length - 1; i++) {
        zones.push({
          min: steps[i].value,
          max: steps[i + 1].value,
          color: steps[i].color || defaultZones[i % defaultZones.length].color,
        });
      }
    } else {
      // Use default zones based on min/max
      defaultZones.forEach((zone) => {
        zones.push({
          min: min + (max - min) * zone.min,
          max: min + (max - min) * zone.max,
          color: zone.color,
        });
      });
    }

    return {
      value,
      min,
      max,
      unit,
      zones,
      percentage: ((value - min) / (max - min)) * 100,
    };
  }, [value, config]);

  const chartOption = useMemo(() => {
    if (!gaugeData) return null;

    const { value, min, max, unit, zones } = gaugeData;

    // Theme-aware colors
    const isDark = theme === "dark";
    const textColor = isDark ? "#e2e8f0" : "#475569";

    return {
      backgroundColor: "transparent",
      series: [
        {
          name: label,
          type: "gauge",
          startAngle: 180,
          endAngle: 0,
          center: ["50%", "75%"],
          radius: "85%",
          min,
          max,
          splitNumber: 5,
          axisLine: {
            lineStyle: {
              width: 6,
              color:
                zones.length > 0
                  ? zones.map((zone) => [
                      (zone?.max ? zone.max - min : 0) / (max - min),
                      zone.color,
                    ])
                  : [[1, "#52c41a"]],
            },
          },
          axisTick: {
            length: 6,
            distance: 0,
            lineStyle: {
              color: "auto",
              width: 1,
            },
          },
          splitLine: {
            length: 10,
            distance: -10,
            lineStyle: {
              color: "auto",
              width: 1.5,
            },
          },
          axisLabel: {
            color: textColor,
            fontSize: 8,
            distance: -20,
            formatter: function (value: number) {
              if (Math.abs(value) >= 1000000) {
                return (value / 1000000).toFixed(0) + "M";
              } else if (Math.abs(value) >= 1000) {
                return (value / 1000).toFixed(0) + "K";
              }
              return value.toFixed(0);
            },
          },
          title: {
            show: false,
          },
          detail: {
            fontSize: 14,
            fontWeight: "bold",
            offsetCenter: [0, "5%"],
            formatter: function (value: number) {
              let formattedValue: string;
              if (Math.abs(value) >= 1e6) {
                formattedValue = (value / 1e6).toFixed(1) + "M";
              } else if (Math.abs(value) >= 1e3) {
                formattedValue = (value / 1e3).toFixed(1) + "K";
              } else {
                const decimals = config.fieldConfig?.defaults?.decimals ?? 1;
                formattedValue = value.toFixed(decimals);
              }
              return formattedValue + (unit ? " " + unit : "");
            },
            color: textColor,
          },
          data: [
            {
              value,
              name: label,
            },
          ],
        },
      ],
    };
  }, [gaugeData, label, theme, config]);

  // Initialize chart
  useEffect(() => {
    if (!chartRef.current) return;

    chartInstance.current = echarts.init(chartRef.current);

    return () => {
      chartInstance.current?.dispose();
    };
  }, []);

  // Update chart option
  useEffect(() => {
    if (!chartInstance.current || !chartOption) return;

    chartInstance.current.setOption(chartOption, true);
  }, [chartOption]);

  // Handle resize
  useEffect(() => {
    const resizeChart = () => {
      chartInstance.current?.resize();
    };

    const resizeObserver = new ResizeObserver(resizeChart);
    if (chartRef.current) {
      resizeObserver.observe(chartRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="text-xs text-muted-foreground font-medium mb-1">
        {label}
      </div>
      <div className="flex-1 relative min-h-0">
        <div ref={chartRef} className="w-full h-full" />
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        {gaugeData.percentage.toFixed(0)}%
      </div>
    </div>
  );
}

export default withPanelWrapper(GaugePanel);
