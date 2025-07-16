import OpenAi from "@/assets/openai.svg";
import Ollama from "@/assets/ollama.svg";
import DeepSeek from "@/assets/deepseek.svg";

export type AITemplate = {
  id: string;
  name: string;
  logo: string;
  baseUrl: string;
  defaultModel?: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  requiredFields: {
    apiKey?: boolean;
    baseUrl?: boolean;
    model?: boolean;
  };
  // API configuration
  apiConfig: {
    endpoint: string; // The actual endpoint to hit for chat
    method: "POST";
    requestFormat: "openai" | "ollama" | "custom";
    responseFormat: "openai" | "ollama" | "custom";
    authHeader?: string; // Header name for authentication
    authPrefix?: string; // Prefix for auth value (e.g., "Bearer ")
  };
  corsEnabled?: boolean; // Whether this API supports browser requests
  proxyRequired?: boolean; // Whether a proxy is required for browser use
  notes?: string; // Additional notes for the user
};

export const AI_TEMPLATES: AITemplate[] = [
  {
    id: "ollama",
    name: "Ollama",
    logo: Ollama,
    baseUrl: "http://localhost:11434",
    defaultModel: "llama3.2:latest",
    requiredFields: { model: true },
    apiConfig: {
      endpoint: "/api/chat",
      method: "POST",
      requestFormat: "ollama",
      responseFormat: "ollama",
    },
  },
  {
    id: "openai",
    name: "OpenAI",
    logo: OpenAi,
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini-2024-07-18",
    requiredFields: { apiKey: true, model: true },
    apiConfig: {
      endpoint: "/chat/completions",
      method: "POST",
      requestFormat: "openai",
      responseFormat: "openai",
      authHeader: "Authorization",
      authPrefix: "Bearer ",
    },
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    logo: DeepSeek,
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    requiredFields: { apiKey: true, model: true },
    apiConfig: {
      endpoint: "/chat/completions",
      method: "POST",
      requestFormat: "openai",
      responseFormat: "openai",
      authHeader: "Authorization",
      authPrefix: "Bearer ",
    },
  },
];

// Helper to build request body based on format
export function buildRequestBody(
  format: AITemplate["apiConfig"]["requestFormat"],
  messages: Array<{ role: string; content: string }>,
  model: string,
  options?: Record<string, any>
) {
  switch (format) {
    case "openai":
      return {
        model,
        messages,
        stream: false,
        ...options,
      };
    
    case "ollama":
      return {
        model,
        messages,
        stream: false,
        ...options,
      };
    
    case "custom":
      // Default to OpenAI format for custom providers
      return {
        model,
        messages,
        stream: false,
        ...options,
      };
    
    default:
      return { messages, model, ...options };
  }
}

// Helper to parse response based on format
export function parseResponse(
  format: AITemplate["apiConfig"]["responseFormat"],
  data: any
): string | null {
  try {
    switch (format) {
      case "openai":
        return data.choices?.[0]?.message?.content || null;
      
      case "ollama":
        return data.message?.content || null;
      
      case "custom":
        // Try common response formats
        return data.choices?.[0]?.message?.content ||
               data.message?.content ||
               data.content ||
               data.response ||
               data.text ||
               null;
      
      default:
        return null;
    }
  } catch (error) {
    console.error("Error parsing response:", error);
    return null;
  }
}

// Helper to build endpoint URL
export function buildEndpointUrl(
  template: AITemplate,
  model: string,
  baseUrl?: string
): string {
  const base = baseUrl || template.baseUrl;
  let endpoint = template.apiConfig.endpoint;
  
  // Replace model placeholder if exists
  endpoint = endpoint.replace("{model}", model);
  
  // Ensure proper URL construction
  const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : "/" + endpoint;
  
  return cleanBase + cleanEndpoint;
}