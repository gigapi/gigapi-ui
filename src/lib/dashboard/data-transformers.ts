import {
  type NDJSONRecord,
  type ChartDataPoint,
  type PanelConfig,
} from "@/types/dashboard.types";
import { SchemaAnalyzer } from "./schema-analyzer";
import { parseTimeValue } from "@/lib/time";

export interface TransformedData {
  data: ChartDataPoint[];
  series: string[];
  metadata: {
    totalRecords: number;
    timeRange?: {
      min: Date;
      max: Date;
    };
    valueRange?: {
      min: number;
      max: number;
    };
  };
}

/**
 * Helper function to get time range from records
 */
function getTimeRange(records: NDJSONRecord[], timeField: string): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  
  for (const record of records) {
    const timeValue = parseTimeValue(record[timeField]);
    if (timeValue) {
      let timestamp = timeValue.getTime();
      // Handle nanosecond timestamps
      if (timestamp > 32503680000000) {
        timestamp = Math.floor(timestamp / 1000000);
      }
      if (timestamp < min) min = timestamp;
      if (timestamp > max) max = timestamp;
    }
  }
  
  return { min, max };
}

/**
 * Transform raw NDJSON data for panel rendering using approach
 * Simplified version without legacy support
 */
export function transformDataForPanel(
  records: NDJSONRecord[],
  config: PanelConfig
): TransformedData {
  
  if (!records || records.length === 0) {
    return {
      data: [],
      series: [],
      metadata: { totalRecords: 0 },
    };
  }

  const { type } = config;

  switch (type) {
    case "timeseries":
    case "line":
    case "area":
      return transformForTimeSeries(records, config);

    case "bar":
      return transformForBar(records, config);
    
    case "scatter":
      return transformForTimeSeries(records, config);

    case "pie":
    case "donut":
      return transformForPie(records, config);

    case "stat":
      return transformForStat(records, config);

    case "gauge":
      return transformForGauge(records, config);

    case "table":
      return transformForTable(records);

    default:
      return transformForTimeSeries(records, config);
  }
}

/**
 * Transform data for bar charts
 */
