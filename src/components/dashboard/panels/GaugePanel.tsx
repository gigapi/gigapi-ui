import { useMemo, useRef, useEffect } from "react";
import * as echarts from "echarts";
import { type PanelProps } from "@/types/dashboard.types";
import { withPanelWrapper } from "./BasePanel";
import { cn } from "@/lib/utils/class-utils";

// Single gauge component
function SingleGaugePanel({ config, data }: PanelProps) {
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

    // Extract values for calculations
    const values: number[] = [];
    for (const record of data) {
      const value = parseFloat(String(record[valueField]));
      if (!isNaN(value)) {
        values.push(value);
      }
    }

    if (values.length === 0) return null;

    const current = values[values.length - 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;

    // Determine which value to display based on stat mode
    const statMode = config.options?.stat?.mode || "current";
    let displayValue: number;

    switch (statMode) {
      case "average":
        displayValue = avg;
        break;
      case "min":
        displayValue = min;
        break;
      case "max":
        displayValue = max;
        break;
      case "current":
      default:
        displayValue = current;
        break;
    }

    // Get thresholds from field config
    const fieldConfig = config.fieldConfig?.defaults;
    let minThreshold = 0;
    let maxThreshold = 100;
    let thresholds: Array<{ value: number; color: string }> = [];

    if (fieldConfig?.thresholds?.steps) {
      const steps = fieldConfig.thresholds.steps;
      if (steps.length >= 2) {
        minThreshold = steps[0].value ?? 0;
        maxThreshold = steps[steps.length - 1].value ?? 100;

        // Build color ranges for the gauge
        thresholds = steps.map((step, index) => ({
          value:
            ((step.value ?? 0) - minThreshold) / (maxThreshold - minThreshold),
          color: step.color || getDefaultColor(index),
        }));
      }
    } else {
      // Auto-calculate range based on data
      const range = max - min;
      minThreshold = min - range * 0.1;
      maxThreshold = max + range * 0.1;
    }

    return {
      value: displayValue,
      min: minThreshold,
      max: maxThreshold,
      thresholds,
      fieldName: valueField,
      unit: fieldConfig?.unit || "",
      decimals: fieldConfig?.decimals ?? 2,
    };
  }, [data, config]);

  const chartOptions = useMemo(() => {
    if (!gaugeData) return {};

    const normalizedValue =
      ((gaugeData.value - gaugeData.min) / (gaugeData.max - gaugeData.min)) *
      100;

    // Modern gradient colors that work in both themes
    let progressGradient;

    if (gaugeData.thresholds.length > 0) {
      // Use configured thresholds
      let currentColor = gaugeData.thresholds[0].color;
      for (let i = gaugeData.thresholds.length - 1; i >= 0; i--) {
        if (normalizedValue / 100 >= gaugeData.thresholds[i].value) {
          currentColor = gaugeData.thresholds[i].color;
          break;
        }
      }
      progressGradient = currentColor;
    } else {
      // Beautiful gradients based on value
      if (normalizedValue >= 80) {
        progressGradient = {
          type: "linear",
          x: 0,
          y: 0,
          x2: 1,
          y2: 0,
          colorStops: [
            { offset: 0, color: "#ef4444" },
            { offset: 1, color: "#dc2626" },
          ],
        };
      } else if (normalizedValue >= 60) {
        progressGradient = {
          type: "linear",
          x: 0,
          y: 0,
          x2: 1,
          y2: 0,
          colorStops: [
            { offset: 0, color: "#f59e0b" },
            { offset: 1, color: "#d97706" },
          ],
        };
      } else {
        progressGradient = {
          type: "linear",
          x: 0,
          y: 0,
          x2: 1,
          y2: 0,
          colorStops: [
            { offset: 0, color: "#10b981" },
            { offset: 1, color: "#059669" },
          ],
        };
      }
    }

    const gaugeMin = gaugeData.min;
    const gaugeMax = gaugeData.max;
    const gaugeDecimals = gaugeData.decimals;
    const gaugeUnit = gaugeData.unit;

    // Use theme CSS variables - these automatically adapt to light/dark mode
    const textColor = "hsl(var(--foreground))";
    const subtextColor = "hsl(var(--muted-foreground))";
    const trackColor = "hsl(var(--muted))";

    return {
      backgroundColor: "transparent",
      series: [
        {
          type: "gauge",
          startAngle: 200,
          endAngle: -20,
          min: 0,
          max: 100,
          center: ["50%", "60%"],
          radius: "85%",
          axisLine: {
            roundCap: true,
            lineStyle: {
              width: 25,
              color: [[1, trackColor]],
            },
          },
          progress: {
            show: true,
            overlap: false,
            roundCap: true,
            clip: false,
            itemStyle: {
              color: progressGradient,
              shadowBlur: 10,
              shadowColor: "rgba(0, 0, 0, 0.2)",
            },
          },
          splitLine: {
            show: true,
            distance: -35,
            length: 35,
            lineStyle: {
              width: 4,
              color: trackColor,
            },
          },
          axisTick: {
            show: true,
            splitNumber: 5,
            distance: -30,
            length: 8,
            lineStyle: {
              width: 2,
              color: trackColor,
            },
          },
          axisLabel: {
            show: true,
            distance: -50,
            color: subtextColor,
            fontSize: 11,
            formatter: function (value: number) {
              const actualValue =
                gaugeMin + (value / 100) * (gaugeMax - gaugeMin);
              if (Math.abs(actualValue) >= 1000) {
                return Math.round(actualValue / 1000) + "k";
              }
              return Math.round(actualValue).toString();
            },
          },
          pointer: {
            show: true,
            width: 8,
            length: "60%",
            offsetCenter: [0, "0%"],
            itemStyle: {
              color: "auto",
              borderColor: "#000",
              borderWidth: 0,
              shadowBlur: 5,
              shadowColor: "rgba(0, 0, 0, 0.2)",
            },
          },
          anchor: {
            show: true,
            showAbove: true,
            size: 25,
            itemStyle: {
              borderWidth: 10,
              borderColor: "hsl(var(--background))",
              shadowBlur: 8,
              shadowColor: "rgba(0, 0, 0, 0.1)",
            },
          },
          title: {
            show: false,
          },
          detail: {
            valueAnimation: true,
            offsetCenter: [0, "-10%"],
            formatter: function (value: number) {
              const actualValue =
                gaugeMin + (value / 100) * (gaugeMax - gaugeMin);
              let formattedValue: string;

              if (Math.abs(actualValue) >= 1e9) {
                formattedValue =
                  (actualValue / 1e9).toFixed(gaugeDecimals) + "B";
              } else if (Math.abs(actualValue) >= 1e6) {
                formattedValue =
                  (actualValue / 1e6).toFixed(gaugeDecimals) + "M";
              } else if (Math.abs(actualValue) >= 1e3) {
                formattedValue =
                  (actualValue / 1e3).toFixed(gaugeDecimals) + "k";
              } else {
                formattedValue = actualValue.toFixed(gaugeDecimals);
              }

              return `{value|${formattedValue}}{unit|${gaugeUnit}}`;
            },
            rich: {
              value: {
                fontSize: 56,
                fontWeight: "300",
                color: textColor,
                padding: [0, 0],
                fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
              },
              unit: {
                fontSize: 24,
                color: subtextColor,
                padding: [20, 0, 0, 2],
                fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
              },
            },
          },
          data: [
            {
              value: normalizedValue,
            },
          ],
        },
      ],
      graphic: [
        {
          type: "text",
          left: "center",
          bottom: "15%",
          style: {
            text: gaugeData.fieldName,
            textAlign: "center",
            fontSize: 14,
            fontWeight: 500,
            fill: subtextColor,
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          },
        },
      ],
    };
  }, [gaugeData]);

  // Initialize and update chart
  useEffect(() => {
    if (!chartRef.current || !gaugeData) return;

    try {
      // Initialize chart instance
      if (!chartInstance.current) {
        chartInstance.current = echarts.init(chartRef.current, null, {
          renderer: "canvas",
        });
      }

      // Set chart options
      chartInstance.current.setOption(chartOptions);

      // Handle resize
      const handleResize = () => {
        chartInstance.current?.resize();
      };

      // Handle theme changes
      const observer = new MutationObserver(() => {
        chartInstance.current?.setOption(chartOptions);
      });

      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });

      window.addEventListener("resize", handleResize);

      // Trigger initial resize
      setTimeout(handleResize, 100);

      return () => {
        window.removeEventListener("resize", handleResize);
        observer.disconnect();
      };
    } catch (error) {
      console.error("[SingleGaugePanel] Error initializing chart:", error);
    }
  }, [chartOptions, gaugeData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        chartInstance.current?.dispose();
      } catch (error) {
        console.error("[SingleGaugePanel] Error disposing chart:", error);
      }
    };
  }, []);

  if (!gaugeData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-muted-foreground">
          <div className="text-sm">No data</div>
        </div>
      </div>
    );
  }

  return <div ref={chartRef} className="h-full w-full" />;
}

