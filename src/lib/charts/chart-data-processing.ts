import type { QueryResult } from "@/types";

export function processChartData(
  data: QueryResult[],
  config: {
    xField?: string;
    yField?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }
): QueryResult[] {
  if (!data || !Array.isArray(data)) return [];
  if (!config) return data;

  // Create a copy to avoid mutating original data
  let processedData = [...data];

  // Sort data if sortBy is specified
  if (config.sortBy) {
    processedData.sort((a, b) => {
      const aVal = a[config.sortBy!];
      const bVal = b[config.sortBy!];

      // Handle null/undefined values
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      let comparison = 0;

      // Handle different data types
      if (typeof aVal === "number" && typeof bVal === "number") {
        comparison = aVal - bVal;
      } else if (aVal instanceof Date && bVal instanceof Date) {
        comparison = aVal.getTime() - bVal.getTime();
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return config.sortOrder === "desc" ? -comparison : comparison;
    });
  }

  return processedData;
}

export function transformDataForChart(
  data: QueryResult[],
  chartType: string,
  options?: {
    xField?: string;
    yField?: string;
    groupBy?: string;
    timeField?: string;
  }
): QueryResult[] {
  if (!data || !Array.isArray(data)) return [];

  let transformedData = [...data];

  // Apply chart-specific transformations
  switch (chartType) {
    case "line":
    case "area":
      // For line/area charts, ensure data is sorted by x-axis
      if (options?.xField) {
        transformedData = processChartData(data, {
          sortBy: options.xField,
          sortOrder: "asc",
        });
      }
      break;

    case "bar":
      // For bar charts, might want different sorting
      if (options?.xField) {
        transformedData = processChartData(data, {
          sortBy: options.xField,
          sortOrder: "asc",
        });
      }
      break;

    default:
      // For other chart types, return data as-is
      break;
  }

  return transformedData;
}

export function aggregateData(
  data: QueryResult[],
  groupBy: string,
  aggregateField: string,
  aggregationType: "sum" | "avg" | "count" | "min" | "max" = "sum"
): QueryResult[] {
  if (!data || !Array.isArray(data) || !groupBy) return data;

  const grouped = data.reduce((acc, row) => {
    const key = String(row[groupBy]);
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(row);
    return acc;
  }, {} as Record<string, QueryResult[]>);

  return Object.entries(grouped).map(([key, rows]) => {
    const baseRow = { ...rows[0], [groupBy]: key };

    if (aggregateField && rows.length > 0) {
      const values = rows
        .map((row: QueryResult) => Number(row[aggregateField]))
        .filter((val: number) => !isNaN(val));

      switch (aggregationType) {
        case "sum":
          baseRow[aggregateField] = values.reduce((sum: number, val: number) => sum + val, 0);
          break;
        case "avg":
          baseRow[aggregateField] =
            values.length > 0
              ? values.reduce((sum: number, val: number) => sum + val, 0) / values.length
              : 0;
          break;
        case "count":
          baseRow[aggregateField] = values.length;
          break;
        case "min":
          baseRow[aggregateField] = values.length > 0 ? Math.min(...values) : 0;
          break;
        case "max":
          baseRow[aggregateField] = values.length > 0 ? Math.max(...values) : 0;
          break;
      }
    }

    return baseRow;
  });
}
