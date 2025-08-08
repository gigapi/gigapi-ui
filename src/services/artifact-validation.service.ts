// ============================================================================
// Artifact Validation Service
// Advanced validation for artifact quality and security
// ============================================================================

import type {
  Artifact,
  ArtifactValidationResult,
  ChartArtifact,
  QueryArtifact,
  ProposalArtifact,
} from "@/types/artifact.types";

import {
  isQueryArtifact,
  isChartArtifact,
  isProposalArtifact,
  isDashboardArtifact,
  type DashboardArtifact,
} from "@/types/artifact.types";

export interface ValidationContext {
  availableDatabases: string[];
  schemaCache?: Record<string, any>;
  currentDatabase?: string;
  userPermissions?: string[];
}

export interface ExtendedValidationResult extends ArtifactValidationResult {
  score: number; // 0-100 quality score
  suggestions: string[];
  security: {
    safe: boolean;
    issues: string[];
  };
  performance: {
    optimized: boolean;
    warnings: string[];
  };
}

export class ArtifactValidationService {
  private static instance: ArtifactValidationService;
  private sqlKeywords: Set<string>;
  private dangerousPatterns: RegExp[];

  private constructor() {
    this.sqlKeywords = new Set<string>();
    this.dangerousPatterns = [];
    this.initializeSQLKeywords();
    this.initializeDangerousPatterns();
  }

  static getInstance(): ArtifactValidationService {
    if (!ArtifactValidationService.instance) {
      ArtifactValidationService.instance = new ArtifactValidationService();
    }
    return ArtifactValidationService.instance;
  }

  // ============================================================================
  // Main Validation Methods
  // ============================================================================

  async validateArtifact(
    artifact: Artifact,
    context?: ValidationContext
  ): Promise<ExtendedValidationResult> {
    const result: ExtendedValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      score: 100,
      suggestions: [],
      security: { safe: true, issues: [] },
      performance: { optimized: true, warnings: [] },
    };

    // Basic validation
    this.validateBasicStructure(artifact, result);

    // Type-specific validation
    if (isQueryArtifact(artifact)) {
      await this.validateQueryArtifact(artifact, result, context);
    } else if (isChartArtifact(artifact)) {
      await this.validateChartArtifact(artifact, result, context);
    } else if (isProposalArtifact(artifact)) {
      await this.validateProposalArtifact(artifact, result, context);
    } else if (isDashboardArtifact(artifact)) {
      await this.validateDashboardArtifact(artifact, result, context);
    }

    // Security validation
    this.validateSecurity(artifact, result);

    // Performance validation
    this.validatePerformance(artifact, result);

    // Quality scoring
    this.calculateQualityScore(result);

    // Generate suggestions
    this.generateSuggestions(artifact, result);

    // Overall validity
    result.valid = result.errors.length === 0;

