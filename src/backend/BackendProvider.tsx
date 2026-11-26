// The backend, from the application's side.
//
// Everything here is allowed to fail. The game is played at somebody's house
// on whatever connection is going, and the whole design rests on that: games
// are written down locally as they happen and pushed afterwards, so nothing on
// screen ever waits for this and a Worker that is down costs nothing but the
// history catching up later.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { API, type Account, type SessionResponse, type Universe } from "@jtm-s/shared";

import { pendingGames, readGameLog, watchGameLog } from "@/game/gameStore";
import {
  STORAGE_KEYS,
  readStoredString,
  removeStored,
  writeStoredString,
} from "@/storage/localStorage";
import { useSpotify } from "@/spotify/useSpotify";
import { SpotifyStatus } from "@/spotify/SpotifyContext";

import { BackendContext, BackendStatus, type BackendContextValue } from "./BackendContext";
import { BackendError, BackendFailure, call, type Call } from "./client";
import { hasBackend } from "./config";
import { clearSession, readSession, writeSession, type BackendSession } from "./session";
import { pushPending } from "./sync";

/** How long to leave a push after a write before making it. */
const PUSH_DELAY_MS = 2000;

/** Whether this machine has been told to stay signed out. */
function optedOut(): boolean {
  return readStoredString(STORAGE_KEYS.backendOptOut) === "true";
}

export function BackendProvider({ children }: { children: ReactNode }) {
  const { status: spotifyStatus, getAccessToken } = useSpotify();
  const [session, setSession] = useState<BackendSession | null>(() =>
    hasBackend ? readSession() : null,
  );
  const [signingIn, setSigningIn] = useState(false);
  const [universes, setUniverses] = useState<readonly Universe[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(() =>
    hasBackend ? pendingGames(readGameLog()).length : 0,
  );
  const [syncing, setSyncing] = useState(false);

  const sessionRef = useRef(session);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const forget = useCallback(() => {
    clearSession();
    setSession(null);
    setUniverses([]);
  }, []);

  const request = useCallback(
    async <T,>(path: string, options: Omit<Call, "token"> = {}): Promise<T> => {
      const token = sessionRef.current?.token ?? null;

      try {
        return await call<T>(path, { ...options, token });
      } catch (thrown) {
        // A session the backend will not accept is no session at all. Dropping
        // it here means every screen can simply try, rather than each one
        // deciding what a 401 means.
        if (thrown instanceof BackendError && thrown.failure === BackendFailure.Unauthorized) {
          forget();
        }

        throw thrown;
      }
    },
    [forget],
  );

  const refresh = useCallback(async () => {
    if (!sessionRef.current) {
      return;
    }

    try {
      const me = await request<{
        account: Account;
        mayCreateUniverse: boolean;
        universes: readonly Universe[];
      }>(API.me);

      setUniverses(me.universes);
      setSession((held) =>
        held ? { ...held, account: me.account, mayCreateUniverse: me.mayCreateUniverse } : held,
      );
      setError(null);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    }
  }, [request]);

  const signIn = useCallback(async () => {
    if (!hasBackend || sessionRef.current || signingIn) {
      return;
    }

    setSigningIn(true);
    setError(null);

    try {
      // The Spotify token is spent here and nowhere else: what it buys is a
      // session of our own, and the backend never stores it.
      const spotifyToken = await getAccessToken();
      const answer = await call<SessionResponse>(API.session, {
        method: "POST",
        body: { spotifyToken },
      });
      const held: BackendSession = {
        token: answer.token,
        expiresAt: answer.expiresAt,
        account: answer.account,
        mayCreateUniverse: answer.mayCreateUniverse,
      };

      writeSession(held);
      removeStored(STORAGE_KEYS.backendOptOut);
      sessionRef.current = held;
      setSession(held);
      // The account and its universes are read by the effect that watches the
      // session, rather than here as well.
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setSigningIn(false);
    }
  }, [getAccessToken, signingIn]);

  const signOut = useCallback(() => {
    // Remembered, so that being signed out is a decision rather than something
    // the next visit quietly undoes.
    writeStoredString(STORAGE_KEYS.backendOptOut, "true");
    forget();
  }, [forget]);

  const syncNow = useCallback(async () => {
    const token = sessionRef.current?.token;

    if (!token || syncing) {
      return;
    }

    setSyncing(true);

    try {
      const outcome = await pushPending(token);

      setPending(outcome.pending);
      setError(outcome.failure ? outcome.failure.message : null);
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  // Signing in by itself, once, when there is a backend to sign in to and a
  // Spotify account to do it with. Being signed out on purpose is remembered.
  //
  // This is exactly what an effect is for — reaching an outside system when
  // the conditions for it appear — and signing in does set state, at the end.
  useEffect(() => {
    if (hasBackend && !session && !optedOut() && spotifyStatus === SpotifyStatus.LoggedIn) {
      // oxlint-disable-next-line react/set-state-in-effect
      void signIn();
    }
  }, [session, signIn, spotifyStatus]);

  // Reading the account and its universes is the one thing that follows from
  // holding a session, wherever that session came from — a fresh sign-in or
  // one stored since the last visit.
  useEffect(() => {
    if (session) {
      // oxlint-disable-next-line react/set-state-in-effect
      void refresh();
    }
  }, [refresh, session]);

  /**
   * Pushes a little after anything is written down, and whenever the machine
   * finds a connection again.
   *
   * Deliberately not on a timer: the store is only read when something has
   * changed, and parsing it means parsing the track lists with it.
   */
  const pushRef = useRef<number | null>(null);

  const notePending = useCallback(() => {
    setPending(pendingGames(readGameLog()).length);
  }, []);

  const pushSoon = useCallback(() => {
    if (pushRef.current === null) {
      pushRef.current = window.setTimeout(() => {
        pushRef.current = null;
        void syncNow();
      }, PUSH_DELAY_MS);
    }
  }, [syncNow]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const changed = () => {
      notePending();
      pushSoon();
    };
    const stopWatching = watchGameLog(changed);

    window.addEventListener("online", changed);
    // Whatever was written down before this machine signed in is waiting too.
    pushSoon();

    return () => {
      stopWatching();
      window.removeEventListener("online", changed);

      if (pushRef.current !== null) {
        clearTimeout(pushRef.current);
        pushRef.current = null;
      }
    };
  }, [notePending, pushSoon, session]);

  const value = useMemo<BackendContextValue>(
    () => ({
      status: !hasBackend
        ? BackendStatus.Absent
        : signingIn
          ? BackendStatus.SigningIn
          : session
            ? BackendStatus.Ready
            : BackendStatus.SignedOut,
      account: session?.account ?? null,
      mayCreateUniverse: session?.mayCreateUniverse ?? false,
      universes,
      error,
      signIn,
      signOut,
      refresh,
      request,
      pending,
      syncing,
      syncNow,
    }),
    [
      error,
      pending,
      refresh,
      request,
      session,
      signIn,
      signOut,
      signingIn,
      syncNow,
      syncing,
      universes,
    ],
  );

  return <BackendContext.Provider value={value}>{children}</BackendContext.Provider>;
}
