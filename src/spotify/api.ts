// A thin Web API client. Every call takes a `getAccessToken` function so token
// refreshing stays in one place (see SpotifyProvider) and never leaks here.

import { MIN_TRACK_DURATION_MS } from '@/constants/gameRules'
import {
  BULK_REQUEST_GAP_MS,
  PLAYLIST_PAGE_SIZE,
  RATE_LIMIT_MAX_ATTEMPTS,
  RATE_LIMIT_MAX_TOTAL_WAIT_MS,
  SPOTIFY_API_URL,
} from '@/constants/spotify'

import { formatArtists } from '@/helpers/format'

import {
  emptySkipCounts,
  SkipReason,
  SpotifyError,
  SpotifyErrorKind,
  type PlayableTrack,
  type PlaylistSummary,
  type PlaylistTracks,
  type SpotifyUser,
} from './types'

export type AccessTokenProvider = () => Promise<string>

function errorKindFor(status: number): SpotifyErrorKind {
  if (status === 401) {
    return SpotifyErrorKind.Unauthorized
  }

  if (status === 403) {
    return SpotifyErrorKind.Forbidden
  }

  if (status === 404) {
    return SpotifyErrorKind.NotFound
  }

  if (status === 429) {
    return SpotifyErrorKind.RateLimited
  }

  return SpotifyErrorKind.Request
}

