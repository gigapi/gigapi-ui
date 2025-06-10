import type { HashQueryParams } from "@/types/utils.types";

/**
 * Hash query utilities for handling shared URLs
 */
export class HashQueryUtils {
  /**
   * Encode query parameters into URL hash
   */
  static encodeHashQuery(params: HashQueryParams): string {
    const validParams: Record<string, string> = {};
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        validParams[key] = String(value);
      }
    });

    if (Object.keys(validParams).length === 0) return "";
    
    return btoa(JSON.stringify(validParams));
  }

  /**
   * Decode query parameters from URL hash
   */
  static decodeHashQuery(): HashQueryParams | null {
    try {
      const hash = window.location.hash.slice(1);
      if (!hash) return null;

      const decoded = atob(hash);
      const parsed = JSON.parse(decoded);
      
      // Validate the parsed object has expected structure
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as HashQueryParams;
      }
      
      return null;
    } catch (error) {
      console.warn("Failed to decode hash query:", error);
      return null;
    }
  }

  /**
   * Update URL hash with new query parameters
   */
  static updateHash(params: HashQueryParams): void {
    const encoded = this.encodeHashQuery(params);
    if (encoded) {
      window.location.hash = encoded;
    } else {
      window.location.hash = "";
    }
  }

  /**
   * Clear URL hash
   */
  static clearHash(): void {
    window.location.hash = "";
  }

  /**
   * Generate a shareable URL with current query parameters
   */
  static generateShareableUrl(params: HashQueryParams): string {
    const encoded = this.encodeHashQuery(params);
    const baseUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
    return encoded ? `${baseUrl}#${encoded}` : baseUrl;
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
}
