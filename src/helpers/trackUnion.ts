// Merging several playlists into the pool one game draws from.
//
// A track present on more than one of the chosen playlists must appear in the
// pool exactly once, otherwise it would be twice as likely to come up as its
// neighbours. With the union deduplicated, the draw itself — uniform and
// without replacement — gives every track the same chance.

import {
  emptySkipCounts,
  type PlayableTrack,
  type PlaylistTracks,
  type SkipCounts,
  type SkipReason,
} from '@/spotify/types'

/** One chosen playlist's contribution to the pool. */
export type TrackSource = {
  playlistName: string
  tracks: PlaylistTracks
}

/** A track in the pool, knowing which playlists it came from. */
export type PooledTrack = PlayableTrack & {
  /** Every chosen playlist holding this track, in the order they were picked. */
  playlistNames: readonly string[]
}

export type TrackUnion = {
  /** Every distinct track, in the order the playlists were chosen. */
  tracks: readonly PooledTrack[]
  /** Tracks dropped because an earlier playlist already contributed them. */
  duplicateCount: number
  /** Entries the playlists themselves could not offer, by reason. */
  skipped: SkipCounts
}

/**
 * Identity is the Spotify track id, so the same recording on two playlists
 * collapses into one entry — which then lists both playlists as its origin.
 * Two different releases of one song — a single and an album cut, a live
 * version, a remaster — carry different ids and stay separate, because they
 * are genuinely different recordings.
 */
export function unionTracks(sources: readonly TrackSource[]): TrackUnion {
  const tracks: PooledTrack[] = []
  const byId = new Map<string, PooledTrack>()
  const skipped = emptySkipCounts()
  let duplicateCount = 0

  for (const source of sources) {
    for (const reason of Object.keys(skipped) as SkipReason[]) {
      skipped[reason] += source.tracks.skipped[reason]
    }

    for (const track of source.tracks.tracks) {
      const existing = byId.get(track.id)

      if (existing) {
        duplicateCount += 1

        // The same recording from another playlist: keep one entry, but record
        // that this playlist holds it too.
        if (!existing.playlistNames.includes(source.playlistName)) {
          existing.playlistNames = [...existing.playlistNames, source.playlistName]
        }

        continue
      }

      const pooled: PooledTrack = { ...track, playlistNames: [source.playlistName] }
      byId.set(track.id, pooled)
      tracks.push(pooled)
    }
  }

  return { tracks, duplicateCount, skipped }
}
