// Reading a playlist Spotify will not list, by playing it silently.
//
// Since February 2026 `GET /playlists/{id}/items` answers only for playlists
// the account owns or collaborates on. Playback is not restricted the same way:
// any playlist can be started as a context, `GET /me/player/queue` then reports
// the current track and the next twenty in full, and `offset: {position: N}`
// jumps straight to an index. Twenty-one tracks per jump, two requests each.
//
// Everything here is shaped by one hard constraint: Spotify counts requests per
// application over a rolling 30 second window, and a development-mode app that
// trips it can be locked out for the best part of a day. So the walk is slow,
// capped, cached, and gives up at the first sign of a rate limit rather than
// retrying into one.

import {
  QUEUE_LOOKAHEAD,
  SCAN_JUMP_DELAY_MS,
  SCAN_MAX_JUMPS,
} from '@/constants/spotify'
import {
  STORAGE_KEYS,
  readStoredJson,
  writeStoredJson,
} from '@/storage/localStorage'

import {
  fetchQueue,
  RepeatState,
  setRepeat,
  setShuffle,
  startContextPlayback,
  toPlayableFromTrack,
  type AccessTokenProvider,
} from './api'
import {
  emptySkipCounts,
  SkipReason,
  SpotifyError,
  SpotifyErrorKind,
  type PlayableTrack,
  type PlaylistTracks,
} from './types'

export type ScanProgress = {
  /** Distinct playable tracks collected so far. */
  collected: number
  jump: number
  maxJumps: number
}

export type ScanResult = PlaylistTracks & {
  /** True when the cap was reached before the playlist ran out. */
  truncated: boolean
  /** True when this came from a previous scan rather than the network. */
  fromCache: boolean
}

type CachedScan = {
  scannedAt: number
  truncated: boolean
  tracks: readonly PlayableTrack[]
}

type ScanCache = Record<string, CachedScan>

export function readScanCache(playlistId: string): CachedScan | null {
  return readStoredJson<ScanCache>(STORAGE_KEYS.scanCache)?.[playlistId] ?? null
}

function writeScanCache(playlistId: string, entry: CachedScan): void {
  const cache = readStoredJson<ScanCache>(STORAGE_KEYS.scanCache) ?? {}

  writeStoredJson(STORAGE_KEYS.scanCache, { ...cache, [playlistId]: entry })
}

export type ScanDependencies = {
  getAccessToken: AccessTokenProvider
  deviceId: string
  /** Silences our own device for the duration of the walk. */
  mute: () => Promise<void>
  /** Puts the host's own volume back — not full volume. */
  restoreVolume: () => Promise<void>
  pause: () => Promise<void>
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/**
 * A rate limit during a scan is fatal by design. Waiting it out is not an
 * option — the cooldown can be hours — and retrying would deepen it.
 */
function rethrowIfRateLimited(failure: unknown): void {
  if (failure instanceof SpotifyError && failure.kind === SpotifyErrorKind.RateLimited) {
    throw failure
  }
}

/**
 * Walks the playlist and returns everything it can play from it.
 *
 * `onProgress` is called after each jump so the screen can show the walk
 * advancing; a scan of a hundred tracks takes around fifteen seconds.
 */
export async function scanPlaylist(
  deps: ScanDependencies,
  playlistId: string,
  onProgress?: (progress: ScanProgress) => void,
): Promise<ScanResult> {
  const cached = readScanCache(playlistId)

  if (cached) {
    return {
      tracks: cached.tracks,
      skipped: emptySkipCounts(),
      truncated: cached.truncated,
      fromCache: true,
    }
  }

  const { getAccessToken, deviceId } = deps
  const found = new Map<string, PlayableTrack>()
  // Consecutive queue reads overlap, so an unusable entry would otherwise be
  // counted once per read it appears in. Keyed by uri, each is counted once.
  const skippedByUri = new Map<string, SkipReason>()
  const contextUri = `spotify:playlist:${playlistId}`
  let position = 0
  let truncated = true

  await deps.mute()

  try {
    // Shuffle off keeps the positions meaningful; repeat on the context stops
    // autoplay from padding the queue with tracks that are not on the playlist.
    await setShuffle(getAccessToken, deviceId, false)
    await setRepeat(getAccessToken, deviceId, RepeatState.Context)

    for (let jump = 0; jump < SCAN_MAX_JUMPS; jump += 1) {
      await startContextPlayback(getAccessToken, deviceId, contextUri, position)
      await sleep(SCAN_JUMP_DELAY_MS)

      const snapshot = await fetchQueue(getAccessToken)
      const before = found.size

      for (const entry of snapshot.entries) {
        const playable = toPlayableFromTrack(entry)

        if (typeof playable === 'string') {
          const uri = (entry as { uri?: string })?.uri ?? `unknown-${skippedByUri.size}`

          if (!skippedByUri.has(uri)) {
            skippedByUri.set(uri, playable)
          }

          continue
        }

        if (found.has(playable.id)) {
          continue
        }

        found.set(playable.id, playable)
      }

      onProgress?.({ collected: found.size, jump: jump + 1, maxJumps: SCAN_MAX_JUMPS })

      // Nothing new means the queue wrapped around to the start, so the whole
      // playlist has been seen.
      if (found.size === before) {
        truncated = false
        break
      }

      position += snapshot.entries.length || QUEUE_LOOKAHEAD + 1
    }
  } catch (failure) {
    rethrowIfRateLimited(failure)

    throw failure
  } finally {
    await deps.pause().catch(() => undefined)
    await deps.restoreVolume().catch(() => undefined)
    await setRepeat(getAccessToken, deviceId, RepeatState.Off).catch(() => undefined)
  }

  const tracks = [...found.values()]
  const skipped = emptySkipCounts()

  for (const reason of skippedByUri.values()) {
    skipped[reason] += 1
  }

  // A truncated walk is still cached: rescanning costs the same requests and
  // would hit the same cap. The screen says it is incomplete.
  writeScanCache(playlistId, { scannedAt: Date.now(), truncated, tracks })

  return { tracks, skipped, truncated, fromCache: false }
}
