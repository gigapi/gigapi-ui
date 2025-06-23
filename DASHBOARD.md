# GigAPI Dashboard

## Architecture

- **State Management**: React Context API
- **Persistence**: IndexedDB for client-side storage
- **Visualizations**: ECharts for charts and graphs
- **Layout**: react-grid-layout for resizable/draggable panels
- **Time Filtering**: Dashboard-level time filters inherited by all panels
- **Data Source Independence**: Each panel has its own database/table configuration

### File Structure
```
src/
├── components/dashboard/
│   ├── DashboardGrid.tsx          # Main grid layout component
│   ├── DashboardTimeFilter.tsx    # Dashboard-level time filter UI
│   ├── DatabaseTableSelector.tsx  # Database/table selector for panels
│   ├── DashboardPanel.tsx         # Individual panel wrapper
│   ├── DashboardSettingsSheet.tsx # Dashboard settings modal
│   ├── panels/                    # Panel type implementations
│   │   ├── TimeSeriesPanel.tsx    # Line/area/bar/scatter charts
│   │   ├── StatPanel.tsx          # Single value displays
│   │   ├── GaugePanel.tsx         # Circular gauge charts
│   │   ├── TablePanel.tsx         # Data tables
│   │   └── index.ts               # Panel registry
│   └── editors/                   # Configuration editors
│       ├── QueryEditor.tsx        # Monaco SQL editor
│       ├── DataMappingEditor.tsx  # Column mapping
│       └── VisualizationEditor.tsx # Chart settings
├── contexts/
│   ├── DashboardContext.tsx       # Dashboard state management
│   ├── QueryContext.tsx           # Main query interface (isolated)
│   ├── TimeContext.tsx            # Main query time filtering (isolated)
│   └── DatabaseContext.tsx        # Main query database selection (isolated)
├── lib/dashboard/
│   ├── storage.ts                 # IndexedDB operations
│   ├── data-transformers.ts       # Data processing utilities
│   └── query-processing.ts        # Dashboard query time variable processing
├── pages/
│   ├── DashboardView.tsx          # Dashboard view page
│   ├── DashboardList.tsx          # Dashboard listing
│   └── PanelEdit.tsx              # Panel editing page
└── types/dashboard.types.ts       # TypeScript definitions
```

## Data Flow

### 1. Dashboard Lifecycle
```
Dashboard Creation → Panel Addition → Database/Table Selection → Query Auto-Generation → Time Filter Inheritance → Data Visualization → Export/Import
```

### 2. Panel Data Processing Pipeline
```
Panel Query (with $__timeFilter) → Dashboard Time Range Injection → processDashboardQueryWithTime() → Panel's Database Query → NDJSON Response → Data Transformation → Chart Rendering
```

### 3. State Management Flow
```
User Action → Dashboard Context Update → Panel-Specific State → Storage Persistence → UI Re-render
```

### 4. Time Filtering Architecture
```
Dashboard Time Filter (DashboardTimeFilter.tsx) → Dashboard Context (timeRange) → Panel Inherits Time Range → processDashboardQueryWithTime() → $__timeFilter Replacement → Query Execution
```

### 5. Data Source Independence
```
Panel Edit → DatabaseTableSelector → Per-Panel Database Config → Panel Query Execution → Isolated from Main Query Interface
```

## Core Components

### Dashboard System

#### DashboardContext
**File**: `src/contexts/DashboardContext.tsx`

Central state management for the entire dashboard system with time filtering and data source independence.

