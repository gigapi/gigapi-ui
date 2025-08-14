import type uPlot from 'uplot';
import type { PanelConfig, NDJSONRecord } from '@/types/dashboard.types';

export interface UPlotChartProps {
  data: uPlot.AlignedData;
  options: Partial<uPlot.Options>;
  onCreate?: (chart: uPlot) => void;
  onDelete?: (chart: uPlot) => void;
  className?: string;
  height?: number | string;
  width?: number | string;
}

export interface ChartTheme {
  backgroundColor: string;
  colors: string[];
  grid: {
    stroke: string;
    width: number;
  };
  axis: {
    stroke: string;
    font: string;
    labelColor: string;
    titleColor: string;
  };
  series: {
    width: number;
    points: {
      show: boolean;
      size?: number;
    };
  };
  legend: {
    background: string;
    textColor: string;
    borderColor: string;
  };
  tooltip: {
    background: string;
    textColor: string;
    borderColor: string;
  };
}

export interface TimeSeriesProps {
  data: NDJSONRecord[];
  config: PanelConfig;
  isDarkMode?: boolean;
  height?: number | string;
  width?: number | string;
  onTimeRangeUpdate?: (timeRange: any) => void;
}

export interface BarChartProps extends TimeSeriesProps {}
export interface ScatterPlotProps extends TimeSeriesProps {}

export interface GaugeChartProps {
  value: number;
  min?: number;
  max?: number;
  thresholds?: Array<{ value: number; color: string }>;
  config: PanelConfig;
  isDarkMode?: boolean;
}

export interface PieChartProps {
  data: Array<{ label: string; value: number }>;
  config: PanelConfig;
  isDarkMode?: boolean;
  height?: number | string;
  width?: number | string;
}

export type ChartType = 'timeseries' | 'line' | 'area' | 'bar' | 'scatter' | 'pie' | 'donut' | 'gauge';

export interface TransformedData {
  data: uPlot.AlignedData;
  series: string[];
  metadata: {
    totalRecords: number;
    timeRange?: {
      min: Date;
      max: Date;
    };
    valueRange?: {
      min: number;
      max: number;
    };
  };
}