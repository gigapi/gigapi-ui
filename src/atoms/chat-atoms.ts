import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import axios from "axios";
import { getArtifactValidator } from "@/services/artifact-validation.service";
import { getGigAPIInstructions } from "@/lib/ai-instructions/gigapi-ai-instructions";
import { QuerySanitizer } from "@/lib/query-sanitizer";
import { safeJsonParse, validateArtifactStructure, normalizeArtifact } from "@/lib/utils/json-sanitizer";
// Removed old imports - using new services now
import { StorageUtils } from "@/lib/storage-utils";

// ============================================================================
// Helper Types (Simplified replacements for old types)
// ============================================================================

interface QueryContext {
  database?: string;
  schemaCache?: any;
  recentQueries?: string[];
  selectedDatabase?: string;
  selectedTable?: string;
  globalInstructions?: string[];
  schemaContext?: SchemaContext | null;
  timeContext?: any;
}

interface SchemaContext {
  databases: Record<string, any>;
  activeTables: string[];
}

// ============================================================================
// Helper Functions for Schema Context Building
// ============================================================================

interface MentionInfo {
  type: 'database' | 'table';
  fullName: string;
  database: string | null;
  table: string | null;
}

function extractMentions(content: string): MentionInfo[] {
  const mentionPattern = /@([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g;
  const mentions: MentionInfo[] = [];
  let match;
  
  while ((match = mentionPattern.exec(content)) !== null) {
    const fullName = match[1];
    const parts = fullName.split('.');
    
    if (parts.length === 2) {
      // @database.table format
      mentions.push({
        type: 'table',
        fullName,
        database: parts[0],
        table: parts[1]
      });
    } else if (parts.length === 1) {
      // @database or @table format - need to determine which
      mentions.push({
        type: 'database', // Default to database, will be resolved later
        fullName,
        database: parts[0],
        table: null
      });
    }
  }
  
  return mentions;
}

function buildConversationContext(messages: ChatMessage[]): string {
  const recentMessages = messages.slice(-5); // Last 5 messages for better context
  const context: string[] = [];
  
  // Find recent tables and databases discussed
  const recentTables = new Set<string>();
  const recentDatabases = new Set<string>();
  
  for (const msg of recentMessages) {
    if (msg.role === 'user') {
      const mentions = extractMentions(msg.content);
      mentions.forEach(m => {
        if (m.database) recentDatabases.add(m.database);
        if (m.table) recentTables.add(m.table);
      });
    }
    
    // Check for artifacts with database/table info
    if (msg.metadata?.artifacts) {
      for (const artifact of msg.metadata.artifacts) {
        if (artifact.data?.database) {
          recentDatabases.add(artifact.data.database.replace('@', ''));
        }
      }
    }
  }
  
  if (recentDatabases.size > 0) {
    context.push(`Recent databases: ${Array.from(recentDatabases).join(', ')}`);
  }
  
  if (recentTables.size > 0) {
    context.push(`Recent tables: ${Array.from(recentTables).join(', ')}`);
  }
  
  context.push(`Conversation length: ${messages.length} messages`);
  
  return context.join('\n');
}

async function buildSchemaContext(
  schemaCache: any, 
  mentions: MentionInfo[],
  loadSampleData?: (database: string, table: string) => Promise<any>
): Promise<string> {
  if (!schemaCache || mentions.length === 0) return "";
  
  const contextParts: string[] = [];
  const processedTables = new Set<string>();
  
  for (const mention of mentions) {
    if (mention.type === 'table' && mention.database && mention.table) {
      const key = `${mention.database}.${mention.table}`;
      if (processedTables.has(key)) continue;
      processedTables.add(key);
      
      // Get schema for the table
      const schema = schemaCache.databases?.[mention.database]?.schemas?.[mention.table];
      if (schema) {
        contextParts.push(`\n### Table: ${mention.database}.${mention.table}`);
        contextParts.push('Columns:');
        
        for (const col of schema) {
          const colName = col.column_name || col.name;
          const colType = col.column_type || col.type || 'unknown';
          const timeUnit = col.timeUnit ? ` (${col.timeUnit})` : '';
          const nullable = col.null === 'YES' ? ' (nullable)' : '';
          const key = col.key ? ` [${col.key}]` : '';
          
          contextParts.push(`  - ${colName}: ${colType}${timeUnit}${nullable}${key}`);
        }
        
        // Try to get sample data if available
        if (loadSampleData) {
          try {
            const sampleData = await loadSampleData(mention.database, mention.table);
            if (sampleData && sampleData.data && sampleData.data.length > 0) {
              contextParts.push('\nSample data (first 3 rows):');
              contextParts.push('```json');
              contextParts.push(JSON.stringify(sampleData.data.slice(0, 3), null, 2));
              contextParts.push('```');
            }
          } catch (error) {
            console.log(`Could not load sample data for ${key}:`, error);
          }
        }
      }
    } else if (mention.type === 'database' && mention.database) {
      // Just list tables in the database
      const tables = schemaCache.databases?.[mention.database]?.tables;
      if (tables && tables.length > 0) {
        contextParts.push(`\n### Database: ${mention.database}`);
        contextParts.push(`Tables (${tables.length}): ${tables.slice(0, 10).join(', ')}${tables.length > 10 ? '...' : ''}`);
      }
    }
  }
  
  return contextParts.join('\n');
}

// Backward compatibility alias - returns MentionInfo[] not string[]
function extractBasicMentions(content: string): MentionInfo[] {
  return extractMentions(content);
}
import { schemaCacheAtom, loadAndCacheTableSchemaAtom } from "./database-atoms";
import { getCurrentTabData } from "./tab-atoms";
import { apiUrlAtom } from "./connection-atoms";
import type {
  ChatSession,
  AIConnection,
  ChatMessage,
  CreateSessionOptions,
  SendMessageOptions,
} from "@/types/chat.types";

// ============================================================================
// Storage Keys
// ============================================================================

const STORAGE_KEYS = {
  SESSIONS: "gigapi_chat_sessions",
  CONNECTIONS: "gigapi_ai_connections",
  ACTIVE_SESSION: "gigapi_active_chat_session",
  GLOBAL_INSTRUCTIONS: "gigapi_global_instructions",
} as const;

// ============================================================================
// Storage Utilities
// ============================================================================

// Helper function to safely save chat sessions with compression and size limits
function saveChatSessions(sessions: Record<string, ChatSession>) {
  // Truncate artifact data to prevent large storage usage
  const optimizedSessions = Object.fromEntries(
    Object.entries(sessions).map(([id, session]) => {
      const optimizedMessages = session.messages.map((message) => {
        if (message.metadata?.artifacts) {
          const optimizedArtifacts = message.metadata.artifacts.map(
            (artifact) => {
              // Truncate table data if it's too large
              if (
                artifact.type === "table" &&
                artifact.data &&
                typeof artifact.data === "object" &&
                "results" in artifact.data &&
                Array.isArray(artifact.data.results)
              ) {
                const truncatedResults = StorageUtils.truncateData(
                  artifact.data.results,
                  500 // Limit to 500 rows per artifact
                );
                return {
                  ...artifact,
                  data: {
                    ...artifact.data,
                    results: truncatedResults.data,
                    metadata: {
                      ...(artifact.data as any).metadata,
                      truncated: truncatedResults.truncated,
                      originalRowCount: artifact.data.results.length,
                    },
                  },
                };
              }
              return artifact;
            }
          );

          return {
            ...message,
            metadata: {
              ...message.metadata,
              artifacts: optimizedArtifacts,
            },
          };
        }
        return message;
      });

      return [
        id,
        {
          ...session,
          messages: optimizedMessages,
        },
      ];
    })
  );

  // Save with compression and size limits
  const saved = StorageUtils.saveToStorage(
    STORAGE_KEYS.SESSIONS,
    optimizedSessions,
    {
      maxSizeBytes: 10 * 1024 * 1024, // 10MB limit for chat sessions
      compress: true,
      maxRowsPerArtifact: 500,
    }
  );

  if (!saved) {
    console.warn("Failed to save chat sessions - size limit exceeded");
    // Attempt cleanup and retry
    const cleanedCount = StorageUtils.cleanupOldSessions(7); // Clean sessions older than 7 days
    if (cleanedCount > 0) {
      return StorageUtils.saveToStorage(
        STORAGE_KEYS.SESSIONS,
        optimizedSessions,
        {
          maxSizeBytes: 10 * 1024 * 1024,
          compress: true,
          maxRowsPerArtifact: 500,
        }
      );
    }
  }

  return saved;
}

// Helper function to load chat sessions with decompression
function loadChatSessions(): Record<string, ChatSession> {
  const sessions = StorageUtils.loadFromStorage<Record<string, ChatSession>>(
    STORAGE_KEYS.SESSIONS
  );
  return sessions || {};
}

// Storage monitoring and cleanup
function monitorStorageUsage() {
  const usage = StorageUtils.getStorageUsage();

  // Log usage information
  console.log(
    `📊 Storage Usage: ${usage.used.toLocaleString()} bytes (${usage.percentage.toFixed(
      1
    )}%)`
  );

  // Warn if approaching storage limits
  if (usage.percentage > 70) {
    console.warn(
      `⚠️ Storage usage high: ${usage.percentage.toFixed(
        1
      )}% - consider cleaning up old sessions`
    );

    // Auto-cleanup if over 80%
    if (usage.percentage > 80) {
      const cleanedCount = StorageUtils.cleanupOldSessions(14); // Clean sessions older than 2 weeks
      if (cleanedCount > 0) {
        console.log(`🧹 Auto-cleaned ${cleanedCount} old sessions`);
      }
    }
  }
}

// Initialize storage monitoring
if (typeof window !== "undefined") {
  // Check storage usage on load
  monitorStorageUsage();

  // Set up periodic monitoring (every 5 minutes)
  setInterval(monitorStorageUsage, 5 * 60 * 1000);
}

// ============================================================================
// Base Atoms
// ============================================================================

// Chat sessions stored in localStorage with compression and size limits
const chatSessionsBaseAtom = atom<Record<string, ChatSession>>(
  loadChatSessions()
);

export const chatSessionsAtom = atom(
  (get) => get(chatSessionsBaseAtom),
  (_get, set, newSessions: Record<string, ChatSession>) => {
    set(chatSessionsBaseAtom, newSessions);
    // Save sessions with compression and size limits
    saveChatSessions(newSessions);
  }
);

// AI connections stored in localStorage
export const aiConnectionsAtom = atomWithStorage<AIConnection[]>(
  STORAGE_KEYS.CONNECTIONS,
  []
);

// Global instructions that apply to all chats
export const globalInstructionsAtom = atomWithStorage<string[]>(
  STORAGE_KEYS.GLOBAL_INSTRUCTIONS,
  []
);

// Active session ID
export const activeSessionIdAtom = atomWithStorage<string | null>(
  STORAGE_KEYS.ACTIVE_SESSION,
  null
);

// Query Editor Chat Session ID
export const queryEditorChatSessionIdAtom = atomWithStorage<string | null>(
  "gigapi_query_editor_chat_session",
  null
);

// Active abort controllers for streaming messages
export const activeAbortControllersAtom = atom<Map<string, AbortController>>(
  new Map()
);

// Track which message is being edited
export const editingMessageIdAtom = atom<string | null>(null);

// ============================================================================
// Derived Atoms
// ============================================================================

// Get active session
export const activeSessionAtom = atom((get) => {
  const sessions = get(chatSessionsAtom);
  const activeId = get(activeSessionIdAtom);
  return activeId ? sessions[activeId] : null;
});

// Get session list sorted by last update
export const sessionListAtom = atom((get) => {
  const sessions = get(chatSessionsAtom);
  return Object.values(sessions).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
});

// ============================================================================
// Helper Functions
// ============================================================================

// Convert SchemaCache to SchemaContext format
function convertSchemaCacheToContext(schemaCache: any): SchemaContext | null {
  if (!schemaCache || !schemaCache.databases) {
    return null;
  }

  const converted: SchemaContext = {
    databases: {},
    activeTables: [],
  };

  // Convert each database
  Object.entries(schemaCache.databases).forEach(
    ([dbName, dbData]: [string, any]) => {
      converted.databases[dbName] = {
        tables: dbData.tables || [],
        schemas: {},
      };

      // Convert each table schema
      if (dbData.schemas) {
        Object.entries(dbData.schemas).forEach(
          ([tableName, columns]: [string, any]) => {
            if (Array.isArray(columns)) {
              converted.databases[dbName].schemas[tableName] = columns.map(
                (col: any) => ({
                  column_name: col.column_name || "",
                  column_type: col.column_type || "",
                  // Convert null to undefined for optional fields
                  key: col.key === null ? undefined : col.key,
                  null: col.null === null ? undefined : col.null,
                })
              );
            }
          }
        );
      }
    }
  );

  return converted;
}

// ============================================================================
// Action Atoms
// ============================================================================

// Create new chat session
export const createSessionAtom = atom(
  null,
  (get, set, options: CreateSessionOptions) => {
    const connections = get(aiConnectionsAtom);
    const connection = connections.find((c) => c.id === options.connectionId);

    if (!connection) {
      throw new Error("Connection not found");
    }

    const sessionId = `session_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 11)}`;

    const newSession: ChatSession = {
      id: sessionId,
      aiConnectionId: connection.id,
      connection, // Store the connection directly
      title: options.title || "New Chat",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };

    const sessions = get(chatSessionsAtom);
    set(chatSessionsAtom, {
      ...sessions,
      [sessionId]: newSession,
    });
    set(activeSessionIdAtom, sessionId);

    return sessionId;
  }
);

// Cancel streaming message
export const cancelMessageAtom = atom(null, (get, set, sessionId: string) => {
  const abortControllers = get(activeAbortControllersAtom);
  const controller = abortControllers.get(sessionId);

  if (controller) {
    // Abort the fetch request
    controller.abort();

    // Remove from active controllers
    const newControllers = new Map(abortControllers);
    newControllers.delete(sessionId);
    set(activeAbortControllersAtom, newControllers);

    // Update the session to remove streaming flag from the last message
    const sessions = get(chatSessionsAtom);
    const session = sessions[sessionId];
    if (session && session.messages.length > 0) {
      const lastMessage = session.messages[session.messages.length - 1];
      if (lastMessage.metadata?.isStreaming) {
        const updatedMessages = [...session.messages];
        updatedMessages[updatedMessages.length - 1] = {
          ...lastMessage,
          metadata: {
            ...lastMessage.metadata,
            isStreaming: false,
            wasCancelled: true,
          },
        };

        set(chatSessionsAtom, {
          ...sessions,
          [sessionId]: {
            ...session,
            messages: updatedMessages,
            updatedAt: new Date().toISOString(),
          },
        });
      }
    }

    return true;
  }

  return false;
});

// Send message with streaming support
export const sendMessageAtom = atom(
  null,
  async (get, set, options: SendMessageOptions) => {
    const sessions = get(chatSessionsAtom);
    const session = sessions[options.sessionId];

    if (!session) {
      throw new Error("Session not found");
    }

    if (!session.connection) {
      throw new Error("No connection configured for this session");
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: options.message,
      timestamp: new Date().toISOString(),
      metadata: {
        isAgentic: options.isAgentic || false,
      },
    };

    // Update session with user message
    const updatedSession = {
      ...session,
      messages: [...session.messages, userMessage],
      updatedAt: new Date().toISOString(),
    };

    set(chatSessionsAtom, {
      ...sessions,
      [options.sessionId]: updatedSession,
    });

    // Create assistant message placeholder for streaming
    const assistantMessageId = `msg_${Date.now()}_assistant`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      metadata: { isStreaming: true, thinking: "" },
    };

    // Add empty assistant message immediately
    const streamingSession = {
      ...updatedSession,
      messages: [...updatedSession.messages, assistantMessage],
      updatedAt: new Date().toISOString(),
    };

    set(chatSessionsAtom, {
      ...sessions,
      [options.sessionId]: streamingSession,
    });

    // Track thinking state
    let isInThinkingBlock = false;
    let accumulatedThinking = "";
    let accumulatedContent = "";

    // Create abort controller for this request
    const abortController = new AbortController();
    const abortControllers = get(activeAbortControllersAtom);
    const newControllers = new Map(abortControllers);
    newControllers.set(options.sessionId, abortController);
    set(activeAbortControllersAtom, newControllers);

    try {
      // Get global instructions and schema cache
      const globalInstructions = get(globalInstructionsAtom);
      let schemaCache = get(schemaCacheAtom);

      // Load schemas for any @mentions in the message
      if (options.message.includes("@")) {
        const mentions = extractMentions(options.message);
        console.log("[Chat] Found mentions in user message:", mentions);

        // Load schemas for any table mentions
        for (const mention of mentions) {
          if (mention.type === "table" && mention.database && mention.table) {
            // Check if schema is already cached
            if (
              !schemaCache?.databases[mention.database]?.schemas[mention.table]
            ) {
              console.log(
                `[Chat] Loading schema for mentioned table: ${mention.database}.${mention.table}`
              );
              try {
                // Load the schema using the lazy loading atom
                await set(loadAndCacheTableSchemaAtom, {
                  database: mention.database,
                  table: mention.table,
                });
                // Refresh schema cache after loading
                schemaCache = get(schemaCacheAtom);
                console.log(
                  `[Chat] Schema loaded for ${mention.database}.${mention.table}`
                );
              } catch (error) {
                console.error(
                  `[Chat] Failed to load schema for ${mention.database}.${mention.table}:`,
                  error
                );
              }
            }
          }
        }
      }

      // Debug: Log schema cache status
      if (schemaCache) {
        const databaseInfo = Object.entries(schemaCache.databases || {}).map(
          ([dbName, dbData]: [string, any]) => ({
            name: dbName,
            tables: dbData.tables || [],
            tableCount: dbData.tables?.length || 0,
            schemasLoaded: Object.keys(dbData.schemas || {}).length,
          })
        );
        console.log("📊 Schema cache loaded:", {
          databases: databaseInfo,
          totalDatabases: databaseInfo.length,
        });
      } else {
        console.warn("⚠️ No schema cache found");
      }

      // Get time context from current tab
      const currentTab = getCurrentTabData();
      const timeRange = currentTab?.timeRange
        ? JSON.stringify(currentTab.timeRange)
        : null;
      const selectedDb = currentTab?.database || "";
      const selectedTable = currentTab?.table || "";

      // Build query context for artifact intelligence
      // Convert schema cache to proper format
      const schemaContext = convertSchemaCacheToContext(schemaCache);

      const queryContext: QueryContext = {
        selectedDatabase: selectedDb || undefined,
        selectedTable: selectedTable || undefined,
        globalInstructions,
        schemaContext: schemaContext || undefined,
        timeContext: timeRange
          ? {
              timeRange: JSON.parse(timeRange),
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              interval: undefined, // Will be auto-calculated
            }
          : undefined,
      };

      // Get API URL for streaming function
      const apiUrl = get(apiUrlAtom);
      
      // Send to AI with streaming
      await sendToAIStreaming(
        session.connection,
        updatedSession.messages,
        globalInstructions,
        schemaCache,
        queryContext,
        apiUrl,
        options.isAgentic || false,
        (chunk: string) => {
          // Process chunk for thinking blocks
          // We need to handle cases where tags might be split across chunks
          if (isInThinkingBlock) {
            // We're inside a thinking block, look for the end tag
            const thinkingEndMatch = chunk.match(/<\/think>/);

            if (thinkingEndMatch && thinkingEndMatch.index !== undefined) {
              // Found end of thinking block
              accumulatedThinking += chunk.substring(0, thinkingEndMatch.index);
              const afterThinking = chunk.substring(
                thinkingEndMatch.index + thinkingEndMatch[0].length
              );
              isInThinkingBlock = false;

              // Process the rest of the chunk for new thinking blocks
              if (afterThinking) {
                processChunkForThinking(afterThinking);
              }
            } else {
              // Still inside thinking block
              accumulatedThinking += chunk;
            }
          } else {
            // Not in thinking block, process normally
            processChunkForThinking(chunk);
          }

          function processChunkForThinking(text: string) {
            const thinkingStartMatch = text.match(/<think>/);

            if (thinkingStartMatch && thinkingStartMatch.index !== undefined) {
              // Found start of thinking block
              const beforeThinking = text.substring(
                0,
                thinkingStartMatch.index
              );
              const afterStart = text.substring(
                thinkingStartMatch.index + thinkingStartMatch[0].length
              );

              if (beforeThinking) {
                accumulatedContent += beforeThinking;
              }

              // Check if the end tag is also in this chunk
              const endMatch = afterStart.match(/<\/think>/);
              if (endMatch && endMatch.index !== undefined) {
                // Complete thinking block in this chunk
                accumulatedThinking += afterStart.substring(0, endMatch.index);
                const afterEnd = afterStart.substring(
                  endMatch.index + endMatch[0].length
                );
                if (afterEnd) {
                  processChunkForThinking(afterEnd); // Recursively process rest
                }
              } else {
                // Start of thinking block but no end yet
                isInThinkingBlock = true;
                accumulatedThinking += afterStart;
              }
            } else {
              // No thinking tags, just content
              accumulatedContent += text;
            }
          }

          // Update the message
          const currentSessions = get(chatSessionsAtom);
          const currentSession = currentSessions[options.sessionId];
          if (!currentSession) {
            console.error("Session not found for streaming update");
            return;
          }

          const messages = [...currentSession.messages];
          const lastMessageIndex = messages.length - 1;

          if (
            lastMessageIndex >= 0 &&
            messages[lastMessageIndex].id === assistantMessageId
          ) {
            messages[lastMessageIndex] = {
              ...messages[lastMessageIndex],
              content: accumulatedContent,
              metadata: {
                ...messages[lastMessageIndex].metadata,
                isStreaming: true,
                thinking: accumulatedThinking,
              },
            };

            set(chatSessionsAtom, {
              ...currentSessions,
              [options.sessionId]: {
                ...currentSession,
                messages,
                updatedAt: new Date().toISOString(),
              },
            });
          }
        },
        (finalContent: string, artifacts?: any[]) => {
          // Finalize the message
          const currentSessions = get(chatSessionsAtom);
          const currentSession = currentSessions[options.sessionId];
          const messages = [...currentSession.messages];
          const lastMessageIndex = messages.length - 1;

          if (
            lastMessageIndex >= 0 &&
            messages[lastMessageIndex].id === assistantMessageId
          ) {
            // Process final content to remove thinking blocks (both <think> and <thinking>)
            const processedContent = finalContent
              .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/g, "")
              .trim();

            messages[lastMessageIndex] = {
              ...messages[lastMessageIndex],
              content: processedContent,
              metadata: {
                ...messages[lastMessageIndex].metadata,
                isStreaming: false,
                thinking: accumulatedThinking || undefined,
                artifacts: artifacts,
              },
            };

            set(chatSessionsAtom, {
              ...currentSessions,
              [options.sessionId]: {
                ...currentSession,
                messages,
                updatedAt: new Date().toISOString(),
              },
            });
          }
        },
        abortController.signal
      );

      // Clean up abort controller after successful completion
      const currentControllers = get(activeAbortControllersAtom);
      const updatedControllers = new Map(currentControllers);
      updatedControllers.delete(options.sessionId);
      set(activeAbortControllersAtom, updatedControllers);
    } catch (error) {
      // Clean up abort controller
      const currentControllers = get(activeAbortControllersAtom);
      const updatedControllers = new Map(currentControllers);
      updatedControllers.delete(options.sessionId);
      set(activeAbortControllersAtom, updatedControllers);

      // Check if the error is due to abort
      if (error instanceof Error && error.name === "AbortError") {
        // Don't show error message for cancelled requests
        console.log("Message streaming was cancelled");
        return;
      }

      // Remove the streaming message and add error message
      const currentSessions = get(chatSessionsAtom);
      const currentSession = currentSessions[options.sessionId];
      const messages = currentSession.messages.filter(
        (m) => m.id !== assistantMessageId
      );

      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorMessage: ChatMessage = {
        id: `msg_${Date.now()}_error`,
        role: "assistant",
        content: `I encountered an error: ${errorMsg}`,
        timestamp: new Date().toISOString(),
        metadata: {
          error: errorMsg,
        },
      };

      set(chatSessionsAtom, {
        ...currentSessions,
        [options.sessionId]: {
          ...currentSession,
          messages: [...messages, errorMessage],
          updatedAt: new Date().toISOString(),
        },
      });

      throw error;
    }
  }
);