**State Structure**:
```typescript
interface DashboardContextType {
  // Core State
  currentDashboard: Dashboard | null
  panels: Map<string, PanelConfig>
  panelData: Map<string, PanelData>
  isEditMode: boolean
  selectedPanelId: string | null
  
  // Operations
  createDashboard: (data: Omit<Dashboard, 'id' | 'metadata'>) => Promise<Dashboard>
  updateDashboard: (id: string, updates: Partial<Dashboard>) => Promise<void>
  loadDashboard: (id: string) => Promise<void>
  
  // Panel Management
  addPanel: (panelData: Omit<PanelConfig, 'id'>) => Promise<string>
  updatePanel: (id: string, updates: Partial<PanelConfig>) => Promise<void>
  deletePanel: (id: string) => Promise<void>
  refreshPanelData: (panelId: string) => Promise<void>
  refreshAllPanels: () => Promise<void>
  
  // NEW: Time Filtering
  updateDashboardTimeRange: (timeRange: TimeRange) => Promise<void>
  updateDashboardTimeZone: (timeZone: string) => Promise<void>
}
```

**Key Features**:
- **Time Filter Inheritance**: Panels automatically inherit dashboard time range
- **Per-Panel Database**: Each panel can query different databases
- **Query Processing**: Handles `$__timeFilter` variable replacement
- **Isolated State**: Dashboard state is completely separate from main query interface

#### DashboardGrid
**File**: `src/components/dashboard/DashboardGrid.tsx`

Responsive grid layout using react-grid-layout for drag-and-drop panel management.

**Features**:
- Resizable and draggable panels
- Multi-breakpoint responsive design
- Edit mode with visual controls
- Panel selection and actions
- **NEW**: Initializes panels with empty database (user must select)

#### DashboardTimeFilter
**File**: `src/components/dashboard/DashboardTimeFilter.tsx`

**NEW COMPONENT**: Dashboard-level time filter UI that controls time range for all panels.

**Features**:
- Quick time range selection (Last 1h, 24h, 7d, etc.)
- Custom time range picker with from/to inputs
- Timezone selection
- Time filter enable/disable toggle
- Active time filter indicator badge
- Dashboard-wide time filtering

**Usage**: Integrated into dashboard header, controls time range for all panels in the dashboard.

#### DatabaseTableSelector
**File**: `src/components/dashboard/DatabaseTableSelector.tsx`

**NEW COMPONENT**: Per-panel database and table selection component.

**Features**:
- Database dropdown with available databases
- Table dropdown (loaded when database selected)
- Schema introspection and time column detection
- Automatic query generation with `$__timeFilter`
- Auto-detection of time columns based on name/type patterns
- Located in main panel editor area (not sidebar)

**Query Generation**:
```typescript
// Auto-generated query when table is selected
const basicQuery = `SELECT * FROM ${table} WHERE $__timeFilter ORDER BY ${timeColumn} DESC LIMIT 1000`;
```

#### Panel System
**File**: `src/components/dashboard/panels/`

Modular panel architecture supporting multiple visualization types with enhanced chart support.

**Supported Panel Types**:
- **TimeSeries**: All chart types (line, bar, area, scatter) with proper ECharts configuration
- **Stat**: Single value displays with trends and thresholds
- **Gauge**: Circular gauge visualizations
- **Table**: Sortable, searchable data tables

**NEW TimeSeriesPanel Features**:
- Unified component handles all chart types (line, bar, area, scatter)
- Proper xAxis and series type mapping for ECharts
- Support for time-based and categorical data
- Automatic chart type detection based on data

## Data Schema

### Dashboard Schema
```typescript
interface Dashboard {
  id: string
  name: string
  description?: string
  timeRange: TimeRange // NEW: Dashboard-level time filtering
  timeZone?: string    // NEW: Dashboard timezone
  refreshInterval: number // seconds
  layout: {
    panels: PanelLayout[]
    gridSettings: {
      columns: number
      rowHeight: number
      margin: [number, number]
    }
  }
  metadata: {
    createdAt: Date
    updatedAt: Date
    tags: string[]
  }
}

// NEW: Dashboard Time Range Types
type TimeRange = RelativeTimeRange | AbsoluteTimeRange

interface RelativeTimeRange {
  type: 'relative'
  from: string  // e.g., '1h', '24h', '7d'
  to: string    // usually 'now'
}

interface AbsoluteTimeRange {
  type: 'absolute'
  from: Date
  to: Date
}
```

