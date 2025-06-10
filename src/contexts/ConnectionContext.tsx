import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import axios from "axios";
import type { Database, ConnectionState, SavedConnection } from "@/types";
import {
  handleConnectionError,
  safeLocalStorage,
  STORAGE_KEYS,
} from "@/lib/";
import { toast } from "sonner";

interface ConnectionContextType {
  // API configuration
  apiUrl: string;
  setApiUrl: (url: string) => void;

  // Connection state
  connectionState: ConnectionState;
  connectionError: string | null;

  databases: Database[];

  // Connection actions
  connectToApi: (url?: string) => Promise<void>;
  loadDatabases: () => Promise<void>;
  isConnected: boolean;

  // Connection utilities
  testConnection: (url: string) => Promise<boolean>;
}

const ConnectionContext = createContext<ConnectionContextType | undefined>(
  undefined
);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  // API URL state
  const [apiUrl, setApiUrlInternal] = useState(() => {
    const saved = safeLocalStorage.getItem(STORAGE_KEYS.API_URL);
    if (saved) return saved;

    // Default API URL based on current location
    const protocol = window.location.protocol || "http:";
    const hostname = window.location.hostname;
    const port = window.location.port;

    return port
      ? `${protocol}//${hostname}:${port}/query`
      : `${protocol}//${hostname}/query`;
  });

  // Connection state
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [databases, setDatabases] = useState<Database[]>([]);

  // Test connection without changing state
  const testConnection = useCallback(async (url: string): Promise<boolean> => {
    try {
      const response = await axios.post(
        `${url}${url.includes("?") ? "&" : "?"}format=ndjson`,
        { query: "SHOW DATABASES" },
        { timeout: 10000, responseType: "text" }
      );

      const contentType = response.headers["content-type"];
      if (!contentType || !contentType.includes("application/x-ndjson")) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }, []);

  // Load databases only (without changing connection state)
  const loadDatabases = useCallback(async () => {
    if (!apiUrl) return;

    try {
      const response = await axios.post(
        `${apiUrl}${apiUrl.includes("?") ? "&" : "?"}format=ndjson`,
        { query: "SHOW DATABASES" },
        { timeout: 60000, responseType: "text" }
      );

      const contentType = response.headers["content-type"];
      if (!contentType || !contentType.includes("application/x-ndjson")) {
        throw new Error(
          "API response is not NDJSON, please update your GigAPI server"
        );
      }

      const lines = response.data
        .split(/\r?\n/)
        .filter((line: string) => line.trim().length > 0);

      const dbList = lines
        .map((line: string) => {
          try {
            return JSON.parse(line);
          } catch (e) {
            console.warn("Error parsing NDJSON line:", line);
            return null;
          }
        })
        .filter(Boolean);

      setDatabases(dbList);
    } catch (err: any) {
      console.error("Failed to load databases:", err);
      const connectionError = handleConnectionError(err, apiUrl);
      toast.error(`Failed to load databases: ${connectionError.message}`);
    }
  }, [apiUrl]);

  // Connect to API and load databases
  const connectToApi = useCallback(
    async (urlToConnect?: string) => {
      const targetUrl = urlToConnect || apiUrl;

      setConnectionState("connecting");
      setConnectionError(null);
      setDatabases([]);

      try {
        const response = await axios.post(
          `${targetUrl}${targetUrl.includes("?") ? "&" : "?"}format=ndjson`,
          { query: "SHOW DATABASES" },
          { timeout: 60000, responseType: "text" }
        );

        const contentType = response.headers["content-type"];
        if (!contentType || !contentType.includes("application/x-ndjson")) {
          throw new Error(
            "API response is not NDJSON, please update your GigAPI server"
          );
        }

        const lines = response.data
          .split(/\r?\n/)
          .filter((line: string) => line.trim().length > 0);

        const dbList = lines
          .map((line: string) => {
            try {
              return JSON.parse(line);
            } catch (e) {
              console.warn("Error parsing NDJSON line:", line);
              return null;
            }
          })
          .filter(Boolean);

        if (dbList.length > 0) {
          setDatabases(dbList);
          setConnectionState("connected");
          setConnectionError(null);

          toast.success(
            `Connected to API at ${targetUrl} with ${dbList.length} databases`
          );

          // Save connection info
          const connection = {
            apiUrl: targetUrl,
            lastConnected: new Date().toISOString(),
            databases: dbList.length,
          };
          safeLocalStorage.setJSON(STORAGE_KEYS.CONNECTION, connection);

          // Update API URL if it was provided
          if (urlToConnect && urlToConnect !== apiUrl) {
            setApiUrlInternal(targetUrl);
            safeLocalStorage.setItem(STORAGE_KEYS.API_URL, targetUrl);
          }
        } else {
          setConnectionState("empty");
          setConnectionError("No databases found on the server");
          setDatabases([]);
        }
      } catch (err: any) {
        console.error("Failed to connect to API:", err);
        const connectionError = handleConnectionError(err, targetUrl);
        setConnectionState("error");
        setConnectionError(connectionError.message);
        setDatabases([]);
      }
    },
    [apiUrl]
  );

  // Public API URL setter
  const setApiUrl = useCallback(
    (newUrl: string) => {
      if (newUrl !== apiUrl) {
        setApiUrlInternal(newUrl);
        safeLocalStorage.setItem(STORAGE_KEYS.API_URL, newUrl);
        // Trigger a reconnect when the API URL changes
        connectToApi(newUrl).catch(console.error);
      }
    },
    [apiUrl, connectToApi]
  );

  // Computed values
  const isConnected = connectionState === "connected" && databases.length > 0;

  // Auto-connect on mount
  useEffect(() => {
    const savedConnection = safeLocalStorage.getJSON<
      SavedConnection | undefined
    >(STORAGE_KEYS.CONNECTION, undefined);

    // Try to connect to saved API URL first, otherwise use current apiUrl
    const urlToConnect = savedConnection?.apiUrl || apiUrl;
    connectToApi(urlToConnect).catch(console.error);
  }, []);

  const value: ConnectionContextType = {
    apiUrl,
    setApiUrl,
    connectionState,
    connectionError,
    databases,
    connectToApi,
    loadDatabases,
    isConnected,
    testConnection,
  };

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  const context = useContext(ConnectionContext);
  if (context === undefined) {
    throw new Error("useConnection must be used within a ConnectionProvider");
  }
  return context;
}
