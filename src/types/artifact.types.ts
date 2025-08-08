// ============================================================================
// Unified Artifact Type System
// ============================================================================

// Core artifact types
export type ArtifactType = 'query' | 'chart' | 'table' | 'summary' | 'insight' | 'metric' | 'proposal' | 'dashboard';

// ============================================================================
// Base Interfaces
// ============================================================================

// Base artifact interface - all artifacts extend this
export interface BaseArtifact {
  id: string;
  type: ArtifactType;
  title?: string;
  description?: string;
  timestamp: string;
  version?: number;
  metadata?: ArtifactMetadata;
}

// Artifact metadata for tracking execution and validation
export interface ArtifactMetadata {
  // Execution tracking
  cachedData?: any[];
  executionTime?: number;
  executionError?: string | null;
  lastExecuted?: string;
  isNewlyCreated?: boolean;
  createdAt?: string;
  
  // Validation info
  validationErrors?: Array<{ message: string; field?: string }>;
  validationWarnings?: Array<{ message: string; suggestion?: string }>;
  
  // Proposal-specific
  proposalId?: string;
  executionResult?: any;
  feedback?: any;
}

// ============================================================================
// Query-based Artifacts
// ============================================================================

// Query artifact - raw SQL results
export interface QueryArtifact extends BaseArtifact {
  type: 'query';
  data: {
    query: string;
    database: string;
    timeField?: string;
    limit?: number;
  };
}

