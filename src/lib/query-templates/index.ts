/**
 * Query Template System
 * Provides pre-built query patterns for common use cases
 */

export interface QueryTemplate {
  id: string;
  name: string;
  description: string;
  category: 'metrics' | 'logs' | 'analytics' | 'monitoring' | 'exploration';
  pattern: string;
  requiredFields: string[];
  optionalFields: string[];
  example: string;
  tags: string[];
  useTimeFilter: boolean;
  suggestedChartType: 'timeseries' | 'bar' | 'pie' | 'gauge' | 'stat' | 'table';
}

export const QUERY_TEMPLATES: Record<string, QueryTemplate> = {
  // Exploration Templates
  explore_table: {
    id: 'explore_table',
    name: 'Explore Table',
    description: 'Get a sample of data from a table to understand its structure',
    category: 'exploration',
    pattern: 'SELECT * FROM {table} LIMIT {limit}',
    requiredFields: ['table'],
    optionalFields: ['limit'],
    example: 'SELECT * FROM users LIMIT 10',
    tags: ['sample', 'explore', 'structure'],
    useTimeFilter: false,
    suggestedChartType: 'table',
  },

  table_summary: {
    id: 'table_summary',
    name: 'Table Summary',
    description: 'Get basic statistics about a table',
    category: 'exploration',
    pattern: 'SELECT COUNT(*) as total_rows, COUNT(DISTINCT {id_field}) as unique_ids FROM {table}',
    requiredFields: ['table', 'id_field'],
    optionalFields: [],
    example: 'SELECT COUNT(*) as total_rows, COUNT(DISTINCT user_id) as unique_ids FROM events',
    tags: ['summary', 'count', 'statistics'],
    useTimeFilter: false,
    suggestedChartType: 'stat',
  },

  // Time Series Templates
  timeseries_basic: {
    id: 'timeseries_basic',
    name: 'Time Series Data',
    description: 'Query time-based data with proper time filtering',
    category: 'metrics',
    pattern: 'SELECT {time_field} as time, {metric_field} as value FROM {table} WHERE $__timeFilter ORDER BY time',
    requiredFields: ['table', 'time_field', 'metric_field'],
    optionalFields: [],
    example: 'SELECT timestamp as time, cpu_usage as value FROM metrics WHERE $__timeFilter ORDER BY time',
    tags: ['timeseries', 'metrics', 'time'],
    useTimeFilter: true,
    suggestedChartType: 'timeseries',
  },

  timeseries_aggregated: {
    id: 'timeseries_aggregated',
    name: 'Aggregated Time Series',
    description: 'Aggregate time-based data into intervals',
    category: 'metrics',
    pattern: 'SELECT DATE_TRUNC(\'{interval}\', {time_field}) as time, {aggregation}({metric_field}) as value FROM {table} WHERE $__timeFilter GROUP BY time ORDER BY time',
    requiredFields: ['table', 'time_field', 'metric_field', 'interval', 'aggregation'],
    optionalFields: [],
    example: 'SELECT DATE_TRUNC(\'minute\', timestamp) as time, AVG(response_time) as value FROM requests WHERE $__timeFilter GROUP BY time ORDER BY time',
    tags: ['timeseries', 'aggregation', 'intervals'],
    useTimeFilter: true,
    suggestedChartType: 'timeseries',
  },

  // Monitoring Templates
  error_rate: {
    id: 'error_rate',
    name: 'Error Rate',
    description: 'Calculate error rate percentage over time',
    category: 'monitoring',
    pattern: 'SELECT DATE_TRUNC(\'{interval}\', {time_field}) as time, COUNT(*) FILTER (WHERE {status_field} = \'{error_value}\') * 100.0 / COUNT(*) as error_rate FROM {table} WHERE $__timeFilter GROUP BY time ORDER BY time',
    requiredFields: ['table', 'time_field', 'status_field', 'error_value', 'interval'],
    optionalFields: [],
    example: 'SELECT DATE_TRUNC(\'minute\', timestamp) as time, COUNT(*) FILTER (WHERE status = \'error\') * 100.0 / COUNT(*) as error_rate FROM requests WHERE $__timeFilter GROUP BY time ORDER BY time',
    tags: ['monitoring', 'error', 'rate', 'percentage'],
    useTimeFilter: true,
    suggestedChartType: 'timeseries',
  },

  top_n_by_value: {
    id: 'top_n_by_value',
    name: 'Top N by Value',
    description: 'Find the top N items by a specific metric',
    category: 'analytics',
    pattern: 'SELECT {dimension} as category, {aggregation}({metric_field}) as value FROM {table} WHERE $__timeFilter GROUP BY {dimension} ORDER BY value DESC LIMIT {n}',
    requiredFields: ['table', 'dimension', 'metric_field', 'aggregation', 'n'],
    optionalFields: [],
    example: 'SELECT user_id as category, COUNT(*) as value FROM events WHERE $__timeFilter GROUP BY user_id ORDER BY value DESC LIMIT 10',
    tags: ['ranking', 'top', 'analytics'],
    useTimeFilter: true,
    suggestedChartType: 'bar',
  },

  // Log Analysis Templates
  log_levels: {
    id: 'log_levels',
    name: 'Log Level Distribution',
    description: 'Count logs by level (info, warn, error)',
    category: 'logs',
    pattern: 'SELECT {level_field} as level, COUNT(*) as count FROM {table} WHERE $__timeFilter GROUP BY {level_field} ORDER BY count DESC',
    requiredFields: ['table', 'level_field'],
    optionalFields: [],
    example: 'SELECT level, COUNT(*) as count FROM logs WHERE $__timeFilter GROUP BY level ORDER BY count DESC',
    tags: ['logs', 'level', 'distribution'],
    useTimeFilter: true,
    suggestedChartType: 'pie',
  },

  recent_errors: {
    id: 'recent_errors',
    name: 'Recent Errors',
    description: 'Get recent error logs with details',
    category: 'logs',
    pattern: 'SELECT {time_field} as time, {message_field} as message, {service_field} as service FROM {table} WHERE $__timeFilter AND {level_field} = \'error\' ORDER BY {time_field} DESC LIMIT {limit}',
    requiredFields: ['table', 'time_field', 'message_field', 'level_field'],
    optionalFields: ['service_field', 'limit'],
    example: 'SELECT timestamp as time, message, service FROM logs WHERE $__timeFilter AND level = \'error\' ORDER BY timestamp DESC LIMIT 50',
    tags: ['logs', 'errors', 'recent'],
    useTimeFilter: true,
    suggestedChartType: 'table',
  },

  // Business Analytics Templates
  daily_active_users: {
    id: 'daily_active_users',
    name: 'Daily Active Users',
    description: 'Count unique users per day',
    category: 'analytics',
    pattern: 'SELECT DATE_TRUNC(\'day\', {time_field}) as date, COUNT(DISTINCT {user_field}) as active_users FROM {table} WHERE $__timeFilter GROUP BY date ORDER BY date',
    requiredFields: ['table', 'time_field', 'user_field'],
    optionalFields: [],
    example: 'SELECT DATE_TRUNC(\'day\', timestamp) as date, COUNT(DISTINCT user_id) as active_users FROM events WHERE $__timeFilter GROUP BY date ORDER BY date',
    tags: ['analytics', 'users', 'daily', 'unique'],
    useTimeFilter: true,
    suggestedChartType: 'timeseries',
  },

  conversion_funnel: {
    id: 'conversion_funnel',
    name: 'Conversion Funnel',
    description: 'Track user progression through funnel steps',
    category: 'analytics',
    pattern: 'SELECT {step_field} as step, COUNT(DISTINCT {user_field}) as users FROM {table} WHERE $__timeFilter AND {step_field} IN ({steps}) GROUP BY {step_field} ORDER BY users DESC',
    requiredFields: ['table', 'step_field', 'user_field', 'steps'],
    optionalFields: [],
    example: 'SELECT step, COUNT(DISTINCT user_id) as users FROM funnel_events WHERE $__timeFilter AND step IN (\'signup\', \'onboarding\', \'first_purchase\') GROUP BY step ORDER BY users DESC',
    tags: ['analytics', 'funnel', 'conversion'],
    useTimeFilter: true,
    suggestedChartType: 'bar',
  },

  // Performance Templates
  response_times: {
    id: 'response_times',
    name: 'Response Time Percentiles',
    description: 'Calculate response time percentiles over time',
    category: 'monitoring',
    pattern: 'SELECT DATE_TRUNC(\'{interval}\', {time_field}) as time, percentile_cont(0.5) WITHIN GROUP (ORDER BY {duration_field}) as p50, percentile_cont(0.95) WITHIN GROUP (ORDER BY {duration_field}) as p95, percentile_cont(0.99) WITHIN GROUP (ORDER BY {duration_field}) as p99 FROM {table} WHERE $__timeFilter GROUP BY time ORDER BY time',
    requiredFields: ['table', 'time_field', 'duration_field', 'interval'],
    optionalFields: [],
    example: 'SELECT DATE_TRUNC(\'minute\', timestamp) as time, percentile_cont(0.5) WITHIN GROUP (ORDER BY response_time) as p50, percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time) as p95 FROM requests WHERE $__timeFilter GROUP BY time ORDER BY time',
    tags: ['performance', 'percentiles', 'response-time'],
    useTimeFilter: true,
    suggestedChartType: 'timeseries',
  },

  // Capacity Planning Templates
  resource_utilization: {
    id: 'resource_utilization',
    name: 'Resource Utilization',
    description: 'Monitor resource usage across different dimensions',
    category: 'monitoring',
    pattern: 'SELECT {dimension} as resource, AVG({metric_field}) as avg_utilization, MAX({metric_field}) as max_utilization FROM {table} WHERE $__timeFilter GROUP BY {dimension} ORDER BY avg_utilization DESC',
    requiredFields: ['table', 'dimension', 'metric_field'],
    optionalFields: [],
    example: 'SELECT host as resource, AVG(cpu_usage) as avg_utilization, MAX(cpu_usage) as max_utilization FROM metrics WHERE $__timeFilter GROUP BY host ORDER BY avg_utilization DESC',
    tags: ['monitoring', 'utilization', 'resources'],
    useTimeFilter: true,
    suggestedChartType: 'bar',
  },
};


