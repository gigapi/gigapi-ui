import { useConnection } from "@/contexts/ConnectionContext";
import axios from "axios";

interface QueryExecutionResult {
  data: string;
  error?: string;
}

/**
 * Hook for executing queries independently in dashboard panels
 * This is separate from the main QueryContext to avoid conflicts
 */
export function useDashboardQuery() {
  const { apiUrl, isConnected } = useConnection();

  const executeQuery = async (query: string, database?: string): Promise<QueryExecutionResult> => {
    if (!isConnected || !apiUrl) {
      throw new Error("No database connection available");
    }

    if (!database) {
      throw new Error("No database specified for panel query");
    }

    console.log("Executing dashboard query:", query);
    console.log("Using API URL:", apiUrl);
    console.log("Using database:", database);

    try {
      const response = await axios.post(
        `${apiUrl}?db=${encodeURIComponent(database)}&format=ndjson`,
        { query: query.trim() },
        {
          responseType: "text",
        }
      );

      console.log("Dashboard query response status:", response.status);

      if (response.status >= 400) {
        const errorText = response.data || `Request failed with status ${response.status}`;
        console.error("Dashboard query error response:", errorText);
        throw new Error(errorText);
      }

      const data = response.data;
      console.log("Dashboard query successful, data length:", data.length);
      return { data };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Dashboard query execution failed:", error);
      return { data: "", error: errorMessage };
    }
  };

  return { executeQuery };
}
