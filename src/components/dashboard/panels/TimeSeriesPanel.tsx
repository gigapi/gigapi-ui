import { useMemo, useRef, useEffect, useCallback } from "react";
import * as echarts from "echarts";
import { type PanelProps } from "@/types/dashboard.types";
import { transformDataForPanel } from "@/lib/dashboard/data-transformers";
import { withPanelWrapper } from "./BasePanel";

function TimeSeriesPanel({ config, data, isEditMode, onTimeRangeUpdate }: PanelProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  const transformedData = useMemo(() => {
    if (!data || data.length === 0) {
      return null;
    }
    
    return transformDataForPanel(data, config);
  }, [data, config]);

  const chartOption = useMemo(() => {
    if (!transformedData || transformedData.data.length === 0) return null;

    const { data: chartData, series } = transformedData;
    
    // Use Grafana-like field configuration
    const fieldConfig = config.fieldConfig.defaults;
    const customConfig = fieldConfig.custom;
    const options = config.options;
    
    // Determine chart type from panel type and field config
    let chartType = 'line';
    let areaStyle: any = undefined;
    
    if (config.type === 'bar' || customConfig?.drawStyle === 'bars') {
      chartType = 'bar';
    } else if (config.type === 'scatter' || customConfig?.drawStyle === 'points') {
      chartType = 'scatter';
    } else if (config.type === 'area' || (customConfig?.fillOpacity && customConfig.fillOpacity > 0)) {
      chartType = 'line';
      areaStyle = { opacity: customConfig?.fillOpacity || 0.1 };
    }
    
    // Colors from field config
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    
    // Legend from panel options
    const showLegend = options?.legend?.showLegend !== false;
    const legendPlacement = options?.legend?.placement || 'bottom';
    
    // Group data by series
    const seriesData = new Map<string, Array<[string | number, number]>>();
    
    chartData.forEach(point => {
      const seriesName = point.series || 'default';
      if (!seriesData.has(seriesName)) {
        seriesData.set(seriesName, []);
      }
      
      const xValue = point.x instanceof Date ? point.x.getTime() : point.x;
      seriesData.get(seriesName)!.push([xValue, point.y]);
    });

    // Sort each series by x value
    seriesData.forEach(data => {
      data.sort((a, b) => {
        const aVal = typeof a[0] === 'number' ? a[0] : new Date(a[0]).getTime();
        const bVal = typeof b[0] === 'number' ? b[0] : new Date(b[0]).getTime();
        return aVal - bVal;
      });
    });

    const chartSeries = Array.from(seriesData.entries()).map(([name, data], index) => {
      return {
        name,
        type: chartType,
        data,
        smooth: customConfig?.lineInterpolation === 'smooth',
        areaStyle,
        color: colors[index % colors.length],
        lineStyle: {
          width: customConfig?.lineWidth || 2,
        },
        symbol: chartType === 'scatter' ? 'circle' : 'none',
        symbolSize: customConfig?.pointSize || 4,
        emphasis: {
          focus: 'series',
        },
      };
    });

    const isTimeData = chartData.some(point => point.x instanceof Date || 
      (typeof point.x === 'number' && point.x > 1000000000));

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          label: {
            backgroundColor: '#6a7985'
          }
        },
        formatter: (params: any) => {
          if (!Array.isArray(params)) params = [params];
          
          const time = isTimeData 
            ? new Date(params[0].value[0]).toLocaleString()
            : params[0].value[0];
            
          let tooltip = `<div><strong>${time}</strong></div>`;
          
          params.forEach((param: any) => {
            const value = param.value[1];
            const unit = fieldConfig.unit || '';
            const decimals = fieldConfig.decimals ?? 2;
            
            // Get field mapping to show proper field names
            const fieldMapping = config.fieldMapping;
            const valueFieldName = fieldMapping?.yField || 'value';
            
            // Show series name if it's different from the field name (i.e., grouped by location)
            const displayName = param.seriesName === valueFieldName 
              ? valueFieldName 
              : `${valueFieldName} (${param.seriesName})`;
            
            tooltip += `<div>${param.marker} ${displayName}: <strong>${value.toFixed(decimals)}${unit}</strong></div>`;
          });
          
          return tooltip;
        }
      },
      legend: {
        show: showLegend && series.length > 1,
        type: 'scroll',
        orient: legendPlacement === 'right' ? 'vertical' : 'horizontal',
        bottom: legendPlacement === 'bottom' ? 0 : undefined,
        right: legendPlacement === 'right' ? 0 : undefined,
        top: legendPlacement === 'top' ? 0 : undefined,
        textStyle: {
          fontSize: 12,
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: showLegend && series.length > 1 ? '15%' : '3%',
        top: '10%',
        containLabel: true
      },
      xAxis: {
        type: isTimeData && config.type !== 'bar' ? 'time' : 'category',
        boundaryGap: config.type === 'bar',
        name: customConfig?.axisLabel || '',
        nameLocation: 'middle',
        nameGap: 25,
        axisLabel: {
          fontSize: 11,
          formatter: isTimeData && config.type !== 'bar' ? undefined : (value: any) => {
            return String(value).length > 10 ? String(value).substring(0, 10) + '...' : value;
          }
        },
      },
      yAxis: {
        type: 'value',
        name: customConfig?.axisLabel || '',
        nameLocation: 'middle',
        nameGap: 40,
        min: fieldConfig.min,
        max: fieldConfig.max,
        axisLabel: {
          fontSize: 11,
          formatter: (value: number) => {
            const unit = fieldConfig.unit || '';
            const decimals = fieldConfig.decimals ?? 1;
            
            if (Math.abs(value) >= 1000000) {
              return (value / 1000000).toFixed(decimals) + 'M' + unit;
            } else if (Math.abs(value) >= 1000) {
              return (value / 1000).toFixed(decimals) + 'K' + unit;
            }
            return value.toFixed(decimals) + unit;
          }
        },
      },
      series: chartSeries,
      animation: false,
      animationDuration: 0,
      // Time range selection for time series
      brush: isTimeData && !isEditMode ? {
        brushMode: 'lineX',
        xAxisIndex: 0,
        brushStyle: {
          borderWidth: 1,
          color: 'rgba(59, 130, 246, 0.1)',
          borderColor: 'rgba(59, 130, 246, 0.4)'
        },
        removeOnClick: true
      } : undefined,
      toolbox: isTimeData && !isEditMode ? {
        show: true,
        right: '10',
        top: '10',
        itemSize: 12,
        feature: {
          brush: {
            type: ['lineX'],
            title: {
              lineX: 'Select time range'
            }
          }
        },
        iconStyle: {
          borderColor: '#666'
        }
      } : undefined,
      dataZoom: isTimeData ? [
        {
          type: 'inside',
          xAxisIndex: 0,
          filterMode: 'filter',
          disabled: isEditMode
        }
      ] : undefined,
    };
  }, [transformedData, config, isEditMode]);

  // Initialize chart
  useEffect(() => {
    if (!chartRef.current) return;

    chartInstance.current = echarts.init(chartRef.current, undefined, {
      renderer: 'canvas',
    });

    return () => {
      chartInstance.current?.dispose();
    };
  }, []);

  // Update chart option
  useEffect(() => {
    if (!chartInstance.current || !chartOption) return;

    chartInstance.current.setOption(chartOption, true);
  }, [chartOption]);

  // Handle resize
  useEffect(() => {
    const resizeChart = () => {
      chartInstance.current?.resize();
    };

    const resizeObserver = new ResizeObserver(resizeChart);
    if (chartRef.current) {
      resizeObserver.observe(chartRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Brush selection handler for time range updates
  const handleBrushEnd = useCallback((params: any) => {
    if (!onTimeRangeUpdate || !params.areas || params.areas.length === 0) return;
    
    const brushArea = params.areas[0];
    if (!brushArea || !brushArea.coordRange) return;
    
    const [startTime, endTime] = brushArea.coordRange;
    
    // Convert timestamps to TimeRange format
    const timeRange = {
      type: 'absolute' as const,
      from: new Date(startTime),
      to: new Date(endTime)
    };
    
    onTimeRangeUpdate(timeRange);
    
    // Clear the brush area after selection
    if (chartInstance.current) {
      chartInstance.current.dispatchAction({
        type: 'brush',
        areas: []
      });
    }
  }, [onTimeRangeUpdate]);

  // Add event listeners
  useEffect(() => {
    if (!chartInstance.current || !onTimeRangeUpdate || isEditMode) return;
    
    chartInstance.current.on('brushEnd', handleBrushEnd);
    
    return () => {
      if (chartInstance.current) {
        chartInstance.current.off('brushEnd', handleBrushEnd);
      }
    };
  }, [handleBrushEnd, onTimeRangeUpdate, isEditMode]);

  if (!transformedData || transformedData.data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <div className="text-sm">No data available</div>
          <div className="text-xs mt-1">Check your query and time range</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <div 
        ref={chartRef} 
        className="w-full h-full"
        style={{ minHeight: '200px' }}
      />
    </div>
  );
}

export default withPanelWrapper(TimeSeriesPanel);