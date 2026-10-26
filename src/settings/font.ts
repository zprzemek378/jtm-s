// Which typeface the interface is set in.
//
// Kept as a choice rather than a decision because the one everybody likes the
// look of — Happy Monkey — is missing most of the Polish alphabet, and a game
// played in Polish cannot have its players' names falling back to another font
// letter by letter. So the pretty one stays on offer with its gap stated, and
// the default stays what the game has always rendered in: the machine's own
// interface font, which costs no download and can spell anything.

import { STORAGE_KEYS, readStoredString, writeStoredString } from "@/storage/localStorage";

export const FontChoice = {
  /** Whatever the machine uses for its own interface: no download at all. */
  System: "system",
  /** Rounded and playful, and it can spell "Zażółć gęślą jaźń". */
  Grandstander: "grandstander",
  /** The same spirit, missing the Polish letters. */
  HappyMonkey: "happy-monkey",
  /** A plain one, for anybody who wants the game to stop being playful. */
  MavenPro: "maven-pro",
  /**
   * The one everybody asks for. Installed on Windows and macOS, so it is taken
   * from the machine; everywhere else Comic Relief stands in, which is a free
   * face built to the same shapes and, unlike the obvious Comic Neue, has the
   * Polish letters.
   */
  ComicSans: "comic-sans",
  /** Hand-drawn and cheerful, with a full Polish alphabet of its own. */
  ShantellSans: "shantell-sans",
  /** An arcade cabinet. Large and square: fun, and a poor fit for long names. */
  PressStart: "press-start",
} as const;

export type FontChoice = (typeof FontChoice)[keyof typeof FontChoice];

export const FONT_CHOICES: readonly FontChoice[] = [
  FontChoice.System,
  FontChoice.Grandstander,
  FontChoice.HappyMonkey,
  FontChoice.ComicSans,
  FontChoice.ShantellSans,
  FontChoice.MavenPro,
  FontChoice.PressStart,
];

/** What each one is called on screen — a typeface keeps its name in any language. */
export const FONT_LABELS: Record<FontChoice, string> = {
  [FontChoice.System]: "System",
  [FontChoice.Grandstander]: "Grandstander",
  [FontChoice.HappyMonkey]: "Happy Monkey",
  [FontChoice.MavenPro]: "Maven Pro",
  [FontChoice.ComicSans]: "Comic Sans",
  [FontChoice.ShantellSans]: "Shantell Sans",
  [FontChoice.PressStart]: "Press Start",
};

/** The ones known to be missing Polish letters, so the screen can say so. */
export const FONTS_WITHOUT_POLISH: readonly FontChoice[] = [FontChoice.HappyMonkey];

const DEFAULT_FONT: FontChoice = FontChoice.System;

function isFontChoice(value: string | null): value is FontChoice {
  return FONT_CHOICES.includes(value as FontChoice);
}

export function readFontChoice(): FontChoice {
  const stored = readStoredString(STORAGE_KEYS.font);

  return isFontChoice(stored) ? stored : DEFAULT_FONT;
}

/**
 * Puts the choice on `<html>`, where the stylesheet picks it up — the same way
 * the theme travels. Called once as the app starts and again on every change.
 */
export function applyFontChoice(choice: FontChoice): void {
  document.documentElement.dataset.font = choice;
}

export function setFontChoice(choice: FontChoice): void {
  writeStoredString(STORAGE_KEYS.font, choice);
  applyFontChoice(choice);
}
