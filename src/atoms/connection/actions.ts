import { atom } from "jotai";
import {
  connectionStateAtom,
  connectionErrorAtom,
  databasesAtom,
  apiUrlAtom,
  connectionHealthAtom,
  retryCountAtom,
  retryDelayAtom,
  isConnectingAtom,
} from "./index";
import { toast } from "sonner";

import { gigapiClient } from "@/lib/api/gigapi-client";
import { databaseListForAIAtom } from "../database-atoms";

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
  console.log("🔥 [Connection] Connecting to:", url);

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

  set(isConnectingAtom, true);
  set(connectionStateAtom, "connecting");
  set(connectionErrorAtom, null);

  const startTime = Date.now();

  try {
    const { databases } = await gigapiClient.testConnection(url);
    const responseTime = Date.now() - startTime;

    // Update health info
    set(connectionHealthAtom, {
      lastCheck: new Date(),
      responseTime,
      isHealthy: true,
      errorCount: 0,
    });

    // Reset retry count on success
    set(retryCountAtom, 0);

    if (databases.length === 0) {
      set(connectionStateAtom, "empty");
      set(databasesAtom, []);
      toast.warning("Connected but no databases found");
    } else {
      set(connectionStateAtom, "connected");
      set(
        databasesAtom,
        databases.map((name) => ({ database_name: name }))
      );
      
      // Save databases for AI/MCP use
      set(databaseListForAIAtom, databases);
      toast.success(`Connected! Found ${databases.length} databases`);

      // Update stored URL if different
      if (apiUrl && apiUrl !== get(apiUrlAtom)) {
        set(apiUrlAtom, apiUrl);
      }
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Connection failed";
    
    console.error("🔥 [Connection] Failed:", errorMessage);

    // Update health info
    const currentHealth = get(connectionHealthAtom);
    set(connectionHealthAtom, {
      lastCheck: new Date(),
      responseTime,
      isHealthy: false,
      errorCount: (currentHealth?.errorCount || 0) + 1,
    });

    set(connectionStateAtom, "failed");
    set(databasesAtom, []);
    set(connectionErrorAtom, errorMessage);

    toast.error(`Connection failed: ${errorMessage}`);
    throw error;
  } finally {
    set(isConnectingAtom, false);
  }
});

// Retry connection with exponential backoff
export const retryConnectionAtom = atom(null, async (get, set) => {
  const retryCount = get(retryCountAtom);
  const maxRetries = 3;

  if (retryCount >= maxRetries) {
    toast.error("Maximum retry attempts reached");
    return;
  }

  const delay = get(retryDelayAtom) * Math.pow(2, retryCount); // Exponential backoff
  set(retryCountAtom, retryCount + 1);
  set(connectionStateAtom, "reconnecting");

  toast.info(
    `Retrying connection in ${delay / 1000}s... (${
      retryCount + 1
    }/${maxRetries})`
  );

  setTimeout(async () => {
    try {
      await set(connectAtom);
    } catch (error) {
      // If this was the last retry, show final error
      if (get(retryCountAtom) >= maxRetries) {
        toast.error("All retry attempts failed. Please check your connection.");
      }
    }
  }, delay);
});

// Disconnect action
export const disconnectAtom = atom(null, (_get, set) => {
  set(connectionStateAtom, "disconnected");
  set(databasesAtom, []);
  set(connectionErrorAtom, null);
  set(connectionHealthAtom, null);
  set(retryCountAtom, 0);
  set(isConnectingAtom, false);
  toast.info("Disconnected from API");
});

// Health check action
export const healthCheckAtom = atom(null, async (get, set) => {
  if (get(connectionStateAtom) !== "connected") {
    return;
  }

  const url = get(apiUrlAtom);
  const startTime = Date.now();

  try {
    await gigapiClient.testConnection(url);
    const responseTime = Date.now() - startTime;

    set(connectionHealthAtom, {
      lastCheck: new Date(),
      responseTime,
      isHealthy: true,
      errorCount: 0,
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const currentHealth = get(connectionHealthAtom);

    set(connectionHealthAtom, {
      lastCheck: new Date(),
      responseTime,
      isHealthy: false,
      errorCount: (currentHealth?.errorCount || 0) + 1,
    });

    // If multiple health check failures, trigger reconnection
    if ((currentHealth?.errorCount || 0) >= 2) {
      set(connectionStateAtom, "failed");
      set(connectionErrorAtom, "Connection lost");
      toast.warning("Connection lost. Please reconnect.");
    }
  }
});
