// Finding a track's lyrics on LRCLIB.
//
// Three attempts, each cheaper for them than the one after it: the exact track
// as Spotify names it, then the title with its release clutter removed, then a
// free-text search. `/api/get` is indexed and answers instantly; `/api/search`
// is the expensive one and frequently replies 503 "ServerOverloaded", so it is
// kept for last.

import {
  LRCLIB_API_URL,
  LRCLIB_CLIENT_HEADER,
  LYRICS_DURATION_TOLERANCE_MS,
  LYRICS_MAX_ATTEMPTS,
  LYRICS_RETRY_DELAY_MS,
} from "@/constants/lyrics";
import type { PlayableTrack } from "@/spotify/types";

import { parseLrc } from "./lrc";
import { LyricsKind, type Lyrics } from "./types";

/** What their endpoints return, narrowed to the fields this app reads. */
type ApiLyrics = {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean;
  duration?: number | null;
};

/**
 * Release clutter Spotify puts in a title and LRCLIB does not: everything from
 * a dash onwards when it reads like a release note, and a trailing bracket of
 * the same kind.
 */
const RELEASE_NOTE =
  /(remaster(ed)?|radio edit|single version|album version|version|edit|mix|mono|stereo|live|bonus track|deluxe|feat\.?|with)/i;
const TRAILING_DASH_NOTE = /\s+-\s+[^-]*$/;
const TRAILING_BRACKET = /\s*[([][^)\]]*[)\]]\s*$/;

/** LRCLIB asks every client to identify itself; the header is on their allow-list. */
function clientHeader(): string {
  return `jtm-s v${__APP_VERSION__}`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

/**
 * One call to LRCLIB. Null means they answered, with "no such track".
 *
 * @throws when the service is unreachable or refuses to answer, which has to be
 * told apart from a miss: a miss is final, a failure is worth nothing being
 * remembered about.
 */
async function getJson(
  path: string,
  params: Record<string, string>,
  signal: AbortSignal,
): Promise<unknown> {
  const url = `${LRCLIB_API_URL}${path}?${new URLSearchParams(params).toString()}`;

  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(url, {
      signal,
      headers: { [LRCLIB_CLIENT_HEADER]: clientHeader() },
    });

    if (response.ok) {
      return await response.json();
    }

    if (response.status === 404) {
      return null;
    }

    if (attempt >= LYRICS_MAX_ATTEMPTS) {
      throw new Error(`LRCLIB answered ${response.status}`);
    }

    await delay(LYRICS_RETRY_DELAY_MS);
  }
}

/** Synced if the file has timings, plain if it only has words, null if neither. */
function toLyrics(entry: ApiLyrics): Lyrics | null {
  if (entry.instrumental) {
    return null;
  }

  const synced = entry.syncedLyrics?.trim();

  if (synced) {
    const lines = parseLrc(synced);

    if (lines.length > 0) {
      return { kind: LyricsKind.Synced, lines };
    }
  }

  const plain = entry.plainLyrics?.trim();

  return plain ? { kind: LyricsKind.Plain, text: plain } : null;
}

/** The first of several artists — what a lyrics database files a song under. */
function leadArtist(artists: string): string {
  return artists.split(",")[0].trim();
}

/** The title without the part of it that describes the release. */
function plainTitle(name: string): string {
  let title = name;

  if (TRAILING_BRACKET.test(title) && RELEASE_NOTE.test(title.match(TRAILING_BRACKET)?.[0] ?? "")) {
    title = title.replace(TRAILING_BRACKET, "");
  }

  if (
    TRAILING_DASH_NOTE.test(title) &&
    RELEASE_NOTE.test(title.match(TRAILING_DASH_NOTE)?.[0] ?? "")
  ) {
    title = title.replace(TRAILING_DASH_NOTE, "");
  }

  return title.trim();
}

/** Of everything a search turned up, the recording closest to this one. */
function bestMatch(candidates: readonly ApiLyrics[], durationMs: number): Lyrics | null {
  const near = candidates
    .filter(
      (candidate) =>
        candidate.duration == null ||
        Math.abs(candidate.duration * 1000 - durationMs) <= LYRICS_DURATION_TOLERANCE_MS,
    )
    .sort((left, right) => {
      const gap = (candidate: ApiLyrics) =>
        candidate.duration == null
          ? LYRICS_DURATION_TOLERANCE_MS
          : Math.abs(candidate.duration * 1000 - durationMs);

      return gap(left) - gap(right);
    });

  // A timed file is worth more than a closer length: the whole point is to
  // follow the song, and a few seconds either way is the same recording.
  for (const candidate of near) {
    const lyrics = toLyrics(candidate);

    if (lyrics?.kind === LyricsKind.Synced) {
      return lyrics;
    }
  }

  for (const candidate of near) {
    const lyrics = toLyrics(candidate);

    if (lyrics) {
      return lyrics;
    }
  }

  return null;
}

/**
 * The lyrics for a track, or null when the database has none for it.
 *
 * @throws when LRCLIB could not be reached or would not answer.
 */
export async function fetchLyrics(
  track: PlayableTrack,
  signal: AbortSignal,
): Promise<Lyrics | null> {
  const artist = leadArtist(track.artists);
  const duration = String(Math.round(track.durationMs / 1000));

  const exact = (await getJson(
    "/get",
    {
      track_name: track.name,
      artist_name: artist,
      album_name: track.albumName,
      duration,
    },
    signal,
  )) as ApiLyrics | null;

  if (exact) {
    return toLyrics(exact);
  }

  const title = plainTitle(track.name);

  if (title !== track.name) {
    const cleaned = (await getJson(
      "/get",
      { track_name: title, artist_name: artist, duration },
      signal,
    )) as ApiLyrics | null;

    if (cleaned) {
      return toLyrics(cleaned);
    }
  }

  const found = (await getJson("/search", { q: `${artist} ${title}` }, signal)) as
    ApiLyrics[] | null;

  return Array.isArray(found) ? bestMatch(found, track.durationMs) : null;
}
