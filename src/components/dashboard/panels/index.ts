import { type PanelType, type PanelTypeDefinition } from "@/types/dashboard.types";
import TimeSeriesPanel from "./TimeSeriesPanel";
import StatPanel from "./StatPanel";
import GaugePanel from "./GaugePanel";
import TablePanel from "./TablePanel";

// Panel registry
export const PANEL_TYPES: Record<PanelType, PanelTypeDefinition> = {
  timeseries: {
    type: 'timeseries',
    name: 'Time Series',
    description: 'Visualize data over time with line charts',
    component: TimeSeriesPanel,
  },
  
  line: {
    type: 'line',
    name: 'Line Chart',
    description: 'Simple line chart for data visualization',
    component: TimeSeriesPanel,
  },
  
  area: {
    type: 'area',
    name: 'Area Chart',
    description: 'Area chart with filled regions',
    component: TimeSeriesPanel,
  },
  
  bar: {
    type: 'bar',
    name: 'Bar Chart',
    description: 'Bar chart for categorical data',
    component: TimeSeriesPanel,
  },
  
  scatter: {
    type: 'scatter',
    name: 'Scatter Plot',
    description: 'Scatter plot for correlation analysis',
    component: TimeSeriesPanel,
  },
  
  stat: {
    type: 'stat',
    name: 'Stat',
    description: 'Display single value statistics',
    component: StatPanel,
  },
  
  gauge: {
    type: 'gauge',
    name: 'Gauge',
    description: 'Circular gauge for displaying values within a range',
    component: GaugePanel,
  },
  
  table: {
    type: 'table',
    name: 'Table',
    description: 'Tabular data display with sorting and filtering',
    component: TablePanel,
  },
};

// Helper functions
export function getPanelTypeDefinition(type: PanelType): PanelTypeDefinition | undefined {
  return PANEL_TYPES[type];
}


export function getAllPanelTypes(): PanelType[] {
  return Object.keys(PANEL_TYPES) as PanelType[];
}

export function getPanelComponent(type: PanelType) {
  const definition = getPanelTypeDefinition(type);
  return definition?.component;
}

// Panel categories for UI organization
export const PANEL_CATEGORIES = {
  'Charts': ['timeseries', 'line', 'area', 'bar', 'scatter'] as PanelType[],
  'Single Value': ['stat', 'gauge'] as PanelType[],
  'Data': ['table'] as PanelType[],
};

export function getPanelsByCategory() {
  return PANEL_CATEGORIES;
}