function transformForBar(
  records: NDJSONRecord[],
  config: PanelConfig
): TransformedData {
  const data: ChartDataPoint[] = [];
  const seriesSet = new Set<string>();

  let minValue = Infinity;
  let maxValue = -Infinity;

  // Use field mapping if available
  const fieldMapping = config.fieldMapping;
  const firstRecord = records[0];

  if (!firstRecord) {
    return {
      data: [],
      series: [],
      metadata: { totalRecords: 0 },
    };
  }

  const fields = Object.keys(firstRecord);

  let xField: string | null;
  let yField: string | null;
  let seriesField: string | undefined;

  if (fieldMapping?.xField && fieldMapping?.yField) {
    xField = fieldMapping.xField;
    yField = fieldMapping.yField;
    seriesField = fieldMapping.seriesField;
  } else {
    // Auto-detect fields
    const timeField = SchemaAnalyzer.findTimeField(fields);
    const numericFields = SchemaAnalyzer.findNumericFields(firstRecord, fields);
    const stringFields = SchemaAnalyzer.findStringFields(firstRecord, fields);

    // For bar charts, prefer categorical data on x-axis
    xField = stringFields.length > 0 ? stringFields[0] : timeField;
    yField = numericFields.length > 0 ? numericFields[0] : null;
  }

  if (!xField || !yField) {
    return { data: [], series: [], metadata: { totalRecords: 0 } };
  }

  // Check if x-axis is time-based
  const isTimeBasedX = xField === "__timestamp" || 
    xField?.toLowerCase().includes("time") || 
    xField?.toLowerCase().includes("date");

  // Group data by x value for aggregation
  const groupedData = new Map<string, { sum: number; count: number; series?: string }>();

  for (const record of records) {
    let xValue: string | number;
    
    if (isTimeBasedX) {
      const timeValue = parseTimeValue(record[xField]);
      if (!timeValue) continue;
      
      let timestamp = timeValue.getTime();
      
      // Handle nanosecond timestamps
      if (timestamp > 32503680000000) {
        timestamp = Math.floor(timestamp / 1000000);
      }
      
      // For time-based bar charts, group by day for better aggregation
      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hour = String(date.getHours()).padStart(2, '0');
      
      // Determine grouping interval based on data range and density
      const timeRange = getTimeRange(records, xField);
      const rangeMs = timeRange.max - timeRange.min;
      const dataPointCount = records.length;
      const minuteMs = 60 * 1000;
      const hourMs = 60 * minuteMs;
      const dayMs = 24 * hourMs;
      
      // Calculate data density (points per hour)
      const dataPointsPerHour = rangeMs > 0 ? (dataPointCount / (rangeMs / hourMs)) : 0;
      
      if (rangeMs <= hourMs) {
        // For data within an hour, group by minutes or seconds based on density
        if (dataPointsPerHour > 100) {
          // High frequency: group by 10-second intervals
          const minute = String(date.getMinutes()).padStart(2, '0');
          const second = String(Math.floor(date.getSeconds() / 10) * 10).padStart(2, '0');
          xValue = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
        } else if (dataPointsPerHour > 20) {
          // Medium frequency: group by minutes
          const minute = String(date.getMinutes()).padStart(2, '0');
          xValue = `${year}-${month}-${day} ${hour}:${minute}`;
        } else {
          // Low frequency: group by 10-minute intervals
          const minute = String(Math.floor(date.getMinutes() / 10) * 10).padStart(2, '0');
          xValue = `${year}-${month}-${day} ${hour}:${minute}`;
        }
      } else if (rangeMs <= dayMs) {
        // For data within a day, choose granularity based on data density
        if (dataPointsPerHour > 50) {
          // High frequency: group by 10-minute intervals
          const minute = String(Math.floor(date.getMinutes() / 10) * 10).padStart(2, '0');
          xValue = `${year}-${month}-${day} ${hour}:${minute}`;
        } else if (dataPointsPerHour > 10) {
          // Medium frequency: group by 30-minute intervals
          const minute = String(Math.floor(date.getMinutes() / 30) * 30).padStart(2, '0');
          xValue = `${year}-${month}-${day} ${hour}:${minute}`;
        } else {
          // Low frequency: group by hour
          xValue = `${year}-${month}-${day} ${hour}:00`;
        }
      } else if (rangeMs <= 7 * dayMs) {
        // Group by day for data within a week
        xValue = `${year}-${month}-${day}`;
      } else if (rangeMs <= 30 * dayMs) {
        // Group by day for data within a month
        xValue = `${year}-${month}-${day}`;
      } else {
        // Group by month for longer periods
        xValue = `${year}-${month}`;
      }
    } else {
      xValue = String(record[xField] || "Unknown");
    }

    const yValue = parseNumericValue(record[yField]);
    if (yValue === null) continue;

    const seriesName = seriesField && record[seriesField] 
      ? String(record[seriesField]) 
      : "default";

    const key = seriesField ? `${xValue}|${seriesName}` : String(xValue);

    if (groupedData.has(key)) {
      const existing = groupedData.get(key)!;
      existing.sum += yValue;
      existing.count += 1;
    } else {
      groupedData.set(key, { sum: yValue, count: 1, series: seriesName });
    }

    seriesSet.add(seriesName);
  }

  // Convert grouped data to chart points
  for (const [key, { sum, count, series }] of groupedData.entries()) {
    const avgValue = sum / count;
    const xValue = seriesField ? key.split("|")[0] : key;

    data.push({
      x: xValue,
      y: avgValue,
      series: series || "default",
    });

    if (avgValue < minValue) minValue = avgValue;
    if (avgValue > maxValue) maxValue = avgValue;
  }

  // Sort data by x value
  if (isTimeBasedX) {
    // For time-based data, sort by actual time
    data.sort((a, b) => {
      const aTime = new Date(String(a.x)).getTime();
      const bTime = new Date(String(b.x)).getTime();
      return aTime - bTime;
    });
  } else {
    // For categorical data, sort alphabetically
    data.sort((a, b) => {
      const aStr = String(a.x);
      const bStr = String(b.x);
      return aStr.localeCompare(bStr);
    });
  }

  return {
    data,
    series: Array.from(seriesSet),
    metadata: {
      totalRecords: records.length,
      valueRange:
        minValue !== Infinity ? { min: minValue, max: maxValue } : undefined,
    },
  };
}

/**
 * Transform data for time series charts (line, area, timeseries)
 */
