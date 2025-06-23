import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import "@/index.css";
import { ConnectionProvider } from "@/contexts/ConnectionContext";
import { DatabaseProvider } from "@/contexts/DatabaseContext";
import { TimeProvider } from "@/contexts/TimeContext";
import { QueryProvider } from "@/contexts/QueryContext";
import { MCPProvider } from "@/contexts/MCPContext";  

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConnectionProvider>
      <DatabaseProvider>
        <TimeProvider>
          <QueryProvider>
            <MCPProvider>
                <App />
            </MCPProvider>
          </QueryProvider>
        </TimeProvider>
      </DatabaseProvider>
    </ConnectionProvider>
  </React.StrictMode>
);
