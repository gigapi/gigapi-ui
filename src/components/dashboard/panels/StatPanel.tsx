import { useMemo } from "react";
import { type PanelProps } from "@/types/dashboard.types";
// import { transformDataForPanel } from "@/lib/dashboard/data-transformers"; // Reserved for future use
import { withPanelWrapper } from "./BasePanel";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils/class-utils";

function StatPanel({ config, data }: PanelProps) {
  const statData = useMemo(() => {
    if (!data || data.length === 0) return null;

    const { visualization, dataMapping } = config;

    // Extract values for calculations
    const values: number[] = [];
    for (const record of data) {
      const value = parseFloat(String(record[dataMapping.valueColumn]));
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

    // Calculate trend
    let trend: "up" | "down" | "neutral" = "neutral";
    let changePercent = 0;

    if (values.length > 1 && previous !== 0) {
      changePercent = ((current - previous) / Math.abs(previous)) * 100;
      if (Math.abs(changePercent) > 0.1) {
        trend = changePercent > 0 ? "up" : "down";
      }
    }

    // Check threshold if configured
    let thresholdStatus: "normal" | "critical" = "normal";
    if (visualization.threshold) {
      const { value: thresholdValue, operator } = visualization.threshold;
      switch (operator) {
        case "gt":
          thresholdStatus = current > thresholdValue ? "critical" : "normal";
          break;
        case "lt":
          thresholdStatus = current < thresholdValue ? "critical" : "normal";
          break;
        case "eq":
          thresholdStatus =
            Math.abs(current - thresholdValue) < 0.001 ? "critical" : "normal";
          break;
      }
    }

    return {
      current,
      previous,
      min,
      max,
      avg,
      sum,
      trend,
      changePercent,
      thresholdStatus,
      totalRecords: values.length,
    };
  }, [data, config]);

  const formatValue = (value: number): string => {
    const { visualization } = config;
    const decimals = visualization.decimals ?? 2;
    const unit = visualization.unit || "";

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
    <div className="h-full flex flex-col justify-center p-4">
      {/* Main Value */}
      <div className="text-center">
        <div
          className={cn(
            "text-3xl font-bold mb-2",
            getThresholdColor(statData.thresholdStatus)
          )}
        >
          {formatValue(statData.current)}
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
            <span>{Math.abs(statData.changePercent).toFixed(1)}%</span>
          </div>
        )}

        {/* Secondary stats */}
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            <div className="font-medium">Avg</div>
            <div>{formatValue(statData.avg)}</div>
          </div>
          <div>
            <div className="font-medium">Records</div>
            <div>{statData.totalRecords}</div>
          </div>
          <div>
            <div className="font-medium">Min</div>
            <div>{formatValue(statData.min)}</div>
          </div>
          <div>
            <div className="font-medium">Max</div>
            <div>{formatValue(statData.max)}</div>
          </div>
        </div>

        {/* Threshold indicator */}
        {config.visualization.threshold &&
          statData.thresholdStatus === "critical" && (
            <div className="mt-2 text-xs text-destructive">
              Threshold exceeded
            </div>
          )}
      </div>
    </div>
  );
}

export default withPanelWrapper(StatPanel);
