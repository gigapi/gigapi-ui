// Connection atoms
export * from "./connection-atoms";

// Core atoms
export * from "./query-atoms";
export * from "./database-atoms";
export * from "./time-atoms";
export * from "./dashboard-atoms";
export * from "./chat-atoms";

// UI State atoms
import { atom } from "jotai";
export const commandPaletteOpenAtom = atom<boolean>(false);

// Export the chat hooks
export { useChat } from "@/hooks/useChat";
