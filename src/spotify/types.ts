// The shapes this app works with. Spotify's own responses are much larger, so
// they are narrowed to what the game needs as soon as they arrive.

export type SpotifyUser = {
  id: string
  displayName: string
  /**
   * `premium`, `free`, `open`… — playback needs `premium`. Null when Spotify
   * does not report it: the February 2026 changes drop `product` from the user
   * object, so its absence must never be read as "not Premium".
   */
  product: string | null
  /** ISO country code, used as the `market` when resolving tracks. Often null. */
  country: string | null
}

export type PlaylistSummary = {
  id: string
  name: string
  ownerName: string
  /** Spotify omits the total for playlists it will not show the contents of. */
  trackCount: number
  imageUrl: string | null
  /**
   * Whether this playlist's contents can be read at all. Since February 2026
   * only playlists the account owns or collaborates on return their items;
   * every other one answers 403, however public it is.
   */
  canReadContents: boolean
}

/** A track long enough to build a snippet from. */
export type PlayableTrack = {
  id: string
  uri: string
  name: string
  artists: string
  durationMs: number
  albumName: string
  albumImageUrl: string | null
}

/**
 * Why an entry on a playlist cannot be played. Counting these separately turns
 * "skipped 74 entries" into something the host can act on — 74 removed tracks
 * and 74 podcasts mean very different things.
 */
export const SkipReason = {
  /** Spotify returned no track at all: taken down, or removed from the catalogue. */
  Removed: 'removed',
  /** Exists, but not available to this account's market. */
  Unavailable: 'unavailable',
  /** A file from the owner's own computer, which no web player can stream. */
  Local: 'local',
  /** A podcast episode or other non-music item. */
  NotATrack: 'not-a-track',
  /** Too short to hide the intro, the outro and a ten-second snippet between. */
  TooShort: 'too-short',
  /** Listed twice on the same playlist. */
  Duplicate: 'duplicate',
} as const

export type SkipReason = (typeof SkipReason)[keyof typeof SkipReason]

export type SkipCounts = Record<SkipReason, number>

export function emptySkipCounts(): SkipCounts {
  return {
    [SkipReason.Removed]: 0,
    [SkipReason.Unavailable]: 0,
    [SkipReason.Local]: 0,
    [SkipReason.NotATrack]: 0,
    [SkipReason.TooShort]: 0,
    [SkipReason.Duplicate]: 0,
  }
}

export function totalSkipped(counts: SkipCounts): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0)
}

export type PlaylistTracks = {
  tracks: readonly PlayableTrack[]
  /** Entries that could not be used, by reason. */
  skipped: SkipCounts
}

/** Errors the UI has to tell apart. */
export const SpotifyErrorKind = {
  Unauthorized: 'unauthorized',
  /** Understood but refused — in practice a restriction on the application. */
  Forbidden: 'forbidden',
  NotFound: 'not-found',
  RateLimited: 'rate-limited',
  Request: 'request',
} as const

export type SpotifyErrorKind = (typeof SpotifyErrorKind)[keyof typeof SpotifyErrorKind]

export class SpotifyError extends Error {
  readonly kind: SpotifyErrorKind
  readonly status: number

  constructor(kind: SpotifyErrorKind, status: number, message: string) {
    super(message)
    this.name = 'SpotifyError'
    this.kind = kind
    this.status = status
  }
}
