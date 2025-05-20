import { useEffect, useState } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import QueryEditor from "@/components/QueryEditor";
import QueryResults from "@/components/QueryResults";
import QueryNav from "@/components/QueryNav";
import { Toaster } from "@/components/ui/sonner";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import Logo from "@/assets/logo.svg";
import AppContent from "@/components/AppContent";
import { useQuery } from "@/contexts/QueryContext";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";

// Use package version directly from environment variable
const VERSION = import.meta.env.PACKAGE_VERSION;

export default function App() {
  const { 
    error, 
    connectionState,
    connectionError,
    apiUrl, 
    setApiUrl 
  } = useQuery();

  const [editableApiUrl, setEditableApiUrl] = useState("");

  useEffect(() => {
    // Initialize editable API URL for the input field
    setEditableApiUrl(apiUrl);
  }, [apiUrl]);

  const handleRetry = () => {
    setApiUrl(editableApiUrl);
  };

  // Show loading screen during initial connection
  if (connectionState === 'connecting') {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="gigapi-theme">
        <div className="h-screen flex flex-col items-center justify-center text-muted-foreground">
          <img
            src={Logo}
            alt="GigAPI Logo"
            className="h-10 w-10 mb-4"
          />
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <div className="text-lg font-medium mb-2">Connecting to API...</div>
          <div className="text-sm text-muted-foreground">Attempting to connect to {apiUrl}</div>
        </div>
        <Toaster />
      </ThemeProvider>
    );
  }

  // Show connection error screen
  if (connectionState === 'error') {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="gigapi-theme">
        <div className="h-screen flex flex-col items-center justify-center p-4 text-center">
          <img src={Logo} alt="GigAPI Logo" className="h-12 w-12 mb-6" />
          <div className="flex items-center mb-4 text-destructive">
            <AlertCircle className="h-6 w-6 mr-2" />
            <h1 className="text-2xl font-semibold">Connection Error</h1>
          </div>
          
          <div className="mb-6 w-full max-w-md">
            <p className="text-muted-foreground mb-2">
              Failed to connect to the API endpoint:
            </p>
            <div className="text-destructive bg-destructive/10 p-3 rounded-md my-4 text-sm">
              {connectionError || error || "Unknown connection error"}
            </div>
          </div>
          
          <div className="w-full max-w-md space-y-3">
            <Input
              type="text"
              value={editableApiUrl}
              onChange={(e) => setEditableApiUrl(e.target.value)}
              placeholder="Enter API Endpoint URL"
              className="text-center bg-card border-border"
            />
            <Button onClick={handleRetry} variant="outline" className="w-full">
              Retry Connection
            </Button>
          </div>
        </div>
        <Toaster />
      </ThemeProvider>
    );
  }

  return (
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
            <span className="text-muted-foreground/70">v{VERSION}</span>
          </div>
          <div className="flex items-center">
            {connectionState === 'connected' && (
              <span className="flex items-center text-green-500 mr-4">
                <CheckCircle className="h-3 w-3 mr-1" />
                Connected
              </span>
            )}
            <a
              href="https://gigapipe.com"
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Powered by Gigapipe
            </a>
          </div>
        </footer>
        <Toaster />
      </div>
    </ThemeProvider>
  );
}
