import type { TimeRange } from "@/components/TimeRangeSelector";

/**
 * Hash Query Utils
 * 
 * Utility functions for encoding and decoding query parameters in URL hash fragments
 * to facilitate query sharing and bookmarking.
 * Uses base64 encoding to store all parameters as a single chunk for efficient URL sharing.
 */

export interface HashQueryParams {
  // Query parameters
  query?: string;
  db?: string;
  table?: string;
  
  // Time settings
  timeField?: string;
  timeFrom?: string;
  timeTo?: string;
}

class HashQueryUtils {
  /**
   * Encode query parameters into a base64-encoded URL hash string
   */
  static encodeHashQuery(params: HashQueryParams): string {
    // Remove undefined values
    const cleanParams = Object.entries(params).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, any>);
    
    // Convert to JSON and base64 encode - use direct JSON without double encoding
    const jsonString = JSON.stringify(cleanParams);
    
    // Use simple base64 without additional URL encoding to avoid double-encoding issues
    return btoa(jsonString);
  }
  
  /**
   * Decode base64-encoded URL hash string into query parameters
   */
  static decodeHashQuery(): HashQueryParams | null {
    try {
      const hash = window.location.hash;
      if (!hash || hash === "#") return null;
      
      // Remove the # prefix
      const hashContent = hash.startsWith("#") ? hash.substring(1) : hash;
      
      // Handle URL-encoded hash content (which might happen depending on the browser)
      let decodedHashContent = hashContent;
      if (/%[0-9A-F]{2}/.test(hashContent)) {
        try {
          decodedHashContent = decodeURIComponent(hashContent);
        } catch (e) {
          console.warn("Failed to decodeURIComponent on hash, using as-is", e);
          // Continue with the original hash content
        }
      }
      
      try {
        // Try to decode as base64 first (new format)
        const jsonString = atob(decodedHashContent);
        const params = JSON.parse(jsonString);
        return params as HashQueryParams;
      } catch (firstError) {
        console.warn("Failed to decode hash as base64, trying legacy format", firstError);
        
        // If the base64 decoding fails, try to see if it's the old format or URL-encoded JSON
        try {
          // Try to parse as JSON directly
          if (decodedHashContent.startsWith('{') && decodedHashContent.endsWith('}')) {
            return JSON.parse(decodedHashContent) as HashQueryParams;
          }
        } catch (jsonError) {
          console.warn("Failed to parse as direct JSON", jsonError);
        }
        
        // Finally, try the old URLSearchParams format
        const searchParams = new URLSearchParams(decodedHashContent);
        
        // Extract params using old format
        const query = searchParams.get("q") ? decodeURIComponent(searchParams.get("q")!) : undefined;
        const db = searchParams.get("db") || undefined;
        const table = searchParams.get("table") || undefined;
        const timeField = searchParams.get("tf") || undefined;
        const timeFrom = searchParams.get("from") || undefined;
        const timeTo = searchParams.get("to") || undefined;
        
        return {
          query, 
          db, 
          table, 
          timeField, 
          timeFrom, 
          timeTo
        };
      }
    } catch (error) {
      console.error("Failed to parse hash query params:", error);
      return null;
    }
  }
  
  /**
   * Generate a shareable URL with the current query parameters
   */
  static generateShareableUrl(params: HashQueryParams): string {
    const baseUrl = window.location.origin + window.location.pathname;
    const hashQuery = this.encodeHashQuery(params);
    
    return `${baseUrl}#${hashQuery}`;
  }
  
  /**
   * Create hash params from current state
   */
  static createHashParamsFromState(
    query: string,
    db: string,
    table: string | null,
    timeField: string | null,
    timeRange: TimeRange
  ): HashQueryParams {
    const params: HashQueryParams = {
      query,
      db
    };
    
    if (table) {
      params.table = table;
    }
    
    if (timeField) {
      params.timeField = timeField;
    }
    
    if (timeRange && timeRange.enabled !== false) {
      params.timeFrom = timeRange.from;
      params.timeTo = timeRange.to;
    }
    
    return params;
  }
  
  /**
   * Update browser URL with hash parameters without reloading the page
   */
  static updateBrowserUrlWithParams(params: HashQueryParams): void {
    const hashQuery = this.encodeHashQuery(params);
    window.history.replaceState(
      null, 
      '', 
      `${window.location.pathname}#${hashQuery}`
    );
  }
  
  /**
   * Generate and copy a shareable URL to clipboard
   * @returns Promise that resolves to true if copy was successful, false otherwise
   */
  static async copyShareableUrl(params: HashQueryParams): Promise<boolean> {
    try {
      const url = this.generateShareableUrl(params);
      await navigator.clipboard.writeText(url);
      
      // Also update the browser URL
      this.updateBrowserUrlWithParams(params);
      
      return true;
    } catch (error) {
      console.error("Failed to copy shareable URL:", error);
      return false;
    }
  }
  
  // Helper to clear all URL parameters
  static clearUrlParameters(): void {
    // Set empty hash to clear all parameters
    window.location.hash = '';
  }
  
  // Helper to get URL hash parameters with better error handling
  static getHashParams(): HashQueryParams {
    const hash = window.location.hash.slice(1);
    if (!hash) return {};

    // First check for URL encoding in the entire hash
    let decodedHash = hash;
    if (/%[0-9A-F]{2}/.test(hash)) {
      try {
        decodedHash = decodeURIComponent(hash);
      } catch (e) {
        console.warn("Failed to decode hash with decodeURIComponent", e);
      }
    }

    try {
      // First try to parse as direct JSON if it looks like JSON
      if (decodedHash.startsWith('{') && decodedHash.endsWith('}')) {
        return JSON.parse(decodedHash);
      }
      
      // Try to decode as base64
      try {
        const decoded = atob(decodedHash);
        // Check if the result is valid JSON
        if (decoded.startsWith('{') && decoded.endsWith('}')) {
          return JSON.parse(decoded);
        }
      } catch (base64Error) {
        console.warn("Failed to decode hash as base64", base64Error);
      }
      
      // Fall back to query param parsing
      const params: Record<string, string> = {};
      const urlParams = new URLSearchParams(decodedHash);
      
      urlParams.forEach((value, key) => {
        params[key] = value;
      });
      
      return params;
    } catch (e) {
      console.error('Failed to parse hash parameters:', e);
      // As a last resort, try to decode the URL-encoded JSON form we saw in the example
      if (decodedHash.includes('%22query%22')) {
        try {
          return JSON.parse(decodeURIComponent(decodedHash));
        } catch (lastError) {
          console.error('Last resort parsing failed:', lastError);
        }
      }
      return {};
    }
  }
}

export default HashQueryUtils;
