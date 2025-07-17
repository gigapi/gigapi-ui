/**
 * AI instruction builder - combines modular instructions
 */

import {
  CORE_INSTRUCTIONS_DIRECT,
  CORE_INSTRUCTIONS_AGENTIC,
} from "./core-instructions";
import { SQL_INSTRUCTIONS } from "./sql-instructions";
import { CHART_INSTRUCTIONS } from "./chart-instructions";
import { SCHEMA_INSTRUCTIONS } from "./schema-instructions";
import { MENTION_INSTRUCTIONS } from "./mention-instructions";
import { AGENTIC_INSTRUCTIONS, AGENTIC_EXAMPLES } from "./agentic-instructions";
import {
  CONTEXT_PRESERVATION_INSTRUCTIONS,
  AGENTIC_CONTEXT_PRESERVATION,
} from "./context-preservation-instructions";
import { getTemplateSuggestions, type QueryTemplate } from "../query-templates";

export interface InstructionOptions {
  includeCore?: boolean;
  includeSQL?: boolean;
  includeChart?: boolean;
  includeSchema?: boolean;
  includeMentions?: boolean;
  includeAgentic?: boolean;
  includeTemplates?: boolean;
  userMessage?: string;
  customInstructions?: string[];
}

export interface AgenticOptions {
  userMessage: string;
  schemaContext?: any;
  recentQueries?: string[];
  sessionHistory?: any[];
}

export class InstructionBuilder {
  private instructions: string[] = [];
  private options: InstructionOptions;

  constructor(options: InstructionOptions = {}) {
    this.options = options;
    this.buildInstructions();
  }

  private buildInstructions(): void {
    const {
      includeCore = true,
      includeSQL = true,
      includeChart = true,
      includeSchema = true,
      includeMentions = true,
      includeAgentic = false,
      includeTemplates = false,
      userMessage,
      customInstructions = [],
    } = this.options;

    // Core instructions - use agentic or direct based on mode
    if (includeCore) {
      this.instructions.push(
        includeAgentic ? CORE_INSTRUCTIONS_AGENTIC : CORE_INSTRUCTIONS_DIRECT
      );
    }

    // SQL instructions for query generation
    if (includeSQL) {
      this.instructions.push(SQL_INSTRUCTIONS);
    }

    // Chart instructions for visualizations
    if (includeChart) {
      this.instructions.push(CHART_INSTRUCTIONS);
    }

    // Schema instructions for database awareness
    if (includeSchema) {
      this.instructions.push(SCHEMA_INSTRUCTIONS);
    }

    // Mention instructions for @ symbol processing
    if (includeMentions) {
      this.instructions.push(MENTION_INSTRUCTIONS);
    }

    // Agentic instructions for interactive exploration
    if (includeAgentic) {
      this.instructions.push(AGENTIC_INSTRUCTIONS);
      this.instructions.push(AGENTIC_EXAMPLES);

      // Add context preservation for agentic mode
      this.instructions.push(AGENTIC_CONTEXT_PRESERVATION);

      // Add template suggestions based on user message
      if (includeTemplates && userMessage) {
        const suggestions = getTemplateSuggestions(userMessage);
        if (suggestions.length > 0) {
          this.instructions.push(this.buildTemplateSuggestions(suggestions));
        }
      }
    }

    // Always include general context preservation
    this.instructions.push(CONTEXT_PRESERVATION_INSTRUCTIONS);

    // Custom instructions
    if (customInstructions.length > 0) {
      this.instructions.push(...customInstructions);
    }
  }

  public getInstructions(): string {
    return this.instructions.join("\n\n---\n\n");
  }

  public addCustomInstruction(instruction: string): InstructionBuilder {
    this.instructions.push(instruction);
    return this;
  }

  public static buildComplete(isAgentic: boolean = false): string {
    return new InstructionBuilder({
      includeAgentic: isAgentic,
    }).getInstructions();
  }

  public static buildAgentic(options?: AgenticOptions): string {
    return new InstructionBuilder({
      includeCore: true,
      includeSQL: true,
      includeChart: true,
      includeSchema: true,
      includeMentions: true,
      includeAgentic: true,
      includeTemplates: true,
      userMessage: options?.userMessage || "",
    }).getInstructions();
  }

  private buildTemplateSuggestions(templates: QueryTemplate[]): string {
    let instructions = `
# SUGGESTED QUERY TEMPLATES FOR THIS REQUEST

Based on your message, here are proven query patterns that work well:

`;

    templates.forEach((template, index) => {
      instructions += `## ${index + 1}. ${template.name} (${template.category})
`;
      instructions += `**Description**: ${template.description}\n`;
      instructions += `**Pattern**: \`${template.pattern}\`\n`;
      instructions += `**Chart Type**: ${template.suggestedChartType}\n`;
      instructions += `**Example**: \`${template.example}\`\n`;
      instructions += `**When to use**: ${template.tags.join(", ")}\n\n`;
    });

    instructions += `
## Template Usage in Proposals

When using these templates in your proposals:
1. Reference the template name in your title
2. Adapt the pattern to the user's specific data
3. Suggest the recommended chart type
4. Explain why this pattern works for their use case

**Example Proposal Using Template**:
\`\`\`proposal
{
  "type": "query_proposal",
  "title": "${templates[0]?.name || "Template Query"}",
  "template": "${templates[0]?.id || "template_id"}",
  "chart_type": "${templates[0]?.suggestedChartType || "table"}",
  "query": "[adapted template pattern]",
  "rationale": "Using the proven ${
    templates[0]?.name || "template"
  } pattern because..."
}
\`\`\`
`;

    return instructions;
  }

  public static buildForSQL(): string {
    return new InstructionBuilder({
      includeCore: true,
      includeSQL: true,
      includeChart: false,
      includeSchema: true,
      includeMentions: true,
    }).getInstructions();
  }

  public static buildForChart(): string {
    return new InstructionBuilder({
      includeCore: true,
      includeSQL: true,
      includeChart: true,
      includeSchema: true,
      includeMentions: true,
    }).getInstructions();
  }

  public static buildForSchema(): string {
    return new InstructionBuilder({
      includeCore: true,
      includeSQL: false,
      includeChart: false,
      includeSchema: true,
      includeMentions: true,
    }).getInstructions();
  }

  public static buildWithTemplates(userMessage: string): string {
    return new InstructionBuilder({
      includeCore: true,
      includeSQL: true,
      includeChart: true,
      includeSchema: true,
      includeMentions: true,
      includeAgentic: true,
      includeTemplates: true,
      userMessage,
    }).getInstructions();
  }
}

// Export convenience functions
export const buildCompleteInstructions = (isAgentic: boolean = false) =>
  InstructionBuilder.buildComplete(isAgentic);
