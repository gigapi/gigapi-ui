import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
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
  ChevronDown,
  Check,
  Settings,
  Database,
  Table,
  FileText,
  Zap,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { useAtom, useSetAtom } from "jotai";
import { aiConnectionsAtom, updateSessionConnectionAtom } from "@/atoms/chat-atoms";
import ChatArtifact from "./ChatArtifact";
import ChatContextSheet from "./ChatContextSheet";
import ChatInput from "./ChatInput";
import type { ChatSession, ChatMessage } from "@/types/chat.types";

interface ChatInterfaceProps {
  session: ChatSession;
  onSendMessage: (message: string) => Promise<void>;
  onUpdateContext: (context: ChatSession["context"]) => void;
}

export default function ChatInterface({
  session,
  onSendMessage,
  onUpdateContext,
}: ChatInterfaceProps) {
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isContextDialogOpen, setIsContextDialogOpen] = useState(false);
  const [aiConnections] = useAtom(aiConnectionsAtom);
  const updateSessionConnection = useSetAtom(updateSessionConnectionAtom);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.messages]);

  // Open context sheet for new chats without configuration
  useEffect(() => {
    if (session && (!session.model || !session.aiConnectionId || session.context.databases.selected.length === 0)) {
      setIsContextDialogOpen(true);
    }
  }, [session.id]); // Only run when session ID changes

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const messageToSend = inputMessage.trim();
    setInputMessage("");
    setIsLoading(true);

    try {
      await onSendMessage(messageToSend);
    } catch (err) {
      setInputMessage(messageToSend); // Restore message on error
      toast.error("Failed to send message");
      console.error("Failed to send message:", err);
    } finally {
      setIsLoading(false);
    }
  };


  // Calculate context summary
  const getContextSummary = () => {
    const { context } = session;
    const dbCount = context.databases.selected.length;
    const tableCount = Object.values(context.tables).reduce(
      (sum, db) => sum + db.selected.length,
      0
    );

    if (context.databases.includeAll) {
      return "All databases";
    } else if (dbCount === 0) {
      return "No context configured";
    } else {
      return `${dbCount} DB${dbCount !== 1 ? "s" : ""}, ${tableCount} table${
        tableCount !== 1 ? "s" : ""
      }`;
    }
  };

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.role === "user";

    return (
      <div key={message.id} className="group relative mb-6">
        <div className="flex gap-4">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                isUser ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              {isUser ? (
                <span className="text-sm font-medium">U</span>
              ) : (
                <Bot className="w-4 h-4" />
              )}
            </div>
          </div>

          {/* Message content */}
          <div className="flex-1 space-y-2">
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
              {isUser ? (
                <p className="whitespace-pre-wrap bg-foreground/5 p-2 rounded-md">{message.content}</p>
              ) : (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => (
                      <p className="mb-3 last:mb-0">{children}</p>
                    ),
                    code: ({ className, children, ...props }: any) => {
                      const match = /language-(\w+)/.exec(className || "");
                      const isInline = !className || !match;
                      return !isInline ? (
                        <div className="my-3 relative group">
                          <pre className="bg-muted rounded-lg p-4 overflow-x-auto">
                            <code className={`language-${match[1]}`} {...props}>
                              {children}
                            </code>
                          </pre>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100"
                            onClick={() => {
                              navigator.clipboard.writeText(String(children));
                              toast.success("Code copied");
                            }}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <code
                          className="bg-muted px-1.5 py-0.5 rounded text-sm"
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    },
                    pre: ({ children }) => <>{children}</>,
                    ul: ({ children }) => (
                      <ul className="list-disc pl-6 mb-3">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal pl-6 mb-3">{children}</ol>
                    ),
                    li: ({ children }) => <li className="mb-1">{children}</li>,
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              )}
            </div>

            {/* Artifacts */}
            {message.metadata?.artifacts?.map((artifact) => (
              <div key={artifact.id} className="mt-4">
                {artifact.type === "chart" && (
                  <ChatArtifact artifact={artifact} session={session} />
                )}
                {artifact.type === "query" && (
                  <div className="bg-muted rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="secondary">
                        <Zap className="w-3 h-3 mr-1" />
                        SQL Query
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            (artifact.data as any).query
                          );
                          toast.success("Query copied");
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                    <pre className="text-xs font-mono">
                      <code>{(artifact.data as any).query}</code>
                    </pre>
                  </div>
                )}
              </div>
            ))}

            {/* Metadata */}
            <div className="text-xs text-muted-foreground">
              <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{session.title}</h2>

          <div className="flex items-center gap-2">
            {/* Context Summary */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsContextDialogOpen(true)}
              className="gap-2"
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm">{getContextSummary()}</span>
            </Button>

            {/* Model Selector */}
            {session.aiConnectionId && (() => {
              const connection = aiConnections.find(
                (c) => c.id === session.aiConnectionId
              );
              
              return (
                <Badge variant="outline" className="text-xs h-5">
                  <Bot className="w-3 h-3 mr-1" />
                  {session.model ? (
                    <span className="font-mono">{session.model}</span>
                  ) : (
                    <span>{connection?.name || "No AI"}</span>
                  )}
                </Badge>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-6 py-4">
        {session.messages.length === 0 ? (
          <div className="text-center py-16">
            <Bot className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">Start a conversation</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Ask me about your data, and I'll help with queries and
              visualizations.
            </p>

            {/* Quick context summary */}
            <div className="inline-flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Database className="w-3 h-3" />
                <span>
                  {session.context.databases.selected.length} databases
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Table className="w-3 h-3" />
                <span>
                  {Object.values(session.context.tables).reduce(
                    (sum, db) => sum + db.selected.length,
                    0
                  )}{" "}
                  tables
                </span>
              </div>
              <div className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                <span>
                  {session.context.instructions.user.length} instructions
                </span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {session.messages.map(renderMessage)}
            {isLoading && (
              <div className="flex gap-4 mb-6">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted rounded-lg">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse delay-75" />
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse delay-150" />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </ScrollArea>

      {/* Input */}
      <div className="border-t p-4">
        <div className="max-w-4xl mx-auto">
          <ChatInput
            value={inputMessage}
            onChange={setInputMessage}
            onSend={handleSendMessage}
            disabled={isLoading}
            context={session.context}
          />
        </div>
      </div>

      {/* Context Configuration Dialog */}
      <ChatContextSheet
        isOpen={isContextDialogOpen}
        onClose={() => setIsContextDialogOpen(false)}
        session={session}
        onUpdate={onUpdateContext}
      />
    </div>
  );
}
