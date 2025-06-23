import React, { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { useConnection, ConnectionProvider } from "@/contexts/ConnectionContext";
import { DatabaseProvider } from "@/contexts/DatabaseContext";
import { TimeProvider } from "@/contexts/TimeContext";
import { QueryProvider } from "@/contexts/QueryContext";
import { MCPProvider } from "@/contexts/MCPContext";
import ConnectionError from "@/components/ConnectionError";
import Home from "@/pages/Home";
import DashboardList from "@/pages/DashboardList";
import DashboardView from "@/pages/DashboardView";
import PanelEdit from "@/pages/PanelEdit";

// Route wrapper for PanelEdit
function PanelEditRoute() {
  const navigate = useNavigate();
  const { dashboardId, panelId } = useParams();
  
  const handleSaveSuccess = () => {
    navigate(`/dashboard/${dashboardId}`);
  };
  
  const handleCancel = () => {
    navigate(`/dashboard/${dashboardId}`);
  };
  
  return (
    <PanelEdit
      dashboardId={dashboardId || ""}
      panelId={panelId}
      onSaveSuccess={handleSaveSuccess}
      onCancel={handleCancel}
    />
  );
}
import { AppSidebar } from "@/components/navigation/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import AppContent from "@/components/AppContent"; // Import AppContent for side-effects
import { DashboardProvider } from "@/contexts/DashboardContext"; // Import DashboardProvider

const VERSION = import.meta.env.PACKAGE_VERSION;

// Add ErrorBoundary component to catch React errors
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean | null; error: any | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    console.error("Error caught in ErrorBoundary:", error);
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Error caught by ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen flex-col p-12">
          <h2 className="text-xl font-bold mb-4">
            Oh no, something went really wrong...
          </h2>
          <div className="text-sm text-muted-foreground mb-4">
            <p className="mb-2 text-red-500">
              ERROR: {this.state.error?.message || "An unknown error occurred."}
            </p>

            <a
              href={`https://github.com/gigapi/gigapi-ui/issues/new?title=Critical%20Error%20in%20GigAPI%20UI&body=Version%3A%20${VERSION}%0A%0AError%3A%20${this.state.error?.message}%0A%0AStack%3A%20${this.state.error?.stack}%0A%0APlease%20provide%20any%20additional%20context.`}
              className="text-blue-500 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {" "}
              Plase click here to report the issue, we'll fix it ASAP!
            </a>
          </div>
          <button
            className="px-4 py-2 text-white rounded bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75"
            onClick={() => this.setState({ hasError: false })}
          >
            Reload to try again.
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Add global error handler for unhandled promise rejections
const setupGlobalErrorHandlers = () => {
  window.addEventListener("unhandledrejection", (event) => {
    // Prevent the default browser behavior that would log the error
    event.preventDefault();

    // Only log important errors, ignore cancellation errors
    if (
      // Check error message
      (event.reason?.message &&
        (event.reason.message.includes("canceled") ||
          event.reason.message.includes("cancelled") ||
          event.reason.message.includes("manually") ||
          event.reason.message.includes("aborted") ||
          event.reason.message.includes("user aborted"))) ||
      // Check error name
      (event.reason?.name &&
        (event.reason.name.includes("Cancel") ||
          event.reason.name.includes("Abort"))) ||
      // Check if it's an axios cancel error
      (typeof event.reason?.constructor?.name === "string" &&
        event.reason.constructor.name === "CanceledError")
    ) {
      // Silently ignore cancellation errors
      return;
    }
  });
};

function AppInternal() {
  const { connectionState } = useConnection();

  // Set up global error handlers
  useEffect(() => {
    setupGlobalErrorHandlers();

    // Clean up event listener when the app unmounts
    return () => {
      window.removeEventListener("unhandledrejection", () => {});
    };
  }, []);

  // Show ConnectionError component for connecting, error, or empty states
  if (
    connectionState === "connecting" ||
    connectionState === "error" ||
    connectionState === "empty"
  ) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="gigapi-theme">
        <div className="h-screen flex flex-col relative bg-background">
          <ConnectionError />
        </div>
        <Toaster />
      </ThemeProvider>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" storageKey="gigapi-theme">
        <Router>
          <SidebarProvider
            style={{
              "--sidebar-width": "17rem",
            } as React.CSSProperties}
          >
            <AppSidebar />
            <SidebarInset>
              <AppContent /> {/* AppContent for side-effects only */}
              <DashboardProvider> {/* Wrap Routes with DashboardProvider */}
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/dashboards" element={<DashboardList />} />
                  <Route path="/dashboard/:dashboardId" element={<DashboardView />} />
                  <Route
                    path="/dashboard/:dashboardId/panel/:panelId/edit"
                    element={<PanelEditRoute />}
                  />
                   <Route
                    path="/dashboard/:dashboardId/panel/new"
                    element={<PanelEditRoute />}
                  />
                </Routes>
              </DashboardProvider>
            </SidebarInset>
          </SidebarProvider>
        </Router>
        <Toaster position="bottom-right" richColors expand />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ConnectionProvider>
      <DatabaseProvider>
        <TimeProvider>
          <QueryProvider>
            <MCPProvider>
              <AppInternal />
            </MCPProvider>
          </QueryProvider>
        </TimeProvider>
      </DatabaseProvider>
    </ConnectionProvider>
  );
}