/** Spotify puts the useful part of a failure in `error.message`. */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string } }

    return payload.error?.message ?? response.statusText
  } catch {
    return response.statusText
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/** One catalogue read at a time, application-wide. */
let bulkQueue: Promise<unknown> = Promise.resolve()
let lastBulkStartedAt = 0

/**
 * Runs a catalogue read in turn, never less than `BULK_REQUEST_GAP_MS` after
 * the previous one.
 *
 * It sits here rather than at the call sites on purpose: restoring a selection
 * of playlists fans out into dozens of paged requests from several places at
 * once, and no arrangement of callers should be able to burst past the rate
 * limit by accident.
 */
function scheduleBulk<T>(task: () => Promise<T>): Promise<T> {
  const run = bulkQueue.then(async () => {
    const sinceLast = Date.now() - lastBulkStartedAt

    if (sinceLast < BULK_REQUEST_GAP_MS) {
      await sleep(BULK_REQUEST_GAP_MS - sinceLast)
    }

    lastBulkStartedAt = Date.now()

    return task()
  })

  // The queue must survive a failed read, or one error would stall every
  // later one behind it.
  bulkQueue = run.then(
    () => undefined,
    () => undefined,
  )

  return run
}

/**
 * How long to wait before retrying a 429.
 *
 * Spotify sends `Retry-After` in seconds, but a cross-origin response only
 * exposes the header when it says so, so an exponential backoff stands in when
 * the value cannot be read.
 */
function retryDelayMs(response: Response, attempt: number): number {
  const header = Number(response.headers.get('Retry-After'))

  if (Number.isFinite(header) && header > 0) {
    // A second of margin: retrying on the exact boundary tends to fail again.
    return header * 1000 + 1000
  }

  return Math.min(8000, 500 * 2 ** attempt)
}

type RequestOptions = {
  /**
   * Whether a 429 should be waited out and retried. True everywhere except the
   * playlist scan: a rate limit there means the walk is already at the edge of
   * the quota, and pushing on — even after a pause — is what earns a lockout
   * measured in hours. There, failing fast is the safe answer.
   */
  retryRateLimit?: boolean
}

async function request(
  getAccessToken: AccessTokenProvider,
  path: string,
  init?: RequestInit,
  options: RequestOptions = {},
): Promise<unknown> {
  const { retryRateLimit = true } = options
  let waitedMs = 0

  for (let attempt = 0; ; attempt += 1) {
    const response = await attemptRequest(getAccessToken, path, init)

    if (!retryRateLimit || response.status !== 429 || attempt + 1 >= RATE_LIMIT_MAX_ATTEMPTS) {
      return finishRequest(response, path, init)
    }

    const delay = retryDelayMs(response, attempt)

    if (waitedMs + delay > RATE_LIMIT_MAX_TOTAL_WAIT_MS) {
      return finishRequest(response, path, init)
    }

    waitedMs += delay
    await sleep(delay)
  }
}

async function attemptRequest(
  getAccessToken: AccessTokenProvider,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await getAccessToken()
  // `Content-Type` only belongs on a request that carries a body. Sending it on
  // a GET turns it into a non-simple cross-origin request, which costs a
  // pointless CORS preflight before every single read.
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }

  if (init?.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  return fetch(`${SPOTIFY_API_URL}${path}`, {
    ...init,
    headers: { ...init?.headers, ...headers },
  })
}

async function finishRequest(
  response: Response,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  if (!response.ok) {
    throw new SpotifyError(
      errorKindFor(response.status),
      response.status,
      `${init?.method ?? 'GET'} ${path} — ${await readErrorMessage(response)}`,
    )
  }

  // Playback endpoints answer 204 with an empty body.
  if (response.status === 204) {
    return null
  }

  const text = await response.text()

  return text.length > 0 ? (JSON.parse(text) as unknown) : null
}

type ApiImage = { url?: string }
type ApiUserResponse = {
  id: string
  display_name?: string | null
  product?: string | null
  country?: string | null
}

export async function fetchCurrentUser(getAccessToken: AccessTokenProvider): Promise<SpotifyUser> {
  const payload = (await request(getAccessToken, '/me')) as ApiUserResponse

  return {
    id: payload.id,
    displayName: payload.display_name?.trim() || payload.id,
    product: payload.product ?? null,
    country: payload.country ?? null,
  }
}

type ApiPlaylist = {
  id: string
  name: string
  owner?: { id?: string; display_name?: string | null }
  collaborative?: boolean
  /** The container was renamed from `tracks` in February 2026. */
  items?: { total?: number }
  tracks?: { total?: number }
  images?: ApiImage[] | null
}

function toPlaylistSummary(playlist: ApiPlaylist, currentUserId: string): PlaylistSummary {
  const isOwn = playlist.owner?.id === currentUserId

  return {
    id: playlist.id,
    name: playlist.name,
    ownerName: playlist.owner?.display_name?.trim() || '—',
    // `tracks.total` is the pre-2026 spelling, kept as a fallback.
    trackCount: playlist.items?.total ?? playlist.tracks?.total ?? 0,
    imageUrl: playlist.images?.[0]?.url ?? null,
    // Measured, not assumed: unblocking someone else's playlist only produced
    // a 403 from Spotify, so the documented restriction is real.
    canReadContents: isOwn || playlist.collaborative === true,
  }
}

/** Every playlist the account owns or follows, following the API's paging. */
export async function fetchMyPlaylists(
  getAccessToken: AccessTokenProvider,
  currentUserId: string,
): Promise<readonly PlaylistSummary[]> {
  const summaries: PlaylistSummary[] = []
  // Paging over a collection that can change under us hands the same playlist
  // out twice; duplicate ids would then collide as React keys.
  const seenIds = new Set<string>()
  let offset = 0

  for (;;) {
    const page = (await scheduleBulk(() =>
      request(getAccessToken, `/me/playlists?limit=50&offset=${offset}`),
    )) as { items?: (ApiPlaylist | null)[]; next?: string | null }

    const items = page.items ?? []

    for (const item of items) {
      if (item && !seenIds.has(item.id)) {
        seenIds.add(item.id)
        summaries.push(toPlaylistSummary(item, currentUserId))
      }
    }

    if (!page.next || items.length === 0) {
      return summaries
    }

    offset += items.length
  }
}

export async function fetchPlaylist(
  getAccessToken: AccessTokenProvider,
  playlistId: string,
  currentUserId: string,
): Promise<PlaylistSummary> {
  const payload = (await scheduleBulk(() =>
    request(
      getAccessToken,
      `/playlists/${playlistId}` +
        '?fields=id,name,collaborative,owner(id,display_name),items(total),images',
    ),
  )) as ApiPlaylist

  return toPlaylistSummary(payload, currentUserId)
}

type ApiTrack = {
  id?: string | null
  uri?: string
  name?: string
  type?: string
  duration_ms?: number
  is_playable?: boolean
  artists?: { name?: string }[]
  album?: { name?: string; images?: ApiImage[] | null }
}

type ApiPlaylistItem = {
  is_local?: boolean
  /** Renamed from `track` in February 2026; both spellings are accepted. */
  item?: ApiTrack | null
  track?: ApiTrack | null
}

/**
 * A track can be played when it is a real, playable Spotify track and long
 * enough for the snippet rules — the intro and outro are both excluded, and the
 * guessing window has to fit between them.
 *
 * Returns the reason instead of the track when it cannot be used, so the
 * playlist screen can explain what it left out.
 */
function toPlayableTrack(entry: ApiPlaylistItem): PlayableTrack | SkipReason {
  const track = entry.item ?? entry.track

  if (entry.is_local === true) {
    return SkipReason.Local
  }

  // Spotify hands back an empty item for a track that no longer exists.
  if (!track || !track.id || !track.uri) {
    return SkipReason.Removed
  }

  if (track.type !== 'track') {
    return SkipReason.NotATrack
  }

  if (track.is_playable === false) {
    return SkipReason.Unavailable
  }

  if ((track.duration_ms ?? 0) < MIN_TRACK_DURATION_MS) {
    return SkipReason.TooShort
  }

  return {
    id: track.id,
    uri: track.uri,
    name: track.name ?? '—',
    artists: formatArtists((track.artists ?? []).map((artist) => artist.name ?? '—')),
    durationMs: track.duration_ms ?? 0,
    albumName: track.album?.name ?? '',
    albumImageUrl: track.album?.images?.[0]?.url ?? null,
  }
}

const TRACK_FIELDS =
  'items(is_local,item(id,uri,name,type,duration_ms,is_playable,artists(name),album(name,images))),next'

type ApiTrackPage = { items?: (ApiPlaylistItem | null)[]; next?: string | null }

async function fetchTrackPage(
  getAccessToken: AccessTokenProvider,
  playlistId: string,
  offset: number,
  market: string | null,
): Promise<ApiTrackPage> {
  const params = new URLSearchParams({
    limit: String(PLAYLIST_PAGE_SIZE),
    offset: String(offset),
    // Trims the response to what the game needs; measured against the live API.
    fields: TRACK_FIELDS,
  })

  if (market) {
    params.set('market', market)
  }

  // `/tracks` was replaced by `/items` in February 2026 and now answers 403.
  return (await scheduleBulk(() =>
    request(getAccessToken, `/playlists/${playlistId}/items?${params.toString()}`),
  )) as ApiTrackPage
}

/**
 * Loads the whole playlist and keeps only what the game can use. `market` makes
 * Spotify resolve regional availability for the logged-in account.
 *
 * Paging advances by the number of items actually returned rather than by the
 * requested limit, so a page size Spotify decides to trim cannot make this skip
 * entries.
 */
export async function fetchPlaylistTracks(
  getAccessToken: AccessTokenProvider,
  playlistId: string,
  market: string | null,
): Promise<PlaylistTracks> {
  const tracks: PlayableTrack[] = []
  const seenIds = new Set<string>()
  const skipped = emptySkipCounts()
  let offset = 0

  for (;;) {
    const page = await fetchTrackPage(getAccessToken, playlistId, offset, market)
    const items = page.items ?? []

    for (const entry of items) {
      const playable = entry ? toPlayableTrack(entry) : SkipReason.Removed

      if (typeof playable === 'string') {
        skipped[playable] += 1
        continue
      }

      // A playlist may list the same track twice; it should not be drawn twice.
      if (seenIds.has(playable.id)) {
        skipped[SkipReason.Duplicate] += 1
        continue
      }

      seenIds.add(playable.id)
      tracks.push(playable)
    }

    if (!page.next || items.length === 0) {
      return { tracks, skipped }
    }

    offset += items.length
  }
}

/**
 * Maps a bare track object — the shape the queue returns — with the same rules
 * the playlist reader applies, so a scanned playlist is filtered identically.
 */
export function toPlayableFromTrack(track: unknown): PlayableTrack | SkipReason {
  return toPlayableTrack({ item: track as ApiTrack })
}

/** Starts a whole playlist on our device, at a given index inside it. */
export async function startContextPlayback(
  getAccessToken: AccessTokenProvider,
  deviceId: string,
  contextUri: string,
  position: number,
): Promise<void> {
  await request(
    getAccessToken,
    `/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
    { method: 'PUT', body: JSON.stringify({ context_uri: contextUri, offset: { position } }) },
    { retryRateLimit: false },
  )
}

export type QueueSnapshot = {
  /** The track playing right now, plus the ones lined up behind it. */
  entries: readonly unknown[]
}

/**
 * The current item and roughly the next twenty. This is the only route to the
 * contents of a playlist the API will not list.
 */
export async function fetchQueue(getAccessToken: AccessTokenProvider): Promise<QueueSnapshot> {
  const payload = (await request(getAccessToken, '/me/player/queue', undefined, {
    retryRateLimit: false,
  })) as {
    currently_playing?: unknown
    queue?: unknown[]
  }

  return { entries: [payload.currently_playing, ...(payload.queue ?? [])].filter(Boolean) }
}

export async function setShuffle(
  getAccessToken: AccessTokenProvider,
  deviceId: string,
  state: boolean,
): Promise<void> {
  await request(
    getAccessToken,
    `/me/player/shuffle?state=${state}&device_id=${encodeURIComponent(deviceId)}`,
    { method: 'PUT' },
    { retryRateLimit: false },
  )
}

export const RepeatState = {
  Off: 'off',
  Context: 'context',
  Track: 'track',
} as const

export type RepeatState = (typeof RepeatState)[keyof typeof RepeatState]

/**
 * `context` matters for scanning: at the end of a playlist it wraps back to the
 * start, instead of letting autoplay pad the queue with similar tracks that are
 * not on the playlist at all.
 */
export async function setRepeat(
  getAccessToken: AccessTokenProvider,
  deviceId: string,
  state: RepeatState,
): Promise<void> {
  await request(
    getAccessToken,
    `/me/player/repeat?state=${state}&device_id=${encodeURIComponent(deviceId)}`,
    { method: 'PUT' },
    { retryRateLimit: false },
  )
}

/** Starts one track on our own browser device, at the given millisecond. */
export async function startTrackPlayback(
  getAccessToken: AccessTokenProvider,
  deviceId: string,
  trackUri: string,
  positionMs: number,
): Promise<void> {
  await request(getAccessToken, `/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [trackUri], position_ms: positionMs }),
  })
}
