// The shape of the playlist selection, plus the one rule that undoing it needs.

import type { PlaylistSummary, PlaylistTracks } from '@/spotify/types'
import type { ScanProgress } from '@/spotify/playlistScan'

/** One chosen playlist, with however far its contents have got. */
export type Chosen = {
  playlist: PlaylistSummary
  tracks: PlaylistTracks | null
  error: string | null
  /** Set while a playlist is being read by playing it; null otherwise. */
  scan: ScanProgress | null
  /** True when the scan hit its cap before the playlist ended. */
  truncated: boolean
  /** True when the tracks came from an earlier scan. */
  cached: boolean
}

export type Selection = Record<string, Chosen>

export type Restorable = {
  /** Entries that finished loading, and can simply be put back as they were. */
  settled: Selection
  /** Entries still in flight when the selection was cleared. */
  unsettled: readonly PlaylistSummary[]
}

/**
 * Splits a cleared selection into what can be restored verbatim and what has to
 * be fetched again.
 *
 * Clearing the selection abandons any request in flight, so putting such an
 * entry back untouched would leave a row saying "loading" that never resolves.
 * Those playlists are handed back to the caller to request afresh instead.
 */
export function partitionRestorable(selection: Selection): Restorable {
  const settled: Selection = {}
  const unsettled: PlaylistSummary[] = []

  for (const entry of Object.values(selection)) {
    if (entry.tracks !== null || entry.error !== null) {
      settled[entry.playlist.id] = entry
    } else {
      unsettled.push(entry.playlist)
    }
  }

  return { settled, unsettled }
}
