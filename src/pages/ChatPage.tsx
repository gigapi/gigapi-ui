import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import ChatSidebar from "@/components/MCP/ChatSidebar";
import ChatInterface from "@/components/MCP/ChatInterface";
import AppLayout from "@/components/navigation/AppLayout";
import { useMCP } from "@/atoms";

interface ChatPageProps {
  chatId?: string;
}

export default function ChatPage({ chatId }: ChatPageProps) {
  const { switchChatSession, activeSession, createChatSession } = useMCP();
  const navigate = useNavigate();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    chatId || "welcome"
  );

  // Handle URL-based chat routing - only when chatId changes
  useEffect(() => {
    if (chatId && chatId !== "welcome") {
      // Switch to the chat session from URL
      setActiveSessionId(chatId);
      switchChatSession(chatId);
    } else if (!chatId) {
      // No chatId in URL, show welcome
      setActiveSessionId("welcome");
    }
  }, [chatId]); // Remove switchChatSession from deps to avoid loops

  const handleSessionSelect = (sessionId: string) => {
    if (sessionId === "welcome") {
      // Navigate to base chat route for welcome
      navigate("/chat");
    } else {
      // Navigate to specific chat route
      navigate(`/chat/${sessionId}`);
    }
  };

  const handleNewChat = async () => {
    try {
      // Create a new chat session
      const newSessionId = await createChatSession();
      // Navigate to the new chat
      navigate(`/chat/${newSessionId}`);
    } catch (error) {
      console.error("Failed to create new chat:", error);
      // Fallback to welcome
      navigate("/chat");
    }
  };


  // Create breadcrumbs with current chat name
  const breadcrumbs = [
    { label: "Assistant", href: "/chat" },
    ...(activeSession && activeSessionId !== "welcome" 
      ? [{ label: activeSession.title || "Chat", href: `/chat/${activeSession.id}` }]
      : []
    )
  ];

  return (
    <AppLayout breadcrumbs={breadcrumbs} showDatabaseControls={true}>
      <div className="h-full flex">
        <ChatSidebar
          activeSessionId={activeSessionId}
          onSessionSelect={handleSessionSelect}
          onNewChat={handleNewChat}
        />
        <ChatInterface
          activeSessionId={activeSessionId}
          onNewChat={handleNewChat}
        />
      </div>
    </AppLayout>
  );
}
