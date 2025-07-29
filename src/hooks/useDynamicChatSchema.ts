import { useAtom, useSetAtom } from "jotai";
import { atom } from "jotai";
import { useCallback, useRef, useEffect } from "react";
import {
  fetchFreshDatabasesAtom,
  fetchFreshTablesAtom,
  fetchFreshSchemaAtom,
  freshDatabasesAtom,
  freshTablesAtom,
  freshSchemaAtom,
  freshDatabasesLoadingAtom,
  freshTablesLoadingAtom,
  freshSchemaLoadingAtom,
} from "@/atoms";

// Short-term cache for chat mentions (5 minutes)
const CHAT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface ChatSchemaCache {
  databases: CacheEntry<string[]> | null;
  tables: Record<string, CacheEntry<string[]>>;
  schemas: Record<string, CacheEntry<any[]>>;
}

// Chat-specific cache atoms with short TTL
const chatSchemaCacheAtom = atom<ChatSchemaCache>({
  databases: null,
  tables: {},
  schemas: {},
});

const clearExpiredCacheAtom = atom(null, (get, set) => {
  const cache = get(chatSchemaCacheAtom);
  const now = Date.now();
  
  const updatedCache: ChatSchemaCache = {
    databases: cache.databases && (now - cache.databases.timestamp < CHAT_CACHE_TTL) 
      ? cache.databases 
      : null,
    tables: {},
    schemas: {},
  };
  
  // Clean expired table cache
  Object.entries(cache.tables).forEach(([key, entry]) => {
    if (now - entry.timestamp < CHAT_CACHE_TTL) {
      updatedCache.tables[key] = entry;
    }
  });
  
  // Clean expired schema cache
  Object.entries(cache.schemas).forEach(([key, entry]) => {
    if (now - entry.timestamp < CHAT_CACHE_TTL) {
      updatedCache.schemas[key] = entry;
    }
  });
  
  set(chatSchemaCacheAtom, updatedCache);
});

export interface ChatSchemaData {
  databases: string[];
  tables: Record<string, string[]>;
  schemas: Record<string, any[]>;
  isLoading: boolean;
  error: string | null;
  refreshDatabases: () => Promise<string[]>;
  refreshTables: (database: string) => Promise<string[]>;
  refreshSchema: (database: string, table: string) => Promise<any[]>;
  clearCache: () => void;
}

/**
 * Hook for chat interface schema data with short-term caching
 * Provides fresh data for @mentions while maintaining performance
 */
