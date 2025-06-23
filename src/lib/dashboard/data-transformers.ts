import {
  type NDJSONRecord,
  type ChartDataPoint,
  type PanelConfig,
  type DataMapping,
} from "@/types/dashboard.types";

export interface TransformedData {
  data: ChartDataPoint[];
  series: string[];
  labels: string[];
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

export function parseNDJSON(ndjsonString: string): NDJSONRecord[] {
  if (!ndjsonString || typeof ndjsonString !== 'string') {
    return [];
  }

  const records: NDJSONRecord[] = [];
  const lines = ndjsonString.trim().split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    try {
      const record = JSON.parse(trimmedLine);
      records.push(record);
    } catch (error) {
      console.warn('Failed to parse NDJSON line:', trimmedLine, error);
      // Continue processing other lines
    }
  }

  return records;
}

export function transformDataForPanel(
  records: NDJSONRecord[],
  config: PanelConfig
): TransformedData {
  const { dataMapping, type } = config;

  switch (type) {
    case 'timeseries':
    case 'line':
    case 'area':
      return transformForTimeSeriesPanel(records, dataMapping);
    
    case 'bar':
    case 'scatter':
      return transformForBarScatterPanel(records, dataMapping);
    
    case 'stat':
      return transformForStatPanel(records, dataMapping);
    
    case 'gauge':
      return transformForGaugePanel(records, dataMapping);
    
    case 'table':
      return transformForTablePanel(records, dataMapping);
    
    default:
      return transformForGenericPanel(records, dataMapping);
  }
}

function transformForTimeSeriesPanel(
  records: NDJSONRecord[],
  mapping: DataMapping
): TransformedData {
  console.log('transformForTimeSeriesPanel called with:', {
    recordCount: records.length,
    mapping,
    sampleRecord: records[0]
  });
  
  const { timeColumn, valueColumn, seriesColumn, labelColumns = [] } = mapping;
  
  const data: ChartDataPoint[] = [];
  const seriesSet = new Set<string>();
  const labelsSet = new Set<string>();
  
  let minTime: Date | null = null;
  let maxTime: Date | null = null;
  let minValue = Infinity;
  let maxValue = -Infinity;

  for (const record of records) {
    const value = parseNumericValue(record[valueColumn]);
    if (value === null) continue;

    // Extract time
    let timeValue: Date | null = null;
    if (timeColumn) {
      timeValue = parseTimeValue(record[timeColumn]);
    } else {
      // Try common time fields
      timeValue = parseTimeValue(record.__timestamp) ||
                  parseTimeValue(record.timestamp) ||
                  parseTimeValue(record.time) ||
                  parseTimeValue(record.date);
    }

    if (!timeValue) {
      console.warn('No valid time value found for record:', record);
      continue;
    }

    // Extract series name
    const seriesName = seriesColumn ? String(record[seriesColumn] || 'default') : 'default';
    seriesSet.add(seriesName);

    // Extract labels
    const labels: string[] = [];
    for (const labelCol of labelColumns) {
      if (record[labelCol] !== undefined) {
        labels.push(String(record[labelCol]));
        labelsSet.add(String(record[labelCol]));
      }
    }

    const dataPoint: ChartDataPoint = {
      x: timeValue,
      y: value,
      series: seriesName,
      ...labels.reduce((acc, label, index) => {
        acc[labelColumns[index]] = label;
        return acc;
      }, {} as Record<string, any>),
    };

    data.push(dataPoint);

    // Update ranges
    if (!minTime || timeValue < minTime) minTime = timeValue;
    if (!maxTime || timeValue > maxTime) maxTime = timeValue;
    if (value < minValue) minValue = value;
    if (value > maxValue) maxValue = value;
  }

  // Sort by time
  data.sort((a, b) => {
    const timeA = a.x instanceof Date ? a.x.getTime() : Number(a.x);
    const timeB = b.x instanceof Date ? b.x.getTime() : Number(b.x);
    return timeA - timeB;
  });

  const result = {
    data,
    series: Array.from(seriesSet),
    labels: Array.from(labelsSet),
    metadata: {
      totalRecords: records.length,
      timeRange: minTime && maxTime ? { min: minTime, max: maxTime } : undefined,
      valueRange: minValue !== Infinity ? { min: minValue, max: maxValue } : undefined,
    },
  };

  console.log('transformForTimeSeriesPanel result:', {
    dataPointCount: result.data.length,
    series: result.series,
    timeRange: result.metadata.timeRange,
    valueRange: result.metadata.valueRange,
    sampleDataPoint: result.data[0]
  });

  return result;
}

