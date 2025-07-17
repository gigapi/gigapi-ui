/**
 * Conversation Analyzer
 * Extracts context and entities from conversation history
 */

import type { ChatMessage } from '@/types/chat.types';
import { SchemaContextBuilder } from './schema-context-builder';

export interface ConversationContext {
  activeDatabases: string[];
  activeTables: string[];
  mentionedColumns: string[];
  recentQueries: string[];
  discussionTopic?: string;
  lastQueryResult?: any;
}

export class ConversationAnalyzer {
  /**
   * Analyze recent messages to extract conversation context
   */
  static analyzeConversation(messages: ChatMessage[], lookback: number = 6): ConversationContext {
    const context: ConversationContext = {
      activeDatabases: [],
      activeTables: [],
      mentionedColumns: [],
      recentQueries: [],
    };

    // Get recent messages
    const recentMessages = messages.slice(-lookback);
    
    // Track unique entities
    const databases = new Set<string>();
    const tables = new Set<string>();
    const columns = new Set<string>();
    const queries: string[] = [];

    recentMessages.forEach(msg => {
      // Extract mentions
      if (msg.content.includes('@')) {
        const mentions = SchemaContextBuilder.extractMentions(msg.content);
        mentions.forEach(mention => {
          if (mention.type === 'database') {
            databases.add(mention.database);
          } else if (mention.type === 'table' && mention.table) {
            tables.add(mention.fullName);
            databases.add(mention.database);
          }
        });
      }

      // Extract queries from artifacts
      if (msg.metadata?.artifacts) {
        msg.metadata.artifacts.forEach(artifact => {
          if (artifact.data?.query) {
            queries.push(artifact.data.query);
            
            // Extract database from artifact
            if (artifact.data.database) {
              databases.add(artifact.data.database);
            }
            
            // Try to extract table names from query
            const tableMatches = artifact.data.query.match(/FROM\s+(\w+)\.?(\w+)?/gi);
            if (tableMatches) {
              tableMatches.forEach(match => {
                const parts = match.replace(/FROM\s+/i, '').split('.');
                if (parts.length === 2) {
                  databases.add(parts[0]);
                  tables.add(`${parts[0]}.${parts[1]}`);
                } else if (parts.length === 1 && databases.size > 0) {
                  // Assume first database if not specified
                  const db = Array.from(databases)[0];
                  tables.add(`${db}.${parts[0]}`);
                }
              });
            }
          }
        });
      }

      // Look for column references in content
      const columnPatterns = [
        /columns?\s+(?:like\s+)?(\w+)/gi,
        /SELECT\s+([\w,\s]+)\s+FROM/gi,
        /GROUP\s+BY\s+([\w,\s]+)/gi,
        /ORDER\s+BY\s+([\w,\s]+)/gi,
      ];

      columnPatterns.forEach(pattern => {
        const matches = msg.content.matchAll(pattern);
        for (const match of matches) {
          if (match[1]) {
            const cols = match[1].split(',').map(c => c.trim());
            cols.forEach(col => {
              if (col && !col.includes('*')) {
                columns.add(col);
              }
            });
          }
        }
      });
    });

    // Determine discussion topic
    const lastUserMessage = recentMessages.filter(m => m.role === 'user').pop();
    if (lastUserMessage) {
      if (lastUserMessage.content.toLowerCase().includes('chart')) {
        context.discussionTopic = 'visualization';
      } else if (lastUserMessage.content.toLowerCase().includes('error')) {
        context.discussionTopic = 'error_analysis';
      } else if (lastUserMessage.content.toLowerCase().includes('performance')) {
        context.discussionTopic = 'performance';
      } else if (tables.size > 0) {
        context.discussionTopic = 'table_exploration';
      }
    }

    // Set context values
    context.activeDatabases = Array.from(databases);
    context.activeTables = Array.from(tables);
    context.mentionedColumns = Array.from(columns);
    context.recentQueries = queries.slice(-3); // Keep last 3 queries

    return context;
  }

  /**
   * Build a context summary for AI consumption
   */
  static buildContextSummary(context: ConversationContext): string {
    const parts: string[] = [];

    if (context.activeTables.length > 0) {
      parts.push(`Active tables: ${context.activeTables.join(', ')}`);
    }

    if (context.activeDatabases.length > 0 && context.activeTables.length === 0) {
      parts.push(`Active databases: ${context.activeDatabases.join(', ')}`);
    }

    if (context.mentionedColumns.length > 0) {
      parts.push(`Discussed columns: ${context.mentionedColumns.join(', ')}`);
    }

    if (context.discussionTopic) {
      parts.push(`Current focus: ${context.discussionTopic}`);
    }

    return parts.join('\n');
  }

  /**
   * Resolve pronoun references based on context
   */
  static resolvePronoun(pronoun: string, context: ConversationContext): string | null {
    const lowerPronoun = pronoun.toLowerCase();

    // "that table" or "it" when discussing tables
    if ((lowerPronoun === 'that' || lowerPronoun === 'it') && context.activeTables.length === 1) {
      return context.activeTables[0];
    }

    // "this database" when discussing databases
    if (lowerPronoun === 'this' && context.activeDatabases.length === 1 && context.activeTables.length === 0) {
      return context.activeDatabases[0];
    }

    // "those metrics" or "them" when columns were mentioned
    if ((lowerPronoun === 'those' || lowerPronoun === 'them') && context.mentionedColumns.length > 0) {
      return context.mentionedColumns.join(', ');
    }

    return null;
  }
}