export function useDynamicChatSchema(): ChatSchemaData {
  const [cache, setCache] = useAtom(chatSchemaCacheAtom);
  const clearExpiredCache = useSetAtom(clearExpiredCacheAtom);
  
  // Fresh data atoms
  const [freshDatabases] = useAtom(freshDatabasesAtom);
  const [freshTables] = useAtom(freshTablesAtom);
  const [freshSchema] = useAtom(freshSchemaAtom);
  
  // Loading states
  const [databasesLoading] = useAtom(freshDatabasesLoadingAtom);
  const [tablesLoading] = useAtom(freshTablesLoadingAtom);
  const [schemaLoading] = useAtom(freshSchemaLoadingAtom);
  
  // Fetch functions
  const fetchDatabases = useSetAtom(fetchFreshDatabasesAtom);
  const fetchTables = useSetAtom(fetchFreshTablesAtom);
  const fetchSchema = useSetAtom(fetchFreshSchemaAtom);
  
  // Debounce refs to prevent excessive API calls
  const debounceRefs = useRef<{
    databases?: NodeJS.Timeout;
    tables: Record<string, NodeJS.Timeout>;
    schemas: Record<string, NodeJS.Timeout>;
  }>({
    tables: {},
    schemas: {},
  });
  
  // Clear expired cache entries when the hook mounts or cache changes
  useEffect(() => {
    clearExpiredCache();
  }, [clearExpiredCache]);
  
  // Refresh databases with caching and debouncing
  const refreshDatabases = useCallback(async (): Promise<string[]> => {
    // Check cache first
    if (cache.databases && Date.now() - cache.databases.timestamp < CHAT_CACHE_TTL) {
      return cache.databases.data;
    }
    
    // Debounce rapid calls
    if (debounceRefs.current.databases) {
      clearTimeout(debounceRefs.current.databases);
    }
    
    return new Promise((resolve) => {
      debounceRefs.current.databases = setTimeout(async () => {
        try {
          const databases = await fetchDatabases();
          
          // Update cache
          setCache(prev => ({
            ...prev,
            databases: {
              data: databases,
              timestamp: Date.now(),
            },
          }));
          
          resolve(databases);
        } catch (error) {
          console.error("[Chat Schema] Failed to fetch databases:", error);
          resolve([]);
        }
      }, 300); // 300ms debounce
    });
  }, [cache.databases, fetchDatabases, setCache]);
  
  // Refresh tables with caching and debouncing
  const refreshTables = useCallback(async (database: string): Promise<string[]> => {
    if (!database) return [];
    
    const cacheKey = database;
    const cachedTables = cache.tables[cacheKey];
    
    // Check cache first
    if (cachedTables && Date.now() - cachedTables.timestamp < CHAT_CACHE_TTL) {
      return cachedTables.data;
    }
    
    // Debounce rapid calls
    if (debounceRefs.current.tables[cacheKey]) {
      clearTimeout(debounceRefs.current.tables[cacheKey]);
    }
    
    return new Promise((resolve) => {
      debounceRefs.current.tables[cacheKey] = setTimeout(async () => {
        try {
          const tables = await fetchTables(database);
          
          // Update cache
          setCache(prev => ({
            ...prev,
            tables: {
              ...prev.tables,
              [cacheKey]: {
                data: tables,
                timestamp: Date.now(),
              },
            },
          }));
          
          resolve(tables);
        } catch (error) {
          console.error(`[Chat Schema] Failed to fetch tables for ${database}:`, error);
          resolve([]);
        }
      }, 300); // 300ms debounce
    });
  }, [cache.tables, fetchTables, setCache]);
  
  // Refresh schema with caching and debouncing
  const refreshSchema = useCallback(async (database: string, table: string): Promise<any[]> => {
    if (!database || !table) return [];
    
    const cacheKey = `${database}.${table}`;
    const cachedSchema = cache.schemas[cacheKey];
    
    // Check cache first
    if (cachedSchema && Date.now() - cachedSchema.timestamp < CHAT_CACHE_TTL) {
      return cachedSchema.data;
    }
    
    // Debounce rapid calls
    if (debounceRefs.current.schemas[cacheKey]) {
      clearTimeout(debounceRefs.current.schemas[cacheKey]);
    }
    
    return new Promise((resolve) => {
      debounceRefs.current.schemas[cacheKey] = setTimeout(async () => {
        try {
          const schema = await fetchSchema({ database, table });
          
          // Update cache
          setCache(prev => ({
            ...prev,
            schemas: {
              ...prev.schemas,
              [cacheKey]: {
                data: schema,
                timestamp: Date.now(),
              },
            },
          }));
          
          resolve(schema);
        } catch (error) {
          console.error(`[Chat Schema] Failed to fetch schema for ${database}.${table}:`, error);
          resolve([]);
        }
      }, 300); // 300ms debounce
    });
  }, [cache.schemas, fetchSchema, setCache]);
  
  // Clear all cache
  const clearCache = useCallback(() => {
    setCache({
      databases: null,
      tables: {},
      schemas: {},
    });
    
    // Clear debounce timers
    if (debounceRefs.current.databases) {
      clearTimeout(debounceRefs.current.databases);
    }
    Object.values(debounceRefs.current.tables).forEach(clearTimeout);
    Object.values(debounceRefs.current.schemas).forEach(clearTimeout);
    
    debounceRefs.current = { tables: {}, schemas: {} };
  }, [setCache]);
  
  // Build current data from cache and fresh atoms
  const databases = cache.databases?.data || freshDatabases;
  
  const tables: Record<string, string[]> = {};
  Object.entries(cache.tables).forEach(([db, entry]) => {
    tables[db] = entry.data;
  });
  
  const schemas: Record<string, any[]> = {};
  Object.entries(cache.schemas).forEach(([key, entry]) => {
    schemas[key] = entry.data;
  });
  
  return {
    databases,
    tables,
    schemas,
    isLoading: databasesLoading || tablesLoading || schemaLoading,
    error: null, // Could add error handling if needed
    refreshDatabases,
    refreshTables,
    refreshSchema,
    clearCache,
  };
}