/**
 * Custom GigAPI Client - Replaces Axios with modern fetch
 * Optimized for NDJSON responses and GigAPI-specific needs
 */

export interface QueryRequest {
  query: string;
  database: string;
  format?: "ndjson";
  maxRows?: number;
}

export interface ApiResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

export interface ConnectionTestResponse {
  databases: string[];
}

export class GigAPIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GigAPIError";
  }
}

export class GigAPIClient {
  private abortController: AbortController | null = null;
  private defaultTimeout = 60000; // 60 seconds - increased for large databases

  /**
   * Build URL with query parameters for database and format
   */
  private buildUrl(
    apiUrl: string,
    database?: string,
    format: string = "ndjson"
  ): string {
    const url = new URL(apiUrl);

    if (database) {
      url.searchParams.set("db", database);
    }
    url.searchParams.set("format", format);

    return url.toString();
  }

  /**
   * Parse response headers into a simple object
   */
  private parseHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Parse NDJSON response into array of objects
   */
  parseNDJSON(data: string): any[] {
    return data
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          console.error("Error parsing NDJSON line:", error, "Line:", line);
          return null;
        }
      })
      .filter(Boolean);
  }

  /**
   * Execute HTTP request with timeout and error handling
   */
  private async request<T = any>(
    url: string,
    options: RequestInit = {},
    timeout?: number
  ): Promise<ApiResponse<T>> {
    // Only log non-system queries
    const parsedBody = options.body ? JSON.parse(options.body as string) : {};
    const query = parsedBody.query || "";
    const isSystemQuery = query.startsWith("SHOW ") || query.startsWith("DESCRIBE ");
    
    if (!isSystemQuery) {
      console.log("🔥 [GigAPIClient.request] User query:", query.substring(0, 50) + "...");
    }
    
    
    if (!isSystemQuery && this.abortController) {
      console.log("🔥 [GigAPIClient.request] Canceling previous user query");
      this.cancelPendingRequest();
    }

    // Create new abort controller
    this.abortController = new AbortController();

    // Set up timeout
    const timeoutMs = timeout || this.defaultTimeout;
    const timeoutId = setTimeout(() => {
      if (this.abortController) {
        console.log("🔥 [GigAPIClient.request] Request timeout reached, aborting");
        this.abortController.abort();
      }
    }, timeoutMs);

    try {
      const fetchOptions = {
        ...options,
        signal: this.abortController.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
          ...options.headers,
        },
      };
      
      
      const response = await fetch(url, fetchOptions);

      clearTimeout(timeoutId);
      

      // Handle HTTP errors
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

        // Try to get error details from response
        try {
          const errorText = await response.text();
          if (errorText) {
            errorMessage = errorText;
          }
          console.log("🔥 [GigAPIClient.request] HTTP Error details", {
            status: response.status,
            statusText: response.statusText,
            errorText
          });
        } catch {
          // Ignore parsing errors for error responses
        }

        throw new GigAPIError(errorMessage);
      }

      // Get response text
      const data = await response.text();

      return {
        data: data as T,
        status: response.status,
        statusText: response.statusText,
        headers: this.parseHeaders(response.headers),
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof GigAPIError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        // Silently ignore manual cancellations
        if (this.abortController?.signal.reason === "manual") {
          console.log("🔥 [GigAPIClient.request] Request manually canceled");
          throw new GigAPIError("Request was canceled");
        }
        // This was a timeout
        throw new GigAPIError("Request timeout - query took too long");
      }

      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new GigAPIError("Network error - unable to connect to API");
      }

      throw new GigAPIError(
        error instanceof Error ? error.message : "Unknown error occurred"
      );
    }
  }

  /**
   * Execute SQL query
   */
  async executeQuery(apiUrl: string, request: QueryRequest): Promise<string> {
    const url = this.buildUrl(apiUrl, request.database, request.format);

    const response = await this.request<string>(url, {
      method: "POST",
      body: JSON.stringify({ query: request.query }),
    });

    return response.data;
  }

  /**
   * Test API connection and get available databases
   */
  async testConnection(apiUrl: string): Promise<ConnectionTestResponse> {
    // For SHOW DATABASES, we don't need a specific database
    // Just use the base URL without db parameter
    const url = new URL(apiUrl);
    url.searchParams.set("format", "ndjson");

    const response = await this.request<string>(
      url.toString(),
      {
        method: "POST",
        body: JSON.stringify({ query: "SHOW DATABASES" }),
      },
      5000
    ); // Shorter timeout for connection test
    
    const databases = this.parseNDJSON(response.data)
      .map((item) => item.database_name || item.Database || item.name)
      .filter(Boolean);

    return { databases };
  }

  /**
   * Get database schema for a specific table
   */
  async getSchema(
    apiUrl: string,
    database: string,
    table: string
  ): Promise<any[]> {
    const url = this.buildUrl(apiUrl, database);

    const response = await this.request<string>(
      url,
      {
        method: "POST",
        body: JSON.stringify({
          query: `DESCRIBE SELECT * FROM ${table} LIMIT 1`,
        }),
      },
      8000
    );

    return this.parseNDJSON(response.data);
  }

  /**
   * Get list of tables in a database
   */
  async getTables(apiUrl: string, database: string): Promise<string[]> {
    const url = this.buildUrl(apiUrl, database);

    console.log(`[GigAPI] Loading tables for database: ${database}`);

    const response = await this.request<string>(
      url,
      {
        method: "POST",
        body: JSON.stringify({ query: "SHOW TABLES" }),
      },
      15000 // Increased timeout for SHOW TABLES
    );

    console.log(`[GigAPI] Raw response data of getTables for ${database}:`, response.data);

    const tables = this.parseNDJSON(response.data)
      .map((item) => item.table_name || item.Table || item.name)
      .filter(Boolean);

    console.log(`[GigAPI] Found ${tables.length} tables for database ${database}:`, tables);

    return tables;
  }

  /**
   * Cancel any pending request
   */
  cancelPendingRequest(): void {
    if (this.abortController) {
      try {
        this.abortController.abort("manual");
      } catch (e) {
        // Ignore errors when aborting
      } finally {
        this.abortController = null;
      }
    }
  }
}

// Singleton instance
export const gigapiClient = new GigAPIClient();
