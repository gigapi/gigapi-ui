import { useAtom, useSetAtom } from "jotai";
import {
  chatSessionsAtom,
  aiConnectionsAtom,
  activeSessionIdAtom,
  activeSessionAtom,
  sessionListAtom,
  createSessionAtom,
  updateSessionContextAtom,
  sendMessageAtom,
  deleteSessionAtom,
  renameSessionAtom,
} from "@/atoms/chat-atoms";

export function useChat() {
  const [sessions] = useAtom(chatSessionsAtom);
  const [connections] = useAtom(aiConnectionsAtom);
  const [activeSessionId, setActiveSessionId] = useAtom(activeSessionIdAtom);
  const [activeSession] = useAtom(activeSessionAtom);
  const [sessionList] = useAtom(sessionListAtom);

  const createSession = useSetAtom(createSessionAtom);
  const updateSessionContext = useSetAtom(updateSessionContextAtom);
  const sendMessage = useSetAtom(sendMessageAtom);
  const deleteSession = useSetAtom(deleteSessionAtom);
  const renameSession = useSetAtom(renameSessionAtom);

  return {
    // State
    sessions,
    connections,
    activeSessionId,
    activeSession,
    sessionList,

    // Actions
    createSession,
    updateSessionContext,
    sendMessage,
    deleteSession,
    renameSession,
    setActiveSessionId,
  };
}
