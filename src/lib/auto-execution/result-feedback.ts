/**
 * Result feedback manager for AI integration
 * Analyzes execution results and generates feedback for the AI
 */

import type { ExecutionResult, ResultFeedback } from "./types";
import type { ProposalArtifact } from "@/types/chat.types";

// Export types for convenience
export type { ExecutionResult, ResultFeedback } from "./types";

export class ResultFeedbackManager {
  /**
   * Generate comprehensive feedback from execution results
   */
  generateFeedback(
    artifactId: string,
    result: ExecutionResult,
    originalProposal: ProposalArtifact
  ): ResultFeedback {
    const summary = this.generateSummary(result, originalProposal);
    const insights = this.generateInsights(result);
    const recommendations = this.generateRecommendations(result);
    const followUpQuestions = this.generateFollowUpQuestions(result);

    return {
      artifact_id: artifactId,
      result,
      summary,
      insights,
      recommendations,
      follow_up_questions: followUpQuestions,
      confidence_score: this.calculateConfidenceScore(result),
      data_quality_score: this.calculateDataQualityScore(result),
    };
  }

  /**
   * Generate a human-readable summary of the execution results
   */
  private generateSummary(
    result: ExecutionResult,
    proposal: ProposalArtifact
  ): string {
    if (!result.success) {
      return `Query execution failed: ${result.error}. The query "${proposal.query}" could not be executed against database "${result.database}".`;
    }

    const rowCount = result.row_count || 0;
    const executionTime = result.execution_time;
    const columns = result.metadata?.columns || [];

    let summary = `Query executed successfully in ${executionTime}ms. `;

    if (rowCount === 0) {
      summary +=
        "No data was returned, which could indicate: (1) No matching records for the specified criteria, (2) The time range might be too narrow, or (3) The table might be empty.";
    } else if (rowCount === 1) {
      summary += `Returned 1 row with ${columns.length} column${
        columns.length !== 1 ? "s" : ""
      }`;
      if (columns.length > 0) {
        summary += `: ${columns.join(", ")}`;
      }
    } else {
      summary += `Returned ${rowCount} rows with ${columns.length} column${
        columns.length !== 1 ? "s" : ""
      }`;
      if (columns.length > 0) {
        summary += `: ${columns.join(", ")}`;
      }
    }

    return summary;
  }

  /**
   * Generate insights from the data
   */
  private generateInsights(result: ExecutionResult): string[] {
    const insights: string[] = [];

    if (!result.success) {
      // Error insights
      if (
        result.error?.includes("table") &&
        result.error?.includes("does not exist")
      ) {
        insights.push(
          "The specified table does not exist in the database. Check table name spelling or database selection."
        );
      }
      if (
        result.error?.includes("column") &&
        result.error?.includes("does not exist")
      ) {
        insights.push(
          "One or more columns in the query do not exist. Verify column names against the table schema."
        );
      }
      if (result.error?.includes("timeout")) {
        insights.push(
          "Query execution timed out. Consider adding more specific WHERE clauses or LIMIT statements."
        );
      }
      if (result.error?.includes("Parameter Not Allowed")) {
        insights.push(
          "Query contains unsupported parameters. Check for time variables that need proper configuration."
        );
      }
      return insights;
    }

    const rowCount = result.row_count || 0;
    const columns = result.metadata?.columns || [];
    const executionTime = result.execution_time;

    // Performance insights
    if (executionTime > 10000) {
      insights.push(
        `Query took ${executionTime}ms to execute, which is relatively slow. Consider optimizing with indexes or more specific filters.`
      );
    } else if (executionTime < 100) {
      insights.push(
        `Query executed very quickly (${executionTime}ms), indicating good performance.`
      );
    }

    // Data volume insights
    if (rowCount > 10000) {
      insights.push(
        `Large result set (${rowCount} rows) returned. Consider adding pagination or more specific filters for better performance.`
      );
    } else if (rowCount > 1000) {
      insights.push(
        `Moderate result set (${rowCount} rows) returned. Data is substantial enough for meaningful analysis.`
      );
    }

    // Data structure insights
    if (columns.length > 20) {
      insights.push(
        `Query returns many columns (${columns.length}). Consider selecting only the columns needed for analysis.`
      );
    }

    // Time-based insights
    if (
      columns.some(
        (col) =>
          col.toLowerCase().includes("time") ||
          col.toLowerCase().includes("date")
      )
    ) {
      insights.push(
        "Results include time-based columns, making this suitable for time series analysis and trend detection."
      );
    }

    // Aggregation insights
    if (
      columns.some(
        (col) =>
          col.toLowerCase().includes("avg") ||
          col.toLowerCase().includes("sum") ||
          col.toLowerCase().includes("count")
      )
    ) {
      insights.push(
        "Results include aggregated metrics, which are useful for summary statistics and KPI analysis."
      );
    }

    return insights;
  }

