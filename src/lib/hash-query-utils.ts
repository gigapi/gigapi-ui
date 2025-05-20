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
    
    // Convert to JSON and base64 encode
    const jsonString = JSON.stringify(cleanParams);
    const base64String = btoa(encodeURIComponent(jsonString));
    
    return base64String;
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
      
      try {
        // Try to decode as base64 first (new format)
        const jsonString = decodeURIComponent(atob(hashContent));
        const params = JSON.parse(jsonString);
        return params as HashQueryParams;
      } catch (firstError) {        
        const searchParams = new URLSearchParams(hashContent);
        
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
  
  // Helper to get URL hash parameters
  static getHashParams(): any {
    const hash = window.location.hash.slice(1);
    if (!hash) return {};

    try {
      // First try to decode base64 if it's a base64 string
      if (hash.match(/^[A-Za-z0-9+/=]+$/)) {
        const decoded = atob(hash);
        return JSON.parse(decoded);
      } 
      // Fall back to query param parsing
      else {
        const params: Record<string, string> = {};
        const urlParams = new URLSearchParams(hash);
        
        urlParams.forEach((value, key) => {
          params[key] = value;
        });
        
        return params;
      }
    } catch (e) {
      console.error('Failed to parse hash parameters:', e);
      return {};
    }
  }
}

export default HashQueryUtils;
