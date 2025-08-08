/**
 * Artifact Template Library
 *
 * Pre-built, tested artifact templates for common use cases
 * These templates follow Claude-style best practices for artifact creation
 */

import type { Artifact } from "@/types/artifact.types";

export interface ArtifactTemplate {
  id: string;
  name: string;
  description: string;
  category: "monitoring" | "analytics" | "business" | "performance" | "errors";
  tags: string[];
  template: Partial<Artifact>;
  variables: Record<string, string>;
  examples: string[];
  author?: string;
  version: string;
}

export const ARTIFACT_TEMPLATES: ArtifactTemplate[] = [
  // ============================================================================
  // MONITORING TEMPLATES
  // ============================================================================
  {
    id: "response-time-monitor",
    name: "Response Time Monitor",
    description: "Track API response times with percentiles",
    category: "monitoring",
    tags: ["performance", "api", "sla"],
    template: {
      type: "chart",
      title: "API Response Time Percentiles",
      data: {
        type: "timeseries",
        query: `SELECT 
          $__timeField AS time,
          percentile_cont(0.50) WITHIN GROUP (ORDER BY {{metric_column}}) AS p50,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY {{metric_column}}) AS p95,
          percentile_cont(0.99) WITHIN GROUP (ORDER BY {{metric_column}}) AS p99
        FROM {{table_name}}
        WHERE $__timeFilter
          AND {{optional_filters}}
        GROUP BY time
        ORDER BY time`,
        database: "{{database}}",
        fieldMapping: {
          xField: "time",
          yField: ["p50", "p95", "p99"],
        },
      },
    },
    variables: {
      "{{database}}": "@monitoring",
      "{{table_name}}": "api_metrics",
      "{{metric_column}}": "response_time",
      "{{optional_filters}}": "endpoint = '/api/v1/query'",
    },
    examples: [
      "Monitor API endpoint performance",
      "Track database query response times",
      "Monitor web page load times",
    ],
    version: "1.0",
  },

  {
    id: "error-rate-dashboard",
    name: "Error Rate Dashboard",
    description: "Comprehensive error monitoring dashboard",
    category: "monitoring",
    tags: ["errors", "dashboard", "reliability"],
    template: {
      type: "dashboard" as const,
      title: "Error Monitoring Dashboard",
      data: {
        title: "Error Monitoring Dashboard",
        description: "Monitor and track system errors in real-time",
        panels: [
          {
            type: "stat",
            title: "Current Error Rate",
            database: "{{database}}",
            query: `SELECT 
              ROUND(
                SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 
                2
              ) AS value
            FROM {{table_name}}
            WHERE $__timeFilter`,
            position: { x: 0, y: 0, w: 3, h: 2 },
          },
          {
            type: "timeseries",
            title: "Error Rate Trend",
            database: "{{database}}",
            query: `SELECT 
              $__timeField AS time,
              SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS error_rate
            FROM {{table_name}}
            WHERE $__timeFilter
            GROUP BY time
            ORDER BY time`,
            position: { x: 3, y: 0, w: 9, h: 4 },
          },
          {
            type: "bar",
            title: "Top Error Codes",
            database: "{{database}}",
            query: `SELECT 
              status_code,
              COUNT(*) AS count
            FROM {{table_name}}
            WHERE $__timeFilter
              AND status_code >= 400
            GROUP BY status_code
            ORDER BY count DESC
            LIMIT 10`,
            position: { x: 0, y: 4, w: 6, h: 4 },
          },
        ],
      },
    },
    variables: {
      "{{table_name}}": "http_logs",
      "{{database}}": "@logs",
    },
    examples: [
      "Monitor web application errors",
      "Track API error rates",
      "Service reliability dashboard",
    ],
    version: "1.0",
  },

  // ============================================================================
  // ANALYTICS TEMPLATES
  // ============================================================================
  {
    id: "user-activity-funnel",
    name: "User Activity Funnel",
    description: "Conversion funnel analysis",
    category: "analytics",
    tags: ["conversion", "funnel", "users"],
    template: {
      type: "chart",
      title: "User Conversion Funnel",
      data: {
        type: "bar",
        query: `WITH funnel_data AS (
          SELECT 
            '1. {{step1_name}}' AS step,
            1 AS step_order,
            COUNT(DISTINCT user_id) AS users
          FROM {{table_name}}
          WHERE $__timeFilter
            AND event_type = '{{step1_event}}'
          
          UNION ALL
          
          SELECT 
            '2. {{step2_name}}' AS step,
            2 AS step_order,
            COUNT(DISTINCT user_id) AS users
          FROM {{table_name}}
          WHERE $__timeFilter
            AND event_type = '{{step2_event}}'
          
          UNION ALL
          
          SELECT 
            '3. {{step3_name}}' AS step,
            3 AS step_order,
            COUNT(DISTINCT user_id) AS users
          FROM {{table_name}}
          WHERE $__timeFilter
            AND event_type = '{{step3_event}}'
        )
        SELECT 
          step,
          users,
          ROUND(
            users * 100.0 / FIRST_VALUE(users) OVER (ORDER BY step_order), 
            2
          ) AS conversion_rate
        FROM funnel_data
        ORDER BY step_order`,
        database: "{{database}}",
        fieldMapping: {
          xField: "step",
          yField: "users",
        },
      },
    },
    variables: {
      "{{database}}": "@analytics",
      "{{table_name}}": "user_events",
      "{{step1_name}}": "Landing Page",
      "{{step1_event}}": "page_view",
      "{{step2_name}}": "Sign Up",
      "{{step2_event}}": "signup",
      "{{step3_name}}": "First Purchase",
      "{{step3_event}}": "purchase",
    },
    examples: [
      "E-commerce conversion tracking",
      "User onboarding flow analysis",
      "Feature adoption funnel",
    ],
    version: "1.0",
  },

  {
    id: "cohort-retention",
    name: "User Retention Cohort",
    description: "Track user retention over time by cohort",
    category: "analytics",
    tags: ["retention", "cohort", "users"],
    template: {
      type: "chart",
      title: "User Retention by Cohort",
      data: {
        type: "heatmap",
        query: `WITH user_cohorts AS (
          SELECT 
            user_id,

          FROM {{table_name}}
          WHERE $__timeFilter
            AND {{activity_filter}}
          GROUP BY user_id, activity_period
        )
        SELECT 
          cohort_period,
          EXTRACT({{period_unit}} FROM activity_period - cohort_period) AS periods_since_signup,
          COUNT(DISTINCT user_id) AS active_users
        FROM user_cohorts
        GROUP BY cohort_period, periods_since_signup
        ORDER BY cohort_period, periods_since_signup`,
        database: "{{database}}",
        fieldMapping: {
          xField: "periods_since_signup",
          yField: "cohort_period",
          valueField: "active_users",
        },
      },
    },
    variables: {
      "{{database}}": "@analytics",
      "{{table_name}}": "user_activity",
      "{{cohort_period}}": "week",
      "{{period_unit}}": "week",
      "{{activity_filter}}": "event_type = 'active_session'",
    },
    examples: [
      "Weekly user retention analysis",
      "Monthly subscriber retention",
      "Feature usage retention",
    ],
    version: "1.0",
  },

  // ============================================================================
  // BUSINESS TEMPLATES
  // ============================================================================
  {
    id: "revenue-kpis",
    name: "Revenue KPIs",
    description: "Key revenue metrics and trends",
    category: "business",
    tags: ["revenue", "kpis", "business"],
    template: {
      type: "dashboard" as const,
      title: "Revenue Dashboard",
      data: {
        title: "Revenue Dashboard",
        description: "Track revenue metrics and growth",
        panels: [
          {
            type: "stat",
            title: "Total Revenue ({{period}})",
            database: "{{database}}",
            query: `SELECT 
              SUM({{amount_column}}) AS value
            FROM {{table_name}}
            WHERE $__timeFilter`,
            position: { x: 0, y: 0, w: 3, h: 2 },
          },
          {
            type: "stat",
            title: "Revenue Growth",
            database: "{{database}}",
            query: `WITH current_period AS (
              SELECT SUM({{amount_column}}) AS current_revenue
              FROM {{table_name}}
              WHERE $__timeFilter
            ),
            previous_period AS (
              SELECT SUM({{amount_column}}) AS previous_revenue
              FROM {{table_name}}
              WHERE $__timeField >= $__timeFrom - ($__timeTo - $__timeFrom)
                AND $__timeField < $__timeFrom
            )
            SELECT 
              ROUND(
                (current_revenue - previous_revenue) * 100.0 / previous_revenue,
                2
              ) AS value
            FROM current_period, previous_period`,
            position: { x: 3, y: 0, w: 3, h: 2 },
          },
          {
            type: "timeseries",
            title: "Revenue Trend",
            database: "{{database}}",
            query: `SELECT 
              DATE_TRUNC('{{trend_period}}', $__timeField) AS time,
              SUM({{amount_column}}) AS revenue
            FROM {{table_name}}
            WHERE $__timeFilter
            GROUP BY time
            ORDER BY time`,
            position: { x: 0, y: 2, w: 12, h: 4 },
          },
        ],
      },
    },
    variables: {
      "{{database}}": "@finance",
      "{{table_name}}": "transactions",
      "{{amount_column}}": "amount",
      "{{period}}": "This Month",
      "{{trend_period}}": "day",
    },
    examples: [
      "Monthly revenue tracking",
      "Product sales analysis",
      "Subscription revenue dashboard",
    ],
    version: "1.0",
  },

  // ============================================================================
  // PERFORMANCE TEMPLATES
  // ============================================================================
  {
    id: "system-health",
    name: "System Health Monitor",
    description: "Comprehensive system performance monitoring",
    category: "performance",
    tags: ["system", "health", "infrastructure"],
    template: {
      type: "dashboard" as const,
      title: "System Health Dashboard",
      data: {
        title: "System Health Dashboard",
        description: "Monitor system performance and health metrics",
        panels: [
          {
            type: "stat",
            title: "CPU Usage %",
            database: "{{database}}",
            query: `SELECT 
              ROUND(AVG({{cpu_column}}), 1) AS value
            FROM {{table_name}}
            WHERE $__timeFilter`,
            position: { x: 0, y: 0, w: 2, h: 2 },
          },
          {
            type: "stat",
            title: "Memory Usage %",
            database: "{{database}}",
            query: `SELECT 
              ROUND(AVG({{memory_column}}), 1) AS value
            FROM {{table_name}}
            WHERE $__timeFilter
              AND $__timeField > NOW() - INTERVAL '{{current_window}}'`,
            position: { x: 2, y: 0, w: 2, h: 2 },
          },
          {
            type: "timeseries",
            title: "Resource Usage Over Time",
            database: "{{database}}",
            query: `SELECT 
              $__timeField AS time,
              AVG({{cpu_column}}) AS cpu_percent,
              AVG({{memory_column}}) AS memory_percent,
              AVG({{disk_column}}) AS disk_percent
            FROM {{table_name}}
            WHERE $__timeFilter
            GROUP BY time
            ORDER BY time`,
            position: { x: 0, y: 2, w: 12, h: 4 },
          },
        ],
      },
    },
    variables: {
      "{{database}}": "@monitoring",
      "{{table_name}}": "system_metrics",
      "{{cpu_column}}": "cpu_percent",
      "{{memory_column}}": "memory_percent",
      "{{disk_column}}": "disk_percent",
      "{{current_window}}": "1 minute",
    },
    examples: [
      "Server health monitoring",
      "Container resource tracking",
      "Infrastructure performance",
    ],
    version: "1.0",
  },
];

