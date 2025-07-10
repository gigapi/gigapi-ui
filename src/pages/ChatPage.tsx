import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import ChatSidebar from "@/components/chat/ChatSidebar";
import ChatInterface from "@/components/chat/ChatInterface";
import AppLayout from "@/components/navigation/AppLayout";
import { useChat } from "@/hooks/useChat";

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
    updateSessionContext,
  } = useChat();

  // Handle URL-based chat routing
  useEffect(() => {
    if (chatId && chatId !== "welcome") {
      setActiveSessionId(chatId);
    } else if (!chatId) {
      setActiveSessionId(null);
    }
  }, [chatId, setActiveSessionId]);

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
        return;
      }

      const newSessionId = createSession({
        connectionId: connections[0].id,
        title: "New Chat",
      });
      navigate(`/chat/${newSessionId}`);
    } catch (error) {
      console.error("Failed to create new chat:", error);
      navigate("/chat");
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
    <AppLayout breadcrumbs={breadcrumbs} showDatabaseControls={true}>
      <div className="h-full flex">
        <ChatSidebar
          activeSessionId={activeSessionId}
          onSessionSelect={handleSessionSelect}
          onNewChat={handleNewChat}
        />
        {activeSession ? (
          <ChatInterface
            session={activeSession}
            onSendMessage={(message) =>
              sendMessage({ sessionId: activeSession.id, message })
            }
            onUpdateContext={(context) =>
              updateSessionContext(activeSession.id, context)
            }
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">
              Select or create a chat to begin
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
