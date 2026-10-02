// Safe mode: the switch that keeps the app to what the Spotify API openly
// supports.
//
// Scanning a playlist costs two requests per 21 tracks and cannot be made
// risk-free: Spotify counts its rate limit per application over a rolling 30
// second window, and a development-mode app that trips it can be shut out for
// the best part of a day — a real cooldown seen on this project was 81731
// seconds, close to 23 hours. So the feature stays off unless the host
// deliberately turns it on.

import { STORAGE_KEYS, readStoredString, writeStoredString } from "@/storage/localStorage";

/** On unless it was explicitly switched off — the cautious default. */
export function isSafeModeEnabled(): boolean {
  return readStoredString(STORAGE_KEYS.safeMode) !== "false";
}

export function setSafeModeEnabled(enabled: boolean): void {
  writeStoredString(STORAGE_KEYS.safeMode, String(enabled));
}
