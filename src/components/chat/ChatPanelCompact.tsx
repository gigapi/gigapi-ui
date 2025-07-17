import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Bot,
  Send,
  Maximize2,
  Trash2,
  Copy,
  Check,
  Sparkles,
  Database,
  Info,
  Plus,
  Settings,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAtom, useSetAtom } from "jotai";
import {
  createSessionAtom,
  sendMessageAtom,
  sessionListAtom,
  chatSessionsAtom,
  deleteSessionAtom,
  activeSessionIdAtom,
  aiConnectionsAtom,
  queryEditorChatSessionIdAtom,
} from "@/atoms/chat-atoms";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import type { ChatMessage } from "@/types/chat.types";

interface ChatPanelCompactProps {
  query: string;
  selectedDb: string | null;
  selectedTable?: string;
  onInsertSuggestion?: (suggestion: string) => void;
}

export default function ChatPanelCompact({
  query,
  selectedDb,
  selectedTable,
  onInsertSuggestion,
}: ChatPanelCompactProps) {
  const navigate = useNavigate();
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Chat atoms
  const createSession = useSetAtom(createSessionAtom);
  const sendMessage = useSetAtom(sendMessageAtom);
  const [sessions] = useAtom(sessionListAtom);
  const [allSessions] = useAtom(chatSessionsAtom);
  const [aiConnections] = useAtom(aiConnectionsAtom);
  const deleteSession = useSetAtom(deleteSessionAtom);
  const setActiveSessionId = useSetAtom(activeSessionIdAtom);
  const [queryEditorSessionId, setQueryEditorSessionId] = useAtom(
    queryEditorChatSessionIdAtom
  );

  // Get the session for query editor
  const session = queryEditorSessionId
    ? allSessions[queryEditorSessionId]
    : null;

  // Initialize session if it doesn't exist
  useEffect(() => {
    // Only create a session if:
    // 1. We have AI connections
    // 2. We don't have a session ID stored, or the stored session doesn't exist
    if (
      aiConnections.length > 0 &&
      (!queryEditorSessionId || !allSessions[queryEditorSessionId])
    ) {
      const newSessionId = createSession({
        title: "Query Assistant",
        connectionId: aiConnections[0].id,
      });
      setQueryEditorSessionId(newSessionId);
    }
  }, [
    queryEditorSessionId,
    allSessions,
    aiConnections,
    createSession,
    setQueryEditorSessionId,
  ]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [session?.messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading || !session) return;

    const message = inputMessage.trim();
    setInputMessage("");
    setIsLoading(true);

    try {
      // Build context message
      let contextMessage = message;
      if (query || selectedDb) {
        contextMessage = `${message}\n\nContext:\n`;
        if (selectedDb) contextMessage += `- Database: ${selectedDb}\n`;
        if (selectedTable) contextMessage += `- Table: ${selectedTable}\n`;
        if (query)
          contextMessage += `- Current Query:\n\`\`\`sql\n${query}\n\`\`\``;
      }

      await sendMessage({
        sessionId: session.id,
        message: contextMessage,
      });
    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("Failed to send message");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyMessage = (content: string, messageId: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMessageId(messageId);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const handleClearChat = () => {
    if (session && aiConnections.length > 0) {
      deleteSession(session.id);
      // Create a new session
      const newSessionId = createSession({
        title: "Query Assistant",
        connectionId: aiConnections[0].id,
      });
      setQueryEditorSessionId(newSessionId);
      toast.success("Chat cleared");
    }
  };

  const handleExpandToFullChat = () => {
    if (session) {
      setActiveSessionId(session.id);
      navigate(`/chat/${session.id}`);
    }
  };

  // Get only the last 10 messages for compact view
  const recentMessages = session?.messages.slice(-10) || [];

  // If no AI connections are configured, show a prominent setup message
  if (aiConnections.length === 0) {
    return (
      <Card className="h-full flex flex-col bg-background border-l">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-xs">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Bot className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No AI Provider Configured</h3>
            <p className="text-sm text-muted-foreground mb-6">
              To use the AI assistant, you need to configure at least one AI provider.
            </p>
            <Button
              onClick={() => navigate("/chat")}
              className="gap-2"
              variant="default"
            >
              <Settings className="h-4 w-4" />
              Configure AI Provider
            </Button>
            <p className="text-xs text-muted-foreground mt-4">
              You can add providers like OpenAI, Anthropic, or Ollama in the chat settings.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col bg-background border-l">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-sm bg-black flex items-center justify-center">
            <Bot className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              <span className="font-medium text-sm">AI Assistant</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="text-sm">
                      This is a simplified chat for quick SQL help. For advanced
                      features like:
                    </p>
                    <ul className="text-sm mt-1 ml-4 list-disc">
                      <li>Full conversation history</li>
                      <li>Multiple AI models</li>
                      <li>Advanced data analysis</li>
                      <li>Interactive visualizations</li>
                    </ul>
                    <p className="text-sm mt-2">
                      Click the expand button to open the full chat experience.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-orange-500">
                Quick help mode
              </span>
              {session?.connection && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {session.connection.model || "AI Model"}
                </Badge>
              )}
            </div>
          </div>
          {selectedDb && (
            <Badge variant="secondary" className="text-xs">
              <Database className="h-3 w-3 mr-1" />
              {selectedDb}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleClearChat}
            title="Clear chat"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleExpandToFullChat}
            title="Open in full chat"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-3">
        <div className="space-y-3">
          {recentMessages.length === 0 ? (
            <div className="text-center py-8">
              <Sparkles className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Ask me about your query, database schema, or SQL help
              </p>
              <div className="mt-4 space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setInputMessage("Explain this query")}
                >
                  Explain query
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs ml-2"
                  onClick={() => setInputMessage("How can I optimize this?")}
                >
                  Optimize query
                </Button>
              </div>
            </div>
          ) : (
            recentMessages.map((message: ChatMessage) => (
              <div
                key={message.id}
                className={`flex gap-2 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.role === "assistant" && (
                  <div className="w-6 h-6 rounded-sm bg-black flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {message.role === "user" ? (
                    <p className="whitespace-pre-wrap break-words">
                      {message.content.split("\n\nContext:")[0]}
                    </p>
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown
                        components={{
                          pre: ({ children }) => {
                            // Extract text content from code blocks properly
                            const extractCodeText = (node: any): string => {
                              if (typeof node === "string") return node;
                              if (Array.isArray(node))
                                return node.map(extractCodeText).join("");
                              if (node?.props?.children)
                                return extractCodeText(node.props.children);
                              return "";
                            };
                            const codeText = extractCodeText(children);

                            return (
                              <div className="relative">
                                <pre className="bg-background/50 rounded p-2 overflow-x-auto">
                                  {children}
                                </pre>
                                {onInsertSuggestion && codeText && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-1 right-1 h-6 w-6"
                                    onClick={() => {
                                      onInsertSuggestion(codeText);
                                      toast.success(
                                        "Inserted into query editor"
                                      );
                                    }}
                                    title="Insert into query editor"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            );
                          },
                          code: ({ children }) => (
                            <code className="bg-background/50 px-1 py-0.5 rounded text-xs">
                              {children}
                            </code>
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  )}
                  {message.role === "assistant" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 mt-1 opacity-0 hover:opacity-100 transition-opacity"
                      onClick={() =>
                        handleCopyMessage(message.content, message.id)
                      }
                    >
                      {copiedMessageId === message.id ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex gap-2 justify-start">
              <div className="w-6 h-6 rounded-sm bg-black flex items-center justify-center flex-shrink-0 mt-1">
                <Bot
                  className="h-3.5 w-3.5 text-white animate-pulse"
                  strokeWidth={2.5}
                />
              </div>
              <div className="bg-muted rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce delay-100" />
                  <div className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce delay-200" />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t">
        <div className="flex gap-2">
          <Input
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Ask about your query..."
            disabled={isLoading || !session}
            className="text-sm"
          />
          <Button
            size="icon"
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading || !session}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
