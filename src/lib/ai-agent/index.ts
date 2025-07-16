/**
 * AI Agent System - Step-by-Step SQL Execution
 * 
 * This system allows the AI to actually execute SQL queries step-by-step,
 * see results, and iterate based on real data.
 */

export interface AgentContext {
  apiUrl: string;
  selectedDatabase: string;
  timeRange?: {
    from: string;
    to: string;
  };
  maxRows?: number;
}

export interface AgentStep {
  id: string;
  type: 'query' | 'analyze' | 'visualize' | 'iterate';
  description: string;
  query?: string;
  results?: any[];
  analysis?: string;
  nextSteps?: string[];
  timestamp: string;
}

export interface AgentExecution {
  id: string;
  goal: string;
  steps: AgentStep[];
  currentStep: number;
  status: 'running' | 'completed' | 'failed';
  finalResult?: any;
  error?: string;
}

export class AIAgent {
  private context: AgentContext;
  private execution: AgentExecution;
  
  constructor(context: AgentContext, goal: string) {
    this.context = context;
    this.execution = {
      id: `agent_${Date.now()}`,
      goal,
      steps: [],
      currentStep: 0,
      status: 'running'
    };
  }

  /**
   * Execute SQL query and return results
   */
  async executeQuery(query: string): Promise<any[]> {
    const response = await fetch(
      `${this.context.apiUrl}?db=${encodeURIComponent(this.context.selectedDatabase)}&format=ndjson`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-ndjson' },
        body: JSON.stringify({ query })
      }
    );

    if (!response.ok) {
      throw new Error(`Query failed: ${await response.text()}`);
    }

    const data = await response.text();
    return this.parseNDJSON(data);
  }

  /**
   * Add a step to the execution
   */
  addStep(step: Omit<AgentStep, 'id' | 'timestamp'>): AgentStep {
    const newStep: AgentStep = {
      id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...step
    };
    
    this.execution.steps.push(newStep);
    return newStep;
  }

  /**
   * Execute a step-by-step analysis
   */
  async executeStepByStep(aiConnection: any, userQuery: string): Promise<AgentExecution> {
    try {
      // Step 1: Understand the request
      this.addStep({
        type: 'analyze',
        description: 'Understanding user request and planning approach',
        analysis: `User wants: ${userQuery}`
      });

      // Step 2: Explore schema
      const exploreStep = this.addStep({
        type: 'query',
        description: 'Exploring database schema',
        query: `SELECT table_name, column_name, data_type 
                FROM information_schema.columns 
                WHERE table_schema = '${this.context.selectedDatabase}' 
                LIMIT 50`
      });

      try {
        exploreStep.results = await this.executeQuery(exploreStep.query!);
      } catch (error) {
        // Fallback: Try to get tables
        exploreStep.query = `SHOW TABLES`;
        exploreStep.results = await this.executeQuery(exploreStep.query);
      }

      // Step 3: Ask AI to analyze schema and plan query
      const planningPrompt = this.buildPlanningPrompt(userQuery, exploreStep.results!);
      const planningResponse = await this.callAI(aiConnection, planningPrompt);
      
      this.addStep({
        type: 'analyze',
        description: 'AI analyzing schema and planning query',
        analysis: planningResponse
      });

      // Step 4: Extract and execute initial query
      const initialQuery = this.extractQueryFromResponse(planningResponse);
      if (initialQuery) {
        const queryStep = this.addStep({
          type: 'query',
          description: 'Executing initial data query',
          query: initialQuery
        });

        try {
          queryStep.results = await this.executeQuery(initialQuery);
          
          // Step 5: Let AI analyze results and decide next steps
          const analysisPrompt = this.buildAnalysisPrompt(userQuery, queryStep.results!);
          const analysisResponse = await this.callAI(aiConnection, analysisPrompt);
          
          const analysisStep = this.addStep({
            type: 'analyze',
            description: 'AI analyzing query results',
            analysis: analysisResponse,
            nextSteps: this.extractNextSteps(analysisResponse)
          });

          // Step 6: Execute refinement if needed
          if (analysisStep.nextSteps && analysisStep.nextSteps.length > 0) {
            const refinementQuery = this.extractQueryFromResponse(analysisResponse);
            if (refinementQuery && refinementQuery !== initialQuery) {
              const refinementStep = this.addStep({
                type: 'query',
                description: 'Refining query based on initial results',
                query: refinementQuery
              });

              refinementStep.results = await this.executeQuery(refinementQuery);
            }
          }

          // Step 7: Generate final visualization
          this.addStep({
            type: 'visualize',
            description: 'Creating final visualization',
            analysis: 'Generated chart artifact based on refined results'
          });

          this.execution.status = 'completed';
          this.execution.finalResult = this.execution.steps[this.execution.steps.length - 1].results;

        } catch (error) {
          queryStep.analysis = `Query failed: ${error}`;
          this.execution.status = 'failed';
          this.execution.error = error as string;
        }
      }

      return this.execution;

    } catch (error) {
      this.execution.status = 'failed';
      this.execution.error = error as string;
      return this.execution;
    }
  }

  private buildPlanningPrompt(userQuery: string, schemaResults: any[]): string {
    return `
You are analyzing a database to answer: "${userQuery}"

Available schema:
${JSON.stringify(schemaResults, null, 2)}

Please:
1. Analyze what tables and columns are relevant
2. Write a SQL query to get the initial data
3. Explain your approach

Format your response as:
ANALYSIS: [your analysis]
QUERY: [your sql query]
APPROACH: [your approach]
`;
  }

  private buildAnalysisPrompt(userQuery: string, results: any[]): string {
    return `
User asked: "${userQuery}"

Query results (first 10 rows):
${JSON.stringify(results.slice(0, 10), null, 2)}

Total rows: ${results.length}

Please:
1. Analyze if this data answers the user's question
2. Suggest improvements or refinements needed
3. Provide a refined query if necessary

Format your response as:
ANALYSIS: [your analysis]
REFINEMENT_NEEDED: [yes/no]
REFINED_QUERY: [refined query if needed]
NEXT_STEPS: [what to do next]
`;
  }

  private extractQueryFromResponse(response: string): string | null {
    const queryMatch = response.match(/QUERY:\s*```sql\s*(.*?)\s*```/s) || 
                       response.match(/REFINED_QUERY:\s*```sql\s*(.*?)\s*```/s) ||
                       response.match(/QUERY:\s*(.*?)(?=\n[A-Z]+:|$)/s);
    
    return queryMatch ? queryMatch[1].trim() : null;
  }

  private extractNextSteps(response: string): string[] {
    const nextStepsMatch = response.match(/NEXT_STEPS:\s*(.*?)(?=\n[A-Z]+:|$)/s);
    if (!nextStepsMatch) return [];
    
    return nextStepsMatch[1].split('\n').filter(step => step.trim());
  }

  private async callAI(_aiConnection: any, _prompt: string): Promise<string> {
    // This would call the AI connection similar to the existing sendToAI function
    // Simplified for now
    return "AI response would go here";
  }

  private parseNDJSON(data: string): any[] {
    const lines = data.trim().split('\n');
    const results: any[] = [];
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          results.push(JSON.parse(line));
        } catch (e) {
          console.error('Failed to parse NDJSON line:', line);
        }
      }
    }
    
    return results;
  }

  getExecution(): AgentExecution {
    return this.execution;
  }
}