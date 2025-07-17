import { useEffect, useRef, useMemo } from "react";
import { useSetAtom, useAtomValue } from "jotai";
import QueryEditor from "@/components/query/QueryEditor";
import QueryResults from "@/components/query/QueryResults";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import AppLayout from "@/components/navigation/AppLayout";
import { 
  initializeDatabaseAtom, 
  isConnectedAtom,
  setQueryAtom,
  setSelectedDbAtom,
  setSelectedTableAtom,
  selectedTimeFieldAtom,
  setTimeRangeAtom
} from "@/atoms";
import { HashQueryUtils } from "@/lib/url/hash-query-utils";

function Home() {
  const initializeDatabase = useSetAtom(initializeDatabaseAtom);
  const isConnected = useAtomValue(isConnectedAtom);
  const initializedRef = useRef(false);
  const urlParamsLoadedRef = useRef(false);
  
  // Atoms for setting query parameters
  const setQuery = useSetAtom(setQueryAtom);
  const setSelectedDb = useSetAtom(setSelectedDbAtom);
  const setSelectedTable = useSetAtom(setSelectedTableAtom);
  const setSelectedTimeField = useSetAtom(selectedTimeFieldAtom);
  const setTimeRange = useSetAtom(setTimeRangeAtom);


  // Load query parameters from URL on mount
  useEffect(() => {
    if (!urlParamsLoadedRef.current) {
      urlParamsLoadedRef.current = true;
      
      const params = HashQueryUtils.decodeHashQuery();
      if (params) {
        // Apply the parameters
        if (params.query) setQuery(params.query);
        if (params.db) setSelectedDb(params.db);
        if (params.table) setSelectedTable(params.table);
        if (params.timeField) setSelectedTimeField(params.timeField);
        
        // Handle time range
        if (params.timeFrom && params.timeTo) {
          setTimeRange({
            from: params.timeFrom,
            to: params.timeTo,
            type: 'relative'
          });
        }
      }
    }
  }, [setQuery, setSelectedDb, setSelectedTable, setSelectedTimeField, setTimeRange]);

  // Initialize database and tables when connected (only once)
  useEffect(() => {
    if (isConnected && !initializedRef.current) {
      initializedRef.current = true;
      initializeDatabase();
    } else if (!isConnected) {
      // Reset initialization flag when disconnected
      initializedRef.current = false;
    }
  }, [isConnected, initializeDatabase]);

  // Memoize breadcrumbs to prevent unnecessary re-renders
  const breadcrumbs = useMemo(() => [{ label: "Query Interface" }], []);

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
