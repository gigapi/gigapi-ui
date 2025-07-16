import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Copy,
  User,
  Brain,
  ChevronDown,
  ChevronUp,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { useSetAtom } from "jotai";
import { updateSessionConnectionAtom } from "@/atoms/chat-atoms";
import ArtifactRendererWrapper from "./artifacts/ArtifactRendererWrapper";
import ChatInputWithMentions from "./ChatInputWithMentions";
import type { ChatSession, ChatMessage } from "@/types/chat.types";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";
import Logo from "/logo.svg";

interface ChatInterfaceProps {
  session: ChatSession;
  onSendMessage: (message: string, isAgentic?: boolean) => Promise<void>;
}

export default function ChatInterface({
  session,
  onSendMessage,
}: ChatInterfaceProps) {
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAgentic, setIsAgentic] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(
    new Set()
  );
  const updateSessionConnection = useSetAtom(updateSessionConnectionAtom);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const messageToSend = inputMessage.trim();
    setInputMessage("");
    setIsLoading(true);

    try {
      await onSendMessage(messageToSend, isAgentic);
    } catch (err) {
      setInputMessage(messageToSend); // Restore message on error
      toast.error("Failed to send message");
      console.error("Failed to send message:", err);
    } finally {
      setIsLoading(false);
    }
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
              <div className="text-xs font-semibold text-foreground/70 mb-1">
                {isUser ? "You" : "Assistant"}
              </div>

              {/* Message content */}
              <div className="">
                <div className="text-[15px] leading-[1.8]">
                  {isUser ? (
                    <p className="whitespace-pre-wrap text-foreground/90">
                      {message.content}
                    </p>
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
                                const codeString = String(children).replace(
                                  /\n$/,
                                  ""
                                );
                                const codeId = `code-${
                                  message.id
                                }-${Math.random().toString(36).substr(2, 9)}`;

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

              {/* Artifacts */}
              {message.metadata?.artifacts?.map((artifact) => (
                <div key={artifact.id} className="mt-4">
                  <ArtifactRendererWrapper
                    artifact={artifact}
                    session={session}
                  />
                </div>
              ))}

              {/* Timestamp - removed for cleaner look */}
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

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="max-w-5xl mx-auto px-4 py-6">
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
            <>{session.messages.map(renderMessage)}</>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

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
