import { type PanelType, type PanelTypeDefinition, type PanelConfig } from "@/types/dashboard.types";
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
    defaultConfig: {
      type: 'timeseries',
      title: 'Time Series Chart',
      query: 'SELECT timestamp, value FROM your_table WHERE $__timeFilter',
      dataMapping: {
        valueColumn: 'value',
        timeColumn: 'timestamp',
      },
      visualization: {
        showLegend: true,
        colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
      },
    },
    component: TimeSeriesPanel,
  },
  
  line: {
    type: 'line',
    name: 'Line Chart',
    description: 'Simple line chart for data visualization',
    defaultConfig: {
      type: 'line',
      title: 'Line Chart',
      query: 'SELECT x, y FROM your_table WHERE $__timeFilter',
      dataMapping: {
        valueColumn: 'y',
        labelColumns: ['x'],
      },
      visualization: {
        showLegend: false,
        colors: ['#3b82f6'],
      },
    },
    component: TimeSeriesPanel, // Reuse TimeSeries component
  },
  
  area: {
    type: 'area',
    name: 'Area Chart',
    description: 'Area chart with filled regions',
    defaultConfig: {
      type: 'area',
      title: 'Area Chart',
      query: 'SELECT timestamp, value FROM your_table WHERE $__timeFilter',
      dataMapping: {
        valueColumn: 'value',
        timeColumn: 'timestamp',
      },
      visualization: {
        showLegend: true,
        colors: ['#3b82f6', '#10b981', '#f59e0b'],
      },
    },
    component: TimeSeriesPanel, // Reuse TimeSeries component
  },
  
  bar: {
    type: 'bar',
    name: 'Bar Chart',
    description: 'Bar chart for categorical data',
    defaultConfig: {
      type: 'bar',
      title: 'Bar Chart',
      query: 'SELECT category, value FROM your_table WHERE $__timeFilter',
      dataMapping: {
        valueColumn: 'value',
        labelColumns: ['category'],
      },
      visualization: {
        showLegend: false,
        colors: ['#3b82f6'],
      },
    },
    component: TimeSeriesPanel, // Reuse TimeSeries component with bar type
  },
  
  scatter: {
    type: 'scatter',
    name: 'Scatter Plot',
    description: 'Scatter plot for correlation analysis',
    defaultConfig: {
      type: 'scatter',
      title: 'Scatter Plot',
      query: 'SELECT x, y FROM your_table WHERE $__timeFilter',
      dataMapping: {
        valueColumn: 'y',
        labelColumns: ['x'],
      },
      visualization: {
        showLegend: false,
        colors: ['#3b82f6'],
      },
    },
    component: TimeSeriesPanel, // Reuse TimeSeries component
  },
  
  stat: {
    type: 'stat',
    name: 'Stat',
    description: 'Display single value statistics',
    defaultConfig: {
      type: 'stat',
      title: 'Current Value',
      query: 'SELECT value FROM your_table WHERE $__timeFilter ORDER BY timestamp DESC LIMIT 1',
      dataMapping: {
        valueColumn: 'value',
      },
      visualization: {
        unit: '',
        decimals: 2,
      },
    },
    component: StatPanel,
  },
  
  gauge: {
    type: 'gauge',
    name: 'Gauge',
    description: 'Circular gauge for displaying values within a range',
    defaultConfig: {
      type: 'gauge',
      title: 'Gauge',
      query: 'SELECT value FROM your_table WHERE $__timeFilter ORDER BY timestamp DESC LIMIT 1',
      dataMapping: {
        valueColumn: 'value',
      },
      visualization: {
        min: 0,
        max: 100,
        unit: '%',
      },
    },
    component: GaugePanel,
  },
  
  table: {
    type: 'table',
    name: 'Table',
    description: 'Tabular data display with sorting and filtering',
    defaultConfig: {
      type: 'table',
      title: 'Data Table',
      query: 'SELECT * FROM your_table WHERE $__timeFilter ORDER BY timestamp DESC',
      dataMapping: {
        valueColumn: 'value', // Required but not used for tables
        displayColumns: [], // Empty means show all columns
      },
      visualization: {
        sortColumn: 'timestamp',
        sortDirection: 'desc',
        pageSize: 10,
      },
    },
    component: TablePanel,
  },
};

// Helper functions
export function getPanelTypeDefinition(type: PanelType): PanelTypeDefinition | undefined {
  return PANEL_TYPES[type];
}

export function createDefaultPanelConfig(type: PanelType): Partial<PanelConfig> {
  const definition = getPanelTypeDefinition(type);
  return definition ? definition.defaultConfig : {};
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