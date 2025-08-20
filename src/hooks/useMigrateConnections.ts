import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { connectionsAtom } from "@/atoms/connection-atoms";

/**
 * Hook to migrate from old single connection to new multi-connection system
 */
export function useMigrateConnections() {
  const setConnections = useSetAtom(connectionsAtom);

  useEffect(() => {
    // Check if migration has already been done
    const migrationDone = localStorage.getItem("gigapi_connections_migrated");
    if (migrationDone === "true") {
      return;
    }

    // Check for old connection URL
    const oldUrl = localStorage.getItem("gigapi_connection_url");
    if (oldUrl && oldUrl !== "") {
      // Get existing connections
      const existingConnections = localStorage.getItem("gigapi_connections");
      
      if (!existingConnections || existingConnections === "[]") {
        // Migrate old connection to new format
        const newConnection = {
          id: "default",
          name: "Default Connection",
          url: oldUrl,
          state: "disconnected" as const,
          databases: [],
          error: null,
        };

        // Save new connection format
        localStorage.setItem("gigapi_connections", JSON.stringify([newConnection]));
        localStorage.setItem("gigapi_selected_connection", "default");
        
        // Clear old storage key
        localStorage.removeItem("gigapi_connection_url");
      }
    }

    // Mark migration as done
    localStorage.setItem("gigapi_connections_migrated", "true");
  }, [setConnections]);
}