import { useState } from "react";
import { toast } from "sonner";
import type { AITemplate } from "@/lib/ai-providers/templates";
import { 
  buildEndpointUrl, 
  buildRequestBody, 
  parseResponse 
} from "@/lib/ai-providers/templates";

interface ConnectionTestConfig {
  template?: AITemplate;
  baseUrl: string;
  model: string;
  headers: Record<string, string>;
  params?: Record<string, string>;
  apiKey?: string;
}

export function useAIConnectionTest() {
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [testError, setTestError] = useState<string>("");

  const resetTestState = () => {
    setTestResult(null);
    setTestError("");
  };

  const testConnection = async (config: ConnectionTestConfig) => {
    setIsTestingConnection(true);
    setTestResult(null);
    setTestError("");

    try {
      const testMessage = "Hello! Please respond with 'OK' to confirm the connection works.";
      
      // Build headers
      const requestHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...config.headers,
      };

      // Add API key if provided
      if (config.apiKey && config.template) {
        const authHeader = config.template.apiConfig.authHeader;
        const authPrefix = config.template.apiConfig.authPrefix || "";
        
        if (authHeader) {
          requestHeaders[authHeader] = authPrefix + config.apiKey;
        }
      }

      // Build endpoint URL
      let testEndpoint: string;
      if (config.template) {
        testEndpoint = buildEndpointUrl(config.template, config.model, config.baseUrl);
      } else {
        // Fallback for custom connections
        testEndpoint = config.baseUrl;
        if (!testEndpoint.includes("/chat") && !testEndpoint.includes("/messages")) {
          testEndpoint = testEndpoint.endsWith("/") 
            ? testEndpoint + "chat/completions" 
            : testEndpoint + "/chat/completions";
        }
      }

      // Add query parameters if provided
      if (config.params && Object.keys(config.params).length > 0) {
        const url = new URL(testEndpoint);
        Object.entries(config.params).forEach(([key, value]) => {
          url.searchParams.append(key, String(value));
        });
        testEndpoint = url.toString();
      }
      
      // Special handling for Gemini - API key goes in URL
      if (config.template?.id === "gemini" && config.apiKey) {
        const url = new URL(testEndpoint);
        url.searchParams.append("key", config.apiKey);
        testEndpoint = url.toString();
        // Remove from headers since it's in URL
        delete requestHeaders["x-goog-api-key"];
      }

      // Build request body
      const messages = [{ role: "user", content: testMessage }];
      const requestBody = config.template
        ? buildRequestBody(
            config.template.apiConfig.requestFormat,
            messages,
            config.model
          )
        : {
            model: config.model,
            messages,
            stream: false,
          };

      // Make request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(testEndpoint, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error?.message) {
            errorMessage = errorJson.error.message;
          } else if (errorJson.message) {
            errorMessage = errorJson.message;
          }
        } catch {
          errorMessage += `\n${errorText}`;
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();

      // Parse response based on template format
      let responseContent: string | null = null;
      
      if (config.template) {
        responseContent = parseResponse(
          config.template.apiConfig.responseFormat,
          data
        );
      } else {
        // Try common response formats
        responseContent = 
          data.choices?.[0]?.message?.content ||
          data.message?.content ||
          data.content?.[0]?.text ||
          data.content ||
          null;
      }

      if (!responseContent) {
        console.error("Unexpected response format:", data);
        throw new Error("Invalid response format - AI provider returned unexpected structure");
      }

      if (!responseContent.trim()) {
        throw new Error("AI provider returned empty response");
      }

      setTestResult("success");
      return true;
    } catch (error: any) {
      setTestResult("error");
      let errorMessage = error.message || "Connection test failed";

      if (error.name === "AbortError") {
        errorMessage = "Connection timeout - request took too long";
      } else if (error.message.includes("fetch")) {
        errorMessage = "Network error - cannot reach the AI provider";
      }

      setTestError(errorMessage);
      toast.error(`Connection test failed: ${errorMessage}`);
      return false;
    } finally {
      setIsTestingConnection(false);
    }
  };

  return {
    testConnection,
    isTestingConnection,
    testResult,
    testError,
    resetTestState,
  };
}