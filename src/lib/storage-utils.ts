/**
 * Storage utilities for managing localStorage with size limits and compression
 */

import pako from 'pako';

export interface StorageOptions {
  maxSizeBytes?: number;
  compress?: boolean;
  maxRowsPerArtifact?: number;
}

const DEFAULT_OPTIONS: StorageOptions = {
  maxSizeBytes: 5 * 1024 * 1024, // 5MB per key
  compress: true,
  maxRowsPerArtifact: 1000,
};

export class StorageUtils {
  /**
   * Compress data using gzip
   */
  static compress(data: string): string {
    try {
      const compressed = pako.deflate(data, { level: 6 });
      return btoa(String.fromCharCode.apply(null, Array.from(compressed)));
    } catch (error) {
      console.error('Compression failed:', error);
      return data;
    }
  }

  /**
   * Decompress gzipped data
   */
  static decompress(data: string): string {
    try {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const decompressed = pako.inflate(bytes);
      return new TextDecoder().decode(decompressed);
    } catch (error) {
      console.error('Decompression failed:', error);
      return data;
    }
  }

  /**
   * Get size of string in bytes
   */
  static getByteSize(str: string): number {
    return new Blob([str]).size;
  }

  /**
   * Save data to localStorage with size limits and optional compression
   */
  static saveToStorage(
    key: string,
    data: any,
    options: StorageOptions = DEFAULT_OPTIONS
  ): boolean {
    try {
      let stringData = JSON.stringify(data);
      const originalSize = this.getByteSize(stringData);

      // Check if compression is needed
      if (options.compress && originalSize > 1024) { // Only compress if > 1KB
        const compressed = this.compress(stringData);
        const compressedSize = this.getByteSize(compressed);
        
        // Only use compression if it actually reduces size
        if (compressedSize < originalSize) {
          stringData = JSON.stringify({
            __compressed: true,
            data: compressed,
            originalSize,
            compressedSize,
          });
        }
      }

      // Check size limit
      const finalSize = this.getByteSize(stringData);
      if (options.maxSizeBytes && finalSize > options.maxSizeBytes) {
        console.warn(`Storage size limit exceeded for key ${key}: ${finalSize} > ${options.maxSizeBytes}`);
        return false;
      }

      localStorage.setItem(key, stringData);
      return true;
    } catch (error) {
      console.error('Failed to save to storage:', error);
      return false;
    }
  }

  /**
   * Load data from localStorage with automatic decompression
   */
  static loadFromStorage<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;

      const parsed = JSON.parse(item);
      
      // Check if data is compressed
      if (parsed.__compressed && parsed.data) {
        const decompressed = this.decompress(parsed.data);
        return JSON.parse(decompressed);
      }

      return parsed;
    } catch (error) {
      console.error('Failed to load from storage:', error);
      return null;
    }
  }

  /**
   * Truncate array data to maximum rows
   */
  static truncateData(data: any[], maxRows: number): { data: any[], truncated: boolean } {
    if (data.length <= maxRows) {
      return { data, truncated: false };
    }

    return {
      data: data.slice(0, maxRows),
      truncated: true,
    };
  }

  /**
   * Get total localStorage usage
   */
  static getStorageUsage(): { used: number, total: number, percentage: number } {
    let totalSize = 0;
    
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        totalSize += this.getByteSize(localStorage.getItem(key) || '');
      }
    }

    // Browsers typically allow 5-10MB for localStorage
    const estimatedTotal = 10 * 1024 * 1024; // 10MB
    
    return {
      used: totalSize,
      total: estimatedTotal,
      percentage: (totalSize / estimatedTotal) * 100,
    };
  }

  /**
   * Clean up old sessions based on age
   */
  static cleanupOldSessions(maxAgeDays: number = 30): number {
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let cleaned = 0;

    // Look for session keys
    const sessionKeys = Object.keys(localStorage).filter(key => 
      key.includes('chat_sessions') || key.includes('query_history')
    );

    sessionKeys.forEach(key => {
      try {
        const data = this.loadFromStorage<any>(key);
        if (data && typeof data === 'object') {
          // Check for session objects
          Object.entries(data).forEach(([sessionId, session]: [string, any]) => {
            const updatedAt = new Date(session.updatedAt || session.createdAt || 0).getTime();
            if (now - updatedAt > maxAgeMs) {
              delete data[sessionId];
              cleaned++;
            }
          });

          // Save back if any were removed
          if (cleaned > 0) {
            this.saveToStorage(key, data);
          }
        }
      } catch (error) {
        console.error(`Failed to clean up ${key}:`, error);
      }
    });

    return cleaned;
  }

  /**
   * Get storage statistics
   */
  static getStorageStats(): {
    totalKeys: number,
    largestKey: { key: string, size: number } | null,
    sessionCount: number,
    usage: { used: number, total: number, percentage: number }
  } {
    const keys = Object.keys(localStorage);
    let largestKey: { key: string, size: number } | null = null;
    let sessionCount = 0;

    keys.forEach(key => {
      const size = this.getByteSize(localStorage.getItem(key) || '');
      
      if (!largestKey || size > largestKey.size) {
        largestKey = { key, size };
      }

      if (key.includes('chat_sessions')) {
        try {
          const sessions = this.loadFromStorage<any>(key);
          if (sessions && typeof sessions === 'object') {
            sessionCount += Object.keys(sessions).length;
          }
        } catch (error) {
          // Ignore parse errors
        }
      }
    });

    return {
      totalKeys: keys.length,
      largestKey,
      sessionCount,
      usage: this.getStorageUsage(),
    };
  }
}