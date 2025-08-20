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

export interface Connection {
  id: string;
  name: string;
  url: string;
  state: ConnectionState;
  databases: Database[];
  error?: string | null;
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

// Multiple connections storage
export const connectionsAtom = atomWithStorage<Connection[]>(
  "gigapi_connections",
  [
    {
      id: "default",
      name: "Default Connection",
      url: getInitialApiUrl(),
      state: "disconnected",
      databases: [],
      error: null,
    },
  ]
);

// Selected connection ID
export const selectedConnectionIdAtom = atomWithStorage<string>(
  "gigapi_selected_connection",
  "default"
);

// Derived atom for selected connection
export const selectedConnectionAtom = atom<Connection | null>((get) => {
  const connections = get(connectionsAtom);
  const selectedId = get(selectedConnectionIdAtom);
  return connections.find((c) => c.id === selectedId) || null;
});

// Derived atom for current API URL (for backward compatibility)
export const apiUrlAtom = atom(
  (get) => {
    const selected = get(selectedConnectionAtom);
    return selected?.url || getDefaultApiUrl();
  },
  (get, set, newUrl: string) => {
    const connections = get(connectionsAtom);
    const selectedId = get(selectedConnectionIdAtom);
    const updatedConnections = connections.map((c) =>
      c.id === selectedId ? { ...c, url: newUrl } : c
    );
    set(connectionsAtom, updatedConnections);
  }
);

// Runtime state atoms - these don't persist
export const connectionStateAtom = atom<ConnectionState>((get) => {
  const selected = get(selectedConnectionAtom);
  return selected?.state || "disconnected";
});

export const databasesAtom = atom<Database[]>((get) => {
  const selected = get(selectedConnectionAtom);
  return selected?.databases || [];
});

export const connectionErrorAtom = atom<string | null>((get) => {
  const selected = get(selectedConnectionAtom);
  return selected?.error || null;
});

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

// Update connection state in storage
const updateConnectionState = atom(
  null,
  (get, set, update: Partial<Connection> & { id: string }) => {
    const connections = get(connectionsAtom);
    const updatedConnections = connections.map((c) =>
      c.id === update.id ? { ...c, ...update } : c
    );
    set(connectionsAtom, updatedConnections);
  }
);

// Main connection action atom
export const connectAtom = atom(
  null,
  async (get, set, options?: { connectionId?: string; url?: string }) => {
    const connectionId = options?.connectionId || get(selectedConnectionIdAtom);
    const connection = get(connectionsAtom).find((c) => c.id === connectionId);
    
    if (!connection) {
      toast.error("Connection not found");
      return;
    }

    const url = options?.url || connection.url;
    const previousUrl = connection.url;

    // Validate URL
    if (!validateApiUrl(url)) {
      set(updateConnectionState, {
        id: connectionId,
        state: "failed",
        error: "Invalid API URL format",
      });
      toast.error("Invalid API URL format");
      return;
    }

    // Don't reconnect if already connected to same URL
    if (connection.state === "connected" && !options?.url) {
      return;
    }

    // Don't connect if already connecting
    if (get(isConnectingAtom)) {
      return;
    }

    // Clear schema cache if connecting to a different instance
    if (options?.url && options.url !== previousUrl) {
      set(schemaCacheAtom, null);
      // Also clear related atoms
      set(databaseListForAIAtom, []);
    }

    set(isConnectingAtom, true);
    set(updateConnectionState, {
      id: connectionId,
      state: "connecting",
      error: null,
    });

    try {
      const response = await axios.post(`${url}?format=json`, {
        query: "SHOW DATABASES",
      });

      const databases =
        response.data.results?.map((item: any) => item.database_name) || [];

      if (databases.length === 0) {
        set(updateConnectionState, {
          id: connectionId,
          state: "empty",
          databases: [],
        });
        toast.warning("Connected but no databases found");
      } else {
        set(updateConnectionState, {
          id: connectionId,
          state: "connected",
          databases: databases.map((name: string) => ({
            database_name: name,
          })),
          url: url,
        });

        set(databaseListForAIAtom, databases);
        toast.success(`Connected! Found ${databases.length} databases`);

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

      set(updateConnectionState, {
        id: connectionId,
        state: "failed",
        databases: [],
        error: errorMessage,
      });

      toast.error(`Connection failed: ${errorMessage}`);
      throw error;
    } finally {
      set(isConnectingAtom, false);
    }
  }
);

// Actions for managing connections
export const addConnectionAtom = atom(
  null,
  (get, set, connection: Omit<Connection, "id" | "state" | "databases" | "error">) => {
    const connections = get(connectionsAtom);
    const newConnection: Connection = {
      ...connection,
      id: Date.now().toString(),
      state: "disconnected",
      databases: [],
      error: null,
    };
    set(connectionsAtom, [...connections, newConnection]);
    return newConnection.id;
  }
);

export const removeConnectionAtom = atom(null, (get, set, connectionId: string) => {
  const connections = get(connectionsAtom);
  const filtered = connections.filter((c) => c.id !== connectionId);
  
  // Ensure at least one connection remains
  if (filtered.length === 0) {
    toast.error("Cannot remove the last connection");
    return;
  }
  
  // If removing selected connection, switch to first available
  if (get(selectedConnectionIdAtom) === connectionId) {
    set(selectedConnectionIdAtom, filtered[0].id);
  }
  
  set(connectionsAtom, filtered);
  toast.success("Connection removed");
});

export const updateConnectionAtom = atom(
  null,
  (get, set, connectionId: string, updates: Partial<Omit<Connection, "id">>) => {
    const connections = get(connectionsAtom);
    const updated = connections.map((c) =>
      c.id === connectionId ? { ...c, ...updates } : c
    );
    set(connectionsAtom, updated);
  }
);
