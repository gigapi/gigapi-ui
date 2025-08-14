import { useMemo } from 'react';
import uPlot from 'uplot';
import { UPlotWrapper } from '../core/UPlotWrapper';
import { useTheme, formatAxisTime, formatValue, getSeriesColor } from '../themes/utils';
import { transformForScatter } from '../utils/data-transformer';
import { createTooltipPlugin } from '../plugins/tooltip';
import type { ScatterPlotProps } from '../core/types';

/**
 * Scatter Plot Component
 * Renders data points without connecting lines
 */
export function ScatterPlot({
  data,
  config,
  height = 400,
  width = '100%',
  onTimeRangeUpdate,
}: ScatterPlotProps) {
  const { theme } = useTheme();
  
  // Transform data to uPlot format
  const transformedData = useMemo(() => {
    return transformForScatter(data, config);
  }, [data, config]);

  // Generate chart options
  const options = useMemo((): Partial<uPlot.Options> => {
    const { fieldConfig, options: panelOptions } = config;
    const fieldDefaults = fieldConfig?.defaults || {};
    
    // Calculate time span for axis formatting
    const timeSpan = transformedData.metadata.timeRange
      ? transformedData.metadata.timeRange.max.getTime() - transformedData.metadata.timeRange.min.getTime()
      : 0;

    // Create series configuration
    const series: uPlot.Series[] = [
      {
        // X-axis series - empty label required for legend to render
        label: "",
        value: (_self, rawValue) => {
          if (rawValue === null) return '-';
          return formatAxisTime(rawValue, timeSpan);
        },
      },
    ];

    // Add Y-axis series - loop through actual data arrays (skip first which is X)
    for (let i = 1; i < transformedData.data.length; i++) {
      const seriesName = transformedData.series[i - 1] || `Series ${i}`;
      const colorIndex = i - 1;
      
      series.push({
        label: seriesName,
        show: true,
        stroke: getSeriesColor(theme, colorIndex),
        width: 0, // No line width
        paths: () => null, // Don't draw lines
        points: {
          show: true,
          size: fieldDefaults.custom?.pointSize || 6,
          stroke: getSeriesColor(theme, colorIndex),
          fill: getSeriesColor(theme, colorIndex),
          width: 1,
        },
        value: (_self, rawValue) => {
          if (rawValue === null) return '-';
          return formatValue(rawValue, fieldDefaults.decimals, fieldDefaults.unit);
        },
      });
    }

    // Create scales configuration
    const scales: uPlot.Scales = {
      x: {
        time: true,
      },
      y: {
        auto: fieldDefaults.min === undefined && fieldDefaults.max === undefined,
        range: (_self, dataMin, dataMax) => {
          let min = fieldDefaults.min ?? dataMin;
          let max = fieldDefaults.max ?? dataMax;
          
          // Handle edge cases
          if (!isFinite(min) || !isFinite(max)) {
            return [0, 100];
          }
          
          // Handle single value case
          if (min === max) {
            if (min === 0) {
              return [-1, 1];
            }
            return [min * 0.9, max * 1.1];
          }
          
          // Add padding
          if (fieldDefaults.min === undefined) {
            const padding = Math.abs(max - min) * 0.1;
            min -= padding;
          }
          if (fieldDefaults.max === undefined) {
            const padding = Math.abs(max - min) * 0.1;
            max += padding;
          }
          
          return [min, max];
        },
      },
    };

    // Create axes configuration
    const axes: uPlot.Axis[] = [
      {
        // X-axis
        scale: 'x',
        values: (_self, ticks) => ticks.map(v => formatAxisTime(v, timeSpan)),
        stroke: theme.axis.stroke,
        grid: {
          show: true,
          stroke: theme.grid.stroke,
          width: theme.grid.width,
        },
        ticks: {
          stroke: theme.axis.stroke,
        },
        font: theme.axis.font,
        labelFont: theme.axis.font,
        labelSize: 11,
        gap: 5,
      },
      {
        // Y-axis
        scale: 'y',
        values: (_self, ticks) => ticks.map(v => 
          formatValue(v, fieldDefaults.decimals ?? 1, fieldDefaults.unit)
        ),
        stroke: theme.axis.stroke,
        grid: {
          show: true,
          stroke: theme.grid.stroke,
          width: theme.grid.width,
        },
        ticks: {
          stroke: theme.axis.stroke,
        },
        font: theme.axis.font,
        labelFont: theme.axis.font,
        labelSize: 11,
        gap: 5,
        size: (_self, values) => {
          // Handle null or empty values
          if (!values || values.length === 0) return 50;
          const maxLength = Math.max(...values.map(v => String(v).length));
          return maxLength * 7 + 10;
        },
      },
    ];

    // Enable native uPlot legend with isolate for click to toggle
    const legend: uPlot.Legend = {
      show: panelOptions?.legend?.showLegend !== false && transformedData.data.length >= 2,
      live: false,  // Don't show live values in legend (we have tooltip for that)
      isolate: true,  // Enable click to toggle series visibility
    };

    // Cursor configuration
    const cursor: uPlot.Cursor = {
      lock: false,
      focus: {
        prox: 30,
      },
      sync: {
        key: 'scatter',
        setSeries: false,
      },
      points: {
        show: true,
        size: (_u, _seriesIdx) => 9,
        stroke: (_u, _seriesIdx) => '#fff',
        fill: (_u, _seriesIdx) => '#fff',
        width: 2,
      },
    };

    // Hooks for time range selection
    const hooks: any = {};
    
    if (onTimeRangeUpdate) {
      hooks.setSelect = [
        (self: any) => {
          const selection = self.select;
          if (selection && selection.width > 0) {
            const left = selection.left;
            const right = selection.left + selection.width;
            
            const from = self.posToVal(left, 'x');
            const to = self.posToVal(right, 'x');
            
            if (from && to) {
              // uPlot provides time in seconds, convert to milliseconds for Date
              onTimeRangeUpdate({
                type: 'absolute',
                from: new Date(from * 1000),
                to: new Date(to * 1000),
              });
              
              // Clear selection after update
              self.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
            }
          }
        },
      ];
    }

    // Add tooltip plugin
    const plugins: uPlot.Plugin[] = [
      createTooltipPlugin({
        decimals: fieldDefaults.decimals,
        unit: fieldDefaults.unit,
      }),
    ];

    return {
      class: 'gigapi-scatter-plot',
      mode: 2, // Points only mode
      series,
      scales,
      axes,
      legend,
      cursor,
      hooks,
      plugins,
      padding: [10, 10, 10, 10] as [number, number, number, number],
    };
  }, [transformedData, config, theme, onTimeRangeUpdate]);

  // Don't render if no data or invalid data
  if (!transformedData.data || transformedData.data.length < 2 || !transformedData.data[0].length) {
    return (
      <div 
        className="flex items-center justify-center text-muted-foreground"
        style={{ height, width }}
      >
        <div className="text-center">
          <div className="text-sm">No data available</div>
          <div className="text-xs mt-1">Check your query and field mapping</div>
        </div>
      </div>
    );
  }

  return (
    <UPlotWrapper
      data={transformedData.data}
      options={options}
      height={height}
      width={width}
      className="scatter-plot"
    />
  );
}