import { atom } from "jotai";

// Command Palette state
export const commandPaletteOpenAtom = atom(false);

// Actions

export const openCommandPaletteAtom = atom(
  null,
  (_get, set) => {
    set(commandPaletteOpenAtom, true);
  }
);

