import React, { useRef, useEffect, useState } from "react";
import * as echarts from "echarts";
import { cn } from "@/lib/utils";
import { useTheme } from "../theme-provider";
import { isDateTimeField, isTimestamp, isDateString } from "@/lib/date-utils";
import { format, parseISO, isValid } from "date-fns";

// Helper utilities for handling the query result format
const extractQueryResults = (data: any): Record<string, any>[] => {
  // Handle case where data is in { results: [...] } format
  if (data?.results && Array.isArray(data.results)) {
    return data.results;
  }
  
  // Handle case where data is already an array
  if (Array.isArray(data)) {
    return data;
  }
  
  // Handle empty or invalid data
  return [];
};

// Helper to safely extract numeric values from possibly complex/JSON fields
const extractNumericValue = (value: any): number | null => {
  if (value === null || value === undefined) return null;
  
  // For simple number types
  if (typeof value === 'number') return value;
  
  // For string numbers that don't look like complex data
  if (typeof value === 'string') {
    // If not a complex JSON string, try to parse it as a number
    if (!value.includes('{') && !value.includes('[')) {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) return parsed;
    } else {
      try {
        // Try to parse as JSON if it looks like JSON
        const jsonObj = JSON.parse(value);
        
        // Handle common patterns in data
        if (jsonObj && typeof jsonObj === 'object') {
          // Check for various possible paths to a numeric value
          const numericPaths = [
            // Direct value properties
            ['value'],
            ['parsed', 'value'],
            ['parsed'],
            
            // Common metric names
            ['count'],
            ['total'],
            ['size'],
            ['length'],
            ['quantity'],
            ['amount'],
            
            // Try to find any top-level numeric property
            ...Object.keys(jsonObj).map(key => [key])
          ];
          
          // Try each path
          for (const path of numericPaths) {
            let current: any = jsonObj;
            let valid = true;
            
            // Navigate the path
            for (let i = 0; i < path.length; i++) {
              if (current === undefined || current === null) {
                valid = false;
                break;
              }
              current = current[path[i]];
            }
            
            // If we got a valid number at the end of the path, return it
            if (valid && typeof current === 'number') {
              return current;
            }
            // If it's a string that can be converted to a number
            if (valid && typeof current === 'string' && !isNaN(Number(current))) {
              return Number(current);
            }
          }
          
          // Try to parse key-value pairs in raw string format (common in logs/stats)
          if (typeof jsonObj.raw === 'string' && jsonObj.raw.includes('=')) {
            const pairs = jsonObj.raw.includes(';') 
              ? jsonObj.raw.split(';') 
              : jsonObj.raw.split(',');
            
            for (const pair of pairs) {
              const [, val] = pair.split('=');
              if (val && !isNaN(Number(val.trim())) && val.trim() !== '-') {
                return Number(val.trim());
              }
            }
          }
        }
      } catch (e) {
        // Parsing failed, not a valid JSON string
      }
    }
  }
  
  // Handle non-string objects (direct value access)
  if (typeof value === 'object' && value !== null) {
    // Common patterns to check for numeric values
    const checkPaths = [
      // Direct value properties
      ['value'],
      ['parsed', 'value'],
      ['parsed'],
      
      // Common values in data structures
      ['count'],
      ['size'],
      ['length'],
      ['total'],
      ['amount']
    ];
    
    // Try each path
    for (const path of checkPaths) {
      let current: any = value;
      let valid = true;
      
      // Navigate the path
      for (let i = 0; i < path.length; i++) {
        if (current === undefined || current === null) {
          valid = false;
          break;
        }
        current = current[path[i]];
      }
      
      // If we got a valid number at the end of the path, return it
      if (valid && typeof current === 'number') {
        return current;
      }
    }
    
    // Fallback: try to find any numeric property
    for (const key in value) {
      if (typeof value[key] === 'number') {
        return value[key];
      }
      else if (typeof value[key] === 'string' && !isNaN(Number(value[key]))) {
        return Number(value[key]);
      }
    }
  }
  
  return null;
};

// Helper to intelligently extract string value from complex fields
const extractStringValue = (value: any): string | null => {
  if (value === null || value === undefined) return null;
  
  // For simple types
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  
  // Handle string values
  if (typeof value === 'string') {
    // If it's not a JSON string, return as is
    if (!value.includes('{') && !value.includes('[')) {
      return value;
    }
    // Try to parse JSON
    try {
      const parsed = JSON.parse(value);
      return extractStringFromParsedJson(parsed);
    } catch (e) {
      // If parsing fails, return the original string
      return value;
    }
  }
  
  // If it's already an object, extract a string representation
  if (typeof value === 'object' && value !== null) {
    return extractStringFromParsedJson(value);
  }
  
  return String(value);
};

// Helper function to extract meaningful string from parsed JSON objects
const extractStringFromParsedJson = (obj: any): string => {
  if (obj === null || obj === undefined) return '';
  
  // Start with common patterns
  if (typeof obj === 'object') {
    // Collection of common fields to check for string values
    const stringPaths = [
      // Common direct fields
      ['raw'],
      ['value'],
      ['name'],
      ['label'],
      ['text'],
      ['description'],
      ['title'],
      ['id'],
      
      // Nested fields
      ['parsed', 'value'],
      ['parsed', 'method'],
      ['uri', '_user'],
      ['parsed', 'uri', '_user'],
    ];
    
    // Try each path
    for (const path of stringPaths) {
      let current: any = obj;
      let valid = true;
      
      // Navigate the path
      for (let i = 0; i < path.length; i++) {
        if (current === undefined || current === null || typeof current !== 'object') {
          valid = false;
          break;
        }
        current = current[path[i]];
      }
      
      // If we found a string value, return it
      if (valid && typeof current === 'string') {
        return current;
      }
    }
    
    // Try to find the first string property that's not a technical field
    for (const key in obj) {
      if (typeof obj[key] === 'string' && 
          !['tag', 'branch', 'type', 'id'].includes(key)) {
        return obj[key];
      }
    }
    
    // For protocol structures, try to format in a readable way
    if (obj.protocol && obj.host) {
      return `${obj.protocol}/${obj.transport || ''} ${obj.host}:${obj.port || ''}`;
    }
    if (obj.method && obj.value !== undefined) {
      return `${obj.value} ${obj.method}`;
    }
    
    // Fallback to JSON string
    return JSON.stringify(obj);
  }
  
  return String(obj);
};

// Enhance timestamp handling with additional functions
const isMicrosecondTimestamp = (value: string | number): boolean => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  return !isNaN(numValue) && numValue > 1000000000000 && numValue < 10000000000000000;
};

