/**
 * AI Instructions Module
 * Modular AI instructions for clean and maintainable AI behavior
 */

export * from './core-instructions';
export * from './sql-instructions';
export * from './chart-instructions';
export * from './schema-instructions';
export * from './mention-instructions';
export * from './agentic-instructions';
export * from './instruction-builder';

// Re-export main builder functions for convenience
export {
  InstructionBuilder,
  buildCompleteInstructions,
  buildSQLInstructions,
  buildChartInstructions,
  buildSchemaInstructions,
  buildAgentic,
  buildWithTemplates
} from './instruction-builder';

// Re-export query templates
export * from '../query-templates';