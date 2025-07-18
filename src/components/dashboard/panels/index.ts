import {
  type PanelType,
  type PanelTypeDefinition,
} from "@/types/dashboard.types";
import { ChartRenderer } from "../../shared/ChartRenderer";
import StatPanel from "./StatPanel";
import GaugePanel from "./GaugePanel";
import TablePanel from "./TablePanel";
import { withPanelWrapper } from "./BasePanel";

// Unified chart component for all chart types
const UnifiedChartPanel = withPanelWrapper(ChartRenderer);

// Export ChartRenderer for direct use (e.g., in ChatArtifact)
export { ChartRenderer };

// Panel registry
export const PANEL_TYPES: Record<PanelType, PanelTypeDefinition> = {
  timeseries: {
    type: "timeseries",
    name: "Time Series",
    description: "Visualize data over time with line charts",
    component: UnifiedChartPanel,
  },

  line: {
    type: "line",
    name: "Line Chart",
    description: "Simple line chart for data visualization",
    component: UnifiedChartPanel,
  },

  area: {
    type: "area",
    name: "Area Chart",
    description: "Area chart with filled regions",
    component: UnifiedChartPanel,
  },

  bar: {
    type: "bar",
    name: "Bar Chart",
    description: "Bar chart for categorical data",
    component: UnifiedChartPanel,
  },

  scatter: {
    type: "scatter",
    name: "Scatter Plot",
    description: "Scatter plot for correlation analysis",
    component: UnifiedChartPanel,
  },

  stat: {
    type: "stat",
    name: "Stat",
    description: "Display single value statistics",
    component: StatPanel,
  },

  gauge: {
    type: "gauge",
    name: "Gauge",
    description: "Display values with visual gauge indicators",
    component: GaugePanel,
  },

  table: {
    type: "table",
    name: "Table",
    description: "Tabular data display with sorting and filtering",
    component: TablePanel,
  },

  pie: {
    type: "pie",
    name: "Pie Chart",
    description: "Pie chart for displaying proportional data",
    component: UnifiedChartPanel,
  },

  donut: {
    type: "donut",
    name: "Donut Chart",
    description: "Donut chart with hollow center",
    component: UnifiedChartPanel,
  },
};

// Helper functions
export function getPanelTypeDefinition(
  type: PanelType
): PanelTypeDefinition | undefined {
  return PANEL_TYPES[type];
}

export function getPanelComponent(type: PanelType) {
  const definition = getPanelTypeDefinition(type);
  return definition?.component;
}
