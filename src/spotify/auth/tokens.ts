// The Authorization Code flow with PKCE.
//
// PKCE is the flow Spotify prescribes for clients that cannot keep a secret,
// which is exactly a static single-page app: there is no client secret here,
// and the Client ID is public by design. What protects the flow is the one-time
// code verifier below plus the redirect URI allowlist in the Spotify Dashboard.

import { SPOTIFY_ACCOUNTS_URL, SPOTIFY_SCOPES, TOKEN_REFRESH_MARGIN_MS } from '@/constants/spotify'

import { Priority, schedule } from '../transport/queue'
import {
  SESSION_KEYS,
  STORAGE_KEYS,
  readSessionString,
  readStoredJson,
  removeSessionString,
  removeStored,
  writeSessionString,
  writeStoredJson,
} from '@/storage/localStorage'

import { redirectUri } from './clientId'

export type StoredTokens = {
  accessToken: string
  refreshToken: string | null
  /** Epoch milliseconds. */
  expiresAt: number
}

export const AuthErrorKind = {
  /** Spotify sent back `error=…`, e.g. the user clicked "Cancel". */
  Denied: 'denied',
  /** The `state` parameter did not match the one we sent. */
  StateMismatch: 'state-mismatch',
  /** The browser lost the code verifier, so the exchange cannot be completed. */
  VerifierMissing: 'verifier-missing',
  /** The token endpoint refused the exchange or the refresh. */
  TokenExchange: 'token-exchange',
} as const

export type AuthErrorKind = (typeof AuthErrorKind)[keyof typeof AuthErrorKind]

export class AuthError extends Error {
  readonly kind: AuthErrorKind

  constructor(kind: AuthErrorKind, message: string) {
    super(message)
    this.name = 'AuthError'
    this.kind = kind
  }
}

function randomString(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))

  return base64UrlEncode(digest)
}

export function readTokens(): StoredTokens | null {
  const stored = readStoredJson<StoredTokens>(STORAGE_KEYS.spotifyTokens)

  if (!stored || typeof stored.accessToken !== 'string' || typeof stored.expiresAt !== 'number') {
    return null
  }

  return stored
}

export function writeTokens(tokens: StoredTokens): void {
  writeStoredJson(STORAGE_KEYS.spotifyTokens, tokens)
}

export function clearTokens(): void {
  removeStored(STORAGE_KEYS.spotifyTokens)
}

export function isExpired(tokens: StoredTokens, now: number = Date.now()): boolean {
  return tokens.expiresAt - TOKEN_REFRESH_MARGIN_MS <= now
}

/** True when the URL we came back to carries a Spotify authorization response. */
export function hasAuthResponse(search: string = window.location.search): boolean {
  const params = new URLSearchParams(search)

  return params.has('code') || params.has('error')
}

/**
 * Sends the browser to Spotify's consent screen. `returnPath` is remembered so
 * the app can come back to the page the host started from — the redirect always
 * lands on the deployment root.
 */
export async function beginLogin(clientId: string, returnPath: string): Promise<void> {
  const verifier = randomString(64)
  const state = randomString(16)

  writeSessionString(SESSION_KEYS.codeVerifier, `${state}:${verifier}`)
  writeSessionString(SESSION_KEYS.authReturnPath, returnPath)

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await codeChallenge(verifier),
    state,
    scope: SPOTIFY_SCOPES.join(' '),
  })

  window.location.assign(`${SPOTIFY_ACCOUNTS_URL}/authorize?${params.toString()}`)
}

type TokenResponse = {
  access_token: string
  expires_in: number
  refresh_token?: string
}

/** Both the code exchange and the refresh post a form to the same endpoint. */
async function requestTokens(body: URLSearchParams): Promise<StoredTokens> {
  const response = await schedule(
    () =>
    fetch(`${SPOTIFY_ACCOUNTS_URL}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      }),
    // Nothing plays until this returns, so it goes ahead of catalogue reads.
    { priority: Priority.Urgent },
  )

  if (!response.ok) {
    throw new AuthError(
      AuthErrorKind.TokenExchange,
      `Token endpoint responded with ${response.status}`,
    )
  }

  const payload = (await response.json()) as TokenResponse

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt: Date.now() + payload.expires_in * 1000,
  }
}

export type CompletedLogin = {
  tokens: StoredTokens
  /** Where the host was heading before logging in. */
  returnPath: string
}

/**
 * Finishes the flow after the redirect: validates the response, swaps the code
 * for tokens and stores them. The caller is responsible for cleaning the query
 * string out of the URL.
 */
export async function completeLogin(
  clientId: string,
  search: string = window.location.search,
): Promise<CompletedLogin> {
  const params = new URLSearchParams(search)
  const error = params.get('error')
  const stored = readSessionString(SESSION_KEYS.codeVerifier)
  const returnPath = readSessionString(SESSION_KEYS.authReturnPath) ?? '/'

  removeSessionString(SESSION_KEYS.codeVerifier)
  removeSessionString(SESSION_KEYS.authReturnPath)

  if (error) {
    throw new AuthError(AuthErrorKind.Denied, error)
  }

  const code = params.get('code')

  if (!code) {
    throw new AuthError(AuthErrorKind.TokenExchange, 'The response carries no authorization code')
  }

  if (!stored) {
    throw new AuthError(AuthErrorKind.VerifierMissing, 'No code verifier was kept for this login')
  }

  const separator = stored.indexOf(':')
  const expectedState = stored.slice(0, separator)
  const verifier = stored.slice(separator + 1)

  if (params.get('state') !== expectedState) {
    throw new AuthError(AuthErrorKind.StateMismatch, 'The state parameter does not match')
  }

  const tokens = await requestTokens(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      client_id: clientId,
      code_verifier: verifier,
    }),
  )

  writeTokens(tokens)

  return { tokens, returnPath }
}

/** Exchanges a refresh token for a fresh access token, rotating it if Spotify does. */
export async function refreshTokens(
  clientId: string,
  refreshToken: string,
): Promise<StoredTokens> {
  const refreshed = await requestTokens(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  )

  // Spotify may or may not issue a new refresh token; keep the old one if not.
  const tokens: StoredTokens = {
    ...refreshed,
    refreshToken: refreshed.refreshToken ?? refreshToken,
  }

  writeTokens(tokens)

  return tokens
}
