// What the game works with once a lyrics file has been parsed.

/** One line of a synced file: the text, and when it is sung. */
export type LyricLine = {
  atMs: number;
  text: string;
};

export const LyricsKind = {
  /** Timed line by line — the only kind karaoke can follow. */
  Synced: "synced",
  /** The words, with no timing. Shown as a block instead. */
  Plain: "plain",
} as const;

export type LyricsKind = (typeof LyricsKind)[keyof typeof LyricsKind];

export type Lyrics =
  | { kind: typeof LyricsKind.Synced; lines: readonly LyricLine[] }
  | { kind: typeof LyricsKind.Plain; text: string };

export const LyricsStatus = {
  /** Karaoke is switched off, or no track is in play. */
  Idle: "idle",
  Loading: "loading",
  Ready: "ready",
  /** LRCLIB answered, and has nothing for this recording. */
  Missing: "missing",
  /** LRCLIB could not be reached, or would not answer. */
  Failed: "failed",
} as const;

export type LyricsStatus = (typeof LyricsStatus)[keyof typeof LyricsStatus];

export type LyricsReadout = {
  status: LyricsStatus;
  lyrics: Lyrics | null;
};
