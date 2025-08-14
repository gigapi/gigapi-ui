import React, { memo } from 'react';
import { type PanelConfig, type NDJSONRecord } from '@/types/dashboard.types';
import { 
  TimeSeries, 
  BarChart, 
  ScatterPlot, 
  GaugeChart, 
  PieChart 
} from '@/components/charts';

interface ChartRendererProps {
  config: PanelConfig;
  data: NDJSONRecord[];
  isEditMode?: boolean;
  onTimeRangeUpdate?: (timeRange: any) => void;
  height?: string | number;
  width?: string | number;
}

/**
 * Unified Chart Renderer Component
 * Routes to appropriate chart component based on panel type
 */
function ChartRendererComponent({
  config,
  data,
  isEditMode = false,
  onTimeRangeUpdate,
  height = '100%',
  width = '100%',
}: ChartRendererProps) {
  // Handle empty data
  if (!data || data.length === 0) {
    return (
      <div 
        className="flex items-center justify-center h-full text-muted-foreground"
        style={{ height, width }}
      >
        <div className="text-center">
          <div className="text-sm">No data available</div>
          <div className="text-xs mt-1">Check your query and field mapping</div>
        </div>
      </div>
    );
  }

  // Route to appropriate chart component based on type
  switch (config.type) {
    case 'timeseries':
    case 'line':
    case 'area':
      return (
        <TimeSeries
          data={data}
          config={config}
          height={height}
          width={width}
          onTimeRangeUpdate={!isEditMode ? onTimeRangeUpdate : undefined}
        />
      );

    case 'bar':
      return (
        <BarChart
          data={data}
          config={config}
          height={height}
          width={width}
        />
      );

    case 'scatter':
      return (
        <ScatterPlot
          data={data}
          config={config}
          height={height}
          width={width}
        />
      );

    case 'pie':
    case 'donut':
      // Transform data for pie chart format
      const pieData = transformDataForPie(data, config);
      return (
        <PieChart
          data={pieData}
          config={config}
          height={height}
          width={width}
        />
      );

    default:
      return (
        <div 
          className="flex items-center justify-center h-full text-muted-foreground"
          style={{ height, width }}
        >
          <div className="text-center">
            <div className="text-sm">Unsupported chart type: {config.type}</div>
            <div className="text-xs mt-1">Please select a valid visualization type</div>
          </div>
        </div>
      );
  }
}

/**
 * Transform data for pie chart format
 */
function transformDataForPie(
  records: NDJSONRecord[],
  config: PanelConfig
): Array<{ label: string; value: number }> {
  const { fieldMapping } = config;
  
  if (!records || records.length === 0) {
    return [];
  }

  const firstRecord = records[0];
  const fields = Object.keys(firstRecord);

  // Determine fields to use
  let labelField: string;
  let valueField: string;

  if (fieldMapping?.xField && fieldMapping?.yField) {
    labelField = fieldMapping.xField;
    valueField = fieldMapping.yField;
  } else {
    // Auto-detect fields
    const numericFields = fields.filter(field => {
      const value = firstRecord[field];
      return typeof value === 'number' || (typeof value === 'string' && !isNaN(Number(value)));
    });
    
    const stringFields = fields.filter(field => {
      const value = firstRecord[field];
      return typeof value === 'string' && isNaN(Number(value));
    });

    labelField = stringFields[0] || 'category';
    valueField = numericFields[0] || 'value';
  }

  // Group by label and sum values
  const groupedData = new Map<string, number>();

  for (const record of records) {
    const label = String(record[labelField] || 'Unknown');
    const value = parseFloat(String(record[valueField] || 0));
    
    if (!isNaN(value)) {
      groupedData.set(label, (groupedData.get(label) || 0) + value);
    }
  }

  // Convert to array format
  return Array.from(groupedData.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value); // Sort by value descending
}

// Memoize the component to prevent unnecessary re-renders
export const ChartRenderer = memo(
  ChartRendererComponent,
  (prevProps, nextProps) => {
    // Custom comparison function to optimize re-renders
    return (
      prevProps.config.id === nextProps.config.id &&
      prevProps.config.query === nextProps.config.query &&
      prevProps.data === nextProps.data &&
      prevProps.isEditMode === nextProps.isEditMode &&
      prevProps.height === nextProps.height &&
      prevProps.width === nextProps.width &&
      JSON.stringify(prevProps.config.fieldMapping) ===
        JSON.stringify(nextProps.config.fieldMapping) &&
      JSON.stringify(prevProps.config.options) ===
        JSON.stringify(nextProps.config.options) &&
      JSON.stringify(prevProps.config.fieldConfig) ===
        JSON.stringify(nextProps.config.fieldConfig)
    );
  }
);