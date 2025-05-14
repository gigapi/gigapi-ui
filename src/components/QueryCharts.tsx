import React, { useMemo, useState, useEffect } from "react";
import { useQuery } from "../contexts/QueryContext";
import {
  GigChart,
  createBarChart,
  createLineChart,
  createAreaChart,
} from "./ui/gig_chart";
import { RefreshCw, Info, Calendar, Hash } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { isDateTimeField, isDateString } from "@/lib/date-utils";

// Define chart type options
type ChartType = "bar" | "line" | "area";

// Type definitions for schema data
interface ColumnSchema {
  columnName: string;
  dataType: string;
}

interface TableSchema {
  tableName: string;
  columns: ColumnSchema[];
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

// Helper functions for time/date processing
const isISODateString = (value: string): boolean => {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
};

// Check if a value is likely a timestamp in various formats
const isTimestamp = (value: string | number): boolean => {
  const numValue = typeof value === 'string' ? Number(value) : value;
  if (isNaN(numValue)) return false;
  
  // Check for various timestamp formats
  if (numValue > 1e18) return true; // Nanoseconds (19+ digits) - e.g. 1620000000000000000
  if (numValue > 1e15) return true; // Microseconds (16+ digits) - e.g. 1620000000000000
  if (numValue > 1e12) return true; // Milliseconds (13+ digits) - e.g. 1620000000000
  if (numValue > 1e9 && numValue < 1e11) return true; // Seconds (10 digits) - e.g. 1620000000
  
  return false;
};

const normalizeTimestamp = (value: string | number, targetUnit: 'ms' | 's' = 'ms'): number | string => {
  if (value === null || value === undefined) return value;
  
  // If it's already an ISO date string, parse it to timestamp and then normalize
  if (typeof value === 'string') {
    if (isISODateString(value)) {
      try {
        return new Date(value).toISOString();
      } catch (e) {
        return value;
      }
    }
  }
  
  const numValue = typeof value === 'string' ? Number(value) : value;
  if (isNaN(numValue)) return value;
  
  // Handle different timestamp scales to convert to milliseconds
  let normalizedValue = numValue;
  
  // Detect scale and normalize to milliseconds
  if (numValue > 1e18) { // Nanoseconds (19+ digits)
    normalizedValue = Math.floor(numValue / 1000000);
  } else if (numValue > 1e15) { // Microseconds (16+ digits)
    normalizedValue = Math.floor(numValue / 1000);
  } else if (numValue < 1e12 && numValue > 1e9) { // Seconds (10-12 digits)
    normalizedValue = numValue * 1000;
  }
  
  // Convert to target unit or ISO string
  if (targetUnit === 's') {
    return Math.floor(normalizedValue / 1000);
  }
  
  // Try to convert to ISO string for better readability if requested
  try {
    const date = new Date(normalizedValue);
    if (!isNaN(date.getTime())) {
      // Check if year is reasonable before returning date
      const year = date.getFullYear();
      if (year > 1970 && year < 2100) {
        return date.toISOString();
      }
    }
  } catch (e) {
    // If conversion fails, just return the normalized value
  }
  
  return normalizedValue;
};


export default function QueryDataChart() {
  const { 
    results: rawQueryResults, 
    isLoading,
    schema,
    selectedDb 
  } = useQuery();

  // Chart type selector
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [selectedXAxis, setSelectedXAxis] = useState<string | null>(null);
  const [selectedYAxis, setSelectedYAxis] = useState<string | null>(null);

  // Helper function to process each row (moved before processedData useMemo)
  const rowProcessor = useMemo(
    () =>
      (row: any): Record<string, any> => {
        const newRow: Record<string, any> = {};
        if (!row || typeof row !== "object") return newRow;
        const keys = Object.keys(row);

        // Process each field in the row
        keys.forEach((key) => {
          let value = row[key];
          
          // Special handling for __timestamp field to ensure proper formatting
          if (key === "__timestamp") {
            // Handle various timestamp formats
            try {
              const numValue = typeof value === 'string' ? Number(value) : value;
              if (!isNaN(numValue)) {
                // Determine timestamp scale and convert accordingly
                if (numValue > 1e18) { // Nanoseconds
                  const dateMs = Math.floor(numValue / 1000000);
                  newRow[key] = new Date(dateMs).toISOString();
                } else if (numValue > 1e15) { // Microseconds
                  const dateMs = Math.floor(numValue / 1000);
                  newRow[key] = new Date(dateMs).toISOString();
                } else if (numValue > 1e12) { // Milliseconds
                  newRow[key] = new Date(numValue).toISOString();
                } else if (numValue > 1e9) { // Seconds
                  newRow[key] = new Date(numValue * 1000).toISOString();
                } else {
                  newRow[key] = String(value); // Keep as is if scale not determined
                }
              } else {
                newRow[key] = String(value);
              }
            } catch (e) {
              newRow[key] = String(value);
            }
            return; // Skip remaining processing for __timestamp
          }
          
          // Special handling for temporal field combinations
          if (key === "date" && row["hour"] && 
              typeof row["date"] === "string" && 
              isISODateString(row["date"])) {
            try {
              // Create a combined datetime field
              const datePart = new Date(row["date"]);
              const hour = parseInt(String(row["hour"]), 10);
              if (!isNaN(hour) && hour >= 0 && hour < 24) {
                datePart.setHours(hour);
                datePart.setMinutes(0);
                datePart.setSeconds(0);
                newRow["date_hour"] = datePart.toISOString();
              }
            } catch (e) {
              // Failed to combine, use original
            }
          }

          // ---- Handle JSON string values ----
          if (typeof value === "string") {
            // Process potential JSON strings - identify by brackets and quotes
            if (value.includes('{') && value.includes('}') && value.includes('"')) {
              try {
                const parsed = JSON.parse(value);
                
                // Handle parsed JSON objects - extract useful data for charting
                if (parsed && typeof parsed === 'object') {
                  // Create normalized fields for common JSON patterns
                  
                  // Pattern 1: {raw, parsed} pattern
                  if ('raw' in parsed && 'parsed' in parsed) {
                    // Add the raw value as its own field
                    if (typeof parsed.raw === 'string') {
                      newRow[`${key}_raw`] = parsed.raw;
                    }
                    
                    // Handle nested parsed objects
                    if (typeof parsed.parsed === 'object' && parsed.parsed !== null) {
                      // For objects with a value property
                      if ('value' in parsed.parsed && typeof parsed.parsed.value !== 'object') {
                        newRow[`${key}_value`] = parsed.parsed.value;
                      }
                      
                      // Extract any user identifiers (common in protocols)
                      if (parsed.parsed.uri && parsed.parsed.uri._user) {
                        newRow[`${key}_user`] = parsed.parsed.uri._user;
                      }
                      
                      // Extract methods (common in protocols)
                      if ('method' in parsed.parsed && typeof parsed.parsed.method === 'string') {
                        newRow[`${key}_method`] = parsed.parsed.method;
                      }
                      
                      // Flatten nested numeric values for charting
                      Object.entries(parsed.parsed).forEach(([nestedKey, nestedVal]) => {
                        if (typeof nestedVal === 'number') {
                          newRow[`${key}_${nestedKey}`] = nestedVal;
                        }
                      });
                    } 
                    // Direct parsed value if not an object
                    else if (typeof parsed.parsed !== 'object') {
                      newRow[`${key}_value`] = parsed.parsed;
                    }
                  }
                  
                  // Pattern 2: Key-value pairs separated by delimiters (common in logs/stats)
                  // Example: "CS=0;PS=1433;ES=1525;OS=229280"
                  else if ('raw' in parsed && typeof parsed.raw === 'string' && 
                          (parsed.raw.includes('=') && (parsed.raw.includes(';') || parsed.raw.includes(',')))) {
                    const delimiter = parsed.raw.includes(';') ? ';' : ',';
                    const pairs = parsed.raw.split(delimiter);
                    
                    pairs.forEach((pair: string) => {
                      const [pairKey, pairVal] = pair.split('=');
                      if (pairKey && pairVal) {
                        const metricKey = `${key}_${pairKey.trim()}`;
                        // Convert numeric values
                        const numericVal = Number(pairVal.trim());
                        newRow[metricKey] = !isNaN(numericVal) ? numericVal : pairVal.trim();
                      }
                    });
                  }
                  
                  // Pattern 3: Direct value extraction for simple JSON objects
                  else {
                    // Try to extract any useful primitive values
                    Object.entries(parsed).forEach(([jsonKey, jsonVal]) => {
                      if (typeof jsonVal !== 'object' || jsonVal === null) {
                        newRow[`${key}_${jsonKey}`] = jsonVal;
                      }
                    });
                  }
                }
                
                // Also keep the plain value for backward compatibility
                if (parsed.parsed !== undefined) {
                  if (typeof parsed.parsed === 'object' && parsed.parsed !== null) {
                    if (parsed.parsed.value !== undefined) {
                      value = parsed.parsed.value;
                    }
                  } else {
                    value = parsed.parsed;
                  }
                } else if (parsed.raw !== undefined && typeof parsed.raw !== 'object') {
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
              if (numValue > 1000000000 && 
                  (key.toLowerCase().includes("time") || 
                  key.toLowerCase().includes("date") ||
                  key === "__timestamp")) {
                value = String(normalizeTimestamp(numValue));
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
          else if (typeof value === 'object' && value !== null) {
            // Extract useful values from complex objects
            Object.entries(value).forEach(([objKey, objVal]) => {
              if (typeof objVal !== 'object' || objVal === null) {
                newRow[`${key}_${objKey}`] = objVal;
              }
            });
            
            // For visualization, we need primitive values, so set value to null
            // The extracted fields above will be used instead
            value = null;
          }

          // Determine if this is a datetime field
          const isDateTime = isDateTimeField(key) || 
                            (typeof value === "string" && 
                            (isTimestamp(value) || 
                             isDateString(value) || 
                             isISODateString(value)));

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
        if (row['payload_size'] && !isNaN(Number(row['payload_size']))) {
          newRow['payload_size_bytes'] = Number(row['payload_size']);
        }
        
        // Check if fields were overridden
        for (const key of keys) {
          if (typeof newRow[key] === 'undefined') {
            newRow[key] = row[key]; // Use original if not processed
          }
        }
        
        return newRow;
      },
    []
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

  // 2. Analyze Data for Field Selection
  const { allFields, numericFields, categoricalOrTimeFields, dateTimeFields } =
    useMemo(() => {
      if (!processedData || processedData.length === 0) {
        return {
          allFields: [],
          numericFields: [],
          categoricalOrTimeFields: [],
          dateTimeFields: [],
        };
      }

      // Get column information from schema if available
      const columnInfo: Record<string, string> = {};
      if (schema && selectedDb && schema[selectedDb]) {
        const tables = schema[selectedDb];
        tables.forEach((table: TableSchema) => {
          table.columns?.forEach((col: ColumnSchema) => {
            const dataType = col.dataType?.toLowerCase() || '';
            if (dataType) {
              columnInfo[col.columnName] = dataType;
            }
          });
        });
      }

      const firstRow = processedData[0];
      const af = Object.keys(firstRow);
      const nf: string[] = [];
      const ctf: string[] = [];
      const dtf: string[] = [];

      // Scan multiple rows for better field type detection
      const sampleSize = Math.min(10, processedData.length);
      const samples = processedData.slice(0, sampleSize);

      af.forEach((key) => {
        let isField_DateTime = false;
        let isField_Numeric = false;
        let isField_Categorical = false;
        
        // Check schema information first if available
        if (columnInfo[key]) {
          const dataType = columnInfo[key].toLowerCase();
          // Use schema type hints
          if (dataType.includes('time') || dataType.includes('date') || 
              dataType.includes('timestamp')) {
            isField_DateTime = true;
          }
          else if (dataType.includes('int') || dataType.includes('float') || 
                  dataType.includes('double') || dataType.includes('decimal') ||
                  dataType.includes('number')) {
            isField_Numeric = true;
          }
          else if (dataType.includes('varchar') || dataType.includes('text') || 
                  dataType.includes('char') || dataType.includes('string') ||
                  dataType.includes('enum')) {
            isField_Categorical = true;
          }
        }
        
        // If schema didn't help, check multiple rows to determine field type more accurately
        if (!isField_DateTime && !isField_Numeric && !isField_Categorical) {
          for (let i = 0; i < samples.length; i++) {
            const value = samples[i][key];
            
            // Skip null values for detection
            if (value === null || value === undefined) continue;
  
            // Handle special values (detect JSON strings)
            const isJsonStr =
              typeof value === "string" &&
              value.startsWith("{") &&
              value.endsWith("}") &&
              value.includes('"');
  
            // Skip complex JSON objects that can't be easily graphed
            if (isJsonStr) continue;
  
            // Detect date/time fields
            const isDateTime =
              isDateTimeField(key) ||
              key === "date_hour" || // Check for our synthesized datetime field
              (typeof value === "string" &&
              (isTimestamp(value) || 
               isDateString(value) || 
               isISODateString(value)));
  
            if (isDateTime) {
              isField_DateTime = true;
            }
  
            // Detect numeric values - including string numbers
            const isNumeric =
              typeof value === "number" ||
              (typeof value === "string" &&
                !isNaN(Number(value)) &&
                key !== "call_id" && // Avoid treating IDs as numbers
                !key.includes("ip") &&
                !key.toLowerCase().includes("port")); // Skip IP/port fields which may look numeric
  
            if (isNumeric && !isDateTime) {
              isField_Numeric = true;
            }
            
            // Detect categorical fields
            if (!isField_DateTime && !isField_Numeric && typeof value === 'string' && value.length < 100) {
              isField_Categorical = true;
            }
          }
        }
        
        // Add field to appropriate categories based on detection
        if (isField_DateTime) {
          dtf.push(key);
          ctf.push(key); // Also include in categorical for selection
          // Don't add datetime fields to numeric fields
        } else if (isField_Numeric) {
          nf.push(key);
        } else if (isField_Categorical) {
          ctf.push(key);
        }
      });

      // Sort fields for easier selection
      nf.sort();
      ctf.sort();
      dtf.sort();

      return {
        allFields: af,
        numericFields: nf,
        categoricalOrTimeFields: ctf,
        dateTimeFields: dtf,
      };
    }, [processedData, schema, selectedDb]);

  // 3. Set Default Axis Selections
  useEffect(() => {
    if (processedData.length > 0) {
      // Always prefer date/time fields for X-axis
      if (dateTimeFields.length > 0) {
        // Prefer specific time/date fields in this order: __timestamp, time, date_hour, hours, date, time_sec
        const preferredTimeFields = ["__timestamp", "time", "date_hour", "hours", "date", "time_sec", "time_usec", "create_date"];
        const foundPreferredField = preferredTimeFields.find(field => dateTimeFields.includes(field));
        
        // Always set X-axis to time field regardless of previous selection
        setSelectedXAxis(foundPreferredField || dateTimeFields[0]);
      } else if (categoricalOrTimeFields.length > 0) {
        setSelectedXAxis(categoricalOrTimeFields[0]);
      } else if (allFields.length > 0) {
        setSelectedXAxis(allFields[0]); // Fallback
      }

      // For Y-axis, prefer numeric "value" fields and never use time fields
      if (numericFields.length > 0) {
        // Prefer common value fields for Y-axis in this order
        const preferredValueFields = [
          "value", "jitter", "temperature", "octets", "count", "total", 
          "amount", "sum", "payload_size", "size", "length"
        ];
        
        // Filter out time fields from numeric fields to avoid using them as Y-axis
        const nonTimeNumericFields = numericFields.filter(
          field => !dateTimeFields.includes(field) && 
                  !field.toLowerCase().includes('time') && 
                  !field.toLowerCase().includes('date')
        );
        
        const foundPreferredField = preferredValueFields.find(field => 
          nonTimeNumericFields.includes(field) || 
          nonTimeNumericFields.some(f => f.toLowerCase().includes(field.toLowerCase()))
        );
        
        setSelectedYAxis(foundPreferredField || (nonTimeNumericFields.length > 0 ? nonTimeNumericFields[0] : numericFields[0]));
      }
    }
  }, [
    processedData,
    categoricalOrTimeFields,
    numericFields,
    dateTimeFields,
    allFields,
  ]);

  // Create chart configuration based on selected type and data
  const chartConfig = useMemo(() => {
    if (!selectedXAxis || !selectedYAxis || processedData.length === 0)
      return null;

    // Create a deep copy of processed data for manipulation
    let chartData = JSON.parse(JSON.stringify(processedData));
    
    // Check if we need to swap axes for proper visualization
    // (time fields should be on X-axis, categorical/metrics on Y-axis)
    let xAxis = selectedXAxis;
    let yAxis = selectedYAxis;
    
    // If the user has selected a time field for Y-axis and non-time field for X-axis,
    // automatically swap them for better visualization
    const isXDateTime = dateTimeFields.includes(selectedXAxis);
    const isYDateTime = dateTimeFields.includes(selectedYAxis);
    
    if (!isXDateTime && isYDateTime) {
      // Swap the axes for proper visualization
      xAxis = selectedYAxis;  // Move time field to X-axis
      yAxis = selectedXAxis;  // Move categorical field to Y-axis
      
      console.log("Automatically swapped axes for better visualization:", 
        { originalX: selectedXAxis, originalY: selectedYAxis, newX: xAxis, newY: yAxis });
    }
    
    // Pre-process data based on field types
    const isXAxisDateTime = dateTimeFields.includes(xAxis);
    
    // For datetime axes, ensure we have proper point distribution
    if (isXAxisDateTime) {
      // Sort data by the selected X-axis for proper temporal order
      chartData.sort((a: any, b: any) => {
        const valueA = a[xAxis];
        const valueB = b[xAxis];
        
        // Handle dates or timestamps
        if (typeof valueA === 'string' && typeof valueB === 'string') {
          return new Date(valueA).getTime() - new Date(valueB).getTime();
        }
        return valueA - valueB;
      });
    }
    
    // Convert Y-axis string values to numbers if necessary
    chartData = chartData.map((item: Record<string, any>) => {
      const newItem = { ...item };
      
      // Handle Y-axis value conversion if it's a string number
      if (typeof newItem[yAxis] === "string" && !isNaN(Number(newItem[yAxis]))) {
        newItem[yAxis] = Number(newItem[yAxis]);
      }
      
      return newItem;
    });

    // Enhanced options with toolbox for zooming and saving
    const enhancedOptions = {
      tooltip: true,
      legend: true,
      toolbox: true,
      dataZoom: true,
      title: `${yAxis} by ${xAxis}`,
      xIsDateTime: isXAxisDateTime
    };

    switch (chartType) {
      case "bar":
        return createBarChart(
          chartData,
          xAxis,
          yAxis,
          enhancedOptions
        );
      case "line":
        return createLineChart(
          chartData,
          xAxis,
          yAxis,
          enhancedOptions
        );
      case "area":
        return createAreaChart(
          chartData,
          xAxis,
          yAxis,
          enhancedOptions
        );
      default:
        return null;
    }
  }, [processedData, selectedXAxis, selectedYAxis, chartType, dateTimeFields]);

  // Handler for axis changes
  const handleXAxisChange = (value: string) => {
    if (value === "_NONE_") setSelectedXAxis(null);
    else setSelectedXAxis(value);
  };

  const handleYAxisChange = (value: string) => {
    if (value === "_NONE_") setSelectedYAxis(null);
    else setSelectedYAxis(value);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 text-primary animate-spin" />
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
      <Card className="w-full h-full flex flex-col border border-border/40 rounded-lg shadow-sm bg-background/60 backdrop-blur-sm">
        <CardHeader className="pb-2 px-4 pt-3 border-b border-border/30">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Label
                  htmlFor="chartTypeSelect"
                  className="text-xs font-semibold"
                >
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
                className="w-[260px]"
              >
                <TabsList className="grid grid-cols-3 h-8">
                  <TabsTrigger value="bar" className="text-xs">
                    Bar
                  </TabsTrigger>
                  <TabsTrigger value="line" className="text-xs">
                    Line
                  </TabsTrigger>
                  <TabsTrigger value="area" className="text-xs">
                    Area
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div>
              <div className="flex items-center gap-1 mb-1">
                <Label htmlFor="xAxisSelect" className="text-xs font-semibold">
                  X-Axis {dateTimeFields.includes(selectedXAxis || "") ? (
                    <Calendar className="h-3 w-3 inline ml-1 text-blue-500" />
                  ) : null}
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="max-w-xs">
                      Select a field for the X-axis. For time-series data, 
                      time fields (marked with <Calendar className="h-3 w-3 inline text-blue-500" />) 
                      work best on X-axis.
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
                  {dateTimeFields.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-blue-500 flex items-center">
                        <Calendar className="h-3 w-3 inline mr-1" /> Time Fields (Recommended for X-axis)
                      </div>
                      {dateTimeFields.map((field) => (
                        <SelectItem key={`dt-${field}`} value={field} className="text-xs">
                          {field} <Calendar className="h-3 w-3 inline ml-1 text-blue-500" />
                        </SelectItem>
                      ))}
                      <div className="h-px bg-border/30 my-1.5 mx-1" />
                    </>
                  )}
                  {categoricalOrTimeFields.filter(field => !dateTimeFields.includes(field)).length > 0 ? (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center">
                        Other Fields
                      </div>
                      {categoricalOrTimeFields.filter(field => !dateTimeFields.includes(field)).map((field) => (
                        <SelectItem key={field} value={field} className="text-xs">
                          {field}
                        </SelectItem>
                      ))}
                    </>
                  ) : (
                    <SelectItem
                      value="_NO_OPTIONS_"
                      disabled
                      className="text-xs text-muted-foreground italic"
                    >
                      No suitable fields found
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center gap-1 mb-1">
                <Label htmlFor="yAxisSelect" className="text-xs font-semibold">
                  Y-Axis (Value) {numericFields.includes(selectedYAxis || "") ? (
                    <Hash className="h-3 w-3 inline ml-1 text-green-500" />
                  ) : null}
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="max-w-xs">
                      Select a numeric field for the Y-axis. Metric values 
                      (marked with <Hash className="h-3 w-3 inline text-green-500" />) 
                      work best on Y-axis.
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
                  {numericFields.length > 0 ? (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-green-500 flex items-center">
                        <Hash className="h-3 w-3 inline mr-1" /> Metric Fields (Recommended for Y-axis)
                      </div>
                      {/* Filter out any fields with time-related names from Y-axis metrics section */}
                      {numericFields
                        .filter(field => 
                          !dateTimeFields.includes(field) && 
                          !field.toLowerCase().includes('time') && 
                          !field.toLowerCase().includes('date') &&
                          !field.toLowerCase().includes('timestamp')
                        )
                        .map((field) => (
                          <SelectItem key={field} value={field} className="text-xs">
                            {field} <Hash className="h-3 w-3 inline ml-1 text-green-500" />
                          </SelectItem>
                        ))
                      }
                    </>
                  ) : (
                    <SelectItem
                      value="_NO_OPTIONS_"
                      disabled
                      className="text-xs text-muted-foreground italic"
                    >
                      No numeric fields found
                    </SelectItem>
                  )}
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
        </CardHeader>

        <CardContent className="flex-grow p-4 min-h-[350px]">
          {chartConfig ? (
            <GigChart
              config={chartConfig}
              className="w-full h-full rounded-md border border-border/30 shadow-sm"
              style={{ height: "calc(100% - 10px)", marginTop: "10px" }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              <p>
                {!selectedXAxis || !selectedYAxis
                  ? "Please select X and Y axes to display the chart."
                  : "No data to display for the current selection."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
