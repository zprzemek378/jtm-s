// How a request reaches Spotify at all: the one fetch in the application, the
// queue it waits in, and what to do with a failure.
//
// Deliberately the only module that knows about HTTP. Everything above it works
// in endpoints and domain types and never sees a Response, which is also what
// makes the rate limit impossible to slip past: there is no other way out.

import { RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_MAX_TOTAL_WAIT_MS, SPOTIFY_API_URL } from '@/constants/spotify'

import { schedule, type RequestPolicy } from './queue'
import { SpotifyError, SpotifyErrorKind } from '../types'

/** Supplies a valid token, refreshing it first when it has expired. */
export type AccessTokenProvider = () => Promise<string>

function errorKindFor(status: number): SpotifyErrorKind {
  if (status === 401) {
    return SpotifyErrorKind.Unauthorized
  }

  if (status === 403) {
    return SpotifyErrorKind.Forbidden
  }

  if (status === 404) {
    return SpotifyErrorKind.NotFound
  }

  if (status === 429) {
    return SpotifyErrorKind.RateLimited
  }

  return SpotifyErrorKind.Request
}

/** Spotify puts the useful part of a failure in `error.message`. */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string } }

    return payload.error?.message ?? response.statusText
  } catch {
    return response.statusText
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/**
 * How long to wait before retrying a 429.
 *
 * Spotify sends `Retry-After` in seconds, but a cross-origin response only
 * exposes the header when it says so, so an exponential backoff stands in when
 * the value cannot be read.
 */
function retryDelayMs(response: Response, attempt: number): number {
  const header = Number(response.headers.get('Retry-After'))

  if (Number.isFinite(header) && header > 0) {
    // A second of margin: retrying on the exact boundary tends to fail again.
    return header * 1000 + 1000
  }

  return Math.min(8000, 500 * 2 ** attempt)
}

export async function request(
  getAccessToken: AccessTokenProvider,
  path: string,
  init?: RequestInit,
  policy: RequestPolicy = {},
): Promise<unknown> {
  const { retryRateLimit = true } = policy
  let waitedMs = 0

  for (let attempt = 0; ; attempt += 1) {
    // Every attempt goes through the queue, including each retry — so no call
    // site, present or future, can reach Spotify without waiting its turn.
    const response = await schedule(
      () => attemptRequest(getAccessToken, path, init),
      policy,
    )

    if (!retryRateLimit || response.status !== 429 || attempt + 1 >= RATE_LIMIT_MAX_ATTEMPTS) {
      return finishRequest(response, path, init)
    }

    const delay = retryDelayMs(response, attempt)

    if (waitedMs + delay > RATE_LIMIT_MAX_TOTAL_WAIT_MS) {
      return finishRequest(response, path, init)
    }

    waitedMs += delay
    await sleep(delay)
  }
}

async function attemptRequest(
  getAccessToken: AccessTokenProvider,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await getAccessToken()
  // `Content-Type` only belongs on a request that carries a body. Sending it on
  // a GET turns it into a non-simple cross-origin request, which costs a
  // pointless CORS preflight before every single read.
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }

  if (init?.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  return fetch(`${SPOTIFY_API_URL}${path}`, {
    ...init,
    headers: { ...init?.headers, ...headers },
  })
}

async function finishRequest(
  response: Response,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  if (!response.ok) {
    throw new SpotifyError(
      errorKindFor(response.status),
      response.status,
      `${init?.method ?? 'GET'} ${path} — ${await readErrorMessage(response)}`,
    )
  }

  // Playback endpoints answer 204 with an empty body.
  if (response.status === 204) {
    return null
  }

  const text = await response.text()

  return text.length > 0 ? (JSON.parse(text) as unknown) : null
}