### Panel Configuration Schema
```typescript
interface PanelConfig {
  id: string
  type: PanelType
  title: string
  query: string              // SQL with $__timeFilter variables
  database?: string          // NEW: Per-panel database selection
  dataMapping: DataMapping   // ENHANCED: Auto-detected column mappings
  visualization: VisualizationConfig
  timeOverride?: TimeRange   // Optional panel-specific time override
}

interface DataMapping {
  valueColumn: string        // Primary data column
  timeColumn?: string        // NEW: Auto-detected time column
  seriesColumn?: string      // For multi-series charts
  displayColumns?: string[]  // Columns to display in tables
  labelColumns?: string[]    // Grouping/categorization columns
  minColumn?: string         // For range charts
  maxColumn?: string         // For range charts
}

interface VisualizationConfig {
  // Chart Display Options
  showLegend?: boolean
  xAxisLabel?: string
  yAxisLabel?: string
  colors?: string[]
  
  // Value Formatting
  unit?: string
  decimals?: number
  min?: number
  max?: number
  
  // Thresholds and Alerts
  threshold?: {
    value: number
    operator: 'gt' | 'lt' | 'eq'
    color: string
  }
  
  // Table-specific Options
  pageSize?: number
  sortColumn?: string
  sortDirection?: 'asc' | 'desc'
  
  // NEW: Chart Type Configurations
  chartType?: 'line' | 'bar' | 'area' | 'scatter'
  smooth?: boolean           // For line charts
  stack?: boolean           // For area/bar charts
  fillOpacity?: number      // For area charts
}
```

### Data Processing Schema
```typescript
interface PanelData {
  panelId: string
  data: NDJSONRecord[]
  lastUpdated: Date
  error?: string
}

interface NDJSONRecord {
  [key: string]: any
}
```

## Storage System

### IndexedDB Implementation
**File**: `src/lib/dashboard/storage.ts`

**Database Structure**:
- **Database Name**: `GigapiDashboards`
- **Version**: 1
- **Object Stores**:
  - `dashboards`: Dashboard metadata and configuration
  - `panels`: Panel configurations with dashboard associations

**Key Operations**:
```typescript
class DashboardStorage {
  // Dashboard Operations
  saveDashboard(dashboard: Dashboard): Promise<void>
  getDashboard(id: string): Promise<Dashboard | null>
  getAllDashboards(): Promise<DashboardListItem[]>
  deleteDashboard(id: string): Promise<void>
  
  // Panel Operations
  savePanel(panel: PanelConfig & { dashboardId: string }): Promise<void>
  getPanelsForDashboard(dashboardId: string): Promise<PanelConfig[]>
  deletePanel(panelId: string): Promise<void>
  
  // Import/Export
  exportDashboard(id: string): Promise<DashboardExport>
  importDashboard(data: DashboardExport): Promise<Dashboard>
}
```

## Query System

### Dashboard Query Processing
**File**: `src/lib/dashboard/query-processing.ts`

**NEW**: Specialized query processing for dashboard panels with time filtering.

**Key Function**:
```typescript
export function processDashboardQueryWithTime(
  query: string,
  timeRange: TimeRange,
  timeZone: string = "UTC",
  timeColumn: string = "timestamp"
): string {
  // Converts dashboard time range to SQL WHERE clause
  // Handles both relative ("1h", "24h") and absolute time ranges
  // Replaces $__timeFilter with actual time conditions
  // Supports different time column names per panel
}
```

**Features**:
- **Time Variable Replacement**: Replaces `$__timeFilter` with actual time conditions
- **Dynamic Time Columns**: Uses panel-specific time column names
- **Timezone Support**: Applies dashboard timezone to time calculations
- **Relative Time Parsing**: Converts "1h", "24h", "7d" to actual dates
- **Epoch Time Handling**: Supports both timestamp and epoch time formats

### SQL Query Processing (Main Interface)
**File**: `src/components/query/QueryEditor.tsx`