function transformForBarScatterPanel(
  records: NDJSONRecord[],
  mapping: DataMapping
): TransformedData {
  const { valueColumn, labelColumns = [], seriesColumn } = mapping;
  
  const data: ChartDataPoint[] = [];
  const seriesSet = new Set<string>();
  const labelsSet = new Set<string>();
  
  let minValue = Infinity;
  let maxValue = -Infinity;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const value = parseNumericValue(record[valueColumn]);
    if (value === null) continue;

    // Use index or first label column as X axis
    const xValue = labelColumns.length > 0 ? 
      String(record[labelColumns[0]] || i) : 
      i;

    const seriesName = seriesColumn ? String(record[seriesColumn] || 'default') : 'default';
    seriesSet.add(seriesName);

    // Extract labels
    const labels: string[] = [];
    for (const labelCol of labelColumns) {
      if (record[labelCol] !== undefined) {
        labels.push(String(record[labelCol]));
        labelsSet.add(String(record[labelCol]));
      }
    }

    const dataPoint: ChartDataPoint = {
      x: xValue,
      y: value,
      series: seriesName,
      ...labels.reduce((acc, label, index) => {
        acc[labelColumns[index]] = label;
        return acc;
      }, {} as Record<string, any>),
    };

    data.push(dataPoint);

    if (value < minValue) minValue = value;
    if (value > maxValue) maxValue = value;
  }

  return {
    data,
    series: Array.from(seriesSet),
    labels: Array.from(labelsSet),
    metadata: {
      totalRecords: records.length,
      valueRange: minValue !== Infinity ? { min: minValue, max: maxValue } : undefined,
    },
  };
}

function transformForStatPanel(
  records: NDJSONRecord[],
  mapping: DataMapping
): TransformedData {
  const { valueColumn } = mapping;
  
  const values: number[] = [];
  for (const record of records) {
    const value = parseNumericValue(record[valueColumn]);
    if (value !== null) {
      values.push(value);
    }
  }

  if (values.length === 0) {
    return {
      data: [],
      series: [],
      labels: [],
      metadata: { totalRecords: 0 },
    };
  }

  // Calculate statistics
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const latest = values[values.length - 1];

  const data: ChartDataPoint[] = [
    { x: 'current', y: latest },
    { x: 'average', y: avg },
    { x: 'min', y: min },
    { x: 'max', y: max },
    { x: 'total', y: sum },
  ];

  return {
    data,
    series: ['stats'],
    labels: ['current', 'average', 'min', 'max', 'total'],
    metadata: {
      totalRecords: records.length,
      valueRange: { min, max },
    },
  };
}

function transformForGaugePanel(
  records: NDJSONRecord[],
  mapping: DataMapping
): TransformedData {
  const { valueColumn } = mapping;
  
  // Use the latest value for gauge
  let latestValue: number | null = null;
  
  for (let i = records.length - 1; i >= 0; i--) {
    const value = parseNumericValue(records[i][valueColumn]);
    if (value !== null) {
      latestValue = value;
      break;
    }
  }

  if (latestValue === null) {
    return {
      data: [],
      series: [],
      labels: [],
      metadata: { totalRecords: 0 },
    };
  }

  const data: ChartDataPoint[] = [
    { x: 'gauge', y: latestValue },
  ];

  return {
    data,
    series: ['gauge'],
    labels: ['current'],
    metadata: {
      totalRecords: records.length,
      valueRange: { min: latestValue, max: latestValue },
    },
  };
}

