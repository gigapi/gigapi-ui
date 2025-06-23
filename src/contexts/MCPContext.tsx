import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import type {
  MCPConnection,
  ChatMessage,
  ChatSession,
  MCPServerCapabilities,
  MCPContextType,
} from "@/types";
import { useDatabase } from "@/contexts/DatabaseContext";
import { useTime } from "@/contexts/TimeContext";

// Storage keys
const MCP_STORAGE_KEYS = {
  CHAT_SESSIONS: "ai_chats",
  ACTIVE_SESSION: "ai_active_session",
  CONNECTIONS: "ai_connections",
  ACTIVE_CONNECTION: "ai_active_connection",
} as const;

const MCPContext = createContext<MCPContextType | undefined>(undefined);

export function MCPProvider({ children }: { children: ReactNode }) {
  const {
    selectedDb,
    selectedTable,
    schema,
  } = useDatabase();

  const { timeRange } = useTime();

  // State management - connections are persisted for Ollama
  const [connections, setConnections] = useState<MCPConnection[]>(() => {
    try {
      const saved = localStorage.getItem(MCP_STORAGE_KEYS.CONNECTIONS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeConnection, setActiveConnectionState] = useState<MCPConnection | null>(() => {
    try {
      const savedId = localStorage.getItem(MCP_STORAGE_KEYS.ACTIVE_CONNECTION);
      if (savedId) {
        const saved = localStorage.getItem(MCP_STORAGE_KEYS.CONNECTIONS);
        const connections = saved ? JSON.parse(saved) : [];
        return connections.find((c: MCPConnection) => c.id === savedId) || null;
      }
    } catch {}
    return null;
  });

  const [chatSessions, setChatSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem(MCP_STORAGE_KEYS.CHAT_SESSIONS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeSession, setActiveSession] = useState<ChatSession | null>(() => {
    try {
      const savedId = localStorage.getItem(MCP_STORAGE_KEYS.ACTIVE_SESSION);
      if (savedId && chatSessions.length > 0) {
        return chatSessions.find(s => s.id === savedId) || chatSessions[0];
      }
    } catch {}
    return null;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Refs for abort controllers
  const abortControllerRef = useRef<AbortController | null>(null);

  // Default capabilities - these would be detected from the actual MCP server
  const capabilities: MCPServerCapabilities = {
    queryGeneration: true,
    dataAnalysis: true,
    chartSuggestions: true,
    naturalLanguageToSQL: true,
    sqlOptimization: true,
  };

  // Computed properties
  const isConnected = activeConnection?.isConnected || false;

  // Save connections to localStorage (safe for Ollama since no API keys)
  const saveConnections = useCallback((connections: MCPConnection[]) => {
    try {
      localStorage.setItem(MCP_STORAGE_KEYS.CONNECTIONS, JSON.stringify(connections));
    } catch (e) {
      console.error("Failed to save connections", e);
    }
  }, []);

  // Save active connection to localStorage
  const saveActiveConnection = useCallback((connectionId: string | null) => {
    try {
      if (connectionId) {
        localStorage.setItem(MCP_STORAGE_KEYS.ACTIVE_CONNECTION, connectionId);
      } else {
        localStorage.removeItem(MCP_STORAGE_KEYS.ACTIVE_CONNECTION);
      }
    } catch (e) {
      console.error("Failed to save active connection", e);
    }
  }, []);

  // Save chat sessions to localStorage
  const saveChatSessions = useCallback((sessions: ChatSession[]) => {
    try {
      localStorage.setItem(MCP_STORAGE_KEYS.CHAT_SESSIONS, JSON.stringify(sessions.slice(0, 50))); // Keep last 50 sessions
    } catch (e) {
      console.error("Failed to save chat sessions", e);
    }
  }, []);

  // Add a new MCP connection
  const addConnection = useCallback(async (connectionData: Omit<MCPConnection, "id" | "isConnected">) => {
    const newConnection: MCPConnection = {
      ...connectionData,
      id: `mcp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      isConnected: true, // Assume it's connected since it was tested in the UI
    };

    const updatedConnections = [...connections, newConnection];
    setConnections(updatedConnections);
    saveConnections(updatedConnections);
    
    // Set as active connection
    setActiveConnectionState(newConnection);
    saveActiveConnection(newConnection.id);
    
    toast.success(`Connected to ${newConnection.name}`);
  }, [connections, saveConnections, saveActiveConnection]);

  // Remove a connection
  const removeConnection = useCallback((connectionId: string) => {
    const updatedConnections = connections.filter(c => c.id !== connectionId);
    setConnections(updatedConnections);
    saveConnections(updatedConnections);
    
    if (activeConnection?.id === connectionId) {
      const newActive = updatedConnections.length > 0 ? updatedConnections[0] : null;
      setActiveConnectionState(newActive);
      saveActiveConnection(newActive?.id || null);
    }
    
    toast.success("Connection removed");
  }, [connections, activeConnection, saveConnections, saveActiveConnection]);

  // Test a connection
  const testConnectionInternal = async (connection: MCPConnection): Promise<boolean> => {
    try {
      // Cancel any previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

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

      return response.ok;
    } catch (err: any) {
      if (err.name === 'AbortError') return false;
      console.error("Connection test failed:", err);
      return false;
    }
  };

  const testConnection = useCallback(async (connectionId: string): Promise<boolean> => {
    const connection = connections.find(c => c.id === connectionId);
    if (!connection) return false;

    setIsLoading(true);
    const isValid = await testConnectionInternal(connection);
    
    // Update connection status
    const updatedConnections = connections.map(c => 
      c.id === connectionId ? { ...c, isConnected: isValid } : c
    );
    setConnections(updatedConnections);
    saveConnections(updatedConnections);
    
    setIsLoading(false);
    return isValid;
  }, [connections, saveConnections]);

  // Set active connection
  const setActiveConnection = useCallback((connectionId: string | null) => {
    if (!connectionId) {
      setActiveConnectionState(null);
      saveActiveConnection(null);
      return;
    }

    const connection = connections.find(c => c.id === connectionId);
    if (connection) {
      const updatedConnection = { ...connection, lastUsed: new Date().toISOString() };
      const updatedConnections = connections.map(c => 
        c.id === connectionId ? updatedConnection : c
      );
      
      setConnections(updatedConnections);
      saveConnections(updatedConnections);
      setActiveConnectionState(updatedConnection);
      saveActiveConnection(connectionId);
    }
  }, [connections, saveConnections, saveActiveConnection]);

  // Create a new chat session
  const createChatSession = useCallback((title?: string): ChatSession => {
    const session: ChatSession = {
      id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      title: title || `Chat ${chatSessions.length + 1}`,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      modelUsed: activeConnection?.model || "unknown",
      context: {
        currentDatabase: selectedDb || undefined,
        currentTable: selectedTable || undefined,
        availableSchema: schema,
      },
    };

    const updatedSessions = [session, ...chatSessions];
    setChatSessions(updatedSessions);
    saveChatSessions(updatedSessions);
    setActiveSession(session);
    
    return session;
  }, [chatSessions, activeConnection, selectedDb, selectedTable, schema, saveChatSessions]);

  // Switch to a different chat session
  const switchChatSession = useCallback((sessionId: string) => {
    const session = chatSessions.find(s => s.id === sessionId);
    if (session) {
      setActiveSession(session);
      localStorage.setItem(MCP_STORAGE_KEYS.ACTIVE_SESSION, sessionId);
    }
  }, [chatSessions]);

  // Delete a chat session
  const deleteChatSession = useCallback((sessionId: string) => {
    const updatedSessions = chatSessions.filter(s => s.id !== sessionId);
    setChatSessions(updatedSessions);
    saveChatSessions(updatedSessions);
    
    if (activeSession?.id === sessionId) {
      setActiveSession(updatedSessions.length > 0 ? updatedSessions[0] : null);
    }
  }, [chatSessions, activeSession, saveChatSessions]);

  // Rename a chat session
  const renameChatSession = useCallback((sessionId: string, newTitle: string) => {
    const updatedSessions = chatSessions.map(s => 
      s.id === sessionId ? { ...s, title: newTitle, updatedAt: new Date().toISOString() } : s
    );
    setChatSessions(updatedSessions);
    saveChatSessions(updatedSessions);
    
    // Update active session if it's the one being renamed
    if (activeSession?.id === sessionId) {
      setActiveSession({ ...activeSession, title: newTitle, updatedAt: new Date().toISOString() });
    }
    
    toast.success("Chat renamed successfully");
  }, [chatSessions, activeSession, saveChatSessions]);

  // Helper functions
  const getBaseUrl = (connection: MCPConnection): string => {
    return connection.baseUrl;
  };

  const getHeaders = (connection: MCPConnection): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add custom headers
    if (connection.headers) {
      Object.assign(headers, connection.headers);
    }

    return headers;
  };

  // Build context for AI requests
  const buildDataContext = useCallback(() => {
    let context = `You are a helpful AI assistant that helps users analyze data using SQL queries for Gigapi, a next-gen observability tool.

IMPORTANT LINKS: 
- GIGAPI Repo: https://github.com/gigapi/gigapi 
- GIGAPI Docs: https://gigapipe.com/docs/index.html

IMPORTANT: You should ONLY help users with SQL queries regarding their data analysis and observability needs.

`;
    
    if (selectedDb) {
      context += `CURRENT DATABASE: ${selectedDb}\n`;
    }
    
    if (selectedTable) {
      context += `CURRENT TABLE: ${selectedTable}\n`;
    }
    
    if (schema && selectedDb && schema[selectedDb]) {
      context += "\nAVAILABLE TABLES AND SCHEMAS:\n";
      schema[selectedDb].forEach(table => {
        context += `\nTable: ${table.tableName}\n`;
        if (table.columns && table.columns.length > 0) {
          context += "Columns:\n";
          table.columns.forEach(col => {
            const timeUnit = col.timeUnit ? ` (time unit: ${col.timeUnit})` : '';
            context += `  - ${col.columnName}: ${col.dataType}${timeUnit}\n`;
          });
        }
      });
    }
    
    if (timeRange && timeRange.enabled) {
      context += `\nCURRENT TIME RANGE: ${timeRange.from} to ${timeRange.to}\n`;
    }
    
    context += `\nDUCKDB SQL GENERATION RULES FOR GIGAPI BACKEND:

CRITICAL CONSTRAINTS:
- Backend uses DuckDB with specific time handling patterns
- Time filtering MUST use epoch conversion for numeric timestamp fields
- All temporal queries must be compatible with DuckDB SQL syntax

TIME FILTER VARIABLES (use these in your SQL queries):

CRITICAL: These variables are mutually exclusive - do NOT combine them in the same query!

1. $__timeFilter 
   - This is a COMPLETE WHERE condition that includes both the time field and the range
   - Automatically handles epoch conversion based on field type and timeUnit
   - Use this when you want automatic time filtering
   - Example: SELECT * FROM logs WHERE $__timeFilter
   - DO NOT use with other time variables ($__timeFrom, $__timeTo, $__timeField)

2. $__timeField 
   - This expands to just the time column name
   - Use when you need to reference the time column in your query
   - Example: SELECT $__timeField, count(*) FROM logs GROUP BY $__timeField

3. $__timeFrom and $__timeTo 
   - These are the start and end timestamps (properly scaled for field's timeUnit)
   - Use when you want to manually construct time conditions
   - Example: SELECT * FROM logs WHERE timestamp >= $__timeFrom AND timestamp <= $__timeTo

DUCKDB TIME HANDLING PATTERNS: (ONLY IF NEEDED AND USER HASN'T USED $__timeFilter, AVOID MIXING, and always choose to use $__timeFilter if available)

1. EPOCH TIME CONVERSION:
   - For BIGINT/INT timestamp fields, use EXTRACT(EPOCH FROM date) functions
   - Time units: 's' (seconds), 'ms' (milliseconds), 'us' (microseconds), 'ns' (nanoseconds)
   - Common patterns:
     * EXTRACT(EPOCH FROM NOW()) - seconds since Unix epoch
     * EXTRACT(EPOCH FROM NOW()) * 1000 - milliseconds  
     * EXTRACT(EPOCH FROM NOW()) * 1000000 - microseconds
     * EXTRACT(EPOCH FROM NOW()) * 1000000000 - nanoseconds

2. TIME FIELD DETECTION:
   - Fields ending with '_ns', '_us', '_ms', '_s' indicate time units
   - Common time fields: __timestamp, time, timestamp, created_at, updated_at
   - '__timestamp' fields typically use nanosecond precision
   - 'created_at'/'updated_at' fields typically use millisecond precision


 SQL BEST PRACTICES FOR GIGAPI:

1. TIME FILTERING:
   SELECT * FROM logs WHERE $__timeFilter
   SELECT * FROM logs WHERE __timestamp >= $__timeFrom AND __timestamp <= $__timeTo
   SELECT * FROM logs WHERE __timestamp >= EXTRACT(EPOCH FROM NOW() - INTERVAL 1 HOUR) * 1000000000

2. TIME GROUPING:
    SELECT DATE_TRUNC('hour', to_timestamp(__timestamp/1000000000)), COUNT(*)
       FROM logs WHERE $__timeFilter GROUP BY 1
    SELECT $__timeField, COUNT(*) FROM logs WHERE $__timeFilter GROUP BY $__timeField

3. AGGREGATIONS WITH TIME:
    SELECT COUNT(*), AVG(response_time), MAX(error_rate) 
       FROM metrics WHERE $__timeFilter
    SELECT DATE_TRUNC('minute', to_timestamp(time_ns/1000000000)), AVG(cpu_usage)
       FROM system_metrics WHERE $__timeFilter GROUP BY 1 ORDER BY 1

4. OBSERVABILITY PATTERNS:
   SELECT service_name, COUNT(*) as request_count, AVG(duration_ms)
       FROM traces WHERE $__timeFilter GROUP BY service_name
   SELECT level, COUNT(*) FROM logs 
       WHERE $__timeFilter AND level IN ('ERROR', 'WARN') GROUP BY level

EXAMPLES OF INCORRECT USAGE:
SELECT * FROM logs WHERE $__timeFilter AND timestamp >= $__timeFrom
SELECT * FROM logs WHERE $__timeFilter BETWEEN $__timeFrom AND $__timeTo
Using MySQL/PostgreSQL specific functions (use DuckDB equivalents)
Mixing timestamp formats without proper conversion

SCHEMA-AWARE RECOMMENDATIONS:
- Use appropriate time conversion functions based on detected field types
- Suggest time-based grouping for observability queries
- Recommend efficient time range queries using available indexes
- Avoid unnecessary complexity in time filtering AND JOINS since gigapi-querier is under active development


USER ERRORS RESPONSES: 

- If user asks for time filtering without specifying a time field, suggest using $__timeFilter
- IF user insists on an error, remind that gigapi and gigapi-querier are under active development and may not support all SQL features.
- If users makes a compiling case that it should work ask him to fill a new issue in github in gigapi-querier repo: https://github.com/gigapi/gigapi-querier/issues, tell him to be specific and clear with his request, and that it the team will do what it can to fix it.
`;
    
    return context;
  }, [selectedDb, selectedTable, schema, timeRange]);

  // Send a message to the AI
  const sendMessage = useCallback(async (content: string) => {
    if (!activeConnection || !activeConnection.isConnected) {
      toast.error("No active AI connection");
      return;
    }

    let currentSession = activeSession;
    if (!currentSession) {
      currentSession = createChatSession();
    }

    setIsLoading(true);
    setError(null);

    // Add user message
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...currentSession.messages, userMessage];
    const updatedSession = { 
      ...currentSession, 
      messages: updatedMessages,
      updatedAt: new Date().toISOString(),
    };
    
    // Update the active session and save the user message immediately
    setActiveSession(updatedSession);
    
    // Update chatSessions with the user message
    const updatedSessions = chatSessions.map(s => 
      s.id === currentSession.id ? updatedSession : s
    );
    setChatSessions(updatedSessions);
    saveChatSessions(updatedSessions);

    try {
      // Cancel any previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const baseUrl = getBaseUrl(activeConnection);
      const headers = getHeaders(activeConnection);
      
      // Build the request based on provider
      const messages = [
        {
          role: 'system',
          content: buildDataContext(),
        },
        ...updatedMessages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
      ];

      // Build endpoint - detect the correct endpoint based on base URL
      let endpoint = baseUrl;
      
      // If baseUrl doesn't already include the endpoint, add the appropriate one
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
      
      let generatedQuery: string | undefined;

      // Check if the response contains a SQL query
      const sqlMatches = assistantContent.match(/```sql\n([\s\S]*?)\n```/);
      if (sqlMatches && sqlMatches[1]) {
        generatedQuery = sqlMatches[1].trim();
      }

      // Add assistant message
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date().toISOString(),
        metadata: {
          queryGenerated: generatedQuery,
          dataContext: {
            database: selectedDb || undefined,
            table: selectedTable || undefined,
            timeRange: timeRange,
          },
        },
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      const finalSession = {
        ...updatedSession,
        messages: finalMessages,
        updatedAt: new Date().toISOString(),
      };

      setActiveSession(finalSession);

      // Update sessions in storage with the final session including AI response
      const finalUpdatedSessions = chatSessions.map(s => 
        s.id === currentSession.id ? finalSession : s
      );
      setChatSessions(finalUpdatedSessions);
      saveChatSessions(finalUpdatedSessions);

    } catch (err: any) {
      if (err.name === 'AbortError') return;
      
      console.error("AI request failed:", err);
      setError(err.message || "Failed to send message");
      toast.error(`AI request failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [activeConnection, activeSession, buildDataContext, chatSessions, saveChatSessions, selectedDb, selectedTable, timeRange, createChatSession]);

  // Generate query from natural language
  const generateQuery = useCallback(async (prompt: string): Promise<string> => {
    if (!activeConnection?.isConnected) {
      throw new Error("No active AI connection");
    }
    
    // This would use the same logic as sendMessage but return just the query
    // For now, we'll return a placeholder
    return `-- Generated query for: ${prompt}\nSELECT * FROM ${selectedTable || 'your_table'} LIMIT 10;`;
  }, [activeConnection, selectedTable]);

  // Analyze data
  const analyzeData = useCallback(async (data: any[], prompt: string): Promise<string> => {
    if (!activeConnection?.isConnected) {
      throw new Error("No active AI connection");
    }

    // This would send the data and prompt to the AI for analysis
    return `Analysis for: ${prompt}\n\nData contains ${data.length} rows with interesting patterns...`;
  }, [activeConnection]);

  // Optimize query
  const optimizeQuery = useCallback(async (query: string): Promise<string> => {
    if (!activeConnection?.isConnected) {
      throw new Error("No active AI connection");
    }

    // This would send the query to the AI for optimization suggestions
    return `-- Optimized version of your query\n${query}\n-- Consider adding indexes on frequently queried columns`;
  }, [activeConnection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return (
    <MCPContext.Provider
      value={{
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
        
        // AI capabilities
        generateQuery,
        analyzeData,
        optimizeQuery,
        
        // State
        isConnected,
        isLoading,
        error,
        capabilities,
      }}
    >
      {children}
    </MCPContext.Provider>
  );
}

export function useMCP() {
  const context = useContext(MCPContext);
  if (context === undefined) {
    throw new Error("useMCP must be used within an MCPProvider");
  }
  return context;
}

export { MCPContext };
