import { atom } from "jotai";
import { useAtom, useSetAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { toast } from "sonner";
import { buildEnhancedDataContext, extractChartArtifact, extractSQLQuery } from "@/lib/ai-instructions";
import type { MCPConnection, ChatMessage, ChatSession, MCPServerCapabilities } from "@/types";

// Storage keys for localStorage
const MCP_STORAGE_KEYS = {
  CHAT_SESSIONS: "ai_chats",
  ACTIVE_SESSION: "ai_active_session", 
  CONNECTIONS: "ai_connections",
  ACTIVE_CONNECTION: "ai_active_connection",
} as const;

// Connection state atoms with localStorage persistence
export const connectionsAtom = atomWithStorage<MCPConnection[]>(MCP_STORAGE_KEYS.CONNECTIONS, []);
export const activeConnectionIdAtom = atomWithStorage<string | null>(MCP_STORAGE_KEYS.ACTIVE_CONNECTION, null);

// Chat session atoms with localStorage persistence
export const chatSessionsAtom = atomWithStorage<ChatSession[]>(
  MCP_STORAGE_KEYS.CHAT_SESSIONS, 
  [],
  {
    getItem: (key) => {
      const stored = localStorage.getItem(key);
      if (!stored) return [];
      try {
        const sessions = JSON.parse(stored);
        // Ensure all sessions have required fields
        return sessions.filter((s: any) => s.id && s.title && s.messages).map((s: any) => ({
          id: s.id || crypto.randomUUID(),
          title: s.title || 'Untitled Chat',
          messages: s.messages || [],
          createdAt: s.createdAt || new Date().toISOString(),
          updatedAt: s.updatedAt || new Date().toISOString(),
          modelUsed: s.modelUsed,
          context: s.context
        }));
      } catch {
        return [];
      }
    },
    setItem: (key, value) => {
      localStorage.setItem(key, JSON.stringify(value));
    },
    removeItem: (key) => {
      localStorage.removeItem(key);
    }
  }
);
export const activeSessionIdAtom = atomWithStorage<string | null>(MCP_STORAGE_KEYS.ACTIVE_SESSION, null);

// Custom instructions atoms
export const customInstructionsAtom = atom<any[]>([]);

// MCP initialization state
export const mcpInitializedAtom = atom<boolean>(false);

// Runtime state atoms
export const mcpLoadingAtom = atom<boolean>(false);
export const mcpErrorAtom = atom<string | null>(null);
export const abortControllerAtom = atom<AbortController | null>(null);

// Derived atoms
export const activeConnectionAtom = atom((get) => {
  const connections = get(connectionsAtom);
  const activeId = get(activeConnectionIdAtom);
  return activeId ? connections.find(c => c.id === activeId) || null : null;
});

export const activeSessionAtom = atom((get) => {
  const sessions = get(chatSessionsAtom);
  const activeId = get(activeSessionIdAtom);
  return activeId ? sessions.find(s => s.id === activeId) || null : null;
});

export const isMCPConnectedAtom = atom((get) => {
  const activeConnection = get(activeConnectionAtom);
  return activeConnection?.isConnected || false;
});

// Default capabilities
export const capabilitiesAtom = atom<MCPServerCapabilities>({
  queryGeneration: true,
  dataAnalysis: true,
  chartSuggestions: true,
  naturalLanguageToSQL: true,
  sqlOptimization: true,
});

// Helper function to get base URL
const getBaseUrl = (connection: MCPConnection): string => {
  return connection.baseUrl;
};

// Helper function to get headers
const getHeaders = (connection: MCPConnection): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (connection.headers) {
    Object.assign(headers, connection.headers);
  }

  return headers;
};

