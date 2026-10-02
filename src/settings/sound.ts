// Whether the game plays its own sound effects.
//
// Separate from the music: this is the buzzer, the countdown and the verdicts,
// which come from files in the app rather than from Spotify.

import { STORAGE_KEYS, readStoredString, writeStoredString } from '@/storage/localStorage'

/** On unless it was explicitly switched off. */
export function isSoundEnabled(): boolean {
  return readStoredString(STORAGE_KEYS.soundEnabled) !== 'false'
}

export function setSoundEnabled(enabled: boolean): void {
  writeStoredString(STORAGE_KEYS.soundEnabled, String(enabled))
}
