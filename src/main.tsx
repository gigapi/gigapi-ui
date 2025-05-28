import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { QueryProvider } from "./contexts/QueryContext";
import { MCPProvider } from "./contexts/MCPContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryProvider>
      <MCPProvider>
        <App />
      </MCPProvider>
    </QueryProvider>
  </React.StrictMode>
);
