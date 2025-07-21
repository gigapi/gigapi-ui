import React, { useEffect, useRef } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useParams,
} from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { useAtom, useSetAtom } from "jotai";
import "@/components/ui/toast-fixes.css";

// New clean atoms
import {
  connectionStateAtom,
  isConnectedAtom,
  connectAtom,
  apiUrlAtom,
} from "@/atoms";

// Pages
import ConnectionStatus from "@/pages/ConnectionStatus";
import Home from "@/pages/Home";
import DashboardList from "@/pages/DashboardList";
import DashboardView from "@/pages/DashboardView";
import PanelEdit from "@/pages/PanelEdit";
import ChatPage from "@/pages/ChatPage";

// Components
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { ArtifactProvider } from "@/contexts/ArtifactContext";
import Loader from "./components/shared/Loader";

// const VERSION = import.meta.env.PACKAGE_VERSION;

// Route component for specific chat sessions
function ChatRoute() {
  const { chatId } = useParams();
  return <ChatPage chatId={chatId} />;
}

// Simple app initialization
function AppInitializer() {
  const connect = useSetAtom(connectAtom);
  const [apiUrl] = useAtom(apiUrlAtom);
  const initRef = useRef(false);

  useEffect(() => {
    // Prevent double initialization in React.StrictMode
    if (initRef.current) return;
    initRef.current = true;

    // Wait for apiUrl to be loaded from storage
    if (!apiUrl || apiUrl === "") {
      return;
    }
    
    connect().catch((error) => {
      console.error("🔥 [AppInitializer] Connection failed:", error);
    });
  }, [connect, apiUrl]);

  return null;
}

// Main app with router - only shown when connected
function AppWithRouter() {
  return (
    <Router basename="/ui/">
      <SidebarProvider
        style={
          {
            "--sidebar-width": "17rem",
          } as React.CSSProperties
        }
      >
        <AppSidebar />
        <SidebarInset>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/connect" element={<ConnectionStatus />} />
            <Route path="/dashboards" element={<DashboardList />} />
            <Route path="/dashboard/:dashboardId" element={<DashboardView />} />
            <Route
              path="/dashboard/:dashboardId/panel/new"
              element={<PanelEdit />}
            />
            <Route
              path="/dashboard/:dashboardId/panel/:panelId"
              element={<PanelEdit />}
            />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:chatId" element={<ChatRoute />} />
          </Routes>
          <CommandPalette />
        </SidebarInset>
      </SidebarProvider>
    </Router>
  );
}

// Error boundary
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("App Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen flex-col p-12">
          <h2 className="text-xl font-bold mb-4">Something went wrong</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {this.state.error?.message || "An unknown error occurred"}
          </p>
          <button
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Main App component
export default function App() {
  const [connectionState] = useAtom(connectionStateAtom);
  const [isConnected] = useAtom(isConnectedAtom);

  useEffect(() => {
    // Global error handler
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // Ignore cancellation errors and Monaco disposal errors
      const error = event.reason;
      if (
        error?.message?.includes("cancel") ||
        error?.message?.includes("abort") ||
        error?.name?.includes("Cancel") ||
        error?.name?.includes("Abort") ||
        error?.type === "cancelation" ||
        error?.msg?.includes("manually canceled") ||
        error?.message?.includes("Request was canceled")
      ) {
        event.preventDefault();
        return;
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () =>
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection
      );
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" storageKey="gigapi-theme">
        <ArtifactProvider>
          <AppInitializer />

          {/* Show connection page for non-connected states */}
          {!isConnected ? (
            <>
              {connectionState === "connecting" ? (
                <div className="h-screen flex items-center justify-center">
                  <div className="flex flex-col items-center gap-4">
                    <Loader />
                    <p className="text-muted-foreground">
                      Connecting to API...
                    </p>
                  </div>
                </div>
              ) : (
                <ConnectionStatus />
              )}
              <Toaster
                position="top-right"
                richColors
                expand
                closeButton
                duration={3000}
              />
            </>
          ) : (
            <>
              <AppWithRouter />
              <Toaster
                position="top-right"
                richColors
                expand
                closeButton
                duration={3000}
              />
            </>
          )}
        </ArtifactProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
