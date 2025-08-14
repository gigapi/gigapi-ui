import { useMemo, useCallback } from 'react';
import uPlot from 'uplot';
import { UPlotWrapper } from '../core/UPlotWrapper';
import { useTheme, formatAxisTime, formatValue, getSeriesColor } from '../themes/utils';
import { transformToUPlotData } from '../utils/data-transformer';
import { createTooltipPlugin } from '../plugins/tooltip';
import type { TimeSeriesProps } from '../core/types';

/**
 * Time Series Chart Component
 * Supports line, area, and time series visualizations
 */
export function TimeSeries({
  data,
  config,
  height = 400,
  width = '100%',
  onTimeRangeUpdate,
}: TimeSeriesProps) {
  const { theme } = useTheme();
  
  // Transform data to uPlot format
  const transformedData = useMemo(() => {
    return transformToUPlotData(data, config);
  }, [data, config]);

  // Generate chart options
  const options = useMemo((): Partial<uPlot.Options> => {
    const { fieldConfig, options: panelOptions } = config;
    const isAreaChart = config.type === 'area';
    const fieldDefaults = fieldConfig?.defaults || {};
    
    // Calculate time span for axis formatting
    const timeSpan = transformedData.metadata.timeRange
      ? transformedData.metadata.timeRange.max.getTime() - transformedData.metadata.timeRange.min.getTime()
      : 0;

    // Create series configuration - MUST match data array length exactly
    const series: uPlot.Series[] = [
      {
        // X-axis series (time) - empty label required for legend to render
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
        width: fieldDefaults.custom?.lineWidth || theme.series.width,
        fill: isAreaChart 
          ? `${getSeriesColor(theme, colorIndex)}20` // 20% opacity for area
          : undefined,
        spanGaps: true,
        points: {
          show: fieldDefaults.custom?.showPoints === 'always',
          size: fieldDefaults.custom?.pointSize || 4,
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
          
          // Add padding if auto
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
        // X-axis (time)
        scale: 'x',
        space: 60,  // Minimum pixels between ticks to avoid overlap
        values: (_self, ticks) => {
          // Reduce number of labels if too many
          const maxLabels = 8;
          if (ticks.length > maxLabels) {
            const step = Math.ceil(ticks.length / maxLabels);
            return ticks.map((v, i) => i % step === 0 ? formatAxisTime(v, timeSpan) : '');
          }
          return ticks.map(v => formatAxisTime(v, timeSpan));
        },
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
          // Calculate max label width
          const maxLength = Math.max(...values.map(v => String(v).length));
          return maxLength * 7 + 10; // Approximate width
        },
      },
    ];

    // Enable native uPlot legend with isolate for click to toggle
    const legend: uPlot.Legend = {
      show: panelOptions?.legend?.showLegend !== false && transformedData.data.length >= 2,
      live: false,  // Don't show live values in legend (we have tooltip for that)
      isolate: true,  // Enable click to toggle series visibility
    };

    // Cursor/tooltip configuration
    const cursor: uPlot.Cursor = {
      lock: false,
      focus: {
        prox: 30,
      },
      sync: {
        key: 'timeseries',
        setSeries: false,
      },
      points: {
        show: true,
        size: (_u, _seriesIdx) => 8,
        stroke: (_u, _seriesIdx) => '#fff',
        fill: (_u, _seriesIdx) => '#fff',
      },
    };

    // Hooks for time range selection and tooltips
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
      class: 'gigapi-chart',
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

  // Handle chart creation
  const handleCreate = useCallback((chart: uPlot) => {
    // Add custom CSS for gigapi styling
    const container = chart.root;
    if (container) {
      container.style.fontFamily = theme.axis.font;
      
      // Style the legend
      const legend = container.querySelector('.u-legend') as HTMLElement;
      if (legend) {
        legend.style.background = theme.legend.background;
        legend.style.color = theme.legend.textColor;
        legend.style.border = `1px solid ${theme.legend.borderColor}`;
        legend.style.borderRadius = '2px';
        legend.style.padding = '8px';
      }
    }
  }, [theme]);

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
      onCreate={handleCreate}
      height={height}
      width={width}
      className="time-series-chart"
    />
  );
}