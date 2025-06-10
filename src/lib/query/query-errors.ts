import type { ConnectionError, QueryError } from "@/types/utils.types";

/**
 * Handle connection errors with detailed categorization
 */
export function handleConnectionError(
  error: any,
  apiUrl?: string
): ConnectionError {
  let type: ConnectionError["type"] = "unknown";
  let message = "Connection failed";
  let detail: string | undefined;
  let statusCode: number | undefined;

  if (
    error.code === "ECONNREFUSED" ||
    error.message?.includes("ECONNREFUSED")
  ) {
    type = "connection";
    message = "Connection refused";
    detail = apiUrl
      ? `Unable to connect to ${apiUrl}. Check if the server is running and accessible.`
      : "Unable to connect to the server.";
  } else if (
    error.code === "ENOTFOUND" ||
    error.message?.includes("ENOTFOUND")
  ) {
    type = "network";
    message = "Network error";
    detail = "Host not found. Check your network connection and API URL.";
  } else if (error.code === "ETIMEDOUT" || error.name === "TimeoutError") {
    type = "timeout";
    message = "Connection timeout";
    detail = "The server took too long to respond. Try again later.";
  } else if (error.response) {
    statusCode = error.response.status;
    type = "server";

    switch (statusCode) {
      case 400:
        message = "Bad Request";
        detail = "The server could not understand the request.";
        break;
      case 401:
        message = "Unauthorized";
        detail = "Authentication is required.";
        break;
      case 403:
        message = "Forbidden";
        detail = "You don't have permission to access this resource.";
        break;
      case 404:
        message = "Not Found";
        detail = "The requested resource could not be found.";
        break;
      case 500:
        message = "Internal Server Error";
        detail = "The server encountered an unexpected condition.";
        break;
      default:
        message = `Server Error (${statusCode})`;
        detail = error.response.data?.message || "An error occurred on the server.";
    }
  } else if (error.message) {
    message = error.message;
    detail = "Check your network connection and try again.";
  }

  return {
    type,
    message,
    detail,
    statusCode,
    originalError: error,
  };
}

/**
 * Handle query execution errors
 */
export function handleQueryError(error: any, query?: string): QueryError {
  let type: QueryError["type"] = "unknown";
  let message = "Query failed";
  let detail: string | undefined;
  let line: number | undefined;
  let column: number | undefined;

  // Log the query for debugging if provided
  if (query) {
    console.error("Query that failed:", query);
  }

  if (error.response?.data) {
    const errorData = error.response.data;
    type = "execution";
    message = errorData.message || "Query execution failed";
    detail = errorData.detail || errorData.error;
    
    // Try to extract line/column info from error messages
    const lineMatch = detail?.match(/line (\d+)/i);
    const columnMatch = detail?.match(/column (\d+)/i);
    
    if (lineMatch) line = parseInt(lineMatch[1], 10);
    if (columnMatch) column = parseInt(columnMatch[1], 10);
  } else if (error.message) {
    message = error.message;
    
    // Check for syntax errors
    if (error.message.toLowerCase().includes("syntax")) {
      type = "syntax";
    } else if (error.message.toLowerCase().includes("permission")) {
      type = "permission";
    } else if (error.message.toLowerCase().includes("timeout")) {
      type = "timeout";
    }
  }

  return {
    type,
    message,
    detail,
    line,
    column,
    originalError: error,
  };
}
