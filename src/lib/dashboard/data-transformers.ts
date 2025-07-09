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
    case "scatter":

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
    console.warn("No value fields found for time series");
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

  let field: string;
  if (fieldMapping?.yField) {
    field = fieldMapping.yField;
  } else {
    const numericFields = SchemaAnalyzer.findNumericFields(firstRecord, fields);
    if (numericFields.length === 0) {
      return { data: [], series: [], metadata: { totalRecords: 0 } };
    }
    field = numericFields[0];
  }
  const values: number[] = [];

  for (const record of records) {
    const value = parseNumericValue(record[field]);
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

  const data: ChartDataPoint[] = [
    { x: "current", y: latest },
    { x: "average", y: avg },
    { x: "min", y: min },
    { x: "max", y: max },
  ];

  return {
    data,
    series: ["stats"],
    metadata: {
      totalRecords: records.length,
      valueRange: { min, max },
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

  let field: string;
  if (fieldMapping?.yField) {
    field = fieldMapping.yField;
  } else {
    const numericFields = SchemaAnalyzer.findNumericFields(firstRecord, fields);
    if (numericFields.length === 0) {
      return { data: [], series: [], metadata: { totalRecords: 0 } };
    }
    field = numericFields[0];
  }
  let latestValue: number | null = null;

  // Get latest non-null value
  for (let i = records.length - 1; i >= 0; i--) {
    const value = parseNumericValue(records[i][field]);
    if (value !== null) {
      latestValue = value;
      break;
    }
  }

  if (latestValue === null) {
    return { data: [], series: [], metadata: { totalRecords: 0 } };
  }

  return {
    data: [{ x: "gauge", y: latestValue }],
    series: ["gauge"],
    metadata: {
      totalRecords: records.length,
      valueRange: { min: latestValue, max: latestValue },
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
