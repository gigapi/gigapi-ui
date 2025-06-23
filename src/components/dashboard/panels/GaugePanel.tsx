import { useMemo, useRef, useEffect } from "react";
import * as echarts from "echarts";
import { type PanelProps } from "@/types/dashboard.types";
import { withPanelWrapper } from "./BasePanel";

function GaugePanel({ config, data, isEditMode }: PanelProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  const gaugeData = useMemo(() => {
    if (!data || data.length === 0) return null;
    
    const { dataMapping, visualization } = config;
    
    // Get the latest value
    let currentValue: number | null = null;
    for (let i = data.length - 1; i >= 0; i--) {
      const value = parseFloat(String(data[i][dataMapping.valueColumn]));
      if (!isNaN(value)) {
        currentValue = value;
        break;
      }
    }

    if (currentValue === null) return null;

    const min = visualization.min ?? 0;
    const max = visualization.max ?? 100;
    const unit = visualization.unit || '';

    // Calculate threshold zones
    const zones = [];
    if (visualization.threshold) {
      const thresholdValue = visualization.threshold.value;
      const thresholdColor = visualization.threshold.color || '#ff6b6b';
      
      if (visualization.threshold.operator === 'gt') {
        zones.push(
          { min, max: thresholdValue, color: '#52c41a' },
          { min: thresholdValue, max, color: thresholdColor }
        );
      } else if (visualization.threshold.operator === 'lt') {
        zones.push(
          { min, max: thresholdValue, color: thresholdColor },
          { min: thresholdValue, max, color: '#52c41a' }
        );
      }
    }

    return {
      value: currentValue,
      min,
      max,
      unit,
      zones,
      percentage: ((currentValue - min) / (max - min)) * 100,
    };
  }, [data, config]);

  const chartOption = useMemo(() => {
    if (!gaugeData) return null;

    const { value, min, max, unit, zones } = gaugeData;

    return {
      series: [
        {
          name: config.title,
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
              color: zones.length > 0 
                ? zones.map(zone => [zone.max / max, zone.color])
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
              name: config.title,
            }
          ]
        }
      ],
      animation: !isEditMode,
      animationDuration: 1000,
      animationEasing: 'elasticOut' as const,
    };
  }, [gaugeData, config, isEditMode]);

  // Initialize chart
  useEffect(() => {
    if (!chartRef.current) return;

    chartInstance.current = echarts.init(chartRef.current);

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

  if (!gaugeData) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <div className="text-sm">No data available</div>
          <div className="text-xs mt-1">Check your query configuration</div>
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
      
      {/* Additional info below gauge */}
      <div className="absolute bottom-2 left-0 right-0 text-center">
        <div className="text-xs text-muted-foreground">
          Range: {gaugeData.min} - {gaugeData.max} {gaugeData.unit}
        </div>
      </div>
    </div>
  );
}

export default withPanelWrapper(GaugePanel);