const isNanosecondTimestamp = (value: string | number): boolean => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  return !isNaN(numValue) && numValue >= 10000000000000000;
};


export type GigChartConfig = {
  title?: string;
  legend?: boolean | echarts.LegendComponentOption;
  grid?: echarts.GridComponentOption;
  tooltip?: boolean | echarts.TooltipComponentOption;
  toolbox?: boolean | echarts.ToolboxComponentOption;
  dataZoom?: boolean | echarts.DataZoomComponentOption[];
  xAxis?: echarts.XAXisComponentOption;
  yAxis?: echarts.YAXisComponentOption;
  series?: echarts.SeriesOption[];
  dataset?: {
    source: any[];
    dimensions?: string[];
  };
  theme?: "light" | "dark";
  fieldInfo?: {
    xIsDateTime?: boolean;
    xField?: string;
    yFields?: string[];
    autoColors?: boolean;
    timestampScale?: 'second' | 'millisecond' | 'microsecond' | 'nanosecond';
  };
  // Add showArea option for line charts
  showArea?: boolean;
  // Add forceHorizontal option
  forceHorizontal?: boolean;
};

export type GigChartProps = {
  className?: string;
  style?: React.CSSProperties;
  config: GigChartConfig;
  onEvents?: Record<string, (params?: any) => void>;
};

// Define chart colors that work well with both light and dark themes
const CHART_COLORS = {
  light: [
    "#2563eb", // Primary blue
    "#10b981", // Green 
    "#f97316", // Orange
    "#8b5cf6", // Purple
    "#f59e0b", // Yellow
    "#ef4444", // Red
    "#0ea5e9", // Sky
    "#14b8a6", // Teal
    "#6366f1", // Indigo
    "#ec4899", // Pink
    "#84cc16", // Lime
    "#06b6d4", // Cyan
  ],
  dark: [
    "#3b82f6", // Brighter blue
    "#34d399", // Brighter green
    "#fb923c", // Brighter orange
    "#a78bfa", // Brighter purple
    "#fbbf24", // Brighter yellow
    "#f87171", // Brighter red
    "#38bdf8", // Brighter sky
    "#2dd4bf", // Brighter teal
    "#818cf8", // Brighter indigo
    "#f472b6", // Brighter pink
    "#a3e635", // Brighter lime
    "#22d3ee", // Brighter cyan
  ],
};

