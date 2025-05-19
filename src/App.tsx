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

// Use package version directly from environment variable
const VERSION = import.meta.env.PACKAGE_VERSION;

export default function App() {
  const { isLoading, error, apiUrl, setApiUrl } = useQuery();

  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [editableApiUrl, setEditableApiUrl] = useState(apiUrl);

  useEffect(() => {
    setEditableApiUrl(apiUrl);
  }, [apiUrl]);

  useEffect(() => {
    if (!initialLoadComplete && !isLoading) {
      setInitialLoadComplete(true);
    }
  }, [isLoading, initialLoadComplete]);

  const handleRetry = () => {
    setApiUrl(editableApiUrl);
    setInitialLoadComplete(false);
  };

  if (!initialLoadComplete && isLoading) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="gigapi-theme">
        <div className="h-screen flex flex-col items-center justify-center text-muted-foreground">
          <img
            src={Logo}
            alt="GigAPI Logo"
            className="h-10 w-10 mb-4 animate-pulse"
          />
          Loading application...
        </div>
        <Toaster />
      </ThemeProvider>
    );
  }

  const isCriticalError =
    error && !error.toLowerCase().includes("no databases found");

  if (isCriticalError && !initialLoadComplete) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="gigapi-theme">
        <div className="h-screen flex flex-col items-center justify-center p-4 text-center">
          <img src={Logo} alt="GigAPI Logo" className="h-12 w-12 mb-6" />
          <h1 className="text-2xl font-semibold mb-3 text-destructive">
            Application Initialization Error
          </h1>
          <p className="text-muted-foreground mb-1">
            An error occurred while trying to connect to the API endpoint:
          </p>
          <p className="text-red-500 bg-red-500/10 p-3 rounded-md my-4 text-sm">
            {error}
          </p>
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
          <div>
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
