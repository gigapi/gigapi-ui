import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { toast } from "sonner";
import axios from "axios";

// Types
export type ConnectionState =
  | "disconnected" // Initial state, no connection attempted
  | "connecting" // Attempting connection
  | "connected" // Successfully connected
  | "reconnecting" // Lost connection, attempting reconnect
  | "failed" // Connection failed
  | "empty"; // Connected but no databases

export interface Database {
  database_name: string;
  tables_count?: number;
}

// Generate default API URL based on current location
const getDefaultApiUrl = () => {
  const protocol = window.location.protocol || "http:";
  const hostname = window.location.hostname || "localhost";
  const port = window.location.port;

  const defaultUrl = port
    ? `${protocol}//${hostname}:${port}/query`
    : `${protocol}//${hostname}/query`;

  return defaultUrl;
};

// Get initial value from localStorage or generate default
const getInitialApiUrl = () => {
  const saved = localStorage.getItem("gigapi_connection_url");
  if (saved && saved !== "") {
    return saved;
  }
  return getDefaultApiUrl();
};

export const apiUrlAtom = atomWithStorage<string>(
  "gigapi_connection_url",
  getInitialApiUrl(),
  {
    getItem: (key) => {
      const saved = localStorage.getItem(key);
      if (!saved || saved === "") {
        return getDefaultApiUrl();
      }
      return saved;
    },
    setItem: (key, value) => {
      if (value && value !== "") {
        localStorage.setItem(key, value);
      }
    },
    removeItem: (key) => {
      localStorage.removeItem(key);
    },
  }
);

// Runtime state atoms - these don't persist
export const connectionStateAtom = atom<ConnectionState>("disconnected");
export const databasesAtom = atom<Database[]>([]);
export const connectionErrorAtom = atom<string | null>(null);
const isConnectingAtom = atom<boolean>(false);

// Derived atoms
export const isConnectedAtom = atom(
  (get) => get(connectionStateAtom) === "connected"
);

export const availableDatabasesAtom = atom((get) =>
  get(databasesAtom).map((db) => db.database_name)
);

import {
  databaseListForAIAtom,
  initializeSchemaCacheAtom,
  schemaCacheAtom,
  getLocalStorageCacheAtom,
} from "./database-atoms";

// Validate API URL format
const validateApiUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};

// Main connection action atom
export const connectAtom = atom(null, async (get, set, apiUrl?: string) => {
  const url = apiUrl || get(apiUrlAtom);
  const previousUrl = get(apiUrlAtom);

  // Validate URL
  if (!validateApiUrl(url)) {
    set(connectionErrorAtom, "Invalid API URL format");
    set(connectionStateAtom, "failed");
    toast.error("Invalid API URL format");
    return;
  }

  // Don't reconnect if already connected to same URL
  if (get(connectionStateAtom) === "connected" && !apiUrl) {
    return;
  }

  // Don't connect if already connecting
  if (get(isConnectingAtom)) {
    return;
  }

  // Clear schema cache if connecting to a different instance
  if (apiUrl && apiUrl !== previousUrl) {
    set(schemaCacheAtom, null);
    // Also clear related atoms
    set(databaseListForAIAtom, []);
  }

  set(isConnectingAtom, true);
  set(connectionStateAtom, "connecting");
  set(connectionErrorAtom, null);

  try {
    const response = await axios.post(`${url}?format=json`, {
      query: "SHOW DATABASES",
    });

    const databases =
      response.data.results?.map((item: any) => item.database_name) || [];

    if (databases.length === 0) {
      set(connectionStateAtom, "empty");
      set(databasesAtom, []);
      toast.warning("Connected but no databases found");
    } else {
      set(connectionStateAtom, "connected");
      set(
        databasesAtom,
        databases.map((name: string) => ({ database_name: name }))
      );

      set(databaseListForAIAtom, databases);
      toast.success(`Connected! Found ${databases.length} databases`);

      // Update stored URL if different
      if (apiUrl && apiUrl !== get(apiUrlAtom)) {
        set(apiUrlAtom, apiUrl);
      }

      const directCacheCheck = get(getLocalStorageCacheAtom);

      if (directCacheCheck) {
        // Make sure the atom has the cache loaded
        const atomCache = get(schemaCacheAtom);
        if (!atomCache) {
          set(schemaCacheAtom, directCacheCheck);
        }
      } else {
        // No valid cache, initialize lightweight cache structure

        await set(initializeSchemaCacheAtom);
      }
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Connection failed";

    console.error("🔥 [Connection] Failed:", errorMessage);

    set(connectionStateAtom, "failed");
    set(databasesAtom, []);
    set(connectionErrorAtom, errorMessage);

    toast.error(`Connection failed: ${errorMessage}`);
    throw error;
  } finally {
    set(isConnectingAtom, false);
  }
});
