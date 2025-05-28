import { useRef, useEffect } from "react";
import { ExternalLink, RefreshCw, ServerCrash } from "lucide-react";
import { useQuery } from "@/contexts/QueryContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Loader from "@/components/Loader";

const ConnectionError = () => {
  const { connectionState, connectionError, apiUrl, setApiUrl, loadDatabases } =
    useQuery();
  const inputRef = useRef<HTMLInputElement>(null);

  // Set initial value when component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = apiUrl;
    }
  }, [apiUrl]);

  if (connectionState === "connected" || connectionState === "idle") {
    return null;
  }

  const handleUpdateEndpoint = () => {
    if (inputRef.current) {
      setApiUrl(inputRef.current.value.trim());
    }
  };

  // Common API input component used in all states
  const ApiEndpointInput = () => (
    <div className="bg-card/50 border border-border rounded-md p-4 mb-6 w-full max-w-md">
      <p className="text-sm text-muted-foreground mb-3 text-center ">
        {connectionState === "error"
          ? "We couldn't connect to:"
          : "API endpoint:"}
      </p>
      <div className="flex flex-col gap-3">
        <Input
          ref={inputRef}
          type="text"
          placeholder="Enter API Endpoint URL"
          className={`w-full h-9 text-sm border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-2 bg-card/50 ${
            connectionState === "error" ? "bg-red-500/20! text-red-500" : ""
          }`}
          defaultValue={apiUrl}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleUpdateEndpoint();
            }
          }}
        />
        <div className="flex gap-3 justify-center">
          <Button
            onClick={handleUpdateEndpoint}
            variant="default"
            className="flex-1 max-w-[200px]"
          >
            Update Endpoint
          </Button>
          <Button
            onClick={() => loadDatabases()}
            variant="outline"
            className="flex-1 max-w-[200px]"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    </div>
  );

  // Different UI based on connection state
  if (connectionState === "empty") {
    return (
      <div className="flex flex-col items-center justify-center mt-20">
        <div className="flex items-center justify-center mb-8 gap-6 ">
          <Loader className="h-16 w-16" />
        </div>

        <div className="text-center mb-6">
          <p className="text-muted-foreground mb-4">
            Your connection to <span className="font-mono p-1 rounded-md bg-green-500/20">{apiUrl}</span> is
            working, but no databases were found.
          </p>
          <p className="text-muted-foreground">
            Follow the GigAPI documentation to add data and start querying.
          </p>
        </div>

        <ApiEndpointInput />

        <Button
          variant="outline"
          onClick={() =>
            window.open(
              "https://github.com/gigapi/gigapi?tab=readme-ov-file#-api",
              "_blank"
            )
          }
          rel="noopener noreferrer"
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          View Documentation
        </Button>
      </div>
    );
  }

  if (connectionState === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh]">
        <h2 className="text-2xl font-semibold mb-4 text-red-500 flex items-center gap-2">
          <ServerCrash /> API - Connection Error
        </h2>

        {connectionError && (
          <>
            <div className="border border-red-500 rounded-md bg-red-400/20 p-4 mb-6 max-w-lg text-sm text-red-500 font-mono">
              {connectionError}
            </div>
          </>
        )}

        <ApiEndpointInput />

        <Button
          variant="outline"
          onClick={() =>
            window.open(
              "https://github.com/gigapi/gigapi?tab=readme-ov-file#-api",
              "_blank"
            )
          }
          rel="noopener noreferrer"
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          View Documentation
        </Button>
      </div>
    );
  }

  // Connecting state
  return (
    <div className="flex flex-col items-center justify-center h-[70vh]">
      <div className="animate-spin mb-8">
        <RefreshCw className="h-12 w-12 text-primary" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Connecting to API</h2>
      <p className="text-muted-foreground mb-4">
        Attempting to connect to {apiUrl}...
      </p>

      <ApiEndpointInput />
    </div>
  );
};

export default ConnectionError;
