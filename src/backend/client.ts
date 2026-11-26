// Talking to our own backend.
//
// Nothing like the Spotify transport next door: there is no shared rate limit
// to respect and no queue to wait in, because this is one Worker serving one
// household. What it does have is a session token on every call and a failure
// that says which of the two sides was at fault, since the answer decides
// whether the client gives up or keeps the work for later.

import type { ApiError } from "@jtm-s/shared";

import { API_URL } from "./config";

/** Why a call failed, and whether trying again could ever help. */
export const BackendFailure = {
  /** No address configured: there is nothing to talk to, and that is fine. */
  Absent: "absent",
  /** Nothing answered — offline, asleep, or down. Worth trying again later. */
  Unreachable: "unreachable",
  /** The session is gone or was never valid; signing in again is the only fix. */
  Unauthorized: "unauthorized",
  /** The backend refused on purpose. Trying again would be refused again. */
  Refused: "refused",
} as const;

export type BackendFailure = (typeof BackendFailure)[keyof typeof BackendFailure];

export class BackendError extends Error {
  readonly failure: BackendFailure;
  readonly status: number | null;

  constructor(failure: BackendFailure, message: string, status: number | null = null) {
    super(message);
    this.name = "BackendError";
    this.failure = failure;
    this.status = status;
  }

  /** Whether the same call could succeed later without anybody doing anything. */
  get worthRetrying(): boolean {
    return this.failure === BackendFailure.Unreachable;
  }
}

export type Call = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Sent as JSON. */
  body?: unknown;
  /** The session token, for everything but signing in. */
  token?: string | null;
  signal?: AbortSignal;
};

/**
 * One call, with the answer already parsed.
 *
 * Throws a `BackendError` for anything that is not a success, because every
 * caller here has to tell "keep this and try later" from "this will never
 * work" and a status code at the call site would get that wrong eventually.
 */
export async function call<T>(path: string, options: Call = {}): Promise<T> {
  if (API_URL === null) {
    throw new BackendError(BackendFailure.Absent, "no backend is configured");
  }

  const { method = "GET", body, token, signal } = options;
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      signal,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (failure) {
    // A network error, a CORS refusal, a Worker that is not there: all the
    // same thing from here, and all worth trying again later.
    throw new BackendError(
      BackendFailure.Unreachable,
      failure instanceof Error ? failure.message : "the backend could not be reached",
    );
  }

  if (response.status === 401) {
    throw new BackendError(BackendFailure.Unauthorized, "sign in again", 401);
  }

  if (!response.ok) {
    // Not every failure carries a reason, and some servers send no status line
    // worth reading either, so there is always the number itself to fall back
    // on: a blank message on screen says nothing at all.
    let reason = response.statusText || `HTTP ${response.status}`;

    try {
      reason = ((await response.json()) as ApiError).error || reason;
    } catch {
      // A failure with nothing useful in the body. The status says enough.
    }

    throw new BackendError(
      // The Worker's own faults are temporary in the way a refusal is not.
      response.status >= 500 ? BackendFailure.Unreachable : BackendFailure.Refused,
      reason,
      response.status,
    );
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}
