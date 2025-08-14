import type uPlot from "uplot";
import type { NDJSONRecord, PanelConfig } from "@/types/dashboard.types";
import type { TransformedData } from "../core/types";
import { parseTimeValue } from "@/lib/time";

/**
 * Transform row-based data to uPlot's columnar format
 * uPlot expects: [
 *   [x1, x2, x3, ...],  // x-values (timestamps)
 *   [y1, y2, y3, ...],  // series 1
 *   [y1, y2, y3, ...],  // series 2
 * ]
 */
export function transformToUPlotData(
  records: NDJSONRecord[],
  config: PanelConfig
): TransformedData {
  // Always return valid data structure with proper timestamp
  const now = Date.now() / 1000; // uPlot uses seconds
  const emptyResult: TransformedData = {
    data: [[now], [0]], // Valid timestamp and value
    series: ["No Data"],
    metadata: {
      totalRecords: 0,
      timeRange: {
        min: new Date(now * 1000),
        max: new Date(now * 1000),
      },
      valueRange: {
        min: 0,
        max: 0,
      },
    },
  };

  if (!records || records.length === 0) {
    return emptyResult;
  }

  const { fieldMapping } = config;
  const firstRecord = records[0];
  const fields = Object.keys(firstRecord);

  // Determine fields to use
  let xField: string | null = null;
  let yField: string | null = null;
  let seriesField: string | undefined;

  if (fieldMapping?.xField && fieldMapping?.yField) {
    xField = fieldMapping.xField;
    yField = fieldMapping.yField;
    seriesField = fieldMapping.seriesField;
  } else {
    // Auto-detect fields
    xField = detectTimeField(fields);
    yField = detectNumericField(firstRecord, fields);
  }

  if (!xField || !yField) {
    return emptyResult;
  }

  // Group data by series
  const seriesMap = new Map<string, { x: number[]; y: (number | null)[] }>();
  const xValues = new Set<number>();

  for (const record of records) {
    // Parse x value (time)
    let xValue: number;
    const xRaw = record[xField];

    if (xField === "__timestamp" || xField.toLowerCase().includes("time")) {
      // Handle raw number timestamps first (most efficient path)
      if (typeof xRaw === "number") {
        // Timestamp magnitude analysis for debugging
        // (Debug logs removed for production)

        // Detect time unit based on magnitude
        if (xRaw > 1e18) {
          // Nanoseconds (> 1e18)
          xValue = Math.floor(xRaw / 1000000); // Convert ns to ms
        } else if (xRaw > 1e15) {
          // Microseconds (> 1e15, < 1e18)
          xValue = Math.floor(xRaw / 1000); // Convert us to ms
        } else if (xRaw > 1e12) {
          // Milliseconds (> 1e12, < 1e15)
          xValue = xRaw;
        } else if (xRaw > 1e9) {
          // Seconds (> 1e9, < 1e12)
          xValue = xRaw * 1000; // Convert s to ms
        } else {
          // Likely relative time or invalid
          xValue = xRaw * 1000; // Assume seconds
        }
      } else {
        // Parse as date string
        const timeValue = parseTimeValue(xRaw);
        if (!timeValue) continue;
        xValue = timeValue.getTime(); // Already in milliseconds
      }

      // Convert milliseconds to seconds for uPlot
      xValue = xValue / 1000;
    } else {
      xValue = typeof xRaw === "number" ? xRaw : parseFloat(String(xRaw));
      if (isNaN(xValue)) continue;
    }

    xValues.add(xValue);

    // Parse y value
    const yValue = parseFloat(String(record[yField]));
    if (isNaN(yValue)) continue;

    // Determine series name
    const seriesName =
      seriesField && record[seriesField] ? String(record[seriesField]) : yField;

    if (!seriesMap.has(seriesName)) {
      seriesMap.set(seriesName, { x: [], y: [] });
    }

    const series = seriesMap.get(seriesName)!;
    series.x.push(xValue);
    series.y.push(yValue);
  }

  // Convert to uPlot format
  const sortedX = Array.from(xValues).sort((a, b) => a - b);
  const data: uPlot.AlignedData = [sortedX];
  const seriesNames: string[] = [];

  // Align all series to the same x-axis with interpolation
  for (const [name, series] of seriesMap.entries()) {
    seriesNames.push(name);
    const alignedY: (number | null)[] = [];

    // Sort series data by x values for interpolation
    const sortedIndices = series.x
      .map((_, i) => i)
      .sort((a, b) => series.x[a] - series.x[b]);
    
    const sortedSeriesX = sortedIndices.map(i => series.x[i]);
    const sortedSeriesY = sortedIndices.map(i => series.y[i]);

    // Align to common x-axis with linear interpolation
    for (const x of sortedX) {
      // Find exact match first
      const exactIdx = sortedSeriesX.indexOf(x);
      if (exactIdx !== -1) {
        alignedY.push(sortedSeriesY[exactIdx]);
        continue;
      }

      // Find surrounding points for interpolation
      let lowIdx = -1;
      let highIdx = -1;
      
      for (let i = 0; i < sortedSeriesX.length; i++) {
        if (sortedSeriesX[i] < x) {
          lowIdx = i;
        } else if (sortedSeriesX[i] > x) {
          highIdx = i;
          break;
        }
      }

      // Interpolate if we have surrounding points
      if (lowIdx !== -1 && highIdx !== -1 && sortedSeriesY[lowIdx] != null && sortedSeriesY[highIdx] != null) {
        const x1 = sortedSeriesX[lowIdx];
        const x2 = sortedSeriesX[highIdx];
        const y1 = sortedSeriesY[lowIdx]!;
        const y2 = sortedSeriesY[highIdx]!;
        
        // Linear interpolation
        const interpolatedY = y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
        alignedY.push(interpolatedY);
      } else {
        // No interpolation possible, use null
        alignedY.push(null);
      }
    }

    data.push(alignedY);
  }

  // Calculate metadata
  let minTime: Date | undefined;
  let maxTime: Date | undefined;
  let minValue = Infinity;
  let maxValue = -Infinity;

  if (sortedX.length > 0) {
    minTime = new Date(sortedX[0]);
    maxTime = new Date(sortedX[sortedX.length - 1]);
  }

  for (let i = 1; i < data.length; i++) {
    for (const val of data[i]) {
      if (val !== null && val !== undefined) {
        if (val < minValue) minValue = val;
        if (val > maxValue) maxValue = val;
      }
    }
  }

  // Ensure we always have valid data
  if (data.length < 2 || data[0].length === 0) {
    return emptyResult;
  }

  return {
    data,
    series: seriesNames.length > 0 ? seriesNames : ["Data"],
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
 * Transform data specifically for bar charts
 */
export function transformForBarChart(
  records: NDJSONRecord[],
  config: PanelConfig
): TransformedData {
  // Bar charts use the same transformation as time series
  const result = transformToUPlotData(records, config);

  // Ensure valid data for bar charts
  if (!result.data || result.data.length < 2 || result.data[0].length === 0) {
    return {
      data: [[0], [0]],
      series: ["No Data"],
      metadata: { totalRecords: 0 },
    };
  }

  return result;
}

/**
 * Transform data for scatter plots
 */
export function transformForScatter(
  records: NDJSONRecord[],
  config: PanelConfig
): TransformedData {
  // Scatter plots use the same transformation
  const result = transformToUPlotData(records, config);

  // Ensure valid data for scatter plots
  if (!result.data || result.data.length < 2 || result.data[0].length === 0) {
    return {
      data: [[0], [0]],
      series: ["No Data"],
      metadata: { totalRecords: 0 },
    };
  }

  return result;
}

/**
 * Detect time field from column names
 */
function detectTimeField(fields: string[]): string | null {
  // Priority order for time field detection
  const patterns = [
    "__timestamp",
    "timestamp",
    "time",
    "date",
    "created_at",
    "updated_at",
    "event_time",
  ];

  for (const pattern of patterns) {
    const field = fields.find((f) => f.toLowerCase() === pattern.toLowerCase());
    if (field) return field;
  }

  // Check for fields containing time-related words
  const timeField = fields.find(
    (f) => f.toLowerCase().includes("time") || f.toLowerCase().includes("date")
  );

  return timeField || null;
}

/**
 * Detect numeric field from record
 */
function detectNumericField(
  record: NDJSONRecord,
  fields: string[]
): string | null {
  for (const field of fields) {
    const value = record[field];
    if (
      typeof value === "number" ||
      (typeof value === "string" && !isNaN(Number(value)))
    ) {
      // Skip fields that look like IDs or counts
      if (
        !field.toLowerCase().includes("id") &&
        !field.toLowerCase().includes("count")
      ) {
        return field;
      }
    }
  }

  // Fallback to any numeric field
  for (const field of fields) {
    const value = record[field];
    if (
      typeof value === "number" ||
      (typeof value === "string" && !isNaN(Number(value)))
    ) {
      return field;
    }
  }

  return null;
}
