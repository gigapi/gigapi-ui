/**
 * Schema Context Builder
 * 
 * Intelligent schema context management for AI chat
 * Ensures we only send relevant schema information based on mentions
 */

import { QuerySanitizer } from './query-sanitizer';

export interface SchemaItem {
  type: 'database' | 'table';
  database: string;
  table?: string;
  fullName: string;
}

export interface SchemaContextOptions {
  maxColumnsPerTable?: number;
  includeIndices?: boolean;
  includeConstraints?: boolean;
  summaryOnly?: boolean;
  includeRecentContext?: boolean;
  isAgentic?: boolean;
}

export class SchemaContextBuilder {
  /**
   * Extract all @mentions from text with improved parsing
   * Handles:
   * - @database
   * - @database.table
   * - Multiple mentions in one message
   * - Edge cases like @db1.table1, @db2, @table2
   */
  static extractMentions(text: string): SchemaItem[] {
    if (!text) return [];

    const mentions: SchemaItem[] = [];
    const seen = new Set<string>();

    // Match @database.table or @database patterns
    // Improved regex to handle underscores, hyphens, and numbers
    const mentionRegex = /@([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)?)/g;
    const matches = text.matchAll(mentionRegex);

    for (const match of matches) {
      const mention = match[1];
      
      if (mention.includes('.')) {
        // Database.table format
        const [dbName, tableName] = mention.split('.');
        const cleanDb = QuerySanitizer.cleanDatabaseName(dbName);
        const cleanTable = QuerySanitizer.cleanDatabaseName(tableName);
        const fullName = `${cleanDb}.${cleanTable}`;
        
        if (!seen.has(fullName)) {
          seen.add(fullName);
          mentions.push({
            type: 'table',
            database: cleanDb,
            table: cleanTable,
            fullName
          });
        }
      } else {
        // Just database name
        const cleanDb = QuerySanitizer.cleanDatabaseName(mention);
        
        if (!seen.has(cleanDb)) {
          seen.add(cleanDb);
          mentions.push({
            type: 'database',
            database: cleanDb,
            fullName: cleanDb
          });
        }
      }
    }

    return mentions;
  }

  /**
   * Build context for first message - include database list only
   */
  static buildFirstMessageContext(schemaCache: any): string {
    if (!schemaCache?.databases) return '';

    const contextParts: string[] = [];
    contextParts.push('📊 AVAILABLE DATABASES:');
    contextParts.push('');

    const databases = Object.entries(schemaCache.databases);
    databases.forEach(([dbName, dbData]: [string, any]) => {
      const tableCount = dbData.tables?.length || 0;
      const schemaCount = dbData.schemas ? Object.keys(dbData.schemas).length : 0;
      contextParts.push(`• ${dbName} (${tableCount} tables, ${schemaCount} with schemas)`);
    });

    contextParts.push('');
    contextParts.push('💡 TIPS:');
    contextParts.push('• Use @database to see all tables in a database');
    contextParts.push('• Use @database.table to see columns for a specific table');
    contextParts.push('• Example: @hepstats.heplify_rtpagent_mos');

    return contextParts.join('\n');
  }

  /**
   * Build context for mentioned items only
   */
  static buildMentionContext(
    mentions: SchemaItem[], 
    schemaCache: any,
    options: SchemaContextOptions = {}
  ): string {
    if (!mentions.length || !schemaCache?.databases) return '';

    const contextParts: string[] = [];
    const processedDatabases = new Set<string>();
    const processedTables = new Set<string>();

    // Process each mention
    mentions.forEach(mention => {
      if (mention.type === 'database' && !processedDatabases.has(mention.database)) {
        processedDatabases.add(mention.database);
        this.addDatabaseContext(mention.database, schemaCache, contextParts, options);
      } else if (mention.type === 'table' && !processedTables.has(mention.fullName)) {
        processedTables.add(mention.fullName);
        this.addTableContext(mention.database, mention.table!, schemaCache, contextParts, options);
      }
    });

    // If we found ambiguous table names, add hints
    const ambiguousTables = this.findAmbiguousTables(mentions, schemaCache);
    if (ambiguousTables.length > 0) {
      contextParts.push('');
      contextParts.push('⚠️ AMBIGUOUS TABLE REFERENCES:');
      ambiguousTables.forEach(info => {
        contextParts.push(`• Table "${info.tableName}" exists in: ${info.databases.join(', ')}`);
        contextParts.push(`  Use @${info.databases[0]}.${info.tableName} to be specific`);
      });
    }

    return contextParts.join('\n');
  }

