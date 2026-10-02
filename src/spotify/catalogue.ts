// What the application reads from Spotify: profiles, playlists, tracks.
//
// One function per thing the game needs to know. How a request actually travels
// — the fetch, the queue it waits in, retrying a 429 — lives in
// `transport/request.ts`; the shapes Spotify answers with and their conversion
// live in `transport/responses.ts`. Playback commands are in `playback/`.

import { PLAYLIST_PAGE_SIZE } from '@/constants/spotify'

import { Priority } from './transport/queue'
import { request, type AccessTokenProvider } from './transport/request'
import {
  toPlayableTrack,
  toPlaylistSummary,
  TRACK_FIELDS,
  type ApiPlaylist,
  type ApiTrack,
  type ApiTrackPage,
  type ApiUserResponse,
} from './transport/responses'
import {
  emptySkipCounts,
  SkipReason,
  type PlayableTrack,
  type PlaylistSummary,
  type PlaylistTracks,
  type SpotifyUser,
} from './types'

export type { AccessTokenProvider }

/**
 * Maps a bare track object — the shape the queue returns — with the same rules
 * the playlist reader applies, so a scanned playlist is filtered identically.
 */
export function toPlayableFromTrack(track: unknown): PlayableTrack | SkipReason {
  return toPlayableTrack({ item: track as ApiTrack })
}

export async function fetchCurrentUser(getAccessToken: AccessTokenProvider): Promise<SpotifyUser> {
  const payload = (await request(getAccessToken, '/me', undefined, {
    priority: Priority.Catalogue,
  })) as ApiUserResponse

  return {
    id: payload.id,
    displayName: payload.display_name?.trim() || payload.id,
    product: payload.product ?? null,
    country: payload.country ?? null,
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
    const page = (await request(
      getAccessToken,
      `/me/playlists?limit=50&offset=${offset}`,
      undefined,
      { priority: Priority.Catalogue },
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
  const payload = (await request(
    getAccessToken,
    `/playlists/${playlistId}` +
      '?fields=id,name,collaborative,owner(id,display_name),items(total),images',
    undefined,
    { priority: Priority.Catalogue },
  )) as ApiPlaylist

  return toPlaylistSummary(payload, currentUserId)
}

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
  return (await request(
    getAccessToken,
    `/playlists/${playlistId}/items?${params.toString()}`,
    undefined,
    { priority: Priority.Catalogue },
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
