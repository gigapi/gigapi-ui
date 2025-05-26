import React, {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useQuery } from "@/contexts/QueryContext";
import {
  GigChart,
  createBarChart,
  createLineChart,
  createAreaChart,
} from "@/components/GigChart";
import { Info, Calendar, Hash } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { formatISO } from "date-fns";
import { isDateString } from "@/lib/date-utils";
import Loader from "@/components/Loader";

// Define chart type options
type ChartType = "bar" | "line" | "area" | "horizontalBar";

// Type definitions for schema data
interface ColumnSchema {
  columnName: string;
  dataType: string;
  timeUnit?: "s" | "ms" | "us" | "ns"; // Time unit for numeric timestamp fields
}

// Add a type for grouped data
interface GroupedData {
  [groupValue: string]: ProcessedDataItem[];
}

const Label = ({
  className = "",
  children,
  ...props
}: {
  className?: string;
  children: React.ReactNode;
} & React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label
    className={`text-xs font-medium text-muted-foreground ${className}`}
    {...props}
  >
    {children}
  </label>
);

// Type definitions for processed data
interface ProcessedDataItem {
  [key: string]: any;
}

// Helper function to check if a field name looks like a time field
const isTimeField = (fieldName: string): boolean => {
  const lowerField = fieldName.toLowerCase();
  return (
    lowerField.includes("time") ||
    lowerField.includes("date") ||
    lowerField.includes("timestamp") ||
    fieldName === "__timestamp"
  );
};

// Helper function to check if a value is likely a timestamp in various formats
const isTimestamp = (value: string | number): boolean => {
  const numValue = typeof value === "string" ? Number(value) : value;
  if (isNaN(numValue)) return false;

  // Check for various timestamp formats
  if (numValue > 1e18) return true; // Nanoseconds (19+ digits) - e.g. 1620000000000000000
  if (numValue > 1e15) return true; // Microseconds (16+ digits) - e.g. 1620000000000000
  if (numValue > 1e12) return true; // Milliseconds (13+ digits) - e.g. 1620000000000
  if (numValue > 1e9 && numValue < 1e11) return true; // Seconds (10 digits) - e.g. 1620000000

  return false;
};

// Helper function to convert timestamp to Date object based on unit
const convertTimestampToDate = (
  value: number,
  timeUnit?: string
): Date | null => {
  if (!value || isNaN(value)) return null;

  try {
    // Handle different timestamp scales
    if (timeUnit === "ns" || value > 1e18) {
      // Nanoseconds (19+ digits)
      return new Date(Math.floor(value / 1000000));
    } else if (timeUnit === "us" || value > 1e15) {
      // Microseconds (16+ digits)
      return new Date(Math.floor(value / 1000));
    } else if (timeUnit === "ms" || value > 1e12) {
      // Milliseconds (13+ digits)
      return new Date(value);
    } else if (timeUnit === "s" || (value > 1e9 && value < 1e11)) {
      // Seconds (10 digits)
      return new Date(value * 1000);
    }

    // If we can't determine the scale but it's reasonably sized:
    if (value > 946684800000) {
      // Jan 1, 2000 in milliseconds
      return new Date(value); // Assume milliseconds
    } else if (value > 946684800) {
      // Jan 1, 2000 in seconds
      return new Date(value * 1000); // Assume seconds
    }

    return null; // Can't determine proper scale
  } catch (e) {
    console.warn("Failed to convert timestamp:", value, timeUnit, e);
    return null;
  }
};

// Helper function to get field schema information
const getFieldSchema = (
  tableSchema: ColumnSchema[] | null,
  fieldName: string
): ColumnSchema | null => {
  if (!tableSchema) return null;
  return tableSchema.find((col) => col.columnName === fieldName) || null;
};

// Helper function to check if a string is an ISO date string
const isISODateString = (value: string): boolean => {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
};