// Update session connection
export const updateSessionConnectionAtom = atom(
  null,
  async (get, set, sessionId: string, connectionId: string) => {
    const sessions = get(chatSessionsAtom);
    const connections = get(aiConnectionsAtom);
    const session = sessions[sessionId];
    const connection = connections.find((c) => c.id === connectionId);

    if (!session) {
      throw new Error("Session not found");
    }

    if (!connection) {
      throw new Error("Connection not found");
    }

    // Update session with new connection
    const updatedSession: ChatSession = {
      ...session,
      connection,
      aiConnectionId: connectionId,
      updatedAt: new Date().toISOString(),
    };

    set(chatSessionsAtom, {
      ...sessions,
      [sessionId]: updatedSession,
    });
  }
);

// Delete session
export const deleteSessionAtom = atom(null, (get, set, sessionId: string) => {
  const sessions = get(chatSessionsAtom);
  const activeId = get(activeSessionIdAtom);

  // Remove session
  const { [sessionId]: _, ...remainingSessions } = sessions;
  set(chatSessionsAtom, remainingSessions);

  // Update active session if needed
  if (activeId === sessionId) {
    const sessionList = Object.keys(remainingSessions);
    set(activeSessionIdAtom, sessionList.length > 0 ? sessionList[0] : null);
  }
});

