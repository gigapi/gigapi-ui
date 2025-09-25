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
  setTimeRangeAtom,
  cleanupOldLocalStorageAtom,
  resetStaleLoadingStatesAtom,
} from "@/atoms";
import { HashQueryUtils } from "@/lib/url/hash-query-utils";
import { TabBar } from "@/components/tabs/TabBar";

function Home() {
  const initializeDatabase = useSetAtom(initializeDatabaseAtom);
  const isConnected = useAtomValue(isConnectedAtom);
  const cleanupOldStorage = useSetAtom(cleanupOldLocalStorageAtom);
  const resetStaleLoadingStates = useSetAtom(resetStaleLoadingStatesAtom);
  const initializedRef = useRef(false);
  const urlParamsLoadedRef = useRef(false);
  const cleanupDoneRef = useRef(false);
  const staleStateCleanedRef = useRef(false);

  // Atoms for setting query parameters
  const setQuery = useSetAtom(setQueryAtom);
  const setSelectedDb = useSetAtom(setSelectedDbAtom);
  const setSelectedTable = useSetAtom(setSelectedTableAtom);
  const setSelectedTimeField = useSetAtom(selectedTimeFieldAtom);
  const setTimeRange = useSetAtom(setTimeRangeAtom);


  // Clean up stale loading states on mount (BEFORE loading URL params)
  useEffect(() => {
    if (!staleStateCleanedRef.current) {
      staleStateCleanedRef.current = true;
      // Reset any stale loading states from previous session
      resetStaleLoadingStates();
    }
  }, [resetStaleLoadingStates]);

  // Load query parameters from URL on mount
  useEffect(() => {
    if (!urlParamsLoadedRef.current && staleStateCleanedRef.current) {
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
  }, [setQuery, setSelectedDb, setSelectedTable, setSelectedTimeField, setTimeRange, staleStateCleanedRef]);

  // Initialize database and tables when connected (only once)
  useEffect(() => {
    if (isConnected && !initializedRef.current) {
      initializedRef.current = true;
      initializeDatabase();
      
      // Cleanup old localStorage keys once
      if (!cleanupDoneRef.current) {
        cleanupDoneRef.current = true;
        cleanupOldStorage();
      }
    } else if (!isConnected) {
      // Reset initialization flag when disconnected
      initializedRef.current = false;
    }
  }, [isConnected, initializeDatabase, cleanupOldStorage]);

  // Memoize breadcrumbs to prevent unnecessary re-renders
  const breadcrumbs = useMemo(() => [{ label: "Query Interface" }], []);

  return (
    <AppLayout breadcrumbs={breadcrumbs} showDatabaseControls={false}>
      <div className="flex flex-col h-full overflow-hidden">
        <TabBar />
        <div className="flex-1 p-2 md:p-3 overflow-hidden w-full mx-auto transition-all duration-300 max-w-screen">
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
      </div>
    </AppLayout>
  );
}

export default Home;