// Add function to extract table name from SQL query
const extractTableName = (sql: string): string | null => {
  if (!sql) return null;

  // Common SQL patterns to extract table name
  const patterns = [
    /FROM\s+([a-zA-Z0-9_."]+)/i, // Standard FROM clause
    /JOIN\s+([a-zA-Z0-9_."]+)/i, // JOIN clause
    /INTO\s+([a-zA-Z0-9_."]+)/i, // INSERT INTO
    /UPDATE\s+([a-zA-Z0-9_."]+)/i, // UPDATE statement
    /TABLE\s+([a-zA-Z0-9_."]+)/i, // CREATE/ALTER TABLE
  ];

  for (const pattern of patterns) {
    const match = sql.match(pattern);
    if (match && match[1]) {
      // Handle quoted identifiers
      let tableName = match[1].trim();
      // Remove quotes if present
      if (
        (tableName.startsWith('"') && tableName.endsWith('"')) ||
        (tableName.startsWith("`") && tableName.endsWith("`"))
      ) {
        tableName = tableName.substring(1, tableName.length - 1);
      }
      return tableName;
    }
  }

  return null;
};

export default function QueryCharts() {
  const {
    results: rawQueryResults,
    isLoading,
    schema,
    selectedDb,
    selectedTable,
    query,
    getColumnsForTable,
  } = useQuery();

  // Chart type selector
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [selectedXAxis, setSelectedXAxis] = useState<string | null>(null);
  const [selectedYAxis, setSelectedYAxis] = useState<string | null>(null);
  // Add state for group by field
  const [selectedGroupBy, setSelectedGroupBy] = useState<string | null>(null);

  // Add ref for the chart instance to manage its lifecycle
  const chartInstanceRef = useRef<any>(null);

  // Use component mounted ref for safer async operations
  const componentMountedRef = useRef(true);

  // Set up cleanup on component unmount
  useEffect(() => {
    // Set initial mounted state
    componentMountedRef.current = true;

    // Cleanup function
    return () => {
      componentMountedRef.current = false;

      // Safely destroy chart instance if it exists
      if (chartInstanceRef.current) {
        try {
          chartInstanceRef.current.destroy();
          chartInstanceRef.current = null;
        } catch (error) {
          console.debug("Chart cleanup error (safely handled):", error);
        }
      }
    };
  }, []);


  // Helper function to aggregate data by category for better visualization
  const aggregateDataByCategory = useCallback(
    (data: any[], xField: string, yField: string) => {
      if (!data.length) return data;

      // Group by the X field category
      const categoryMap: Record<string, { sum: number; count: number }> = {};

      // Aggregate values
      data.forEach((item) => {
        const category = String(item[xField] || "undefined");
        const value =
          typeof item[yField] === "number"
            ? item[yField]
            : typeof item[yField] === "string" && !isNaN(Number(item[yField]))
            ? Number(item[yField])
            : 0;

        if (!categoryMap[category]) {
          categoryMap[category] = { sum: 0, count: 0 };
        }

        categoryMap[category].sum += value;
        categoryMap[category].count += 1;
      });

      // Convert back to an array with averaged values
      const aggregatedData = Object.entries(categoryMap).map(
        ([category, stats]) => ({
          [xField]: category,
          [yField]: stats.count > 1 ? stats.sum / stats.count : stats.sum,
          __aggregated: true,
          __originalCount: stats.count,
        })
      );

      // Sort data by the Y value for better visualization
      return aggregatedData.sort(
        (a, b) => (b[yField] as number) - (a[yField] as number)
      );
    },
    []
  );

  // Get the current table schema information
  const currentTableSchema = useMemo(() => {
    const tableName = selectedTable || extractTableName(query) || "";
    if (!tableName) return null;
    return getColumnsForTable(tableName);
  }, [selectedTable, query, getColumnsForTable]);

  // Helper function to process each row (moved before processedData useMemo)
  const rowProcessor = useMemo(
    () =>
      (row: any): Record<string, any> => {
        const newRow: Record<string, any> = {};
        if (!row || typeof row !== "object") return newRow;
        const keys = Object.keys(row);

        // Get column schema information for better timestamp handling
        const currentTable = selectedTable || extractTableName(query);
        const tableSchema = currentTable
          ? schema?.[selectedDb]?.find((t) => t.tableName === currentTable)
          : null;
        const columnSchemas = tableSchema?.columns || [];

        // Process each field in the row
        keys.forEach((key) => {
          let value = row[key];
          // Get schema info for this column if available
          const columnSchema = columnSchemas.find(
            (col) => col.columnName === key
          );
          const isDateTimeType =
            columnSchema?.timeUnit ||
            isTimeField(key) ||
            columnSchema?.dataType?.toLowerCase().includes("time") ||
            columnSchema?.dataType?.toLowerCase().includes("date");

          // Special handling for __timestamp field to ensure proper formatting
          if (key === "__timestamp" || isDateTimeType) {
            // Handle various timestamp formats
            try {
              if (typeof value === "string") {
                // Try to parse as ISO date string
                if (value.match(/^\d{4}-\d{2}-\d{2}T/)) {
                  // ISO format - keep as is
                  newRow[key] = value;
                  return;
                }

                // Check if it's a numeric string that could be a timestamp
                const numValue = Number(value);
                if (!isNaN(numValue)) {
                  const dateObj = convertTimestampToDate(
                    numValue,
                    columnSchema?.timeUnit
                  );
                  if (dateObj) {
                    newRow[key] = formatISO(dateObj);
                    return;
                  }
                }
              }
              // Handle numeric timestamps
              else if (typeof value === "number") {
                const dateObj = convertTimestampToDate(
                  value,
                  columnSchema?.timeUnit
                );
                if (dateObj) {
                  newRow[key] = formatISO(dateObj);
                  return;
                }
              }

              // Fallback: keep as is if we couldn't convert
              newRow[key] = value;
            } catch (e) {
              console.warn(`Failed to process timestamp field ${key}:`, e);
              newRow[key] = value;
            }
            return;
          }

          // Special handling for temporal field combinations
          if (
            key === "date" &&
            row["hour"] &&
            typeof row["date"] === "string" &&
            row["date"].match(/^\d{4}-\d{2}-\d{2}/)
          ) {
            try {
              // Create a combined datetime field
              const datePart = new Date(row["date"]);
              const hour = parseInt(String(row["hour"]), 10);
              if (!isNaN(hour) && hour >= 0 && hour < 24) {
                datePart.setHours(hour);
                datePart.setMinutes(0);
                datePart.setSeconds(0);
                newRow["date_hour"] = formatISO(datePart);
              }
            } catch (e) {
              // Failed to combine, use original
            }
          }

          // ---- Handle JSON string values ----
          if (typeof value === "string") {
            // Process potential JSON strings - identify by brackets and quotes
            if (
              value.includes("{") &&
              value.includes("}") &&
              value.includes('"')
            ) {
              try {
                const parsed = JSON.parse(value);

                // Handle parsed JSON objects - extract useful data for charting
                if (parsed && typeof parsed === "object") {
                  // Create normalized fields for common JSON patterns

                  // Pattern 1: {raw, parsed} pattern
                  if ("raw" in parsed && "parsed" in parsed) {
                    // Add the raw value as its own field
                    if (typeof parsed.raw === "string") {
                      newRow[`${key}_raw`] = parsed.raw;
                    }

                    // Handle nested parsed objects
                    if (
                      typeof parsed.parsed === "object" &&
                      parsed.parsed !== null
                    ) {
                      // For objects with a value property
                      if (
                        "value" in parsed.parsed &&
                        typeof parsed.parsed.value !== "object"
                      ) {
                        newRow[`${key}_value`] = parsed.parsed.value;
                      }

                      // Extract any user identifiers (common in protocols)
                      if (parsed.parsed.uri && parsed.parsed.uri._user) {
                        newRow[`${key}_user`] = parsed.parsed.uri._user;
                      }

                      // Extract methods (common in protocols)
                      if (
                        "method" in parsed.parsed &&
                        typeof parsed.parsed.method === "string"
                      ) {
                        newRow[`${key}_method`] = parsed.parsed.method;
                      }

                      // Flatten nested numeric values for charting
                      Object.entries(parsed.parsed).forEach(
                        ([nestedKey, nestedVal]) => {
                          if (typeof nestedVal === "number") {
                            newRow[`${key}_${nestedKey}`] = nestedVal;
                          }
                        }
                      );
                    }
                    // Direct parsed value if not an object
                    else if (typeof parsed.parsed !== "object") {
                      newRow[`${key}_value`] = parsed.parsed;
                    }
                  }

                  // Pattern 2: Key-value pairs separated by delimiters (common in logs/stats)
                  // Example: "CS=0;PS=1433;ES=1525;OS=229280"
                  else if (
                    "raw" in parsed &&
                    typeof parsed.raw === "string" &&
                    parsed.raw.includes("=") &&
                    (parsed.raw.includes(";") || parsed.raw.includes(","))
                  ) {
                    const delimiter = parsed.raw.includes(";") ? ";" : ",";
                    const pairs = parsed.raw.split(delimiter);

                    pairs.forEach((pair: string) => {
                      const [pairKey, pairVal] = pair.split("=");
                      if (pairKey && pairVal) {
                        const metricKey = `${key}_${pairKey.trim()}`;
                        // Convert numeric values
                        const numericVal = Number(pairVal.trim());
                        newRow[metricKey] = !isNaN(numericVal)
                          ? numericVal
                          : pairVal.trim();
                      }
                    });
                  }

                  // Pattern 3: Direct value extraction for simple JSON objects
                  else {
                    // Try to extract any useful primitive values
                    Object.entries(parsed).forEach(([jsonKey, jsonVal]) => {
                      if (typeof jsonVal !== "object" || jsonVal === null) {
                        newRow[`${key}_${jsonKey}`] = jsonVal;
                      }
                    });
                  }
                }

                // Also keep the plain value for backward compatibility
                if (parsed.parsed !== undefined) {
                  if (
                    typeof parsed.parsed === "object" &&
                    parsed.parsed !== null
                  ) {
                    if (parsed.parsed.value !== undefined) {
                      value = parsed.parsed.value;
                    }
                  } else {
                    value = parsed.parsed;
                  }
                } else if (
                  parsed.raw !== undefined &&
                  typeof parsed.raw !== "object"
                ) {
                  value = parsed.raw;
                }
              } catch (e) {
                // Not valid JSON, keep as string
              }
            }

            // Convert string numbers to actual numbers for processing
            if (!isNaN(Number(value))) {
              const numValue = Number(value);
              // If it looks like a timestamp, keep it as a string for proper handling
              if (
                numValue > 1000000000 &&
                (key.toLowerCase().includes("time") ||
                  key.toLowerCase().includes("date") ||
                  key === "__timestamp")
              ) {
                const dateObj = convertTimestampToDate(numValue);
                if (dateObj) {
                  value = formatISO(dateObj);
                } else {
                  value = String(value);
                }
              }
              // Convert other numeric strings to numbers if they're not IDs or special fields
              else if (
                !key.toLowerCase().includes("id") &&
                !key.toLowerCase().includes("uuid") &&
                !key.toLowerCase().includes("hash") &&
                !key.toLowerCase().includes("name") &&
                !key.includes("ip") &&
                !key.toLowerCase().includes("port")
              ) {
                value = numValue;
              }
            }
          }

          // Handle non-string objects (could be nested objects without JSON stringification)
          else if (typeof value === "object" && value !== null) {
            // Extract useful values from complex objects
            Object.entries(value).forEach(([objKey, objVal]) => {
              if (typeof objVal !== "object" || objVal === null) {
                newRow[`${key}_${objKey}`] = objVal;
              }
            });

            // For visualization, we need primitive values, so set value to null
            // The extracted fields above will be used instead
            value = null;
          }

          // Determine if this is a datetime field
          const isDateTime =
            isDateTimeType ||
            (typeof value === "string" &&
              (isTimestamp(value) ||
                isDateString(value) ||
                value.match(/^\d{4}-\d{2}-\d{2}T/)));

          if (isDateTime) {
            // Store temporal values as strings for proper handling
            newRow[key] = String(value);
          } else if (value === null || value === undefined) {
            newRow[key] = null;
          } else {
            newRow[key] = value;
          }
        });

        // Add derived fields based on payload size/content if available
        if (row["payload_size"] && !isNaN(Number(row["payload_size"]))) {
          newRow["payload_size_bytes"] = Number(row["payload_size"]);
        }

        // Check if fields were overridden
        for (const key of keys) {
          if (typeof newRow[key] === "undefined") {
            newRow[key] = row[key]; // Use original if not processed
          }
        }

        return newRow;
      },
    [schema, selectedDb, selectedTable, query]
  );

  // 1. Normalize and Process Raw Data
  const processedData = useMemo<ProcessedDataItem[]>(() => {
    if (!rawQueryResults) return [];

    let dataToProcess: any[] = [];

    if (Array.isArray(rawQueryResults)) {
      dataToProcess = rawQueryResults;
    } else if (
      typeof rawQueryResults === "object" &&
      rawQueryResults !== null &&
      "results" in rawQueryResults &&
      Array.isArray((rawQueryResults as any).results)
    ) {
      dataToProcess = (rawQueryResults as any).results;
    } else {
      return []; // Return empty if structure is not as expected
    }

    return dataToProcess.length > 0 ? dataToProcess.map(rowProcessor) : [];
  }, [rawQueryResults, rowProcessor]);

  // Determine field types using schema information
  const { allFields, numericFields, categoricalFields, timeFields } =
    useMemo(() => {
      if (!processedData || processedData.length === 0) {
        return {
          allFields: [],
          numericFields: [],
          categoricalFields: [],
          timeFields: [],
        };
      }

      const firstRow = processedData[0];
      const af = Object.keys(firstRow);
      const nf: string[] = [];
      const cf: string[] = [];
      const tf: string[] = [];

      af.forEach((fieldName) => {
        // Get schema info if available
        const fieldSchema = getFieldSchema(currentTableSchema, fieldName);

        if (fieldSchema) {
          // Use schema type information
          const dataType = fieldSchema.dataType.toLowerCase();

          // Check for time fields first
          if (
            fieldSchema.timeUnit ||
            dataType.includes("timestamp") ||
            dataType.includes("date") ||
            dataType.includes("time")
          ) {
            tf.push(fieldName);
          }
          // Numeric fields
          else if (
            dataType.includes("int") ||
            dataType.includes("float") ||
            dataType.includes("double") ||
            dataType.includes("numeric") ||
            dataType.includes("decimal")
          ) {
            nf.push(fieldName);
          }
          // All other fields are considered categorical
          else {
            cf.push(fieldName);
          }
        }
        // Fallback to value-based detection if schema not available
        else {
          // Check sample values
          const sampleSize = Math.min(5, processedData.length);
          let isNumeric = true;
          let isTime = false;

          for (let i = 0; i < sampleSize; i++) {
            const value = processedData[i][fieldName];

            // Skip null values
            if (value === null || value === undefined) continue;

            // Check for time values
            if (typeof value === "string" && isISODateString(value)) {
              isTime = true;
              break;
            }

            // Check for numeric values
            if (
              typeof value !== "number" &&
              (typeof value !== "string" || isNaN(Number(value)))
            ) {
              isNumeric = false;
            }
          }

          if (isTime) {
            tf.push(fieldName);
          } else if (isNumeric) {
            nf.push(fieldName);
          } else {
            cf.push(fieldName);
          }
        }
      });

      return {
        allFields: af,
        numericFields: nf,
        categoricalFields: cf,
        timeFields: tf,
      };
    }, [processedData, currentTableSchema, getFieldSchema]);

  // Function to group data by a selected categorical field
  const groupedData = useMemo(() => {
    if (!selectedGroupBy || !processedData.length) {
      return null;
    }

    // Handle special case: grouping by the same field as X or Y axis
    const isGroupingSameAsXAxis = selectedGroupBy === selectedXAxis;
    const isGroupingSameAsYAxis = selectedGroupBy === selectedYAxis;

    // When grouping by the X axis, we need a second field to distinguish groups
    if (isGroupingSameAsXAxis && selectedYAxis) {
      // Group data by the Y-axis value to visualize different series for each value
      const groups: GroupedData = {};
      processedData.forEach((item) => {
        const yValue = item[selectedYAxis];
        const groupValue = String(yValue || "undefined");
        if (!groups[groupValue]) {
          groups[groupValue] = [];
        }
        groups[groupValue].push(item);
      });
      return groups;
    }

    // When grouping by the Y axis, we can use the X-axis values as separate groups
    if (isGroupingSameAsYAxis && selectedXAxis) {
      // Use the unique X-axis values to form groups - showing a series for each X value
      const groups: GroupedData = {};
      processedData.forEach((item) => {
        const xValue = item[selectedXAxis];
        const groupValue = String(xValue || "undefined");
        if (!groups[groupValue]) {
          groups[groupValue] = [];
        }
        groups[groupValue].push(item);
      });
      return groups;
    }

    // Standard grouping (by a different field)
    const groups: GroupedData = {};

    processedData.forEach((item) => {
      const groupValue = item[selectedGroupBy]?.toString() || "undefined";
      if (!groups[groupValue]) {
        groups[groupValue] = [];
      }
      groups[groupValue].push(item);
    });

    // Limit the number of groups to prevent chart overcrowding
    const MAX_GROUPS = 10;
    const groupNames = Object.keys(groups);

    // If we have too many groups, keep only the top ones by item count
    if (groupNames.length > MAX_GROUPS) {
      // Sort groups by size (number of data points)
      const sortedGroups = groupNames
        .map((name) => ({ name, count: groups[name].length }))
        .sort((a, b) => b.count - a.count);

      // Keep only the top MAX_GROUPS groups
      const topGroups = sortedGroups.slice(0, MAX_GROUPS - 1);
      const keptGroups: GroupedData = {};

      // Add the top groups to the kept groups
      topGroups.forEach((group) => {
        keptGroups[group.name] = groups[group.name];
      });

      // Add an "Other" group with the remaining data points
      if (sortedGroups.length > MAX_GROUPS) {
        keptGroups["Other"] = sortedGroups
          .slice(MAX_GROUPS - 1)
          .flatMap((group) => groups[group.name]);
      }

      return keptGroups;
    }

    return groups;
  }, [processedData, selectedGroupBy, selectedXAxis, selectedYAxis]);

  // 3. Set Default Axis Selections
  useEffect(() => {
    if (processedData.length > 0) {
      // Always prefer date/time fields for X-axis
      if (timeFields.length > 0) {
        // Prefer specific time/date fields in this order: __timestamp, time, date_hour, hours, date, time_sec
        const preferredTimeFields = [
          "__timestamp",
          "time",
          "date_hour",
          "hours",
          "date",
          "time_sec",
          "time_usec",
          "create_date",
        ];
        const foundPreferredField = preferredTimeFields.find((field) =>
          timeFields.includes(field)
        );

        // Always set X-axis to time field regardless of previous selection
        setSelectedXAxis(foundPreferredField || timeFields[0]);
      } else if (categoricalFields.length > 0) {
        setSelectedXAxis(categoricalFields[0]);
      } else if (allFields.length > 0) {
        setSelectedXAxis(allFields[0]); // Fallback
      }

      // Set default Y-axis: prefer numeric fields, but avoid using the same field as X
      if (
        numericFields.length > 0 &&
        (!selectedXAxis || numericFields.indexOf(selectedXAxis) === -1)
      ) {
        // Find a numeric field that isn't the same as X-axis
        const filteredNumericFields = numericFields.filter(
          (field) => field !== selectedXAxis
        );
        if (filteredNumericFields.length > 0) {
          setSelectedYAxis(filteredNumericFields[0]);
        } else {
          setSelectedYAxis(numericFields[0]); // Fallback to any numeric field
        }
      } else if (allFields.length > 0 && allFields[0] !== selectedXAxis) {
        setSelectedYAxis(allFields[0]); // Fallback
      } else if (allFields.length > 1) {
        setSelectedYAxis(allFields[1]); // Fallback to second field
      }
    }

    // Add cleanup to prevent state updates after unmounting
    return () => {
      // This empty cleanup function ensures React knows this effect can be safely canceled
    };
  }, [processedData, timeFields, categoricalFields, numericFields, allFields]);

  // For chart visualization info logging, add cancellation handling
  useEffect(() => {
    let isMounted = true;

    return () => {
      isMounted = false;
    };
  }, [processedData, selectedXAxis, selectedYAxis]);

  // Fix any other useEffect calls that might cause cancellation warnings
  useEffect(() => {
    let isMounted = true;

    // Cleanup function to prevent updates after unmounting
    return () => {
      isMounted = false;
    };
  }, []);

  // Create chart configuration based on selected type and data
  const chartConfig = useMemo(() => {
    if (!selectedXAxis || !selectedYAxis || processedData.length === 0)
      return null;

    // Create a deep copy of processed data for manipulation
    let chartData = JSON.parse(JSON.stringify(processedData));

    // Determine the field types for visualization logic
    const isXAxisDateTime = timeFields.includes(selectedXAxis);
    const isYAxisDateTime = timeFields.includes(selectedYAxis);
    const isXAxisNumeric = numericFields.includes(selectedXAxis);
    const isYAxisNumeric = numericFields.includes(selectedYAxis);

    // Get field schema info for proper timestamp unit handling
    const xAxisSchema = getFieldSchema(currentTableSchema, selectedXAxis);
    const yAxisSchema = getFieldSchema(currentTableSchema, selectedYAxis);

    // Set axis variables based on current selection
    const xAxis = selectedXAxis;
    const yAxis = selectedYAxis;

    // Handle special case: grouping by a field that's also used on X or Y axis
    const isGroupingSameAsXAxis = selectedGroupBy === selectedXAxis;
    const isGroupingSameAsYAxis = selectedGroupBy === selectedYAxis;

    // If trying to group by the same field as X or Y axis, show a warning or modify behavior
    if (isGroupingSameAsXAxis || isGroupingSameAsYAxis) {
      console.warn(
        "Grouping by the same field that's used on an axis may produce unexpected results"
      );
      // We'll still try to visualize it, but the results may be limited
    }

    // Check if we should aggregate data for better visualization
    // Aggregate categorical data if not being grouped and there are many categories
    if (!isXAxisDateTime && !selectedGroupBy && !isXAxisNumeric) {
      // Count unique X values to see if aggregation would help
      const uniqueXValues = new Set(
        chartData.map((item: any) => String(item[xAxis]))
      );

      // If we have a lot of duplicate categories, use aggregation
      if (uniqueXValues.size < chartData.length / 2) {
        chartData = aggregateDataByCategory(chartData, xAxis, yAxis);
      }
    }

    // Pre-process data based on field types
    // For datetime axes, ensure we have proper point distribution
    if (isXAxisDateTime) {
      // Sort data by the selected X-axis for proper temporal order
      chartData.sort((a: any, b: any) => {
        const valueA = a[xAxis];
        const valueB = b[xAxis];

        // Handle dates or timestamps
        if (typeof valueA === "string" && typeof valueB === "string") {
          return new Date(valueA).getTime() - new Date(valueB).getTime();
        }
        return valueA - valueB;
      });
    }

    // Convert Y-axis string values to numbers if possible for better visualization
    chartData = chartData.map((item: Record<string, any>) => {
      const newItem = { ...item };

      // Handle Y-axis value conversion if it's a string number
      if (
        typeof newItem[yAxis] === "string" &&
        !isNaN(Number(newItem[yAxis])) &&
        !isYAxisDateTime // Don't convert datetime strings to numbers
      ) {
        newItem[yAxis] = Number(newItem[yAxis]);
      }

      return newItem;
    });

    // Enhanced options with toolbox for zooming and saving
    const enhancedOptions = {
      tooltip: true,
      legend: selectedGroupBy !== null, // Show legend when grouping
      toolbox: true,
      dataZoom: isXAxisDateTime, // Show zoom controls for time series
      title: selectedGroupBy
        ? `${yAxis} by ${xAxis}, grouped by ${selectedGroupBy}`
        : `${yAxis} by ${xAxis}`,
      xIsDateTime: isXAxisDateTime,
      yIsDateTime: isYAxisDateTime,
      xIsNumeric: isXAxisNumeric,
      yIsNumeric: isYAxisNumeric,
      showArea: chartType === "area", // Use showArea option for area charts
      // Add schema information for timestamp handling
      fieldInfo: {
        xIsDateTime: isXAxisDateTime,
        yIsDateTime: isYAxisDateTime,
        xField: selectedXAxis,
        yFields: [selectedYAxis],
        autoColors: true,
        // Include time unit information from schema
        timestampScale: (xAxisSchema?.timeUnit ||
          (isXAxisDateTime && isTimestamp(chartData[0]?.[xAxis])
            ? typeof chartData[0][xAxis] === "number" &&
              chartData[0][xAxis] > 1e15
              ? "microsecond"
              : chartData[0][xAxis] > 1e12
              ? "millisecond"
              : "second"
            : undefined)) as
          | "second"
          | "millisecond"
          | "microsecond"
          | "nanosecond"
          | undefined,
        timeFieldDetails: {
          xAxis: xAxisSchema
            ? {
                dataType: xAxisSchema.dataType,
                timeUnit: xAxisSchema.timeUnit,
              }
            : null,
          yAxis: yAxisSchema
            ? {
                dataType: yAxisSchema.dataType,
                timeUnit: yAxisSchema.timeUnit,
              }
            : null,
        },
      },
      // Enhanced chart options
      animation: true,
      animationDuration: 500,
      barGap: "10%", // Add gap between bars for multiple series
      barCategoryGap: "20%", // Add gap between categories
      barMaxWidth: 50, // Limit maximum width to ensure separation
      emphasis: {
        focus: "series",
        blurScope: "coordinateSystem",
      },
      visualMap: selectedGroupBy
        ? {
            show: false,
            dimension: 1, // Value dimension
            // Enable color gradient for better visual contrast
            inRange: {
              colorLightness: [0.8, 0.4],
              colorSaturation: [0.2, 0.8],
            },
          }
        : undefined,
    };

    // Determine chart type that best fits the data types
    let effectiveChartType = chartType;

    // For certain field type combinations, suggest better chart types
    if (isXAxisDateTime && !isYAxisNumeric && chartType === "bar") {
      // For time + non-numeric, line charts usually work better
      effectiveChartType = "line";
    } else if (
      !isXAxisDateTime &&
      !isXAxisNumeric &&
      isYAxisNumeric &&
      chartType === "line"
    ) {
      // For categorical + numeric, bar charts usually work better
      effectiveChartType = "bar";
    }

    // Special handling for horizontal bar charts
    const useHorizontalBars = effectiveChartType === "horizontalBar";
    // For area charts, we need to use 'line' type but enable the areaStyle
    const shouldUseAreaStyle = chartType === "area";

    if (useHorizontalBars) {
      // Convert back to regular bar for chart creation, but with horizontal option
      effectiveChartType = "bar";
    }

    // If grouping is active, use the grouped data
    if (selectedGroupBy && groupedData) {
      // For datetime X-axis with grouping, aggregate data points to avoid overcrowding
      if (isXAxisDateTime) {
        // Create series data for each group
        const series = Object.entries(groupedData).map(([groupName, items]) => {
          // Sort items by X-axis for proper line/area rendering
          items.sort((a: ProcessedDataItem, b: ProcessedDataItem) => {
            const aValue = a[xAxis];
            const bValue = b[xAxis];

            if (typeof aValue === "string" && typeof bValue === "string") {
              return new Date(aValue).getTime() - new Date(bValue).getTime();
            }
            return Number(aValue) - Number(bValue);
          });

          // For Y-axis, convert values appropriately based on data type
          return {
            name: groupName,
            data: items.map((item: ProcessedDataItem) => {
              const xValue = item[xAxis];
              let yValue = item[yAxis];

              // Convert to number if possible and not a datetime
              if (
                !isYAxisDateTime &&
                typeof yValue === "string" &&
                !isNaN(Number(yValue))
              ) {
                yValue = Number(yValue);
              } else if (yValue === null || yValue === undefined) {
                yValue = 0;
              }

              // For time series data, return [timestamp, value] format
              return [xValue, yValue];
            }),
            type: effectiveChartType,
          };
        });

        // For grouped data visualization with time X-axis
        switch (effectiveChartType) {
          case "bar":
            const barOptions = useHorizontalBars
              ? { ...enhancedOptions, forceHorizontal: true }
              : enhancedOptions;
            return createBarChart(chartData, xAxis, yAxis, barOptions, series);
          case "line":
            return createLineChart(
              chartData,
              xAxis,
              yAxis,
              enhancedOptions,
              series
            );
          case "area":
            return createAreaChart(
              chartData,
              xAxis,
              yAxis,
              enhancedOptions,
              series
            );
          default:
            return null;
        }
      } else {
        // For categorical X-axis with grouping, use a different approach
        // Prepare data for a stacked chart visualization
        const uniqueXValues = Array.from(
          new Set(chartData.map((item: ProcessedDataItem) => item[xAxis]))
        );

        // Create a matrix of data: X-values × groups
        const matrix: Record<string, Record<string, number>> = {};
        uniqueXValues.forEach((xValue: any) => {
          matrix[String(xValue)] = {};
          // Initialize with zeros
          Object.keys(groupedData).forEach((groupName: string) => {
            matrix[String(xValue)][groupName] = 0;
          });
        });

        // Fill the matrix with actual values
        Object.entries(groupedData).forEach(([groupName, items]) => {
          items.forEach((item: ProcessedDataItem) => {
            const xValue = String(item[xAxis]);
            let yValue = item[yAxis];

            // Convert to number if possible and not a datetime
            if (
              !isYAxisDateTime &&
              typeof yValue === "string" &&
              !isNaN(Number(yValue))
            ) {
              yValue = Number(yValue);
            } else if (typeof yValue !== "number") {
              yValue = 0; // Default for non-numeric values
            }

            // Aggregate values if there are multiple items with the same X-value in this group
            if (matrix[xValue]) {
              matrix[xValue][groupName] =
                (matrix[xValue][groupName] || 0) + Number(yValue);
            }
          });
        });

        // Convert matrix to series data
        const series = Object.keys(groupedData).map((groupName: string) => ({
          name: groupName,
          type: effectiveChartType,
          data: uniqueXValues.map(
            (xValue: any) => matrix[String(xValue)][groupName] || 0
          ),
          stack: effectiveChartType === "bar" ? "total" : undefined, // Stack bars but not lines/areas
        }));

        // For grouped data visualization with categorical X-axis
        switch (effectiveChartType) {
          case "bar":
            const barOptions = useHorizontalBars
              ? { ...enhancedOptions, forceHorizontal: true }
              : enhancedOptions;
            return createBarChart(chartData, xAxis, yAxis, barOptions, series);
          case "line":
            return createLineChart(
              chartData,
              xAxis,
              yAxis,
              enhancedOptions,
              series
            );
          case "area":
            return createAreaChart(
              chartData,
              xAxis,
              yAxis,
              enhancedOptions,
              series
            );
          default:
            return null;
        }
      }
    } else {
      // Standard single-series chart
      switch (effectiveChartType) {
        case "bar":
          const barOptions = useHorizontalBars
            ? { ...enhancedOptions, forceHorizontal: true }
            : enhancedOptions;
          // Check if data was aggregated and add tooltip info
          if (chartData.length > 0 && chartData[0].__aggregated) {
            const enhancedBarOptions = {
              ...barOptions,
              tooltip:
                typeof barOptions.tooltip === "object"
                  ? {
                      ...(barOptions.tooltip as object),
                      formatter: (params: any) => {
                        if (!params) return "";

                        try {
                          // Handle both single item and array of items
                          const paramArray = Array.isArray(params)
                            ? params
                            : [params];
                          const firstParam = paramArray[0];

                          if (!firstParam) return "";

                          const item = firstParam.data || {};
                          const categoryName = String(
                            item[xAxis] || firstParam.name || ""
                          );
                          const value =
                            typeof item[yAxis] === "number"
                              ? item[yAxis]
                              : typeof firstParam.value === "number"
                              ? firstParam.value
                              : 0;

                          // Get count if available, otherwise default to 1
                          const count = item.__originalCount || 1;

                          return `
                      <div style="font-weight:bold;margin-bottom:4px">${categoryName}</div>
                      <div>${
                        count > 1 ? "Average: " : "Value: "
                      }${value.toFixed(2)}</div>
                      ${
                        count > 1
                          ? `<div style="opacity:0.7;font-size:0.9em">(${count} data points)</div>`
                          : ""
                      }
                    `;
                        } catch (err) {
                          console.error("Error in tooltip formatter:", err);
                          return "Error displaying tooltip";
                        }
                      },
                    }
                  : {
                      formatter: (params: any) => {
                        if (!params) return "";

                        try {
                          // Handle both single item and array of items
                          const paramArray = Array.isArray(params)
                            ? params
                            : [params];
                          const firstParam = paramArray[0];

                          if (!firstParam) return "";

                          const item = firstParam.data || {};
                          const categoryName = String(
                            item[xAxis] || firstParam.name || ""
                          );
                          const value =
                            typeof item[yAxis] === "number"
                              ? item[yAxis]
                              : typeof firstParam.value === "number"
                              ? firstParam.value
                              : 0;

                          // Get count if available, otherwise default to 1
                          const count = item.__originalCount || 1;

                          return `
                      <div style="font-weight:bold;margin-bottom:4px">${categoryName}</div>
                      <div>${
                        count > 1 ? "Average: " : "Value: "
                      }${value.toFixed(2)}</div>
                      ${
                        count > 1
                          ? `<div style="opacity:0.7;font-size:0.9em">(${count} data points)</div>`
                          : ""
                      }
                    `;
                        } catch (err) {
                          console.error("Error in tooltip formatter:", err);
                          return "Error displaying tooltip";
                        }
                      },
                    },
            };
            return createBarChart(chartData, xAxis, yAxis, enhancedBarOptions);
          }
          return createBarChart(chartData, xAxis, yAxis, barOptions);
        case "line":
          // When shouldUseAreaStyle is true, we're creating a line chart with area style
          if (shouldUseAreaStyle) {
            return createAreaChart(chartData, xAxis, yAxis, enhancedOptions);
          }
          return createLineChart(chartData, xAxis, yAxis, enhancedOptions);
        case "area":
          return createAreaChart(chartData, xAxis, yAxis, enhancedOptions);
        default:
          return null;
      }
    }
  }, [
    processedData,
    selectedXAxis,
    selectedYAxis,
    chartType,
    timeFields,
    numericFields,
    selectedGroupBy,
    groupedData,
  ]);

  // Handler for axis changes
  const handleXAxisChange = (value: string) => {
    if (value === "_NONE_") setSelectedXAxis(null);
    else setSelectedXAxis(value);
  };

  const handleYAxisChange = (value: string) => {
    if (value === "_NONE_") setSelectedYAxis(null);
    else setSelectedYAxis(value);
  };

  // Handler for group by changes
  const handleGroupByChange = (value: string) => {
    if (value === "_NONE_") setSelectedGroupBy(null);
    else setSelectedGroupBy(value);
  };

  // Helper function to get data type badge
  const getDataTypeBadge = (field: string) => {
    const fieldSchema = getFieldSchema(currentTableSchema, field);

    if (timeFields.includes(field)) {
      const dataType = fieldSchema?.dataType.toUpperCase() || "TIME";
      const timeUnit = fieldSchema?.timeUnit
        ? ` (${fieldSchema.timeUnit})`
        : "";
      return (
        <Badge
          variant="outline"
          className="ml-2 text-[10px] font-mono py-0 h-4 px-1 bg-blue-500/10 text-blue-500 border-0"
        >
          {dataType}
          {timeUnit}
        </Badge>
      );
    } else if (numericFields.includes(field)) {
      const dataType = fieldSchema?.dataType.toUpperCase() || "NUM";
      return (
        <Badge
          variant="outline"
          className="ml-2 text-[10px] font-mono py-0 h-4 px-1 bg-green-500/10 text-green-500 border-0"
        >
          {dataType}
        </Badge>
      );
    } else if (categoricalFields.includes(field)) {
      const dataType = fieldSchema?.dataType.toUpperCase() || "TEXT";
      return (
        <Badge
          variant="outline"
          className="ml-2 text-[10px] font-mono py-0 h-4 px-1 bg-muted/30 border-0"
        >
          {dataType}
        </Badge>
      );
    }
    return null;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader className="h-12 w-12 " />
        <p className="mt-2 text-sm text-muted-foreground">Loading data...</p>
      </div>
    );
  }

  // No data state
  if (!processedData || processedData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-sm text-muted-foreground">
          No data available to display.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Label htmlFor="chartTypeSelect" className="text-xs font-semibold">
              Chart Type
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="max-w-xs">
                  Select the visualization type that best fits your data
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Tabs
            value={chartType}
            onValueChange={(value) => setChartType(value as ChartType)}
          >
            <TabsList className="grid grid-cols-4 gap-2">
              <TabsTrigger
                value="bar"
                className="text-xs flex items-center gap-1"
              >
                Bar
              </TabsTrigger>
              <TabsTrigger
                value="horizontalBar"
                className="text-xs flex items-center gap-1"
              >
                Bar Horizontal
              </TabsTrigger>
              <TabsTrigger
                value="line"
                className="text-xs flex items-center gap-1"
              >
                Line
              </TabsTrigger>
              <TabsTrigger
                value="area"
                className="text-xs flex items-center gap-1"
              >
                Area
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div>
          <div className="flex items-center gap-1 mb-1">
            <Label htmlFor="xAxisSelect" className="text-xs font-semibold">
              X-Axis{" "}
              {timeFields.includes(selectedXAxis || "") ? (
                <Calendar className="h-3 w-3 inline ml-1 text-blue-500" />
              ) : null}
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="max-w-xs">
                  Select a field for the X-axis. Time fields (marked with{" "}
                  <Calendar className="h-3 w-3 inline text-blue-500" />) work
                  best on X-axis.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Select
            value={selectedXAxis || "_NONE_"}
            onValueChange={handleXAxisChange}
          >
            <SelectTrigger
              id="xAxisSelect"
              className="w-[180px] h-8 text-xs border-border/40"
            >
              <SelectValue placeholder="Select X-Axis" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_NONE_"> (None) </SelectItem>
              {/* Show time fields first (recommended for X-axis) */}
              {timeFields.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-blue-500 flex items-center">
                    <Calendar className="h-3 w-3 inline mr-1" /> Time Fields
                  </div>
                  {timeFields.map((field) => (
                    <SelectItem
                      key={`dt-${field}`}
                      value={field}
                      className="text-xs flex items-center justify-between"
                    >
                      <span>{field}</span>
                      <Calendar className="h-3 w-3 text-blue-500" />
                    </SelectItem>
                  ))}
                  <div className="h-px bg-border/30 my-1.5 mx-1" />
                </>
              )}
              {/* Show all remaining fields */}
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center">
                All Fields
              </div>
              {allFields
                .filter((field) => !timeFields.includes(field))
                .map((field) => (
                  <SelectItem
                    key={`all-${field}`}
                    value={field}
                    className="text-xs flex items-center justify-between"
                  >
                    <span>{field}</span>
                    {getDataTypeBadge(field)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="flex items-center gap-1 mb-1">
            <Label htmlFor="yAxisSelect" className="text-xs font-semibold">
              Y-Axis (Value){" "}
              {numericFields.includes(selectedYAxis || "") ? (
                <Hash className="h-3 w-3 inline ml-1 text-green-500" />
              ) : null}
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="max-w-xs">
                  Select a numeric field for the Y-axis. Metric values (marked
                  with <Hash className="h-3 w-3 inline text-green-500" />) work
                  best on Y-axis.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Select
            value={selectedYAxis || "_NONE_"}
            onValueChange={handleYAxisChange}
          >
            <SelectTrigger
              id="yAxisSelect"
              className="w-[180px] h-8 text-xs border-border/40"
            >
              <SelectValue placeholder="Select Y-Axis" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_NONE_"> (None) </SelectItem>
              {/* Show numeric fields first (recommended for Y-axis) */}
              {numericFields.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-green-500 flex items-center">
                    <Hash className="h-3 w-3 inline mr-1" /> Metric Fields
                  </div>
                  {numericFields
                    .filter(
                      (field) =>
                        !timeFields.includes(field) &&
                        !field.toLowerCase().includes("time") &&
                        !field.toLowerCase().includes("date")
                    )
                    .map((field) => (
                      <SelectItem
                        key={`num-${field}`}
                        value={field}
                        className="text-xs flex items-center justify-between"
                      >
                        <span>{field}</span>
                        <Hash className="h-3 w-3 text-green-500" />
                      </SelectItem>
                    ))}
                  <div className="h-px bg-border/30 my-1.5 mx-1" />
                </>
              )}

              {/* Show all remaining fields */}
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center">
                All Fields
              </div>
              {allFields
                .filter(
                  (field) =>
                    numericFields.includes(field) === false ||
                    timeFields.includes(field) ||
                    field.toLowerCase().includes("time") ||
                    field.toLowerCase().includes("date") ||
                    field.toLowerCase().includes("timestamp")
                )
                .map((field) => (
                  <SelectItem
                    key={`all-${field}`}
                    value={field}
                    className="text-xs flex items-center justify-between"
                  >
                    <span>{field}</span>
                    {getDataTypeBadge(field)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* Group By Selector */}
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Label htmlFor="groupBySelect" className="text-xs font-semibold">
              Group By (Optional)
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="max-w-xs">
                  Group data by a categorical field to compare different
                  categories. This creates multiple series on your chart.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Select
            value={selectedGroupBy || "_NONE_"}
            onValueChange={handleGroupByChange}
          >
            <SelectTrigger
              id="groupBySelect"
              className="w-[180px] h-8 text-xs border-border/40"
            >
              <SelectValue placeholder="Select Group By Field" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_NONE_"> (None) </SelectItem>

              {/* Show categorical fields first (recommended for grouping) */}
              {categoricalFields.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center">
                    Categorical Fields
                  </div>
                  {categoricalFields
                    .filter((_) => true)
                    .map((field) => (
                      <SelectItem
                        key={`cat-${field}`}
                        value={field}
                        className="text-xs flex items-center justify-between"
                      >
                        <span>{field}</span>
                        {getDataTypeBadge(field)}
                      </SelectItem>
                    ))}
                  <div className="h-px bg-border/30 my-1.5 mx-1" />
                </>
              )}

              {/* Show all other fields */}
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center">
                All Fields
              </div>
              {allFields
                .filter(
                  (field) => !categoricalFields.includes(field)
                  // Allow using any field for grouping, even if already on X or Y axis
                )
                .map((field) => (
                  <SelectItem
                    key={`all-${field}`}
                    value={field}
                    className="text-xs flex items-center justify-between"
                  >
                    <span>{field}</span>
                    {getDataTypeBadge(field)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {numericFields.length === 0 && (
          <div className="text-xs text-amber-500 flex items-center gap-1 ml-2">
            <Info className="h-3 w-3" />
            <span>
              This data may contain nested JSON values that need extraction
            </span>
          </div>
        )}
      </div>

      {chartConfig ? (
        <div className="flex flex-col h-full">
          {/* Add field type information */}
          {selectedXAxis && selectedYAxis && (
            <div className="flex flex-wrap gap-2 mb-2 items-center text-xs text-muted-foreground mt-4">
              <div className="flex items-center">
                <span>X-Axis:</span>
                <Badge
                  variant="outline"
                  className={`ml-1 text-[10px] font-mono py-0 h-4 px-1 ${
                    selectedGroupBy === selectedXAxis
                      ? "bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800/40"
                      : "bg-muted/20 border-0"
                  }`}
                >
                  {selectedXAxis}
                  {timeFields.includes(selectedXAxis) && (
                    <Calendar className="h-3 w-3 inline ml-1 text-blue-500" />
                  )}
                  {numericFields.includes(selectedXAxis) &&
                    !timeFields.includes(selectedXAxis) && (
                      <Hash className="h-3 w-3 inline ml-1 text-green-500" />
                    )}
                  {selectedGroupBy === selectedXAxis && (
                    <span className="ml-1 text-[8px] text-blue-500 font-semibold">
                      +GROUP
                    </span>
                  )}
                </Badge>
              </div>
              <div className="flex items-center">
                <span>Y-Axis:</span>
                <Badge
                  variant="outline"
                  className={`ml-1 text-[10px] font-mono py-0 h-4 px-1 ${
                    selectedGroupBy === selectedYAxis
                      ? "bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800/40"
                      : "bg-muted/20 border-0"
                  }`}
                >
                  {selectedYAxis}
                  {timeFields.includes(selectedYAxis) && (
                    <Calendar className="h-3 w-3 inline ml-1 text-blue-500" />
                  )}
                  {numericFields.includes(selectedYAxis) &&
                    !timeFields.includes(selectedYAxis) && (
                      <Hash className="h-3 w-3 inline ml-1 text-green-500" />
                    )}
                  {selectedGroupBy === selectedYAxis && (
                    <span className="ml-1 text-[8px] text-green-500 font-semibold">
                      +GROUP
                    </span>
                  )}
                </Badge>
              </div>
              {selectedGroupBy && (
                <div className="flex items-center">
                  <span>Grouped By:</span>
                  <Badge
                    variant="outline"
                    className={`ml-1 text-[10px] font-mono py-0 h-4 px-1 
                      ${
                        selectedGroupBy === selectedXAxis
                          ? "bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800/40"
                          : selectedGroupBy === selectedYAxis
                          ? "bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800/40"
                          : "bg-muted/20 border-0"
                      }`}
                  >
                    {selectedGroupBy}
                    {selectedGroupBy === selectedXAxis && (
                      <span className="ml-1 text-[8px] text-blue-500 font-semibold">
                        X-AXIS
                      </span>
                    )}
                    {selectedGroupBy === selectedYAxis && (
                      <span className="ml-1 text-[8px] text-green-500 font-semibold">
                        Y-AXIS
                      </span>
                    )}
                  </Badge>
                </div>
              )}
            </div>
          )}
          <GigChart
            config={chartConfig}
            className="w-full h-full rounded-md border border-border/30 shadow-sm"
            style={{ height: "calc(100% - 24px)" }}
          />
        </div>
      ) : (
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          <p>
            {!selectedXAxis || !selectedYAxis
              ? "Please select X and Y axes to display the chart."
              : "No data to display for the current selection."}
          </p>
        </div>
      )}
    </TooltipProvider>
  );
}
