// Where the backend is, if there is one.
//
// Everything here is optional by design: with no address configured the app is
// exactly what it was before any of this existed — one computer, one evening,
// no account but Spotify. That is also the fallback when the backend is broken,
// which is why no screen may ever wait on it.

/** The Worker's address, without a trailing slash, or null when there is none. */
export const API_URL: string | null = import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || null;

export const hasBackend = API_URL !== null;