// Component for multiple gauges (grouped data)
function MultiGaugePanel({ config, data }: PanelProps) {
  const groupedGauges = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Check if we have a specific group by field
    const groupByField = config.fieldMapping?.seriesField;

    if (groupByField) {
      // Group by specified field
      const groups = new Map<string, any[]>();
      data.forEach((d) => {
        const groupKey = String(d[groupByField] || "Unknown");
        if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
        }
        groups.get(groupKey)!.push(d);
      });
      return Array.from(groups.entries());
    }

    // For aggregated queries, each row is its own "group"
    const firstRecord = data[0];
    const fields = Object.keys(firstRecord);

    // Find the value field (numeric) and label field (string)
    const valueField =
      config.fieldMapping?.yField ||
      fields.find((field) => {
        const value = firstRecord[field];
        return (
          typeof value === "number" ||
          (typeof value === "string" && !isNaN(Number(value)))
        );
      });

    const labelField = fields.find((field) => {
      const value = firstRecord[field];
      return (
        typeof value === "string" && isNaN(Number(value)) && field !== "series"
      );
    });

    if (valueField && labelField) {
      // Each row becomes a separate gauge
      return data.map((record) => {
        const label = String(record[labelField] || "Unknown");
        return [label, [record]] as [string, typeof data];
      });
    }

    // If no grouping field found, show single gauge with field name
    // This handles simple queries without GROUP BY
    if (data.length === 1) {
      const valueField = config.fieldMapping?.yField || 
        fields.find((field) => {
          const value = firstRecord[field];
          return (
            typeof value === "number" ||
            (typeof value === "string" && !isNaN(Number(value)))
          );
        });
      return [[valueField || 'Value', data]];
    }
    
    // Fallback to series-based grouping
    const groups = new Map<string, any[]>();
    data.forEach((d) => {
      const series = d.series || "Value";
      if (!groups.has(series)) {
        groups.set(series, []);
      }
      groups.get(series)!.push(d);
    });

    return Array.from(groups.entries());
  }, [data, config]);

  return (
    <div className="h-full w-full p-4">
      <div
        className={cn(
          "grid gap-4 h-full w-full",
          groupedGauges.length === 1
            ? "grid-cols-1"
            : groupedGauges.length === 2
            ? "grid-cols-2"
            : groupedGauges.length === 3
            ? "grid-cols-3"
            : groupedGauges.length === 4
            ? "grid-cols-2 grid-rows-2"
            : groupedGauges.length <= 6
            ? "grid-cols-3 grid-rows-2"
            : "grid-cols-4 grid-rows-2"
        )}
      >
        {groupedGauges.map(([label, records]) => (
          <div
            key={label}
            className="border rounded-lg bg-card p-4 h-full"
          >
            <div className="text-center mb-2">
              <div className="text-sm font-medium text-muted-foreground">
                {label}
              </div>
            </div>
            <div className="h-[calc(100%-2rem)]">
              <SingleGaugePanel
                config={{ ...config, title: label }}
                data={records}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Main gauge panel component
function GaugePanel({ config, data }: PanelProps) {
  // Check if we have multiple series (grouped data)
  const hasMultipleSeries = useMemo(() => {
    if (!data || data.length === 0) return false;

    // Check if we have a group by field in the field mapping
    const groupByField = config.fieldMapping?.seriesField;
    if (groupByField && data.length > 1) {
      // Check if all records have different values for the group field
      const groupValues = new Set(data.map((d) => d[groupByField]));
      return groupValues.size > 1;
    }

    // For aggregated queries without explicit grouping, check if we have multiple rows
    if (data.length > 1) {
      // Check if this looks like aggregated data
      const firstRecord = data[0];
      const fields = Object.keys(firstRecord);
      const numericFields = fields.filter((field) => {
        const value = firstRecord[field];
        return (
          typeof value === "number" ||
          (typeof value === "string" && !isNaN(Number(value)))
        );
      });
      const stringFields = fields.filter((field) => {
        const value = firstRecord[field];
        return typeof value === "string" && isNaN(Number(value));
      });

      // If we have exactly one numeric field and at least one string field, it's likely grouped data
      if (numericFields.length === 1 && stringFields.length >= 1) {
        return true;
      }
    }

    // Legacy check for series field
    const series = new Set(data.map((d) => d.series));
    return series.size > 1 || (series.size === 1 && !series.has("stats"));
  }, [data, config]);

  // If we have multiple series, render multiple gauge panels
  if (hasMultipleSeries) {
    return <MultiGaugePanel config={config} data={data} />;
  }

  // Otherwise render a single gauge with proper centering
  return (
    <div className="flex items-center justify-center h-full w-full p-4">
      <div className="h-full w-full max-w-[400px] max-h-[400px]">
        <SingleGaugePanel config={config} data={data} />
      </div>
    </div>
  );
}

function getDefaultColor(index: number): string {
  const colors = [
    "#10b981", // Emerald
    "#f59e0b", // Amber
    "#ef4444", // Red
    "#3b82f6", // Blue
    "#8b5cf6", // Violet
    "#ec4899", // Pink
    "#14b8a6", // Teal
  ];
  return colors[index % colors.length];
}

export default withPanelWrapper(GaugePanel);
