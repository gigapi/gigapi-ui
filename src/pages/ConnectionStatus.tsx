import { useRef, useEffect, useState } from "react";
import {
  ExternalLink,
  RefreshCw,
  ServerCrash,
  CheckCircle,
  AlertCircle,
  Globe,
} from "lucide-react";
import { useAtom, useSetAtom } from "jotai";
import {
  connectionStateAtom,
  connectionErrorAtom,
  apiUrlAtom,
  connectAtom,
  databasesAtom,
} from "@/atoms";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Loader from "@/components/Loader";

export default function ConnectionStatus() {
  const [connectionState] = useAtom(connectionStateAtom);
  const [connectionError] = useAtom(connectionErrorAtom);
  const [apiUrl] = useAtom(apiUrlAtom);
  const [databases] = useAtom(databasesAtom);
  const setApiUrl = useSetAtom(apiUrlAtom);
  const connect = useSetAtom(connectAtom);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // Set initial value when component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = apiUrl;
    }
  }, [apiUrl]);

  const handleUpdateEndpoint = async () => {
    if (inputRef.current) {
      const newUrl = inputRef.current.value.trim();
      setApiUrl(newUrl);

      // Automatically try connecting with the new URL
      setIsRetrying(true);
      try {
        await connect(newUrl);
      } catch (error) {
        // Error is already handled by the connect atom
      } finally {
        setIsRetrying(false);
      }
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await connect();
    } catch (error) {
      // Error is already handled by the connect atom
    } finally {
      setIsRetrying(false);
    }
  };

  // Get status info based on connection state
  const getStatusInfo = () => {
    switch (connectionState) {
      case "disconnected":
        return {
          title: "Not Connected",
          description: "Click connect to establish a connection",
          icon: <ServerCrash className="h-6 w-6 text-gray-500" />,
          variant: "default",
          color: "border-gray-200 bg-gray-50/50",
        };
      case "connecting":
        return {
          title: "Connecting to API",
          description: "Establishing connection to your GigAPI instance",
          icon: <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />,
          variant: "connecting",
          color: "border-blue-200 bg-blue-500/50",
        };
      case "reconnecting":
        return {
          title: "Reconnecting...",
          description: "Attempting to reconnect to the database",
          icon: <RefreshCw className="h-6 w-6 animate-spin text-orange-500" />,
          variant: "connecting",
          color: "border-orange-200 bg-orange-500/50",
        };
      case "connected":
        return {
          title: "Connected Successfully",
          description: `Found ${databases.length} database${
            databases.length === 1 ? "" : "s"
          }`,
          icon: <CheckCircle className="h-6 w-6 text-green-500" />,
          variant: "success",
          color: "border-green-200 bg-green-500/50",
        };
      case "empty":
        return {
          title: "Connected - No Databases",
          description: "Connection successful but no databases found",
          icon: <AlertCircle className="h-6 w-6 text-yellow-500" />,
          variant: "warning",
          color: "border-yellow-200 bg-yellow-500/50",
        };
      case "failed":
      default:
        return {
          title: "Connection Failed",
          description: "Unable to connect to the API endpoint",
          icon: <ServerCrash className="h-6 w-6 text-red-500" />,
          variant: "error",
          color: "border-red-200 bg-red-500/50",
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/90 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border shadow-lg overflow-hidden">
        <div
          className={`p-6 ${statusInfo.color} transition-colors duration-300`}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-white rounded-full shadow-sm">
              {statusInfo.icon}
            </div>
            <div>
              <h2 className="text-xl font-semibold">{statusInfo.title}</h2>
              <p className="text-sm text-muted-foreground">
                {statusInfo.description}
              </p>
            </div>
          </div>

          {/* API URL Badge - Moved from content to header */}
          <div className="flex items-center gap-2 mt-4">
            <div className="p-1.5 bg-background/80 rounded-md">
              <Globe className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs text-muted-foreground">API Endpoint:</p>
              <div className="font-mono text-xs truncate">{apiUrl}</div>
            </div>
          </div>
        </div>

        <CardContent className="p-5 space-y-4">
          {/* Error Message */}
          {connectionError && connectionState === "failed" && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive font-mono break-all">
              {connectionError}
            </div>
          )}

          {/* Databases List */}
          {connectionState === "connected" && databases.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Available Databases:</p>
              <div className="flex flex-wrap gap-1.5">
                {databases.map((db, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="text-xs px-2.5 py-1"
                  >
                    {db.database_name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* API URL Input */}
          <div className="space-y-3 pt-2">
            <div className="relative">
              <Input
                ref={inputRef}
                type="text"
                placeholder="Enter API Endpoint URL"
                className="font-mono text-sm pr-10"
                defaultValue={apiUrl}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleUpdateEndpoint();
                  }
                }}
              />
              <Button
                onClick={handleRetry}
                disabled={isRetrying}
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1 h-8 w-8 p-0"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`}
                />
              </Button>
            </div>

            <Button
              onClick={handleUpdateEndpoint}
              disabled={isRetrying}
              className="w-full"
              size="sm"
            >
              {isRetrying ? (
                <>
                  <Loader className="h-4 w-4 mr-2" />
                  Connecting...
                </>
              ) : (
                "Update & Connect"
              )}
            </Button>
          </div>
        </CardContent>

        <CardFooter>
          <Button
            variant="outline"
            onClick={() =>
              window.open(
                "https://github.com/gigapi/gigapi?tab=readme-ov-file#-api",
                "_blank"
              )
            }
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center mx-auto"
            size="sm"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            View GigAPI Documentation
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