  /**
   * Build summary context for messages without mentions
   */
  static buildSummaryContext(schemaCache: any): string {
    if (!schemaCache?.databases) return '';

    const contextParts: string[] = [];
    contextParts.push('📊 DATABASE SUMMARY:');
    contextParts.push('');

    Object.entries(schemaCache.databases).forEach(([dbName, dbData]: [string, any]) => {
      const tableCount = dbData.tables?.length || 0;
      const topTables = dbData.tables?.slice(0, 5).join(', ') || 'none';
      const more = tableCount > 5 ? ` (+${tableCount - 5} more)` : '';
      
      contextParts.push(`• ${dbName}: ${topTables}${more}`);
    });

    contextParts.push('');
    contextParts.push('💡 Use @mentions to get detailed schema information');

    return contextParts.join('\n');
  }

  /**
   * Add database context to the output
   */
  private static addDatabaseContext(
    dbName: string, 
    schemaCache: any, 
    contextParts: string[],
    options: SchemaContextOptions
  ) {
    const dbData = schemaCache.databases[dbName];
    if (!dbData) {
      contextParts.push(`❌ Database "${dbName}" not found`);
      return;
    }

    contextParts.push(`📁 DATABASE: ${dbName}`);
    contextParts.push(`Tables (${dbData.tables?.length || 0}):`);
    
    if (dbData.tables) {
      // Group tables by prefix if many
      if (dbData.tables.length > 20) {
        const grouped = this.groupTablesByPrefix(dbData.tables);
        Object.entries(grouped).forEach(([prefix, tables]) => {
          if (prefix === '_ungrouped') {
            tables.forEach(table => contextParts.push(`  • ${table}`));
          } else {
            contextParts.push(`  • ${prefix}* (${tables.length} tables): ${tables.slice(0, 3).join(', ')}...`);
          }
        });
      } else {
        dbData.tables.forEach(table => contextParts.push(`  • ${table}`));
      }
    }
    contextParts.push('');
  }

  /**
   * Add table context to the output
   */
  private static addTableContext(
    dbName: string,
    tableName: string,
    schemaCache: any,
    contextParts: string[],
    options: SchemaContextOptions
  ) {
    const dbData = schemaCache.databases[dbName];
    if (!dbData) {
      contextParts.push(`❌ Database "${dbName}" not found`);
      return;
    }

    const columns = dbData.schemas?.[tableName];
    if (!columns || columns.length === 0) {
      // Schema not in cache - it will be loaded lazily when needed
      contextParts.push(`⏳ Table "${dbName}.${tableName}" schema will be loaded when selected`);
      return;
    }

    contextParts.push(`📋 TABLE: ${dbName}.${tableName}`);
    contextParts.push('Columns:');

    // Limit columns if requested
    const maxCols = options.maxColumnsPerTable || Infinity;
    const displayColumns = columns.slice(0, maxCols);
    const hasMore = columns.length > maxCols;

    displayColumns.forEach((col: any) => {
      const parts: string[] = [`  • ${col.column_name}`];
      
      // Type info
      parts.push(`(${col.column_type})`);
      
      // Key info
      if (col.key === 'PRI') parts.push('[PRIMARY KEY]');
      else if (col.key === 'UNI') parts.push('[UNIQUE]');
      else if (col.key === 'MUL') parts.push('[INDEX]');
      
      // Null info
      if (col.null === 'NO') parts.push('NOT NULL');
      
      // Default value
      if (col.default && col.default !== 'NULL') {
        parts.push(`DEFAULT: ${col.default}`);
      }
      
      contextParts.push(parts.join(' '));
    });

    if (hasMore) {
      contextParts.push(`  ... and ${columns.length - maxCols} more columns`);
    }

    // Add useful metadata
    const timestampCols = columns.filter(c => 
      c.column_type.includes('__timestamp') || 
      c.column_type.includes('timestamp') || 
      c.column_type.includes('datetime') ||
      c.column_name.toLowerCase().includes('time') ||
      c.column_name.toLowerCase().includes('date') 
    );
    
    if (timestampCols.length > 0) {
      contextParts.push('');
      contextParts.push(`⏰ Time columns: ${timestampCols.map(c => c.column_name).join(', ')}`);
    }

    contextParts.push('');
  }

