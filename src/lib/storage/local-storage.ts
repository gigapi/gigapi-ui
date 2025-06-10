import type { StorageInfo } from "@/types/utils.types";

/**
 * Type-safe localStorage wrapper with comprehensive error handling
 */
export const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn(`Failed to get localStorage item '${key}':`, error);
      return null;
    }
  },

  setItem: (key: string, value: string): boolean => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn(`Failed to set localStorage item '${key}':`, error);
      return false;
    }
  },

  removeItem: (key: string): boolean => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn(`Failed to remove localStorage item '${key}':`, error);
      return false;
    }
  },

  clear: (): boolean => {
    try {
      localStorage.clear();
      return true;
    } catch (error) {
      console.warn("Failed to clear localStorage:", error);
      return false;
    }
  },

  // JSON helpers with type safety
  getJSON: <T>(key: string, defaultValue: T): T => {
    try {
      const item = localStorage.getItem(key);
      if (item === null) return defaultValue;

      const parsed = JSON.parse(item);
      return parsed !== null ? parsed : defaultValue;
    } catch (error) {
      console.warn(`Failed to parse JSON from localStorage '${key}':`, error);
      return defaultValue;
    }
  },

  setJSON: <T>(key: string, value: T): boolean => {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(key, serialized);
      return true;
    } catch (error) {
      console.warn(
        `Failed to stringify and set localStorage item '${key}':`,
        error
      );
      return false;
    }
  },

  // Check if localStorage is available
  isAvailable: (): boolean => {
    try {
      const test = "__test__";
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  },

  // Get storage usage information
  getStorageInfo: (): StorageInfo => {
    let used = 0;
    let available = 0;

    try {
      // Estimate used space
      for (const key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          used += localStorage[key].length + key.length;
        }
      }

      // Try to estimate available space (rough approximation)
      const testKey = "__size_test__";
      let testSize = 1024;
      try {
        while (testSize < 10 * 1024 * 1024) {
          const testData = "a".repeat(testSize);
          localStorage.setItem(testKey, testData);
          testSize *= 2;
        }
      } catch {
        available = testSize / 2;
      }

      localStorage.removeItem(testKey);
    } catch (error) {
      console.warn("Failed to get storage info:", error);
    }

    const total = used + available;
    return {
      used,
      available,
      total,
      percentage: total > 0 ? (used / total) * 100 : 0,
    };
  },

  // Cleanup old entries (useful for history management)
  cleanupOldEntries: (keyPattern: string, maxAge: number): number => {
    let cleaned = 0;
    const cutoff = Date.now() - maxAge;

    try {
      const keysToRemove: string[] = [];

      for (const key in localStorage) {
        if (key.includes(keyPattern)) {
          const item = localStorage.getItem(key);
          if (item) {
            try {
              const data = JSON.parse(item);
              if (data.timestamp && data.timestamp < cutoff) {
                keysToRemove.push(key);
              }
            } catch {
              // If not JSON or doesn't have timestamp, skip
            }
          }
        }
      }

      keysToRemove.forEach((key) => {
        localStorage.removeItem(key);
        cleaned++;
      });
    } catch (error) {
      console.warn("Failed to cleanup old entries:", error);
    }

    return cleaned;
  },
};
