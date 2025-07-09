import { useRef, useEffect, useState } from "react";
import { ExternalLink, RefreshCw, ServerCrash, CheckCircle, AlertCircle } from "lucide-react";
import { useAtom, useSetAtom } from "jotai";
import { connectionStateAtom, connectionErrorAtom, apiUrlAtom, connectAtom, databasesAtom } from "@/atoms";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
          variant: "default" as const
        };
      case "connecting":
        return {
          title: "Connecting to API",
          description: "Establishing connection to your GigAPI instance",
          icon: <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />,
          variant: "connecting" as const
        };
      case "reconnecting":
        return {
          title: "Reconnecting...",
          description: "Attempting to reconnect to the database",
          icon: <RefreshCw className="h-6 w-6 animate-spin text-orange-500" />,
          variant: "connecting" as const
        };
      case "connected":
        return {
          title: "Connected Successfully",
          description: `Found ${databases.length} database${databases.length === 1 ? '' : 's'}`,
          icon: <CheckCircle className="h-6 w-6 text-green-500" />,
          variant: "success" as const
        };
      case "empty":
        return {
          title: "Connected - No Databases",
          description: "Connection successful but no databases found",
          icon: <AlertCircle className="h-6 w-6 text-yellow-500" />,
          variant: "warning" as const
        };
      case "failed":
      default:
        return {
          title: "Connection Failed",
          description: "Unable to connect to the API endpoint",
          icon: <ServerCrash className="h-6 w-6 text-red-500" />,
          variant: "error" as const
        };
    }
  };

  const statusInfo = getStatusInfo();

  // Remove auto-connect since App.tsx already handles initial connection
  // This was causing double connection attempts

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Status Card */}
        <Card className="border-2">
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-4">
              {statusInfo.icon}
            </div>
            <CardTitle className="text-xl">{statusInfo.title}</CardTitle>
            <CardDescription className="text-base">
              {statusInfo.description}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {/* Current API URL */}
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">API Endpoint:</p>
              <Badge variant="outline" className="font-mono text-xs px-3 py-1">
                {apiUrl}
              </Badge>
            </div>

            {/* Error Message */}
            {connectionError && connectionState === "failed" && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive font-mono break-all">
                  {connectionError}
                </p>
              </div>
            )}

            {/* Databases List */}
            {connectionState === "connected" && databases.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Available Databases:</p>
                <div className="flex flex-wrap gap-1">
                  {databases.map((db, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {db.database_name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* API URL Input Card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Update API Endpoint</CardTitle>
            <CardDescription>
              Change your GigAPI connection URL
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Input
                ref={inputRef}
                type="text"
                placeholder="Enter API Endpoint URL"
                className="font-mono text-sm"
                defaultValue={apiUrl}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleUpdateEndpoint();
                  }
                }}
              />
              
              <div className="flex gap-2">
                <Button
                  onClick={handleUpdateEndpoint}
                  disabled={isRetrying}
                  className="flex-1"
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
                
                <Button
                  onClick={handleRetry}
                  disabled={isRetrying}
                  variant="outline"
                  size="sm"
                >
                  <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Documentation Link */}
        <div className="text-center">
          <Button
            variant="ghost"
            onClick={() =>
              window.open(
                "https://github.com/gigapi/gigapi?tab=readme-ov-file#-api",
                "_blank"
              )
            }
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            View GigAPI Documentation
          </Button>
        </div>
      </div>
    </div>
  );
}