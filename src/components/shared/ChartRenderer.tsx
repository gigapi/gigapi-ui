import { useMemo, useRef, useEffect, useState, memo } from "react";
import * as echarts from "echarts";
import { type PanelConfig, type NDJSONRecord } from "@/types/dashboard.types";
import { transformDataForPanel } from "@/lib/dashboard/data-transformers";

// Unified chart colors
const CHART_COLORS = [
  "#7EB26D",
  "#EAB839",
  "#6ED0E0",
  "#EF843C",
  "#E24D42",
  "#1F78C1",
  "#BA43A9",
  "#705DA0",
  "#A77BCA",
  "#FFB74D",
  "#FFB300",
  "#FF8C00",
  "#FF6F00",
  "#F4511E",
  "#C62828",
  "#AD1457",
  "#8E24AA",
];

interface ChartRendererProps {
  config: PanelConfig;
  data: NDJSONRecord[];
  isEditMode?: boolean;
  onTimeRangeUpdate?: (timeRange: any) => void;
  height?: string | number;
  width?: string | number;
}

function ChartRendererComponent({
  config,
  data,
  isEditMode = false,
  onTimeRangeUpdate,
  height = "100%",
  width = "100%",
}: ChartRendererProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  // Detect current theme
  const [isDarkMode, setIsDarkMode] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

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

  const transformedData = useMemo(() => {
    if (!data || data.length === 0) {
      return null;
    }
    const transformed = transformDataForPanel(data, config);
    return transformed;
  }, [data, config]);

  // Unified Grafana-style time formatter
  const formatTime = (timestamp: number | Date): string => {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };

  const chartOption = useMemo(() => {
    if (!transformedData || transformedData.data.length === 0) {
      return null;
    }

    const { data: chartData } = transformedData;
    const { type } = config;
    const fieldConfig = config.fieldConfig?.defaults || {};
    const options = config.options || {};

    // Common configuration
    const baseConfig = {
      backgroundColor: "transparent",
      animation: false,
      animationDuration: 0,
    };

    // Determine if this is time-based data
    const isTimeData =
      transformedData.metadata.timeRange !== undefined ||
      chartData.some(
        (point) =>
          point.x instanceof Date ||
          (typeof point.x === "number" && point.x > 1000000000)
      );

    // Group data by series for multi-series charts
    const seriesData = new Map<string, Array<[string | number, number]>>();
    chartData.forEach((point) => {
      const seriesName = point.series || "default";
      if (!seriesData.has(seriesName)) {
        seriesData.set(seriesName, []);
      }
      let xValue = point.x instanceof Date ? point.x.getTime() : point.x;
      
      // Handle string timestamps (from bar chart aggregation)
      if (typeof xValue === "string" && isTimeData) {
        const parsedTime = new Date(xValue).getTime();
        if (!isNaN(parsedTime)) {
          xValue = parsedTime;
        }
      }
      
      // Handle nanosecond timestamps
      if (typeof xValue === "number" && xValue > 32503680000000) {
        xValue = Math.floor(xValue / 1000000); // Convert nanoseconds to milliseconds
      }
      seriesData.get(seriesName)!.push([xValue, point.y]);
    });

    // Sort series entries for consistent ordering
    const sortedSeriesEntries = Array.from(seriesData.entries()).sort(
      ([nameA], [nameB]) => nameA.localeCompare(nameB)
    );

    // Create stable color mapping
    const seriesColorMap = new Map<string, string>();
    sortedSeriesEntries.forEach(([seriesName], index) => {
      seriesColorMap.set(seriesName, CHART_COLORS[index % CHART_COLORS.length]);
    });

    // Unified Grafana-style tooltip configuration
    const getUnifiedTooltip = () => {
      return {
        trigger: "axis" as const,
        confine: true,
        appendToBody: true, // Render tooltip in body to avoid z-index issues
        renderMode: "html", // Use HTML mode for better positioning
        position: function (point: number[], size: any) {
          // Handle undefined point parameter
          if (!point || !Array.isArray(point) || point.length < 2) {
            return [10, 10]; // Default position
          }
          
          // Handle undefined size parameter
          if (!size || !size.viewSize || !size.contentSize) {
            return [point[0] + 15, point[1] - 15]; // Simple offset
          }
          
          // Smart positioning to avoid blocking content
          const x = point[0];
          const y = point[1];
          const viewWidth = size.viewSize[0];
          const viewHeight = size.viewSize[1];
          const boxWidth = size.contentSize[0];
          const boxHeight = size.contentSize[1];

          // Position tooltip to avoid edges and blocking interaction
          let posX = x + 15;
          let posY = y - boxHeight - 15;

          // Adjust if tooltip would go off right edge
          if (posX + boxWidth > viewWidth) {
            posX = x - boxWidth - 15;
          }

          // Adjust if tooltip would go off top edge
          if (posY < 0) {
            posY = y + 15;
          }

          // Adjust if tooltip would go off bottom edge
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
        extraCssText: "z-index: 9999; pointer-events: none;", // High z-index and no pointer events
        axisPointer: {
          type: type === "bar" ? ("shadow" as const) : ("line" as const),
          snap: false,
          animation: false,
          label: {
            backgroundColor: isDarkMode ? "#525252" : "#d0d0d0",
            color: isDarkMode ? "#e0e0e0" : "#333333",
          },
        },
        formatter: (params: any) => {
          if (!Array.isArray(params)) params = [params];

          // Check for multi-series and do custom lookup if needed
          if (params.length === 1 && sortedSeriesEntries.length > 1) {
            const targetTime = params[0].value[0];
            const tolerance = 30000;
            const allSeriesData: any[] = [];

            sortedSeriesEntries.forEach(([seriesName, seriesDataPoints]) => {
              // Find closest data point
              let closestPoint = null;
              let minDistance = Infinity;

              seriesDataPoints.forEach((point: any) => {
                const distance = Math.abs(point[0] - targetTime);
                if (distance < minDistance && distance <= tolerance) {
                  minDistance = distance;
                  closestPoint = point;
                }
              });

              if (closestPoint) {
                allSeriesData.push({
                  seriesName: seriesName,
                  value: closestPoint,
                  color: seriesColorMap.get(seriesName),
                });
              }
            });

            if (allSeriesData.length > 1) {
              params = allSeriesData;
            }
          }

          // Format tooltip
          let time;
          if (isTimeData) {
            let timestamp = params[0].value[0];
            // Handle nanosecond timestamps
            if (timestamp > 32503680000000) {
              timestamp = Math.floor(timestamp / 1000000);
            }
            time = formatTime(timestamp);
          } else {
            time = params[0].value[0];
          }
          let tooltip = `<div style="margin-bottom: 6px;"><strong>${time}</strong></div>`;

          const orderedParams = [...params].sort((a, b) => {
            const nameA = a.seriesName || "";
            const nameB = b.seriesName || "";
            return nameA.localeCompare(nameB);
          });

          orderedParams.forEach((param: any) => {
            const seriesName = param.seriesName;
            // Skip hidden series
            if (hiddenSeries.has(seriesName)) return;

            const value = param.value[1];
            const color = param.color;
            const unit = fieldConfig?.unit || "";
            const decimals = fieldConfig?.decimals ?? 2;

            const marker = `<span style="display:inline-block;margin-right:8px;border-radius:50%;width:8px;height:8px;background-color:${color};"></span>`;
            tooltip += `<div style="margin: 2px 0;">${marker}<span style="color: ${color};">${seriesName}:</span> <strong>${value.toFixed(
              decimals
            )}${unit}</strong></div>`;
          });

          return tooltip;
        },
      };
    };

    // Chart-specific configurations
    switch (type) {
      case "pie":
      case "donut": {
        const categoryMap = new Map<string, number>();
        chartData.forEach((point) => {
          const category = String(point.x);
          const value = Number(point.y);
          categoryMap.set(category, (categoryMap.get(category) || 0) + value);
        });

        const pieData = Array.from(categoryMap.entries())
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);

        return {
          ...baseConfig,
          tooltip: {
            trigger: "item",
            confine: true,
            appendToBody: true, // Render tooltip in body for pie charts too
            renderMode: "html",
            backgroundColor: isDarkMode
              ? "rgba(30, 30, 30, 0.9)"
              : "rgba(255, 255, 255, 0.95)",
            borderWidth: 1,
            borderColor: isDarkMode ? "#525252" : "#d0d0d0",
            textStyle: {
              color: isDarkMode ? "#e0e0e0" : "#333333",
              fontSize: 12,
            },
            extraCssText: "z-index: 9999; pointer-events: none;", // High z-index and no pointer events
            formatter: (param: any) => {
              const unit = fieldConfig?.unit || "";
              const decimals = fieldConfig?.decimals ?? 2;
              const marker = `<span style="display:inline-block;margin-right:8px;border-radius:50%;width:8px;height:8px;background-color:${param.color};"></span>`;
              return `<div style="margin: 2px 0;">${marker}<span style="color: ${
                param.color
              };">${param.name}:</span> <strong>${param.value.toFixed(
                decimals
              )}${unit}</strong> (${param.percent}%)</div>`;
            },
          },
          legend: {
            show: options?.legend?.showLegend !== false,
            type: "scroll",
            orient:
              options?.legend?.placement === "right"
                ? "vertical"
                : "horizontal",
            right: options?.legend?.placement === "right" ? 0 : undefined,
            bottom: options?.legend?.placement !== "right" ? 0 : undefined,
            textStyle: {
              fontSize: 11,
              color: isDarkMode ? "#b0b0b0" : "#666666",
            },
            selectedMode: "multiple", // Enable interactive legend selection
            animation: true,
            animationDuration: 100,
          },
          series: [
            {
              type: "pie",
              radius: type === "donut" ? ["40%", "70%"] : "70%",
              center: ["50%", "50%"],
              data: pieData,
              color: CHART_COLORS,
              label: {
                show: true,
                fontSize: 11,
                color: isDarkMode ? "#b0b0b0" : "#666666",
                formatter: (params: any) => `${params.percent}%`,
              },
            },
          ],
        };
      }

      case "timeseries":
      case "line":
      case "area":
      case "bar":
      case "scatter": {
        // Determine chart type and styling
        let chartType = "line";
        let areaStyle: any = undefined;

        if (type === "bar") {
          chartType = "bar";
        } else if (type === "scatter") {
          chartType = "scatter";
        } else if (type === "area") {
          areaStyle = { opacity: fieldConfig?.custom?.fillOpacity || 0.1 };
        }

        // Create series configurations
        const chartSeries = sortedSeriesEntries.map(([name, data]) => {
          const seriesConfig: any = {
            name,
            type: chartType,
            data: data.sort((a, b) => (a[0] as number) - (b[0] as number)),
            smooth: fieldConfig?.custom?.lineInterpolation === "smooth",
            areaStyle,
            color: seriesColorMap.get(name),
            lineStyle: { width: fieldConfig?.custom?.lineWidth || 2 },
            symbol: chartType === "scatter" ? "circle" : "none",
            symbolSize: fieldConfig?.custom?.pointSize || 4,
            emphasis: {
              focus: "series", // Highlight the entire series on hover
              blurScope: "coordinateSystem", // Blur other series in the same coordinate system
            },
            blur: {
              lineStyle: {
                opacity: 0.25, // Make non-hovered series more transparent
              },
              itemStyle: {
                opacity: 0.25,
              },
            },
            tooltip: { show: true },
          };

          // Add bar-specific configuration
          if (chartType === "bar") {
            if (isTimeData) {
              // For time-based bars, use fixed width
              seriesConfig.barWidth = Math.min(20, 400 / data.length);
            } else {
              // For categorical bars, use percentage
              seriesConfig.barWidth =
                sortedSeriesEntries.length > 1 ? "30%" : "60%";
            }
          }

          return seriesConfig;
        });

        return {
          ...baseConfig,
          tooltip: getUnifiedTooltip(),
          legend: {
            show:
              sortedSeriesEntries.length > 1 &&
              options?.legend?.showLegend !== false,
            type: "scroll",
            orient:
              options?.legend?.placement === "right"
                ? "vertical"
                : "horizontal",
            bottom: options?.legend?.placement === "bottom" ? 0 : undefined,
            right: options?.legend?.placement === "right" ? 0 : undefined,
            textStyle: {
              fontSize: 12,
              color: isDarkMode ? "#b0b0b0" : "#666666",
            },
            selectedMode: "multiple", // Enable interactive legend selection
            animation: true,
            animationDuration: 100,
          },
          grid: {
            left: "3%",
            right: isTimeData && !isEditMode ? "8%" : "4%",
            bottom: sortedSeriesEntries.length > 1 ? "15%" : "8%",
            top: isTimeData && !isEditMode ? "12%" : "8%",
            containLabel: true,
          },
          xAxis: {
            type: isTimeData ? "time" : "category",
            boundaryGap: chartType === "bar",
            axisLine: {
              lineStyle: { color: isDarkMode ? "#424242" : "#e0e0e0" },
            },
            splitLine: {
              lineStyle: { color: isDarkMode ? "#2a2a2a" : "#f5f5f5" },
            },
            axisLabel: {
              fontSize: 11,
              color: isDarkMode ? "#b0b0b0" : "#666666",
              formatter: isTimeData
                ? (value: any) => {
                    // ECharts passes different value types for different chart types
                    let timestamp =
                      typeof value === "string"
                        ? new Date(value).getTime()
                        : value;

                    // Handle nanosecond timestamps (common in ClickHouse)
                    // If timestamp is larger than year 3000 in milliseconds, assume it's nanoseconds
                    if (timestamp > 32503680000000) {
                      timestamp = Math.floor(timestamp / 1000000); // Convert nanoseconds to milliseconds
                    }

                    const date = new Date(timestamp);

                    if (isNaN(date.getTime())) {
                      return value; // Fallback if parsing fails
                    }

                    const hours = String(date.getHours()).padStart(2, "0");
                    const minutes = String(date.getMinutes()).padStart(2, "0");
                    const seconds = String(date.getSeconds()).padStart(2, "0");

                    // Show date if span is more than a day
                    const xValues = chartData.map((d) => {
                      let val: number;
                      if (typeof d.x === "number") {
                        val = d.x;
                      } else if (d.x instanceof Date) {
                        val = d.x.getTime();
                      } else {
                        val = new Date(d.x).getTime();
                      }
                      // Handle nanosecond timestamps in data span calculation
                      if (val > 32503680000000) {
                        val = Math.floor(val / 1000000);
                      }
                      return val;
                    });
                    const dataSpan =
                      Math.max(...xValues) - Math.min(...xValues);

                    // Dynamic formatting based on data span
                    if (dataSpan > 24 * 60 * 60 * 1000) {
                      // More than a day - show date and time
                      const month = String(date.getMonth() + 1).padStart(2, "0");
                      const day = String(date.getDate()).padStart(2, "0");
                      return `${month}-${day} ${hours}:${minutes}`;
                    } else if (dataSpan > 2 * 60 * 60 * 1000) {
                      // More than 2 hours - show hours and minutes
                      return `${hours}:${minutes}`;
                    } else if (dataSpan > 10 * 60 * 1000) {
                      // More than 10 minutes - show hours, minutes, and seconds
                      return `${hours}:${minutes}:${seconds}`;
                    } else {
                      // Less than 10 minutes - show precise time with seconds
                      return `${hours}:${minutes}:${seconds}`;
                    }
                  }
                : undefined,
            },
          },
          yAxis: {
            type: "value",
            min: fieldConfig.min,
            max: fieldConfig.max,
            axisLine: {
              lineStyle: { color: isDarkMode ? "#424242" : "#e0e0e0" },
            },
            splitLine: {
              lineStyle: { color: isDarkMode ? "#2a2a2a" : "#f5f5f5" },
            },
            axisLabel: {
              fontSize: 11,
              color: isDarkMode ? "#b0b0b0" : "#666666",
              formatter: (value: number) => {
                const unit = fieldConfig.unit || "";
                const decimals = fieldConfig.decimals ?? 1;
                if (Math.abs(value) >= 1000000)
                  return (value / 1000000).toFixed(decimals) + "M" + unit;
                if (Math.abs(value) >= 1000)
                  return (value / 1000).toFixed(decimals) + "K" + unit;
                return value.toFixed(decimals) + unit;
              },
            },
          },
          series: chartSeries,
          // Time range selection for time series (brush)
          brush:
            isTimeData && !isEditMode && onTimeRangeUpdate
              ? {
                  brushMode: "lineX",
                  xAxisIndex: 0,
                  brushStyle: {
                    borderWidth: 1,
                    color: "rgba(59, 130, 246, 0.1)",
                    borderColor: "rgba(59, 130, 246, 0.4)",
                  },
                  removeOnClick: true,
                }
              : undefined,
          toolbox:
            isTimeData && !isEditMode && onTimeRangeUpdate
              ? {
                  show: true,
                  right: "8px",
                  top: "8px",
                  itemSize: 10,
                  feature: {
                    brush: {
                      type: ["lineX"],
                      title: {
                        lineX: "Select time range",
                      },
                    },
                  },
                  iconStyle: {
                    borderColor: isDarkMode ? "#666" : "#999",
                    color: isDarkMode ? "#999" : "#666",
                  },
                }
              : undefined,
          dataZoom: isTimeData
            ? [
                {
                  type: "inside",
                  xAxisIndex: 0,
                  filterMode: "filter",
                  disabled: isEditMode,
                },
              ]
            : undefined,
        };
      }

      default:
        return null;
    }
  }, [
    transformedData,
    config,
    isDarkMode,
    isEditMode,
    hiddenSeries,
    onTimeRangeUpdate,
  ]);

  // Initialize chart
  useEffect(() => {
    if (!chartRef.current) return;

    // Dispose existing instance if any
    if (chartInstance.current) {
      chartInstance.current.dispose();
    }

    try {
      chartInstance.current = echarts.init(chartRef.current, undefined, {
        renderer: "canvas",
        useDirtyRect: true, // Improve performance
      });

      // Ensure chart interactions are properly enabled
      chartInstance.current.getZr().on("click", () => {
        // This ensures click events propagate properly
      });
    } catch (error) {
      console.error("[ChartRenderer] Failed to initialize chart:", error);
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, []);

  // Update chart option
  useEffect(() => {
    if (!chartInstance.current || !chartOption) {
      if (!chartInstance.current) {
        console.warn("[ChartRenderer] Chart instance not available");
      }
      return;
    }

    try {
      // Use notMerge to ensure legend selection state is properly updated
      chartInstance.current.setOption(chartOption, {
        notMerge: false,
        lazyUpdate: true,
        replaceMerge: ["series"], // Replace series to avoid stale data
      });

      // Force refresh to ensure interactive elements work (delayed to avoid main process conflict)
      setTimeout(() => {
        if (chartInstance.current) {
          chartInstance.current.resize();
        }
      }, 0);
    } catch (error) {
      console.error("[ChartRenderer] Failed to set chart option:", error);
    }
  }, [chartOption]);

  // Handle legend selection events
  useEffect(() => {
    if (!chartInstance.current) return;

    const handleLegendSelectChanged = (params: any) => {
      const newHiddenSeries = new Set<string>();
      Object.entries(params.selected).forEach(([name, isSelected]) => {
        if (!isSelected) {
          newHiddenSeries.add(name);
        }
      });
      setHiddenSeries(newHiddenSeries);
    };

    chartInstance.current.on("legendselectchanged", handleLegendSelectChanged);

    return () => {
      chartInstance.current?.off(
        "legendselectchanged",
        handleLegendSelectChanged
      );
    };
  }, []);

  // Handle resize
  useEffect(() => {
    const resizeChart = () => {
      // Delay resize to avoid main process conflicts
      setTimeout(() => {
        chartInstance.current?.resize();
      }, 0);
    };

    const resizeObserver = new ResizeObserver(resizeChart);
    if (chartRef.current) {
      resizeObserver.observe(chartRef.current);
    }

    // Also resize on mount after a delay to ensure proper sizing
    const timeoutId = setTimeout(resizeChart, 100);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(timeoutId);
    };
  }, []);

  // Handle brush selection for time range updates
  useEffect(() => {
    if (!chartInstance.current || !onTimeRangeUpdate || isEditMode) return;

    const handleBrushEnd = (params: any) => {
      if (!params.areas || params.areas.length === 0) return;

      const brushArea = params.areas[0];
      if (!brushArea || !brushArea.coordRange) return;

      const [startTime, endTime] = brushArea.coordRange;

      // Convert timestamps to TimeRange format
      const timeRange = {
        type: "absolute" as const,
        from: new Date(startTime),
        to: new Date(endTime),
      };

      onTimeRangeUpdate(timeRange);

      // Clear the brush area after selection
      chartInstance.current?.dispatchAction({
        type: "brush",
        areas: [],
      });
    };

    chartInstance.current.on("brushEnd", handleBrushEnd);

    return () => {
      chartInstance.current?.off("brushEnd", handleBrushEnd);
    };
  }, [onTimeRangeUpdate, isEditMode]);

  if (!transformedData || transformedData.data.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full text-muted-foreground"
        style={{ height, width }}
      >
        <div className="text-center">
          <div className="text-sm">No data available</div>
          <div className="text-xs mt-1">Check your query and field mapping</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-hidden" style={{ width, height }}>
      <div
        ref={chartRef}
        className="w-full h-full"
        style={{
          minHeight: typeof height === "string" ? height : `${height}px`,
          height: "100%",
          width: "100%",
        }}
      />
    </div>
  );
}

// Memoize the component to prevent unnecessary re-renders
export const ChartRenderer = memo(
  ChartRendererComponent,
  (prevProps, nextProps) => {
    // Custom comparison function to optimize re-renders
    return (
      prevProps.config.id === nextProps.config.id &&
      prevProps.config.query === nextProps.config.query &&
      prevProps.data === nextProps.data &&
      prevProps.isEditMode === nextProps.isEditMode &&
      prevProps.height === nextProps.height &&
      prevProps.width === nextProps.width &&
      JSON.stringify(prevProps.config.fieldMapping) ===
        JSON.stringify(nextProps.config.fieldMapping) &&
      JSON.stringify(prevProps.config.options) ===
        JSON.stringify(nextProps.config.options)
    );
  }
);
