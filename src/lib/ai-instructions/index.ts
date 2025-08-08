/**
 * AI Instructions Module
 * Consolidated AI instructions for the GigAPI system
 */

// Export the main consolidated instructions
export { 
  GIGAPI_AI_INSTRUCTIONS,
  getGigAPIInstructions,
  buildCompleteInstructions 
} from './gigapi-ai-instructions';

// Re-export query templates for backward compatibility
export * from '../query-templates';

// Re-export artifact templates for backward compatibility
export * from '../artifact-templates';