import { useEffect, useRef, useMemo } from "react";
import { useSetAtom, useAtomValue } from "jotai";
import QueryEditor from "@/components/query/QueryEditor";
import QueryResults from "@/components/QueryResults";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import AppLayout from "@/components/navigation/AppLayout";
import { initializeDatabaseAtom, isConnectedAtom } from "@/atoms";

export function Home() {
  const initializeDatabase = useSetAtom(initializeDatabaseAtom);
  const isConnected = useAtomValue(isConnectedAtom);
  const initializedRef = useRef(false);
  
  console.log("🔥 HOME RENDER:", { isConnected, initializedRef: initializedRef.current, timestamp: new Date().toISOString() });

  // Initialize database and tables when connected (only once)
  useEffect(() => {
    if (isConnected && !initializedRef.current) {
      console.log("[Home] Initializing database for the first time");
      initializedRef.current = true;
      initializeDatabase();
    } else if (!isConnected) {
      // Reset initialization flag when disconnected
      initializedRef.current = false;
    }
  }, [isConnected, initializeDatabase]);

  // Memoize breadcrumbs to prevent unnecessary re-renders
  const breadcrumbs = useMemo(() => [
    { label: "Query Interface" }
  ], []);

  return (
    <AppLayout breadcrumbs={breadcrumbs} showDatabaseControls={true}>
      <div className="p-2 md:p-3 overflow-hidden w-full mx-auto transition-all duration-300 max-w-screen h-full">
        <ResizablePanelGroup
          direction="vertical"
          className="min-h-0 rounded-lg border bg-card/50 h-full"
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
      </div>
    </AppLayout>
  );
}

export default Home;