function transformForTimeSeries(
  records: NDJSONRecord[],
  config: PanelConfig
): TransformedData {
  
  const data: ChartDataPoint[] = [];
  const seriesSet = new Set<string>();

  let minTime: Date | null = null;
  let maxTime: Date | null = null;
  let minValue = Infinity;
  let maxValue = -Infinity;

  // Use field mapping if available, otherwise auto-detect
  const fieldMapping = config.fieldMapping;
  const firstRecord = records[0];
  
  // Handle case where we have no data - this is normal during loading
  if (!firstRecord) {
    return {
      data: [],
      series: [],
      metadata: {
        totalRecords: 0,
      },
    };
  }
  
  const fields = Object.keys(firstRecord);

  let timeField: string | null;
  let valueFields: string[];
  let seriesField: string | undefined;

  if (fieldMapping?.xField && fieldMapping?.yField) {
    // Use explicit field mapping
    timeField = fieldMapping.xField;
    valueFields = [fieldMapping.yField];
    seriesField = fieldMapping.seriesField;
  } else {
    // Auto-detect fields (fallback)
    timeField = SchemaAnalyzer.findTimeField(fields);
    valueFields = SchemaAnalyzer.findNumericFields(firstRecord, fields);
    seriesField = undefined;
  }

  // If no value fields found, skip
  if (valueFields.length === 0) {
    return { data: [], series: [], metadata: { totalRecords: 0 } };
  }

  for (const record of records) {
    // Parse time value
    let timeValue: Date | null = null;
    if (timeField && record[timeField] !== undefined) {
      timeValue = parseTimeValue(record[timeField]);
    }

    if (!timeValue) continue;

    // Process each value field as a series
    for (const field of valueFields) {
      const value = parseNumericValue(record[field]);
      if (value === null) continue;

      let seriesName: string;
      if (seriesField && record[seriesField]) {
        // Use series field to group data (e.g., "us-texas", "us-northwest")
        seriesName = String(record[seriesField]);
      } else if (valueFields.length > 1) {
        // Multiple value fields become series (e.g., "temperature", "humidity")
        seriesName = field;
      } else {
        // Single series - use the actual field name (e.g., "temperature")
        seriesName = field;
      }

      seriesSet.add(seriesName);

      const dataPoint = {
        x: timeValue,
        y: value,
        series: seriesName,
      };

      data.push(dataPoint);

      // Update ranges
      if (!minTime || timeValue < minTime) minTime = timeValue;
      if (!maxTime || timeValue > maxTime) maxTime = timeValue;
      if (value < minValue) minValue = value;
      if (value > maxValue) maxValue = value;
    }
  }

  // Sort by time
  data.sort((a, b) => {
    const timeA = a.x instanceof Date ? a.x.getTime() : Number(a.x);
    const timeB = b.x instanceof Date ? b.x.getTime() : Number(b.x);
    return timeA - timeB;
  });

  return {
    data,
    series: Array.from(seriesSet),
    metadata: {
      totalRecords: records.length,
      timeRange:
        minTime && maxTime ? { min: minTime, max: maxTime } : undefined,
      valueRange:
        minValue !== Infinity ? { min: minValue, max: maxValue } : undefined,
    },
  };
}

/**
 * Transform data for pie and donut charts
 */
function transformForPie(
  records: NDJSONRecord[],
  config: PanelConfig
): TransformedData {
  const data: ChartDataPoint[] = [];
  const seriesSet = new Set<string>();

  let minValue = Infinity;
  let maxValue = -Infinity;

  // Use field mapping if available, otherwise auto-detect
  const fieldMapping = config.fieldMapping;
  const firstRecord = records[0];
  const fields = Object.keys(firstRecord);

  let categoryField: string;
  let valueField: string;

  if (fieldMapping?.xField && fieldMapping?.yField) {
    // Use explicit field mapping
    categoryField = fieldMapping.xField;
    valueField = fieldMapping.yField;
  } else {
    // Auto-detect fields (fallback)
    const numericFields = SchemaAnalyzer.findNumericFields(firstRecord, fields);
    const stringFields = SchemaAnalyzer.findStringFields(firstRecord, fields);

    categoryField = stringFields[0] || "index";
    valueField = numericFields[0];
  }

  if (!valueField) {
    return { data: [], series: [], metadata: { totalRecords: 0 } };
  }

  // Group by category and sum values
  const categoryMap = new Map<string, number>();

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const value = parseNumericValue(record[valueField]);
    if (value === null) continue;

    const category =
      categoryField === "index"
        ? `Item ${i + 1}`
        : String(record[categoryField] || `Item ${i + 1}`);

    if (categoryMap.has(category)) {
      categoryMap.set(category, categoryMap.get(category)! + value);
    } else {
      categoryMap.set(category, value);
    }
  }

  // Convert to chart data points
  for (const [category, value] of categoryMap.entries()) {
    data.push({
      x: category,
      y: value,
      series: "pie",
    });

    if (value < minValue) minValue = value;
    if (value > maxValue) maxValue = value;
  }

  seriesSet.add("pie");

  return {
    data,
    series: Array.from(seriesSet),
    metadata: {
      totalRecords: records.length,
      valueRange:
        minValue !== Infinity ? { min: minValue, max: maxValue } : undefined,
    },
  };
}

/**
 * Transform data for stat panels (single value with stats)
 */