**ISOLATED**: Main query interface is completely separate from dashboard system.

**Features**:
- Monaco Editor with SQL syntax highlighting
- Auto-completion with GigaAPI-specific macros
- Independent time filtering system
- Separate database/table selection
- No interference with dashboard queries

**Query Macros** (Main Interface Only):
- `$__timeFilter`: Time range filter for main query interface
- `$__timeField`: Selected time field name
- `$__timeFrom`: Start time value
- `$__timeTo`: End time value

### Dashboard vs Main Query Isolation

**Dashboard System**:
- Uses `DashboardContext` for state management
- Per-panel database selection
- Dashboard-wide time filtering
- `processDashboardQueryWithTime()` for query processing
- Isolated from main query interface

**Main Query Interface**:
- Uses `QueryContext`, `TimeContext`, `DatabaseContext`
- Global database/table selection
- Independent time filtering
- `processQueryWithTimeVariables()` for query processing
- Isolated from dashboard system

### Data Transformation
**File**: `src/lib/dashboard/data-transformers.ts`

**NDJSON Processing**:
```typescript
// Input: Raw NDJSON string from GigaAPI
// Output: Structured data for visualization

const processNDJSON = (rawJson: string): NDJSONRecord[] => {
  const records: NDJSONRecord[] = []
  const lines = rawJson.trim().split('\n')
  
  for (const line of lines) {
    if (line.trim()) {
      try {
        records.push(JSON.parse(line))
      } catch (error) {
        console.warn('Failed to parse NDJSON line:', line)
      }
    }
  }
  
  return records
}
```

## User Interface

### Dashboard View
**Route**: `/dashboard/:id`
**File**: `src/pages/DashboardView.tsx`

**Layout**:
- **Header**: Dashboard title, time range controls, edit mode toggle
- **Grid**: Resizable panel grid (full-width after removing sidebar)
- **Actions**: Add panel, save dashboard, refresh data

**User Actions**:
- **View Mode**: Read-only dashboard viewing
- **Edit Mode**: Drag/resize panels, add/delete panels
- **Double-click Panel**: Navigate to panel edit page

### Panel Edit Page
**Route**: `/dashboard/:dashboardId/panel/:panelId/edit`
**File**: `src/pages/PanelEdit.tsx`

**ENHANCED Layout**:
- **Top (60%)**: Live visualization preview
- **Main Editor Area**: DatabaseTableSelector + Monaco SQL query editor
- **Right Sidebar (25%)**: Configuration panel

**NEW Features**:
- **Database/Table Selection**: Per-panel database and table selection in main editor area
- **Auto-Query Generation**: Automatically generates time-filtered queries when table selected
- **Time Column Detection**: Auto-detects time columns and maps them to dataMapping
- **Schema Introspection**: Loads table schema and suggests column mappings
- **Real-time Preview**: Shows charts with actual data as configuration changes

**Configuration Sections**:
1. **Basic Settings**: Panel title and type selection
2. **Data Source**: Database and table selection (NEW)
3. **Data Mapping**: Auto-configured column mapping with intelligent suggestions
4. **Visualization Settings**: Chart-specific configuration options

**Auto-Configuration Flow**:
```
User Selects Table → Schema Loaded → Time Columns Detected → Query Generated → Data Mapping Auto-Configured → Chart Rendered
```

**Features**:
- Real-time preview of changes
- Auto-save functionality with per-panel database
- Query execution with immediate results
- Back navigation to dashboard
- **NEW**: Independent database selection per panel

## API Integration

### Dashboard Query Execution
**File**: `src/contexts/DashboardContext.tsx`

**NEW Query Execution Flow**:
1. Panel configuration contains SQL query with `$__timeFilter`
2. Dashboard context calls `refreshPanelData(panelId)`
3. Time range inherited from dashboard: `panel.timeOverride || currentDashboard?.timeRange`
4. Query processed with `processDashboardQueryWithTime()`
5. Query executed against **panel's specific database**
6. Response parsed as NDJSON format
7. Data transformed and stored in panel data
8. UI components re-render with new data

