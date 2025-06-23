// import * as echarts from "echarts"; // Reserved for future use
import { type ChartDataPoint, type VisualizationConfig } from "@/types/dashboard.types";

export interface ChartConfig {
  data: ChartDataPoint[];
  visualization: VisualizationConfig;
  isEditMode?: boolean;
}

export function createTimeSeriesConfig({
  data,
  visualization,
  isEditMode = false,
}: ChartConfig) {
  // Group data by series
  const seriesData = new Map<string, Array<[string | number, number]>>();
  
  data.forEach(point => {
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

  const chartSeries = Array.from(seriesData.entries()).map(([name, data], index) => ({
    name,
    type: 'line',
    data,
    smooth: true,
    color: visualization.colors?.[index % (visualization.colors?.length || 1)],
    lineStyle: {
      width: 2,
    },
    symbol: 'none',
    emphasis: {
      focus: 'series',
    },
  }));

  const isTimeData = data.some(point => point.x instanceof Date || 
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
      show: visualization.showLegend !== false && seriesData.size > 1,
      type: 'scroll',
      bottom: 0,
      textStyle: {
        fontSize: 12,
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: visualization.showLegend !== false && seriesData.size > 1 ? '15%' : '3%',
      top: '10%',
      containLabel: true
    },
    xAxis: {
      type: isTimeData ? 'time' : 'category',
      boundaryGap: false,
      name: visualization.xAxisLabel,
      nameLocation: 'middle',
      nameGap: 25,
      axisLabel: {
        fontSize: 11,
        formatter: isTimeData ? undefined : (value: any) => {
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
    animation: !isEditMode,
    animationDuration: 300,
  };
}

export function createBarConfig({
  data,
  visualization,
  isEditMode = false,
}: ChartConfig) {
  const config = createTimeSeriesConfig({ data, visualization, isEditMode });
  
  // Convert line series to bar series
  config.series = config.series.map(series => {
    const { smooth, ...rest } = series;
    return {
      ...rest,
      type: 'bar',
    };
  }) as any;

  return config;
}

export function createAreaConfig({
  data,
  visualization,
  isEditMode = false,
}: ChartConfig) {
  const config = createTimeSeriesConfig({ data, visualization, isEditMode });
  
  // Add area style to line series
  config.series = config.series.map(series => ({
    ...series,
    areaStyle: {},
  }));

  return config;
}

export function createScatterConfig({
  data,
  visualization,
  isEditMode = false,
}: ChartConfig) {
  const config = createTimeSeriesConfig({ data, visualization, isEditMode });
  
  // Convert to scatter series
  config.series = config.series.map(series => {
    const { smooth, lineStyle, ...rest } = series;
    return {
      ...rest,
      type: 'scatter',
      symbol: 'circle',
      symbolSize: 6,
    };
  }) as any;

  return config;
}

export function createGaugeConfig({
  value,
  min = 0,
  max = 100,
  title,
  unit = '',
  thresholds,
  isEditMode = false,
}: {
  value: number;
  min?: number;
  max?: number;
  title: string;
  unit?: string;
  thresholds?: Array<{ min: number; max: number; color: string }>;
  isEditMode?: boolean;
}) {
  return {
    series: [
      {
        name: title,
        type: 'gauge',
        startAngle: 180,
        endAngle: 0,
        center: ['50%', '75%'],
        radius: '90%',
        min,
        max,
        splitNumber: 5,
        axisLine: {
          lineStyle: {
            width: 6,
            color: thresholds?.length 
              ? thresholds.map(t => [t.max / max, t.color])
              : [[1, '#52c41a']]
          }
        },
        pointer: {
          icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
          length: '12%',
          width: 20,
          offsetCenter: [0, '-60%'],
          itemStyle: {
            color: 'auto'
          }
        },
        axisTick: {
          length: 12,
          lineStyle: {
            color: 'auto',
            width: 2
          }
        },
        splitLine: {
          length: 20,
          lineStyle: {
            color: 'auto',
            width: 5
          }
        },
        axisLabel: {
          color: '#464646',
          fontSize: 12,
          distance: -60,
          rotate: 'tangential',
          formatter: function (value: number) {
            if (Math.abs(value) >= 1000) {
              return (value / 1000).toFixed(1) + 'K';
            }
            return value.toFixed(0);
          }
        },
        title: {
          offsetCenter: [0, '-10%'],
          fontSize: 14,
          color: '#464646'
        },
        detail: {
          fontSize: 18,
          offsetCenter: [0, '-35%'],
          valueAnimation: true,
          formatter: function (value: number) {
            let formattedValue: string;
            if (Math.abs(value) >= 1e6) {
              formattedValue = (value / 1e6).toFixed(1) + 'M';
            } else if (Math.abs(value) >= 1e3) {
              formattedValue = (value / 1e3).toFixed(1) + 'K';
            } else {
              formattedValue = value.toFixed(1);
            }
            return formattedValue + unit;
          },
          color: 'inherit'
        },
        data: [
          {
            value,
            name: title,
          }
        ]
      }
    ],
    animation: !isEditMode,
    animationDuration: 1000,
    animationEasing: 'elasticOut' as const,
  };
}

export const ChartUtils = {
  formatNumber: (value: number, unit: string = '') => {
    if (Math.abs(value) >= 1e9) {
      return (value / 1e9).toFixed(1) + 'B' + unit;
    } else if (Math.abs(value) >= 1e6) {
      return (value / 1e6).toFixed(1) + 'M' + unit;
    } else if (Math.abs(value) >= 1e3) {
      return (value / 1e3).toFixed(1) + 'K' + unit;
    }
    return value.toFixed(1) + unit;
  },

  formatTime: (timestamp: number | string | Date) => {
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? String(timestamp) : date.toLocaleString();
  },

  getDefaultColors: () => [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6366f1'
  ],
};