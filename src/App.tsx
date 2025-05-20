
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
import { CheckCircle } from "lucide-react";
import ConnectionError from "./components/ConnectionError";

// Use package version directly from environment variable
const VERSION = import.meta.env.PACKAGE_VERSION;

export default function App() {
  const { 
    connectionState
  } = useQuery();

  // Show ConnectionError component for connecting, error, or empty states
  if (connectionState === 'connecting' || connectionState === 'error' || connectionState === 'empty') {
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
              href="https://gigapipe.com?utm_source=gigapi-ui&utm_medium=footer"
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