**Key Implementation**:
```typescript
// From DashboardContext.tsx
const refreshPanelData = async (panelId: string) => {
  const panel = panels.get(panelId);
  if (!panel || !panel.database) return;
  
  // Inherit dashboard time range
  const timeRange = panel.timeOverride || currentDashboard?.timeRange;
  const timeZone = currentDashboard?.timeZone || "UTC";
  const timeColumn = panel.dataMapping?.timeColumn || "timestamp";
  
  // Process query with dashboard time filtering
  const processedQuery = processDashboardQueryWithTime(
    panel.query, 
    timeRange, 
    timeZone, 
    timeColumn
  );
  
  // Execute against panel's database
  const response = await fetch(`${apiUrl}?db=${panel.database}&format=ndjson`, {
    method: 'POST',
    body: JSON.stringify({ query: processedQuery })
  });
  
  // Store results
  panelData.set(panelId, { data: processedData, lastUpdated: new Date() });
};
```

### Main Query Interface (Isolated)
**File**: `src/contexts/QueryContext.tsx`

**Completely Separate**: Main query interface uses its own context and state.

**Features**:
- Independent database selection
- Separate time filtering system
- No interference with dashboard queries
- Uses `processQueryWithTimeVariables()` for time variable replacement

**Error Handling**:
- Network errors are captured and displayed per panel
- SQL syntax errors shown in individual panels
- Malformed NDJSON lines are logged and skipped
- **NEW**: Per-panel database connection errors handled independently

## Chart System

### ECharts Integration
**File**: `src/lib/charts/echarts-configs.ts`

**ENHANCED Chart Configuration Generators**:
```typescript
// Time Series Configuration - Now handles all chart types
export const createTimeSeriesConfig = (
  data: NDJSONRecord[],
  config: PanelConfig
): EChartsOption => {
  // Unified configuration for line, bar, area, scatter charts
  // Proper xAxis and series type mapping
  // Time-based and categorical data support
  // Auto-detects chart type from visualization config
}

// Gauge Configuration
export const createGaugeConfig = (
  value: number,
  config: PanelConfig
): EChartsOption => {
  // Create circular gauge with thresholds and styling
}
```

**NEW TimeSeriesPanel Implementation**:
**File**: `src/components/dashboard/panels/TimeSeriesPanel.tsx`

**Features**:
- **Unified Chart Component**: Single component handles all chart types
- **Chart Types**: line, bar, area, scatter
- **Proper ECharts Mapping**: 
  - xAxis configuration for time-based and categorical data
  - series type mapping based on visualization.chartType
  - Proper data transformation for each chart type
- **Auto-Configuration**: Chart type auto-selected based on data and user preference

**Chart Type Support**:
```typescript
// Chart type mapping in TimeSeriesPanel
const getSeriesType = (chartType: string) => {
  switch (chartType) {
    case 'bar': return 'bar';
    case 'area': return 'line'; // with areaStyle
    case 'scatter': return 'scatter';
    case 'line':
    default: return 'line';
  }
};

// xAxis configuration
const xAxisConfig = {
  type: isTimeData ? 'time' : 'category',
  data: isTimeData ? undefined : categoryData,
  // ... other configurations
};
```

**Supported Chart Types**:
- **Line charts**: Time series and categorical data
- **Area charts**: Filled line charts with opacity control
- **Bar charts**: Vertical and horizontal bars
- **Scatter plots**: Point-based correlation analysis
- **Gauge charts**: Single value displays with ranges
- **Statistical displays**: Value cards with thresholds
- **Tables**: Sortable, searchable data grids

## Performance Optimizations

### Data Management
- **Lazy Loading**: Panels only load data when visible
- **Per-Panel Caching**: Query results cached per panel in memory
- **Debouncing**: Configuration changes debounced to prevent excessive re-renders
- **Virtual Scrolling**: Large datasets handled efficiently in tables
- **Database Independence**: Each panel queries its own database, reducing connection conflicts