  /**
   * Generate recommendations for improvement
   */
  private generateRecommendations(result: ExecutionResult): string[] {
    const recommendations: string[] = [];

    if (!result.success) {
      // Error-specific recommendations
      if (
        result.error?.includes("table") &&
        result.error?.includes("does not exist")
      ) {
        recommendations.push(
          "Query a different table or check available tables in the database schema."
        );
        recommendations.push(
          "Verify that you're connected to the correct database."
        );
      }
      if (result.error?.includes("$__timeFilter")) {
        recommendations.push(
          "Configure a time range in the query interface to use time filtering."
        );
        recommendations.push(
          "Select a time field for the query to work properly."
        );
      }
      return recommendations;
    }

    const rowCount = result.row_count || 0;
    const query = result.query.toUpperCase();

    // Performance recommendations
    if (result.execution_time > 5000) {
      recommendations.push(
        "Add WHERE clauses to filter data and improve query performance."
      );
      recommendations.push(
        "Consider using LIMIT to restrict the number of returned rows."
      );
    }

    // Data quality recommendations
    if (rowCount === 0) {
      recommendations.push(
        "Expand the time range or modify filter criteria to capture more data."
      );
      recommendations.push(
        "Check if the table contains data for the specified time period."
      );
    }

    // Query structure recommendations
    if (!query.includes("WHERE") && !query.includes("LIMIT")) {
      recommendations.push(
        "Add WHERE conditions to filter results and improve performance."
      );
    }

    if (!query.includes("ORDER BY") && rowCount > 1) {
      recommendations.push(
        "Consider adding ORDER BY to sort results meaningfully."
      );
    }

    // Analysis recommendations
    if (rowCount > 100) {
      recommendations.push(
        "This dataset is suitable for creating visualizations and charts."
      );
      recommendations.push(
        "Consider grouping or aggregating data for trend analysis."
      );
    }

    return recommendations;
  }

  /**
   * Generate follow-up questions based on results
   */
  private generateFollowUpQuestions(result: ExecutionResult): string[] {
    const questions: string[] = [];

    if (!result.success) {
      questions.push(
        "Would you like me to suggest an alternative query approach?"
      );
      questions.push(
        "Should I help you identify the correct table or column names?"
      );
      return questions;
    }

    const rowCount = result.row_count || 0;
    const columns = result.metadata?.columns || [];

    if (rowCount === 0) {
      questions.push(
        "Would you like to try a different time range or filter criteria?"
      );
      questions.push("Should I check what data is available in this table?");
    } else if (rowCount > 0) {
      questions.push(
        "Would you like me to create a visualization of this data?"
      );
      questions.push("Should I analyze trends or patterns in the results?");

      if (
        columns.some(
          (col) =>
            col.toLowerCase().includes("time") ||
            col.toLowerCase().includes("date")
        )
      ) {
        questions.push(
          "Would you like to see this data as a time series chart?"
        );
      }

      if (columns.length > 5) {
        questions.push(
          "Should I focus on specific columns for deeper analysis?"
        );
      }

      if (rowCount > 100) {
        questions.push(
          "Would you like me to summarize key statistics from this data?"
        );
      }
    }

    return questions;
  }

  /**
   * Calculate confidence score for the results
   */
  private calculateConfidenceScore(result: ExecutionResult): number {
    if (!result.success) {
      return 0.1; // Low confidence for failed queries
    }

    let score = 0.5; // Base score

    // Execution time factor
    if (result.execution_time < 1000) {
      score += 0.2; // Fast execution boosts confidence
    } else if (result.execution_time > 10000) {
      score -= 0.1; // Slow execution reduces confidence
    }

    // Data volume factor
    const rowCount = result.row_count || 0;
    if (rowCount > 0 && rowCount < 100000) {
      score += 0.2; // Reasonable data volume
    } else if (rowCount === 0) {
      score -= 0.1; // No data reduces confidence
    }

    // Metadata completeness
    if (result.metadata?.columns && result.metadata.columns.length > 0) {
      score += 0.1; // Good metadata boosts confidence
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate data quality score
   */
  private calculateDataQualityScore(result: ExecutionResult): number {
    if (!result.success) {
      return 0;
    }

    let score = 0.5; // Base score

    const rowCount = result.row_count || 0;
    const columns = result.metadata?.columns || [];

    // Data presence
    if (rowCount > 0) {
      score += 0.3;
    }

    // Column diversity
    if (columns.length > 3) {
      score += 0.1;
    }

    // Time-based data (usually indicates good structure)
    if (
      columns.some(
        (col) =>
          col.toLowerCase().includes("time") ||
          col.toLowerCase().includes("date")
      )
    ) {
      score += 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Format feedback for AI consumption
   */
  formatFeedbackForAI(feedback: ResultFeedback): string {
    let aiMessage = `EXECUTION RESULT FEEDBACK:\n\n`;

    aiMessage += `SUMMARY: ${feedback.summary}\n\n`;

    if (feedback.insights.length > 0) {
      aiMessage += `INSIGHTS:\n${feedback.insights
        .map((insight) => `• ${insight}`)
        .join("\n")}\n\n`;
    }

    if (feedback.recommendations.length > 0) {
      aiMessage += `RECOMMENDATIONS:\n${feedback.recommendations
        .map((rec) => `• ${rec}`)
        .join("\n")}\n\n`;
    }

    if (feedback.follow_up_questions.length > 0) {
      aiMessage += `SUGGESTED FOLLOW-UP QUESTIONS:\n${feedback.follow_up_questions
        .map((q) => `• ${q}`)
        .join("\n")}\n\n`;
    }

    aiMessage += `CONFIDENCE SCORE: ${Math.round(
      feedback.confidence_score * 100
    )}%\n`;
    aiMessage += `DATA QUALITY SCORE: ${Math.round(
      feedback.data_quality_score * 100
    )}%\n`;

    return aiMessage;
  }
}