export const GigChart: React.FC<GigChartProps> = ({
  className,
  style,
  config,
  onEvents = {},
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const [chart, setChart] = useState<echarts.ECharts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useTheme();
  
  // Theme-based colors
  const currentTheme = config.theme || theme || "light";
  const colors = CHART_COLORS[currentTheme as keyof typeof CHART_COLORS];

  // Initialize and handle resize
  useEffect(() => {
    if (!chartRef.current) return;

    // Get proper theme
    const echartsTheme = currentTheme === 'dark' ? {
      backgroundColor: 'transparent',
      textStyle: {
        color: 'rgba(255, 255, 255, 0.85)'
      },
      axisPointer: {
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.3)'
        },
        crossStyle: {
          color: 'rgba(255, 255, 255, 0.3)'
        },
        label: {
          backgroundColor: '#404040'
        }
      },
    } : undefined;

    // Initialize the chart
    try {
      const newChart = echarts.init(chartRef.current, echartsTheme);
      setChart(newChart);
      setError(null);

      // Create resize observer for responsive behavior
      const resizeObserver = new ResizeObserver(() => {
        newChart.resize();
      });
      
      resizeObserver.observe(chartRef.current);

      // Additional window resize handler
      const handleResize = () => {
        newChart.resize();
      };
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        resizeObserver.disconnect();
        newChart.dispose();
      };
    } catch (err) {
      console.error("Error initializing chart:", err);
      setError(`Error initializing chart: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }, [currentTheme]);

  // Update chart options
  useEffect(() => {
    if (!chart) return;
    if (error) setError(null); // Reset error on config change
    
    try {
      // Handle X-axis formatter for datetime values
      let enhancedXAxis = config.xAxis;

      // Apply datetime formatting to X-axis if needed
      if (config.fieldInfo?.xIsDateTime && config.xAxis) {
        enhancedXAxis = {
          ...config.xAxis,
          type: 'time',
          axisLabel: {
            ...(config.xAxis.axisLabel || {}),
            rotate: 30, // Slightly rotate labels to prevent overlap
            margin: 12,
            formatter: (value: number | string) => {
              try {
                // If it's a timestamp number, convert to date
                if (typeof value === 'number') {
                  const date = new Date(value);
                  if (!isNaN(date.getTime())) {
                    return format(date, 'MMM d, HH:mm');
                  }
                }

                // If it's an ISO string, parse it directly
                if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
                  try {
                    const date = parseISO(value);
                    if (isValid(date)) {
                      return format(date, 'MMM d, HH:mm');
                    }
                  } catch (e) {
                    // Fall back to default formatting if parseISO fails
                  }
                }
                
                return String(value);
              } catch (e) {
                return String(value);
              }
            }
          },
          // Set proper time scale settings
          minInterval: 3600 * 1000, // minimum interval of 1 hour
          splitNumber: 6 // Limit the number of axis ticks to avoid crowding
        };
      }

      // Enhanced tooltip formatter that handles dates
      let enhancedTooltip: any = config.tooltip;
      
      if (config.tooltip) {
        enhancedTooltip = {
          ...(typeof config.tooltip === 'object' ? config.tooltip : {}),
          trigger: 'axis',
          axisPointer: {
            type: 'cross',
            label: {
              backgroundColor: colors[0]
            }
          },
          backgroundColor: currentTheme === 'dark' ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.95)',
          borderColor: currentTheme === 'dark' ? 'rgba(70, 70, 70, 0.9)' : 'rgba(200, 200, 200, 0.95)',
          textStyle: {
            color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)'
          },
          padding: [8, 12],
          extraCssText: 'box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);',
          formatter: (params: any) => {
            if (Array.isArray(params)) {
              // Handle axis tooltip (multiple series)
              const firstParam = params[0];
              let header = '';
              
              // Format x-axis value for header if it's a date field
              if (config.fieldInfo?.xIsDateTime && firstParam.axisValue) {
                try {
                  // Handle ISO date string
                  if (typeof firstParam.axisValue === 'string' && firstParam.axisValue.match(/^\d{4}-\d{2}-\d{2}T/)) {
                    try {
                      const date = parseISO(firstParam.axisValue);
                      if (isValid(date)) {
                        header = `<div style="font-weight:bold;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid ${currentTheme === 'dark' ? 'rgba(100, 100, 100, 0.8)' : 'rgba(220, 220, 220, 0.8)'}">${format(date, 'PPp')}</div>`;
                      } else {
                        header = `<div style="font-weight:bold;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid ${currentTheme === 'dark' ? 'rgba(100, 100, 100, 0.8)' : 'rgba(220, 220, 220, 0.8)'}">${firstParam.axisValue}</div>`;
                      }
                    } catch (e) {
                      header = `<div style="font-weight:bold;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid ${currentTheme === 'dark' ? 'rgba(100, 100, 100, 0.8)' : 'rgba(220, 220, 220, 0.8)'}">${firstParam.axisValue}</div>`;
                    }
                  } 
                  // Handle timestamp number
                  else if (typeof firstParam.axisValue === 'number') {
                    const date = new Date(firstParam.axisValue);
                    if (!isNaN(date.getTime())) {
                      header = `<div style="font-weight:bold;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid ${currentTheme === 'dark' ? 'rgba(100, 100, 100, 0.8)' : 'rgba(220, 220, 220, 0.8)'}">${format(date, 'PPp')}</div>`;
                    } else {
                      header = `<div style="font-weight:bold;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid ${currentTheme === 'dark' ? 'rgba(100, 100, 100, 0.8)' : 'rgba(220, 220, 220, 0.8)'}">${firstParam.axisValue}</div>`;
                    }
                  } else {
                    header = `<div style="font-weight:bold;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid ${currentTheme === 'dark' ? 'rgba(100, 100, 100, 0.8)' : 'rgba(220, 220, 220, 0.8)'}">${firstParam.axisValue}</div>`;
                  }
                } catch (e) {
                  header = `<div style="font-weight:bold;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid ${currentTheme === 'dark' ? 'rgba(100, 100, 100, 0.8)' : 'rgba(220, 220, 220, 0.8)'}">${firstParam.axisValue}</div>`;
                }
              } else if (firstParam.axisValue) {
                header = `<div style="font-weight:bold;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid ${currentTheme === 'dark' ? 'rgba(100, 100, 100, 0.8)' : 'rgba(220, 220, 220, 0.8)'}">${firstParam.axisValue}</div>`;
              }
              
              // Get total value for stacked bars
              let total = 0;
              const hasValues = params.some((p: any) => !isNaN(parseFloat(p.value)));
              
              if (hasValues) {
                // If we have multiple series (stacked values)
                if (params.length > 1) {
                  params.forEach((p: any) => {
                    const value = typeof p.value === 'number' 
                      ? p.value 
                      : (Array.isArray(p.value) ? p.value[1] : parseFloat(p.value));
                    if (!isNaN(value)) {
                      total += value;
                    }
                  });
                }
              }
              
              // Show items with values
              const items = params.map((param: any) => {
                const marker = `<span style="display:inline-block;margin-right:6px;border-radius:50%;width:10px;height:10px;background-color:${param.color};"></span>`;
                let displayValue;
                
                if (Array.isArray(param.value)) {
                  // For custom data formats like [x, y]
                  displayValue = typeof param.value[1] === 'number' ? param.value[1].toLocaleString() : param.value[1] ?? 'N/A';
                } else {
                  // For standard value
                  displayValue = typeof param.value === 'number' ? param.value.toLocaleString() : (param.value ?? 'N/A');
                }
                
                return `<div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">
                  <span>${marker}${param.seriesName || ''}</span>
                  <span style="font-weight:bold;margin-left:24px">${displayValue}</span>
                </div>`;
              }).join('');
              
              // Add total if we have multiple series
              const totalSection = hasValues && params.length > 1 ? 
                `<div style="margin-top:8px;padding-top:6px;border-top:1px dashed ${currentTheme === 'dark' ? 'rgba(100, 100, 100, 0.5)' : 'rgba(200, 200, 200, 0.8)'}">
                  <div style="display:flex;align-items:center;justify-content:space-between;">
                    <span style="font-weight:bold">Total</span>
                    <span style="font-weight:bold;margin-left:24px">${total.toLocaleString()}</span>
                  </div>
                </div>` : '';
              
              return `${header}${items}${totalSection}`;
            }
            return '';
          }
        };
      }

      // Element heights and spacings (in pixels)
      const ELEMENT_SPACING = 15; // Space between elements
      const LEGEND_HEIGHT = 30;
      const DATAZOOM_HEIGHT = 30;
      const EDGE_PADDING = 15;  // Increased padding from edges
      const DATAZOOM_TOP_MARGIN = 20; // New margin between chart and zoom control

      // Calculate layout based on components present
      const hasLegend = config.legend;
      const hasDataZoom = config.dataZoom;
      
      // Add title if provided
      let title = undefined;
      if (config.title) {
        title = {
          text: config.title,
          left: 'center',
          top: 10,
          textStyle: {
            fontSize: 14,
            color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)'
          }
        };
      }
      
      // Determine grid spacing with improved margins
      let gridBottom = EDGE_PADDING + DATAZOOM_TOP_MARGIN; // Add extra margin above zoom control
      let gridTop = hasLegend ? LEGEND_HEIGHT + ELEMENT_SPACING + EDGE_PADDING : EDGE_PADDING;
      
      // Add extra space for title if present
      if (config.title) {
        gridTop += 30; // Add space for title
      }
      
      if (hasDataZoom) {
        gridBottom += DATAZOOM_HEIGHT + ELEMENT_SPACING;
      }
      
      // Position elements
      // DataZoom component is always at the bottom when present
      const dataZoomBottom = EDGE_PADDING;
      
      // Enhanced grid with better padding for responsive layout
      const enhancedGrid = {
        left: '5%',
        right: '5%',
        bottom: gridBottom,
        top: gridTop,
        containLabel: true,
        ...(config.grid || {})
      };

      // Modify bar chart series config for time series data
      const enhancedSeries = config.series?.map(series => {
        if (series.type === 'bar' && config.fieldInfo?.xIsDateTime) {
          return {
            ...series,
            barWidth: '50%',  // More appropriate width for temporal data
            barMaxWidth: 40,  // Set a max width for better scaling
            barGap: '30%',    // More spacing between bars
            large: true,      // Enable large data mode for performance
            encode: {         // Ensure proper encoding of data dimensions
              x: 0,           // First dimension (timestamp)
              y: 1            // Second dimension (value)
            },
            // Better item styling
            itemStyle: {
              ...series.itemStyle,
              borderRadius: [3, 3, 0, 0]
            }
          };
        }
        return series;
      });
      
      // Prepare the final options with our enhanced components
      const options: echarts.EChartsOption = {
        color: colors,
        backgroundColor: 'transparent',
        title: title,
        legend: typeof config.legend === 'object' ? config.legend : config.legend ? { 
          type: "scroll", 
          orient: "horizontal", 
          top: config.title ? 25 : 10, // Adjust position if title exists
          left: 'center', // Center the legend
          textStyle: {
            color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)'
          },
          width: '60%', // Reduced width to prevent overlap with toolbox
          selected: {} // Will be auto-populated
        } : undefined,
        grid: enhancedGrid,
        tooltip: enhancedTooltip,
        toolbox: config.toolbox ? {
          show: true,
          feature: {
            saveAsImage: { show: true, name: `chart-${new Date().toISOString().split('T')[0]}`, title: 'Save' },
            dataZoom: { show: true, title: { zoom: 'Zoom', back: 'Reset Zoom' } },
            restore: { show: true, title: 'Reset' },
          },
          right: "15px",
          top: "15px",
          itemSize: 17, // Make the icons a bit larger
          itemGap: 10, // Add more spacing between tools
          iconStyle: {
            borderColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)',
            borderWidth: 1,
          },
          emphasis: {
            iconStyle: {
              borderColor: colors[0]
            }
          }
        } : undefined,
        dataZoom: config.dataZoom ? (
          Array.isArray(config.dataZoom) ? config.dataZoom : [
            {
              type: "inside",
              start: 0,
              end: 100,
              zoomLock: false
            },
            {
              type: "slider",
              start: 0,
              end: 100,
              height: DATAZOOM_HEIGHT,
              bottom: dataZoomBottom,
              borderColor: 'transparent',
              backgroundColor: currentTheme === 'dark' ? 'rgba(50, 50, 50, 0.3)' : 'rgba(240, 240, 240, 0.5)',
              fillerColor: colors[0] + '20', // Add high transparency
              handleStyle: {
                color: colors[0],
                borderColor: colors[0]
              },
              moveHandleStyle: {
                color: colors[0]
              },
              dataBackground: {
                lineStyle: {
                  color: currentTheme === 'dark' ? 'rgba(120, 120, 120, 0.5)' : 'rgba(180, 180, 180, 0.5)'
                },
                areaStyle: {
                  color: currentTheme === 'dark' ? 'rgba(80, 80, 80, 0.3)' : 'rgba(200, 200, 200, 0.3)'
                }
              },
              selectedDataBackground: {
                lineStyle: {
                  color: colors[0]
                },
                areaStyle: {
                  color: colors[0] + '40' // Add transparency
                }
              },
              textStyle: {
                color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)'
              },
              brushSelect: false, // Disable range selection with mouse drag
              handleSize: '100%', // Increase handle size
              showDetail: true, // Show detail tooltip when hovering handle
              showDataShadow: true, // Show data shadow
              realtime: true, // Update chart in realtime
              zoomLock: false, // Allow zooming
              throttle: 100 // Throttle for performance
            }
          ]
        ) : undefined,
        xAxis: enhancedXAxis,
        yAxis: {
          ...(config.yAxis || {}),
          axisLine: {
            lineStyle: {
              color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)'
            }
          },
          splitLine: {
            lineStyle: {
              color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'
            }
          },
          axisLabel: {
            color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.65)' : 'rgba(0, 0, 0, 0.65)',
            fontSize: 12, // Slightly larger for better readability
            formatter: (value: number) => {
              // Format numbers with thousand separators
              return value.toLocaleString();
            }
          }
        },
        series: enhancedSeries || config.series?.map(series => {
          if (series.type === 'line') {
            return {
              ...series,
              symbolSize: 6, // Larger symbols for better touch targets
              emphasis: {
                itemStyle: {
                  shadowBlur: 10,
                  shadowColor: 'rgba(0, 0, 0, 0.3)'
                }
              }
            };
          }
          return series;
        }),
        dataset: config.dataset ? {
          source: config.dataset.source,
          dimensions: config.dataset.dimensions
        } : undefined,
      };

      // Set options and render chart
      chart.setOption(options, true);

      // Bind events
      Object.entries(onEvents).forEach(([eventName, callback]) => {
        chart.on(eventName, callback);
      });

      // Return unregistering events
      return () => {
        Object.keys(onEvents).forEach((eventName) => {
          chart?.off(eventName);
        });
      };
    } catch (err) {
      console.error("Error rendering chart:", err);
      setError(`Error rendering chart: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [chart, config, colors, onEvents, currentTheme]);

  // Display error if chart fails to render
  if (error) {
    return (
      <div 
        className={cn("w-full min-h-[300px] flex flex-col items-center justify-center rounded-md shadow-sm", className)}
        style={{
          ...style, 
          minHeight: '300px', 
          backgroundColor: currentTheme === 'dark' ? 'rgba(30, 30, 30, 0.3)' : 'rgba(250, 250, 250, 0.5)',
          backdropFilter: 'blur(10px)',
          padding: '1rem'
        }}
      >
        <div className="text-red-500 font-semibold mb-2">Chart Error</div>
        <div className="text-sm text-center p-4 max-w-md bg-red-100 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800/30">
          {error}
        </div>
        <button 
          className="mt-4 px-4 py-2 bg-primary text-primary-foreground text-sm rounded hover:bg-primary/90 transition-colors"
          onClick={() => window.location.reload()}
        >
          Reload Page
        </button>
      </div>
    );
  }

  return (
    <div 
      ref={chartRef}
      className={cn("w-full min-h-[300px] md:min-h-[350px] lg:min-h-[400px] h-full rounded-md shadow-sm", className)}
      style={{
        ...style, 
        minHeight: '300px', 
        backgroundColor: currentTheme === 'dark' ? 'rgba(30, 30, 30, 0.3)' : 'rgba(250, 250, 250, 0.5)',
        backdropFilter: 'blur(10px)',
        padding: '1rem'
      }}
    />
  );
};

// Add a utility function to check if a string is an ISO date string
const isISODateString = (value: string): boolean => {
  // This regex matches ISO date strings like "2025-04-21T00:00:00Z"
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
};


// Enhance the helper function to detect time fields more broadly
function detectTimeField(data: Record<string, any>[], field: string): boolean {
  // Special case for timestamp fields with known names
  if (field === "__timestamp" || field === "time" || field === "timestamp") return true;
  
  // Check field name first
  if (isDateTimeField(field)) return true;
  
  // Check sample values
  const sampleSize = Math.min(10, data.length);
  let dateValueCount = 0;
  
  for (let i = 0; i < sampleSize; i++) {
    const value = data[i][field];
    if (value === null || value === undefined) continue;
    
    const strValue = String(value);
    
    // Check for large numbers that might be timestamps
    if (!isNaN(Number(strValue))) {
      const numValue = Number(strValue);
      // Check for timestamps in different scales
      if (
        (numValue > 1000000000 && numValue < 9999999999) || // Seconds (2001-2286)
        (numValue > 1000000000000 && numValue < 9999999999999) || // Milliseconds
        isMicrosecondTimestamp(numValue) || // Microseconds
        isNanosecondTimestamp(numValue) // Nanoseconds
      ) {
        dateValueCount++;
        continue;
      }
    }
    
    if (isTimestamp(strValue) || isDateString(strValue)) {
      dateValueCount++;
    }
  }
  
  // If majority of sample values are dates, consider it a date field
  return dateValueCount > sampleSize / 3; // Reduced threshold to detect more date fields
}

// Create chart configuration based on selected type and data
export const createBarChart = (
  data: any,
  xField: string,
  yField: string | string[],
  options: Partial<GigChartConfig> = {},
  customSeries?: any[]
): GigChartConfig => {
  // Process data to handle the results format
  const processedData = extractQueryResults(data);
  const yFields = Array.isArray(yField) ? yField : [yField];
  const xIsDateTime = detectTimeField(processedData, xField);
  
  // Special handling for timestamp fields
  const isTimestampField = xField === "__timestamp" || xField === "time" || xField.includes("timestamp");
  
  // Pre-process data to handle ISO date strings
  let formattedData = processedData.map(item => {
    const newItem = {...item};
    
    // If it's a timestamp or datetime field
    if (xIsDateTime) {
      try {
        const xValue = newItem[xField];
        
        // Handle string numeric timestamps
        if (typeof xValue === 'string' && !isNaN(Number(xValue)) && Number(xValue) > 1e9) {
          const numValue = Number(xValue);
          
          // Convert to proper ISO date based on scale
          if (numValue > 1e18) { // Nanoseconds
            newItem[xField] = new Date(Math.floor(numValue / 1000000)).toISOString();
          } else if (numValue > 1e15) { // Microseconds
            newItem[xField] = new Date(Math.floor(numValue / 1000)).toISOString();
          } else if (numValue > 1e12) { // Milliseconds
            newItem[xField] = new Date(numValue).toISOString();
          } else if (numValue > 1e9) { // Seconds
            newItem[xField] = new Date(numValue * 1000).toISOString();
          }
        } 
        // Handle ISO date strings
        else if (typeof xValue === 'string' && isISODateString(xValue)) {
          // Keep ISO format but ensure consistency for charting
          const date = new Date(xValue);
          if (!isNaN(date.getTime())) {
            newItem[xField] = date.toISOString();
          }
        }
      } catch (e) {
        // Just use the original if parsing fails
      }
    }
    
    // Make sure Y-axis values are numbers
    if (yFields.includes(xField) === false) {
      yFields.forEach(field => {
        if (typeof newItem[field] === 'string' && !isNaN(Number(newItem[field]))) {
          newItem[field] = Number(newItem[field]);
        } else if (newItem[field] === null || newItem[field] === undefined) {
          // Replace missing values with 0 for consistent display
          newItem[field] = 0;
        }
      });
    }
    
    return newItem;
  });
  
  // For date time data, ensure we sort the data for proper rendering
  if (xIsDateTime) {
    formattedData.sort((a, b) => {
      let valueA = a[xField];
      let valueB = b[xField];
      
      // Convert to dates for proper comparison
      if (typeof valueA === 'string') {
        try {
          valueA = new Date(valueA).getTime();
        } catch(e) {
          valueA = 0;
        }
      }
      
      if (typeof valueB === 'string') {
        try {
          valueB = new Date(valueB).getTime();
        } catch(e) {
          valueB = 0;
        }
      }
      
      return valueA - valueB;
    });
  }

  // Filter out categories with no data - this prevents empty bars/cluttered x-axis
  if (!xIsDateTime) {
    // Group data by x values and calculate totals
    const dataByCategory: Record<string, number> = {};
    formattedData.forEach(item => {
      const xValue = String(item[xField]);
      // Sum up all values across y fields
      let sum = 0;
      yFields.forEach(field => {
        const value = extractNumericValue(item[field]) || 0;
        sum += value;
      });
      dataByCategory[xValue] = (dataByCategory[xValue] || 0) + sum;
    });

    // Filter out categories with zero or very small values
    const filteredCategories = Object.keys(dataByCategory).filter(
      category => dataByCategory[category] > 0.01
    );

    // Only apply filtering if we'd be removing some categories but keeping at least a few
    if (filteredCategories.length > 0 && filteredCategories.length < Object.keys(dataByCategory).length * 0.9) {
      formattedData = formattedData.filter(item => 
        filteredCategories.includes(String(item[xField]))
      );
    }
  }
  
  // Calculate proper y-axis bounds - avoid large empty spaces and negative ranges if not needed
  let minY = 0;
  let maxY = 0;
  let hasNegativeValues = false;
  
  formattedData.forEach(item => {
    yFields.forEach(field => {
      const value = extractNumericValue(item[field]);
      if (value !== null) {
        if (value < 0) hasNegativeValues = true;
        maxY = Math.max(maxY, value);
        minY = Math.min(minY, value);
      }
    });
  });
  
  // Add padding to max value
  maxY = maxY * 1.1;
  
  // Set min value appropriately (start at 0 unless we have negative values)
  if (!hasNegativeValues) {
    minY = 0;
  } else {
    // Add some padding for negative values
    minY = minY * 1.1;
  }
  
  // If custom series data is provided (for grouped data), use that instead
  const series = customSeries || (xIsDateTime ? 
    yFields.map(field => ({
      name: field,
      type: "bar" as const,
      data: formattedData.map(item => {
        const value = extractNumericValue(item[field]) || 0;
        return [item[xField], value]; 
      }),
      label: {
        show: false,
        position: "top"
      },
      itemStyle: {
        borderRadius: [3, 3, 0, 0]
      },
      // Make sure bars are properly separated for time data
      barWidth: isTimestampField ? '70%' : '50%',
      barMaxWidth: 50, // Limit maximum width to ensure separation
      barGap: '10%', // Add gap between bars for multiple series
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.3)'
        }
      }
    })) : 
    // Regular category data (non-time series)
    yFields.map(field => ({
      name: field,
      type: "bar" as const,
      data: formattedData.map(item => extractNumericValue(item[field])),
      label: {
        show: false,
        position: "top"
      },
      itemStyle: {
        borderRadius: [3, 3, 0, 0]
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.3)'
        }
      }
    }))
  );

  // Determine if we should use horizontal bars based on explicit option only
  const shouldUseHorizontalBars = options.forceHorizontal === true;

  // Create horizontal bar chart configuration if needed
  if (shouldUseHorizontalBars) {
    // Swap axes for horizontal bars
    return {
      tooltip: true,
      legend: yFields.length > 1,
      grid: {
        left: "15%",  // More space for category labels
        right: "5%",
        bottom: "10%", 
        top: yFields.length > 1 ? "60px" : "40px",
        containLabel: true,
      },
      toolbox: {
        right: "20px",
        top: "20px",
        feature: {
          saveAsImage: { show: true },
          dataView: { show: true },
          magicType: { 
            show: true, 
            type: ['line', 'bar', 'stack'] 
          },
          restore: { show: true }
        }
      },
      // X and Y axes are flipped for horizontal bars
      yAxis: {
        type: 'category',
        data: [...new Set(formattedData.map(item => extractStringValue(item[xField])))],
        axisLabel: {
          fontSize: 12,
          width: 100,
          overflow: 'truncate'
        },
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: {
          fontSize: 12
        }
      } as echarts.YAXisComponentOption,
      xAxis: {
        type: "value",
        axisLabel: {
          formatter: (value: number) => {
            return value.toLocaleString();
          }
        },
        min: minY,
        max: maxY,
        splitLine: {
          show: true,
          lineStyle: {
            type: 'dashed',
            opacity: 0.2
          }
        }
      },
      series: yFields.map(field => ({
        name: field,
        type: "bar",
        data: formattedData.map(item => extractNumericValue(item[field])),
        label: {
          show: false,
          position: "right"
        },
        itemStyle: {
          borderRadius: [0, 3, 3, 0]  // Rounded corners on the right for horizontal bars
        },
        barWidth: '60%',  // Wider bars for better visibility
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.3)'
          }
        }
      })),
      fieldInfo: {
        xIsDateTime,
        xField,
        yFields,
        autoColors: true
      },
      ...options
    };
  }

  return {
    tooltip: true,
    legend: yFields.length > 1,
    grid: {
      left: shouldUseHorizontalBars ? "15%" : "5%",
      right: "5%",
      bottom: shouldUseHorizontalBars ? "10%" : "15%", 
      top: yFields.length > 1 ? "60px" : "50px",
      containLabel: true,
    },
    toolbox: {
      right: "20px",
      top: "20px",
      feature: {
        saveAsImage: { show: true },
        dataView: { show: true },
        magicType: { 
          show: true, 
          type: ['line', 'bar', 'stack'] 
        },
        restore: { show: true }
      }
    },
    xAxis: {
      type: xIsDateTime ? 'time' : 'category',
      axisLabel: { 
        fontSize: 12, 
        rotate: shouldUseHorizontalBars ? 0 : xIsDateTime ? 30 : 
          [...new Set(formattedData.map(item => item[xField]))].length > 5 ? 45 : 0,
        interval: shouldUseHorizontalBars ? 'auto' : 0, // Show all labels in horizontal mode
        formatter: xIsDateTime ? (value: any) => {
          // Format the time according to scale of data
          try {
            if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
              const date = parseISO(value);
              if (isValid(date)) {
                return format(date, 'MMM d, HH:mm');
              }
            } else if (typeof value === 'number') {
              const date = new Date(value);
              if (!isNaN(date.getTime())) {
                return format(date, 'MMM d, HH:mm');
              }
            }
          } catch (e) {
            console.warn("Error formatting date in axis label:", e);
          }
          return value;
        } : undefined
      },
      axisLine: {
        lineStyle: {
          width: 1
        }
      },
      // For time axis, don't pre-define data points
      data: xIsDateTime ? undefined : formattedData.map(item => extractStringValue(item[xField])),
      // Add proper time axis settings for bar charts
      splitArea: {
        show: false
      },
      splitLine: {
        show: xIsDateTime,
        lineStyle: {
          type: 'dashed',
          opacity: 0.2
        }
      },
      // Ensure time data is properly scaled
      min: xIsDateTime ? 'dataMin' : undefined,
      max: xIsDateTime ? 'dataMax' : undefined,
      // Improve labeling for time axis
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: {
        fontSize: 12
      },
      // Use horizontal orientation if we have many categories
      position: shouldUseHorizontalBars ? 'top' : 'bottom'
    } as echarts.XAXisComponentOption,
    yAxis: {
      type: "value",
      axisLabel: {
        // Add thousand separators to numbers
        formatter: (value: number) => {
          return value.toLocaleString();
        }
      },
      // Set bounds based on data
      min: minY,
      max: maxY,
      // Use horizontal orientation if we have many categories
      position: shouldUseHorizontalBars ? 'left' : 'right',
      // Add dynamic grid lines
      splitLine: {
        show: true,
        lineStyle: {
          type: 'dashed',
          opacity: 0.2
        }
      }
    } as echarts.YAXisComponentOption,
    series: series as echarts.SeriesOption[],
    fieldInfo: {
      xIsDateTime,
      xField,
      yFields,
      autoColors: true
    },
    ...options
  };
};

