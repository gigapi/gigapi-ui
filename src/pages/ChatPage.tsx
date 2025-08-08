import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import SimpleChatSidebar from "@/components/chat/SimpleChatSidebar";
import ChatInterface from "@/components/chat/ChatInterface";
import AppLayout from "@/components/navigation/AppLayout";
import { useChat } from "@/hooks/useChat";
import ChatInputWithMentions from "@/components/chat/ChatInputWithMentions";
import AIConnectionSheet from "@/components/chat/AIConnectionSheet";
import { Button } from "@/components/ui/button";
import { Plus, AlertCircle } from "lucide-react";
import Logo from "@/assets/logo.svg";

interface ChatPageProps {
  chatId?: string;
}

export default function ChatPage({ chatId }: ChatPageProps) {
  const navigate = useNavigate();
  const {
    activeSession,
    activeSessionId,
    setActiveSessionId,
    createSession,
    connections,
    sendMessage,
  } = useChat();

  const [inputMessage, setInputMessage] = useState("");
  const [showConnectionSheet, setShowConnectionSheet] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");

  // Handle URL-based chat routing
  useEffect(() => {
    if (chatId && chatId !== "welcome") {
      setActiveSessionId(chatId);
    } else if (!chatId) {
      setActiveSessionId(null);
    }
  }, [chatId, setActiveSessionId]);

  // Initialize selected connection when connections load
  useEffect(() => {
    if (connections.length > 0 && !selectedConnectionId) {
      const activeConnection =
        connections.find((c) => c.isActive) || connections[0];
      setSelectedConnectionId(activeConnection.id);
    }
  }, [connections, selectedConnectionId]);

  const handleSessionSelect = (sessionId: string) => {
    if (sessionId === "welcome") {
      navigate("/chat");
    } else {
      navigate(`/chat/${sessionId}`);
    }
  };

  const handleNewChat = async () => {
    try {
      if (connections.length === 0) {
        setShowConnectionSheet(true);
        return;
      }

      // Use selected connection or fallback to active/first connection
      const connectionId =
        selectedConnectionId ||
        connections.find((c) => c.isActive)?.id ||
        connections[0]?.id;

      if (!connectionId) {
        setShowConnectionSheet(true);
        return;
      }

      const newSessionId = createSession({
        connectionId,
        title: "New Chat",
      });
      navigate(`/chat/${newSessionId}`);
    } catch (error) {
      console.error("Failed to create new chat:", error);
      navigate("/chat");
    }
  };

  // Handle welcome screen message send
  const handleWelcomeMessageSend = async () => {
    if (!inputMessage.trim()) return;

    try {
      if (connections.length === 0) {
        setShowConnectionSheet(true);
        return;
      }

      // Use selected connection or fallback to active/first connection
      const connectionId =
        selectedConnectionId ||
        connections.find((c) => c.isActive)?.id ||
        connections[0]?.id;

      if (!connectionId) {
        setShowConnectionSheet(true);
        return;
      }

      const newSessionId = createSession({
        connectionId,
        title:
          inputMessage.slice(0, 50) + (inputMessage.length > 50 ? "..." : ""),
      });

      navigate(`/chat/${newSessionId}`);

      // Send message after navigation
      setTimeout(() => {
        sendMessage({ sessionId: newSessionId, message: inputMessage });
      }, 100);
    } catch (error) {
      console.error("Failed to create chat and send message:", error);
    }
  };

  // Create breadcrumbs with current chat name
  const breadcrumbs = [
    { label: "Assistant", href: "/chat" },
    ...(activeSession
      ? [
          {
            label: activeSession.title || "Chat",
            href: `/chat/${activeSession.id}`,
          },
        ]
      : []),
  ];

  return (
    <AppLayout breadcrumbs={breadcrumbs} showDatabaseControls={false}>
      <div className="h-full flex">
        <SimpleChatSidebar
          activeSessionId={activeSessionId}
          onSessionSelect={handleSessionSelect}
          onNewChat={handleNewChat}
        />
        {activeSession ? (
          <ChatInterface
            session={activeSession}
            onSendMessage={(message, isAgentic) =>
              sendMessage({ sessionId: activeSession.id, message, isAgentic })
            }
          />
        ) : (
          <div className="flex-1">
            <div className="flex flex-col">
              {/* Welcome Screen */}
              <div className="flex-1 flex mt-22">
                <div className="max-w-3xl mx-auto px-4 text-center">
                  {/* Logo */}
                  <div className="mb-8">
                    <img src={Logo} alt="Gigapi" className="h-16 mx-auto" />
                  </div>

                  {/* Welcome Text */}
                  <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent ">
                    Welcome to Gigapi AI Assistant
                  </h1>
                  <p className="text-xl text-muted-foreground mb-12">
                    {connections.length === 0
                      ? "Connect an AI provider to start exploring your data"
                      : ""}
                  </p>

                  {connections.length === 0 ? (
                    /* No Connections State */
                    <div className="space-y-6">
                      <div className="bg-muted/30 border border-border rounded-xl p-8">
                        <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">
                          No AI Provider Connected
                        </h3>
                        <p className="text-muted-foreground mb-6">
                          To start using the AI assistant, you need to configure
                          at least one AI provider. We support OpenAI,
                          Anthropic, Ollama, and more.
                        </p>
                        <Button
                          size="lg"
                          className="gap-2"
                          onClick={() => setShowConnectionSheet(true)}
                        >
                          <Plus className="w-4 h-4" />
                          Add AI Connection
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <ChatInputWithMentions
                      value={inputMessage}
                      onChange={setInputMessage}
                      onSend={handleWelcomeMessageSend}
                      placeholder="Ask me anything about your data..."
                      session={{
                        id: "welcome",
                        title: "Welcome",
                        aiConnectionId:
                          selectedConnectionId || connections[0]?.id || "",
                        connection:
                          connections.find(
                            (c) => c.id === selectedConnectionId
                          ) || connections[0],
                        messages: [],
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                      }}
                      onConnectionChange={(connectionId) => {
                        setSelectedConnectionId(connectionId);
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI Connection Sheet */}
      <AIConnectionSheet
        isOpen={showConnectionSheet}
        onOpenChange={setShowConnectionSheet}
      />
    </AppLayout>
  );
}
