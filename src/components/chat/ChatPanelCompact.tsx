import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
  Bot,
  Copy,
  User,
  X,
  MessageSquare,
  Plus,
  ChevronDown,
  Check,
  CheckCircle,
  AlertCircle,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import Loader from "@/components/Loader";
import type { ChatMessage } from "@/types/chat.types";
import ChatArtifact from "./ChatArtifact";
import AIConnectionSheet from "./AIConnectionSheet";
import ChatContextSheet from "./ChatContextSheet";
import ChatInput from "./ChatInput";
import {
  useMCP,
  updateSessionContextAtom,
  updateSessionConnectionAtom,
} from "@/atoms";
import { useSetAtom, useAtom } from "jotai";
import { aiConnectionsAtom } from "@/atoms/chat-atoms";

interface ChatPanelCompactProps {
  isOpen: boolean;
  onClose?: () => void;
}

export default function ChatPanelCompact({
  isOpen,
  onClose,
}: ChatPanelCompactProps) {
  const {
    activeSession,
    isConnected,
    isLoading,
    error,
    sendMessage,
    createChatSession,
    activeConnection,
    chatSessions,
    switchChatSession,
  } = useMCP();


  const [inputMessage, setInputMessage] = useState("");
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [showContextDialog, setShowContextDialog] = useState(false);
  const updateSessionContext = useSetAtom(updateSessionContextAtom);
  const updateSessionConnection = useSetAtom(updateSessionConnectionAtom);
  const [aiConnections] = useAtom(aiConnectionsAtom);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  // Listen for event to open AI connection sheet
  useEffect(() => {
    const handleOpenAIConnectionSheet = () => {
      setShowConnectionDialog(true);
    };
    window.addEventListener('openAIConnectionSheet', handleOpenAIConnectionSheet);
    return () => {
      window.removeEventListener('openAIConnectionSheet', handleOpenAIConnectionSheet);
    };
  }, []);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading || !isConnected) return;

    const messageToSend = inputMessage.trim();
    setInputMessage("");

    try {
      // Create session if none exists
      if (!activeSession) {
        await createChatSession();
      }
      await sendMessage(messageToSend);
    } catch (err) {
      setInputMessage(messageToSend);
      toast.error("Failed to send message. Please try again.");
      console.error("Failed to send message:", err);
    }
  };


  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatRelativeTime = (timestamp: string) => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return "now";
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h`;
    } else {
      return `${Math.floor(diffInHours / 24)}d`;
    }
  };

  // Chat Selector Component
  const ChatSelector = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 h-7">
          <MessageSquare className="w-3 h-3" />
          <span className="text-sm max-w-[100px] truncate">
            {activeSession?.title || "Assistant"}
          </span>
          <ChevronDown className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="flex items-center justify-between">
          Chat Sessions
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={async () => {
              if (!isConnected) {
                toast.error("Please configure an AI connection first");
                return;
              }
              try {
                await createChatSession();
                toast.success("New chat created");
              } catch (error) {
                toast.error("Could not create new chat");
              }
            }}
          >
            <Plus className="w-3 h-3" />
          </Button>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {chatSessions.length === 0 ? (
          <DropdownMenuItem disabled className="text-center">
            No chat sessions
          </DropdownMenuItem>
        ) : (
          chatSessions
            .sort(
              (a: any, b: any) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime()
            )
            .slice(0, 8) // Show max 8 recent chats
            .map((session: any) => (
              <DropdownMenuItem
                key={session.id}
                onClick={() => switchChatSession(session.id)}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <MessageSquare className="w-3 h-3 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">
                      {session.title}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="text-xs h-3 px-1">
                        {session.messages.length}
                      </Badge>
                      <span>{formatRelativeTime(session.updatedAt)}</span>
                    </div>
                  </div>
                </div>
                {activeSession?.id === session.id && (
                  <Check className="w-3 h-3" />
                )}
              </DropdownMenuItem>
            ))
        )}
        {chatSessions.length > 8 && (
          <DropdownMenuItem disabled className="text-center text-xs">
            +{chatSessions.length - 8} more chats
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.role === "user";
    const artifacts = message.metadata?.artifacts || [];

    return (
      <div key={message.id}>
        <div className="flex gap-2">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
              isUser ? "bg-primary text-primary-foreground" : "bg-muted"
            }`}
          >
            {isUser ? (
              <User className="w-3 h-3" />
            ) : (
              <Bot className="w-3 h-3" />
            )}
          </div>

          <div className="flex-1 space-y-2 min-w-0">
            <div className="prose prose-sm dark:prose-invert max-w-none overflow-hidden">
              {isUser ? (
                <div className="text-sm whitespace-pre-wrap break-words overflow-wrap-anywhere bg-primary/20 p-2 rounded-md">
                  {message.content}
                </div>
              ) : (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => (
                      <p className="mb-2 last:mb-0 text-sm break-words overflow-wrap-anywhere">
                        {children}
                      </p>
                    ),
                    ul: ({ children }) => (
                      <ul className="mb-2 ml-3 list-disc space-y-1 break-words">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="mb-2 ml-3 list-decimal space-y-1 break-words">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => (
                      <li className="text-sm break-words overflow-wrap-anywhere">
                        {children}
                      </li>
                    ),
                    code: ({ node, className, children, ...props }) => {
                      const match = /language-(\w+)/.exec(className || "");
                      return match ? (
                        <div className="my-2 bg-muted rounded p-2 relative group overflow-hidden">
                          <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto break-words">
                            <code className={className} {...props}>
                              {children}
                            </code>
                          </pre>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100"
                            onClick={() => copyToClipboard(String(children))}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <code
                          className="bg-muted px-1 py-0.5 rounded text-xs font-mono break-words overflow-wrap-anywhere"
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

            {/* Render all artifacts */}
            {artifacts.length > 0 && activeSession && (
              <div className="mt-2 space-y-2">
                {artifacts.map((artifact) => (
                  <ChatArtifact
                    key={artifact.id}
                    artifact={artifact}
                    session={activeSession}
                  />
                ))}
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              {formatTimestamp(message.timestamp)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="h-full flex flex-col bg-card border rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <ChatSelector />
          {isConnected && activeConnection ? (
            <Badge variant="outline" className="text-xs h-5">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1" />
              {activeConnection.name}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs h-5">
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full mr-1" />
              Offline
            </Badge>
          )}

          {/* Model Selector */}
          {activeSession &&
            activeSession.aiConnectionId &&
            (() => {
              const connection = aiConnections.find(
                (c) => c.id === activeSession.aiConnectionId
              );
              
              if (!activeSession.model && !connection) return null;
              
              return (
                <Badge variant="outline" className="text-xs h-7">
                  <Bot className="w-3 h-3 mr-1" />
                  {activeSession.model ? (
                    <span className="font-mono">{activeSession.model}</span>
                  ) : (
                    <span>{connection?.name || "No AI"}</span>
                  )}
                </Badge>
              );
            })()}

          {/* Context Status Indicator */}
          {activeSession && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 h-7 px-2"
                    onClick={() => {
                      setShowContextDialog(true);
                    }}
                  >
                    <Settings className="w-3 h-3" />
                    <span className="text-xs">Context</span>
                    {(() => {
                      const dbCount =
                        activeSession.context.databases.selected.length;
                      const tableCount = Object.values(
                        activeSession.context.tables
                      ).reduce(
                        (acc, db) => acc + (db.selected?.length || 0),
                        0
                      );
                      const schemaCount = Object.values(
                        activeSession.context.schemas || {}
                      ).reduce((acc, db) => acc + Object.keys(db).length, 0);
                      const hasSchemas = schemaCount > 0;

                      if (dbCount === 0) {
                        return (
                          <AlertCircle className="w-3 h-3 text-red-500 ml-1" />
                        );
                      } else if (hasSchemas) {
                        return (
                          <CheckCircle className="w-3 h-3 text-green-500 ml-1" />
                        );
                      } else if (tableCount > 0) {
                        return (
                          <AlertCircle className="w-3 h-3 text-orange-500 ml-1" />
                        );
                      }
                      return null;
                    })()}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs space-y-1">
                    {(() => {
                      const dbCount =
                        activeSession.context.databases.selected.length;
                      const tableCount = Object.values(
                        activeSession.context.tables
                      ).reduce(
                        (acc, db) => acc + (db.selected?.length || 0),
                        0
                      );
                      const schemaCount = Object.values(
                        activeSession.context.schemas || {}
                      ).reduce((acc, db) => acc + Object.keys(db).length, 0);

                      if (dbCount === 0) {
                        return (
                          <div className="text-red-500">
                            No databases selected - click to configure
                          </div>
                        );
                      }

                      return (
                        <>
                          <div>
                            {dbCount} database{dbCount !== 1 ? "s" : ""}{" "}
                            selected
                          </div>
                          <div>
                            {tableCount} table{tableCount !== 1 ? "s" : ""}{" "}
                            selected
                          </div>
                          <div className="flex items-center gap-1">
                            {schemaCount > 0 ? (
                              <>
                                <CheckCircle className="w-3 h-3 text-green-500" />{" "}
                                Schemas loaded for {schemaCount} tables
                              </>
                            ) : tableCount > 0 ? (
                              <>
                                <AlertCircle className="w-3 h-3 text-orange-500" />{" "}
                                No schemas loaded - click to fetch
                              </>
                            ) : (
                              <span className="text-muted-foreground">
                                No tables selected
                              </span>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
            >
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {!isConnected ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
            <Bot className="w-8 h-8 mb-3 text-muted-foreground/50" />
            <h3 className="font-medium mb-1">No connections configured </h3>
          </div>
        ) : !activeSession || activeSession.messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
            <MessageSquare className="w-8 h-8 mb-3 text-muted-foreground/50" />
            <h3 className="font-medium mb-1">Start Chatting</h3>
            <p className="text-xs text-muted-foreground">
              Ask me anything about your data or queries.
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1 h-full">
            <div className="p-3 space-y-3 min-h-0">
              {activeSession.messages.map(renderMessage)}

              {isLoading && (
                <div className="flex gap-2 mb-4">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <Bot className="w-3 h-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="bg-muted rounded p-2 inline-block">
                      <Loader className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Input */}
      {isConnected && activeSession && (
        <div className="border-t p-3">
          {error && (
            <div className="mb-2 p-2 bg-destructive/10 text-destructive text-xs rounded">
              {error}
            </div>
          )}

          <ChatInput
            value={inputMessage}
            onChange={setInputMessage}
            onSend={handleSendMessage}
            disabled={isLoading}
            context={activeSession.context}
          />
        </div>
      )}

      {/* Connection Dialog */}
      <AIConnectionSheet
        isOpen={showConnectionDialog}
        onOpenChange={setShowConnectionDialog}
      />

      {/* Context Sheet */}
      {activeSession && (
        <ChatContextSheet
          isOpen={showContextDialog}
          onClose={() => setShowContextDialog(false)}
          session={activeSession}
          onUpdate={(context) => {
            updateSessionContext(activeSession.id, context);
          }}
        />
      )}
    </div>
  );
}
