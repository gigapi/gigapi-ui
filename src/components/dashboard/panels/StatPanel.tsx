import { useMemo } from "react";
import { type PanelProps } from "@/types/dashboard.types";
import { withPanelWrapper } from "./BasePanel";
import { TrendingUp, TrendingDown, Minus, Calculator, Target, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils/class-utils";

function StatPanel({ config, data }: PanelProps) {
  // Check if we have multiple series (grouped data)
  const hasMultipleSeries = useMemo(() => {
    if (!data || data.length === 0) return false;
    
    // Check if we have a group by field in the field mapping
    const groupByField = config.fieldMapping?.seriesField;
    if (groupByField && data.length > 1) {
      // Check if all records have different values for the group field
      const groupValues = new Set(data.map(d => d[groupByField]));
      return groupValues.size > 1;
    }
    
    // For aggregated queries without explicit grouping, check if we have multiple rows
    // This handles cases like "SELECT AVG(temperature), season FROM weather GROUP BY season"
    if (data.length > 1) {
      // Check if this looks like aggregated data (single numeric field with different group values)
      const firstRecord = data[0];
      const fields = Object.keys(firstRecord);
      const numericFields = fields.filter(field => {
        const value = firstRecord[field];
        return typeof value === 'number' || (typeof value === 'string' && !isNaN(Number(value)));
      });
      const stringFields = fields.filter(field => {
        const value = firstRecord[field];
        return typeof value === 'string' && isNaN(Number(value));
      });
      
      // If we have exactly one numeric field and at least one string field, it's likely grouped data
      if (numericFields.length === 1 && stringFields.length >= 1) {
        return true;
      }
    }
    
    // Legacy check for series field
    const series = new Set(data.map(d => d.series));
    return series.size > 1 || (series.size === 1 && !series.has('stats'));
  }, [data, config]);

  // If we have multiple series, render multiple stat panels
  if (hasMultipleSeries) {
    return <MultiStatPanel config={config} data={data} />;
  }
  const statData = useMemo(() => {
    if (!data || data.length === 0) return null;

    // Use field mapping if available
    const fieldMapping = config.fieldMapping;
    let valueField: string;
    
    if (fieldMapping?.yField) {
      valueField = fieldMapping.yField;
    } else {
      // Auto-detect numeric field
      const firstRecord = data[0];
      const numericFields = Object.keys(firstRecord).filter(key => {
        const value = firstRecord[key];
        return typeof value === 'number' || (typeof value === 'string' && !isNaN(Number(value)));
      });
      
      if (numericFields.length === 0) return null;
      valueField = numericFields[0];
    }

    // Extract values for calculations
    const values: number[] = [];
    for (const record of data) {
      const value = parseFloat(String(record[valueField]));
      if (!isNaN(value)) {
        values.push(value);
      }
    }

    if (values.length === 0) return null;

    const current = values[values.length - 1];
    const previous = values.length > 1 ? values[values.length - 2] : current;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    const sum = values.reduce((sum, val) => sum + val, 0);

    // Calculate trend and additional metrics
    let trend: "up" | "down" | "neutral" = "neutral";
    let changePercent = 0;
    let changeAbsolute = 0;

    if (values.length > 1 && previous !== 0) {
      changePercent = ((current - previous) / Math.abs(previous)) * 100;
      changeAbsolute = current - previous;
      if (Math.abs(changePercent) > 0.1) {
        trend = changePercent > 0 ? "up" : "down";
      }
    }

    // Calculate additional statistics
    const median = [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const stdDev = Math.sqrt(
      values.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / values.length
    );

    // Check threshold if configured using field config
    let thresholdStatus: "normal" | "critical" = "normal";
    let hasThresholds = false;
    const fieldConfig = config.fieldConfig?.defaults;
    if (fieldConfig?.thresholds?.steps && fieldConfig.thresholds.steps.length > 1) {
      const steps = fieldConfig.thresholds.steps;
      // Check if any threshold has an actual value (not just default structure)
      hasThresholds = steps.some(step => step.value !== null && step.value !== undefined && step.value !== 80);
      
      if (hasThresholds) {
        // Find if current value exceeds any threshold
        for (let i = 1; i < steps.length; i++) {
          if (current >= (steps[i].value ?? 0)) {
            thresholdStatus = "critical";
            break;
          }
        }
      }
    }

    // Determine which value to display based on stat mode
    const statMode = config.options?.stat?.mode || "current";
    let displayValue: number;
    let displayLabel: string;
    
    switch (statMode) {
      case "average":
        displayValue = avg;
        displayLabel = "Average";
        break;
      case "sum":
        displayValue = sum;
        displayLabel = "Sum";
        break;
      case "min":
        displayValue = min;
        displayLabel = "Minimum";
        break;
      case "max":
        displayValue = max;
        displayLabel = "Maximum";
        break;
      case "current":
      default:
        displayValue = current;
        displayLabel = "Current";
        break;
    }

    return {
      current,
      previous,
      min,
      max,
      avg,
      sum,
      median,
      stdDev,
      trend,
      changePercent,
      changeAbsolute,
      thresholdStatus,
      hasThresholds,
      totalRecords: values.length,
      fieldName: valueField,
      displayValue,
      displayLabel,
      statMode,
    };
  }, [data, config]);

  const formatValue = (value: number): string => {
    const fieldConfig = config.fieldConfig?.defaults || {};
    const decimals = fieldConfig.decimals ?? 2;
    const unit = fieldConfig.unit || "";

    let formattedValue: string;

    if (Math.abs(value) >= 1e9) {
      formattedValue = (value / 1e9).toFixed(decimals) + "B";
    } else if (Math.abs(value) >= 1e6) {
      formattedValue = (value / 1e6).toFixed(decimals) + "M";
    } else if (Math.abs(value) >= 1e3) {
      formattedValue = (value / 1e3).toFixed(decimals) + "K";
    } else {
      formattedValue = value.toFixed(decimals);
    }

    return formattedValue + unit;
  };

  if (!statData) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <div className="text-sm">No data available</div>
          <div className="text-xs mt-1">Check your query configuration</div>
        </div>
      </div>
    );
  }

  const TrendIcon =
    statData.trend === "up"
      ? TrendingUp
      : statData.trend === "down"
      ? TrendingDown
      : Minus;

  const getThresholdColor = (status: typeof statData.thresholdStatus) => {
    switch (status) {
      case "critical":
        return "text-destructive";
      default:
        return "text-foreground";
    }
  };

  const getTrendColor = (trend: typeof statData.trend) => {
    switch (trend) {
      case "up":
        return "text-green-600";
      case "down":
        return "text-red-600";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <div className="h-full flex flex-col p-3">
      {/* Header with field name */}
      <div className="text-center mb-2">
        <div className="text-sm text-muted-foreground font-medium">
          {statData.fieldName}
        </div>
      </div>

      {/* Main Value */}
      <div className="flex-1 flex flex-col justify-center">
        <div className="text-center">
          <div
            className={cn(
              "text-2xl sm:text-3xl font-bold mb-2",
              getThresholdColor(statData.thresholdStatus)
            )}
          >
            {formatValue(statData.displayValue)}
          </div>

          {/* Trend indicator */}
          {statData.trend !== "neutral" && (
            <div
              className={cn(
                "flex items-center justify-center gap-1 text-sm mb-3",
                getTrendColor(statData.trend)
              )}
            >
              <TrendIcon className="w-4 h-4" />
              <span className="flex items-center gap-1">
                {Math.abs(statData.changePercent).toFixed(1)}%
                <span className="text-xs text-muted-foreground">
                  ({statData.changeAbsolute > 0 ? '+' : ''}{formatValue(statData.changeAbsolute)})
                </span>
              </span>
            </div>
          )}

          {/* Threshold indicator */}
          {statData.hasThresholds && statData.thresholdStatus === "critical" && (
            <div className="flex items-center justify-center gap-1 mb-3 text-xs text-destructive">
              <Target className="w-3 h-3" />
              <span>Threshold exceeded</span>
            </div>
          )}
        </div>
      </div>

      {/* Secondary stats */}
      <div className="mt-auto">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <Calculator className="w-3 h-3" />
              <span className="font-medium">Avg</span>
            </div>
            <div className="font-mono">{formatValue(statData.avg)}</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <BarChart3 className="w-3 h-3" />
              <span className="font-medium">Range</span>
            </div>
            <div className="font-mono text-xs">
              {formatValue(statData.min)} - {formatValue(statData.max)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground font-medium mb-1">Count</div>
            <div className="font-mono">{statData.totalRecords.toLocaleString()}</div>
          </div>
        </div>
        
        {/* Additional stats row */}
        <div className="grid grid-cols-2 gap-2 text-xs mt-2 pt-2 border-t border-border">
          <div className="text-center">
            <div className="text-muted-foreground font-medium">Median</div>
            <div className="font-mono">{formatValue(statData.median)}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground font-medium">Std Dev</div>
            <div className="font-mono">{formatValue(statData.stdDev)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Component for multiple stats (grouped data)
function MultiStatPanel({ config, data }: PanelProps) {
  const groupedStats = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    
    // Check if we have a specific group by field
    const groupByField = config.fieldMapping?.seriesField;
    
    if (groupByField) {
      // Group by specified field
      const groups = new Map<string, any[]>();
      data.forEach(d => {
        const groupKey = String(d[groupByField] || 'Unknown');
        if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
        }
        groups.get(groupKey)!.push(d);
      });
      return Array.from(groups.entries());
    }
    
    // For aggregated queries, each row is its own "group"
    // This handles queries like "SELECT AVG(temperature), season FROM weather GROUP BY season"
    const firstRecord = data[0];
    const fields = Object.keys(firstRecord);
    
    // Find the value field (numeric) and label field (string)
    const valueField = config.fieldMapping?.yField || fields.find(field => {
      const value = firstRecord[field];
      return typeof value === 'number' || (typeof value === 'string' && !isNaN(Number(value)));
    });
    
    const labelField = fields.find(field => {
      const value = firstRecord[field];
      return typeof value === 'string' && isNaN(Number(value)) && field !== 'series';
    });
    
    if (valueField && labelField) {
      // Each row becomes a separate stat
      const result = data.map(record => {
        const label = String(record[labelField] || 'Unknown');
        return [label, [record]] as [string, typeof data];
      });
      return result;
    }
    
    // If no grouping field found, show single stat with field name
    // This handles simple queries without GROUP BY
    if (data.length === 1) {
      const numericField = fields.find(field => {
        const value = firstRecord[field];
        return typeof value === 'number' || (typeof value === 'string' && !isNaN(Number(value)));
      });
      const valueField = config.fieldMapping?.yField || numericField;
      return [[valueField || 'Value', data]];
    }
    
    // Fallback to series-based grouping
    const groups = new Map<string, any[]>();
    data.forEach(d => {
      const series = d.series || 'Value';
      if (!groups.has(series)) {
        groups.set(series, []);
      }
      groups.get(series)!.push(d);
    });
    
    return Array.from(groups.entries());
  }, [data, config]);

  const formatValue = (value: number): string => {
    const fieldConfig = config.fieldConfig?.defaults || {};
    const decimals = fieldConfig.decimals ?? 2;
    const unit = fieldConfig.unit || "";

    let formattedValue: string;

    if (Math.abs(value) >= 1e9) {
      formattedValue = (value / 1e9).toFixed(decimals) + "B";
    } else if (Math.abs(value) >= 1e6) {
      formattedValue = (value / 1e6).toFixed(decimals) + "M";
    } else if (Math.abs(value) >= 1e3) {
      formattedValue = (value / 1e3).toFixed(decimals) + "K";
    } else {
      formattedValue = value.toFixed(decimals);
    }

    return formattedValue + unit;
  };

  return (
    <div className="h-full p-4">
      <div className={cn(
        "grid gap-4 h-full",
        groupedStats.length === 1 ? "grid-cols-1" :
        groupedStats.length === 2 ? "grid-cols-2" :
        groupedStats.length === 3 ? "grid-cols-3" :
        groupedStats.length === 4 ? "grid-cols-2 grid-rows-2" :
        "grid-cols-3 grid-rows-2"
      )}>
        {groupedStats.map(([label, records]) => {
          // Find the value field
          const firstRecord = records[0];
          const valueField = config.fieldMapping?.yField || Object.keys(firstRecord).find(field => {
            const value = firstRecord[field];
            return typeof value === 'number' || (typeof value === 'string' && !isNaN(Number(value)));
          });
          
          if (!valueField) return null;
          
          // Get the value from the first record (for aggregated queries, there's only one record per group)
          const value = parseFloat(String(firstRecord[valueField]));
          
          return (
            <div
              key={label}
              className="flex flex-col items-center justify-center text-center border rounded-lg p-4 bg-card"
            >
              <div className="text-sm text-muted-foreground font-medium mb-2">
                {label}
              </div>
              <div className="text-2xl sm:text-3xl font-semibold">
                {formatValue(isNaN(value) ? 0 : value)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default withPanelWrapper(StatPanel);
