// Enhanced artifact type definitions
export type ArtifactType = 'query' | 'chart' | 'table' | 'summary' | 'insight' | 'metric';

// Base artifact interface
export interface BaseArtifact {
  id: string;
  type: ArtifactType;
  title?: string;
  description?: string;
  timestamp: string;
  version?: number;
}

// Query artifact - raw SQL results
export interface QueryArtifact extends BaseArtifact {
  type: 'query';
  data: {
    query: string;
    database: string;
    limit?: number;
  };
}

// Chart artifact - visualization
export interface ChartArtifact extends BaseArtifact {
  type: 'chart';
  data: {
    query: string;
    database: string;
    chartType: 'timeseries' | 'bar' | 'pie' | 'line' | 'scatter' | 'heatmap' | 'stat';
    fieldMapping: {
      xField?: string;
      yField?: string | string[];
      groupBy?: string;
      aggregation?: 'sum' | 'avg' | 'max' | 'min' | 'count';
    };
    fieldConfig?: {
      defaults?: {
        unit?: string;
        decimals?: number;
        min?: number;
        max?: number;
      };
      overrides?: Array<{
        matcher: { id: string; options: any };
        properties: Array<{ id: string; value: any }>;
      }>;
    };
    options?: {
      legend?: {
        showLegend?: boolean;
        placement?: 'top' | 'bottom' | 'left' | 'right';
      };
      tooltip?: {
        mode?: 'single' | 'multi' | 'none';
      };
      [key: string]: any;
    };
  };
}

// Table artifact - formatted data table
export interface TableArtifact extends BaseArtifact {
  type: 'table';
  data: {
    query: string;
    database: string;
    columns?: Array<{
      field: string;
      title?: string;
      width?: number;
      align?: 'left' | 'center' | 'right';
      format?: 'number' | 'date' | 'boolean' | 'string';
      hidden?: boolean;
    }>;
    pagination?: {
      pageSize?: number;
      enabled?: boolean;
    };
    sorting?: {
      field?: string;
      order?: 'asc' | 'desc';
    };
  };
}

// Summary artifact - AI-generated summary
export interface SummaryArtifact extends BaseArtifact {
  type: 'summary';
  data: {
    query?: string;
    database?: string;
    summary: string;
    insights: string[];
    metadata?: {
      rowCount?: number;
      timeRange?: string;
      generatedAt?: string;
    };
  };
}

// Insight artifact - key metrics and insights
export interface InsightArtifact extends BaseArtifact {
  type: 'insight';
  data: {
    query?: string;
    database?: string;
    insights: Array<{
      title: string;
      value: string | number;
      change?: {
        value: number;
        type: 'increase' | 'decrease';
        period: string;
      };
      description?: string;
      severity?: 'info' | 'warning' | 'critical';
    }>;
  };
}

// Metric artifact - single metric display
export interface MetricArtifact extends BaseArtifact {
  type: 'metric';
  data: {
    query: string;
    database: string;
    value: number | string;
    title: string;
    unit?: string;
    format?: {
      decimals?: number;
      prefix?: string;
      suffix?: string;
    };
    thresholds?: {
      warning?: number;
      critical?: number;
    };
    sparkline?: {
      enabled: boolean;
      query?: string;
    };
  };
}

// Union type for all artifacts
export type EnhancedArtifact = 
  | QueryArtifact 
  | ChartArtifact 
  | TableArtifact 
  | SummaryArtifact 
  | InsightArtifact 
  | MetricArtifact;

// Helper type guards
export const isQueryArtifact = (artifact: EnhancedArtifact): artifact is QueryArtifact => 
  artifact.type === 'query';

export const isChartArtifact = (artifact: EnhancedArtifact): artifact is ChartArtifact => 
  artifact.type === 'chart';

export const isTableArtifact = (artifact: EnhancedArtifact): artifact is TableArtifact => 
  artifact.type === 'table';

export const isSummaryArtifact = (artifact: EnhancedArtifact): artifact is SummaryArtifact => 
  artifact.type === 'summary';

export const isInsightArtifact = (artifact: EnhancedArtifact): artifact is InsightArtifact => 
  artifact.type === 'insight';

export const isMetricArtifact = (artifact: EnhancedArtifact): artifact is MetricArtifact => 
  artifact.type === 'metric';

// Artifact renderer configuration
export interface ArtifactRendererConfig {
  artifactId: string;
  maxHeight?: number;
  interactive?: boolean;
  showDebug?: boolean;
  onSave?: (artifact: EnhancedArtifact) => void;
  onEdit?: (artifact: EnhancedArtifact) => void;
  onExport?: (format: 'png' | 'csv' | 'json') => void;
}