// Also update line and area chart functions with the same timestamp handling improvements
export const createLineChart = (
  data: any,
  xField: string,
  yField: string | string[],
  options: Partial<GigChartConfig> = {},
  customSeries?: any[]
): GigChartConfig => {
  // Process data to handle the results format
  const processedData = extractQueryResults(data);
  const yFields = Array.isArray(yField) ? yField : [yField];
  const xIsDateTime = detectTimeField(processedData, xField);
  
  // Special handling for timestamp fields
  const isTimestampField = xField === "__timestamp" || xField === "time" || xField.includes("timestamp");
  
  // Pre-process data to handle ISO date strings
  let formattedData = processedData.map(item => {
    const newItem = {...item};
    
    // If it's a timestamp or datetime field
    if (xIsDateTime) {
      try {
        const xValue = newItem[xField];
        
        // Handle string numeric timestamps
        if (typeof xValue === 'string' && !isNaN(Number(xValue)) && Number(xValue) > 1e9) {
          const numValue = Number(xValue);
          
          // Convert to proper ISO date based on scale
          if (numValue > 1e18) { // Nanoseconds
            newItem[xField] = new Date(Math.floor(numValue / 1000000)).toISOString();
          } else if (numValue > 1e15) { // Microseconds
            newItem[xField] = new Date(Math.floor(numValue / 1000)).toISOString();
          } else if (numValue > 1e12) { // Milliseconds
            newItem[xField] = new Date(numValue).toISOString();
          } else if (numValue > 1e9) { // Seconds
            newItem[xField] = new Date(numValue * 1000).toISOString();
          }
        } 
        // Handle ISO date strings
        else if (typeof xValue === 'string' && isISODateString(xValue)) {
          // Keep ISO format but ensure consistency for charting
          const date = new Date(xValue);
          if (!isNaN(date.getTime())) {
            newItem[xField] = date.toISOString();
          }
        }
      } catch (e) {
        // Just use the original if parsing fails
      }
    }
    
    // Make sure Y-axis values are numbers
    if (yFields.includes(xField) === false) {
      yFields.forEach(field => {
        if (typeof newItem[field] === 'string' && !isNaN(Number(newItem[field]))) {
          newItem[field] = Number(newItem[field]);
        } else if (newItem[field] === null || newItem[field] === undefined) {
          // Replace missing values with 0 for consistent display
          newItem[field] = 0;
        }
      });
    }
    
    return newItem;
  });
  
  // For date time data, ensure we sort the data for proper rendering
  if (xIsDateTime) {
    formattedData.sort((a, b) => {
      let valueA = a[xField];
      let valueB = b[xField];
      
      // Convert to dates for proper comparison
      if (typeof valueA === 'string') {
        try {
          valueA = new Date(valueA).getTime();
        } catch(e) {
          valueA = 0;
        }
      }
      
      if (typeof valueB === 'string') {
        try {
          valueB = new Date(valueB).getTime();
        } catch(e) {
          valueB = 0;
        }
      }
      
      return valueA - valueB;
    });
    
    // Remove duplicate time points by aggregating values
    if (formattedData.length > 1 && isTimestampField) {
      const aggregatedData: Record<string, any>[] = [];
      const timeMap = new Map<string, number[]>();
      
      // Group values by timestamp
      formattedData.forEach(item => {
        const timeKey = String(item[xField]);
        yFields.forEach(field => {
          const values = timeMap.get(timeKey) || [];
          const value = typeof item[field] === 'number' ? item[field] : 0;
          values.push(value);
          timeMap.set(`${timeKey}_${field}`, values);
        });
      });
      
      // Create new data points with aggregated values
      const timeKeys = Array.from(new Set(formattedData.map(item => String(item[xField]))));
      timeKeys.forEach(timeKey => {
        const newItem: Record<string, any> = { [xField]: timeKey };
        yFields.forEach(field => {
          const values = timeMap.get(`${timeKey}_${field}`) || [];
          // Use average for aggregation
          newItem[field] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        });
        aggregatedData.push(newItem);
      });
      
      // Replace with aggregated data if we have any
      if (aggregatedData.length > 0) {
        formattedData = aggregatedData;
      }
    }
  }
  
  // If custom series data is provided (for grouped data), use that instead
  const series = customSeries || (xIsDateTime ? 
    yFields.map(field => ({
      name: field,
      type: "line" as const,
      smooth: true,
      data: formattedData.map(item => {
        const value = extractNumericValue(item[field]) || 0;
        return [item[xField], value]; 
      }),
      // Line customization
      symbolSize: 6,
      symbol: 'circle',
      // Add area shading for time series
      areaStyle: options.showArea ? {
        opacity: 0.1
      } : undefined,
      lineStyle: {
        width: 2,
        cap: 'round'
      },
      emphasis: {
        focus: 'series',
        lineStyle: {
          width: 3
        }
      }
    })) : 
    // Regular category data (non-time series)
    yFields.map(field => ({
      name: field,
      type: "line" as const,
      smooth: true,
      data: formattedData.map(item => extractNumericValue(item[field])),
      // Line customization
      symbolSize: 6,
      symbol: 'circle',
      lineStyle: {
        width: 2,
        cap: 'round'
      },
      emphasis: {
        focus: 'series',
        lineStyle: {
          width: 3
        }
      }
    }))
  );

  return {
    tooltip: true,
    legend: yFields.length > 1,
    grid: {
      left: "5%",
      right: "5%",
      bottom: "15%", // Increased to give more space for zoom control
      top: yFields.length > 1 ? "60px" : "50px", // Increased top margin for legend and tools
      containLabel: true,
    },
    toolbox: {
      right: "20px",
      top: "20px",
    },
    xAxis: {
      type: xIsDateTime ? 'time' : 'category',
      axisLabel: { 
        fontSize: 12, 
        rotate: xIsDateTime ? 30 : 0,
      },
      axisLine: {
        lineStyle: {
          width: 1
        }
      },
      // For time axis, don't pre-define data points
      data: xIsDateTime ? undefined : formattedData.map(item => extractStringValue(item[xField])),
      splitLine: {
        show: xIsDateTime,
        lineStyle: {
          type: 'dashed',
          opacity: 0.2
        }
      }
    } as echarts.XAXisComponentOption,
    yAxis: {
      type: "value",
      axisLabel: {
        // Add thousand separators to numbers
        formatter: (value: number) => {
          return value.toLocaleString();
        }
      }
    } as echarts.YAXisComponentOption,
    series: series as echarts.SeriesOption[],
    fieldInfo: {
      xIsDateTime,
      xField,
      yFields,
      autoColors: true
    },
    ...options
  };
};

