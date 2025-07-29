import { useMemo, useRef, useEffect, useState, memo } from "react";
import * as echarts from "echarts";
import { type PanelProps } from "@/types/dashboard.types";
import { withPanelWrapper } from "./BasePanel";
import { cn } from "@/lib/utils/class-utils";

// Single gauge component
function SingleGaugePanel({ config, data }: PanelProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  // Detect current theme
  const [isDarkMode, setIsDarkMode] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  // Track container dimensions for responsive sizing
  const [containerDimensions, setContainerDimensions] = useState({
    width: 400,
    height: 400,
  });

  const gaugeData = useMemo(() => {
    if (!data || data.length === 0) return null;

    // Check if data has standard chart format with x, y properties
    const hasChartFormat = data.length > 0 && data[0].hasOwnProperty("y");

    let displayValue: number;
    let fieldName: string = "";

    if (hasChartFormat && typeof data[0].y === "number") {
      // Handle pre-processed data (from MultiGaugePanel or stat data)
      const values = data.map((d) => d.y).filter((v) => typeof v === "number");
      if (values.length === 0) return null;

      // Use yField from mapping, then series, then fallback to config title
      fieldName =
        config.fieldMapping?.yField ||
        (data[0].series && data[0].series !== "stats"
          ? data[0].series
          : config.title || "Value");

      // Calculate display value based on stat mode
      const statMode = config.options?.stat?.mode || "current";

      if (data.length === 1) {
        // Single value
        displayValue = values[0];
      } else {
        // Multiple values - calculate based on stat mode
        const current = values[values.length - 1];
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = values.reduce((sum, val) => sum + val, 0) / values.length;

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
      }
    } else {
      // Handle regular data
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

      // Use the configured yField if available, otherwise use the detected field
      fieldName = config.fieldMapping?.yField || valueField;
    }

    // Get field config for unit and decimals
    const fieldConfig = config.fieldConfig?.defaults;

    // Always use 0-100 scale for simplicity
    const minValue = 0;
    const maxValue = 100;

    // Calculate the actual data range for mapping
    let dataMin = 0;
    let dataMax = 100;

    if (fieldConfig?.min !== undefined && fieldConfig?.max !== undefined) {
      dataMin = fieldConfig.min;
      dataMax = fieldConfig.max;
    } else {
      // Auto-calculate based on the display value
      // Always include 0 in the range for better visualization
      if (displayValue < 0) {
        dataMin = displayValue * 1.2;
        dataMax = 0;
      } else if (displayValue <= 1) {
        dataMin = 0;
        dataMax = 1;
      } else if (displayValue <= 100) {
        dataMin = 0;
        dataMax = 100;
      } else if (displayValue <= 1000) {
        dataMin = 0;
        dataMax = Math.ceil(displayValue / 100) * 100; // Round up to nearest 100
      } else {
        dataMin = 0;
        dataMax = Math.ceil(displayValue / 1000) * 1000; // Round up to nearest 1000
      }
    }

    return {
      value: displayValue,
      min: minValue,
      max: maxValue,
      dataMin: dataMin,
      dataMax: dataMax,
      fieldName: fieldName,
      unit: fieldConfig?.unit || "",
      decimals: fieldConfig?.decimals ?? 2,
    };
  }, [data, config]);

  const chartOptions = useMemo(() => {
    if (!gaugeData) return {};

    // Calculate responsive sizes based on container
    const containerWidth = containerDimensions.width;
    const containerHeight = containerDimensions.height;
    const minDimension = Math.min(containerWidth, containerHeight);

    // Scale font sizes based on container size - more aggressive scaling
    const valueFontSize = Math.max(32, Math.min(72, minDimension * 0.18));
    const unitFontSize = Math.max(16, Math.min(32, minDimension * 0.08));
    const axisLabelFontSize = Math.max(10, Math.min(14, minDimension * 0.035));

    // Map the actual value to 0-100 range
    const normalizedValue =
      ((gaugeData.value - gaugeData.dataMin) /
        (gaugeData.dataMax - gaugeData.dataMin)) *
      100;

    // Clamp to 0-100
    const clampedValue = Math.max(0, Math.min(100, normalizedValue));

    // Determine progress color based on value
    let progressColor;
    let thresholdColors;

    if (clampedValue < 33) {
      progressColor = "#10b981"; // Green
      thresholdColors = [
        [0.33, "#10b981"], // Green up to 33%
        [0.66, "#f59e0b"], // Yellow 33-66%
        [1, "#ef4444"], // Red 66-100%
      ];
    } else if (clampedValue < 66) {
      progressColor = "#f59e0b"; // Yellow
      thresholdColors = [
        [0.33, "#10b981"], // Green up to 33%
        [0.66, "#f59e0b"], // Yellow 33-66%
        [1, "#ef4444"], // Red 66-100%
      ];
    } else {
      progressColor = "#ef4444"; // Red
      thresholdColors = [
        [0.33, "#10b981"], // Green up to 33%
        [0.66, "#f59e0b"], // Yellow 33-66%
        [1, "#ef4444"], // Red 66-100%
      ];
    }

    const gaugeDecimals = gaugeData.decimals;
    const gaugeUnit = gaugeData.unit;

    // Use theme CSS variables with Grafana-style visibility
    const textColor = "hsl(var(--foreground))";
    const subtextColor = "hsl(var(--muted-foreground))";

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        confine: true,
        appendToBody: true,
        renderMode: "html",
        position: function (point: number[], size: any) {
          if (!point || !Array.isArray(point) || point.length < 2) {
            return [10, 10];
          }

          if (!size || !size.viewSize || !size.contentSize) {
            return [point[0] + 15, point[1] - 15];
          }

          const x = point[0];
          const y = point[1];
          const viewWidth = size.viewSize[0];
          const viewHeight = size.viewSize[1];
          const boxWidth = size.contentSize[0];
          const boxHeight = size.contentSize[1];

          let posX = x + 15;
          let posY = y - boxHeight - 15;

          if (posX + boxWidth > viewWidth) {
            posX = x - boxWidth - 15;
          }

          if (posY < 0) {
            posY = y + 15;
          }

          if (posY + boxHeight > viewHeight) {
            posY = viewHeight - boxHeight - 5;
          }

          return [posX, posY];
        },
        backgroundColor: isDarkMode
          ? "rgba(30, 30, 30, 0.9)"
          : "rgba(255, 255, 255, 0.95)",
        borderWidth: 1,
        borderColor: isDarkMode ? "#525252" : "#d0d0d0",
        textStyle: {
          color: isDarkMode ? "#e0e0e0" : "#333333",
          fontSize: 12,
        },
        extraCssText: "z-index: 9999; pointer-events: none;",
        formatter: function () {
          const value = gaugeData.value;
          let formattedValue: string;

          if (Math.abs(value) >= 1e9) {
            formattedValue = (value / 1e9).toFixed(gaugeDecimals) + "B";
          } else if (Math.abs(value) >= 1e6) {
            formattedValue = (value / 1e6).toFixed(gaugeDecimals) + "M";
          } else if (Math.abs(value) >= 1e3) {
            formattedValue = (value / 1e3).toFixed(gaugeDecimals) + "k";
          } else {
            formattedValue = value.toFixed(gaugeDecimals);
          }

          const marker = `<span style="display:inline-block;margin-right:8px;border-radius:50%;width:8px;height:8px;background-color:${progressColor};"></span>`;

          return `<div style="margin-bottom: 6px;"><strong>${formatFieldName(
            gaugeData.fieldName
          )}</strong></div>
            <div style="margin: 2px 0;">${marker}<span style="color: ${progressColor};">Value:</span> <strong>${formattedValue}${
            gaugeUnit ? " " + gaugeUnit : ""
          }</strong></div>`;
        },
      },
      series: [
        {
          type: "gauge",
          startAngle: 225,
          endAngle: -45,
          min: 0,
          max: 100,
          center: ["50%", "55%"],
          radius: "75%",
          axisLine: {
            roundCap: true,
            lineStyle: {
              width: 20,
              color: [
                [
                  1,
                  isDarkMode
                    ? "rgba(255, 255, 255, 0.08)"
                    : "rgba(0, 0, 0, 0.08)",
                ],
              ],
            },
          },
          progress: {
            show: true,
            overlap: true, // Overlay on track
            roundCap: true,
            clip: false,
            width: 20,
            itemStyle: {
              color: progressColor,
            },
          },
          splitLine: {
            show: true,
            distance: -30,
            length: 8,
            lineStyle: {
              width: 1.5,
              color: isDarkMode
                ? "rgba(255, 255, 255, 0.1)"
                : "rgba(0, 0, 0, 0.1)",
            },
          },
          axisTick: {
            show: true,
            splitNumber: 5,
            distance: -25,
            length: 4,
            lineStyle: {
              width: 1,
              color: isDarkMode
                ? "rgba(255, 255, 255, 0.08)"
                : "rgba(0, 0, 0, 0.08)",
            },
          },
          axisLabel: {
            show: true,
            distance: -45,
            color: isDarkMode
              ? "rgba(255, 255, 255, 0.5)"
              : "rgba(0, 0, 0, 0.5)",
            fontSize: axisLabelFontSize,
            formatter: function (value: number) {
              // Map 0-100 back to actual data range for display
              const actualValue =
                gaugeData.dataMin +
                (value / 100) * (gaugeData.dataMax - gaugeData.dataMin);
              return Math.round(actualValue).toString();
            },
          },
          pointer: {
            show: true,
            width: 3,
            length: "50%",
            offsetCenter: [0, "-10%"],
            itemStyle: {
              color: isDarkMode
                ? "rgba(255, 255, 255, 0.6)"
                : "rgba(0, 0, 0, 0.6)",
              borderWidth: 0,
            },
          },
          anchor: {
            show: false, // Hide for cleaner look
          },
          title: {
            show: false,
          },
          detail: {
            valueAnimation: true,
            offsetCenter: [0, "0%"],
            formatter: function () {
              // Always show the actual value (not the normalized percentage)
              const actualValue = gaugeData.value;
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
                fontSize: valueFontSize,
                fontWeight: "500",
                color: textColor,
                padding: [0, 0],
                fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
              },
              unit: {
                fontSize: unitFontSize,
                color: subtextColor,
                padding: [valueFontSize * 0.35, 0, 0, 2],
                fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
              },
            },
          },
          data: [
            {
              value: clampedValue,
            },
          ],
        },
      ],
      // Removed graphic text element to clean up the gauge
    };
  }, [gaugeData, isDarkMode, containerDimensions]);

  // Watch for theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  // Watch for container size changes
  useEffect(() => {
    if (!chartRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerDimensions({ width, height });
      }
    });

    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Initialize chart instance
  useEffect(() => {
    if (!chartRef.current || !gaugeData) return;

    try {
      // Dispose existing instance if any
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }

      // Initialize new chart instance
      chartInstance.current = echarts.init(chartRef.current, null, {
        renderer: "canvas",
      });

      // Handle resize
      const handleResize = () => {
        chartInstance.current?.resize();
      };

      window.addEventListener("resize", handleResize);

      // Trigger initial resize
      setTimeout(handleResize, 100);

      return () => {
        window.removeEventListener("resize", handleResize);
        if (chartInstance.current) {
          chartInstance.current.dispose();
          chartInstance.current = null;
        }
      };
    } catch (error) {
      console.error("[SingleGaugePanel] Error initializing chart:", error);
    }
  }, []); // Only run on mount/unmount

  // Update chart options separately
  useEffect(() => {
    if (!chartInstance.current || !gaugeData) return;

    try {
      chartInstance.current.setOption(chartOptions, {
        notMerge: true,
        lazyUpdate: true,
      });
    } catch (error) {
      console.error("[SingleGaugePanel] Error updating chart:", error);
    }
  }, [chartOptions, gaugeData]);

  // Handle resize separately
  useEffect(() => {
    if (!chartInstance.current) return;

    const handleResize = () => {
      chartInstance.current?.resize();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (chartRef.current) {
      resizeObserver.observe(chartRef.current);
    }

    return () => {
      resizeObserver.disconnect();
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

    // Check if we have a single record with multiple numeric fields
    if (data.length === 1) {
      const firstRecord = data[0];
      const fields = Object.keys(firstRecord);
      const numericFields = fields.filter((field) => {
        if (field === "x" || field === "y" || field === "series") return false;
        const value = firstRecord[field];
        return (
          typeof value === "number" ||
          (typeof value === "string" && !isNaN(Number(value)))
        );
      });

      // If we have multiple numeric fields, create a gauge for each
      if (numericFields.length > 1) {
        return numericFields.map((field) => {
          // Create a single-element array with just this field's data
          const fieldData = [
            {
              [field]: firstRecord[field],
              x: firstRecord.x,
              y: firstRecord[field],
              series: field,
            },
          ];
          return [field, fieldData] as [string, any[]];
        });
      }
    }

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
          <div key={label} className="border rounded-lg bg-card p-4 h-full">
            <div className="text-center mb-2">
              <div className="text-sm font-medium text-muted-foreground">
                {formatFieldName(label)}
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

    // Check if this is stat data (single gauge)
    const isStatData =
      data.length > 0 &&
      data[0].x &&
      typeof data[0].x === "string" &&
      ["current", "average", "min", "max"].includes(data[0].x);

    if (isStatData) {
      return false; // Stat data should show single gauge
    }

    // Check if we have a single record with multiple numeric fields
    if (data.length === 1) {
      const firstRecord = data[0];
      const fields = Object.keys(firstRecord);
      const numericFields = fields.filter((field) => {
        if (field === "x" || field === "y" || field === "series") return false;
        const value = firstRecord[field];
        return (
          typeof value === "number" ||
          (typeof value === "string" && !isNaN(Number(value)))
        );
      });

      // If we have more than one numeric field, show multiple gauges
      if (numericFields.length > 1) {
        return true;
      }
    }

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

function formatFieldName(fieldName: string): string {
  // Handle function expressions like avg(temperature), sum(sales), etc.
  const functionMatch = fieldName.match(/^(\w+)\((.+)\)$/);
  if (functionMatch) {
    const [, func, field] = functionMatch;
    // Capitalize function name and format field
    const formattedFunc = func.charAt(0).toUpperCase() + func.slice(1);
    const formattedField = field
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
    return `${formattedFunc} ${formattedField}`;
  }

  // Handle regular field names
  return fieldName.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

// Memoize the gauge panel to prevent unnecessary re-renders
const MemoizedGaugePanel = memo(GaugePanel, (prevProps, nextProps) => {
  return (
    prevProps.config === nextProps.config &&
    prevProps.data === nextProps.data
  );
});

export default withPanelWrapper(MemoizedGaugePanel);