    return result;
  }

  // ============================================================================
  // Basic Structure Validation
  // ============================================================================

  private validateBasicStructure(
    artifact: Artifact,
    result: ExtendedValidationResult
  ): void {
    // Required fields
    if (!artifact.id) {
      result.errors.push({ field: "id", message: "Artifact ID is required" });
    }

    if (!artifact.type) {
      result.errors.push({
        field: "type",
        message: "Artifact type is required",
      });
    }

    if (!artifact.timestamp) {
      result.warnings.push({
        field: "timestamp",
        message: "Artifact timestamp is missing",
        suggestion: "Add timestamp for tracking",
      });
    }

    // Title validation
    if (!artifact.title) {
      result.warnings.push({
        field: "title",
        message: "Title is missing",
        suggestion: "Add a descriptive title",
      });
    } else {
      if (artifact.title.length > 60) {
        result.warnings.push({
          field: "title",
          message: "Title is too long (max 60 characters)",
          suggestion: "Shorten the title",
        });
      }

      if (
        artifact.title.toLowerCase() === "untitled" ||
        artifact.title.match(/^(query|chart)\s*\d*$/i)
      ) {
        result.warnings.push({
          field: "title",
          message: "Title is not descriptive",
          suggestion:
            "Use a meaningful title that describes what the artifact does",
        });
      }
    }
  }

  // ============================================================================
  // Query Artifact Validation
  // ============================================================================

  private async validateQueryArtifact(
    artifact: QueryArtifact,
    result: ExtendedValidationResult,
    context?: ValidationContext
  ): Promise<void> {
    const { query, database } = artifact.data;

    // Query validation
    if (!query) {
      result.errors.push({ field: "query", message: "Query is required" });
      return;
    }

    if (!database) {
      result.errors.push({
        field: "database",
        message: "Database is required",
      });
      return;
    }

    // SQL syntax validation
    this.validateSQLSyntax(query, result);

    // Time macro validation
    this.validateTimeMacros(query, result);

    // Database reference validation
    if (context?.availableDatabases) {
      const dbName = database.replace("@", "");
      if (!context.availableDatabases.includes(dbName)) {
        result.warnings.push({
          field: "database",
          message: `Database '${dbName}' not found in available databases`,
          suggestion: `Use one of: ${context.availableDatabases.join(", ")}`,
        });
      }
    }

    // Query complexity check
    this.validateQueryComplexity(query, result);
  }

  // ============================================================================
  // Chart Artifact Validation
  // ============================================================================

  private async validateChartArtifact(
    artifact: ChartArtifact,
    result: ExtendedValidationResult,
    context?: ValidationContext
  ): Promise<void> {
    const data = artifact.data;

    // Basic chart validation
    if (!data.type && !data.chartType) {
      result.errors.push({
        field: "type",
        message: "Chart type is required",
      });
    }

    // Query validation (charts need queries too)
    if (data.query) {
      await this.validateQueryArtifact(
        {
          type: "query",
          data: { query: data.query, database: data.database },
        } as QueryArtifact,
        result,
        context
      );
    }

    // Field mapping validation
    if (!data.fieldMapping) {
      result.warnings.push({
        field: "fieldMapping",
        message: "Field mapping is missing",
        suggestion: "Add xField and yField for proper visualization",
      });
    } else {
      this.validateFieldMapping(data, result);
    }

    // Chart type specific validation
    this.validateChartTypeSpecific(data, result);
  }

  // ============================================================================
  // Proposal Artifact Validation
  // ============================================================================

  private async validateProposalArtifact(
    artifact: ProposalArtifact,
    result: ExtendedValidationResult,
    context?: ValidationContext
  ): Promise<void> {
    const data = artifact.data;

    // Required proposal fields
    if (!data.rationale) {
      result.warnings.push({
        field: "rationale",
        message: "Proposal rationale is missing",
        suggestion: "Explain why this query is useful",
      });
    }

    if (!data.description) {
      result.warnings.push({
        field: "description",
        message: "Proposal description is missing",
        suggestion: "Describe what this query will discover",
      });
    }

    // Validate underlying query
    if (data.query) {
      await this.validateQueryArtifact(
        {
          type: "query",
          data: { query: data.query, database: data.database },
        } as QueryArtifact,
        result,
        context
      );
    }

    // Next steps validation
    if (!data.next_steps || data.next_steps.length === 0) {
      result.suggestions.push(
        "Add next_steps to guide the user on what to do with results"
      );
    }
  }

  // ============================================================================
  // Dashboard Artifact Validation
  // ============================================================================

  private async validateDashboardArtifact(
    artifact: DashboardArtifact,
    result: ExtendedValidationResult,
    _context?: ValidationContext
  ): Promise<void> {
    const data = artifact.data;

    // Required dashboard fields
    if (!data.title) {
      result.errors.push({
        field: "title",
        message: "Dashboard title is required",
      });
    }

    // Validate panels
    if (!data.panels || data.panels.length === 0) {
      result.warnings.push({
        field: "panels",
        message: "Dashboard has no panels",
        suggestion: "Add at least one panel to the dashboard",
      });
    } else {
      // Validate each panel
      for (let i = 0; i < data.panels.length; i++) {
        const panel = data.panels[i];

        if (!panel.query) {
          result.errors.push({
            field: `panels[${i}].query`,
            message: `Panel ${i + 1} is missing a query`,
          });
        }

        if (!panel.database) {
          result.errors.push({
            field: `panels[${i}].database`,
            message: `Panel ${i + 1} is missing a database`,
          });
        }

        // Validate panel SQL
        if (panel.query) {
          this.validateSQLSyntax(panel.query, result);
        }
      }
    }

    // Validate time range
    if (data.timeRange) {
      if (!data.timeRange.from || !data.timeRange.to) {
        result.warnings.push({
          field: "timeRange",
          message: "Incomplete time range specification",
          suggestion: "Provide both from and to values",
        });
      }
    }
  }

  // ============================================================================
  // SQL Validation
  // ============================================================================

  private validateSQLSyntax(
    query: string,
    result: ExtendedValidationResult
  ): void {
    const normalizedQuery = query.toLowerCase().trim();

    // Check for basic SQL structure
    if (!normalizedQuery.includes("select")) {
      result.errors.push({
        field: "query",
        message: "Query must contain a SELECT statement",
      });
      return;
    }

    // Check for balanced parentheses
    const openParens = (query.match(/\(/g) || []).length;
    const closeParens = (query.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      result.errors.push({
        field: "query",
        message: "Unbalanced parentheses in query",
      });
    }

    // Check for proper FROM clause
    if (
      normalizedQuery.includes("select") &&
      !normalizedQuery.includes("from")
    ) {
      result.warnings.push({
        field: "query",
        message: "Query should typically include a FROM clause",
        suggestion: "Add FROM clause to specify data source",
      });
    }

    // Check for semicolon at end (not needed)
    if (query.trim().endsWith(";")) {
      result.warnings.push({
        field: "query",
        message: "Semicolon not needed at end of query",
        suggestion: "Remove trailing semicolon",
      });
    }
  }

  private validateTimeMacros(
    query: string,
    result: ExtendedValidationResult
  ): void {
    // Check for incorrect time macro usage
    const incorrectMacros = [
      /$__timeFilter\(/g,
      /$__timeField\(/g,
      /"\$__timeFilter"/g,
      /'\$__timeFilter'/g,
    ];

    for (const pattern of incorrectMacros) {
      if (pattern.test(query)) {
        result.errors.push({
          field: "query",
          message:
            "Incorrect time macro usage - use $__timeFilter as a macro, not a function",
        });
        break;
      }
    }

    // Check if time filter is used appropriately
    if (query.includes("$__timeFilter")) {
      if (!query.toLowerCase().includes("where")) {
        result.warnings.push({
          field: "query",
          message: "Time filter should be used in WHERE clause",
          suggestion: "Add WHERE clause with $__timeFilter",
        });
      }
    }
  }

  private validateQueryComplexity(
    query: string,
    result: ExtendedValidationResult
  ): void {
    const complexity = this.calculateQueryComplexity(query);

    if (complexity.joins > 5) {
      result.performance.warnings.push(
        "Query has many JOINs - consider optimization"
      );
    }

    if (complexity.subqueries > 3) {
      result.performance.warnings.push(
        "Query has many subqueries - may impact performance"
      );
    }

    if (complexity.windowFunctions > 10) {
      result.performance.warnings.push(
        "Query has many window functions - monitor performance"
      );
    }

    if (
      !query.toLowerCase().includes("limit") &&
      !query.toLowerCase().includes("top")
    ) {
      result.performance.warnings.push(
        "Consider adding LIMIT clause for large datasets"
      );
    }
  }

  // ============================================================================
  // Chart Validation
  // ============================================================================

  private validateFieldMapping(
    data: ChartArtifact["data"],
    result: ExtendedValidationResult
  ): void {
    const { fieldMapping, type } = data;

    if (!fieldMapping) return;

    const chartType = type || data.chartType;

    switch (chartType) {
      case "timeseries":
      case "line":
        if (!fieldMapping.xField) {
          result.warnings.push({
            field: "fieldMapping.xField",
            message: "Time series charts should have xField (time column)",
            suggestion: "Set xField to your time column",
          });
        }
        if (!fieldMapping.yField) {
          result.warnings.push({
            field: "fieldMapping.yField",
            message: "Charts should have yField (value column)",
            suggestion: "Set yField to your metric column",
          });
        }
        break;

      case "bar":
      case "pie":
        if (!fieldMapping.xField) {
          result.warnings.push({
            field: "fieldMapping.xField",
            message: "Bar/pie charts should have xField (category column)",
            suggestion: "Set xField to your category column",
          });
        }
        if (!fieldMapping.yField) {
          result.warnings.push({
            field: "fieldMapping.yField",
            message: "Bar/pie charts should have yField (value column)",
            suggestion: "Set yField to your metric column",
          });
        }
        break;
    }
  }

  private validateChartTypeSpecific(
    data: ChartArtifact["data"],
    result: ExtendedValidationResult
  ): void {
    const chartType = data.type || data.chartType;

    switch (chartType) {
      case "pie":
        if (data.query && !data.query.toLowerCase().includes("limit")) {
          result.suggestions.push(
            "Pie charts work best with limited categories (5-7) - consider adding LIMIT clause"
          );
        }
        break;

      case "heatmap":
        if (!data.fieldMapping?.valueField) {
          result.warnings.push({
            field: "fieldMapping.valueField",
            message: "Heatmaps need valueField for color intensity",
            suggestion: "Add valueField to fieldMapping",
          });
        }
        break;

      case "stat":
        if (data.query && data.query.toLowerCase().includes("group by")) {
          result.warnings.push({
            field: "query",
            message:
              "Stat charts typically show single values - GROUP BY may not be appropriate",
            suggestion:
              "Consider using aggregation without GROUP BY for single stat",
          });
        }
        break;
    }
  }

  // ============================================================================
  // Security Validation
  // ============================================================================

  private validateSecurity(
    artifact: Artifact,
    result: ExtendedValidationResult
  ): void {
    const content = JSON.stringify(artifact);

    // Check for dangerous patterns
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(content)) {
        result.security.safe = false;
        result.security.issues.push(
          "Potentially dangerous SQL pattern detected"
        );
        break;
      }
    }

    // Check for exposed credentials
    const credentialPatterns = [
      /password\s*[=:]\s*['"][^'"]*['"]/gi,
      /api[_-]?key\s*[=:]\s*['"][^'"]*['"]/gi,
      /secret\s*[=:]\s*['"][^'"]*['"]/gi,
      /token\s*[=:]\s*['"][^'"]*['"]/gi,
    ];

    for (const pattern of credentialPatterns) {
      if (pattern.test(content)) {
        result.security.safe = false;
        result.security.issues.push("Potential credential exposure detected");
        result.errors.push({
          field: "security",
          message: "Artifact may contain exposed credentials",
        });
      }
    }

    // Check for SQL injection risks
    if (content.includes("'; DROP") || content.includes('"; DROP')) {
      result.security.safe = false;
      result.security.issues.push("SQL injection pattern detected");
      result.errors.push({
        field: "security",
        message: "SQL injection risk detected",
      });
    }
  }

  // ============================================================================
  // Performance Validation
  // ============================================================================

  private validatePerformance(
    artifact: Artifact,
    result: ExtendedValidationResult
  ): void {
    const query = this.extractQuery(artifact);
    if (!query) return;

    const complexity = this.calculateQueryComplexity(query);

    if (complexity.total > 20) {
      result.performance.optimized = false;
      result.performance.warnings.push(
        "High query complexity - consider optimization"
      );
    }

    // Check for SELECT *
    if (query.includes("SELECT *") || query.includes("select *")) {
      result.performance.warnings.push(
        "SELECT * can impact performance - specify needed columns"
      );
    }

    // Check for ORDER BY without LIMIT
    if (
      query.toLowerCase().includes("order by") &&
      !query.toLowerCase().includes("limit")
    ) {
      result.performance.warnings.push(
        "ORDER BY without LIMIT can be expensive on large datasets"
      );
    }

    // Check for functions in WHERE clause
    if (/WHERE.*\w+\([^)]*\)/i.test(query)) {
      result.performance.warnings.push(
        "Functions in WHERE clause may prevent index usage"
      );
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private calculateQueryComplexity(query: string): {
    joins: number;
    subqueries: number;
    windowFunctions: number;
    total: number;
  } {
    const normalized = query.toLowerCase();

    const joins = (
      normalized.match(
        /\b(join|left join|right join|inner join|outer join)\b/g
      ) || []
    ).length;
    const subqueries = (normalized.match(/\(/g) || []).length;
    const windowFunctions = (normalized.match(/\bover\s*\(/g) || []).length;

    return {
      joins,
      subqueries,
      windowFunctions,
      total: joins * 2 + subqueries + windowFunctions * 1.5,
    };
  }

  private extractQuery(artifact: Artifact): string | null {
    if (
      isQueryArtifact(artifact) ||
      isChartArtifact(artifact) ||
      isProposalArtifact(artifact)
    ) {
      return artifact.data.query || null;
    }
    return null;
  }

  private calculateQualityScore(result: ExtendedValidationResult): void {
    let score = 100;

    // Deduct for errors
    score -= result.errors.length * 20;

    // Deduct for warnings
    score -= result.warnings.length * 5;

    // Deduct for security issues
    score -= result.security.issues.length * 25;

    // Deduct for performance warnings
    score -= result.performance.warnings.length * 3;

    // Ensure score is between 0 and 100
    result.score = Math.max(0, Math.min(100, score));
  }

  private generateSuggestions(
    artifact: Artifact,
    result: ExtendedValidationResult
  ): void {
    // Add suggestions based on artifact type and issues
    if (result.errors.length === 0 && result.warnings.length === 0) {
      result.suggestions.push(
        "Artifact looks good! Consider adding more descriptive comments."
      );
    }

    if (!artifact.description && !artifact.title?.includes("description")) {
      result.suggestions.push(
        "Add a description to explain what this artifact does"
      );
    }

    const query = this.extractQuery(artifact);
    if (query && query.length < 50) {
      result.suggestions.push(
        "This query is quite simple - ensure it provides enough value"
      );
    }

    if (result.performance.warnings.length > 0) {
      result.suggestions.push(
        "Consider optimizing query performance for better user experience"
      );
    }
  }

  private initializeSQLKeywords(): void {
    this.sqlKeywords = new Set([
      "SELECT",
      "FROM",
      "WHERE",
      "GROUP",
      "ORDER",
      "HAVING",
      "JOIN",
      "INNER",
      "LEFT",
      "RIGHT",
      "UNION",
      "INSERT",
      "UPDATE",
      "DELETE",
      "CREATE",
      "DROP",
      "ALTER",
      "INDEX",
      "TABLE",
    ]);
  }

  private initializeDangerousPatterns(): void {
    this.dangerousPatterns = [
      /;\s*DROP\s+TABLE/gi,
      /;\s*DELETE\s+FROM/gi,
      /;\s*UPDATE\s+.*SET/gi,
      /;\s*INSERT\s+INTO/gi,
      /;\s*CREATE\s+/gi,
      /;\s*ALTER\s+/gi,
      /EXEC\s*\(/gi,
      /EXECUTE\s*\(/gi,
      /xp_cmdshell/gi,
    ];
  }
}

// Export singleton instance getter
export const getArtifactValidator = () =>
  ArtifactValidationService.getInstance();
