import type {
  ChartConfiguration,
  QueryResult,
  ColumnInfo,
  ColumnSchema,
  TimeUnit,
  ThemeColors,
} from "@/types";

import { generateId } from "@/lib/formatting/general-formatting";

// Default color palette
const DEFAULT_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
];

function isTimestamp(value: string | number): boolean {
  if (value === null || value === undefined) return false;

  // For string values, try to parse as number
  const numValue = typeof value === "string" ? Number(value) : value;

  // Not a number
  if (isNaN(numValue)) return false;

  // Check common timestamp ranges - updated to handle nanoseconds properly
  if (numValue > 1e18) return true; // Nanoseconds (19+ digits) - like your data: 1749553256710273000
  if (numValue > 1e15) return true; // Microseconds (16+ digits)
  if (numValue > 1e12) return true; // Milliseconds (13+ digits)

  // Seconds-based timestamps 
  if (numValue >= 1000000000 && numValue <= 9999999999) return true; // Seconds from ~2001 to ~2286

  return false;
}

function getTimestampScale(value: number): "s" | "ms" | "us" | "ns" {
  if (value > 1e18) return "ns"; // Nanoseconds
  if (value > 1e15) return "us"; // Microseconds
  if (value > 1e12) return "ms"; // Milliseconds
  return "s"; // Seconds
}

function normalizeTimestampToMs(value: number): number {
  const scale = getTimestampScale(value);

  switch (scale) {
    case "ns":
      return Math.floor(value / 1000000);
    case "us":
      return Math.floor(value / 1000);
    case "s":
      return value * 1000;
    default:
      return value; // Already in ms
  }
}

/**
 * Analyze columns from query results with optional schema information to extract field information
 * This is the unified approach that leverages database schema when available
 */
