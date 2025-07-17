import { atom } from "jotai";

// Command Palette state
export const commandPaletteOpenAtom = atom(false);

// Actions
export const toggleCommandPaletteAtom = atom(
  null,
  (get, set) => {
    set(commandPaletteOpenAtom, !get(commandPaletteOpenAtom));
  }
);

export const openCommandPaletteAtom = atom(
  null,
  (_get, set) => {
    set(commandPaletteOpenAtom, true);
  }
);

export const closeCommandPaletteAtom = atom(
  null,
  (_get, set) => {
    set(commandPaletteOpenAtom, false);
  }
);