// Edit message
export const editMessageAtom = atom(
  null,
  async (
    get,
    set,
    options: { sessionId: string; messageId: string; newContent: string }
  ) => {
    const { sessionId, messageId, newContent } = options;
    const sessions = get(chatSessionsAtom);
    const session = sessions[sessionId];

    if (!session) {
      throw new Error("Session not found");
    }

    const messageIndex = session.messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) {
      throw new Error("Message not found");
    }

    const message = session.messages[messageIndex];
    if (message.role !== "user") {
      throw new Error("Only user messages can be edited");
    }

    // Update the message content
    const updatedMessages = [...session.messages];
    updatedMessages[messageIndex] = {
      ...message,
      content: newContent,
      metadata: {
        ...message.metadata,
        edited: true,
        editedAt: new Date().toISOString(),
      },
    };

    // Remove all messages after the edited message (to regenerate responses)
    const messagesBeforeEdit = updatedMessages.slice(0, messageIndex + 1);

    // Update session
    set(chatSessionsAtom, {
      ...sessions,
      [sessionId]: {
        ...session,
        messages: messagesBeforeEdit,
        updatedAt: new Date().toISOString(),
      },
    });

    // Clear editing state
    set(editingMessageIdAtom, null);

    // Return the edited message for regeneration
    return updatedMessages[messageIndex];
  }
);