export function analyzeColumns(
  data: QueryResult[], 
  schemaColumns?: ColumnSchema[]
): ColumnInfo[] {
  if (!data || data.length === 0) return [];

  const columns: ColumnInfo[] = [];
  const firstRow = data[0];

  Object.keys(firstRow).forEach((columnName) => {
    const columnData = data.map((row) => row[columnName]);
    const nonNullData = columnData.filter((val) => val !== null && val !== undefined);

    // Find schema information for this column if available
    const schemaInfo = schemaColumns?.find(
      (col) => col.columnName === columnName
    );

    if (nonNullData.length === 0) {
      columns.push({
        name: columnName,
        label: columnName,
        type: schemaInfo ? mapSchemaTypeToDataType(schemaInfo.dataType) : "string",
        role: "dimension",
        contentType: "categorical",
        isTimeField: false,
        originalType: schemaInfo?.dataType,
      });
      return;
    }

    // Sample values for analysis
    const sampleValues = nonNullData.slice(0, Math.min(100, nonNullData.length));
    
    // Start with schema-derived information if available
    let type: ColumnInfo["type"] = schemaInfo ? mapSchemaTypeToDataType(schemaInfo.dataType) : "string";
    let isTimeField = false;
    let timeUnit: TimeUnit | undefined = schemaInfo?.timeUnit;

    // Check for known timestamp field names first
    const lowerColumnName = columnName.toLowerCase();
    const isKnownTimeField = lowerColumnName === "__timestamp" || 
                           lowerColumnName === "timestamp" || 
                           lowerColumnName === "time" || 
                           lowerColumnName.includes("time") || 
                           lowerColumnName.includes("date") ||
                           lowerColumnName === "created_at" ||
                           lowerColumnName === "updated_at";

    // Use schema information first, then fall back to data analysis
    if (schemaInfo) {
      // Trust schema type information
      type = mapSchemaTypeToDataType(schemaInfo.dataType);
      timeUnit = schemaInfo.timeUnit;
      
      // Determine if it's a time field based on schema and data
      if (timeUnit || isKnownTimeField) {
        isTimeField = true;
      } else if ((type === "integer" || type === "bigint") && isKnownTimeField) {
        // Schema says it's numeric but name suggests time - validate with data
        const numericValues = sampleValues.filter((val) => 
          typeof val === "number" || !isNaN(Number(val))
        );
        if (numericValues.length > 0 && numericValues.some(val => isTimestamp(val))) {
          isTimeField = true;
          const avgValue = numericValues.map(v => Number(v)).reduce((a, b) => a + b, 0) / numericValues.length;
          timeUnit = timeUnit || getTimestampScale(avgValue);
        }
      }
    } else {
      // Fall back to original data-based analysis when no schema
      // Check if all values are numbers
      const numericValues = sampleValues.filter((val) => 
        typeof val === "number" || !isNaN(Number(val))
      );

      if (numericValues.length === sampleValues.length) {
        // All values are numeric
        const hasDecimals = numericValues.some((val) => 
          Number(val) % 1 !== 0
        );
        type = hasDecimals ? "float" : "integer";

        // Check if it could be a timestamp - prioritize known time fields
        if (type === "integer" && (isKnownTimeField || numericValues.some(val => isTimestamp(val)))) {
          const numValues = numericValues.map((val) => Number(val));
          isTimeField = true;
          // Determine time unit based on value magnitude
          const avgValue = numValues.reduce((a, b) => a + b, 0) / numValues.length;
          timeUnit = getTimestampScale(avgValue);
        }
      } else {
        // Check if values could be dates
        const dateValues = sampleValues.filter((val) => {
          try {
            const date = new Date(val);
            return !isNaN(date.getTime());
          } catch {
            return false;
          }
        });

        if (dateValues.length > sampleValues.length * 0.8 || isKnownTimeField) {
          type = "datetime";
          isTimeField = true;
        } else {
          type = "string";
        }
      }
    }

    // Determine role and content type
    let role: ColumnInfo["role"] = "dimension";
    let contentType: ColumnInfo["contentType"] = "categorical";

    if (type === "integer" || type === "float" || type === "bigint") {
      role = "measure";
      contentType = "numeric";
    } else if (isTimeField) {
      role = "dimension";
      contentType = "temporal";
    } else {
      // For string columns, check cardinality to determine if categorical
      const uniqueValues = new Set(sampleValues);
      if (uniqueValues.size < sampleValues.length * 0.5) {
        contentType = "categorical";
      } else {
        contentType = "text";
      }
    }

    columns.push({
      name: columnName,
      label: columnName,
      type,
      role,
      contentType,
      isTimeField,
      timeUnit,
      originalType: schemaInfo?.dataType,
      stats: {
        cardinality: new Set(nonNullData).size,
      },
    });
  });

  return columns;
}

/**
 * Map database schema types to our standardized data types
 */
function mapSchemaTypeToDataType(schemaType: string): ColumnInfo["type"] {
  const lowerType = schemaType.toLowerCase();
  
  if (lowerType.includes('bigint') || lowerType.includes('long')) {
    return 'bigint';
  }
  if (lowerType.includes('int') || lowerType.includes('integer')) {
    return 'integer';
  }
  if (lowerType.includes('float') || lowerType.includes('double') || lowerType.includes('decimal') || lowerType.includes('numeric')) {
    return 'float';
  }
  if (lowerType.includes('bool')) {
    return 'boolean';
  }
  if (lowerType.includes('timestamp') || lowerType.includes('datetime')) {
    return 'datetime';
  }
  if (lowerType.includes('date')) {
    return 'date';
  }
  if (lowerType.includes('time')) {
    return 'time';
  }
  
  return 'string';
}

/**
 * Create default chart configuration from data
 */
