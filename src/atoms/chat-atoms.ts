/**
 * Redesigned Chat Atoms
 *
 * Simplified state management for the chat system.
 * Each chat session is self-contained with its own context.
 */

import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import axios from "axios";
import type {
  ChatSession,
  AIConnection,
  ChatContext,
  ChatMessage,
  CreateSessionOptions,
  SendMessageOptions,
  ColumnSchema,
} from "@/types/chat.types";
import { buildAIContext, processAIResponse } from "@/lib/ai-context-builder";
import { apiUrlAtom } from "./connection-atoms";
import { tablesListForAIAtom } from "./database-atoms";

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

// Get active connection ID (first active connection)
export const activeConnectionIdAtom = atom((get) => {
  const connections = get(aiConnectionsAtom);
  const activeConnection = connections.find((c) => c.isActive === true);
  return activeConnection?.id || null;
});

// Get active connection
export const activeConnectionAtom = atom((get) => {
  const connections = get(aiConnectionsAtom);
  return connections.find((c) => c.isActive === true) || null;
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
      model: "", // Model will be selected in ChatContextSheet
      title: options.title || "New Chat",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      connection,
      context: {
        databases: {
          selected: [],
          includeAll: false,
        },
        tables: {},
        schemas: {},
        instructions: {
          system:
            "You are an AI assistant for GigAPI, a next-gen observability tool.",
          user: [],
          active: [],
        },
        ...options.context,
      },
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

// Update session context
export const updateSessionContextAtom = atom(
  null,
  (get, set, sessionId: string, context: ChatContext) => {
    const sessions = get(chatSessionsAtom);
    const session = sessions[sessionId];

    if (!session) {
      throw new Error("Session not found");
    }

    set(chatSessionsAtom, {
      ...sessions,
      [sessionId]: {
        ...session,
        context,
        updatedAt: new Date().toISOString(),
      },
    });
  }
);

// Send message
export const sendMessageAtom = atom(
  null,
  async (get, set, options: SendMessageOptions) => {
    const sessions = get(chatSessionsAtom);
    const session = sessions[options.sessionId];

    if (!session) {
      throw new Error("Session not found");
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: options.message,
      timestamp: new Date().toISOString(),
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

    try {
      // Build context
      const context = await buildContext(session);

      // Send to AI
      const response = await sendToAI(
        session.connection,
        context,
        updatedSession.messages,
        session
      );

      // Process AI response to extract artifacts
      const processedResponse = processAIResponse(response.content);

      // Add assistant message
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_assistant`,
        role: "assistant",
        content: processedResponse.content,
        timestamp: new Date().toISOString(),
        metadata: {
          artifacts: processedResponse.artifacts,
        },
      };

      // Update session with assistant message
      const finalSession = {
        ...updatedSession,
        messages: [...updatedSession.messages, assistantMessage],
        updatedAt: new Date().toISOString(),
      };

      set(chatSessionsAtom, {
        ...sessions,
        [options.sessionId]: finalSession,
      });
    } catch (error) {
      // Add error message
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
        ...sessions,
        [options.sessionId]: {
          ...updatedSession,
          messages: [...updatedSession.messages, errorMessage],
        },
      });

      throw error;
    }
  }
);

// Update session connection and model
export const updateSessionConnectionAtom = atom(
  null,
  async (get, set, sessionId: string, connectionId: string, model: string) => {
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

    // Update session with new connection and model
    const updatedSession: ChatSession = {
      ...session,
      connection,
      aiConnectionId: connectionId,
      model,
      updatedAt: new Date().toISOString(),
    };

    set(chatSessionsAtom, {
      ...sessions,
      [sessionId]: updatedSession,
    });
  }
);

// Fetch available models for a connection (mainly for Ollama)
export const fetchModelsForConnectionAtom = atom(
  null,
  async (get, _set, connectionId: string) => {
    const connections = get(aiConnectionsAtom);
    const connection = connections.find((c) => c.id === connectionId);

    if (!connection) {
      throw new Error("Connection not found");
    }

    // Handle different providers for model fetching
    if (!connection.modelsUrl) {
      return [];
    }

    try {
      // Use the modelsUrl from the connection
      const modelsEndpoint = connection.modelsUrl;

      const response = await fetch(modelsEndpoint, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...connection.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json();

      let models: string[] = [];

      if (data.data) {
        models = data.data.map((m: any) => m.id) || [];
      } else if (data.models) {
        // Generic format with models array
        models = data.models.map((m: any) => m.name || m.id) || [];
      }

      return models;
    } catch (error) {
      console.error("Failed to fetch models:", error);
      throw error;
    }
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

// ============================================================================
// Schema Fetching Atoms
// ============================================================================

// Helper function to fetch table schema
async function fetchTableSchema(
  apiUrl: string,
  database: string,
  table: string
): Promise<ColumnSchema[]> {
  try {
    const response = await axios.post(`${apiUrl}?db=${database}&format=json`, {
      query: `DESCRIBE SELECT * FROM ${table} LIMIT 1`,
    });
    return response.data.results || [];
  } catch (error) {
    console.error(`Failed to fetch schema for ${database}.${table}:`, error);
    throw error;
  }
}

// Fetch all schemas for a session
export const fetchAllSchemasAtom = atom(
  null,
  async (get, set, sessionId: string) => {
    const sessions = get(chatSessionsAtom);
    const session = sessions[sessionId];

    if (!session) {
      throw new Error("Session not found");
    }

    const schemas: Record<string, Record<string, ColumnSchema[]>> = {};
    const errors: string[] = [];

    // Get all available tables from an external atom
    const allTables = get(tablesListForAIAtom);

    // Fetch schemas for all selected tables
    for (const db of session.context.databases.selected) {
      schemas[db] = schemas[db] || {};

      // Determine which tables to fetch schemas for
      let tablesToFetch: string[] = [];

      if (session.context.tables[db]?.includeAll) {
        // Include all tables from this database
        tablesToFetch = allTables[db] || [];
      } else if (session.context.tables[db]?.selected?.length > 0) {
        // Include only selected tables
        tablesToFetch = session.context.tables[db].selected;
      } else if (!session.context.tables[db]) {
        // If no table config exists, fetch all tables (backward compatibility)
        tablesToFetch = allTables[db] || [];
      }

      for (const table of tablesToFetch) {
        try {
          const apiUrl = get(apiUrlAtom);
          const schema = await fetchTableSchema(apiUrl, db, table);
          schemas[db][table] = schema;
        } catch (error) {
          const errorMsg = `Failed to fetch schema for ${db}.${table}`;
          console.error(errorMsg, error);
          errors.push(errorMsg);
        }
      }
    }

    // Update session context with schemas
    set(chatSessionsAtom, {
      ...sessions,
      [sessionId]: {
        ...session,
        context: {
          ...session.context,
          schemas,
        },
        updatedAt: new Date().toISOString(),
      },
    });

    return { schemas, errors };
  }
);

// ============================================================================
// Helper Functions
// ============================================================================

async function buildContext(session: ChatSession): Promise<string> {
  return buildAIContext(session.context);
}

async function sendToAI(
  connection: AIConnection,
  context: string,
  messages: ChatMessage[],
  session: ChatSession
): Promise<any> {
  // Map messages to AI format
  const aiMessages = [
    { role: "system", content: context },
    ...messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  ];

  // Build the correct endpoint URL based on provider
  let endpoint = connection.baseUrl || "";

  if (!endpoint) {
    throw new Error("No endpoint URL configured for AI connection");
  }

  // If endpoint doesn't already include the chat path, add it
  if (!endpoint.includes("/chat") && !endpoint.includes("/v1/chat")) {
    if (connection.provider === "openai" || endpoint.includes("openai.com")) {
      endpoint = endpoint.endsWith("/")
        ? endpoint + "chat/completions"
        : endpoint + "/chat/completions";
    } else if (
      connection.provider === "ollama" ||
      endpoint.includes("localhost") ||
      endpoint.includes("11434")
    ) {
      endpoint = endpoint.endsWith("/")
        ? endpoint + "api/chat"
        : endpoint + "/api/chat";
    } else if (
      connection.provider === "anthropic" ||
      endpoint.includes("anthropic.com")
    ) {
      endpoint = endpoint.endsWith("/")
        ? endpoint + "messages"
        : endpoint + "/messages";
    } else {
      // Default to OpenAI format for custom providers
      endpoint = endpoint.endsWith("/")
        ? endpoint + "chat/completions"
        : endpoint + "/chat/completions";
    }
  }

  // Get model from the session
  const model = session.model;

  if (!model) {
    throw new Error("No model selected for this chat session");
  }

  // Build request body based on provider
  let requestBody: any = {
    model: model,
    messages: aiMessages,
    stream: false,
  };

  // Anthropic has a different format
  if (connection.provider === "anthropic") {
    requestBody = {
      model: model,
      messages: aiMessages.filter((msg) => msg.role !== "system"),
      system: context,
      max_tokens: 4096,
    };
  }

  // Send to AI provider
  const response = await axios.post(endpoint, requestBody, {
    headers: connection.headers,
  });

  // Parse response based on provider
  let content = "";

  if (connection.provider === "openai") {
    content = response.data.choices[0].message.content;
  } else if (connection.provider === "anthropic") {
    content = response.data.content[0].text;
  } else if (connection.provider === "ollama") {
    // Ollama format
    content = response.data.message?.content || response.data.content || "";
  } else {
    // Generic format - try different response structures
    if (response.data.choices?.[0]?.message?.content) {
      content = response.data.choices[0].message.content;
    } else if (response.data.message?.content) {
      content = response.data.message.content;
    } else if (response.data.content) {
      content = response.data.content;
    }
  }

  return { content };
}
