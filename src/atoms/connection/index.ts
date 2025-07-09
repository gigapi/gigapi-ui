import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

// Types
export type ConnectionState = 
  | "disconnected"  // Initial state, no connection attempted
  | "connecting"    // Attempting connection  
  | "connected"     // Successfully connected
  | "reconnecting"  // Lost connection, attempting reconnect
  | "failed"        // Connection failed
  | "empty";        // Connected but no databases

export interface Database {
  database_name: string;
  tables_count?: number;
}

export interface ConnectionHealth {
  lastCheck: Date;
  responseTime: number;
  isHealthy: boolean;
  errorCount: number;
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
  console.log("🔥 [Connection] No saved API URL, generating default");
  return getDefaultApiUrl();
};

// Storage atoms - these persist in localStorage - Fixed to not add extra quotes
export const apiUrlAtom = atomWithStorage<string>(
  "gigapi_connection_url",
  getInitialApiUrl(), // Get from storage immediately
  {
    getItem: (key) => {
      const saved = localStorage.getItem(key);
      // If saved is empty string or null, use default
      if (!saved || saved === "") {
        return getDefaultApiUrl();
      }
      return saved;
    },
    setItem: (key, value) => {
      // Don't save empty values
      if (value && value !== "") {
        localStorage.setItem(key, value);
      }
    },
    removeItem: (key) => {
      localStorage.removeItem(key);
    },
  }
);

export const lastConnectionStatusAtom = atomWithStorage<ConnectionState>(
  "gigapi_connection_status", 
  "disconnected"
);

// Runtime state atoms - these don't persist
export const connectionStateAtom = atom<ConnectionState>("disconnected");
export const databasesAtom = atom<Database[]>([]);
export const connectionErrorAtom = atom<string | null>(null);
export const connectionHealthAtom = atom<ConnectionHealth | null>(null);
export const isConnectingAtom = atom<boolean>(false);

// Derived atoms
export const isConnectedAtom = atom(
  (get) => get(connectionStateAtom) === "connected"
);

export const availableDatabasesAtom = atom(
  (get) => get(databasesAtom).map(db => db.database_name)
);

// Connection retry logic
export const retryCountAtom = atom<number>(0);
export const maxRetriesAtom = atom<number>(3);
export const retryDelayAtom = atom<number>(2000); // Start with 2 seconds