export function createDefaultChartConfiguration(
  data: QueryResult[],
  columns?: ColumnInfo[]
): ChartConfiguration {
  const analyzedColumns = columns || analyzeColumns(data);
  
  // Find suitable fields for X and Y axes
  const timeFields = analyzedColumns.filter((col) => col.isTimeField);
  const numericFields = analyzedColumns.filter((col) => 
    col.type === "integer" || col.type === "float"
  );
  const categoricalFields = analyzedColumns.filter((col) => 
    col.contentType === "categorical"
  );

  let xAxis = "";
  let yAxis = "";
  let chartType: 'line' | 'bar' | 'area' = "line";

  // Determine best chart type and field mapping
  if (timeFields.length > 0 && numericFields.length > 0) {
    xAxis = timeFields[0].name;
    yAxis = numericFields[0].name;
    chartType = "line";
  } else if (numericFields.length >= 2) {
    xAxis = numericFields[0].name;
    yAxis = numericFields[1].name;
    chartType = "line";
  } else if (categoricalFields.length > 0 && numericFields.length > 0) {
    xAxis = categoricalFields[0].name;
    yAxis = numericFields[0].name;
    chartType = "bar";
  } else if (numericFields.length === 1) {
    yAxis = numericFields[0].name;
    chartType = "bar";
  }

  return {
    id: generateId("chart"),
    title: "Chart",
    type: chartType,
    fieldMapping: {
      xAxis,
      yAxis,
      groupBy: null,
    },
    styling: {
      showLegend: true,
      showGrid: true,
    },
    timeFormatting: timeFields.length > 0 ? {
      enabled: true,
      sourceTimeUnit: timeFields[0].timeUnit,
    } : undefined,
    echartsConfig: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Update chart configuration with data and theme
 */
export function updateChartConfiguration(
  config: ChartConfiguration,
  data: QueryResult[],
  themeColors: ThemeColors
): ChartConfiguration {
  if (!data || data.length === 0) {
    return {
      ...config,
      echartsConfig: null,
    };
  }

  // Convert data to chart format
  const chartData = data.map((row) => {
    const result: Record<string, any> = {};
    Object.keys(row).forEach((key) => {
      let value = row[key];
      
      // Handle timestamp conversion if this is a time field
      const isTimeField = config.fieldMapping.xAxis === key && 
                         config.timeFormatting?.enabled;
      
      if (isTimeField && typeof value === "number" && isTimestamp(value)) {
        value = normalizeTimestampToMs(value);
      } else if (isTimeField && typeof value === "string") {
        // If string date format, try to convert to timestamp
        try {
          // First check if it's a numeric string that could be a timestamp
          if (/^\d+$/.test(value) && isTimestamp(value)) {
            value = normalizeTimestampToMs(Number(value));
          } else {
            const dateObj = new Date(value);
            if (!isNaN(dateObj.getTime())) {
              value = dateObj.getTime();
            }
          }
        } catch (e) {
          console.warn("Could not parse date string:", value);
        }
      }
      
      result[key] = value;
    });
    
    return result;
  });

  // Generate ECharts configuration based on chart type
  let echartsConfig: any = null;

  try {
    switch (config.type) {
      case "line":
        echartsConfig = generateLineChartConfig(chartData, config, themeColors);
        break;
      case "bar":
        echartsConfig = generateBarChartConfig(chartData, config, themeColors);
        break;
      case "area":
        echartsConfig = generateAreaChartConfig(chartData, config, themeColors);
        break;
      default:
        echartsConfig = {
          title: { text: config.title || "Chart", textStyle: { color: themeColors.textColor } },
          tooltip: { trigger: "item" },
          series: [{ type: "line", data: [] }],
        };
    }
  } catch (error) {
    console.error("Error generating chart config:", error);
    echartsConfig = null;
  }

  return {
    ...config,
    echartsConfig,
    updatedAt: new Date().toISOString(),
  };
}

function generateLineChartConfig(
  data: Record<string, any>[],
  config: ChartConfiguration,
  themeColors: ThemeColors
): any {
  const xField = config.fieldMapping.xAxis;
  const yField = config.fieldMapping.yAxis;
  const groupBy = config.fieldMapping.groupBy;

  if (!xField || !yField) {
    throw new Error("Line chart requires both X and Y axis fields");
  }

  const isTimeX = config.timeFormatting?.enabled;
  let seriesData;
  let series;
  let xAxisCategories: string[] | undefined;

  // Sort data by X-axis value for proper line chart rendering
  const sortedData = [...data].sort((a, b) => {
    const aVal = a[xField];
    const bVal = b[xField];
    
    // Handle null/undefined values - put them at the end
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    
    // For time fields, ensure proper numeric comparison
    if (isTimeX && typeof aVal === 'number' && typeof bVal === 'number') {
      return aVal - bVal;
    }
    
    // For other numeric fields
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return aVal - bVal;
    }
    
    // For string fields, use locale compare
    return String(aVal).localeCompare(String(bVal));
  });

  // Handle series data differently based on whether it's a time series and if groupBy is used
  if (isTimeX && groupBy) {
    // Group the data by the groupBy field
    const groupedData: Record<string, any[]> = {};
    sortedData.forEach((d) => {
      const group = String(d[groupBy]);
      if (!groupedData[group]) {
        groupedData[group] = [];
      }
      groupedData[group].push([d[xField], d[yField]]);
    });

    series = Object.entries(groupedData).map(([name, points], index) => ({
      name,
      type: "line",
      data: points,
      itemStyle: { color: DEFAULT_COLORS[index % DEFAULT_COLORS.length] },
      lineStyle: { 
        color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
        width: 2
      },
      symbol: "circle",
      symbolSize: 4,
      emphasis: {
        focus: 'series',
        lineStyle: {
          width: 3
        },
        itemStyle: {
          borderWidth: 2,
          borderColor: '#fff'
        }
      }
    }));
  } else if (isTimeX) {
    // For time series without grouping
    seriesData = sortedData.map((d) => [d[xField], d[yField]]);
    series = [{
      name: yField, // Use actual field name instead of generic name
      type: "line",
      data: seriesData,
      itemStyle: { color: DEFAULT_COLORS[0] },
      lineStyle: { 
        color: DEFAULT_COLORS[0],
        width: 2
      },
      symbol: "circle",
      symbolSize: 4,
      smooth: config.styling?.smooth,
      emphasis: {
        focus: 'series',
        lineStyle: {
          width: 3
        },
        itemStyle: {
          borderWidth: 2,
          borderColor: '#fff'
        }
      }
    }];
  } else if (groupBy) {
    // For categorical x-axis with grouping
    const groupedData: Record<string, Record<string, number>> = {};
    const xCategories = new Set<string>();
    
    sortedData.forEach((d) => {
      const x = String(d[xField]);
      const group = String(d[groupBy]);
      
      xCategories.add(x);
      
      if (!groupedData[group]) {
        groupedData[group] = {};
      }
      
      groupedData[group][x] = Number(d[yField]) || 0;
    });
    
    // Sort categories properly
    const categories = Array.from(xCategories).sort((a, b) => {
      // Try to sort numerically if possible
      const numA = Number(a);
      const numB = Number(b);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });
    
    xAxisCategories = categories;
    
    series = Object.entries(groupedData).map(([name, points], index) => ({
      name,
      type: "line",
      data: categories.map(cat => points[cat] !== undefined ? points[cat] : null),
      itemStyle: { color: DEFAULT_COLORS[index % DEFAULT_COLORS.length] },
      lineStyle: { 
        color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
        width: 2
      },
      symbol: "circle",
      symbolSize: 4,
      smooth: config.styling?.smooth,
      connectNulls: false, // Don't connect null values with lines
      emphasis: {
        focus: 'series',
        lineStyle: {
          width: 3
        },
        itemStyle: {
          borderWidth: 2,
          borderColor: '#fff'
        }
      }
    }));
  } else {
    // Simple line chart with categorical x-axis
    seriesData = sortedData.map((d) => d[yField]);
    series = [{
      name: yField, // Use actual field name
      type: "line",
      data: seriesData,
      itemStyle: { color: DEFAULT_COLORS[0] },
      lineStyle: { 
        color: DEFAULT_COLORS[0],
        width: 2
      },
      symbol: "circle",
      symbolSize: 4,
      smooth: config.styling?.smooth,
      emphasis: {
        focus: 'series',
        lineStyle: {
          width: 3
        },
        itemStyle: {
          borderWidth: 2,
          borderColor: '#fff'
        }
      }
    }];
  }

  return {
    title: {
      text: config.title || "Line Chart",
      textStyle: { color: themeColors.textColor },
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: themeColors.tooltipBackgroundColor,
      textStyle: { color: themeColors.tooltipTextColor },
      formatter: (params: any) => {
        if (Array.isArray(params) && params.length > 0) {
          const param = params[0];
          // Format timestamp for tooltip
          if (isTimeX && typeof param.value[0] === 'number') {
            const date = new Date(param.value[0]);
            const dateStr = date.toLocaleString();
            const seriesName = param.seriesName || yField || 'Value';
            return `${dateStr}<br/><strong>${seriesName}</strong>: ${param.value[1]}`;
          } else if (Array.isArray(param.value) && param.value.length >= 2) {
            const seriesName = param.seriesName || yField || 'Value';
            return `${xField}: ${param.value[0]}<br/><strong>${seriesName}</strong>: ${param.value[1]}`;
          } else {
            const seriesName = param.seriesName || yField || 'Value';
            return `<strong>${seriesName}</strong>: ${param.value}`;
          }
        }
        return null; // Use default formatting
      },
    },
    legend: groupBy ? {
      show: config.styling?.showLegend !== false,
      textStyle: { color: themeColors.textColor },
    } : undefined,
    xAxis: {
      type: isTimeX ? "time" : "category",
      data: !isTimeX ? (xAxisCategories || sortedData.map((d) => String(d[xField]))) : undefined,
      axisLabel: { 
        color: themeColors.axisColor,
        formatter: isTimeX ? (value: number) => {
          const date = new Date(value);
          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } : undefined,
        rotate: !isTimeX ? 0 : undefined, // Allow rotation for long category names
      },
      axisLine: { lineStyle: { color: themeColors.axisColor } },
      splitLine: { 
        show: config.styling?.showGrid !== false,
        lineStyle: { color: themeColors.gridColor } 
      },
      boundaryGap: !isTimeX, // No boundary gap for time series, gap for categories
    },
    yAxis: {
      type: "value",
      axisLabel: { color: themeColors.axisColor },
      axisLine: { lineStyle: { color: themeColors.axisColor } },
      splitLine: { 
        show: config.styling?.showGrid !== false,
        lineStyle: { color: themeColors.gridColor } 
      },
    },
    series: series,
    grid: {
      left: "10%",
      right: "10%",
      bottom: "15%",
      top: "15%",
    },
    backgroundColor: themeColors.chartBackgroundColor,
  };
}

function generateBarChartConfig(
  data: Record<string, any>[],
  config: ChartConfiguration,
  themeColors: ThemeColors
): any {
  const xField = config.fieldMapping.xAxis;
  const yField = config.fieldMapping.yAxis;
  const groupBy = config.fieldMapping.groupBy;

  if (!xField || !yField) {
    throw new Error("Bar chart requires both X and Y axis fields");
  }

  let series: any[];
  let xAxisData: string[];

  const isTimeX = config.timeFormatting?.enabled;

  // Sort data properly
  const sortedData = [...data].sort((a, b) => {
    const aVal = a[xField];
    const bVal = b[xField];
    
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return aVal - bVal;
    }
    
    return String(aVal).localeCompare(String(bVal));
  });

  // Handle different scenarios for bar charts
  if (groupBy) {
    const groups = new Set<string>();
    const categories = new Set<string>();
    
    sortedData.forEach(item => {
      groups.add(String(item[groupBy]));
      categories.add(String(item[xField]));
    });
    
    const uniqueGroups = Array.from(groups);
    xAxisData = Array.from(categories).sort((a, b) => {
      const numA = Number(a);
      const numB = Number(b);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });
    
    series = uniqueGroups.map((group, index) => {
      const filteredData = sortedData.filter(item => String(item[groupBy]) === group);
      const seriesData: number[] = [];
      
      xAxisData.forEach((category: string) => {
        const matchingItem = filteredData.find(item => String(item[xField]) === category);
        seriesData.push(matchingItem ? Number(matchingItem[yField]) || 0 : 0);
      });
      
      return {
        name: String(group),
        type: "bar",
        data: seriesData,
        stack: config.styling?.stack ? 'total' : undefined,
        itemStyle: { color: DEFAULT_COLORS[index % DEFAULT_COLORS.length] },
      };
    });
  } else {
    // Simple bar chart
    xAxisData = sortedData.map(d => {
      if (isTimeX && typeof d[xField] === 'number') {
        const date = new Date(d[xField]);
        return date.toLocaleString();
      }
      return String(d[xField]);
    });
    series = [{
      name: yField, // Use actual field name
      type: "bar",
      data: sortedData.map(d => Number(d[yField]) || 0),
      itemStyle: { color: DEFAULT_COLORS[0] },
    }];
  }

  return {
    title: {
      text: config.title || "Bar Chart",
      textStyle: { color: themeColors.textColor },
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: themeColors.tooltipBackgroundColor,
      textStyle: { color: themeColors.tooltipTextColor },
    },
    legend: groupBy ? {
      show: config.styling?.showLegend !== false,
      textStyle: { color: themeColors.textColor },
    } : undefined,
    xAxis: {
      type: "category",
      data: xAxisData,
      axisLabel: { 
        color: themeColors.axisColor,
        rotate: xAxisData.some(label => label.length > 10) ? 45 : 0
      },
      axisLine: { lineStyle: { color: themeColors.axisColor } },
      splitLine: { 
        show: config.styling?.showGrid !== false,
        lineStyle: { color: themeColors.gridColor } 
      },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: themeColors.axisColor },
      axisLine: { lineStyle: { color: themeColors.axisColor } },
      splitLine: { 
        show: config.styling?.showGrid !== false,
        lineStyle: { color: themeColors.gridColor } 
      },
    },
    series: series,
    grid: {
      left: "10%",
      right: "10%",
      bottom: xAxisData.some(label => label.length > 10) ? "25%" : "15%",
      top: "15%",
    },
    backgroundColor: themeColors.chartBackgroundColor,
  };
}

