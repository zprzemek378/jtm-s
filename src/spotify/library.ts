// What the application writes to an account: saved items and playlist entries.
//
// Reading lives in `catalogue.ts`; this is the other direction, and the only
// place the game changes anything that outlives the evening. Every call travels
// the same queue as everything else — see `transport/request.ts`.
//
// These are the February 2026 endpoints throughout. That release replaced the
// per-type routes — `/me/tracks`, `/me/albums`, `/me/following` — with one
// library that takes Spotify URIs, and renamed a playlist's `/tracks` to
// `/items`; the paths they replaced answer 403, which is exactly what this
// module's first draft earned.

import { PLAYLIST_LOOKUP_MAX_PAGES, PLAYLIST_PAGE_SIZE } from "@/constants/spotify";

import { Priority } from "./transport/queue";
import { request, type AccessTokenProvider } from "./transport/request";

/** The URIs are sent as one comma-separated parameter, colons and all. */
function urisParam(uris: readonly string[]): string {
  return new URLSearchParams({ uris: uris.join(",") }).toString();
}

/**
 * Whether these tracks are already in the account's library.
 *
 * One request per revealed track, which is the price of the heart being filled
 * in correctly rather than guessing.
 */
export async function fetchSavedState(
  getAccessToken: AccessTokenProvider,
  trackUris: readonly string[],
): Promise<readonly boolean[]> {
  if (trackUris.length === 0) {
    return [];
  }

  const payload = (await request(
    getAccessToken,
    `/me/library/contains?${urisParam(trackUris)}`,
    undefined,
    { priority: Priority.Catalogue },
  )) as unknown[];

  return trackUris.map((_, index) => payload[index] === true);
}

/**
 * Adds a track to the account's library, or takes it back out.
 *
 * Both directions carry the URIs in the query and send no body at all — the
 * migration guide's example passes them as an object, which is its SDK
 * building that query rather than a shape the endpoint accepts. Sending it as
 * a body earns a 400.
 *
 * Playback priority rather than catalogue: somebody clicked, and a click that
 * waits behind a playlist load reads as a button that does not work.
 */
export async function setTrackSaved(
  getAccessToken: AccessTokenProvider,
  trackUri: string,
  saved: boolean,
): Promise<void> {
  await request(
    getAccessToken,
    `/me/library?${urisParam([trackUri])}`,
    { method: saved ? "PUT" : "DELETE" },
    { priority: Priority.Playback },
  );
}

/** Adds a track to the end of one of the account's own playlists. */
export async function addTrackToPlaylist(
  getAccessToken: AccessTokenProvider,
  playlistId: string,
  trackUri: string,
): Promise<void> {
  await request(
    getAccessToken,
    `/playlists/${playlistId}/items`,
    { method: "POST", body: JSON.stringify({ uris: [trackUri] }) },
    { priority: Priority.Playback },
  );
}

/**
 * Whether a playlist already holds this track.
 *
 * Null when it could not be settled — a playlist longer than the page cap, or
 * a read that failed. The caller adds the track anyway in that case: a
 * duplicate is a smaller sin than refusing to add a song because we could not
 * finish looking.
 *
 * Read priority rather than playback: it is a handful of requests, and the
 * queue's ageing keeps it from being held behind anything for long.
 */
export async function playlistHoldsTrack(
  getAccessToken: AccessTokenProvider,
  playlistId: string,
  trackUri: string,
): Promise<boolean | null> {
  for (let page = 0; page < PLAYLIST_LOOKUP_MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      limit: String(PLAYLIST_PAGE_SIZE),
      offset: String(page * PLAYLIST_PAGE_SIZE),
      // Only the one field that answers the question.
      fields: "items(item(uri)),next",
    });

    const payload = (await request(
      getAccessToken,
      `/playlists/${playlistId}/items?${params.toString()}`,
      undefined,
      { priority: Priority.Catalogue },
    )) as { items?: ({ item?: { uri?: string } | null } | null)[]; next?: string | null };

    if ((payload.items ?? []).some((entry) => entry?.item?.uri === trackUri)) {
      return true;
    }

    if (!payload.next) {
      return false;
    }
  }

  return null;
}
