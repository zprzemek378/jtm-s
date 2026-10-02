// The shapes Spotify answers with, and how they become the game's own types.
//
// Kept apart from the endpoints so that a change to Spotify's payloads is read
// and edited in one place, and the endpoint functions stay a list of what the
// application asks for rather than a list of fields.

import { MIN_TRACK_DURATION_MS } from "@/constants/gameRules";
import { formatArtists } from "@/helpers/format";

import { SkipReason, type PlayableTrack, type PlaylistSummary } from "../types";

export type ApiImage = { url?: string };
export type ApiUserResponse = {
  id: string;
  display_name?: string | null;
  product?: string | null;
  country?: string | null;
};

export type ApiPlaylist = {
  id: string;
  name: string;
  owner?: { id?: string; display_name?: string | null };
  collaborative?: boolean;
  /** The container was renamed from `tracks` in February 2026. */
  items?: { total?: number };
  tracks?: { total?: number };
  images?: ApiImage[] | null;
};

export function toPlaylistSummary(playlist: ApiPlaylist, currentUserId: string): PlaylistSummary {
  const isOwn = playlist.owner?.id === currentUserId;

  return {
    id: playlist.id,
    name: playlist.name,
    ownerName: playlist.owner?.display_name?.trim() || "—",
    // `tracks.total` is the pre-2026 spelling, kept as a fallback.
    trackCount: playlist.items?.total ?? playlist.tracks?.total ?? 0,
    imageUrl: playlist.images?.[0]?.url ?? null,
    // Measured, not assumed: unblocking someone else's playlist only produced
    // a 403 from Spotify, so the documented restriction is real.
    canReadContents: isOwn || playlist.collaborative === true,
  };
}

export type ApiTrack = {
  id?: string | null;
  uri?: string;
  name?: string;
  type?: string;
  duration_ms?: number;
  is_playable?: boolean;
  artists?: { name?: string }[];
  album?: { name?: string; images?: ApiImage[] | null };
};

export type ApiPlaylistItem = {
  is_local?: boolean;
  /** Renamed from `track` in February 2026; both spellings are accepted. */
  item?: ApiTrack | null;
  track?: ApiTrack | null;
};

/**
 * A track can be played when it is a real, playable Spotify track and long
 * enough for the snippet rules — the intro and outro are both excluded, and the
 * guessing window has to fit between them.
 *
 * Returns the reason instead of the track when it cannot be used, so the
 * playlist screen can explain what it left out.
 */
export function toPlayableTrack(entry: ApiPlaylistItem): PlayableTrack | SkipReason {
  const track = entry.item ?? entry.track;

  if (entry.is_local === true) {
    return SkipReason.Local;
  }

  // Spotify hands back an empty item for a track that no longer exists.
  if (!track || !track.id || !track.uri) {
    return SkipReason.Removed;
  }

  if (track.type !== "track") {
    return SkipReason.NotATrack;
  }

  if (track.is_playable === false) {
    return SkipReason.Unavailable;
  }

  if ((track.duration_ms ?? 0) < MIN_TRACK_DURATION_MS) {
    return SkipReason.TooShort;
  }

  return {
    id: track.id,
    uri: track.uri,
    name: track.name ?? "—",
    artists: formatArtists((track.artists ?? []).map((artist) => artist.name ?? "—")),
    durationMs: track.duration_ms ?? 0,
    albumName: track.album?.name ?? "",
    albumImageUrl: track.album?.images?.[0]?.url ?? null,
  };
}

export const TRACK_FIELDS =
  "items(is_local,item(id,uri,name,type,duration_ms,is_playable,artists(name),album(name,images))),next";

export type ApiTrackPage = {
  items?: (ApiPlaylistItem | null)[];
  next?: string | null;
};

/**
 * Maps a bare track object — the shape the queue returns — with the same rules
 * the playlist reader applies, so a scanned playlist is filtered identically.
 */
export function toPlayableFromTrack(track: unknown): PlayableTrack | SkipReason {
  return toPlayableTrack({ item: track as ApiTrack });
}