// Regenerate from message
export const regenerateFromMessageAtom = atom(
  null,
  async (
    get,
    set,
    options: { sessionId: string; messageId: string; isAgentic?: boolean }
  ) => {
    const { sessionId, messageId, isAgentic } = options;
    const sessions = get(chatSessionsAtom);
    const session = sessions[sessionId];

    if (!session) {
      throw new Error("Session not found");
    }

    if (!session.connection) {
      throw new Error("No connection configured for this session");
    }

    const messageIndex = session.messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) {
      throw new Error("Message not found");
    }

    const message = session.messages[messageIndex];
    if (message.role !== "user") {
      throw new Error("Only user messages can be regenerated from");
    }

    // Remove all messages after this message
    const messagesUpToThis = session.messages.slice(0, messageIndex + 1);

    // Create assistant message placeholder for streaming
    const assistantMessageId = `msg_${Date.now()}_assistant`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      metadata: { isStreaming: true, thinking: "" },
    };

    // Update session to remove subsequent messages and add streaming placeholder
    const streamingSession = {
      ...session,
      messages: [...messagesUpToThis, assistantMessage],
      updatedAt: new Date().toISOString(),
    };

    set(chatSessionsAtom, {
      ...sessions,
      [sessionId]: streamingSession,
    });

    // Track thinking state
    let isInThinkingBlock = false;
    let accumulatedThinking = "";
    let accumulatedContent = "";

    // Create abort controller for this request
    const abortController = new AbortController();
    const abortControllers = get(activeAbortControllersAtom);
    const newControllers = new Map(abortControllers);
    newControllers.set(sessionId, abortController);
    set(activeAbortControllersAtom, newControllers);

    try {
      // Get global instructions and schema cache
      const globalInstructions = get(globalInstructionsAtom);
      let schemaCache = get(schemaCacheAtom);

      // Get time context from current tab
      const currentTab = getCurrentTabData();
      const timeRange = currentTab?.timeRange
        ? JSON.stringify(currentTab.timeRange)
        : null;
      const selectedDb = currentTab?.database || "";
      const selectedTable = currentTab?.table || "";

      // Build query context for artifact intelligence
      const schemaContext = convertSchemaCacheToContext(schemaCache);

      const queryContext: QueryContext = {
        selectedDatabase: selectedDb || undefined,
        selectedTable: selectedTable || undefined,
        globalInstructions,
        schemaContext: schemaContext || undefined,
        timeContext: timeRange
          ? {
              timeRange: JSON.parse(timeRange),
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              interval: undefined,
            }
          : undefined,
      };

      // Get API URL for streaming function
      const apiUrl = get(apiUrlAtom);
      
      // Send to AI with streaming (using messages up to the edited one)
      await sendToAIStreaming(
        session.connection,
        messagesUpToThis,
        globalInstructions,
        schemaCache,
        queryContext,
        apiUrl,
        isAgentic || false,
        (chunk: string) => {
          // Process chunk for thinking blocks (same logic as sendMessageAtom)
          if (isInThinkingBlock) {
            const thinkingEndMatch = chunk.match(/<\/think>/);
            if (thinkingEndMatch && thinkingEndMatch.index !== undefined) {
              accumulatedThinking += chunk.substring(0, thinkingEndMatch.index);
              const afterThinking = chunk.substring(
                thinkingEndMatch.index + thinkingEndMatch[0].length
              );
              isInThinkingBlock = false;
              if (afterThinking) {
                processChunkForThinking(afterThinking);
              }
            } else {
              accumulatedThinking += chunk;
            }
          } else {
            processChunkForThinking(chunk);
          }

          function processChunkForThinking(text: string) {
            const thinkingStartMatch = text.match(/<think>/);
            if (thinkingStartMatch && thinkingStartMatch.index !== undefined) {
              const beforeThinking = text.substring(
                0,
                thinkingStartMatch.index
              );
              const afterThinking = text.substring(
                thinkingStartMatch.index + thinkingStartMatch[0].length
              );
              accumulatedContent += beforeThinking;
              isInThinkingBlock = true;
              if (afterThinking) {
                if (isInThinkingBlock) {
                  accumulatedThinking += afterThinking;
                } else {
                  processChunkForThinking(afterThinking);
                }
              }
            } else {
              accumulatedContent += text;
            }
          }

          // Update the streaming message with current content
          const currentSessions = get(chatSessionsAtom);
          const currentSession = currentSessions[sessionId];
          const messages = [...currentSession.messages];
          const lastMessageIndex = messages.length - 1;

          if (
            lastMessageIndex >= 0 &&
            messages[lastMessageIndex].id === assistantMessageId
          ) {
            messages[lastMessageIndex] = {
              ...messages[lastMessageIndex],
              content: accumulatedContent,
              metadata: {
                ...messages[lastMessageIndex].metadata,
                isStreaming: true,
                thinking: accumulatedThinking,
              },
            };

            set(chatSessionsAtom, {
              ...currentSessions,
              [sessionId]: {
                ...currentSession,
                messages,
                updatedAt: new Date().toISOString(),
              },
            });
          }
        },
        (finalContent: string, artifacts?: any[]) => {
          // Finalize the message
          const currentSessions = get(chatSessionsAtom);
          const currentSession = currentSessions[sessionId];
          const messages = [...currentSession.messages];
          const lastMessageIndex = messages.length - 1;

          if (
            lastMessageIndex >= 0 &&
            messages[lastMessageIndex].id === assistantMessageId
          ) {
            const processedContent = finalContent
              .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/g, "")
              .trim();

            messages[lastMessageIndex] = {
              ...messages[lastMessageIndex],
              content: processedContent,
              metadata: {
                ...messages[lastMessageIndex].metadata,
                isStreaming: false,
                thinking: accumulatedThinking || undefined,
                artifacts: artifacts,
              },
            };

            set(chatSessionsAtom, {
              ...currentSessions,
              [sessionId]: {
                ...currentSession,
                messages,
                updatedAt: new Date().toISOString(),
              },
            });
          }
        },
        abortController.signal
      );

      // Clean up abort controller after successful completion
      const currentControllers = get(activeAbortControllersAtom);
      const updatedControllers = new Map(currentControllers);
      updatedControllers.delete(sessionId);
      set(activeAbortControllersAtom, updatedControllers);
    } catch (error) {
      // Clean up abort controller
      const currentControllers = get(activeAbortControllersAtom);
      const updatedControllers = new Map(currentControllers);
      updatedControllers.delete(sessionId);
      set(activeAbortControllersAtom, updatedControllers);

      // Check if the error is due to abort
      if (error instanceof Error && error.name === "AbortError") {
        console.log("Message streaming was cancelled");
        return;
      }

      // Remove the streaming message and add error message
      const currentSessions = get(chatSessionsAtom);
      const currentSession = currentSessions[sessionId];
      const messages = currentSession.messages.filter(
        (m) => m.id !== assistantMessageId
      );

      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorMessage: ChatMessage = {
        id: `msg_${Date.now()}_error`,
        role: "assistant",
        content: `I encountered an error: ${errorMsg}`,
        timestamp: new Date().toISOString(),
        metadata: {
          error: errorMsg,
        },
      };

      set(chatSessionsAtom, {
        ...currentSessions,
        [sessionId]: {
          ...currentSession,
          messages: [...messages, errorMessage],
          updatedAt: new Date().toISOString(),
        },
      });

      throw error;
    }
  }
);