### Memory Management
- **Map-based Storage**: Efficient panel data storage with Map objects
- **Cleanup**: Unused panel data automatically garbage collected
- **IndexedDB**: Large datasets persisted to disk, not memory
- **Context Isolation**: Dashboard and main query contexts are completely separate

### Query Optimization
- **Time Filter Optimization**: `$__timeFilter` automatically optimizes time range queries
- **Column Detection**: Auto-detects time columns to optimize query performance
- **Limit Clauses**: Auto-generated queries include LIMIT 1000 to prevent large result sets
- **Indexed Queries**: Encourages use of time-based indexes through auto-generated ORDER BY clauses

## Development Guidelines

### Adding New Panel Types

1. **Create Panel Component**:
```typescript
// src/components/dashboard/panels/MyNewPanel.tsx
export default function MyNewPanel({
  config,
  data,
  isEditMode,
  onConfigChange
}: PanelProps) {
  // Implementation
}
```

2. **Register Panel Type**:
```typescript
// src/components/dashboard/panels/index.ts
export const PANEL_TYPES = {
  mynew: {
    type: 'mynew',
    name: 'My New Panel',
    description: 'Description of the new panel',
    component: MyNewPanel
  }
}
```

## Recent Implementation Changes

### Dashboard Time Filtering System

#### 1. DashboardTimeFilter Component
**File**: `src/components/dashboard/DashboardTimeFilter.tsx`

**Purpose**: Provides dashboard-level time filtering UI that affects all panels.

**Key Features**:
- Quick time range buttons (1h, 24h, 7d, etc.)
- Custom date/time picker with from/to inputs
- Timezone selection dropdown
- Enable/disable time filtering toggle
- Integration with dashboard header

**Usage in Dashboard**:
```tsx
<DashboardTimeFilter
  timeRange={currentDashboard.timeRange}
  timeZone={currentDashboard.timeZone || "UTC"}
  onTimeRangeChange={updateDashboardTimeRange}
  onTimeZoneChange={updateDashboardTimeZone}
  disabled={isEditMode}
/>
```

#### 2. Dashboard Query Processing
**File**: `src/lib/dashboard/query-processing.ts`

**Function**: `processDashboardQueryWithTime()`

**Purpose**: Converts dashboard time ranges to SQL WHERE clauses for panel queries.

**Implementation**:
```typescript
export function processDashboardQueryWithTime(
  query: string,
  timeRange: TimeRange,
  timeZone: string = "UTC", 
  timeColumn: string = "timestamp"
): string {
  // Handle missing time range
  if (!timeRange) {
    return query.replace(/\$__timeFilter/g, '1=1');
  }
  
  // Convert relative time ranges ("1h", "24h") to dates
  const { fromDate, toDate } = convertTimeRangeToAbsolute(timeRange, timeZone);
  
  // Build SQL WHERE clause
  const timeFilter = `${timeColumn} >= '${fromDate.toISOString()}' AND ${timeColumn} < '${toDate.toISOString()}'`;
  
  // Replace $__timeFilter in query
  return query.replace(/\$__timeFilter/g, timeFilter);
}
```

#### 3. Panel Database Independence
**File**: `src/components/dashboard/DatabaseTableSelector.tsx`

**Purpose**: Each panel can select its own database and table, independent of others.

**Auto-Query Generation**:
```typescript
const handleTableChange = (table: string) => {
  // Load schema and detect time columns
  const timeColumns = detectTimeColumns(schema);
  const timeCol = timeColumns[0] || 'timestamp';
  
  // Generate query with time filter
  const query = `SELECT * FROM ${table} WHERE $__timeFilter ORDER BY ${timeCol} DESC LIMIT 1000`;
  
  // Update panel configuration
  onQueryUpdate(query);
  onSchemaLoad(columns, timeColumns);
};
```

