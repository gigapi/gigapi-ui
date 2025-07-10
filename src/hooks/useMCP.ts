/**
 * Backward compatibility wrapper for the old useMCP hook
 * Maps the old MCP interface to the new chat system
 */

import { useCallback } from "react";
import { useSetAtom } from "jotai";
import { useChat } from "./useChat";
import { aiConnectionsAtom } from "@/atoms/chat-atoms";

export function useMCP() {
  const {
    connections,
    activeSession,
    sessionList,
    createSession,
    updateSessionContext,
    sendMessage,
    deleteSession,
    renameSession,
    setActiveSessionId,
  } = useChat();

  const setConnections = useSetAtom(aiConnectionsAtom);

  // Map to old interface
  const isConnected = connections.length > 0;
  const activeConnection = connections.find(c => c.id === activeSession?.connection.id);
  
  const isLoading = false; // Would need to track this in atoms
  const error = null; // Would need to track this in atoms

  // Legacy functions
  const createChatSession = useCallback(async () => {
    if (connections.length === 0) {
      throw new Error("No AI connections available");
    }
    
    const sessionId = createSession({
      connectionId: connections[0].id,
      title: "New Chat",
    });
    
    return sessionId;
  }, [connections, createSession]);

  const switchChatSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
  }, [setActiveSessionId]);

  const deleteChatSession = useCallback((sessionId: string) => {
    deleteSession(sessionId);
  }, [deleteSession]);

  const updateCustomInstructions = useCallback((instructions: string[]) => {
    if (!activeSession) return;
    
    updateSessionContext(activeSession.id, {
      ...activeSession.context,
      instructions: {
        ...activeSession.context.instructions,
        user: instructions,
        active: instructions.map(() => true),
      },
    });
  }, [activeSession, updateSessionContext]);

  const setActiveConnection = useCallback((connectionId: string) => {
    if (!activeSession) return;
    
    const connection = connections.find(c => c.id === connectionId);
    if (!connection) return;
    
    // Update the current session with new connection
    updateSessionContext(activeSession.id, {
      ...activeSession.context,
    });
  }, [activeSession, connections, updateSessionContext]);

  const addMCPConnection = useCallback((connection: any) => {
    const newConnection = {
      id: `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name: connection.name,
      provider: connection.provider as any,
      baseUrl: connection.baseUrl || connection.endpoint,
      headers: connection.apiKey ? { Authorization: `Bearer ${connection.apiKey}` } : {} as Record<string, string>,
      params: {},
      capabilities: {
        streaming: true,
        functionCalling: connection.provider === 'openai',
        vision: ['openai', 'anthropic'].includes(connection.provider),
        maxContextTokens: 8000,
        costPer1kTokens: { input: 0.03, output: 0.06 },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    setConnections((prev) => [...prev, newConnection]);
  }, [setConnections]);

  const updateMCPConnection = useCallback((id: string, updates: any) => {
    setConnections((prev) => 
      prev.map(conn => conn.id === id ? { ...conn, ...updates } : conn)
    );
  }, [setConnections]);

  const deleteMCPConnection = useCallback((id: string) => {
    setConnections((prev) => prev.filter(conn => conn.id !== id));
  }, [setConnections]);

  const renameChatSession = useCallback((sessionId: string, newTitle: string) => {
    renameSession(sessionId, newTitle);
  }, [renameSession]);

  const removeConnection = deleteMCPConnection;

  const deleteCustomInstruction = useCallback((instructionId: string) => {
    if (!activeSession) return;
    
    const index = parseInt(instructionId); // Assuming ID is index for now
    const newInstructions = [...activeSession.context.instructions.user];
    const newActive = [...activeSession.context.instructions.active];
    
    newInstructions.splice(index, 1);
    newActive.splice(index, 1);
    
    updateSessionContext(activeSession.id, {
      ...activeSession.context,
      instructions: {
        ...activeSession.context.instructions,
        user: newInstructions,
        active: newActive,
      },
    });
  }, [activeSession, updateSessionContext]);

  const toggleCustomInstruction = useCallback((instructionId: string) => {
    if (!activeSession) return;
    
    const index = parseInt(instructionId); // Assuming ID is index for now
    const newActive = [...activeSession.context.instructions.active];
    newActive[index] = !newActive[index];
    
    updateSessionContext(activeSession.id, {
      ...activeSession.context,
      instructions: {
        ...activeSession.context.instructions,
        active: newActive,
      },
    });
  }, [activeSession, updateSessionContext]);

  const addCustomInstruction = useCallback((instruction: string) => {
    if (!activeSession) return;
    
    updateSessionContext(activeSession.id, {
      ...activeSession.context,
      instructions: {
        ...activeSession.context.instructions,
        user: [...activeSession.context.instructions.user, instruction],
        active: [...activeSession.context.instructions.active, true],
      },
    });
  }, [activeSession, updateSessionContext]);

  const updateCustomInstruction = useCallback((instructionId: string, newInstruction: string) => {
    if (!activeSession) return;
    
    const index = parseInt(instructionId);
    const newInstructions = [...activeSession.context.instructions.user];
    newInstructions[index] = newInstruction;
    
    updateSessionContext(activeSession.id, {
      ...activeSession.context,
      instructions: {
        ...activeSession.context.instructions,
        user: newInstructions,
      },
    });
  }, [activeSession, updateSessionContext]);

  return {
    // State
    chatSessions: sessionList,
    activeSession,
    connections,
    activeConnection,
    isConnected,
    isLoading,
    error,
    customInstructions: activeSession?.context.instructions.user.map((instruction, index) => ({
      id: String(index),
      name: instruction,
      isActive: activeSession.context.instructions.active[index] || false
    })) || [],
    
    // Actions
    sendMessage: activeSession ? (msg: string) => sendMessage({ sessionId: activeSession.id, message: msg }) : async () => {},
    createChatSession,
    switchChatSession,
    deleteChatSession,
    updateCustomInstructions,
    setActiveConnection,
    addConnection: addMCPConnection,
    updateConnection: updateMCPConnection,
    deleteConnection: deleteMCPConnection,
    renameChatSession,
    removeConnection,
    deleteCustomInstruction,
    toggleCustomInstruction,
    addCustomInstruction,
    updateCustomInstruction,
  };
}