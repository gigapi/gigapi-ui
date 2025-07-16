/**
 * Artifact Enhancer
 * 
 * Main orchestrator for artifact enhancement pipeline.
 */

import type { ChatArtifact } from '@/types/chat.types';
import type { QueryContext, EnhancedArtifact, ValidationResult } from './types';
import { ArtifactValidator } from './validator';
import { TimeContextManager } from './time-context';
import { SchemaContextManager } from './schema-context';
import { ArtifactOptimizer } from './optimizer';

export class ArtifactEnhancer {
  /**
   * Enhance an artifact with full context and optimizations
   */
  static async enhance(
    artifact: ChatArtifact,
    context: QueryContext
  ): Promise<EnhancedArtifact> {
    const startTime = Date.now();
    
    // Keep original for comparison
    const original = JSON.parse(JSON.stringify(artifact));
    let enhanced = JSON.parse(JSON.stringify(artifact));
    
    const metadata = {
      schemaUsed: false,
      timeContextApplied: false,
      optimizationsApplied: [] as string[],
      processingTime: 0
    };
    
    // Step 1: Validate the artifact
    const validation = await ArtifactValidator.validate(artifact, context);
    
    // If critical errors, return early
    if (validation.errors.some(e => e.type === 'security' || e.type === 'syntax')) {
      return {
        original,
        enhanced,
        validation,
        metadata: {
          ...metadata,
          processingTime: Date.now() - startTime
        }
      };
    }
    
    // Step 2: Apply time context if available
    if (context.timeContext && this.shouldApplyTimeContext(artifact)) {
      enhanced = TimeContextManager.applyTimeContext(enhanced, context.timeContext);
      metadata.timeContextApplied = true;
      metadata.optimizationsApplied.push('time-context');
    }
    
    // Step 3: Apply schema enhancements if available
    if (context.schemaContext && this.shouldApplySchemaContext(artifact)) {
      const { artifact: schemaEnhanced, suggestions } = SchemaContextManager.enhanceWithSchema(
        enhanced,
        context.schemaContext
      );
      enhanced = schemaEnhanced;
      metadata.schemaUsed = true;
      metadata.optimizationsApplied.push('schema-enhancement');
      
      // Add schema suggestions to validation
      validation.suggestions.push(...suggestions);
    }
    
    // Step 4: Apply optimizations
    if (this.shouldOptimize(artifact, validation)) {
      enhanced = await ArtifactOptimizer.optimize(enhanced, context);
      metadata.optimizationsApplied.push('query-optimization');
    }
    
    // Step 5: Re-validate enhanced artifact
    const enhancedValidation = await ArtifactValidator.validate(enhanced, context);
    
    // Merge validations
    const finalValidation: ValidationResult = {
      isValid: enhancedValidation.isValid,
      errors: enhancedValidation.errors,
      warnings: [...validation.warnings, ...enhancedValidation.warnings],
      suggestions: [...validation.suggestions, ...enhancedValidation.suggestions]
    };
    
    metadata.processingTime = Date.now() - startTime;
    
    return {
      original,
      enhanced,
      validation: finalValidation,
      metadata
    };
  }
  
  /**
   * Check if time context should be applied
   */
  private static shouldApplyTimeContext(artifact: ChatArtifact): boolean {
    // Apply to query-based artifacts
    return ['query', 'chart', 'table', 'metric'].includes(artifact.type);
  }
  
  /**
   * Check if schema context should be applied
   */
  private static shouldApplySchemaContext(artifact: ChatArtifact): boolean {
    // Apply to query-based artifacts
    return ['query', 'chart', 'table', 'metric'].includes(artifact.type);
  }
  
  /**
   * Check if optimization should be applied
   */
  private static shouldOptimize(
    _artifact: ChatArtifact,
    validation: ValidationResult
  ): boolean {
    // Optimize if there are performance warnings
    return validation.warnings.some(w => w.type === 'performance');
  }
  
  /**
   * Get enhancement summary
   */
  static getEnhancementSummary(enhanced: EnhancedArtifact): string {
    const lines: string[] = [];
    
    if (enhanced.validation.isValid) {
      lines.push('✅ Artifact validated successfully');
    } else {
      lines.push(`❌ Validation failed with ${enhanced.validation.errors.length} errors`);
    }
    
    if (enhanced.metadata.timeContextApplied) {
      lines.push('🕒 Time context applied');
    }
    
    if (enhanced.metadata.schemaUsed) {
      lines.push('📊 Schema enhancements applied');
    }
    
    if (enhanced.metadata.optimizationsApplied.length > 0) {
      lines.push(`🚀 Optimizations: ${enhanced.metadata.optimizationsApplied.join(', ')}`);
    }
    
    if (enhanced.validation.warnings.length > 0) {
      lines.push(`⚠️ ${enhanced.validation.warnings.length} warnings`);
    }
    
    if (enhanced.validation.suggestions.length > 0) {
      lines.push(`💡 ${enhanced.validation.suggestions.length} suggestions`);
    }
    
    lines.push(`⏱️ Processed in ${enhanced.metadata.processingTime}ms`);
    
    return lines.join('\n');
  }
  
  /**
   * Create enhanced AI context for artifact generation
   */
  static createEnhancedAIContext(context: QueryContext): string {
    const lines: string[] = [];
    
    lines.push('📋 ENHANCED CONTEXT FOR ARTIFACT GENERATION:');
    lines.push('');
    
    // Add time context
    if (context.timeContext) {
      lines.push('⏰ TIME CONTEXT:');
      lines.push(`- Time Range: ${context.timeContext.timeRange.from} to ${context.timeContext.timeRange.to}`);
      lines.push(`- Time Zone: ${context.timeContext.timeZone}`);
      if (context.timeContext.interval) {
        lines.push(`- Suggested Interval: ${context.timeContext.interval}`);
      }
      lines.push('');
      lines.push('Available time variables:');
      const timeVars = TimeContextManager.getTimeVariables(context.timeContext);
      for (const tv of timeVars) {
        lines.push(`- ${tv.name}: ${tv.description}`);
      }
      lines.push('');
    }
    
    // Add focused schema context
    if (context.schemaContext && context.selectedDatabase) {
      lines.push('📊 SCHEMA CONTEXT:');
      if (context.selectedTable) {
        // Detailed schema for specific table
        const tableContext = SchemaContextManager.getSchemaContextForAI(
          context.selectedDatabase,
          [context.selectedTable],
          context.schemaContext
        );
        lines.push(tableContext);
      } else {
        // Database overview
        const dbSchema = context.schemaContext.databases[context.selectedDatabase];
        if (dbSchema) {
          lines.push(`Database: ${context.selectedDatabase}`);
          lines.push(`Tables (${dbSchema.tables.length}): ${dbSchema.tables.slice(0, 10).join(', ')}${dbSchema.tables.length > 10 ? '...' : ''}`);
        }
      }
      lines.push('');
    }
    
    // Add best practices
    lines.push('💡 BEST PRACTICES:');
    lines.push('- Always use $__timeFilter for time-based queries');
    lines.push('- Include LIMIT clause for large datasets');
    lines.push('- Use specific column names instead of SELECT *');
    lines.push('- Consider aggregation for time series data');
    lines.push('- Test queries with small time ranges first');
    
    return lines.join('\n');
  }
}