**Time Column Detection**:
- Checks column names for: time, date, timestamp, created, updated
- Checks data types for: timestamp, datetime, date
- Auto-selects first detected time column
- Falls back to 'timestamp' if none found

#### 4. Context Isolation
**Implementation**: Complete separation between dashboard and main query interface.

**Dashboard System**:
- `DashboardContext` - Panel management and time filtering
- `processDashboardQueryWithTime()` - Query processing
- Per-panel database selection
- Dashboard-wide time filtering

**Main Query Interface**:
- `QueryContext` - Main query execution
- `TimeContext` - Time filtering for main queries  
- `DatabaseContext` - Database selection for main queries
- `processQueryWithTimeVariables()` - Query processing
- Independent time filtering and database selection

### Panel Configuration Enhancements

#### 1. Database Field Addition
**File**: `src/types/dashboard.types.ts`

```typescript
interface PanelConfig {
  // ... existing fields
  database?: string;  // NEW: Per-panel database selection
}
```

#### 2. Data Mapping Auto-Configuration
**File**: `src/pages/PanelEdit.tsx`

**Auto-Detection Features**:
- **Value Columns**: Detects numeric columns for chart values
- **Time Columns**: Auto-detects and maps time columns
- **Series Columns**: Suggests grouping columns for multi-series charts
- **Query Generation**: Auto-generates time-filtered queries

**Implementation**:
```typescript
const handleSelectionChange = (database: string, table: string | null) => {
  setLocalConfig(prev => ({ ...prev, database }));
  // Schema loading and auto-configuration happens in DatabaseTableSelector
};

const handleSchemaLoad = (columns: string[], timeColumns: string[]) => {
  // Auto-configure data mapping
  const valueColumn = detectValueColumn(columns);
  const timeColumn = timeColumns[0] || 'timestamp';
  
  setLocalConfig(prev => ({
    ...prev,
    dataMapping: {
      ...prev.dataMapping,
      valueColumn,
      timeColumn,
    }
  }));
};
```

### Chart System Improvements

#### 1. Unified TimeSeriesPanel
**File**: `src/components/dashboard/panels/TimeSeriesPanel.tsx`

**Enhancement**: Single component now handles all chart types (line, bar, area, scatter).

**Key Changes**:
- Chart type selection via `visualization.chartType`
- Proper ECharts series type mapping
- xAxis configuration for time vs categorical data  
- Support for all chart visualization options

#### 2. ECharts Configuration
**Proper Mapping**:
```typescript
// Series type mapping
const seriesType = {
  'line': 'line',
  'bar': 'bar', 
  'area': 'line', // with areaStyle
  'scatter': 'scatter'
}[chartType] || 'line';

// xAxis configuration
const xAxis = {
  type: isTimeData ? 'time' : 'category',
  data: isTimeData ? undefined : categories,
  // ... other config
};
```

### Outstanding Issues / Next Steps

#### 1. Dashboard Time Range Initialization
**Issue**: New dashboards may not have default time range set.
**Solution**: Ensure default time range in dashboard creation:
```typescript
const defaultTimeRange: TimeRange = {
  type: 'relative',
  from: '1h', 
  to: 'now'
};
```

#### 2. Time Range Format Compatibility
**Issue**: Dashboard uses different TimeRange format than main query interface.
**Current**: Dashboard uses `{type: 'relative', from: '1h', to: 'now'}`
**Main Query**: Uses `{from: 'now-1h', to: 'now', enabled: true}`
**Status**: `processDashboardQueryWithTime()` handles dashboard format correctly.

#### 3. Error Handling
**Status**: Need to verify proper error handling for:
- Invalid time ranges
- Missing databases in panel configuration
- Failed schema loading
- Query execution errors

#### 4. Testing Required
**Areas to Test**:
- Dashboard time filter inheritance by panels
- Per-panel database selection and query execution  
- Auto-generated queries with detected time columns
- Chart rendering with different chart types
- Time range picker functionality
- Context isolation (dashboard vs main query)