// Chart artifact - visualization
export interface ChartArtifact extends BaseArtifact {
  type: 'chart';
  data: {
    query: string;
    database: string;
    timeField?: string;
    // Support both 'type' and 'chartType' for compatibility
    type?: ChartType;
    chartType?: ChartType;
    fieldMapping: {
      xField?: string;
      yField?: string | string[];
      colorField?: string;
      seriesField?: string;
      valueField?: string; // For heatmaps and other visualizations
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
    timeField?: string;
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

// Metric artifact - single metric display
export interface MetricArtifact extends BaseArtifact {
  type: 'metric';
  data: {
    query: string;
    database: string;
    timeField?: string;
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

// ============================================================================
// Non-Query Artifacts
// ============================================================================

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

// ============================================================================
// Proposal Artifact (for agentic mode)
// ============================================================================

export type ProposalType = 'query_proposal' | 'chart_proposal';
export type ExecutionStatus = 'pending' | 'executing' | 'completed' | 'failed';

export interface ProposalArtifact extends BaseArtifact {
  type: 'proposal';
  data: {
    // Core proposal fields
    proposal_type: ProposalType;
    title: string;
    description: string;
    rationale: string;
    query: string;
    database: string;
    timeField?: string;
    
    // Chart-specific fields
    chart_type?: ChartType;
    x_axis?: string;
    y_axes?: string[];
    
    // Execution tracking
    approved?: boolean;
    auto_execute?: boolean;
    executed?: boolean;
    execution_status?: ExecutionStatus;
    execution_error?: string;
    execution_time?: number;
    execution_timestamp?: string;
    
    // Results
    results?: any[];
    result_summary?: string;
    
    // Next steps
    next_steps?: string[];
  };
}

// ============================================================================
// Dashboard Artifact (for complete dashboard configurations)
// ============================================================================

export interface DashboardArtifact extends BaseArtifact {
  type: 'dashboard';
  data: {
    title: string;
    description?: string;
    panels: Array<{
      type: string;
      title: string;
      query: string;
      database: string;
      timeField?: string;
      position?: { x: number; y: number; w: number; h: number };
      fieldMapping?: {
        xField?: string;
        yField?: string | string[];
        colorField?: string;
        seriesField?: string;
        valueField?: string;
      };
      options?: any;
    }>;
    timeRange?: {
      from: string;
      to: string;
    };
    refreshInterval?: string;
  };
}

// ============================================================================
// Type Unions
// ============================================================================

// Chart types supported
export type ChartType = 'timeseries' | 'bar' | 'pie' | 'line' | 'scatter' | 'heatmap' | 'stat' | 'gauge' | 'table';

// Union type for all artifacts
export type Artifact = 
  | QueryArtifact 
  | ChartArtifact 
  | TableArtifact 
  | SummaryArtifact 
  | InsightArtifact 
  | MetricArtifact
  | ProposalArtifact
  | DashboardArtifact;

// Legacy type alias for compatibility
export type EnhancedArtifact = Artifact;

// ChatArtifact type for chat system compatibility
export type ChatArtifact = Artifact;

// ============================================================================
// Type Guards
// ============================================================================

export const isQueryArtifact = (artifact: Artifact): artifact is QueryArtifact => 
  artifact.type === 'query';

export const isChartArtifact = (artifact: Artifact): artifact is ChartArtifact => 
  artifact.type === 'chart';

export const isTableArtifact = (artifact: Artifact): artifact is TableArtifact => 
  artifact.type === 'table';

export const isSummaryArtifact = (artifact: Artifact): artifact is SummaryArtifact => 
  artifact.type === 'summary';

export const isInsightArtifact = (artifact: Artifact): artifact is InsightArtifact => 
  artifact.type === 'insight';

export const isMetricArtifact = (artifact: Artifact): artifact is MetricArtifact => 
  artifact.type === 'metric';

export const isProposalArtifact = (artifact: Artifact): artifact is ProposalArtifact => 
  artifact.type === 'proposal';

export const isDashboardArtifact = (artifact: Artifact): artifact is DashboardArtifact => 
  artifact.type === 'dashboard';

// Helper to check if artifact has query
export const hasQuery = (artifact: Artifact): boolean => {
  return isQueryArtifact(artifact) || 
         isChartArtifact(artifact) || 
         isTableArtifact(artifact) || 
         isMetricArtifact(artifact) ||
         isProposalArtifact(artifact);
};

// Helper to get query from artifact
export const getArtifactQuery = (artifact: Artifact): string | undefined => {
  if (isQueryArtifact(artifact) || isChartArtifact(artifact) || 
      isTableArtifact(artifact) || isMetricArtifact(artifact) || 
      isProposalArtifact(artifact)) {
    return artifact.data.query;
  }
  if (isSummaryArtifact(artifact) || isInsightArtifact(artifact)) {
    return artifact.data.query;
  }
  return undefined;
};

// Helper to get database from artifact
export const getArtifactDatabase = (artifact: Artifact): string | undefined => {
  if (hasQuery(artifact)) {
    return artifact.data.database;
  }
  if (isSummaryArtifact(artifact) || isInsightArtifact(artifact)) {
    return artifact.data.database;
  }
  return undefined;
};

// ============================================================================
// Artifact Renderer Configuration
// ============================================================================

export interface ArtifactRendererConfig {
  artifactId: string;
  maxHeight?: number;
  interactive?: boolean;
  showDebug?: boolean;
  onSave?: (artifact: Artifact) => void;
  onEdit?: (artifact: Artifact) => void;
  onExport?: (format: 'png' | 'csv' | 'json') => void;
  onApprove?: (proposalId: string) => void;
  onReject?: (proposalId: string) => void;
}

// ============================================================================
// Artifact Validation
// ============================================================================

export interface ArtifactValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string; suggestion?: string }>;
}

export const validateArtifact = (artifact: Artifact): ArtifactValidationResult => {
  const errors: Array<{ field: string; message: string }> = [];
  const warnings: Array<{ field: string; message: string; suggestion?: string }> = [];

  // Basic validation
  if (!artifact.id) {
    errors.push({ field: 'id', message: 'Artifact ID is required' });
  }
  if (!artifact.type) {
    errors.push({ field: 'type', message: 'Artifact type is required' });
  }
  if (!artifact.timestamp) {
    warnings.push({ 
      field: 'timestamp', 
      message: 'Artifact timestamp is missing',
      suggestion: 'Set timestamp to current date/time'
    });
  }

  // Type-specific validation
  if (hasQuery(artifact)) {
    const data = artifact.data as any;
    if (!data.query) {
      errors.push({ field: 'query', message: 'Query is required for this artifact type' });
    }
    if (!data.database) {
      errors.push({ field: 'database', message: 'Database is required for this artifact type' });
    }
  }

  if (isChartArtifact(artifact)) {
    if (!artifact.data.fieldMapping) {
      warnings.push({ 
        field: 'fieldMapping', 
        message: 'Field mapping is missing',
        suggestion: 'Provide xField and yField mappings for better visualization'
      });
    }
  }

  if (isProposalArtifact(artifact)) {
    if (!artifact.data.rationale) {
      warnings.push({ 
        field: 'rationale', 
        message: 'Proposal rationale is missing',
        suggestion: 'Add explanation for why this query is suggested'
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
};