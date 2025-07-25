import { useState, useRef, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Bot,
  Copy,
  User,
  Brain,
  ChevronDown,
  ChevronUp,
  Check,
  Pencil,
  StopCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useSetAtom, useAtomValue, useAtom } from "jotai";
import {
  updateSessionConnectionAtom,
  cancelMessageAtom,
  activeAbortControllersAtom,
  editingMessageIdAtom,
  editMessageAtom,
  regenerateFromMessageAtom,
} from "@/atoms/chat-atoms";
import { useVirtualizer } from "@tanstack/react-virtual";
import ArtifactRendererWrapper from "./artifacts/ArtifactRendererWrapper";
import LazyArtifact from "./artifacts/LazyArtifact";
import ChatInputWithMentions from "./ChatInputWithMentions";
import type { ChatSession, ChatMessage } from "@/types/chat.types";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";
import Logo from "/logo.svg";
import {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ChatInterfaceProps {
  session: ChatSession;
  onSendMessage: (message: string, isAgentic?: boolean) => Promise<void>;
}

export default function ChatInterface({
  session,
  onSendMessage,
}: ChatInterfaceProps) {
  const [inputMessage, setInputMessage] = useState("");
  const [isAgentic, setIsAgentic] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(
    new Set()
  );
  const updateSessionConnection = useSetAtom(updateSessionConnectionAtom);
  const cancelMessage = useSetAtom(cancelMessageAtom);
  const activeAbortControllers = useAtomValue(activeAbortControllersAtom);
  const [editingMessageId, setEditingMessageId] = useAtom(editingMessageIdAtom);
  const editMessage = useSetAtom(editMessageAtom);
  const regenerateFromMessage = useSetAtom(regenerateFromMessageAtom);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [editingContent, setEditingContent] = useState("");

  // Derive loading state from active abort controllers
  const isLoading = activeAbortControllers.has(session.id);

  // Virtual scrolling setup
  const messageEstimateSize = useMemo(() => {
    // Estimate size based on average message height
    // User messages: ~100px, Assistant messages: ~200px, with artifacts: ~500px
    return (index: number) => {
      const message = session.messages[index];
      if (!message) return 150;

      const baseHeight = message.role === "user" ? 100 : 200;
      const artifactHeight = (message.metadata?.artifacts?.length || 0) * 400;
      const thinkingHeight =
        message.metadata?.thinking && expandedThinking.has(message.id)
          ? 200
          : 0;

      return baseHeight + artifactHeight + thinkingHeight;
    };
  }, [session.messages, expandedThinking]);

  const rowVirtualizer = useVirtualizer({
    count: session.messages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: messageEstimateSize,
    overscan: 3, // Render 3 messages above and below viewport
  });

  // Auto-scroll to bottom when new messages arrive (if auto-scroll is enabled)
  useEffect(() => {
    if (autoScroll && session.messages.length > 0) {
      rowVirtualizer.scrollToIndex(session.messages.length - 1, {
        behavior: "smooth",
      });
    }
  }, [session.messages.length, autoScroll, rowVirtualizer]);

  // Detect manual scrolling
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      setAutoScroll(isAtBottom);
    };

    scrollContainer.addEventListener("scroll", handleScroll);
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const messageToSend = inputMessage.trim();
    setInputMessage("");

    try {
      await onSendMessage(messageToSend, isAgentic);
    } catch (err) {
      setInputMessage(messageToSend); // Restore message on error
      toast.error("Failed to send message");
      console.error("Failed to send message:", err);
    }
  };

  const handleCancelMessage = async () => {
    try {
      const wasCancelled = await cancelMessage(session.id);
      if (wasCancelled) {
        toast.success("Message cancelled");
      }
    } catch (err) {
      console.error("Failed to cancel message:", err);
    }
  };

  const handleEditMessage = (messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditingContent(content);
  };

  const handleSaveEdit = async (messageId: string) => {
    try {
      await editMessage({
        sessionId: session.id,
        messageId,
        newContent: editingContent,
      });

      // Automatically regenerate response
      await regenerateFromMessage({
        sessionId: session.id,
        messageId,
        isAgentic,
      });

      toast.success("Message edited and response regenerated");
    } catch (err) {
      toast.error("Failed to edit message");
      console.error("Failed to edit message:", err);
    } finally {
      setEditingMessageId(null);
      setEditingContent("");
    }
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingContent("");
  };

  const [copiedCode, setCopiedCode] = useState<string>("");

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(id);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedCode(""), 2000);
    } catch (err) {
      toast.error("Failed to copy");
    }
  };

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.role === "user";
    const isStreaming = message.metadata?.isStreaming === true;

    return (
      <div
        key={message.id}
        className={`group relative mb-6 ${isUser ? "" : ""}`}
      >
        <div className={`flex gap-3 ${isUser ? "" : ""}`}>
          {/* Avatar */}
          <div className="flex-shrink-0">
            <div
              className={`w-8 h-8 rounded-sm flex items-center justify-center ${
                isUser
                  ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm"
                  : "bg-black text-white"
              }`}
            >
              {isUser ? (
                <User className="w-4 h-4" strokeWidth={2.5} />
              ) : (
                <Bot className="w-4 h-4" strokeWidth={2.5} />
              )}
            </div>
          </div>

          {/* Message content */}
          <div className="flex-1 min-w-0">
            <div>
              {/* Role label */}
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground/70 mb-1">
                <span>{isUser ? "You" : "Assistant"}</span>
                {message.metadata?.edited && (
                  <span className="text-xs font-normal text-muted-foreground">
                    (edited)
                  </span>
                )}
              </div>

              {/* Message content */}
              <div className="">
                <div className="text-[15px] leading-[1.8]">
                  {isUser ? (
                    editingMessageId === message.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          className="min-h-[80px] text-[15px] leading-[1.8]"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSaveEdit(message.id);
                            } else if (e.key === "Escape") {
                              handleCancelEdit();
                            }
                          }}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveEdit(message.id)}
                            disabled={!editingContent.trim()}
                          >
                            Save & Regenerate
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancelEdit}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="group/message relative">
                        <p className="whitespace-pre-wrap text-foreground/90">
                          {message.content}
                        </p>
                        {!isLoading && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute -right-8 top-0 opacity-0 group-hover/message:opacity-100 transition-opacity h-6 w-6 p-0"
                            onClick={() =>
                              handleEditMessage(message.id, message.content)
                            }
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    )
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:text-[15px] prose-p:leading-[1.8] prose-p:text-foreground/90 prose-headings:text-foreground prose-strong:text-foreground prose-code:text-foreground prose-pre:bg-transparent prose-pre:p-0 prose-table:text-sm prose-td:p-2 prose-th:p-2 prose-th:text-left prose-th:font-semibold relative">
                      {message.content ? (
                        <>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex, rehypeHighlight]}
                            components={{
                              p: ({ children }) => (
                                <p className="mb-4 last:mb-0">{children}</p>
                              ),
                              h1: ({ children }) => (
                                <h1 className="text-2xl font-bold mb-4 mt-6 first:mt-0">
                                  {children}
                                </h1>
                              ),
                              h2: ({ children }) => (
                                <h2 className="text-xl font-bold mb-3 mt-5 first:mt-0">
                                  {children}
                                </h2>
                              ),
                              h3: ({ children }) => (
                                <h3 className="text-lg font-semibold mb-2 mt-4 first:mt-0">
                                  {children}
                                </h3>
                              ),
                              code: ({
                                className,
                                children,
                                ...props
                              }: any) => {
                                const match = /language-(\w+)/.exec(
                                  className || ""
                                );
                                const isInline = !className || !match;
                                // Extract text content from children properly
                                const extractText = (node: any): string => {
                                  if (typeof node === "string") return node;
                                  if (Array.isArray(node))
                                    return node.map(extractText).join("");
                                  if (node?.props?.children)
                                    return extractText(node.props.children);
                                  return String(node);
                                };
                                const codeString = extractText(
                                  children
                                ).replace(/\n$/, "");
                                const codeId = `code-${
                                  message.id
                                }-${Math.random()
                                  .toString(36)
                                  .substring(2, 11)}`;

                                return !isInline ? (
                                  <div className="my-4 relative group">
                                    <div className="relative bg-zinc-900 rounded-lg overflow-hidden">
                                      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800 text-zinc-400 text-xs">
                                        <span className="font-mono">
                                          {match?.[1] || "plaintext"}
                                        </span>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 px-2 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100"
                                          onClick={() =>
                                            copyToClipboard(codeString, codeId)
                                          }
                                        >
                                          {copiedCode === codeId ? (
                                            <Check className="w-3.5 h-3.5" />
                                          ) : (
                                            <Copy className="w-3.5 h-3.5" />
                                          )}
                                          <span className="ml-1.5">
                                            {copiedCode === codeId
                                              ? "Copied!"
                                              : "Copy"}
                                          </span>
                                        </Button>
                                      </div>
                                      <pre className="p-4 overflow-x-auto">
                                        <code
                                          className={`text-[13px] leading-[1.6] ${
                                            className || ""
                                          }`}
                                          {...props}
                                        >
                                          {children}
                                        </code>
                                      </pre>
                                    </div>
                                  </div>
                                ) : (
                                  <code
                                    className="bg-zinc-100 dark:bg-zinc-800 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded text-[13px] font-mono"
                                    {...props}
                                  >
                                    {children}
                                  </code>
                                );
                              },
                              pre: ({ children }) => <>{children}</>,
                              ul: ({ children }) => (
                                <ul className="list-disc pl-6 mb-4 space-y-2">
                                  {children}
                                </ul>
                              ),
                              ol: ({ children }) => (
                                <ol className="list-decimal pl-6 mb-4 space-y-2">
                                  {children}
                                </ol>
                              ),
                              li: ({ children }) => (
                                <li className="leading-[1.8] pl-1">
                                  {children}
                                </li>
                              ),
                              blockquote: ({ children }) => (
                                <blockquote className="border-l-4 border-zinc-300 dark:border-zinc-600 pl-4 my-4 italic text-foreground/80">
                                  {children}
                                </blockquote>
                              ),
                              table: ({ children }) => (
                                <div className="my-4 overflow-x-auto">
                                  <table className="min-w-full divide-y divide-border">
                                    {children}
                                  </table>
                                </div>
                              ),
                              th: ({ children }) => (
                                <th className="px-3 py-2 text-left text-sm font-semibold bg-muted/50">
                                  {children}
                                </th>
                              ),
                              td: ({ children }) => (
                                <td className="px-3 py-2 text-sm border-t">
                                  {children}
                                </td>
                              ),
                              hr: () => <hr className="my-6 border-border" />,
                              a: ({ href, children }) => (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                  {children}
                                </a>
                              ),
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                          {isStreaming && (
                            <span className="inline-block w-1 h-4 bg-foreground/70 animate-pulse ml-0.5" />
                          )}
                        </>
                      ) : (
                        isStreaming && (
                          <span className="inline-block w-1 h-4 bg-foreground/70 animate-pulse" />
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Cancel button for streaming messages */}
              {isStreaming &&
                !isUser &&
                activeAbortControllers.has(session.id) && (
                  <div
                    className="cursor-pointer w-8 h-8 border-1 flex items-center justify-center p-1 rounded-full mt-2"
                    onClick={handleCancelMessage}
                  >
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger>
                          <StopCircle className="text-red-500 w-6 h-6" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Cancel Message</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}

              {/* Thinking toggle */}
              {message.metadata?.thinking && (
                <div className="mt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md"
                    onClick={() => {
                      const newExpanded = new Set(expandedThinking);
                      if (newExpanded.has(message.id)) {
                        newExpanded.delete(message.id);
                      } else {
                        newExpanded.add(message.id);
                      }
                      setExpandedThinking(newExpanded);
                    }}
                  >
                    <Brain className="w-3 h-3 mr-1.5" />
                    {expandedThinking.has(message.id) ? "Hide" : "View"}{" "}
                    thinking process
                    {expandedThinking.has(message.id) ? (
                      <ChevronUp className="w-3 h-3 ml-1" />
                    ) : (
                      <ChevronDown className="w-3 h-3 ml-1" />
                    )}
                  </Button>

                  {expandedThinking.has(message.id) && (
                    <div className="mt-2 p-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900/50">
                      <p className="text-xs text-amber-700 dark:text-amber-400 mb-2 font-semibold">
                        Thinking Process
                      </p>
                      <pre className="text-xs text-amber-600 dark:text-amber-500 whitespace-pre-wrap font-mono leading-relaxed">
                        {message.metadata.thinking}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Artifacts with lazy loading */}
              {message.metadata?.artifacts?.map((artifact) => (
                <div key={artifact.id} className="mt-4">
                  <LazyArtifact
                    artifactId={artifact.id}
                    artifactType={artifact.type}
                    artifactContent={JSON.stringify(artifact.data)}
                    estimatedHeight={artifact.type === "table" ? 600 : 400}
                  >
                    <ArtifactRendererWrapper
                      artifact={artifact}
                      session={session}
                    />
                  </LazyArtifact>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b bg-background px-4 py-3">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold truncate">
              {session.title}
            </h2>

            {session.connection && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline" className="text-xs px-2 py-0.5">
                  {session.connection.model}
                </Badge>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages with virtual scrolling */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto"
        style={{ contain: "strict" }}
      >
        <div className="max-w-5xl mx-auto px-4">
          {session.messages.length === 0 ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-16 mb-6">
                <img src={Logo} />
              </div>
              <h3 className="text-xl font-semibold mb-2">
                How can I help you today?
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Ask me about your data, and I'll help with queries and
                visualizations.
              </p>
            </div>
          ) : (
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                const message = session.messages[virtualItem.index];
                if (!message) return null;

                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    {renderMessage(message)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div>
        <div className="max-w-3xl mx-auto p-4">
          <ChatInputWithMentions
            value={inputMessage}
            onChange={setInputMessage}
            onSend={handleSendMessage}
            disabled={isLoading}
            session={session}
            onConnectionChange={(connectionId) =>
              updateSessionConnection(session.id, connectionId)
            }
            isAgentic={isAgentic}
            onAgenticToggle={setIsAgentic}
          />
        </div>
      </div>
    </div>
  );
}
