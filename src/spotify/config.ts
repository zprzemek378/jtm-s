// Where the Client ID comes from, and the redirect URI that has to match the
// Spotify Dashboard entry exactly.

import { STORAGE_KEYS, readStoredString, removeStored, writeStoredString } from '@/storage/localStorage'

/**
 * The shape every Client ID Spotify issues: 32 hexadecimal characters. Checking
 * it here catches copying the wrong field — the app name, the dashboard URL —
 * before the host is sent to Spotify only to be met with `INVALID_CLIENT`.
 */
const CLIENT_ID_PATTERN = /^[0-9a-f]{32}$/i

/**
 * How many Spotify applications a build can carry.
 *
 * Fixed rather than open-ended because Vite replaces `import.meta.env.VITE_*`
 * textually while building: a computed name such as
 * ``import.meta.env[`VITE_SPOTIFY_CLIENT_ID_${n}`]`` is left untouched and reads
 * as undefined at runtime. Every variable therefore has to be spelled out, and
 * five covers what anyone is likely to juggle.
 */
export const CLIENT_SLOT_COUNT = 5

/** One Spotify application built into this bundle. */
export type BundledClient = {
  /** 1-based, matching the suffix in the variable names. */
  slot: number
  id: string
  /** The label from the environment, or null when none was given. */
  name: string | null
}

// Spelled out one by one, for the reason given on CLIENT_SLOT_COUNT.
const RAW_SLOTS: readonly { id?: string; name?: string }[] = [
  {
    id: import.meta.env.VITE_SPOTIFY_CLIENT_ID_1,
    name: import.meta.env.VITE_SPOTIFY_CLIENT_NAME_1,
  },
  {
    id: import.meta.env.VITE_SPOTIFY_CLIENT_ID_2,
    name: import.meta.env.VITE_SPOTIFY_CLIENT_NAME_2,
  },
  {
    id: import.meta.env.VITE_SPOTIFY_CLIENT_ID_3,
    name: import.meta.env.VITE_SPOTIFY_CLIENT_NAME_3,
  },
  {
    id: import.meta.env.VITE_SPOTIFY_CLIENT_ID_4,
    name: import.meta.env.VITE_SPOTIFY_CLIENT_NAME_4,
  },
  {
    id: import.meta.env.VITE_SPOTIFY_CLIENT_ID_5,
    name: import.meta.env.VITE_SPOTIFY_CLIENT_NAME_5,
  },
]

/**
 * Works out the usable applications: the slots in order, skipping gaps,
 * malformed entries and repeats.
 *
 * Kept pure and separate from the environment so it can be tested — the values
 * themselves are substituted while building and cannot be varied at runtime.
 */
export function buildBundledClients(
  slots: readonly { id?: string; name?: string }[],
): readonly BundledClient[] {
  const clients: BundledClient[] = []
  const seen = new Set<string>()

  const add = (slot: number, rawId: string | undefined, rawName: string | undefined) => {
    const id = (rawId ?? '').trim()
    const key = id.toLowerCase()

    // An entry filled in wrongly is skipped rather than offered: choosing it
    // could only ever end in `INVALID_CLIENT` at Spotify. A repeat is dropped so
    // the same application cannot appear twice under two names.
    if (!isValidClientId(id) || seen.has(key)) {
      return
    }

    seen.add(key)
    const name = (rawName ?? '').trim()
    clients.push({ slot, id, name: name.length > 0 ? name : null })
  }

  slots.forEach((raw, index) => {
    add(index + 1, raw.id, raw.name)
  })

  return clients
}

/** The applications this build carries. */
export const BUNDLED_CLIENTS: readonly BundledClient[] = buildBundledClients(RAW_SLOTS)

export function isValidClientId(value: string): boolean {
  return CLIENT_ID_PATTERN.test(value.trim())
}

export function readClientIdOverride(): string | null {
  const stored = readStoredString(STORAGE_KEYS.clientIdOverride)?.trim()

  return stored && stored.length > 0 ? stored : null
}

export function writeClientIdOverride(value: string): void {
  writeStoredString(STORAGE_KEYS.clientIdOverride, value.trim())
}

export function clearClientIdOverride(): void {
  removeStored(STORAGE_KEYS.clientIdOverride)
}

/** Which built-in application was chosen, by its id. */
export function readClientIdChoice(): string | null {
  const stored = readStoredString(STORAGE_KEYS.clientIdChoice)?.trim()

  return stored && stored.length > 0 ? stored : null
}

/**
 * Remembers the chosen application by its id rather than by its slot, so
 * reordering the variables in `.env` cannot silently switch which one is in use.
 */
export function writeClientIdChoice(id: string): void {
  writeStoredString(STORAGE_KEYS.clientIdChoice, id.trim())
}

/**
 * The chosen application while it is still part of the build, otherwise the
 * first — so a slot being emptied falls back rather than leaving the game
 * unconfigured and the host staring at a login button that cannot work.
 */
export function pickBundled(
  clients: readonly BundledClient[],
  chosenId: string | null,
): BundledClient | null {
  const chosen = chosenId?.trim().toLowerCase()
  const match = chosen
    ? clients.find((client) => client.id.toLowerCase() === chosen)
    : undefined

  return match ?? clients[0] ?? null
}

/** The built-in application in use. */
export function selectedBundledClient(): BundledClient | null {
  return pickBundled(BUNDLED_CLIENTS, readClientIdChoice())
}

/**
 * A Client ID entered by hand wins over the built-in ones, so a group that is
 * not on an allowlist can point the game at their own Spotify application
 * without a rebuild. An app in development mode allows 5 accounts, which is
 * precisely why several built-in applications are worth having.
 */
export function resolveClientId(): string | null {
  const override = readClientIdOverride()

  if (override && isValidClientId(override)) {
    return override
  }

  return selectedBundledClient()?.id ?? null
}

/**
 * Spotify compares the redirect URI byte for byte, so it is derived from the
 * deployment base rather than written by hand. On GitHub Pages that is
 * `https://<user>.github.io/<repo>/`; locally `http://127.0.0.1:5173/`.
 */
export function redirectUri(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
}

/**
 * Whether Spotify will even look at a redirect URI from this address.
 *
 * Since April 2025 it accepts HTTPS anywhere, and plain HTTP only on a literal
 * loopback address — `localhost` is rejected by name. The dev server binds to
 * 127.0.0.1, but `localhost` resolves there too, so the app loads perfectly and
 * then fails at the one step that compares the address: logging in.
 */
export function isRedirectHostAcceptable(location: Location = window.location): boolean {
  return (
    location.protocol === 'https:' ||
    (location.protocol === 'http:' && isLoopbackHost(location.hostname))
  )
}

/** This very page, at an address Spotify will accept. */
export function loopbackAddress(location: Location = window.location): string {
  const url = new URL(location.href)
  url.hostname = '127.0.0.1'

  return url.toString()
}
