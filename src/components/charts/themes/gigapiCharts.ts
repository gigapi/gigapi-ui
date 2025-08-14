import type { ChartTheme } from '../core/types';

// gigapi color palette
export const GIGAPI_CHARTS_COLORS = [
  '#7EB26D', // green
  '#EAB839', // yellow
  '#6ED0E0', // light blue
  '#EF843C', // orange
  '#E24D42', // red
  '#1F78C1', // blue
  '#BA43A9', // purple
  '#705DA0', // violet
  '#508642', // dark green
  '#CCA300', // dark yellow
  '#447EBC', // dark blue
  '#C15C17', // dark orange
  '#890F02', // dark red
  '#0A437C', // darker blue
  '#6D1F62', // dark purple
  '#584477', // dark violet
];

export const GigapiChartsDarkTheme: ChartTheme = {
  backgroundColor: 'transparent',
  colors: GIGAPI_CHARTS_COLORS,
  grid: {
    stroke: 'rgba(255, 255, 255, 0.1)',
    width: 1,
  },
  axis: {
    stroke: 'rgba(255, 255, 255, 0.2)',
    font: '11px Inter, system-ui, -apple-system, sans-serif',
    labelColor: 'rgba(255, 255, 255, 0.7)',
    titleColor: 'rgba(255, 255, 255, 0.9)',
  },
  series: {
    width: 1.5,
    points: {
      show: false,
    },
  },
  legend: {
    background: 'rgba(30, 30, 30, 0.9)',
    textColor: 'rgba(255, 255, 255, 0.9)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  tooltip: {
    background: 'rgba(30, 30, 30, 0.9)',
    textColor: 'rgba(255, 255, 255, 0.9)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
};

export const GigapiChartsLightTheme: ChartTheme = {
  backgroundColor: 'transparent',
  colors: GIGAPI_CHARTS_COLORS,
  grid: {
    stroke: 'rgba(0, 0, 0, 0.2)',  // Increased from 0.1
    width: 1,
  },
  axis: {
    stroke: 'rgba(0, 0, 0, 0.3)',  // Increased from 0.2
    font: '11px Inter, system-ui, -apple-system, sans-serif',
    labelColor: 'rgba(0, 0, 0, 0.8)',  // Increased from 0.7
    titleColor: 'rgba(0, 0, 0, 0.9)',
  },
  series: {
    width: 1.5,
    points: {
      show: false,
    },
  },
  legend: {
    background: 'rgba(255, 255, 255, 0.98)',
    textColor: 'rgba(0, 0, 0, 0.9)',
    borderColor: 'rgba(0, 0, 0, 0.2)',  // Increased from 0.1
  },
  tooltip: {
    background: 'rgba(255, 255, 255, 0.98)',
    textColor: 'rgba(0, 0, 0, 0.9)',
    borderColor: 'rgba(0, 0, 0, 0.3)',  // Increased from 0.2
  },
};

export function getTheme(isDarkMode: boolean): ChartTheme {
  return isDarkMode ? GigapiChartsDarkTheme : GigapiChartsLightTheme;
}