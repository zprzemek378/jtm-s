// Fixed facts about the Spotify integration: endpoints, scopes and the name the
// browser player registers itself under.

export const SPOTIFY_ACCOUNTS_URL = "https://accounts.spotify.com";
export const SPOTIFY_API_URL = "https://api.spotify.com/v1";
export const SPOTIFY_SDK_URL = "https://sdk.scdn.co/spotify-player.js";

/** The device name shown in the user's Spotify "connect" list. */
export const PLAYER_DEVICE_NAME = "JTM-S";

/**
 * The level the browser player starts at, and the level a playlist scan puts
 * back after muting itself. One constant for both, so a scan can never leave
 * the volume somewhere the player never was.
 */
export const DEFAULT_PLAYER_VOLUME = 0.8;

/**
 * `streaming` lets the Web Playback SDK play audio, the two `playlist-read`
 * scopes list the account's playlists, and the `user-*-playback-state` pair is
 * needed to start a specific track on our own device.
 */
export const SPOTIFY_SCOPES: readonly string[] = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-modify-playback-state",
  "user-read-playback-state",
];

/**
 * How many items one playlist request returns.
 *
 * The February 2026 reference documents 50 as the maximum, and it is enforced:
 * `/me/playlists?limit=100` answers 400. `/playlists/{id}/items` happens to
 * tolerate 100, but relying on one endpoint's leniency is not worth the risk
 * of the page silently failing later.
 */
export const PLAYLIST_PAGE_SIZE = 50;

/** Refresh the access token this long before it actually expires. */
export const TOKEN_REFRESH_MARGIN_MS = 60_000;

/**
 * A rate-limited request is retried rather than failed: paging a large playlist
 * takes dozens of calls, and losing one of them would silently drop tracks from
 * the pool. The cap stops a long Spotify cooldown from hanging the screen —
 * past it the failure is reported instead.
 */
export const RATE_LIMIT_MAX_ATTEMPTS = 5;
export const RATE_LIMIT_MAX_TOTAL_WAIT_MS = 60_000;

/**
 * Scanning limits. Both are deliberately cautious: the rate limit is counted
 * per application over a rolling 30 second window, and one careless run on this
 * project earned a 22-hour lockout. Two requests per jump at this spacing is
 * roughly 0.7 requests a second.
 */
export const SCAN_JUMP_DELAY_MS = 3000;

/** A jump collects about 21 tracks, so this caps a scan near 170. */
export const SCAN_MAX_JUMPS = 8;

/** How many tracks one queue read reports beyond the current one. */
export const QUEUE_LOOKAHEAD = 20;

/**
 * The smallest gap between two catalogue reads.
 *
 * Loading playlists is the only thing this app does in bulk: a selection of
 * several playlists, each paged fifty tracks at a time, is easily a hundred
 * requests. Fired as fast as the network allows, that is exactly the burst
 * Spotify's rolling 30-second limit punishes — and a development-mode app can
 * be shut out for hours over it. Playback is deliberately not paced this way:
 * those calls are few and a round must not wait behind a playlist load.
 */
/**
 * The smallest gap between two requests to Spotify, of any kind.
 *
 * Spotify counts calls per application over a rolling thirty seconds, so this
 * is the one number that decides how hard the whole app can push. Twelve and a
 * half requests a second sits well inside every figure the developer community
 * reports as safe.
 */
export const REQUEST_GAP_MS = 80;

/**
 * How long a waiting request takes to gain a point of priority.
 *
 * Without this, a long run of playback commands — the playlist scan issues
 * hundreds — would hold back a catalogue read for as long as it lasted. Waiting
 * raises a request's standing until it outranks the traffic ahead of it, so
 * nothing is starved however busy the queue gets.
 */
export const PRIORITY_AGING_MS = 500;

export const SEEK_COMMIT_DELAY_MS = 200;

/** How far one arrow key moves the scrubber. */
export const SEEK_STEP_MS = 10_000;
