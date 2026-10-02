// Reading a playlist id out of whatever the host pasted: a share link, a URI,
// or the bare id.

/** A Spotify id is 22 characters of base62. */
const ID_PATTERN = /^[A-Za-z0-9]{22}$/

/**
 * Accepts `https://open.spotify.com/playlist/<id>?si=…`, the localised form
 * `https://open.spotify.com/intl-pl/playlist/<id>`, `spotify:playlist:<id>`
 * and a bare id. Returns null when nothing playlist-shaped is in the text.
 */
export function parsePlaylistId(input: string): string | null {
  const text = input.trim()

  if (text.length === 0) {
    return null
  }

  if (ID_PATTERN.test(text)) {
    return text
  }

  const uriMatch = /^spotify:playlist:([A-Za-z0-9]{22})$/.exec(text)

  if (uriMatch) {
    return uriMatch[1] ?? null
  }

  const urlMatch = /playlist\/([A-Za-z0-9]{22})/.exec(text)

  if (urlMatch) {
    return urlMatch[1] ?? null
  }

  return null
}
