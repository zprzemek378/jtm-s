// Reading an LRC file.
//
// The format is one line of text per line of song, each stamped with when it is
// sung: `[01:07.13] Mama, life had just begun`. A line can carry several stamps
// when the same words come round again, and a file usually opens with metadata
// tags — `[ar:Queen]` — which look the same but hold no digits.

import type { LyricLine } from "./types";

/** `[mm:ss]`, `[mm:ss.xx]` or `[mm:ss.xxx]`, with a colon also seen in place of the dot. */
const TIMESTAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/**
 * Every stamped line, in order.
 *
 * Blank lines are kept: an empty stamp is how a file marks a long instrumental
 * break, and dropping those would leave the last line sung before the break on
 * screen for the whole of it.
 */
export function parseLrc(text: string): LyricLine[] {
  const lines: LyricLine[] = [];

  for (const raw of text.split("\n")) {
    const stamps: number[] = [];
    let lastStampEnd = 0;

    TIMESTAMP.lastIndex = 0;

    for (let match = TIMESTAMP.exec(raw); match !== null; match = TIMESTAMP.exec(raw)) {
      // Only the run of stamps at the start of the line is timing; anything
      // further in is part of the lyric and left alone.
      if (match.index !== lastStampEnd) {
        break;
      }

      const [, minutes, seconds, fraction = ""] = match;
      stamps.push(
        Number(minutes) * 60_000 + Number(seconds) * 1000 + Number(fraction.padEnd(3, "0")),
      );
      lastStampEnd = match.index + match[0].length;
    }

    if (stamps.length === 0) {
      continue;
    }

    const content = raw.slice(lastStampEnd).trim();

    for (const atMs of stamps) {
      lines.push({ atMs, text: content });
    }
  }

  return lines.sort((left, right) => left.atMs - right.atMs);
}

/**
 * Which line is being sung at this position, or -1 before the first one.
 *
 * Called several times a second while a track plays on, so it bisects rather
 * than walking the file.
 */
export function activeLineIndex(lines: readonly LyricLine[], positionMs: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;

  while (low <= high) {
    const middle = (low + high) >> 1;

    if (lines[middle].atMs <= positionMs) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return found;
}
