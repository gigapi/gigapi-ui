import type { HashQueryParams } from "@/types/utils.types";

/**
 * URL query utilities for handling shared URLs using query parameters
 */
export class HashQueryUtils {
  /**
   * Encode query parameters into URL-safe base64 string
   */
  static encodeHashQuery(params: HashQueryParams): string {
    const validParams: Record<string, string> = {};
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        validParams[key] = String(value);
      }
    });

    if (Object.keys(validParams).length === 0) return "";
    
    // Use URL-safe base64 encoding
    const jsonString = JSON.stringify(validParams);
    const base64 = btoa(jsonString);
    // Make it URL-safe by replacing + with - and / with _
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  /**
   * Decode query parameters from URL query string
   */
  static decodeHashQuery(): HashQueryParams | null {
    try {
      // Get URL search parameters
      const urlParams = new URLSearchParams(window.location.search);
      const queryParam = urlParams.get('q');
      
      if (!queryParam) return null;

      let cleanQuery = queryParam.trim();
      
      // Convert URL-safe base64 back to regular base64
      cleanQuery = cleanQuery.replace(/-/g, '+').replace(/_/g, '/');
      
      // Add padding if needed
      while (cleanQuery.length % 4) {
        cleanQuery += '=';
      }
      
      const decoded = atob(cleanQuery);
      const parsed = JSON.parse(decoded);
      
      // Validate the parsed object has expected structure
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as HashQueryParams;
      }
      
      return null;
    } catch (error) {
      console.warn("Failed to decode query parameter:", error);
      console.warn("URL was:", window.location.href);
      return null;
    }
  }

  /**
   * Update URL with new query parameters
   */
  static updateHash(params: HashQueryParams): void {
    const encoded = this.encodeHashQuery(params);
    if (encoded) {
      const url = new URL(window.location.href);
      url.searchParams.set('q', encoded);
      window.history.replaceState(null, '', url.toString());
    } else {
      const url = new URL(window.location.href);
      url.searchParams.delete('q');
      window.history.replaceState(null, '', url.toString());
    }
  }

  /**
   * Clear URL query parameters
   */
  static clearHash(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('q');
    window.history.replaceState(null, '', url.toString());
  }

  /**
   * Generate a shareable URL with current query parameters
   */
  static generateShareableUrl(params: HashQueryParams): string {
    const encoded = this.encodeHashQuery(params);
    const baseUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
    return encoded ? `${baseUrl}?q=${encoded}` : baseUrl;
  }

  /**
   * Copy shareable URL to clipboard
   */
  static async copyShareableUrl(params: HashQueryParams): Promise<boolean> {
    try {
      const url = this.generateShareableUrl(params);
      await navigator.clipboard.writeText(url);
      return true;
    } catch (error) {
      console.error("Failed to copy URL to clipboard:", error);
      return false;
    }
  }

  /**
   * Test encoding and decoding with a sample object (for debugging)
   */
  static testEncodeDecode(params: HashQueryParams): void {
    const encoded = this.encodeHashQuery(params);
    
    // Temporarily set the query param to test decoding
    const originalUrl = window.location.href;
    const url = new URL(window.location.href);
    url.searchParams.set('q', encoded);
    window.history.replaceState(null, '', url.toString());
    
    // Restore original URL
    window.history.replaceState(null, '', originalUrl);
  }
}
