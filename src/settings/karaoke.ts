// Whether the words appear once the answer is out.
//
// The lyrics come from LRCLIB, a community database, so two things follow: the
// app talks to a host other than Spotify, and what comes back is whatever
// somebody typed in. Both are fine for a party game, and neither should be a
// surprise — hence a switch.

import { STORAGE_KEYS, readStoredString, writeStoredString } from "@/storage/localStorage";

/** On unless it was explicitly switched off. */
export function isKaraokeEnabled(): boolean {
  return readStoredString(STORAGE_KEYS.karaokeEnabled) !== "false";
}

export function setKaraokeEnabled(enabled: boolean): void {
  writeStoredString(STORAGE_KEYS.karaokeEnabled, String(enabled));
}
