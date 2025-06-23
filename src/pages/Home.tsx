import QueryEditor from "@/components/query/QueryEditor";
import QueryResults from "@/components/QueryResults";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import AppLayout from "@/components/navigation/AppLayout";

export function Home() {
  const breadcrumbs = [
    { label: "Query Interface" }
  ];

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
