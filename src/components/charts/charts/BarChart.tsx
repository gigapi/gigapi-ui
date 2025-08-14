import { useMemo } from 'react';
import uPlot from 'uplot';
import { UPlotWrapper } from '../core/UPlotWrapper';
import { useTheme, formatAxisTime, formatValue, getSeriesColor } from '../themes/utils';
import { transformForBarChart } from '../utils/data-transformer';
import { createTooltipPlugin } from '../plugins/tooltip';
import type { BarChartProps } from '../core/types';

/**
 * Bar Chart Component
 * Uses custom paths to render bars
 */
export function BarChart({
  data,
  config,
  height = 400,
  width = '100%',
  onTimeRangeUpdate,
}: BarChartProps) {
  const { theme } = useTheme();
  
  // Transform data to uPlot format
  const transformedData = useMemo(() => {
    return transformForBarChart(data, config);
  }, [data, config]);

  // Bar renderer plugin
  const barPlugin = useMemo(() => {
    return {
      hooks: {
        drawSeries: [
          (u: uPlot, seriesIdx: number) => {
            const ctx = u.ctx;
            const series = u.series[seriesIdx];
            const xdata = u.data[0];
            const ydata = u.data[seriesIdx];
            // const scaleX = u.scales.x;
            // const scaleY = u.scales.y;
            
            if (!ydata || seriesIdx === 0) return;

            ctx.save();

            const barWidth = Math.min(
              50, // max width
              (u.bbox.width / xdata.length) * 0.6 // 60% of available space
            );
            
            const totalSeries = transformedData.data.length - 1; // Exclude X-axis
            const seriesIndex = seriesIdx - 1;
            const barOffset = totalSeries > 1 
              ? (seriesIndex - (totalSeries - 1) / 2) * (barWidth / totalSeries)
              : 0;

            // Draw bars
            for (let i = 0; i < xdata.length; i++) {
              if (ydata[i] == null) continue;

              const x = u.valToPos(xdata[i], 'x', true);
              const y = u.valToPos(ydata[i]!, 'y', true);
              const y0 = u.valToPos(0, 'y', true);
              
              const barX = x - barWidth / 2 + barOffset;
              const barHeight = y0 - y;
              
              // Set fill color - handle both string and function stroke types
              const strokeColor = typeof series.stroke === 'function' 
                ? series.stroke(u, seriesIndex) 
                : (series.stroke || getSeriesColor(theme, seriesIndex));
              ctx.fillStyle = strokeColor;
              
              // Draw bar
              ctx.fillRect(
                Math.round(barX),
                Math.round(y),
                Math.round(barWidth / (totalSeries || 1)),
                Math.round(barHeight)
              );
              
              // Draw border
              ctx.strokeStyle = theme.axis.stroke;
              ctx.lineWidth = 0.5;
              ctx.strokeRect(
                Math.round(barX),
                Math.round(y),
                Math.round(barWidth / (totalSeries || 1)),
                Math.round(barHeight)
              );
            }

            ctx.restore();
            
            return false; // Don't draw default lines
          },
        ],
      },
    };
  }, [transformedData.data.length, theme]);

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
        fill: `${getSeriesColor(theme, colorIndex)}80`, // 50% opacity
        paths: () => null, // Don't draw lines, handled by plugin
        points: {
          show: false,
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
        range: (_self, dataMin, dataMax) => {
          // Handle edge cases
          if (!isFinite(dataMin) || !isFinite(dataMax)) {
            return [0, 100];
          }
          // Add padding for bars
          const padding = Math.abs(dataMax - dataMin) * 0.02 || 1;
          return [dataMin - padding, dataMax + padding];
        },
      },
      y: {
        auto: fieldDefaults.min === undefined && fieldDefaults.max === undefined,
        range: (_self, dataMin, dataMax) => {
          let min = fieldDefaults.min ?? Math.min(0, dataMin);
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
      points: {
        show: false, // No points for bars
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

    return {
      class: 'gigapi-bar-chart',
      plugins: [
        barPlugin,
        createTooltipPlugin({
          decimals: fieldDefaults.decimals,
          unit: fieldDefaults.unit,
        }),
      ],
      series,
      scales,
      axes,
      legend,
      cursor,
      hooks,
      padding: [10, 10, 10, 10] as [number, number, number, number],
    };
  }, [transformedData, config, theme, barPlugin, onTimeRangeUpdate]);

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
      className="bar-chart"
    />
  );
}