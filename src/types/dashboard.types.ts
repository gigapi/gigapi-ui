export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  timeRange: TimeRange;
  timeZone?: string;
  refreshInterval?: number;
  panels: PanelConfig[];  // Embedded panels directly in dashboard
  layout: {
    panels: PanelLayout[];
    gridSettings?: {
      columns: number;
      rowHeight: number;
      margin: [number, number];
    };
  };
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    tags?: string[];
  };
}

export interface PanelConfig {
  id: string;
  type: PanelType;
  title: string;
  description?: string;

  query: string;
  database?: string;
  table?: string;

  fieldMapping?: FieldMapping;

  fieldConfig: FieldConfig;

  options: PanelOptions;

  gridPos?: GridPosition;

  maxDataPoints?: number;
  intervalMs?: number;

  timeOverride?: TimeRange;
  useParentTimeFilter?: boolean;
  timeField?: string; // Field to use for time filtering when useParentTimeFilter is true

  links?: PanelLink[];
}

export interface PanelLayout {
  panelId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export type TimeRange = RelativeTimeRange | AbsoluteTimeRange;

export interface RelativeTimeRange {
  type: "relative";
  from: string;
  to: "now";
}

export interface AbsoluteTimeRange {
  type: "absolute";
  from: Date;
  to: Date;
}

export interface FieldMapping {
  xField?: string;
  yField?: string;
  seriesField?: string;
  labelField?: string;
  valueField?: string;
}

export interface FieldConfig {
  defaults: FieldDefaults;
  overrides?: FieldOverride[];
}

export interface FieldDefaults {
  color?: ColorConfig;
  custom?: CustomFieldConfig;
  mappings?: ValueMapping[];
  thresholds?: ThresholdsConfig;
  unit?: string;
  decimals?: number;
  min?: number;
  max?: number;
  displayName?: string;
}

export interface ColorConfig {
  mode: "palette-classic" | "palette-modern" | "auto" | "continuous-GrYlRd";
  fixedColor?: string;
  seriesBy?: "last" | "min" | "max";
}

export interface CustomFieldConfig {
  drawStyle?: "line" | "bars" | "points";
  lineInterpolation?: "linear" | "smooth" | "stepBefore" | "stepAfter";
  lineWidth?: number;
  fillOpacity?: number;
  gradientMode?: "none" | "opacity" | "hue" | "scheme";
  showPoints?: "auto" | "always" | "never";
  pointSize?: number;

  axisPlacement?: "auto" | "left" | "right" | "hidden";
  axisLabel?: string;
  axisColorMode?: "text" | "series";
  axisBorderShow?: boolean;
  axisCenteredZero?: boolean;

  stacking?: {
    mode: "none" | "normal" | "percent";
    group: string;
  };

  thresholdsStyle?: {
    mode: "off" | "line" | "area";
  };

  hideFrom?: {
    legend: boolean;
    tooltip: boolean;
    viz: boolean;
  };
}

export interface ThresholdsConfig {
  mode: "absolute" | "percentage";
  steps: ThresholdStep[];
}

export interface ThresholdStep {
  color: string;
  value: number | null;
}

export interface ValueMapping {
  type: "value" | "range" | "regex" | "special";
  options: any;
}

export interface FieldOverride {
  matcher: FieldMatcher;
  properties: FieldProperty[];
}

export interface FieldMatcher {
  id: string;
  options?: any;
}

export interface FieldProperty {
  id: string;
  value: any;
}

export interface PanelOptions {
  legend?: LegendOptions;
  tooltip?: TooltipOptions;
  [key: string]: any;
}

export interface LegendOptions {
  showLegend: boolean;
  displayMode: "list" | "table" | "hidden";
  placement: "bottom" | "right" | "top" | "left";
  calcs?: string[];
  values?: string[];
}

export interface TooltipOptions {
  mode: "single" | "multi" | "none";
  sort: "none" | "asc" | "desc";
  hideZeros?: boolean;
}

export interface GridPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PanelLink {
  title: string;
  url: string;
  targetBlank?: boolean;
  icon?: string;
}

export type PanelType =
  | "timeseries"
  | "stat"
  | "gauge"
  | "table"
  | "bar"
  | "line"
  | "area"
  | "scatter"
  | "pie"
  | "donut";

export interface PanelData {
  panelId: string;
  data: NDJSONRecord[];
  lastUpdated: Date;
  error?: string;
}

export interface NDJSONRecord {
  __timestamp?: string;
  date?: string;
  [key: string]: any;
}

export interface ChartDataPoint {
  x: string | number | Date;
  y: number;
  series?: string;
  timestamp?: Date;
  [key: string]: any;
}

export interface PanelProps {
  config: PanelConfig;
  data: NDJSONRecord[];
  timeZone?: string;
  isEditMode?: boolean;
  isSelected?: boolean;
  onConfigChange?: (panelId: string, newConfig: Partial<PanelConfig>) => void;
  onSelect?: (panelId: string) => void;
  onDelete?: (panelId: string) => void;
  onDuplicate?: (panelId: string) => void;
  onTimeRangeUpdate?: (timeRange: TimeRange) => void;
}

export interface DashboardContextType {
  currentDashboard: Dashboard | null;
  panels: Map<string, PanelConfig>;
  panelData: Map<string, PanelData>;
  panelLoadingStates: Map<string, boolean>;

  isEditMode: boolean;
  selectedPanelId: string | null;
  isConfigSidebarOpen: boolean;

  loading: boolean;
  error: string | null;

  createDashboard: (
    dashboard: Omit<Dashboard, "id" | "metadata">
  ) => Promise<Dashboard>;
  updateDashboard: (id: string, updates: Partial<Dashboard>) => Promise<void>;
  deleteDashboard: (id: string) => Promise<void>;
  loadDashboard: (id: string) => Promise<void>;
  saveDashboard: () => Promise<void>;
  clearCurrentDashboard: () => void;

  addPanel: (
    panel: Omit<PanelConfig, "id">,
    dashboardId?: string
  ) => Promise<string>;
  updatePanel: (id: string, updates: Partial<PanelConfig>) => Promise<void>;
  deletePanel: (id: string) => Promise<void>;
  duplicatePanel: (id: string) => Promise<string>;
  getPanelById: (panelId: string) => PanelConfig | undefined;
  isPanelLoading: (panelId: string) => boolean;

  updateLayout: (layouts: PanelLayout[]) => void;

  refreshPanelData: (panelId: string) => Promise<void>;
  refreshAllPanels: () => Promise<void>;

  updateDashboardTimeRange: (timeRange: TimeRange) => Promise<void>;
  resetDashboardTimeRange: () => Promise<void>;
  updateDashboardTimeZone: (timeZone: string) => Promise<void>;

  setEditMode: (enabled: boolean) => void;
  setSelectedPanel: (panelId: string | null) => void;
  setConfigSidebarOpen: (open: boolean) => void;
}

export interface DashboardListItem {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
  panelCount: number;
}

export interface GridLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  static?: boolean;
  isDraggable?: boolean;
  isResizable?: boolean;
}

export interface PanelTypeDefinition {
  type: PanelType;
  name: string;
  description: string;
  component: React.ComponentType<PanelProps>;
}