// ============================================================================
// Template Helper Functions
// ============================================================================

export function getTemplateById(id: string): ArtifactTemplate | undefined {
  return ARTIFACT_TEMPLATES.find((template) => template.id === id);
}

export function getTemplatesByCategory(
  category: ArtifactTemplate["category"]
): ArtifactTemplate[] {
  return ARTIFACT_TEMPLATES.filter(
    (template) => template.category === category
  );
}

export function getTemplatesByTag(tag: string): ArtifactTemplate[] {
  return ARTIFACT_TEMPLATES.filter((template) => template.tags.includes(tag));
}

export function searchTemplates(query: string): ArtifactTemplate[] {
  const lowercaseQuery = query.toLowerCase();
  return ARTIFACT_TEMPLATES.filter(
    (template) =>
      template.name.toLowerCase().includes(lowercaseQuery) ||
      template.description.toLowerCase().includes(lowercaseQuery) ||
      template.tags.some((tag) => tag.toLowerCase().includes(lowercaseQuery))
  );
}

export function instantiateTemplate(
  templateId: string,
  variables: Record<string, string>
): Artifact | null {
  const template = getTemplateById(templateId);
  if (!template) return null;

  // Clone the template
  let artifactData = JSON.stringify(template.template);

  // Replace all variables
  const allVariables = { ...template.variables, ...variables };
  for (const [key, value] of Object.entries(allVariables)) {
    artifactData = artifactData.replace(
      new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
      value
    );
  }

  // Parse back to object
  const instantiated = JSON.parse(artifactData);

  // Add metadata
  return {
    ...instantiated,
    id: `${templateId}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    metadata: {
      templateId,
      templateVersion: template.version,
      instantiatedAt: new Date().toISOString(),
      variables: allVariables,
    },
  } as Artifact;
}

// ============================================================================
// Template Validation
// ============================================================================

export function validateTemplate(template: ArtifactTemplate): string[] {
  const errors: string[] = [];

  if (!template.id) errors.push("Template ID is required");
  if (!template.name) errors.push("Template name is required");
  if (!template.description) errors.push("Template description is required");
  if (!template.template) errors.push("Template artifact is required");
  if (!template.variables) errors.push("Template variables are required");
  if (!template.version) errors.push("Template version is required");

  // Validate template variables are used in template
  const templateStr = JSON.stringify(template.template);
  for (const variable of Object.keys(template.variables)) {
    if (!templateStr.includes(variable)) {
      errors.push(`Variable ${variable} is defined but not used in template`);
    }
  }

  return errors;
}

export function getAllTemplateCategories(): ArtifactTemplate["category"][] {
  return Array.from(new Set(ARTIFACT_TEMPLATES.map((t) => t.category)));
}

export function getAllTemplateTags(): string[] {
  return Array.from(new Set(ARTIFACT_TEMPLATES.flatMap((t) => t.tags)));
}