  /**
   * Find tables that exist in multiple databases
   */
  private static findAmbiguousTables(mentions: SchemaItem[], schemaCache: any): Array<{tableName: string, databases: string[]}> {
    const tableLocations = new Map<string, string[]>();

    // First, collect all table names across all databases
    Object.entries(schemaCache.databases).forEach(([dbName, dbData]: [string, any]) => {
      if (dbData.tables) {
        dbData.tables.forEach(tableName => {
          if (!tableLocations.has(tableName)) {
            tableLocations.set(tableName, []);
          }
          tableLocations.get(tableName)!.push(dbName);
        });
      }
    });

    // Find mentioned tables that are ambiguous
    const ambiguous: Array<{tableName: string, databases: string[]}> = [];
    
    mentions.forEach(mention => {
      if (mention.type === 'database') {
        // Check if any tables in this database exist elsewhere
        const dbData = schemaCache.databases[mention.database];
        if (dbData?.tables) {
          dbData.tables.forEach(tableName => {
            const locations = tableLocations.get(tableName) || [];
            if (locations.length > 1) {
              ambiguous.push({ tableName, databases: locations });
            }
          });
        }
      }
    });

    // Remove duplicates
    const seen = new Set<string>();
    return ambiguous.filter(item => {
      if (seen.has(item.tableName)) return false;
      seen.add(item.tableName);
      return true;
    });
  }

  /**
   * Group tables by common prefix
   */
  private static groupTablesByPrefix(tables: string[]): Record<string, string[]> {
    const groups: Record<string, string[]> = {};
    const minPrefixLength = 3;
    const minGroupSize = 3;

    // Find common prefixes
    const prefixCounts = new Map<string, number>();
    tables.forEach(table => {
      for (let i = minPrefixLength; i <= Math.min(table.length, 10); i++) {
        const prefix = table.substring(0, i);
        if (prefix.match(/^[a-zA-Z0-9_]+_?$/)) { // Valid prefix pattern
          prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1);
        }
      }
    });

    // Use prefixes that have enough tables
    const validPrefixes = Array.from(prefixCounts.entries())
      .filter(([_, count]) => count >= minGroupSize)
      .sort((a, b) => b[0].length - a[0].length); // Longer prefixes first

    const assigned = new Set<string>();
    
    validPrefixes.forEach(([prefix, _]) => {
      const prefixTables = tables.filter(t => t.startsWith(prefix) && !assigned.has(t));
      if (prefixTables.length >= minGroupSize) {
        groups[prefix] = prefixTables;
        prefixTables.forEach(t => assigned.add(t));
      }
    });

    // Add ungrouped tables
    const ungrouped = tables.filter(t => !assigned.has(t));
    if (ungrouped.length > 0) {
      groups['_ungrouped'] = ungrouped;
    }