// Connection management actions
export const addConnectionAtom = atom(
  null,
  async (get, set, connectionData: Omit<MCPConnection, "id" | "isConnected">) => {
    const connections = get(connectionsAtom);
    const newConnection: MCPConnection = {
      ...connectionData,
      id: `mcp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      isConnected: true, // Assume connected since it was tested
    };

    const updatedConnections = [...connections, newConnection];
    set(connectionsAtom, updatedConnections);
    
    // Set as active connection
    set(activeConnectionIdAtom, newConnection.id);
    
    toast.success(`Connected to ${newConnection.name}`);
    return newConnection;
  }
);

export const removeConnectionAtom = atom(
  null,
  (get, set, connectionId: string) => {
    const connections = get(connectionsAtom);
    const activeId = get(activeConnectionIdAtom);
    
    const updatedConnections = connections.filter(c => c.id !== connectionId);
    set(connectionsAtom, updatedConnections);
    
    if (activeId === connectionId) {
      const newActive = updatedConnections.length > 0 ? updatedConnections[0].id : null;
      set(activeConnectionIdAtom, newActive);
    }
    
    toast.success("Connection removed");
  }
);

export const setActiveConnectionAtom = atom(
  null,
  (get, set, connectionId: string | null) => {
    if (!connectionId) {
      set(activeConnectionIdAtom, null);
      return;
    }

    const connections = get(connectionsAtom);
    const connection = connections.find(c => c.id === connectionId);
    
    if (connection) {
      const updatedConnection = { ...connection, lastUsed: new Date().toISOString() };
      const updatedConnections = connections.map(c => 
        c.id === connectionId ? updatedConnection : c
      );
      
      set(connectionsAtom, updatedConnections);
      set(activeConnectionIdAtom, connectionId);
    }
  }
);

export const testConnectionAtom = atom(
  null,
  async (get, set, connectionId: string): Promise<boolean> => {
    const connections = get(connectionsAtom);
    const connection = connections.find(c => c.id === connectionId);
    
    if (!connection) return false;

    set(mcpLoadingAtom, true);
    
    try {
      // Cancel any previous request
      const abortController = get(abortControllerAtom);
      if (abortController) {
        abortController.abort();
      }

      const controller = new AbortController();
      set(abortControllerAtom, controller);

      const baseUrl = getBaseUrl(connection);
      const headers = getHeaders(connection);
      const url = new URL(`${baseUrl}/api/tags`);
      
      // Add query parameters if provided
      if (connection.params) {
        Object.entries(connection.params).forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      const isValid = response.ok;
      
      // Update connection status
      const updatedConnections = connections.map(c => 
        c.id === connectionId ? { ...c, isConnected: isValid } : c
      );
      set(connectionsAtom, updatedConnections);
      
      return isValid;
    } catch (err: any) {
      if (err.name === 'AbortError') return false;
      console.error("Connection test failed:", err);
      return false;
    } finally {
      set(mcpLoadingAtom, false);
    }
  }
);

// Chat session management actions
export const createChatSessionAtom = atom(
  null,
  (get, set, title?: string): string => {
    const sessions = get(chatSessionsAtom);
    const activeConnection = get(activeConnectionAtom);
    
    // Import database and schema data from other atoms
    const selectedDb = localStorage.getItem("gigapi_selected_db") || "";
    const selectedTable = localStorage.getItem("gigapi_selected_table") || "";
    
    const session: ChatSession = {
      id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      title: title || `Chat ${sessions.length + 1}`,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      modelUsed: activeConnection?.model || "unknown",
      context: {
        currentDatabase: selectedDb || undefined,
        currentTable: selectedTable || undefined,
        availableSchema: {}, // Will be populated from schema atoms if needed
      },
    };

    const updatedSessions = [session, ...sessions];
    set(chatSessionsAtom, updatedSessions);
    set(activeSessionIdAtom, session.id);
    
    return session.id;
  }
);

export const switchChatSessionAtom = atom(
  null,
  (get, set, sessionId: string) => {
    const sessions = get(chatSessionsAtom);
    const session = sessions.find(s => s.id === sessionId);
    
    if (session) {
      set(activeSessionIdAtom, sessionId);
    }
  }
);

export const deleteChatSessionAtom = atom(
  null,
  (get, set, sessionId: string) => {
    const sessions = get(chatSessionsAtom);
    const activeId = get(activeSessionIdAtom);
    
    const updatedSessions = sessions.filter(s => s.id !== sessionId);
    set(chatSessionsAtom, updatedSessions);
    
    if (activeId === sessionId) {
      const newActiveId = updatedSessions.length > 0 ? updatedSessions[0].id : null;
      set(activeSessionIdAtom, newActiveId);
    }
  }
);

export const renameChatSessionAtom = atom(
  null,
  (get, set, sessionId: string, newTitle: string) => {
    const sessions = get(chatSessionsAtom);
    
    const updatedSessions = sessions.map(s => 
      s.id === sessionId ? { ...s, title: newTitle, updatedAt: new Date().toISOString() } : s
    );
    set(chatSessionsAtom, updatedSessions);
    
    toast.success("Chat renamed successfully");
  }
);

// Initialize MCP action
export const initializeMCPAtom = atom(
  null,
  async (_get, set) => {
    try {
      // MCP initialization logic
      set(mcpInitializedAtom, true);
    } catch (error) {
      console.error("Failed to initialize MCP:", error);
      set(mcpInitializedAtom, true); // Set to true anyway to prevent infinite loops
    }
  }
);

// Build data context using ai-instructions
const buildDataContextForRequest = (get: any) => {
  const selectedDb = localStorage.getItem("gigapi_selected_db") || "";
  const selectedTable = localStorage.getItem("gigapi_selected_table") || "";
  const customInstructions = get(customInstructionsAtom);
  
  // Use the enhanced context builder that includes AI schema data
  return buildEnhancedDataContext(
    selectedDb,
    selectedTable,
    customInstructions
  );
};

// Send message to AI
export const sendMessageAtom = atom(
  null,
  async (get, set, content: string) => {
    const activeConnection = get(activeConnectionAtom);
    const isConnected = get(isMCPConnectedAtom);
    
    if (!activeConnection || !isConnected) {
      toast.error("No active AI connection");
      return;
    }

    let currentSession = get(activeSessionAtom);
    if (!currentSession) {
      // Create a new session if none exists
      const newSessionId = set(createChatSessionAtom, "New Chat");
      // Get the newly created session
      const updatedSessions = get(chatSessionsAtom);
      currentSession = updatedSessions.find(s => s.id === newSessionId) || null;
      if (!currentSession) {
        throw new Error('Unable to create chat session');
      }
    }

    set(mcpLoadingAtom, true);
    set(mcpErrorAtom, null);

    // Add user message
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...currentSession!.messages, userMessage];
    const updatedSession = { 
      ...currentSession, 
      messages: updatedMessages,
      updatedAt: new Date().toISOString(),
    };
    
    // Update sessions with user message immediately
    const sessions = get(chatSessionsAtom);
    const updatedSessions = sessions.map(s => 
      s.id === currentSession!.id ? updatedSession as ChatSession : s
    );
    set(chatSessionsAtom, updatedSessions);

    try {
      // Cancel any previous request
      const abortController = get(abortControllerAtom);
      if (abortController) {
        abortController.abort();
      }

      const controller = new AbortController();
      set(abortControllerAtom, controller);

      const baseUrl = getBaseUrl(activeConnection);
      const headers = getHeaders(activeConnection);
      const dataContext = buildDataContextForRequest(get);
      
      console.log('[MCP] Data context preview:', dataContext.substring(0, 500));
      
      // Build the request based on provider
      const messages = [
        {
          role: 'system',
          content: dataContext,
        },
        ...updatedMessages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
      ];

      // Build endpoint - detect the correct endpoint based on base URL
      let endpoint = baseUrl;
      
      if (!endpoint.includes('/chat') && !endpoint.includes('/api/chat') && !endpoint.includes('/v1/chat')) {
        // For OpenAI-compatible APIs
        if (endpoint.includes('openai.com') || endpoint.includes('api.openai.com')) {
          endpoint = endpoint.endsWith('/') ? endpoint + 'chat/completions' : endpoint + '/chat/completions';
        }
        // For Ollama
        else if (endpoint.includes('localhost') || endpoint.includes('127.0.0.1') || endpoint.includes('ollama')) {
          endpoint = endpoint.endsWith('/') ? endpoint + 'api/chat' : endpoint + '/api/chat';
        }
        // Default to OpenAI-compatible format for other providers
        else {
          endpoint = endpoint.endsWith('/') ? endpoint + 'chat/completions' : endpoint + '/chat/completions';
        }
      }
      
      // Add query parameters if provided
      if (activeConnection.params) {
        const url = new URL(endpoint);
        Object.entries(activeConnection.params).forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });
        endpoint = url.toString();
      }

      const requestBody = {
        model: activeConnection.model,
        messages,
        stream: false,
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`AI request failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Parse response content from different AI providers
      let assistantContent: string;
      
      // Try OpenAI format first (choices[0].message.content)
      if (data.choices?.[0]?.message?.content) {
        assistantContent = data.choices[0].message.content;
      }
      // Try Ollama format (message.content)
      else if (data.message?.content) {
        assistantContent = data.message.content;
      }
      // Try Anthropic format (content[0].text)
      else if (data.content?.[0]?.text) {
        assistantContent = data.content[0].text;
      }
      // Try generic content field
      else if (data.content) {
        assistantContent = data.content;
      }
      else {
        console.error("Unexpected response format:", data);
        assistantContent = "Error: AI provider returned unexpected response format";
      }
      
      // Extract SQL query and chart artifacts using ai-instructions
      const generatedQuery = extractSQLQuery(assistantContent);
      const chartArtifact = extractChartArtifact(assistantContent);

      // Add assistant message
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date().toISOString(),
        metadata: {
          queryGenerated: generatedQuery,
          chartArtifact: chartArtifact,
          dataContext: {
            database: localStorage.getItem("gigapi_selected_db") || undefined,
            table: localStorage.getItem("gigapi_selected_table") || undefined,
            timeRange: JSON.parse(localStorage.getItem("gigapi_time_range") || "null"),
          },
        },
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      const finalSession = {
        ...updatedSession,
        messages: finalMessages,
        updatedAt: new Date().toISOString(),
      };

      // Update sessions with final session including AI response
      const finalUpdatedSessions = sessions.map(s => 
        s.id === currentSession!.id ? finalSession as ChatSession : s
      );
      set(chatSessionsAtom, finalUpdatedSessions);

    } catch (err: any) {
      if (err.name === 'AbortError') return;
      
      console.error("AI request failed:", err);
      const errorMessage = err.message || "Failed to send message";
      set(mcpErrorAtom, errorMessage);
      toast.error(`AI request failed: ${errorMessage}`);
    } finally {
      set(mcpLoadingAtom, false);
    }
  }
);

