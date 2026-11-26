// The session this machine holds with our backend.
//
// Kept in `localStorage` beside the Spotify tokens and read back on the next
// visit, so signing in happens once rather than every time the app is opened.
// It is a signed statement of who somebody is, not a secret of theirs: losing
// it costs a sign-in and nothing else.

import type { Account } from "@jtm-s/shared";
import {
  STORAGE_KEYS,
  readStoredJson,
  removeStored,
  writeStoredJson,
} from "@/storage/localStorage";

export type BackendSession = {
  token: string;
  expiresAt: number;
  account: Account;
};

/** The stored session, or null when there is none or it has run out. */
export function readSession(now: number = Date.now()): BackendSession | null {
  const stored = readStoredJson<BackendSession>(STORAGE_KEYS.backendSession);

  if (
    !stored ||
    typeof stored.token !== "string" ||
    typeof stored.expiresAt !== "number" ||
    typeof stored.account?.id !== "string"
  ) {
    return null;
  }

  // A token the backend would refuse is the same as no token, and noticing
  // here saves a round trip to be told so.
  return stored.expiresAt > now ? stored : null;
}

export function writeSession(session: BackendSession): void {
  writeStoredJson(STORAGE_KEYS.backendSession, session);
}

/**
 * Whether these are the same account, as far as anything here cares.
 *
 * Asked before the held session is replaced with a freshly read one. Replacing
 * it with an equal copy is not harmless: the session is a value other things
 * watch for change, so a new object that says the same thing sets them all off
 * again — and one of those things is what read the account in the first place.
 */
export function sameAccount(held: Account, read: Account): boolean {
  return held.id === read.id && held.displayName === read.displayName;
}

export function clearSession(): void {
  removeStored(STORAGE_KEYS.backendSession);
}
