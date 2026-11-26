import { createContext } from "react";

import type { Account, Universe } from "@jtm-s/shared";

import type { Call } from "./client";

/** How far this machine has got with our own backend. */
export const BackendStatus = {
  /** No address configured. The app is what it was before any of this. */
  Absent: "absent",
  /** Configured, but nobody is signed in to it. */
  SignedOut: "signed-out",
  SigningIn: "signing-in",
  Ready: "ready",
} as const;

export type BackendStatus = (typeof BackendStatus)[keyof typeof BackendStatus];

export type BackendContextValue = {
  status: BackendStatus;
  /** Who the backend thinks is calling, once signed in. */
  account: Account | null;
  /** The universes this account belongs to. */
  universes: readonly Universe[];
  /** What went wrong last, in plain words from the backend, or null. */
  error: string | null;
  /**
   * Signs in with the Spotify account already connected.
   *
   * Nothing else here needs calling first, and nothing in the game waits on
   * it: a refusal leaves the app playable and the evening stored locally.
   */
  signIn: () => Promise<void>;
  /** Signs out, and stops this machine signing itself back in. */
  signOut: () => void;
  /** Reads the account and its universes again. */
  refresh: () => Promise<void>;
  /**
   * A call to the backend with the session attached.
   *
   * Every screen uses this rather than the bare client, so that a session the
   * backend no longer accepts signs this machine out in one place instead of
   * each screen inventing its own answer.
   */
  request: <T>(path: string, options?: Omit<Call, "token">) => Promise<T>;

  /** How many games are waiting to be sent. */
  pending: number;
  syncing: boolean;
  /** Pushes whatever is waiting, now. */
  syncNow: () => Promise<void>;
};

export const BackendContext = createContext<BackendContextValue | null>(null);
