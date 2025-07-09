import { useState } from "react";
import { useAtom } from "jotai";
import { useMCP, selectedDbAtom, selectedTableAtom } from "@/atoms";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Database,
  Bot,
  Settings,
  Table,
} from "lucide-react";
import MCPConnectionSheet from "@/components/MCP/MCPConnectionSheet";
import Logo from "@/assets/logo.svg";

interface ChatWelcomeProps {
  onStartChat: (initialMessage?: string) => void;
}

export default function ChatWelcome({ onStartChat }: ChatWelcomeProps) {
  const { activeConnection, isConnected, connections } = useMCP();
  const [selectedDb] = useAtom(selectedDbAtom);
  const [selectedTable] = useAtom(selectedTableAtom);
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);

  return (
    <div className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="p-3 bg-primary/10 rounded-full">
            <img src={Logo} alt="GigAPI Logo" className="h-8 w-8" />
          </div>

          <h2 className="text-muted-foreground">
            Let's get started!
          </h2>
        </div>
      </div>

      {/* Context Information */}
      <div className="w-full max-w-2xl mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Database Context */}
          <Card className="border-dashed">
            <CardContent className="p-4 text-center">
              <Database className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <div className="text-sm font-medium mb-1">Database</div>
              {selectedDb ? (
                <Badge variant="secondary" className="text-xs">
                  {selectedDb}
                </Badge>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Not selected
                </div>
              )}
              {selectedTable && (
                <div className="mt-1">
                  <Badge variant="outline" className="text-xs">
                    <Table className="w-3 h-3 mr-1" />
                    {selectedTable}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Connection */}
          <Card className="border-dashed">
            <CardContent className="p-4 text-center">
              <Bot className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <div className="text-sm font-medium mb-1">AI Connection</div>
              {isConnected && activeConnection ? (
                <Badge variant="default" className="text-xs">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-1" />
                  {activeConnection.name}
                </Badge>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {connections.length > 0 ? "Not active" : "Not configured"}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Connection Status & Actions */}
      {!isConnected && (
        <div className="w-full max-w-2xl mb-8">
          <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-2 text-orange-800 dark:text-orange-200 mb-3">
                <Bot className="w-5 h-5" />
                <span className="font-medium">
                  {connections.length === 0
                    ? "No model connection configured"
                    : "No active model connection"}
                </span>
              </div>
              <p className="text-sm text-orange-600 dark:text-orange-300 mb-3">
                {connections.length === 0
                  ? "Connect to a model provider like Ollama to start using the assistant."
                  : "Please activate a model connection to start chatting."}
              </p>
              <Button
                onClick={() => setShowConnectionDialog(true)}
                variant="outline"
                size="sm"
                className="border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-900"
              >
                <Settings className="w-4 h-4 mr-2" />
                {connections.length === 0
                  ? "Setup AI Connection"
                  : "Manage Connections"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Start Chat Button */}
      <div className="text-center">
        <Button
          onClick={() => onStartChat()}
          size="lg"
          disabled={!isConnected}
          className="px-8"
        >
          <Sparkles className="w-5 h-5 mr-2" />
          Start Chatting
        </Button>
        {!isConnected && (
          <p className="text-xs text-muted-foreground mt-2">
            Configure a new model connection to start chatting
          </p>
        )}
      </div>

      {/* Connection Dialog */}
      <MCPConnectionSheet
        isOpen={showConnectionDialog}
        onClose={() => setShowConnectionDialog(false)}
      />
    </div>
  );
}
