// Fixed facts about the lyrics source.
//
// Spotify does not expose lyrics through its Web API at all, so they come from
// LRCLIB — an open, keyless database of community-submitted LRC files. It is a
// different host from Spotify, so none of this traffic counts against the
// Client ID's rate limit and none of it goes through the request queue.

export const LRCLIB_API_URL = "https://lrclib.net/api";

/**
 * Identifies this app to LRCLIB, which asks every client to say who it is.
 * The header is on their allow-list, so the preflight passes.
 */
export const LRCLIB_CLIENT_HEADER = "Lrclib-Client";

/**
 * Their endpoints answer 503 "ServerOverloaded" often enough to be worth
 * waiting out: the lookup starts when the round does, so there are seconds to
 * spare before anyone could see the words.
 */
export const LYRICS_RETRY_DELAY_MS = 700;
export const LYRICS_MAX_ATTEMPTS = 3;

/**
 * How far a candidate's length may sit from the Spotify track's before it is
 * taken to be a different recording. `/api/get` applies its own tolerance of
 * about two seconds; this one judges the results of a search by hand.
 */
export const LYRICS_DURATION_TOLERANCE_MS = 5000;

/** How many resolved tracks are remembered, so a replayed track is instant. */
export const LYRICS_CACHE_LIMIT = 200;
