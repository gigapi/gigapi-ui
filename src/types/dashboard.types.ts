export interface Dashboard {
  id: string; // UUID
  name: string;
  description?: string;
  timeRange: TimeRange;
  timeZone?: string; // Added: IANA time zone string, e.g., 'UTC', 'America/New_York'
  refreshInterval?: number; // seconds, 0 = no auto-refresh
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
    // timeZone?: string; // Removed from here, moved to root of Dashboard interface
  };
}

export interface PanelConfig {
  id: string;
  type: 'timeseries' | 'stat' | 'gauge' | 'table' | 'bar' | 'line' | 'area' | 'scatter';
  title: string;
  query: string; // SQL with $__timeFilter
  database?: string; // Database to execute the query against
  dataMapping: DataMapping;
  visualization: VisualizationConfig;
  timeOverride?: TimeRange; // Added: Optional time override for individual panels
  // No PanelProps here, it's a separate interface now
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
  type: 'relative';
  from: string; // '1h', '24h', '7d', '30d'
  to: 'now';
}

export interface AbsoluteTimeRange {
  type: 'absolute';
  from: Date;
  to: Date;
}

export interface DataMapping {
  valueColumn: string;
  timeColumn?: string;
  seriesColumn?: string;
  labelColumns?: string[];
  minColumn?: string;
  maxColumn?: string;
  displayColumns?: string[];
}

export interface VisualizationConfig {
  colors?: string[];
  showLegend?: boolean;
  yAxisLabel?: string;
  xAxisLabel?: string;
  // Panel type specific configs
  threshold?: {
    value: number;
    color: string;
    operator: 'gt' | 'lt' | 'eq';
  };
  // For gauge panels
  min?: number;
  max?: number;
  // For stat panels
  unit?: string;
  decimals?: number;
  // For table panels
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  pageSize?: number;
}

export interface PanelData {
  panelId: string;
  data: NDJSONRecord[];
  lastUpdated: Date;
  error?: string;
}

export interface NDJSONRecord {
  __timestamp?: string;
  date?: string;
  [key: string]: any; // Allow other properties
}

// Chart data point for visualization libraries
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
  timeZone: string;
  isEditMode?: boolean; // Added: to indicate if the dashboard is in edit mode
  isSelected?: boolean; // Added: optional, if panels can be selected
  onConfigChange?: (panelId: string, newConfig: Partial<PanelConfig>) => void; // Added: optional, for panel-specific config changes
  onSelect?: (panelId: string) => void; // Added: optional, for panel selection actions
  onDelete?: (panelId: string) => void; // Added
  onDuplicate?: (panelId: string) => void; // Added
}

export interface DashboardContextType {
  // Current dashboard state
  currentDashboard: Dashboard | null;
  panels: Map<string, PanelConfig>;
  panelData: Map<string, PanelData>;
  
  // UI state
  isEditMode: boolean;
  selectedPanelId: string | null;
  isConfigSidebarOpen: boolean;

  // Loading and error states
  loading: boolean;
  error: string | null;
  
  // Dashboard operations
  createDashboard: (dashboard: Omit<Dashboard, 'id' | 'metadata'>) => Promise<Dashboard>;
  updateDashboard: (id: string, updates: Partial<Dashboard>) => Promise<void>;
  deleteDashboard: (id: string) => Promise<void>;
  loadDashboard: (id: string) => Promise<void>;
  saveDashboard: () => Promise<void>;
  clearCurrentDashboard: () => void;
  
  // Panel operations
  addPanel: (panel: Omit<PanelConfig, 'id'>) => Promise<string>;
  updatePanel: (id: string, updates: Partial<PanelConfig>) => Promise<void>;
  deletePanel: (id: string) => Promise<void>;
  duplicatePanel: (id: string) => Promise<string>;
  getPanelById: (panelId: string) => PanelConfig | undefined; // Added getPanelById
  
  // Layout operations
  updateLayout: (layouts: PanelLayout[]) => void;
  
  // Data operations
  refreshPanelData: (panelId: string) => Promise<void>;
  refreshAllPanels: () => Promise<void>;
  
  // Time filter operations
  updateDashboardTimeRange: (timeRange: TimeRange) => Promise<void>;
  updateDashboardTimeZone: (timeZone: string) => Promise<void>;
  
  // UI operations
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

// Grid layout types (extends react-grid-layout)
export interface GridLayoutItem {
  i: string; // panel ID
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

export type PanelType = PanelConfig['type'];

export interface PanelTypeDefinition {
  type: PanelType;
  name: string;
  description: string;
  defaultConfig: Partial<PanelConfig>;
  component: React.ComponentType<PanelProps>;
}