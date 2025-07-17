import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { ArtifactEnhancer } from "@/lib/artifact-intelligence";
import type {
  QueryContext,
  SchemaContext,
} from "@/lib/artifact-intelligence/types";
import {
  buildCompleteInstructions,
  InstructionBuilder,
} from "@/lib/ai-instructions";
import { QuerySanitizer } from "@/lib/query-sanitizer";
import { SchemaContextBuilder } from "@/lib/schema-context-builder";
import { ConversationAnalyzer } from "@/lib/conversation-analyzer";
import { StorageUtils } from "@/lib/storage-utils";
import { schemaCacheAtom, loadAndCacheTableSchemaAtom } from "./database-atoms";
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

    try {
      // Get global instructions and schema cache
      const globalInstructions = get(globalInstructionsAtom);
      let schemaCache = get(schemaCacheAtom);

      // Load schemas for any @mentions in the message
      if (options.message.includes("@")) {
        const mentions = SchemaContextBuilder.extractMentions(options.message);
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

      // Get time context from query interface
      const timeRange = localStorage.getItem("gigapi_time_range");
      const selectedDb = localStorage.getItem("gigapi_selected_db");
      const selectedTable = localStorage.getItem("gigapi_selected_table");

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

      // Send to AI with streaming
      await sendToAIStreaming(
        session.connection,
        updatedSession.messages,
        globalInstructions,
        schemaCache,
        queryContext,
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
        }
      );
    } catch (error) {
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

// Get AI instructions from modular system
const getAIInstructions = (isAgentic: boolean = false): string => {
  if (isAgentic) {
    return new InstructionBuilder({
      includeCore: true,
      includeSQL: true,
      includeChart: true,
      includeSchema: true,
      includeMentions: true,
      includeAgentic: true,
    }).getInstructions();
  }
  // Use direct mode instructions when not in agentic mode
  return buildCompleteInstructions(false);
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
  isAgentic: boolean = false,
  onChunk: (chunk: string) => void,
  onComplete: (finalContent: string, artifacts?: any[]) => void
): Promise<void> {
  // Build system messages (same as sendToAI)
  const systemMessages = [];

  // Add base AI instructions for Gigapi
  systemMessages.push({
    role: "system",
    content: getAIInstructions(isAgentic),
  });

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
4. **PROVIDE results immediately** without waiting for approval

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
    // ALWAYS analyze conversation for context continuity (not just in agentic mode)
    const conversationContext =
      ConversationAnalyzer.analyzeConversation(messages);

    const schemaContextString = SchemaContextBuilder.getSchemaContext(
      messages,
      schemaContext,
      {
        maxColumnsPerTable: 50, // Limit columns to prevent context overflow
        includeIndices: true,
        summaryOnly: false,
        includeRecentContext: true, // Always include recent context for better continuity
        isAgentic, // Pass agentic mode flag
      }
    );

    if (schemaContextString) {
      // Extract mentions for logging
      const lastMessage = messages[messages.length - 1];
      const mentions = lastMessage
        ? SchemaContextBuilder.extractMentions(lastMessage.content)
        : [];
      const isFirstMessage =
        messages.filter((m) => m.role === "user").length === 1;

      console.log("📊 Sending schema context to AI:", {
        isFirstMessage,
        isAgentic,
        lastMessageContent: lastMessage?.content || "",
        mentionsFound: mentions.length,
        mentions: mentions.map((m) => ({
          type: m.type,
          fullName: m.fullName,
          database: m.database,
          table: m.table,
        })),
        conversationContext: conversationContext
          ? {
              activeTables: conversationContext.activeTables,
              activeDatabases: conversationContext.activeDatabases,
              discussionTopic: conversationContext.discussionTopic,
            }
          : null,
        contextLength: schemaContextString.length,
        contextType:
          isFirstMessage && mentions.length > 0
            ? "first_message_with_mentions"
            : isFirstMessage
            ? "first_message"
            : mentions.length > 0
            ? "mentions"
            : "summary",
        contextPreview: schemaContextString.substring(0, 500) + "...",
      });

      systemMessages.push({
        role: "system",
        content: `DATABASE SCHEMA CONTEXT:\n\n${schemaContextString}`,
      });

      // Add conversation context for better continuity (both modes)
      if (conversationContext && conversationContext.activeTables.length > 0) {
        const contextSummary =
          ConversationAnalyzer.buildContextSummary(conversationContext);
        if (contextSummary) {
          systemMessages.push({
            role: "system",
            content: `CONVERSATION CONTEXT:\n${contextSummary}\n\nIMPORTANT: When the user says "that", "it", "the schema", or uses other references, they are referring to the entities mentioned above.`,
          });
        }
      }
    } else {
      console.warn("⚠️ No schema context generated for AI");
    }
  } else {
    console.warn("⚠️ No schema cache found in localStorage");
  }

  // Map messages to AI format
  const userMessages = messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  // Combine system and user messages
  const aiMessages = [...systemMessages, ...userMessages];

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
    const enhanced = await ArtifactEnhancer.enhance(artifact, queryContext);
    if (enhanced.validation.isValid) {
      artifacts.push(enhanced.enhanced);
    } else {
      // Still add the artifact but with validation warnings
      console.warn(
        `${artifact.type} artifact validation failed:`,
        enhanced.validation.errors
      );
      artifacts.push({
        ...artifact,
        metadata: {
          ...artifact.metadata,
          validationErrors: enhanced.validation.errors,
          validationWarnings: enhanced.validation.warnings,
        },
      });
    }
  } catch (error) {
    console.error(`Failed to enhance ${artifact.type} artifact:`, error);
    artifacts.push(artifact);
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
      let artifact = JSON.parse(match[1]);
      if (artifact.type && artifact.query) {
        // Sanitize the artifact
        artifact = QuerySanitizer.sanitizeQueryArtifact(artifact);

        const chartArtifact = {
          id: `chart_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 9)}`,
          type: "chart" as const,
          title: artifact.title || "AI Generated Chart",
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
      let artifact = JSON.parse(match[1]);
      if (artifact.query) {
        // Sanitize the artifact
        artifact = QuerySanitizer.sanitizeQueryArtifact(artifact);

        const queryArtifact = {
          id: `query_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 9)}`,
          type: "query" as const,
          title: artifact.title || "SQL Query",
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
      let artifact = JSON.parse(match[1]);
      if (artifact.query) {
        // Sanitize the artifact
        artifact = QuerySanitizer.sanitizeQueryArtifact(artifact);

        const tableArtifact = {
          id: `table_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 9)}`,
          type: "table" as const,
          title: artifact.title || "Data Table",
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
      const artifact = JSON.parse(match[1]);
      if (artifact.summary) {
        const summaryArtifact = {
          id: `summary_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 9)}`,
          type: "summary" as const,
          title: "Summary",
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
      const artifact = JSON.parse(match[1]);
      if (artifact.insights) {
        const insightArtifact = {
          id: `insight_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 9)}`,
          type: "insight" as const,
          title: "Key Insights",
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
      let artifact = JSON.parse(match[1]);
      console.log("🔍 Parsed proposal artifact:", artifact);

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
          data: artifact,
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