function transformForTablePanel(
  records: NDJSONRecord[],
  mapping: DataMapping
): TransformedData {
  const { displayColumns = [] } = mapping;
  
  const data: ChartDataPoint[] = [];
  const labelsSet = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const rowData: ChartDataPoint = {
      x: i,
      y: 0, // Not used for tables
    };

    // Include all columns if none specified
    const columnsToShow = displayColumns.length > 0 ? displayColumns : Object.keys(record);
    
    for (const col of columnsToShow) {
      if (record[col] !== undefined) {
        rowData[col] = record[col];
        labelsSet.add(col);
      }
    }

    data.push(rowData);
  }

  return {
    data,
    series: ['table'],
    labels: Array.from(labelsSet),
    metadata: {
      totalRecords: records.length,
    },
  };
}

function transformForGenericPanel(
  records: NDJSONRecord[],
  mapping: DataMapping
): TransformedData {
  // Default transformation - treat as simple value over index
  return transformForBarScatterPanel(records, mapping);
}

// Utility functions
function parseNumericValue(value: any): number | null {
  if (value === null || value === undefined) return null;
  
  const num = Number(value);
  return isNaN(num) ? null : num;
}

function parseTimeValue(value: any): Date | null {
  if (!value) return null;
  
  // Handle different time formats
  if (value instanceof Date) return value;
  
  if (typeof value === 'string') {
    // Try parsing as ISO date first
    let date = new Date(value);
    if (!isNaN(date.getTime())) return date;
    
    // Try parsing as numeric timestamp
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      return parseTimeValue(numValue);
    }
    
    return null;
  }
  
  if (typeof value === 'number') {
    // Handle different timestamp formats:
    // - Nanoseconds: > 1e15 (divide by 1e6)
    // - Microseconds: > 1e12 (divide by 1e3) 
    // - Milliseconds: > 1e10 (use as is)
    // - Seconds: <= 1e10 (multiply by 1000)
    let timestamp: number;
    
    if (value > 1e15) {
      // Nanoseconds to milliseconds
      timestamp = value / 1e6;
    } else if (value > 1e12) {
      // Microseconds to milliseconds
      timestamp = value / 1e3;
    } else if (value > 1e10) {
      // Already in milliseconds
      timestamp = value;
    } else {
      // Seconds to milliseconds
      timestamp = value * 1000;
    }
    
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? null : date;
  }
  
  return null;
}

export function aggregateDataPoints(
  data: ChartDataPoint[],
  aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count' = 'avg',
  groupBy?: string
): ChartDataPoint[] {
  if (!groupBy) return data;

  const groups = new Map<string, ChartDataPoint[]>();
  
  for (const point of data) {
    const key = String(point[groupBy] || 'default');
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(point);
  }

  const result: ChartDataPoint[] = [];
  
  for (const [key, points] of groups) {
    const values = points.map(p => p.y).filter(v => typeof v === 'number');
    
    if (values.length === 0) continue;
    
    let aggregatedValue: number;
    switch (aggregation) {
      case 'sum':
        aggregatedValue = values.reduce((a, b) => a + b, 0);
        break;
      case 'avg':
        aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      case 'min':
        aggregatedValue = Math.min(...values);
        break;
      case 'max':
        aggregatedValue = Math.max(...values);
        break;
      case 'count':
        aggregatedValue = values.length;
        break;
      default:
        aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length;
    }

    const { x: _, y: __, ...otherProps } = points[0];
    result.push({
      x: key,
      y: aggregatedValue,
      series: points[0].series,
      ...otherProps, // Include other properties from first point (excluding x and y)
    });
  }

  return result;
}

export function filterDataByTimeRange(
  data: ChartDataPoint[],
  startTime: Date,
  endTime: Date,
  timeField: string = 'x'
): ChartDataPoint[] {
  return data.filter(point => {
    const timeValue = point[timeField];
    if (!timeValue) return false;
    
    const date = timeValue instanceof Date ? timeValue : new Date(timeValue);
    return date >= startTime && date <= endTime;
  });
}