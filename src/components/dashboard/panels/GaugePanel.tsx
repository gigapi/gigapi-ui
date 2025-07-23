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

    // Check if data has standard chart format with x, y properties
    const hasChartFormat = data.length > 0 && data[0].hasOwnProperty('y');
    
    let displayValue: number;
    let fieldName: string = "";
    
    if (hasChartFormat && typeof data[0].y === 'number') {
      // Handle pre-processed data (from MultiGaugePanel or stat data)
      const values = data.map(d => d.y).filter(v => typeof v === 'number');
      if (values.length === 0) return null;
      
      // Use config title if available, otherwise use series name
      fieldName = config.title || (data[0].series && data[0].series !== 'stats' ? data[0].series : config.fieldMapping?.yField || "value");
      
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
      
      fieldName = valueField;
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

    // Map the actual value to 0-100 range
    const normalizedValue = ((gaugeData.value - gaugeData.dataMin) / (gaugeData.dataMax - gaugeData.dataMin)) * 100;
    
    // Clamp to 0-100
    const clampedValue = Math.max(0, Math.min(100, normalizedValue));

    // Simple color logic based on percentage
    let progressGradient;
    
    if (clampedValue < 33) {
      // Green for low values
      progressGradient = {
        type: "linear",
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
          { offset: 0, color: "#10b981" },
          { offset: 1, color: "#059669" },
        ],
      };
    } else if (clampedValue < 66) {
      // Yellow/amber for medium values
      progressGradient = {
        type: "linear",
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
          { offset: 0, color: "#f59e0b" },
          { offset: 1, color: "#d97706" },
        ],
      };
    } else {
      // Red for high values
      progressGradient = {
        type: "linear",
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
          { offset: 0, color: "#ef4444" },
          { offset: 1, color: "#dc2626" },
        ],
      };
    }

    const gaugeDecimals = gaugeData.decimals;
    const gaugeUnit = gaugeData.unit;

    // Use theme CSS variables with better visibility
    const textColor = "hsl(var(--foreground))";
    const subtextColor = "hsl(var(--muted-foreground))";
    const trackColor = "hsl(var(--muted) / 0.5)"; // More visible in both themes

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        formatter: function() {
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
          
          return `<div style="padding: 8px;">
            <div style="font-weight: 600; margin-bottom: 4px;">${formatFieldName(gaugeData.fieldName)}</div>
            <div style="font-size: 20px; font-weight: 300;">${formattedValue}${gaugeUnit ? ' ' + gaugeUnit : ''}</div>
          </div>`;
        },
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        borderColor: "transparent",
        textStyle: {
          color: "#fff",
        },
      },
      series: [
        {
          type: "gauge",
          startAngle: 200,
          endAngle: -20,
          min: 0,
          max: 100,
          center: ["50%", "55%"],
          radius: "80%",
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
              // Show 0-100 on the gauge
              return value.toString();
            },
          },
          pointer: {
            show: true,
            width: 6,
            length: "70%",
            offsetCenter: [0, "-5%"],
            itemStyle: {
              color: progressGradient.colorStops[0].color,
              borderColor: progressGradient.colorStops[0].color,
              borderWidth: 1,
              shadowBlur: 8,
              shadowColor: "rgba(0, 0, 0, 0.3)",
            },
          },
          anchor: {
            show: true,
            showAbove: true,
            size: 20,
            itemStyle: {
              color: progressGradient.colorStops[0].color,
              borderWidth: 8,
              borderColor: "hsl(var(--background))",
              shadowBlur: 10,
              shadowColor: "rgba(0, 0, 0, 0.2)",
            },
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
              value: clampedValue,
            },
          ],
        },
      ],
      graphic: [
        {
          type: "text",
          left: "center",
          bottom: "20%",
          style: {
            text: formatFieldName(gaugeData.fieldName),
            textAlign: "center",
            fontSize: 16,
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

    // Check if we have a single record with multiple numeric fields
    if (data.length === 1) {
      const firstRecord = data[0];
      const fields = Object.keys(firstRecord);
      const numericFields = fields.filter((field) => {
        if (field === 'x' || field === 'y' || field === 'series') return false;
        const value = firstRecord[field];
        return (
          typeof value === "number" ||
          (typeof value === "string" && !isNaN(Number(value)))
        );
      });
      
      // If we have multiple numeric fields, create a gauge for each
      if (numericFields.length > 1) {
        return numericFields.map(field => {
          // Create a single-element array with just this field's data
          const fieldData = [{
            [field]: firstRecord[field],
            x: firstRecord.x,
            y: firstRecord[field],
            series: field
          }];
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
          <div
            key={label}
            className="border rounded-lg bg-card p-4 h-full"
          >
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
    const isStatData = data.length > 0 && data[0].x && typeof data[0].x === "string" && 
      ["current", "average", "min", "max"].includes(data[0].x);
    
    if (isStatData) {
      return false; // Stat data should show single gauge
    }

    // Check if we have a single record with multiple numeric fields
    if (data.length === 1) {
      const firstRecord = data[0];
      const fields = Object.keys(firstRecord);
      const numericFields = fields.filter((field) => {
        if (field === 'x' || field === 'y' || field === 'series') return false;
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

function adjustColorBrightness(color: string, percent: number): string {
  // Convert hex to RGB
  const num = parseInt(color.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = ((num >> 8) & 0x00ff) + amt;
  const B = (num & 0x0000ff) + amt;
  
  // Ensure values are within valid range
  const clamp = (val: number) => Math.max(0, Math.min(255, val));
  
  return (
    "#" +
    (
      0x1000000 +
      clamp(R) * 0x10000 +
      clamp(G) * 0x100 +
      clamp(B)
    )
      .toString(16)
      .slice(1)
  );
}

function formatFieldName(fieldName: string): string {
  // Handle function expressions like avg(temperature), sum(sales), etc.
  const functionMatch = fieldName.match(/^(\w+)\((.+)\)$/);
  if (functionMatch) {
    const [, func, field] = functionMatch;
    // Capitalize function name and format field
    const formattedFunc = func.charAt(0).toUpperCase() + func.slice(1);
    const formattedField = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    return `${formattedFunc} ${formattedField}`;
  }
  
  // Handle regular field names
  return fieldName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

export default withPanelWrapper(GaugePanel);
