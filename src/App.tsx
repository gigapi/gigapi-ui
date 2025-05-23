import React, { useEffect } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import QueryEditor from "@/components/QueryEditor";
import QueryResults from "@/components/QueryResults";
import QueryNav from "@/components/QueryNav";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import Logo from "@/assets/logo.svg";
import AppContent from "@/components/AppContent";
import { useQuery } from "@/contexts/QueryContext";
import { CheckCircle } from "lucide-react";
import ConnectionError from "./components/ConnectionError";

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

export default function App() {
  const { connectionState } = useQuery();

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
        <div className="h-screen flex flex-col overflow-hidden bg-background text-foreground">
          <AppContent />
          <QueryNav />
          <main className="flex-1 p-2 md:p-3 overflow-hidden">
            <ResizablePanelGroup
              direction="vertical"
              className="min-h-0 rounded-lg border bg-card/50"
            >
              <ResizablePanel defaultSize={40} minSize={0}>
                <div className="h-full p-2">
                  <QueryEditor />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={60} minSize={0}>
                <div className="h-full p-2">
                  <QueryResults />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </main>
          <footer className="border-t py-1.5 px-4 text-xs text-muted-foreground flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <img src={Logo} alt="GigAPI Logo" className="h-4 w-4" />
              <span className="hidden sm:inline">
                GigAPI Querier | SQL Interface for Observability Data
              </span>
              <span className="sm:hidden">GigAPI Querier</span>
            </div>
            <div className="flex items-center">
              {connectionState === "connected" && (
                <span className="flex items-center text-green-500 mr-4">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Connected
                </span>
              )}
              <a
                href="https://gigapipe.com?utm_source=gigapi-ui&utm_medium=footer"
                className="text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Powered by Gigapipe
              </a>
            </div>
          </footer>
          <Toaster position="bottom-right" richColors expand />
        </div>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