// Rename session
export const renameSessionAtom = atom(
  null,
  (get, set, sessionId: string, newTitle: string) => {
    const sessions = get(chatSessionsAtom);
    const session = sessions[sessionId];

    if (!session) {
      throw new Error("Session not found");
    }

    set(chatSessionsAtom, {
      ...sessions,
      [sessionId]: {
        ...session,
        title: newTitle,
        updatedAt: new Date().toISOString(),
      },
    });
  }
);

// Delete connection
export const deleteConnectionAtom = atom(
  null,
  (get, set, connectionId: string) => {
    const connections = get(aiConnectionsAtom);
    const filteredConnections = connections.filter(
      (c) => c.id !== connectionId
    );

    // If we deleted the active connection, make the first one active
    if (
      filteredConnections.length > 0 &&
      !filteredConnections.some((c) => c.isActive)
    ) {
      filteredConnections[0].isActive = true;
    }

    set(aiConnectionsAtom, filteredConnections);
  }
);

// Add global instruction
export const addGlobalInstructionAtom = atom(
  null,
  (get, set, instruction: string) => {
    const instructions = get(globalInstructionsAtom);
    set(globalInstructionsAtom, [...instructions, instruction]);
  }
);

// Remove global instruction
export const removeGlobalInstructionAtom = atom(
  null,
  (get, set, index: number) => {
    const instructions = get(globalInstructionsAtom);
    set(
      globalInstructionsAtom,
      instructions.filter((_, i) => i !== index)
    );
  }
);

// Update global instruction
export const updateGlobalInstructionAtom = atom(
  null,
  (get, set, index: number, newInstruction: string) => {
    const instructions = get(globalInstructionsAtom);
    const updated = [...instructions];
    updated[index] = newInstruction;
    set(globalInstructionsAtom, updated);
  }
);

// ============================================================================
// AI Instructions
// ============================================================================

// Get AI instructions from consolidated system
const getAIInstructions = (isAgentic: boolean = false): string => {
  return getGigAPIInstructions(isAgentic);
};

// ============================================================================
// Helper Functions
// ============================================================================

