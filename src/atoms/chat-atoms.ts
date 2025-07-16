import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { ArtifactEnhancer } from "@/lib/artifact-intelligence";
import type { QueryContext } from "@/lib/artifact-intelligence/types";
import {
  buildCompleteInstructions,
  InstructionBuilder,
} from "@/lib/ai-instructions";
import { QuerySanitizer } from "@/lib/query-sanitizer";
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
// Base Atoms
// ============================================================================

// Chat sessions stored in localStorage
export const chatSessionsAtom = atomWithStorage<Record<string, ChatSession>>(
  STORAGE_KEYS.SESSIONS,
  {}
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

// Get all connections (no active state needed)
export const allConnectionsAtom = atom((get) => {
  const connections = get(aiConnectionsAtom);
  return connections;
});

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
      const schemaCache = localStorage.getItem("gigapi_schema_cache");

      // Debug: Log schema cache status
      if (schemaCache) {
        const parsedSchema = JSON.parse(schemaCache);
        const databaseInfo = Object.entries(parsedSchema.databases || {}).map(
          ([dbName, dbData]: [string, any]) => ({
            name: dbName,
            tables: dbData.tables || [],
            tableCount: dbData.tables?.length || 0,
          })
        );
        console.log("📊 Schema cache loaded:", {
          databases: databaseInfo,
          totalDatabases: databaseInfo.length,
          cacheSize: schemaCache.length,
        });
      } else {
        console.warn("⚠️ No schema cache found in localStorage");
      }

      // Get time context from query interface
      const timeRange = localStorage.getItem("gigapi_time_range");
      const selectedDb = localStorage.getItem("gigapi_selected_db");
      const selectedTable = localStorage.getItem("gigapi_selected_table");

      // Build query context for artifact intelligence
      const queryContext: QueryContext = {
        selectedDatabase: selectedDb || undefined,
        selectedTable: selectedTable || undefined,
        globalInstructions,
        schemaContext: schemaCache ? JSON.parse(schemaCache) : undefined,
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
        schemaCache ? JSON.parse(schemaCache) : null,
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

// Set active connection
export const setActiveConnectionAtom = atom(
  null,
  (get, set, connectionId: string) => {
    const connections = get(aiConnectionsAtom);

    // Update connections to set the active one
    const updatedConnections = connections.map((conn) => ({
      ...conn,
      isActive: conn.id === connectionId,
    }));

    set(aiConnectionsAtom, updatedConnections);
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

  // Include schema context
  const isFirstMessage = messages.filter((m) => m.role === "user").length === 1;
  const lastMessage = messages[messages.length - 1];
  const hasMentions = lastMessage && lastMessage.content.includes("@");

  if (schemaCache) {
    let schemaContext: string | null = null;

    if (isFirstMessage) {
      schemaContext = buildFullSchemaContext(schemaCache);
    } else if (hasMentions) {
      const mentionedItems = extractMentions(lastMessage.content);
      schemaContext = buildSchemaContext(mentionedItems, schemaCache);
    } else {
      schemaContext = buildDatabaseSummary(schemaCache);
    }

    if (schemaContext) {
      console.log("📊 Sending schema context to AI:", {
        isFirstMessage,
        hasMentions,
        contextLength: schemaContext.length,
        contextPreview: schemaContext.substring(0, 500) + "...",
      });
      systemMessages.push({
        role: "system",
        content: `DATABASE SCHEMA CONTEXT:\n\n${schemaContext}`,
      });
    } else {
      console.warn("⚠️ No schema context generated for AI");
    }
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

// Extract @mentions from text
function extractMentions(text: string): string[] {
  const mentionRegex = /@([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)?)/g;
  const matches = text.match(mentionRegex);
  return matches
    ? matches.map((m) => {
        // Remove @ and clean the mention
        const mention = m.substring(1);
        if (mention.includes(".")) {
          // For database.table format, clean the database part
          const [db, table] = mention.split(".");
          return `${QuerySanitizer.cleanDatabaseName(db)}.${table}`;
        }
        return QuerySanitizer.cleanDatabaseName(mention);
      })
    : [];
}

// Build full schema context for first message
function buildFullSchemaContext(schemaCache: any): string {
  if (!schemaCache?.databases) return "";

  const contextParts: string[] = [];
  contextParts.push("📊 AVAILABLE DATABASES AND TABLES:");
  contextParts.push("");

  // Add all databases and their tables
  Object.entries(schemaCache.databases).forEach(
    ([dbName, dbData]: [string, any]) => {
      contextParts.push(`Database: ${dbName}`);
      contextParts.push(
        `Tables (${dbData.tables.length}): ${dbData.tables.join(", ")}`
      );
      contextParts.push("");
    }
  );

  contextParts.push("💡 SCHEMA DETAILS:");
  contextParts.push("");

  // Add detailed schema for each table
  Object.entries(schemaCache.databases).forEach(
    ([dbName, dbData]: [string, any]) => {
      if (dbData.schemas) {
        Object.entries(dbData.schemas).forEach(
          ([tableName, columns]: [string, any]) => {
            if (columns && columns.length > 0) {
              contextParts.push(`Table: ${dbName}.${tableName}`);
              contextParts.push("Columns:");
              columns.forEach((col: any) => {
                const keyInfo = col.key ? ` [${col.key}]` : "";
                const nullInfo = col.null === "NO" ? " NOT NULL" : "";
                contextParts.push(
                  `  - ${col.column_name} (${col.column_type})${keyInfo}${nullInfo}`
                );
              });
              contextParts.push("");
            }
          }
        );
      }
    }
  );

  return contextParts.join("\n");
}

// Build schema context for mentioned items
function buildSchemaContext(
  mentions: string[],
  schemaCache: any
): string | null {
  if (!mentions.length || !schemaCache?.databases) return null;

  const contextParts: string[] = [];

  mentions.forEach((mention) => {
    // Check if it's a database mention
    if (schemaCache.databases[mention]) {
      const db = schemaCache.databases[mention];
      contextParts.push(`Database: ${mention}`);
      contextParts.push(`Tables: ${db.tables.join(", ")}`);
      contextParts.push("");
    }

    // Check if it's a table mention (format: database.table)
    const [dbName, tableName] = mention.split(".");
    if (
      dbName &&
      tableName &&
      schemaCache.databases[dbName]?.schemas?.[tableName]
    ) {
      const columns = schemaCache.databases[dbName].schemas[tableName];
      contextParts.push(`Table: ${mention}`);
      contextParts.push("Columns:");
      columns.forEach((col: any) => {
        contextParts.push(
          `  - ${col.column_name} (${col.column_type})${
            col.key ? ` [${col.key}]` : ""
          }`
        );
      });
      contextParts.push("");
    } else if (!mention.includes(".")) {
      // Check if it's a standalone table name (search in all databases)
      Object.entries(schemaCache.databases).forEach(
        ([dbName, dbData]: [string, any]) => {
          if (dbData.schemas?.[mention]) {
            const columns = dbData.schemas[mention];
            contextParts.push(`Table: ${dbName}.${mention}`);
            contextParts.push("Columns:");
            columns.forEach((col: any) => {
              contextParts.push(
                `  - ${col.column_name} (${col.column_type})${
                  col.key ? ` [${col.key}]` : ""
                }`
              );
            });
            contextParts.push("");
          }
        }
      );
    }
  });

  return contextParts.length > 0 ? contextParts.join("\n") : null;
}

// Build database summary for subsequent messages without mentions
function buildDatabaseSummary(schemaCache: any): string {
  if (!schemaCache?.databases) return "";

  const contextParts: string[] = [];
  contextParts.push("📊 AVAILABLE DATABASES AND TABLES:");
  contextParts.push("");

  // List all databases with their tables
  Object.entries(schemaCache.databases).forEach(
    ([dbName, dbData]: [string, any]) => {
      contextParts.push(`Database: ${dbName}`);
      if (dbData.tables && dbData.tables.length > 0) {
        contextParts.push(`Tables: ${dbData.tables.join(", ")}`);
      }
      contextParts.push("");
    }
  );

  contextParts.push(
    "💡 Use @database.table to get detailed column schema for specific tables."
  );
  contextParts.push("");

  return contextParts.join("\n");
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
  const proposalMatches = processedContent.matchAll(
    /\`\`\`proposal\n([\s\S]*?)\`\`\`/g
  );
  for (const match of proposalMatches) {
    try {
      let artifact = JSON.parse(match[1]);
      if ((artifact.type === "query_proposal" || artifact.type === "chart_proposal") && artifact.query) {
        // Sanitize the proposal
        artifact = QuerySanitizer.sanitizeQueryArtifact(artifact);

        const proposalArtifact = {
          id: `proposal_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 9)}`,
          type: "proposal" as const,
          title: artifact.title || (artifact.type === "chart_proposal" ? "Chart Proposal" : "Query Proposal"),
          data: artifact,
        };

        // Don't enhance proposal artifacts - they're just proposals
        artifacts.push(proposalArtifact);
      }
    } catch (error) {
      console.error("Failed to parse proposal artifact:", error);
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
  cleanContent = cleanContent.replace(/\{[^}]*"type"\s*:\s*"[^"]*"[^}]*\}/g, (match) => {
    // Check if this looks like an artifact object that was accidentally included
    if (match.includes('"query"') || match.includes('"chart_type"') || match.includes('"title"')) {
      return ""; // Remove it
    }
    return match; // Keep other objects
  });
  
  cleanContent = cleanContent.trim();


  return {
    content: cleanContent || processedContent, // Fall back to processedContent if nothing left
    artifacts: artifacts.length > 0 ? artifacts : undefined,
    thinking: thinking.trim() || undefined,
  };
}
