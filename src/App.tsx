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

export default function App() {
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
