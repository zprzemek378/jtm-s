// A round played on the words alone.
//
// Pure rules, kept out of the session so they can be checked on their own:
// which files can carry a round, where in one to start, and how much of it is
// on screen by a given moment.

import { LYRIC_LINE_INTERVAL_MS, LYRIC_TAIL_LINES, MIN_LYRIC_LINES } from "@/constants/gameRules";
import { LyricsKind, LyricsStatus, type LyricsReadout } from "@/lyrics/types";

/**
 * The lines a round could be played on, or null when this track cannot carry
 * one.
 *
 * Blank lines are dropped: in a timed file they mark the instrumental breaks,
 * and a round that spends its seconds revealing nothing is a round wasted.
 * Untimed files count too — without stamps they cannot be sung along to, but
 * they can certainly be read out a line at a time.
 */
export function lyricLinesFor(readout: LyricsReadout): readonly string[] | null {
  if (readout.status !== LyricsStatus.Ready || !readout.lyrics) {
    return null;
  }

  const lines =
    readout.lyrics.kind === LyricsKind.Synced
      ? readout.lyrics.lines.map((line) => line.text)
      : readout.lyrics.text.split("\n");

  const usable = lines.map((line) => line.trim()).filter((line) => line.length > 0);

  return usable.length >= MIN_LYRIC_LINES ? usable : null;
}

/**
 * Where in the file to open.
 *
 * Anywhere, except so near the end that the round runs out of words — the
 * surprise is which part of the song it is, not whether there is one.
 */
export function openingLine(count: number, random: () => number = Math.random): number {
  const last = count - LYRIC_TAIL_LINES;

  return last <= 0 ? 0 : Math.floor(random() * (last + 1));
}

/** How many lines have appeared by this point in the round — one from the off. */
export function visibleLineCount(elapsedMs: number): number {
  return Math.max(1, Math.floor(Math.max(0, elapsedMs) / LYRIC_LINE_INTERVAL_MS) + 1);
}
