import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { MetricArtifact as MetricArtifactType } from "@/types/artifact.types";
import { cn } from "@/lib/utils/class-utils";

interface MetricArtifactProps {
  artifact: MetricArtifactType;
  data: any[];
}

export default function MetricArtifact({ artifact, data }: MetricArtifactProps) {
  const config = artifact.data;
  
  // Extract the metric value from query results
  let value = config.value;
  if (data.length > 0 && typeof value === 'string' && value.startsWith('$')) {
    // If value is a field reference like "$count", extract from data
    const field = value.substring(1);
    value = data[0][field] ?? config.value;
  }
  
  // Format the value
  const formatValue = (val: any): string => {
    if (val === null || val === undefined) return 'N/A';
    
    const numVal = typeof val === 'number' ? val : parseFloat(val);
    if (isNaN(numVal)) return String(val);
    
    let formatted = numVal.toFixed(config.format?.decimals ?? 0);
    
    // Add thousand separators
    formatted = formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    
    // Add prefix/suffix
    if (config.format?.prefix) formatted = config.format.prefix + formatted;
    if (config.format?.suffix) formatted = formatted + config.format.suffix;
    
    return formatted;
  };
  
  // Determine threshold status
  const getThresholdStatus = (val: number): 'normal' | 'warning' | 'critical' => {
    if (!config.thresholds) return 'normal';
    
    if (config.thresholds.critical !== undefined && val >= config.thresholds.critical) {
      return 'critical';
    }
    if (config.thresholds.warning !== undefined && val >= config.thresholds.warning) {
      return 'warning';
    }
    return 'normal';
  };
  
  const numericValue = typeof value === 'number' ? value : parseFloat(value as string);
  const status = !isNaN(numericValue) ? getThresholdStatus(numericValue) : 'normal';
  
  // Mock trend data (in a real implementation, this would come from sparkline query)
  const trend = Math.random() > 0.5 ? 'up' : Math.random() > 0.5 ? 'down' : 'neutral';
  const trendValue = Math.floor(Math.random() * 20) - 10;
  
  return (
    <div className="p-6 bg-neutral-800/50 rounded-xl border border-neutral-700">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-medium text-neutral-400 mb-2">
            {config.title}
          </h3>
          <div className={cn(
            "text-3xl font-bold mb-2",
            status === 'warning' && "text-yellow-500",
            status === 'critical' && "text-red-500",
            status === 'normal' && "text-neutral-100"
          )}>
            {formatValue(value)}
          </div>
          {config.unit && (
            <div className="text-sm text-neutral-500">
              {config.unit}
            </div>
          )}
        </div>
        
        {/* Trend indicator */}
        <div className="flex flex-col items-end">
          <div className={cn(
            "flex items-center gap-1 text-sm font-medium",
            trend === 'up' && trendValue > 0 && "text-green-500",
            trend === 'down' && trendValue < 0 && "text-red-500",
            trend === 'neutral' && "text-neutral-400"
          )}>
            {trend === 'up' && trendValue > 0 && <TrendingUp className="w-4 h-4" />}
            {trend === 'down' && trendValue < 0 && <TrendingDown className="w-4 h-4" />}
            {trend === 'neutral' && <Minus className="w-4 h-4" />}
            {Math.abs(trendValue)}%
          </div>
          <div className="text-xs text-neutral-500 mt-1">
            vs last period
          </div>
        </div>
      </div>
      
      {/* Sparkline placeholder */}
      {config.sparkline?.enabled && (
        <div className="mt-4 h-12 bg-neutral-900/50 rounded flex items-center justify-center text-xs text-neutral-500">
          Sparkline visualization
        </div>
      )}
      
      {/* Threshold indicators */}
      {config.thresholds && (
        <div className="mt-4 flex items-center gap-4 text-xs">
          {config.thresholds.warning && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-yellow-500 rounded-full" />
              <span className="text-neutral-400">Warning: {config.thresholds.warning}</span>
            </div>
          )}
          {config.thresholds.critical && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-red-500 rounded-full" />
              <span className="text-neutral-400">Critical: {config.thresholds.critical}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}