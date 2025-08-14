import { useMemo } from 'react';
import { type PanelProps } from '@/types/dashboard.types';
import { withPanelWrapper } from './BasePanel';
import { GaugeChart } from '@/components/charts';
import { cn } from '@/lib/utils/class-utils';

/**
 * Gauge Panel Component
 * Uses the new lightweight SVG-based gauge
 */
function GaugePanel({ config, data }: PanelProps) {
  // Check if we have multiple series (grouped data)
  const hasMultipleSeries = useMemo(() => {
    if (!data || data.length === 0) return false;
    
    // Check if we have a group by field in the field mapping
    const groupByField = config.fieldMapping?.seriesField;
    if (groupByField && data.length > 1) {
      const groupValues = new Set(data.map(d => d[groupByField]));
      return groupValues.size > 1;
    }
    
    // For aggregated queries, check if we have multiple rows
    if (data.length > 1) {
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
      
      if (numericFields.length === 1 && stringFields.length >= 1) {
        return true;
      }
    }
    
    return false;
  }, [data, config]);

  // If we have multiple series, render multiple gauge panels
  if (hasMultipleSeries) {
    return <MultiGaugePanel config={config} data={data} />;
  }

  // Extract single value for gauge
  const gaugeValue = useMemo(() => {
    if (!data || data.length === 0) return 0;

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
      
      if (numericFields.length === 0) return 0;
      valueField = numericFields[0];
    }

    // Get the latest value
    const lastRecord = data[data.length - 1];
    const value = parseFloat(String(lastRecord[valueField]));
    
    return isNaN(value) ? 0 : value;
  }, [data, config]);

  // Extract thresholds from field config
  const thresholds = useMemo(() => {
    const fieldConfig = config.fieldConfig?.defaults;
    if (!fieldConfig?.thresholds?.steps) return [];
    
    return fieldConfig.thresholds.steps
      .filter(step => step.value !== null)
      .map(step => ({
        value: step.value!,
        color: step.color,
      }));
  }, [config]);

  // Extract min/max from field config
  const min = config.fieldConfig?.defaults?.min ?? 0;
  const max = config.fieldConfig?.defaults?.max ?? 100;

  return (
    <GaugeChart
      value={gaugeValue}
      min={min}
      max={max}
      thresholds={thresholds}
      config={config}
    />
  );
}

// Component for multiple gauges (grouped data)
function MultiGaugePanel({ config, data }: PanelProps) {
  const groupedGauges = useMemo(() => {
    if (!data || data.length === 0) return [];
    
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
    const firstRecord = data[0];
    const fields = Object.keys(firstRecord);
    
    const valueField = config.fieldMapping?.yField || fields.find(field => {
      const value = firstRecord[field];
      return typeof value === 'number' || (typeof value === 'string' && !isNaN(Number(value)));
    });
    
    const labelField = fields.find(field => {
      const value = firstRecord[field];
      return typeof value === 'string' && isNaN(Number(value)) && field !== 'series';
    });
    
    if (valueField && labelField) {
      return data.map(record => {
        const label = String(record[labelField] || 'Unknown');
        return [label, [record]] as [string, typeof data];
      });
    }
    
    return [];
  }, [data, config]);

  // Extract value from group
  const getValueFromGroup = (records: any[]) => {
    if (records.length === 0) return 0;
    
    const firstRecord = records[0];
    const valueField = config.fieldMapping?.yField || Object.keys(firstRecord).find(field => {
      const value = firstRecord[field];
      return typeof value === 'number' || (typeof value === 'string' && !isNaN(Number(value)));
    });
    
    if (!valueField) return 0;
    
    const value = parseFloat(String(firstRecord[valueField]));
    return isNaN(value) ? 0 : value;
  };

  // Extract thresholds from field config
  const thresholds = useMemo(() => {
    const fieldConfig = config.fieldConfig?.defaults;
    if (!fieldConfig?.thresholds?.steps) return [];
    
    return fieldConfig.thresholds.steps
      .filter(step => step.value !== null)
      .map(step => ({
        value: step.value!,
        color: step.color,
      }));
  }, [config]);

  const min = config.fieldConfig?.defaults?.min ?? 0;
  const max = config.fieldConfig?.defaults?.max ?? 100;

  return (
    <div className="h-full w-full p-2">
      <div
        className={cn(
          "grid gap-2 h-full w-full",
          groupedGauges.length === 1
            ? "grid-cols-1"
            : groupedGauges.length === 2
            ? "grid-cols-2"
            : groupedGauges.length === 3
            ? "grid-cols-3"
            : groupedGauges.length === 4
            ? "grid-cols-2 grid-rows-2"
            : groupedGauges.length <= 6
            ? "grid-cols-3 grid-rows-2"
            : groupedGauges.length <= 9
            ? "grid-cols-3 grid-rows-3"
            : "grid-cols-4 grid-rows-3"
        )}
      >
        {groupedGauges.map(([label, records]) => (
          <div key={label} className="border rounded-lg bg-card/50 p-2 h-full flex flex-col">
            <div className="text-center mb-1">
              <div className="text-xs font-medium text-muted-foreground">
                {label}
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <GaugeChart
                value={getValueFromGroup(records)}
                min={min}
                max={max}
                thresholds={thresholds}
                config={{ ...config, title: '' }} // Don't show title in multi-gauge
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default withPanelWrapper(GaugePanel);