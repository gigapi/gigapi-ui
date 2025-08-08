// ============================================================================
// AI Connection Types
// ============================================================================

export interface AIConnection {
  id: string;
  name: string;
  provider: "openai" | "ollama" | "deepseek" | "custom";
  baseUrl: string;
  model: string; // The specific model for this connection
  headers?: Record<string, string>;
  params?: Record<string, string>;
  isActive?: boolean;
}

// ============================================================================
// Chat Types (Simplified - NO CONTEXT!)
// ============================================================================

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;

  // AI Configuration
  aiConnectionId: string;
  connection?: AIConnection; // The full connection object

  // Messages
  messages: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: {
    artifacts?: ChatArtifact[];
    error?: string;
    isStreaming?: boolean;
    thinking?: string; // Hidden thinking/reasoning content
    isAgentic?: boolean; // Whether this message was sent in agentic mode
    edited?: boolean; // Whether this message has been edited
    editedAt?: string; // When the message was edited
    wasCancelled?: boolean; // Whether this message was cancelled
  };
}

// Re-export artifact types from the unified type system
export type {
  Artifact as ChatArtifact,
  QueryArtifact,
  ChartArtifact,
  ProposalArtifact
} from '@/types/artifact.types';

// ============================================================================
// Action Types
// ============================================================================

export interface CreateSessionOptions {
  connectionId: string;
  title?: string;
}

export interface SendMessageOptions {
  sessionId: string;
  message: string;
  isAgentic?: boolean;
}
