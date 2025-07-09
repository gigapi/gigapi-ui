// Connection atoms
export * from "./connection";
export * from "./connection/actions";

// Core atoms
export * from "./query-atoms";
export * from "./database-atoms";
export * from "./time-atoms";
export * from "./dashboard-atoms";
export * from "./mcp-atoms";

// UI atoms
export * from "./ui/preferences";

// UI State atoms
import { atom } from "jotai";
export const commandPaletteOpenAtom = atom<boolean>(false);