    return groups;
  }

  /**
   * Build recent context from conversation history
   */
  static buildRecentContext(messages: Array<{role: string, content: string}>): string {
    // Look at last 3-5 messages to identify what's being discussed
    const recentMessages = messages.slice(-6); // Last 3 exchanges
    const mentionedEntities = new Set<string>();
    const recentlyDiscussed = new Set<string>();

    // Extract all mentions from recent messages
    recentMessages.forEach(msg => {
      if (msg.content.includes('@')) {
        const mentions = this.extractMentions(msg.content);
        mentions.forEach(m => {
          mentionedEntities.add(m.fullName);
          recentlyDiscussed.add(m.fullName);
        });
      }
    });

    // If no mentions found but we have conversation history, don't return empty
    // This ensures context persists even when user doesn't use @mentions
    if (recentlyDiscussed.size === 0) {
      // Look for any previously mentioned entities in the entire conversation
      messages.forEach(msg => {
        if (msg.content.includes('@')) {
          const mentions = this.extractMentions(msg.content);
          mentions.forEach(m => recentlyDiscussed.add(m.fullName));
        }
      });
    }

    // Build context string
    if (recentlyDiscussed.size === 0) {
      return '';
    }

    const contextParts: string[] = [];
    contextParts.push('🔍 RECENT CONVERSATION CONTEXT:');
    contextParts.push('');
    contextParts.push('Currently discussing:');
    
    // Show most recent mentions first
    const allMentions = Array.from(recentlyDiscussed);
    const recentMentions = Array.from(mentionedEntities);
    
    // Recent mentions (from last 6 messages)
    if (recentMentions.length > 0) {
      recentMentions.forEach(entity => {
        contextParts.push(`• ${entity} (active)`);
      });
    }
    
    // Older mentions (from earlier in conversation)
    allMentions.filter(e => !recentMentions.includes(e)).forEach(entity => {
      contextParts.push(`• ${entity} (mentioned earlier)`);
    });
    
    contextParts.push('');
    contextParts.push('💡 When user says "that", "it", "the schema", or "this table", they likely mean one of these entities.');
    contextParts.push('');

    return contextParts.join('\n');
  }

  /**
   * Check if message contains implicit schema references
   */
  static hasImplicitSchemaReference(content: string): boolean {
    const lowerContent = content.toLowerCase();
    const implicitPhrases = [
      'the schema',
      'that table',
      'this table',
      'its schema',
      'show schema',
      'want schema',
      'describe it',
      'more about it',
      'columns',
      'fields'
    ];
    
    return implicitPhrases.some(phrase => lowerContent.includes(phrase));
  }

  /**
   * Get complete schema context based on message context
   */
  static getSchemaContext(
    messages: Array<{role: string, content: string}>,
    schemaCache: any,
    options: SchemaContextOptions = {}
  ): string {
    if (!schemaCache?.databases) return '';

    const isFirstMessage = messages.filter(m => m.role === 'user').length === 1;
    const lastMessage = messages[messages.length - 1];
    const contextParts: string[] = [];

    // ALWAYS add recent context for continuity
    const recentContext = this.buildRecentContext(messages);
    if (recentContext) {
      contextParts.push(recentContext);
    }

    // Check for explicit mentions in current message
    if (lastMessage && lastMessage.content.includes('@')) {
      const mentions = this.extractMentions(lastMessage.content);
      if (mentions.length > 0) {
        // If it's the first message with mentions, include both database list AND mention context
        if (isFirstMessage) {
          contextParts.push(this.buildFirstMessageContext(schemaCache));
          contextParts.push(this.buildMentionContext(mentions, schemaCache, options));
        } else {
          // Otherwise just return mention context
          contextParts.push(this.buildMentionContext(mentions, schemaCache, options));
        }
        return contextParts.join('\n\n');
      }
    }

    // Check for implicit references (like "the schema", "that table")
    if (lastMessage && this.hasImplicitSchemaReference(lastMessage.content)) {
      // Find the most recently mentioned table from conversation history
      let recentTable: SchemaItem | null = null;
      
      // Search backwards through messages for the most recent @mention
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].content.includes('@')) {
          const mentions = this.extractMentions(messages[i].content);
          if (mentions.length > 0) {
            // Prefer table mentions over database mentions
            recentTable = mentions.find(m => m.type === 'table') || mentions[0];
            break;
          }
        }
      }
      
      // If we found a recent table, show its schema
      if (recentTable) {
        contextParts.push(`📌 CONTINUING DISCUSSION ABOUT: ${recentTable.fullName}`);
        contextParts.push('');
        contextParts.push(this.buildMentionContext([recentTable], schemaCache, options));
        return contextParts.join('\n\n');
      }
    }

    // No mentions found - use standard context
    if (isFirstMessage) {
      contextParts.push(this.buildFirstMessageContext(schemaCache));
    } else {
      contextParts.push(this.buildSummaryContext(schemaCache));
    }

    return contextParts.join('\n\n');
  }
}