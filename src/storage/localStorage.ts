// Every localStorage key the app uses, plus accessors that never throw.
// Browsers deny storage in private mode and when site data is blocked, so each
// call has to degrade to "no stored value" instead of breaking the render.

export const STORAGE_KEYS = {
  language: "jtm-s.language",
  // Also read by the inline bootstrap script in index.html, which cannot import
  // this module — keep the two in sync.
  theme: "jtm-s.theme",
  sidebarCollapsed: "jtm-s.sidebar-collapsed",
  /** Players, their keys and the target score — reused between games. */
  gameSetup: "jtm-s.game-setup",
  /** The playlists picked for the previous game. */
  playlists: "jtm-s.playlists",
  /** Tracks already played, so a series of games does not repeat itself. */
  playedTracks: "jtm-s.played-tracks",
  /** Whether the game's own sound effects play. */
  soundEnabled: "jtm-s.sound-enabled",
  /** Whether presses close together are judged a tie, and how close that is. */
  tiesEnabled: "jtm-s.ties-enabled",
  tieThreshold: "jtm-s.tie-threshold",
  /** Whether the experimental, rate-limit-hungry features stay switched off. */
  safeMode: "jtm-s.safe-mode",
  /** Scanned contents of playlists whose tracks the API will not list. */
  scanCache: "jtm-s.scan-cache",
  /** A Client ID entered by hand, overriding the one built into the bundle. */
  clientIdOverride: "jtm-s.client-id",
  /** Which of the built-in Spotify applications the host picked. */
  clientIdChoice: "jtm-s.client-id-choice",
  spotifyTokens: "jtm-s.spotify-tokens",
} as const;

/** Keys that only live for as long as the tab — the PKCE handshake state. */
export const SESSION_KEYS = {
  codeVerifier: "jtm-s.pkce-verifier",
  /** Where to return after the Spotify redirect. */
  authReturnPath: "jtm-s.auth-return-path",
} as const;

export function readStoredString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStoredString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Persisting a preference is always optional.
  }
}

export function removeStored(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to do — the value was never readable either.
  }
}

/** Returns null when nothing is stored or the stored text is not valid JSON. */
export function readStoredJson<T>(key: string): T | null {
  const raw = readStoredString(key);

  if (raw === null) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeStoredJson(key: string, value: unknown): void {
  writeStoredString(key, JSON.stringify(value));
}

export function readSessionString(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSessionString(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // The PKCE flow checks for a missing verifier and reports it as an error.
  }
}

export function removeSessionString(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Nothing to do.
  }
}
