import {
  type NDJSONRecord,
  type ChartDataPoint,
  type PanelConfig,
} from "@/types/dashboard.types";
import { DataTransformer } from "../query-processor";

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
 * Transform raw NDJSON data for panel rendering using Grafana-like approach
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
      metadata: { totalRecords: 0 }
    };
  }

  const { type } = config;
  
  switch (type) {
    case 'timeseries':
    case 'line':
    case 'area':
      return transformForTimeSeries(records, config);
    
    case 'bar':
    case 'scatter':
      return transformForBarScatter(records, config);
    
    case 'stat':
      return transformForStat(records, config);
    
    case 'gauge':
      return transformForGauge(records, config);
    
    case 'table':
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
    timeField = findTimeField(fields);
    valueFields = findNumericFields(firstRecord, fields);
    seriesField = undefined;
  }
  
  // If no value fields found, skip
  if (valueFields.length === 0) {
    console.warn('No value fields found for time series');
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
      timeRange: minTime && maxTime ? { min: minTime, max: maxTime } : undefined,
      valueRange: minValue !== Infinity ? { min: minValue, max: maxValue } : undefined,
    },
  };
}

/**
 * Transform data for bar and scatter charts
 */
function transformForBarScatter(
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
  
  let xField: string;
  let yField: string;
  let seriesField: string | undefined;
  
  if (fieldMapping?.xField && fieldMapping?.yField) {
    // Use explicit field mapping
    xField = fieldMapping.xField;
    yField = fieldMapping.yField;
    seriesField = fieldMapping.seriesField;
  } else {
    // Auto-detect fields (fallback)
    const numericFields = findNumericFields(firstRecord, fields);
    const stringFields = findStringFields(firstRecord, fields);
    
    xField = stringFields[0] || 'index';
    yField = numericFields[0];
    seriesField = undefined;
  }

  if (!yField) {
    return { data: [], series: [], metadata: { totalRecords: 0 } };
  }

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const value = parseNumericValue(record[yField]);
    if (value === null) continue;

    const xValue = xField === 'index' ? i : String(record[xField] || i);
    
    let seriesName: string;
    if (seriesField && record[seriesField]) {
      seriesName = String(record[seriesField]);
    } else {
      seriesName = 'default';
    }
    seriesSet.add(seriesName);

    data.push({
      x: xValue,
      y: value,
      series: seriesName,
    });

    if (value < minValue) minValue = value;
    if (value > maxValue) maxValue = value;
  }

  return {
    data,
    series: Array.from(seriesSet),
    metadata: {
      totalRecords: records.length,
      valueRange: minValue !== Infinity ? { min: minValue, max: maxValue } : undefined,
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
    const numericFields = findNumericFields(firstRecord, fields);
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
    { x: 'current', y: latest },
    { x: 'average', y: avg },
    { x: 'min', y: min },
    { x: 'max', y: max },
  ];

  return {
    data,
    series: ['stats'],
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
    const numericFields = findNumericFields(firstRecord, fields);
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
    data: [{ x: 'gauge', y: latestValue }],
    series: ['gauge'],
    metadata: {
      totalRecords: records.length,
      valueRange: { min: latestValue, max: latestValue },
    },
  };
}

/**
 * Transform data for table panels (preserve all data)
 */
function transformForTable(
  records: NDJSONRecord[]
): TransformedData {
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
    series: ['table'],
    metadata: {
      totalRecords: records.length,
    },
  };
}

// Utility functions

function findTimeField(fields: string[]): string | null {
  const timePatterns = ['__timestamp', 'timestamp', 'time', 'date', 'created_at', 'updated_at'];
  
  for (const pattern of timePatterns) {
    const field = fields.find(f => f.toLowerCase() === pattern.toLowerCase());
    if (field) return field;
  }
  
  // Look for fields containing time-related words
  for (const field of fields) {
    const lower = field.toLowerCase();
    if (lower.includes('time') || lower.includes('date') || lower.includes('timestamp')) {
      return field;
    }
  }
  
  return null;
}

function findNumericFields(record: NDJSONRecord, fields: string[]): string[] {
  return fields.filter(field => {
    const value = record[field];
    return typeof value === 'number' || (typeof value === 'string' && !isNaN(Number(value)));
  });
}

function findStringFields(record: NDJSONRecord, fields: string[]): string[] {
  return fields.filter(field => {
    const value = record[field];
    return typeof value === 'string' && isNaN(Number(value));
  });
}

function parseNumericValue(value: any): number | null {
  if (value === null || value === undefined) return null;
  
  const num = Number(value);
  return isNaN(num) ? null : num;
}

function parseTimeValue(value: any): Date | null {
  if (!value) return null;
  
  if (value instanceof Date) return value;
  
  // Try to parse as timestamp (various units)
  if (typeof value === 'number' || (typeof value === 'string' && !isNaN(Number(value)))) {
    const numValue = Number(value);
    
    // Auto-detect timestamp format based on value size
    if (numValue > 1e15) {
      // Nanoseconds (like your data: 1750839465670078000)
      return DataTransformer.convertTimestamp(numValue, 'ns');
    } else if (numValue > 1e12) {
      // Microseconds  
      return DataTransformer.convertTimestamp(numValue, 'us');
    } else if (numValue > 1e10) {
      // Milliseconds
      return DataTransformer.convertTimestamp(numValue, 'ms');
    } else {
      // Seconds
      return DataTransformer.convertTimestamp(numValue, 's');
    }
  }
  
  // Try to parse as ISO string
  try {
    return new Date(value);
  } catch {
    return null;
  }
}

export function parseNDJSON(ndjsonString: string): NDJSONRecord[] {
  // Use the utility from DataTransformer
  const { records } = DataTransformer.parseNDJSON(ndjsonString);
  return records;
}