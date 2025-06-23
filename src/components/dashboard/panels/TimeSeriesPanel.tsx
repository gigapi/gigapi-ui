import { useMemo, useRef, useEffect } from "react";
import * as echarts from "echarts";
import { type PanelProps } from "@/types/dashboard.types";
import { transformDataForPanel } from "@/lib/dashboard/data-transformers";
import { withPanelWrapper } from "./BasePanel";

function TimeSeriesPanel({ config, data, isEditMode }: PanelProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  const transformedData = useMemo(() => {
    console.log('TimeSeriesPanel transforming data:', { 
      dataLength: data?.length || 0, 
      config: config,
      sampleData: data?.slice(0, 2) 
    });
    
    if (!data || data.length === 0) {
      console.log('TimeSeriesPanel: No data available');
      return null;
    }
    
    const transformed = transformDataForPanel(data, config);
    console.log('TimeSeriesPanel: Transformed data:', {
      resultLength: transformed?.data?.length || 0,
      series: transformed?.series || [],
      sampleTransformed: transformed?.data?.slice(0, 2)
    });
    
    return transformed;
  }, [data, config]);

  const chartOption = useMemo(() => {
    if (!transformedData || transformedData.data.length === 0) return null;

    const { data: chartData, series } = transformedData;
    const { visualization } = config;

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
      // Map panel types to ECharts series types
      let seriesType: string;
      switch (config.type) {
        case 'bar':
          seriesType = 'bar';
          break;
        case 'scatter':
          seriesType = 'scatter';
          break;
        case 'area':
          seriesType = 'line';
          break;
        case 'line':
        case 'timeseries':
        default:
          seriesType = 'line';
          break;
      }

      return {
        name,
        type: seriesType,
        data,
        smooth: config.type === 'line' || config.type === 'timeseries',
        areaStyle: config.type === 'area' ? {} : undefined,
        color: visualization.colors?.[index % (visualization.colors?.length || 1)],
        lineStyle: {
          width: 2,
        },
        symbol: config.type === 'scatter' ? 'circle' : 'none',
        symbolSize: config.type === 'scatter' ? 6 : 4,
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
            const unit = visualization.unit || '';
            tooltip += `<div>${param.marker} ${param.seriesName}: <strong>${value.toFixed(2)}${unit}</strong></div>`;
          });
          
          return tooltip;
        }
      },
      legend: {
        show: visualization.showLegend !== false && series.length > 1,
        type: 'scroll',
        bottom: 0,
        textStyle: {
          fontSize: 12,
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: visualization.showLegend !== false && series.length > 1 ? '15%' : '3%',
        top: '10%',
        containLabel: true
      },
      xAxis: {
        type: isTimeData && config.type !== 'bar' ? 'time' : 'category',
        boundaryGap: config.type === 'bar',
        name: visualization.xAxisLabel,
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
        name: visualization.yAxisLabel,
        nameLocation: 'middle',
        nameGap: 40,
        axisLabel: {
          fontSize: 11,
          formatter: (value: number) => {
            const unit = visualization.unit || '';
            if (Math.abs(value) >= 1000000) {
              return (value / 1000000).toFixed(1) + 'M' + unit;
            } else if (Math.abs(value) >= 1000) {
              return (value / 1000).toFixed(1) + 'K' + unit;
            }
            return value.toFixed(1) + unit;
          }
        },
      },
      series: chartSeries,
      animation: !isEditMode, // Disable animation in edit mode for better performance
      animationDuration: 300,
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