/**
 * Get template suggestions based on user intent
 */
export function getTemplateSuggestions(userMessage: string): QueryTemplate[] {
  const message = userMessage.toLowerCase();
  const suggestions: QueryTemplate[] = [];
  
  // Intent detection patterns
  const intentPatterns = {
    explore: /\b(explore|sample|show|what|structure|columns)\b/,
    errors: /\b(error|errors|failed|failure|exception)\b/,
    performance: /\b(performance|slow|fast|response|latency|time)\b/,
    analytics: /\b(users|analytics|conversion|funnel|daily|active)\b/,
    monitoring: /\b(monitor|alert|utilization|capacity|resource)\b/,
    logs: /\b(log|logs|level|debug|info|warn)\b/,
    timeseries: /\b(over time|trend|series|timeline|chart)\b/,
    topN: /\b(top|best|worst|most|least|ranking)\b/,
    count: /\b(count|how many|total|sum)\b/,
    percentage: /\b(percentage|rate|ratio|percent)\b/,
  };
  
  // Map intents to templates
  const intentToTemplates = {
    explore: ['explore_table', 'table_summary'],
    errors: ['error_rate', 'recent_errors', 'log_levels'],
    performance: ['response_times', 'resource_utilization'],
    analytics: ['daily_active_users', 'conversion_funnel', 'top_n_by_value'],
    monitoring: ['error_rate', 'resource_utilization', 'response_times'],
    logs: ['log_levels', 'recent_errors'],
    timeseries: ['timeseries_basic', 'timeseries_aggregated'],
    topN: ['top_n_by_value'],
    count: ['table_summary', 'daily_active_users'],
    percentage: ['error_rate', 'conversion_funnel'],
  };
  
  // Check each intent pattern
  Object.entries(intentPatterns).forEach(([intent, pattern]) => {
    if (pattern.test(message)) {
      const templateIds = intentToTemplates[intent as keyof typeof intentToTemplates] || [];
      templateIds.forEach(id => {
        const template = QUERY_TEMPLATES[id];
        if (template && !suggestions.includes(template)) {
          suggestions.push(template);
        }
      });
    }
  });
  
  // If no specific intents matched, return exploration templates
  if (suggestions.length === 0) {
    suggestions.push(QUERY_TEMPLATES.explore_table, QUERY_TEMPLATES.table_summary);
  }
  
  return suggestions.slice(0, 3); // Return top 3 suggestions
}