function generateAreaChartConfig(
  data: Record<string, any>[],
  config: ChartConfiguration,
  themeColors: ThemeColors
): any {
  // Area chart is similar to line chart but with filled areas
  const lineConfig = generateLineChartConfig(data, config, themeColors);
  
  // Convert line series to area series with proper styling
  if (lineConfig.series) {
    lineConfig.series = lineConfig.series.map((s: any, index: number) => ({
      ...s,
      type: "line",
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [{
            offset: 0,
            color: s.itemStyle?.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]
          }, {
            offset: 1,
            color: 'rgba(136, 132, 216, 0.1)' // Fade to transparent
          }]
        },
        opacity: 0.6,
      },
      lineStyle: {
        ...s.lineStyle,
        width: 2
      },
      emphasis: {
        focus: 'series',
        areaStyle: {
          opacity: 0.8
        },
        lineStyle: {
          width: 3
        }
      }
    }));
  }

  return {
    ...lineConfig,
    title: {
      text: config.title || "Area Chart",
      textStyle: { color: themeColors.textColor },
    },
  };
}

/**
 * Export chart configuration to JSON
 */
export function exportChartConfiguration(config: ChartConfiguration): string {
  const exportConfig = {
    ...config,
    echartsConfig: undefined, // Don't export the computed config
  };
  return JSON.stringify(exportConfig, null, 2);
}

/**
 * Import chart configuration from JSON
 */
export function importChartConfiguration(
  jsonString: string,
  data: QueryResult[],
  themeColors: ThemeColors
): ChartConfiguration {
  const config = JSON.parse(jsonString) as ChartConfiguration;
  
  // Regenerate the ECharts config
  return updateChartConfiguration(config, data, themeColors);
}