// AI capability actions
export const generateQueryAtom = atom(
  null,
  async (get, _set, prompt: string): Promise<string> => {
    const activeConnection = get(activeConnectionAtom);
    const isConnected = get(isMCPConnectedAtom);
    
    if (!activeConnection || !isConnected) {
      throw new Error("No active AI connection");
    }
    
    const selectedTable = localStorage.getItem("gigapi_selected_table") || "your_table";
    return `-- Generated query for: ${prompt}\nSELECT * FROM ${selectedTable} LIMIT 10;`;
  }
);

export const analyzeDataAtom = atom(
  null,
  async (get, _set, { data, prompt }: { data: any[]; prompt: string }): Promise<string> => {
    const activeConnection = get(activeConnectionAtom);
    const isConnected = get(isMCPConnectedAtom);
    
    if (!activeConnection || !isConnected) {
      throw new Error("No active AI connection");
    }

    return `Analysis for: ${prompt}\n\nData contains ${data.length} rows with interesting patterns...`;
  }
);

export const optimizeQueryAtom = atom(
  null,
  async (get, _set, query: string): Promise<string> => {
    const activeConnection = get(activeConnectionAtom);
    const isConnected = get(isMCPConnectedAtom);
    
    if (!activeConnection || !isConnected) {
      throw new Error("No active AI connection");
    }

    return `-- Optimized version of your query\n${query}\n-- Consider adding indexes on frequently queried columns`;
  }
);

