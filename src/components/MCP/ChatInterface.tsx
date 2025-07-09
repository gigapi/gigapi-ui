import { useState, useRef, useEffect } from "react";
import { useMCP, useQuery, useDashboardSafely } from "@/atoms";


import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Send,
  Bot,
  Copy,
  Zap,
  TerminalSquare,
  User,
  MessageSquare,
  ChevronDown,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import Loader from "@/components/Loader";
import type { ChatMessage } from "@/types";
import ChatArtifact from "./ChatArtifact";
import ChatWelcome from "./ChatWelcome";
import Logo from "@/assets/logo.svg";

interface ChatInterfaceProps {
  activeSessionId: string | null;
  onNewChat: () => void;
}

export default function ChatInterface({
  activeSessionId,
  onNewChat,
}: ChatInterfaceProps) {
  const {
    activeSession,
    isConnected,
    isLoading,
    error,
    sendMessage,
    createChatSession,
    connections,
    activeConnection,
    setActiveConnection,
  } = useMCP();

  const { setQuery } = useQuery();
  const dashboardContext = useDashboardSafely();
  const currentDashboard = dashboardContext?.currentDashboard || null;

  const [inputMessage, setInputMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentSession = activeSession;
  const isWelcomeView = activeSessionId === "welcome" || !activeSessionId;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentSession?.messages]);

  useEffect(() => {
    if (textareaRef.current && !isWelcomeView) {
      textareaRef.current.focus();
    }
  }, [activeSessionId, isWelcomeView]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading || !isConnected) return;

    const messageToSend = inputMessage.trim();
    setInputMessage("");

    try {
      await sendMessage(messageToSend);
    } catch (err) {
      setInputMessage(messageToSend);
      toast.error("Failed to send message. Please try again.");
      console.error("Failed to send message:", err);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const useQueryFromMessage = (query: string) => {
    if (!query) return;
    setQuery(query);
    toast.success("Query added to editor");
  };

  const handleAddChartToDashboard = async (chartArtifact: any) => {
    try {
      if (!currentDashboard) {
        toast.error("No dashboard loaded. Please load a dashboard first.");
        return;
      }
      toast.success(
        `Chart "${chartArtifact.title}" added to dashboard "${currentDashboard.name}"`
      );
    } catch (error) {
      console.error("Failed to add chart to dashboard:", error);
      toast.error("Failed to add chart to dashboard");
    }
  };

  const handleStartChat = async (initialMessage?: string) => {
    if (!isConnected) {
      toast.error("Please configure an AI connection first");
      return;
    }

    try {
      await createChatSession();

      if (initialMessage) {
        setTimeout(() => {
          setInputMessage(initialMessage);
        }, 100);
      }
    } catch (error) {
      toast.error("Could not create new chat");
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Model Selector Component
  const ModelSelector = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Bot className="w-3 h-3" />
          <span className="hidden sm:inline">{activeConnection?.name}</span>
          <ChevronDown className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Select AI Model</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {connections.map((connection: any) => (
          <DropdownMenuItem
            key={connection.id}
            onClick={() => setActiveConnection(connection.id)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4" />
              <div>
                <div className="font-medium">{connection.name}</div>
                <div className="text-xs text-muted-foreground">
                  {connection.model}
                </div>
              </div>
            </div>
            {activeConnection?.id === connection.id && (
              <Check className="w-4 h-4" />
            )}
          </DropdownMenuItem>
        ))}
        {connections.length === 0 && (
          <DropdownMenuItem disabled>No connections available</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.role === "user";
    const queryContent = message.metadata?.queryGenerated as string | undefined;
    const chartArtifact = message.metadata?.chartArtifact;

    return (
      <div key={message.id} className="group relative mb-8">
        <div className="flex gap-4">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                isUser ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              {isUser ? (
                <User className="w-4 h-4" />
              ) : (
                <Bot className="w-4 h-4" />
              )}
            </div>
          </div>

          {/* Message content */}
          <div className="flex-1 space-y-3">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {isUser ? (
                <div className="whitespace-pre-wrap text-sm leading-relaxed bg-primary/20 p-3 rounded-md">
                  {message.content}
                </div>
              ) : (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => (
                      <p className="mb-3 last:mb-0 text-sm leading-relaxed">
                        {children}
                      </p>
                    ),
                    ul: ({ children }) => (
                      <ul className="mb-3 ml-4 list-disc space-y-1">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="mb-3 ml-4 list-decimal space-y-1">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => (
                      <li className="text-sm">{children}</li>
                    ),
                    code: ({ node, className, children, ...props }) => {
                      const match = /language-(\w+)/.exec(className || "");
                      return match ? (
                        <div className="my-4 bg-muted rounded-lg p-4 relative group">
                          <pre className="text-sm font-mono whitespace-pre-wrap overflow-x-auto">
                            <code className={className} {...props}>
                              {children}
                            </code>
                          </pre>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => copyToClipboard(String(children))}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <code
                          className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    },
                    pre: ({ children }) => <>{children}</>,
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              )}
            </div>

            {/* Query artifact */}
            {queryContent && (
              <div className="bg-muted/50 rounded-lg p-4 border">
                <div className="flex items-center justify-between mb-3">
                  <Badge variant="secondary" className="text-xs">
                    <Zap className="w-3 h-3 mr-1" />
                    Generated Query
                  </Badge>
                  <div className="flex gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => copyToClipboard(queryContent)}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copy query</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => useQueryFromMessage(queryContent)}
                          >
                            <TerminalSquare className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Send to query editor</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                <pre className="text-sm font-mono bg-background/50 p-3 rounded overflow-x-auto">
                  <code>{queryContent}</code>
                </pre>
              </div>
            )}

            {/* Chart artifact */}
            {chartArtifact && (
              <div className="mt-4">
                <ChatArtifact
                  chartArtifact={chartArtifact}
                  onAddToDashboard={handleAddChartToDashboard}
                  currentDashboard={currentDashboard}
                />
              </div>
            )}

            {/* Timestamp */}
            <div className="text-xs text-muted-foreground">
              {formatTimestamp(message.timestamp)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (isWelcomeView) {
    return (
      <div className="flex-1 flex flex-col">
        <ChatWelcome onStartChat={handleStartChat} />
      </div>
    );
  }

  if (!currentSession) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center space-y-4">
          <MessageSquare className="w-16 h-16 mx-auto text-muted-foreground/50" />
          <div>
            <h3 className="text-lg font-medium">Chat session not found</h3>
            <p className="text-sm text-muted-foreground">
              The selected chat session could not be loaded.
            </p>
          </div>
          <Button onClick={onNewChat} variant="outline">
            Start New Chat
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="h-[70px] p-5 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 max-w-2xl">
            <h2 className="font-medium truncate">{currentSession.title} </h2>
          </div>

          <div className="flex items-center gap-2">
            <span className="mr-2 text-xs text-muted-foreground">
              {activeConnection?.model ||
                currentSession.modelUsed ||
                "Unknown model"}
            </span>
            {isConnected && activeConnection && <ModelSelector />}
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto p-6">
          {currentSession.messages.length === 0 ? (
            <div className="text-center py-16">
              <img
                src={Logo}
                alt="GigAPI Logo"
                className="w-16 h-16 mx-auto mb-4"
              />
              <h3 className="text-lg font-medium mb-2">
                Start the conversation
              </h3>
              <p className="text-sm text-muted-foreground">
                Ask me anything about your data, queries, or visualizations.
              </p>
            </div>
          ) : (
            <>
              {currentSession.messages.map(renderMessage)}

              {/* Loading indicator */}
              {isLoading && (
                <div className="group relative mb-8">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <Bot className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="bg-muted rounded-lg p-4 inline-block">
                        <Loader className="w-5 h-5" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t p-4">
        <div className="max-w-4xl mx-auto">
          {error && (
            <div className="mb-3 p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
              Error: {error}
            </div>
          )}

          <div className="flex gap-3 items-end">
            <Textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={
                isConnected
                  ? "Ask anything about your data..."
                  : "Configure an AI connection to start chatting..."
              }
              disabled={!isConnected || isLoading}
              className="flex-1 resize-none min-h-[44px] max-h-32"
              rows={1}
            />
            <Button
              onClick={handleSendMessage}
              disabled={!isConnected || isLoading || !inputMessage.trim()}
              size="icon"
              className="h-11 w-11 flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>

          {!isConnected && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Configure an AI connection in the sidebar to start chatting
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