async function sendToAIStreaming(
  connection: AIConnection,
  messages: ChatMessage[],
  globalInstructions: string[] = [],
  schemaCache: any = null,
  queryContext: QueryContext,
  apiUrl: string,
  isAgentic: boolean = false,
  onChunk: (chunk: string) => void,
  onComplete: (finalContent: string, artifacts?: any[]) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  // Build system messages (same as sendToAI)
  const systemMessages = [];

  // Add base AI instructions for Gigapi
  systemMessages.push({
    role: "system",
    content: getAIInstructions(isAgentic),
  });
  
  // Add first message examples if this is the first user message
  const userMessages = messages.filter(m => m.role === "user");
  if (userMessages.length === 1 && !isAgentic) {
    systemMessages.push({
      role: "system",
      content: `REMINDER: You MUST create artifacts for ALL queries and visualizations.

Example - when user asks "show me data from users":
\`\`\`query
{
  "title": "Users Data",
  "query": "SELECT * FROM users LIMIT 100",
  "database": "@main"
}
\`\`\`

NEVER write SQL as plain text. ALWAYS use artifact blocks.`
    });
  }

  // Add global instructions
  if (globalInstructions.length > 0) {
    systemMessages.push({
      role: "system",
      content: "CUSTOM INSTRUCTIONS:\n" + globalInstructions.join("\n\n"),
    });
  }

  // Add mode-specific reminder
  if (isAgentic) {
    systemMessages.push({
      role: "system",
      content: `🚨 AGENTIC MODE ACTIVE 🚨

You are currently in AGENTIC MODE. This means:

1. **NEVER generate executable artifacts** (query, chart, table, etc.) directly
2. **ALWAYS generate proposal artifacts** using the \`\`\`proposal format
3. **WAIT for user approval** before any execution
4. **NEVER include @ symbols** in your SQL queries
5. **ALWAYS explain your rationale** for each proposed query

## EXACT PROPOSAL FORMAT REQUIRED:

For queries:
\`\`\`proposal
{
  "type": "query_proposal",
  "title": "Clear descriptive title",
  "description": "What this query will do",
  "query": "SELECT * FROM table_name LIMIT 10",
  "database": "database_name",
  "rationale": "Why this query is needed",
  "next_steps": ["what to do next", "other actions"]
}
\`\`\`

For charts:
\`\`\`proposal
{
  "type": "chart_proposal",
  "title": "Chart title",
  "description": "What this chart shows",
  "query": "SELECT time, value FROM metrics ORDER BY time",
  "database": "database_name",
  "chart_type": "line",
  "x_axis": "time",
  "y_axes": ["value"],
  "rationale": "Why this visualization is useful",
  "next_steps": ["refinements", "other charts"]
}
\`\`\`

## CRITICAL RULES:
- ALWAYS use "type": "query_proposal" or "type": "chart_proposal"
- NEVER use "type": "proposal" 
- ALWAYS include ALL required fields
- NEVER include @ symbols in queries
- ALWAYS use actual database names from context

Example: When user asks "summarize @mydb.table", you should respond with:
- Text explanation of what you'll do
- A proposal artifact with clean SQL (no @ symbols)
- Clear rationale and next steps

DO NOT generate direct query/chart artifacts in agentic mode!`,
    });
  } else {
    systemMessages.push({
      role: "system",
      content: `✅ DIRECT MODE ACTIVE ✅

You are currently in DIRECT MODE. This means:

1. **DIRECTLY generate executable artifacts** (query, chart, table) as requested
2. **DO NOT generate proposal artifacts** - execute immediately
3. **STRIP @ symbols** from SQL queries automatically
4. **NEVER write SQL as plain text** - ALWAYS use artifact blocks
5. **PROVIDE results immediately** without waiting for approval

🔴 CRITICAL: Every SQL query MUST be in a \`\`\`query or \`\`\`chart artifact.
Plain text SQL is USELESS to users. They CANNOT execute plain text.

Example: When user asks "show me sales by month", respond with:
- Brief explanation (optional)
- Direct sql_query or chart artifact ready to execute
- Results will appear immediately`,
    });
  }

  // Convert schema cache to proper format
  const schemaContext = schemaCache
    ? convertSchemaCacheToContext(schemaCache)
    : null;

  // Include schema context using the new SchemaContextBuilder
  if (schemaContext) {
    // Analyze conversation for context continuity
    const conversationContext = buildConversationContext(messages);

    // Get mentions from the last message
    const lastMessage = messages[messages.length - 1];
    const mentions = lastMessage ? extractMentions(lastMessage.content) : [];
    
    // Create sample data loader function with proper closure
    const loadSampleData = async (database: string, table: string) => {
      try {
        // Check cache first
        const cachedSample = schemaCache?.databases[database]?.sampleData?.[table];
        if (cachedSample && Date.now() - cachedSample.timestamp < 30 * 60 * 1000) {
          return cachedSample;
        }
        
        // Load fresh sample data
        console.log(`[Chat] Loading sample data for ${database}.${table}`);
        const response = await axios.post(
          `${apiUrl}?db=${database}&format=json`,
          { query: `SELECT * FROM ${table} LIMIT 3` },
          { timeout: 5000 }
        );
        
        return {
          data: response.data.results || [],
          columns: response.data.results?.length > 0 ? Object.keys(response.data.results[0]) : []
        };
      } catch (error) {
        console.log(`[Chat] Could not load sample data for ${database}.${table}:`, error);
        return null;
      }
    };
    
    // Build comprehensive schema context with sample data
    const schemaContextString = await buildSchemaContext(schemaContext, mentions, loadSampleData);

    if (schemaContextString) {
      // Extract mentions for logging
      const lastMessage = messages[messages.length - 1];
      const mentionsForLogging = lastMessage
        ? extractBasicMentions(lastMessage.content)
        : [];
      const isFirstMessage =
        messages.filter((m) => m.role === "user").length === 1;

      console.log("📊 Sending schema context to AI:", {
        isFirstMessage,
        isAgentic,
        mentionsFound: mentionsForLogging.length,
        mentions: mentionsForLogging.map((m) => ({
          type: m.type,
          fullName: m.fullName,
          database: m.database,
          table: m.table,
        })),
        conversationSummary: conversationContext,
        contextLength: schemaContextString.length,
        contextType:
          isFirstMessage && mentions.length > 0
            ? "first_message_with_mentions"
            : isFirstMessage
            ? "first_message"
            : mentions.length > 0
            ? "mentions"
            : "summary",
        hasSchemaData: schemaContextString.includes("Columns:"),
        hasSampleData: schemaContextString.includes("Sample data"),
      });

      systemMessages.push({
        role: "system",
        content: `DATABASE SCHEMA CONTEXT:\n\n${schemaContextString}`,
      });

      // Add conversation context for better continuity (both modes)
      if (conversationContext && conversationContext.length > 0) {
        systemMessages.push({
          role: "system",
          content: `CONVERSATION CONTEXT:\n${conversationContext}\n\nIMPORTANT: When the user says "that", "it", "the schema", or uses other references, they are referring to the entities mentioned above.`,
        });
      }
    } else {
      // Schema context is optional - not all queries need schema
      console.log("ℹ️ No schema context needed for this query");
      
      // Still add conversation context if available
      if (conversationContext && conversationContext.length > 0) {
        systemMessages.push({
          role: "system",
          content: `CONVERSATION CONTEXT:\n${conversationContext}\n\nNote: No specific database schema was referenced in this query.`,
        });
      }
    }
  } else {
    // No schema cache available - this is fine for many queries
    console.log("ℹ️ Schema cache not available - proceeding without schema context");
  }

  // Map messages to AI format
  const aiFormattedMessages = messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  // Combine system and user messages
  const aiMessages = [...systemMessages, ...aiFormattedMessages];

  // Build endpoint URL
  let endpoint = connection.baseUrl || "";
  if (!endpoint) {
    throw new Error("No endpoint URL configured for AI connection");
  }

  // Add appropriate path based on provider
  if (!endpoint.includes("/chat") && !endpoint.includes("/v1/chat")) {
    // Check provider or URL patterns
    const isOllama =
      connection.provider === "ollama" ||
      (connection.provider === "custom" &&
        (endpoint.includes("localhost") || endpoint.includes("11434")));

    if (isOllama) {
      endpoint = endpoint.endsWith("/")
        ? endpoint + "api/chat"
        : endpoint + "/api/chat";
    } else if (
      connection.provider === "openai" ||
      connection.provider === "deepseek" ||
      endpoint.includes("openai.com") ||
      endpoint.includes("deepseek.com")
    ) {
      endpoint = endpoint.endsWith("/")
        ? endpoint + "chat/completions"
        : endpoint + "/chat/completions";
    } else {
      // Default to OpenAI format for custom providers
      endpoint = endpoint.endsWith("/")
        ? endpoint + "chat/completions"
        : endpoint + "/chat/completions";
    }
  }

  // Build request body based on provider
  let requestBody: any;
  const provider = connection.provider;

  if (
    provider === "ollama" ||
    (provider === "custom" &&
      (endpoint.includes("localhost") || endpoint.includes("11434")))
  ) {
    // Ollama format
    requestBody = {
      model: connection.model || "llama2",
      messages: aiMessages,
      stream: true,
    };
  } else {
    // Default to OpenAI format (works for OpenAI, DeepSeek, and most custom providers)
    requestBody = {
      model: connection.model,
      messages: aiMessages,
      stream: true,
    };
  }

  // Build headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...connection.headers,
  };

  // Make streaming request
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
    signal: abortSignal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI request failed: ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let accumulatedContent = "";
  let buffer = "";
  let chunkCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim() === "") continue;
        if (line.trim() === "data: [DONE]") continue;

        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));

            // Handle different provider formats
            let content = "";

            // Try multiple formats
            if (data.choices?.[0]?.delta?.content !== undefined) {
              // OpenAI/DeepSeek format
              content = data.choices[0].delta.content;
            } else if (data.delta?.content !== undefined) {
              // Alternative delta format
              content = data.delta.content;
            } else if (data.message?.content !== undefined) {
              // Ollama format
              content = data.message.content;
            } else if (data.content !== undefined) {
              // Direct content
              content = data.content;
            } else if (data.response !== undefined) {
              // Some providers use "response"
              content = data.response;
            } else if (typeof data === "string") {
              // Sometimes the data itself is the content
              content = data;
            }

            // For custom providers, try to find content in any field
            if (!content && connection.provider === "custom") {
              // Look for any field that might contain content
              const possibleFields = [
                "text",
                "message",
                "output",
                "result",
                "completion",
              ];
              for (const field of possibleFields) {
                if (data[field]) {
                  content = data[field];
                  break;
                }
              }
            }

            if (content) {
              chunkCount++;
              // Debug: Check if content is a string
              if (typeof content !== "string") {
                console.error("⚠️ Non-string content detected in streaming:", {
                  contentType: typeof content,
                  content: content,
                  chunkCount: chunkCount,
                });
                content = String(content);
              }
              accumulatedContent += content;
              onChunk(content);
            }
          } catch (e) {
            console.error("Error parsing streaming chunk:", e, "Line:", line);
          }
        } else if (line.trim() !== "") {
          // Some providers might not use "data: " prefix
          try {
            const data = JSON.parse(line);

            let content = "";

            // Same format detection as above
            if (data.choices?.[0]?.delta?.content !== undefined) {
              content = data.choices[0].delta.content;
            } else if (data.delta?.content !== undefined) {
              content = data.delta.content;
            } else if (data.message?.content !== undefined) {
              content = data.message.content;
            } else if (data.content !== undefined) {
              content = data.content;
            } else if (data.response !== undefined) {
              content = data.response;
            }

            if (content) {
              chunkCount++;
              // Debug: Check if content is a string
              if (typeof content !== "string") {
                console.error("⚠️ Non-string content detected in streaming:", {
                  contentType: typeof content,
                  content: content,
                  chunkCount: chunkCount,
                });
                content = String(content);
              }
              accumulatedContent += content;
              onChunk(content);
            }
          } catch (e) {
            // Not JSON, ignore
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Process the final content for artifacts and thinking
  const processedResponse = await processAIResponse(
    accumulatedContent,
    queryContext
  );
  // Note: thinking is already handled during streaming, but we process it again for non-streaming fallback
  onComplete(processedResponse.content, processedResponse.artifacts);
}

// Helper function to enhance and add artifact
async function enhanceAndAddArtifact(
  artifact: any,
  artifacts: any[],
  queryContext: QueryContext
) {
  try {
    // Get the validation service
    const validator = getArtifactValidator();
    
    // Build validation context
    const validationContext = {
      availableDatabases: queryContext.schemaContext?.databases 
        ? Object.keys(queryContext.schemaContext.databases)
        : [],
      schemaCache: queryContext.schemaContext || undefined,
      currentDatabase: queryContext.selectedDatabase
    };
    
    // Validate the artifact
    const validationResult = await validator.validateArtifact(artifact, validationContext);
    
    if (validationResult.valid) {
      // Add validated artifact with metadata
      artifacts.push({
        ...artifact,
        metadata: {
          ...artifact.metadata,
          validated: true,
          validationScore: validationResult.score,
          suggestions: validationResult.suggestions
        }
      });
      
      console.log(`✅ ${artifact.type} artifact validated successfully (score: ${validationResult.score})`);
    } else {
      // Still add the artifact but with validation errors/warnings
      console.warn(
        `⚠️ ${artifact.type} artifact validation failed:`,
        validationResult.errors
      );
      
      artifacts.push({
        ...artifact,
        metadata: {
          ...artifact.metadata,
          validated: false,
          validationErrors: validationResult.errors,
          validationWarnings: validationResult.warnings,
          suggestions: validationResult.suggestions,
          validationScore: validationResult.score
        },
      });
    }
  } catch (error) {
    console.error(`Failed to validate ${artifact.type} artifact:`, error);
    // Add artifact anyway but mark as unvalidated
    artifacts.push({
      ...artifact,
      metadata: {
        ...artifact.metadata,
        validated: false,
        validationError: error instanceof Error ? error.message : String(error)
      }
    });
  }
}

// Process AI response to extract artifacts and thinking
async function processAIResponse(
  content: string,
  queryContext: QueryContext
): Promise<{
  content: string;
  artifacts?: any[];
  thinking?: string;
}> {
  const artifacts: any[] = [];
  let thinking = "";

  // Extract thinking blocks (support both <think> and <thinking> tags)
  const thinkingMatches = content.matchAll(
    /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/g
  );
  for (const match of thinkingMatches) {
    thinking += match[1].trim() + "\n\n";
  }

  // Remove thinking blocks from content
  let processedContent = content
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/g, "")
    .trim();

  // Extract chart artifacts
  const chartMatches = processedContent.matchAll(
    /\`\`\`chart\n([\s\S]*?)\`\`\`/g
  );
  for (const match of chartMatches) {
    try {
      let artifact = safeJsonParse(match[1]);
      if (artifact && validateArtifactStructure(artifact)) {
        // Normalize and sanitize the artifact
        artifact = normalizeArtifact(artifact);
        artifact = QuerySanitizer.sanitizeQueryArtifact(artifact);

        const chartArtifact = {
          id: `chart_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 9)}`,
          type: "chart" as const,
          title: artifact.title || "AI Generated Chart",
          timestamp: new Date().toISOString(),
          data: artifact,
        };

        await enhanceAndAddArtifact(chartArtifact, artifacts, queryContext);
      }
    } catch (error) {
      console.error("Failed to parse chart artifact:", error);
    }
  }

  // Extract query artifacts
  const queryMatches = processedContent.matchAll(
    /\`\`\`query\n([\s\S]*?)\`\`\`/g
  );
  for (const match of queryMatches) {
    try {
      let artifact = safeJsonParse(match[1]);
      if (artifact && validateArtifactStructure(artifact)) {
        // Normalize and sanitize the artifact
        artifact = normalizeArtifact(artifact);
        artifact = QuerySanitizer.sanitizeQueryArtifact(artifact);

        const queryArtifact = {
          id: `query_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 9)}`,
          type: "query" as const,
          title: artifact.title || "SQL Query",
          timestamp: new Date().toISOString(),
          data: artifact,
        };

        await enhanceAndAddArtifact(queryArtifact, artifacts, queryContext);
      }
    } catch (error) {
      console.error("Failed to parse query artifact:", error);
    }
  }

  // Extract table artifacts
  const tableMatches = processedContent.matchAll(
    /\`\`\`table\n([\s\S]*?)\`\`\`/g
  );
  for (const match of tableMatches) {
    try {
      let artifact = safeJsonParse(match[1]);
      if (artifact && validateArtifactStructure(artifact)) {
        // Normalize and sanitize the artifact
        artifact = normalizeArtifact(artifact);
        artifact = QuerySanitizer.sanitizeQueryArtifact(artifact);

        const tableArtifact = {
          id: `table_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 9)}`,
          type: "table" as const,
          title: artifact.title || "Data Table",
          timestamp: new Date().toISOString(),
          data: artifact,
        };

        await enhanceAndAddArtifact(tableArtifact, artifacts, queryContext);
      }
    } catch (error) {
      console.error("Failed to parse table artifact:", error);
    }
  }

  // Extract summary artifacts
  const summaryMatches = processedContent.matchAll(
    /\`\`\`summary\n([\s\S]*?)\`\`\`/g
  );
  for (const match of summaryMatches) {
    try {
      const artifact = safeJsonParse(match[1]);
      if (artifact && artifact.summary) {
        const summaryArtifact = {
          id: `summary_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 9)}`,
          type: "summary" as const,
          title: "Summary",
          timestamp: new Date().toISOString(),
          data: artifact,
        };

        await enhanceAndAddArtifact(summaryArtifact, artifacts, queryContext);
      }
    } catch (error) {
      console.error("Failed to parse summary artifact:", error);
    }
  }

  // Extract insight artifacts
  const insightMatches = processedContent.matchAll(
    /\`\`\`insight\n([\s\S]*?)\`\`\`/g
  );
  for (const match of insightMatches) {
    try {
      const artifact = safeJsonParse(match[1]);
      if (artifact && artifact.insights) {
        const insightArtifact = {
          id: `insight_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 9)}`,
          type: "insight" as const,
          title: "Key Insights",
          timestamp: new Date().toISOString(),
          data: artifact,
        };

        await enhanceAndAddArtifact(insightArtifact, artifacts, queryContext);
      }
    } catch (error) {
      console.error("Failed to parse insight artifact:", error);
    }
  }

  // Extract proposal artifacts
  const proposalRegex = /\`\`\`proposal\n([\s\S]*?)\`\`\`/g;
  const proposalMatches = Array.from(processedContent.matchAll(proposalRegex));

  console.log("🔍 Processing proposal artifacts:", {
    matchCount: proposalMatches.length,
    contentLength: processedContent.length,
    hasProposalBlocks: processedContent.includes("```proposal"),
  });

  for (const match of proposalMatches) {
    try {
      console.log("🔍 Raw proposal match:", match[1]);
      let artifact = safeJsonParse(match[1]);
      
      if (!artifact) {
        console.error("🔍 Failed to parse proposal artifact");
        continue;
      }
      
      console.log("🔍 Parsed proposal artifact:", artifact);
      
      // Normalize the artifact structure
      artifact = normalizeArtifact(artifact);

      if (
        (artifact.type === "query_proposal" ||
          artifact.type === "chart_proposal") &&
        artifact.query
      ) {
        // Sanitize the proposal
        artifact = QuerySanitizer.sanitizeQueryArtifact(artifact);
        console.log("🔍 Sanitized proposal artifact:", artifact);

        const proposalArtifact = {
          id: `proposal_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 9)}`,
          type: "proposal" as const,
          title:
            artifact.title ||
            (artifact.type === "chart_proposal"
              ? "Chart Proposal"
              : "Query Proposal"),
          timestamp: new Date().toISOString(),
          data: {
            ...artifact,
            proposal_type: artifact.type // Ensure proposal_type is set for ProposalArtifact component
          },
        };

        console.log("🔍 Final proposal artifact:", proposalArtifact);

        // Don't enhance proposal artifacts - they're just proposals
        artifacts.push(proposalArtifact);
      } else {
        console.warn("🔍 Proposal artifact missing required fields:", {
          type: artifact.type,
          hasQuery: !!artifact.query,
        });
      }
    } catch (error) {
      console.error(
        "Failed to parse proposal artifact:",
        error,
        "Raw content:",
        match[1]
      );
    }
  }

  // Extract metric artifacts
  const metricMatches = processedContent.matchAll(
    /\`\`\`metric\n([\s\S]*?)\`\`\`/g
  );
  for (const match of metricMatches) {
    try {
      let artifact = JSON.parse(match[1]);
      if (artifact.query || artifact.value) {
        // Sanitize the artifact if it has a query
        if (artifact.query) {
          artifact = QuerySanitizer.sanitizeQueryArtifact(artifact);
        }

        const metricArtifact = {
          id: `metric_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 9)}`,
          type: "metric" as const,
          title: artifact.title || "Metric",
          timestamp: new Date().toISOString(),
          data: artifact,
        };

        await enhanceAndAddArtifact(metricArtifact, artifacts, queryContext);
      }
    } catch (error) {
      console.error("Failed to parse metric artifact:", error);
    }
  }

  // Remove artifact blocks from content for cleaner display
  let cleanContent = processedContent;
  cleanContent = cleanContent.replace(/\`\`\`chart\n[\s\S]*?\`\`\`/g, "");
  cleanContent = cleanContent.replace(/\`\`\`query\n[\s\S]*?\`\`\`/g, "");
  cleanContent = cleanContent.replace(/\`\`\`table\n[\s\S]*?\`\`\`/g, "");
  cleanContent = cleanContent.replace(/\`\`\`summary\n[\s\S]*?\`\`\`/g, "");
  cleanContent = cleanContent.replace(/\`\`\`insight\n[\s\S]*?\`\`\`/g, "");
  cleanContent = cleanContent.replace(/\`\`\`metric\n[\s\S]*?\`\`\`/g, "");
  cleanContent = cleanContent.replace(/\`\`\`proposal\n[\s\S]*?\`\`\`/g, "");

  // Clean up any [object Object] text that the AI might have included
  cleanContent = cleanContent.replace(/\[object Object\]/g, "");

  // Clean up any actual object strings that might have been included
  cleanContent = cleanContent.replace(
    /\{[^}]*"type"\s*:\s*"[^"]*"[^}]*\}/g,
    (match) => {
      // Check if this looks like an artifact object that was accidentally included
      if (
        match.includes('"query"') ||
        match.includes('"chart_type"') ||
        match.includes('"title"')
      ) {
        return ""; // Remove it
      }
      return match; // Keep other objects
    }
  );

  cleanContent = cleanContent.trim();

  return {
    content: cleanContent || processedContent, // Fall back to processedContent if nothing left
    artifacts: artifacts.length > 0 ? artifacts : undefined,
    thinking: thinking.trim() || undefined,
  };
}