// Custom instructions actions
export const addCustomInstructionAtom = atom(
  null,
  (get, set, instruction: any) => {
    const instructions = get(customInstructionsAtom);
    const newInstruction = {
      ...instruction,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true
    };
    set(customInstructionsAtom, [...instructions, newInstruction]);
    return newInstruction;
  }
);

export const deleteCustomInstructionAtom = atom(
  null,
  (get, set, instructionId: string) => {
    const instructions = get(customInstructionsAtom);
    set(customInstructionsAtom, instructions.filter(i => i.id !== instructionId));
  }
);

export const toggleCustomInstructionAtom = atom(
  null,
  (get, set, instructionId: string) => {
    const instructions = get(customInstructionsAtom);
    const updatedInstructions = instructions.map(i => 
      i.id === instructionId ? { ...i, isActive: !i.isActive, updatedAt: new Date().toISOString() } : i
    );
    set(customInstructionsAtom, updatedInstructions);
  }
);

export const updateCustomInstructionAtom = atom(
  null,
  (get, set, updatedInstruction: any) => {
    const instructions = get(customInstructionsAtom);
    const updatedInstructions = instructions.map(i => 
      i.id === updatedInstruction.id ? { ...updatedInstruction, updatedAt: new Date().toISOString() } : i
    );
    set(customInstructionsAtom, updatedInstructions);
  }
);

