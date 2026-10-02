// Which tracks a group has already heard.
//
// A pool without repeats is easy inside one game; the point here is that a
// series of games should not repeat either. Play again, or go back to the
// setup screen and start afresh without touching the playlists, and the songs
// already heard stay out of the draw. Change the playlists and the history no
// longer applies, so it starts over.

import { STORAGE_KEYS, readStoredJson, writeStoredJson } from '@/storage/localStorage'

type StoredHistory = {
  /** Identifies the playlist selection the history belongs to. */
  key: string
  trackIds: string[]
}

/**
 * Identifies a selection of playlists, regardless of the order they were
 * picked in — the same three playlists are the same pool however they were
 * chosen.
 */
export function selectionKey(playlistIds: readonly string[]): string {
  return [...playlistIds].sort().join('|')
}

/** What this selection has already played, or nothing for a new selection. */
export function readPlayedTracks(key: string): readonly string[] {
  const stored = readStoredJson<StoredHistory>(STORAGE_KEYS.playedTracks)

  if (!stored || stored.key !== key || !Array.isArray(stored.trackIds)) {
    return []
  }

  return stored.trackIds.filter((id): id is string => typeof id === 'string')
}

export function writePlayedTracks(key: string, trackIds: readonly string[]): void {
  writeStoredJson(STORAGE_KEYS.playedTracks, { key, trackIds: [...trackIds] })
}