export const createAreaChart = (
  data: any,
  xField: string,
  yField: string | string[],
  options: Partial<GigChartConfig> = {},
  customSeries?: any[]
): GigChartConfig => {
  // Process data to handle the results format
  const processedData = extractQueryResults(data);
  const yFields = Array.isArray(yField) ? yField : [yField];
  const xIsDateTime = detectTimeField(processedData, xField);
  
  // Special handling for timestamp fields
  const isTimestampField = xField === "__timestamp" || xField === "time" || xField.includes("timestamp");
  
  // Pre-process data to handle ISO date strings
  let formattedData = processedData.map(item => {
    const newItem = {...item};
    
    // If it's a timestamp or datetime field
    if (xIsDateTime) {
      try {
        const xValue = newItem[xField];
        
        // Handle string numeric timestamps
        if (typeof xValue === 'string' && !isNaN(Number(xValue)) && Number(xValue) > 1e9) {
          const numValue = Number(xValue);
          
          // Convert to proper ISO date based on scale
          if (numValue > 1e18) { // Nanoseconds
            newItem[xField] = new Date(Math.floor(numValue / 1000000)).toISOString();
          } else if (numValue > 1e15) { // Microseconds
            newItem[xField] = new Date(Math.floor(numValue / 1000)).toISOString();
          } else if (numValue > 1e12) { // Milliseconds
            newItem[xField] = new Date(numValue).toISOString();
          } else if (numValue > 1e9) { // Seconds
            newItem[xField] = new Date(numValue * 1000).toISOString();
          }
        } 
        // Handle ISO date strings
        else if (typeof xValue === 'string' && isISODateString(xValue)) {
          // Keep ISO format but ensure consistency for charting
          const date = new Date(xValue);
          if (!isNaN(date.getTime())) {
            newItem[xField] = date.toISOString();
          }
        }
      } catch (e) {
        // Just use the original if parsing fails
      }
    }
    
    // Make sure Y-axis values are numbers
    if (yFields.includes(xField) === false) {
      yFields.forEach(field => {
        if (typeof newItem[field] === 'string' && !isNaN(Number(newItem[field]))) {
          newItem[field] = Number(newItem[field]);
        } else if (newItem[field] === null || newItem[field] === undefined) {
          // Replace missing values with 0 for consistent display
          newItem[field] = 0;
        }
      });
    }
    
    return newItem;
  });
  
  // For date time data, ensure we sort the data for proper rendering
  if (xIsDateTime) {
    formattedData.sort((a, b) => {
      let valueA = a[xField];
      let valueB = b[xField];
      
      // Convert to dates for proper comparison
      if (typeof valueA === 'string') {
        try {
          valueA = new Date(valueA).getTime();
        } catch(e) {
          valueA = 0;
        }
      }
      
      if (typeof valueB === 'string') {
        try {
          valueB = new Date(valueB).getTime();
        } catch(e) {
          valueB = 0;
        }
      }
      
      return valueA - valueB;
    });
    
    // Remove duplicate time points by aggregating values
    if (formattedData.length > 1 && isTimestampField) {
      const aggregatedData: Record<string, any>[] = [];
      const timeMap = new Map<string, number[]>();
      
      // Group values by timestamp
      formattedData.forEach(item => {
        const timeKey = String(item[xField]);
        yFields.forEach(field => {
          const values = timeMap.get(timeKey) || [];
          const value = typeof item[field] === 'number' ? item[field] : 0;
          values.push(value);
          timeMap.set(`${timeKey}_${field}`, values);
        });
      });
      
      // Create new data points with aggregated values
      const timeKeys = Array.from(new Set(formattedData.map(item => String(item[xField]))));
      timeKeys.forEach(timeKey => {
        const newItem: Record<string, any> = { [xField]: timeKey };
        yFields.forEach(field => {
          const values = timeMap.get(`${timeKey}_${field}`) || [];
          // Use average for aggregation
          newItem[field] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        });
        aggregatedData.push(newItem);
      });
      
      // Replace with aggregated data if we have any
      if (aggregatedData.length > 0) {
        formattedData = aggregatedData;
      }
    }
  }
  
  // Colors for area charts - used for gradients
  const chartColors = [
    'rgba(59, 130, 246, 0.8)', // blue
    'rgba(52, 211, 153, 0.8)', // green
    'rgba(251, 146, 60, 0.8)', // orange
    'rgba(167, 139, 250, 0.8)', // purple
    'rgba(251, 191, 36, 0.8)', // yellow
    'rgba(248, 113, 113, 0.8)', // red
    'rgba(56, 189, 248, 0.8)', // sky
    'rgba(45, 212, 191, 0.8)', // teal
    'rgba(129, 140, 248, 0.8)'  // indigo
  ];
  
  // If custom series data is provided (for grouped data), use that instead
  const series = customSeries || (xIsDateTime ? 
    yFields.map((field, index) => {
      // Get a color for this series
      const color = chartColors[index % chartColors.length];
      const colorWithoutOpacity = color.replace(/,[^,]*\)$/, ')');
      
      return {
        name: field,
        type: "line" as const,
        smooth: true,
        data: formattedData.map(item => {
          const value = extractNumericValue(item[field]) || 0;
          return [item[xField], value]; 
        }),
        areaStyle: {
          opacity: 0.2,
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              {
                offset: 0,
                color: color // Already has opacity
              },
              {
                offset: 1,
                color: colorWithoutOpacity.replace(')', ', 0.1)') // Fade to transparent
              }
            ]
          }
        },
        // Line customization
        symbolSize: 5,
        symbol: 'circle',
        lineStyle: {
          width: 2,
          cap: 'round'
        },
        emphasis: {
          focus: 'series',
          areaStyle: {
            opacity: 0.3
          }
        }
      }
    }) : 
    // Regular category data (non-time series)
    yFields.map((field, index) => {
      // Get a color for this series
      const color = chartColors[index % chartColors.length];
      const colorWithoutOpacity = color.replace(/,[^,]*\)$/, ')');
      
      return {
        name: field,
        type: "line" as const,
        smooth: true,
        data: formattedData.map(item => extractNumericValue(item[field])),
        areaStyle: {
          opacity: 0.2,
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              {
                offset: 0,
                color: color // Already has opacity
              },
              {
                offset: 1,
                color: colorWithoutOpacity.replace(')', ', 0.1)') // Fade to transparent
              }
            ]
          }
        },
        // Line customization
        symbolSize: 5,
        symbol: 'circle',
        lineStyle: {
          width: 2
        },
        emphasis: {
          focus: 'series',
          areaStyle: {
            opacity: 0.3
          }
        }
      }
    })
  );

  return {
    tooltip: true,
    legend: yFields.length > 1,
    grid: {
      left: "5%",
      right: "5%",
      bottom: "15%", // Increased to give more space for zoom control
      top: yFields.length > 1 ? "60px" : "50px", // Increased top margin for legend and tools
      containLabel: true,
    },
    toolbox: {
      right: "20px",
      top: "20px",
    },
    xAxis: {
      type: xIsDateTime ? 'time' : 'category',
      axisLabel: { 
        fontSize: 12, 
        rotate: xIsDateTime ? 30 : 0,
      },
      axisLine: {
        lineStyle: {
          width: 1
        }
      },
      // For time axis, don't pre-define data points
      data: xIsDateTime ? undefined : formattedData.map(item => extractStringValue(item[xField])),
      splitLine: {
        show: xIsDateTime,
        lineStyle: {
          type: 'dashed',
          opacity: 0.2
        }
      }
    } as echarts.XAXisComponentOption,
    yAxis: {
      type: "value",
      axisLabel: {
        // Add thousand separators to numbers
        formatter: (value: number) => {
          return value.toLocaleString();
        }
      }
    } as echarts.YAXisComponentOption,
    series: series as echarts.SeriesOption[],
    fieldInfo: {
      xIsDateTime,
      xField,
      yFields,
      autoColors: true
    },
    ...options
  };
};