// useMCP hook
export function useMCP() {
  const [connections] = useAtom(connectionsAtom);
  const [activeConnection] = useAtom(activeConnectionAtom);
  const [chatSessions] = useAtom(chatSessionsAtom);
  const [activeSession] = useAtom(activeSessionAtom);
  const [customInstructions] = useAtom(customInstructionsAtom);
  const [isLoading] = useAtom(mcpLoadingAtom);
  const [error] = useAtom(mcpErrorAtom);
  const [isConnected] = useAtom(isMCPConnectedAtom);
  const [capabilities] = useAtom(capabilitiesAtom);
  const [isInitialized] = useAtom(mcpInitializedAtom);
  
  const addConnection = useSetAtom(addConnectionAtom);
  const removeConnection = useSetAtom(removeConnectionAtom);
  const setActiveConnection = useSetAtom(setActiveConnectionAtom);
  const testConnection = useSetAtom(testConnectionAtom);
  const createChatSession = useSetAtom(createChatSessionAtom);
  const switchChatSession = useSetAtom(switchChatSessionAtom);
  const deleteChatSession = useSetAtom(deleteChatSessionAtom);
  const renameChatSession = useSetAtom(renameChatSessionAtom);
  const sendMessage = useSetAtom(sendMessageAtom);
  const generateQuery = useSetAtom(generateQueryAtom);
  const analyzeData = useSetAtom(analyzeDataAtom);
  const optimizeQuery = useSetAtom(optimizeQueryAtom);
  const addCustomInstruction = useSetAtom(addCustomInstructionAtom);
  const deleteCustomInstruction = useSetAtom(deleteCustomInstructionAtom);
  const toggleCustomInstruction = useSetAtom(toggleCustomInstructionAtom);
  const updateCustomInstruction = useSetAtom(updateCustomInstructionAtom);
  const initializeMCP = useSetAtom(initializeMCPAtom);
  
  return {
    // Connection management
    connections,
    activeConnection,
    addConnection,
    removeConnection,
    testConnection,
    setActiveConnection,
    
    // Chat functionality
    chatSessions,
    activeSession,
    createChatSession,
    switchChatSession,
    deleteChatSession,
    renameChatSession,
    sendMessage,
    
    // Custom instructions
    customInstructions,
    addCustomInstruction,
    deleteCustomInstruction,
    toggleCustomInstruction,
    updateCustomInstruction,
    
    // AI capabilities
    generateQuery,
    analyzeData,
    optimizeQuery,
    
    // State
    isConnected,
    isLoading,
    error,
    capabilities,
    isInitialized,
    
    // Actions
    initializeMCP,
  };
}