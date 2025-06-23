import { useState, useRef, useEffect } from "react";
import { useMCP } from "@/contexts/MCPContext";
import { useQuery } from "@/contexts/QueryContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MessageCircle,
  Send,
  Plus,
  Settings,
  Bot,
  Copy,
  Trash2,
  Zap,
  Edit3,
  Check,
  X,
  Home,
  MoreVertical,
  Clock,
  BotOff,
  TerminalSquare,
  User2,
} from "lucide-react";
import { toast } from "sonner";
import Loader from "@/components/Loader";
import MCPConnectionSheet from "@/components/MCP/MCPConnectionSheet";
import ConfirmAction from "@/components/ConfirmAction";
import type { ChatMessage } from "@/types";
import Logo from "/logo.svg";

interface ChatPanelProps {
  isOpen: boolean;
  onClose?: () => void; // Kept as it might be used by parent
}

export default function ChatPanel({ isOpen /*, onClose */ }: ChatPanelProps) {
  const {
    connections,
    activeConnection,
    chatSessions,
    activeSession,
    isConnected,
    isLoading,
    error,
    createChatSession,
    switchChatSession,
    deleteChatSession,
    renameChatSession,
    sendMessage,
    setActiveConnection,
    removeConnection,
  } = useMCP();

  const { setQuery } = useQuery();
  const [inputMessage, setInputMessage] = useState("");
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [activeTab, setActiveTab] = useState("home");
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages]);

  useEffect(() => {
    if (
      isOpen &&
      textareaRef.current &&
      activeTab !== "home" &&
      activeTab !== "config"
    ) {
      textareaRef.current.focus();
    }
  }, [isOpen, activeTab]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading || !isConnected) return;

    const messageToSend = inputMessage.trim();

    let sessionToUse = activeSession;
    if (!sessionToUse || activeTab === "home" || activeTab === "config") {
      const newSession = createChatSession();
      if (newSession) {
        sessionToUse = newSession;
        setActiveTab(newSession.id); // Switch to new chat tab
      } else {
        toast.error("Could not create a new chat session.");
        return;
      }
    }

    setInputMessage(""); // Clear input immediately

    try {
      await sendMessage(messageToSend);
    } catch (err) {
      setInputMessage(messageToSend); // Restore message on error
      toast.error("Failed to send message. Please try again.");
      console.error("Failed to send message:", err);
    }
  };

  const handleNewChat = () => {
    if (!isConnected) {
      toast.error("Please configure an AI connection first");
      setActiveTab("config");
      return;
    }
    const newSession = createChatSession();
    if (newSession) {
      setActiveTab(newSession.id);
    } else {
      toast.error(
        "Could not create new chat. Ensure an AI connection is active."
      );
    }
  };

  const handleSelectChat = (sessionId: string) => {
    switchChatSession(sessionId);
    setActiveTab(sessionId);
  };

  const handleDeleteChat = (sessionId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const session = chatSessions.find(s => s.id === sessionId);
    
    setConfirmDialog({
      isOpen: true,
      title: "Delete Chat",
      description: `Are you sure you want to delete "${session?.title || 'this chat'}"? This action cannot be undone.`,
      onConfirm: () => {
        deleteChatSession(sessionId);
        if (activeTab === sessionId) {
          setActiveTab("home");
        }
        toast.success("Chat deleted");
      },
    });
  };

  const handleRenameStart = (
    sessionId: string,
    currentTitle: string,
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    setEditingSessionId(sessionId);
    setEditingTitle(currentTitle);
  };

  const handleRenameConfirm = () => {
    if (editingSessionId && editingTitle.trim()) {
      renameChatSession(editingSessionId, editingTitle.trim());
      toast.success("Chat renamed");
    }
    setEditingSessionId(null);
    setEditingTitle("");
  };

  const handleRenameCancel = () => {
    setEditingSessionId(null);
    setEditingTitle("");
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
    // Optionally, could switch to the query editor tab if that exists
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
    const diffInSeconds = (now.getTime() - date.getTime()) / 1000;
    const diffInMinutes = diffInSeconds / 60;
    const diffInHours = diffInMinutes / 60;

    if (diffInMinutes < 1) {
      return "Just now";
    } else if (diffInHours < 1) {
      return `${Math.floor(diffInMinutes)}m ago`;
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInHours < 168) {
      // 7 days
      return `${Math.floor(diffInHours / 24)}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.role === "user";
    const queryContent = message.metadata?.queryGenerated as string | undefined; // Ensure it's treated as string

    return (
      <div
        key={message.id}
        className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
      >
        {!isUser && (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
        )}

        <div className={`flex-1 max-w-[85%] ${isUser ? "order-first" : ""}`}>
          <div
            className={`rounded-lg p-3 ${
              isUser ? "bg-primary text-primary-foreground ml-auto" : "bg-muted"
            }`}
          >
            <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
              {isUser ? (
                <div className="whitespace-pre-wrap">{message.content}</div>
              ) : (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => (
                      <p className="mb-2 last:mb-0">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="mb-2 ml-4 list-disc">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="mb-2 ml-4 list-decimal">{children}</ol>
                    ),
                    li: ({ children }) => <li className="mb-1">{children}</li>,
                    code: ({ node, className, children, ...props }) => {
                      const match = /language-(\w+)/.exec(className || "");
                      return match ? (
                        <div className="my-2 bg-background rounded p-2 relative group">
                          <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto">
                            <code className={className} {...props}>
                              {children}
                            </code>
                          </pre>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => copyToClipboard(String(children))}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <code
                          className={`bg-muted/50 px-1 py-0.5 rounded text-xs font-mono ${className}`}
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    },
                    pre: ({ children }) => <>{children}</>, // Let code block handle pre styling
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              )}
            </div>

            {queryContent && (
              <div className="mt-3 p-2 bg-background/50 rounded border">
                <div className="flex items-center justify-between mb-2">
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
                            size="sm"
                            className="h-6 w-6 p-0"
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
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => useQueryFromMessage(queryContent)}
                          >
                            <TerminalSquare className="w-3 h-3" />{" "}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Send query to the editor
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                <pre className="text-xs font-mono block p-2 bg-background rounded overflow-x-auto">
                  <code>{queryContent}</code>
                </pre>
              </div>
            )}
          </div>

          <div
            className={`text-xs text-muted-foreground mt-1 ${
              isUser ? "text-right" : ""
            }`}
          >
            {formatTimestamp(message.timestamp)}
          </div>
        </div>

        {isUser && (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <User2 className="w-4 h-4 text-primary" />
          </div>
        )}
      </div>
    );
  };

  const renderHomeTab = () => (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Chat History</h2>
        <Button
          onClick={handleNewChat}
          size="sm"
          disabled={!isConnected && connections.length === 0} // Disable if no connections at all
        >
          <Plus className="w-4 h-4 mr-2" />
          New Chat
        </Button>
      </div>

      {!isConnected &&
        connections.length === 0 && ( // Show only if no connections configured
          <div className="mb-4 p-3 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg">
            <div className="flex items-center gap-2 text-orange-800 dark:text-orange-200">
              <BotOff className="w-4 h-4" />
              <span className="text-sm font-medium">
                No AI connection configured
              </span>
            </div>
            <p className="text-xs text-orange-600 dark:text-orange-300 mt-1">
              Add and activate an AI connection in the Config tab to start
              chatting.
            </p>
          </div>
        )}

      {!isConnected &&
        connections.length > 0 &&
        activeConnection === null && ( // Show if connections exist but none active
          <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
              <BotOff className="w-4 h-4" />
              <span className="text-sm font-medium">No active AI connection</span>
            </div>
            <p className="text-xs text-yellow-600 dark:text-yellow-300 mt-1">
              Please select an active AI connection in the Config tab.
            </p>
          </div>
        )}

      {chatSessions.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <h3 className="font-medium mb-2">No conversations yet</h3>
          <p className="text-sm mb-4">
            {isConnected
              ? "Start your first conversation with the AI assistant."
              : connections.length === 0
              ? "Configure an AI connection first, then start chatting."
              : "Activate an AI connection in Config, then start chatting."}
          </p>
          <Button
            onClick={isConnected ? handleNewChat : () => setActiveTab("config")}
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            {isConnected ? "Start Chatting" : "Configure AI Connection"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {[...chatSessions]
            .sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime()
            )
            .map((session) => (
              <div
                key={session.id}
                className="group relative border rounded-lg p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => handleSelectChat(session.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {editingSessionId === session.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleRenameConfirm();
                            } else if (e.key === "Escape") {
                              handleRenameCancel();
                            }
                          }}
                          className="h-7 text-sm"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRenameConfirm();
                          }}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRenameCancel();
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <h4 className="font-medium text-sm truncate pr-2">
                          {session.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span>{formatRelativeTime(session.updatedAt)}</span>
                          <span>•</span>
                          <span>{session.messages.length} msg</span>
                        </div>
                        {session.messages.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            <strong>
                              {session.messages[session.messages.length - 1]
                                .role === "user"
                                ? "You: "
                                : "AI: "}
                            </strong>
                            {session.messages[
                              session.messages.length - 1
                            ].content.substring(0, 80)}
                            {session.messages[session.messages.length - 1]
                              .content.length > 80
                              ? "..."
                              : ""}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {editingSessionId !== session.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuItem
                          onClick={() =>
                            handleRenameStart(session.id, session.title)
                          }
                        >
                          <Edit3 className="w-3 h-3 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteChat(session.id)}
                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                        >
                          <Trash2 className="w-3 h-3 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );

  const renderConfigTab = () => (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">AI Connections</h2>
        <Button onClick={() => setShowConnectionDialog(true)} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Add Connection
        </Button>
      </div>

      {connections.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <BotOff className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <h3 className="font-medium mb-2">No AI connections configured</h3>
          <p className="text-sm mb-4">
            Add an AI connection to start using the assistant.
          </p>
          <Button onClick={() => setShowConnectionDialog(true)} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add AI Connection
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map((connection) => (
            <div
              key={connection.id}
              className={`border rounded-lg p-3 transition-colors ${
                activeConnection?.id === connection.id
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/50"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-sm truncate">
                      {connection.name}
                    </h4>
                    {activeConnection?.id === connection.id && (
                      <Badge variant="default" className="text-xs h-5">
                        Active
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>
                      <span className="font-medium">URL:</span>{" "}
                      {connection.baseUrl}
                    </div>
                    <div>
                      <span className="font-medium">Model:</span>{" "}
                      {connection.model}
                    </div>
                    {connection.headers && Object.keys(connection.headers).length > 0 && (
                      <div>
                        <span className="font-medium">Headers:</span>{" "}
                        {Object.keys(connection.headers).length} configured
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {activeConnection?.id !== connection.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveConnection(connection.id)}
                      className="text-xs h-7"
                    >
                      Set Active
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 p-0"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => setActiveConnection(connection.id)}
                        disabled={activeConnection?.id === connection.id}
                      >
                        <Check className="w-3 h-3 mr-2" />
                        Set as Active
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setConfirmDialog({
                            isOpen: true,
                            title: "Remove Connection",
                            description: `Are you sure you want to remove "${connection.name}" connection? This action cannot be undone.`,
                            onConfirm: () => {
                              if (removeConnection) {
                                removeConnection(connection.id);
                                toast.success(
                                  `Connection "${connection.name}" removed.`
                                );
                                if (activeConnection?.id === connection.id) {
                                  // MCPContext should handle setting a new active or null
                                }
                              } else {
                                toast.error("Remove function not available.");
                              }
                            },
                          });
                        }}
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                      >
                        <Trash2 className="w-3 h-3 mr-2" />
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderChatTab = () => {
    const currentSession = chatSessions.find((s) => s.id === activeTab);
    if (!currentSession) {
      // This case should ideally not be hit if activeTab is managed well
      // Or if it is hit, means session was deleted, Home tab should be active
      if (activeTab !== "home" && activeTab !== "config") {
        // setActiveTab("home"); // Fallback if session disappears
      }
      return (
        <div className="p-4 text-center text-muted-foreground flex-1 flex flex-col items-center justify-center">
          <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="mb-2">Chat session not found or not selected.</p>
          <Button onClick={() => setActiveTab("home")} variant="outline">
            Go to Home
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full">
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {currentSession.messages.map(renderMessage)}
            {isLoading && currentSession.id === activeSession?.id && (
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 max-w-[85%]">
                  <div className="bg-muted rounded-lg p-3 inline-block">
                    <Loader className="w-5 h-5" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="h-full flex flex-col bg-card border-l">
        {/* Header */}
        <div className="flex-shrink-0 p-3 border-b">
          {error && (
            <div className="mb-2 p-2 bg-destructive/10 text-destructive text-xs rounded">
              Error: {error}
            </div>
          )}

          <div className="w-full">
            <div className="flex items-center justify-between border-b">
              <div className="flex items-center">
                <div className="flex items-center gap-2 px-3 py-2 border-r mr-2">
                  <img src={Logo} alt="App Logo" className="w-5 h-5" />
                </div>

                {/* Tabs */}
                {["home", "config"].map((tabKey) => (
                  <Button
                    key={tabKey}
                    variant="link"
                    onClick={() => setActiveTab(tabKey)}
                    className={`flex rounded-none items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap relative ${
                      activeTab === tabKey
                        ? "text-primary border-b-2 border-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    style={{ top: "1px" }} // To align border with parent border
                  >
                    {tabKey === "home" ? (
                      <Home className="w-4 h-4" />
                    ) : (
                      <Settings className="w-4 h-4" />
                    )}
                    {tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}
                  </Button>
                ))}

                {chatSessions.slice(0, 2).map(
                  (
                    session // Show fewer direct tabs
                  ) => (
                    <TooltipProvider key={session.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setActiveTab(session.id)}
                            className={`flex items-center group gap-1.5 px-3 py-2 text-sm font-medium transition-colors relative max-w-[120px] whitespace-nowrap ${
                              activeTab === session.id
                                ? "text-primary border-b-2 border-primary"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                            style={{ top: "1px" }}
                          >
                            <MessageCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">{session.title}</span>
                            <X
                              className="w-3.5 h-3.5 ml-1 opacity-50 group-hover:opacity-100 hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteChat(session.id);
                              }}
                            />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{session.title}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )
                )}

                {chatSessions.length > 2 && (
                  <div
                    className="flex items-center px-3 py-2 text-sm text-muted-foreground"
                    style={{ top: "1px", position: "relative" }}
                  >
                    <Badge variant="secondary" className="text-xs">
                      +{chatSessions.length - 2} more
                    </Badge>
                  </div>
                )}
              </div>

              {/* Right side - Connection status and new chat button */}
              <div className="flex items-center gap-2 px-2">
                {isConnected && activeConnection && (
                  <Badge variant="outline" className="text-xs font-normal">
                    <Bot className="w-3 h-3 mr-1.5 text-green-500" />{" "}
                    {activeConnection.name}
                  </Badge>
                )}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 p-0"
                        onClick={handleNewChat}
                        disabled={!isConnected && connections.length === 0}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isConnected ? "New chat" : "Configure AI provider first"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-h-0">
          {" "}
          {/* min-h-0 is important for scroll */}
          {activeTab === "home" && (
            <ScrollArea className="flex-1">{renderHomeTab()}</ScrollArea>
          )}
          {activeTab === "config" && (
            <ScrollArea className="flex-1">{renderConfigTab()}</ScrollArea>
          )}
          {activeTab !== "home" && activeTab !== "config" && renderChatTab()}
        </div>

        {/* Input area - only show when not on home or config tabs AND a session is active */}
        {activeTab !== "home" &&
          activeTab !== "config" &&
          chatSessions.find((s) => s.id === activeTab) && (
            <div className="flex-shrink-0 border-t p-3">
              <div className="flex gap-2 items-end">
                <Textarea
                  ref={textareaRef}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={
                    isConnected
                      ? "Ask anything..."
                      : "Activate an AI provider in Config..."
                  }
                  disabled={!isConnected || isLoading}
                  className="flex-1 resize-none text-sm"
                  rows={1}
                  style={{ minHeight: "40px", maxHeight: "120px" }} // Set min and max height
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!isConnected || isLoading || !inputMessage.trim()}
                  size="icon"
                  className="h-9 w-9 flex-shrink-0" // Ensure button size consistency
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
      </div>

      {/* Connection Dialog Modal */}
      <MCPConnectionSheet
        isOpen={showConnectionDialog}
        onClose={() => setShowConnectionDialog(false)}
      />

      {/* Confirm Action Dialog */}
      <ConfirmAction
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        description={confirmDialog.description}
        variant="destructive"
        confirmText="Delete"
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </>
  );
}