function transformForStat(
  records: NDJSONRecord[],
  config: PanelConfig
): TransformedData {
  const fieldMapping = config.fieldMapping;
  const firstRecord = records[0];
  const fields = Object.keys(firstRecord);

  let valueField: string;
  let groupField: string | undefined;
  
  if (fieldMapping?.yField) {
    valueField = fieldMapping.yField;
    groupField = fieldMapping.seriesField;
  } else {
    const numericFields = SchemaAnalyzer.findNumericFields(firstRecord, fields);
    if (numericFields.length === 0) {
      return { data: [], series: [], metadata: { totalRecords: 0 } };
    }
    valueField = numericFields[0];
    
    // Auto-detect grouping field
    const stringFields = SchemaAnalyzer.findStringFields(firstRecord, fields);
    groupField = stringFields.length > 0 ? stringFields[0] : undefined;
  }

  const data: ChartDataPoint[] = [];
  const seriesSet = new Set<string>();

  // Check if we have grouped data
  if (groupField) {
    // Group by the series field
    const groups = new Map<string, number[]>();
    
    for (const record of records) {
      const groupName = String(record[groupField] || "Unknown");
      const value = parseNumericValue(record[valueField]);
      
      if (value !== null) {
        if (!groups.has(groupName)) {
          groups.set(groupName, []);
        }
        groups.get(groupName)!.push(value);
      }
    }
    
    // Create a stat for each group
    for (const [groupName, values] of groups.entries()) {
      if (values.length > 0) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        data.push({
          x: groupName,
          y: avg,
          series: groupName
        });
        seriesSet.add(groupName);
      }
    }
  } else {
    // Single stat for all values
    const values: number[] = [];
    for (const record of records) {
      const value = parseNumericValue(record[valueField]);
      if (value !== null) {
        values.push(value);
      }
    }

    if (values.length === 0) {
      return { data: [], series: [], metadata: { totalRecords: 0 } };
    }

    const latest = values[values.length - 1];
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    data.push(
      { x: "current", y: latest, series: "stats" },
      { x: "average", y: avg, series: "stats" },
      { x: "min", y: min, series: "stats" },
      { x: "max", y: max, series: "stats" }
    );
    seriesSet.add("stats");
  }

  return {
    data,
    series: Array.from(seriesSet),
    metadata: {
      totalRecords: records.length,
    },
  };
}

/**
 * Transform data for gauge panels (latest value)
 */
function transformForGauge(
  records: NDJSONRecord[],
  config: PanelConfig
): TransformedData {
  const fieldMapping = config.fieldMapping;
  const firstRecord = records[0];
  const fields = Object.keys(firstRecord);

  let valueField: string;
  let groupField: string | undefined;
  
  if (fieldMapping?.yField) {
    valueField = fieldMapping.yField;
    groupField = fieldMapping.seriesField;
  } else {
    const numericFields = SchemaAnalyzer.findNumericFields(firstRecord, fields);
    if (numericFields.length === 0) {
      return { data: [], series: [], metadata: { totalRecords: 0 } };
    }
    valueField = numericFields[0];
    
    // Auto-detect grouping field
    const stringFields = SchemaAnalyzer.findStringFields(firstRecord, fields);
    groupField = stringFields.length > 0 ? stringFields[0] : undefined;
  }

  const data: ChartDataPoint[] = [];
  const seriesSet = new Set<string>();

  // Check if we have grouped data
  if (groupField) {
    // Group by the series field
    const groups = new Map<string, number[]>();
    
    for (const record of records) {
      const groupName = String(record[groupField] || "Unknown");
      const value = parseNumericValue(record[valueField]);
      
      if (value !== null) {
        if (!groups.has(groupName)) {
          groups.set(groupName, []);
        }
        groups.get(groupName)!.push(value);
      }
    }
    
    // Create a gauge for each group (using average or latest)
    for (const [groupName, values] of groups.entries()) {
      if (values.length > 0) {
        // Use average value for gauges when grouped
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        data.push({
          x: groupName,
          y: avg,
          series: groupName
        });
        seriesSet.add(groupName);
      }
    }
  } else {
    // Single gauge for latest value
    let latestValue: number | null = null;

    // Get latest non-null value
    for (let i = records.length - 1; i >= 0; i--) {
      const value = parseNumericValue(records[i][valueField]);
      if (value !== null) {
        latestValue = value;
        break;
      }
    }

    if (latestValue === null) {
      return { data: [], series: [], metadata: { totalRecords: 0 } };
    }

    data.push({ x: "gauge", y: latestValue, series: "gauge" });
    seriesSet.add("gauge");
  }

  return {
    data,
    series: Array.from(seriesSet),
    metadata: {
      totalRecords: records.length,
    },
  };
}

/**
 * Transform data for table panels (preserve all data)
 */
function transformForTable(records: NDJSONRecord[]): TransformedData {
  const data: ChartDataPoint[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const rowData: ChartDataPoint = {
      x: i,
      y: 0, // Not used for tables
      ...record, // Include all record fields
    };
    data.push(rowData);
  }

  return {
    data,
    series: ["table"],
    metadata: {
      totalRecords: records.length,
    },
  };
}

function parseNumericValue(value: any): number | null {
  if (value === null || value === undefined) return null;

  const num = Number(value);
  return isNaN(num) ? null : num;
}
