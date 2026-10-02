import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { DEFAULT_PLAYER_VOLUME, PLAYER_DEVICE_NAME } from "@/constants/spotify";

import {
  fetchCurrentUser,
  fetchMyPlaylists,
  fetchPlaylist,
  fetchPlaylistTracks,
  type AccessTokenProvider,
} from "./catalogue";
import {
  AuthError,
  AuthErrorKind,
  beginLogin,
  clearTokens,
  completeLogin,
  hasAuthResponse,
  isExpired,
  readTokens,
  refreshTokens,
  type StoredTokens,
} from "./auth/tokens";
import { isRedirectHostAcceptable, resolveClientId } from "./auth/clientId";
import { loadPlaybackSdk } from "./playback/loadPlaybackSdk";
import { startTrackPlayback } from "./playback/viaRest";
import * as sdk from "./playback/viaSdk";
import { scanPlaylist as runScan, type ScanProgress } from "./playlistScan";
import {
  PlayerStatus,
  SpotifyContext,
  SpotifyStatus,
  type SpotifyContextValue,
  type SpotifyMessage,
} from "./SpotifyContext";
import { SpotifyError, SpotifyErrorKind, type SpotifyUser } from "./types";

const AUTH_ERROR_KEYS: Record<AuthErrorKind, SpotifyMessage["key"]> = {
  [AuthErrorKind.Denied]: "spotify.error.auth",
  [AuthErrorKind.StateMismatch]: "spotify.error.state",
  [AuthErrorKind.VerifierMissing]: "spotify.error.verifierMissing",
  [AuthErrorKind.TokenExchange]: "spotify.error.token",
};

export function SpotifyProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  // Decided before the first paint: a redirect coming back from Spotify, or
  // tokens from an earlier visit, both mean the app is already connecting.
  const [status, setStatus] = useState<SpotifyStatus>(() => {
    if (resolveClientId() === null) {
      return SpotifyStatus.Unconfigured;
    }

    return hasAuthResponse() || readTokens() !== null
      ? SpotifyStatus.Connecting
      : SpotifyStatus.LoggedOut;
  });
  const [user, setUser] = useState<SpotifyUser | null>(null);
  const [error, setError] = useState<SpotifyMessage | null>(null);
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>(PlayerStatus.Idle);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const tokensRef = useRef<StoredTokens | null>(null);
  const clientIdRef = useRef<string | null>(resolveClientId());
  /** Keeps two simultaneous calls from both spending the same refresh token. */
  const refreshRef = useRef<Promise<StoredTokens> | null>(null);
  const playerRef = useRef<Spotify.Player | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const connectRef = useRef<Promise<void> | null>(null);
  /** StrictMode runs effects twice; the redirect may only be handled once. */
  const bootstrappedRef = useRef(false);
  /**
   * Whether anything has ever been put on our device.
   *
   * Pausing or resuming a player that has never been given a track makes the
   * SDK report "Cannot perform operation; no list was loaded" — an error the
   * host would see on screen for doing nothing wrong. The count-in before the
   * very first round silences the music before it starts, which is exactly
   * that situation.
   */
  const hasPlayedRef = useRef(false);

  const forgetSession = useCallback(() => {
    clearTokens();
    tokensRef.current = null;
    refreshRef.current = null;
    setUser(null);
    setStatus(resolveClientId() === null ? SpotifyStatus.Unconfigured : SpotifyStatus.LoggedOut);
  }, []);

  const getAccessToken = useCallback<AccessTokenProvider>(async () => {
    const clientId = clientIdRef.current;
    const tokens = tokensRef.current;

    if (!clientId || !tokens) {
      throw new AuthError(AuthErrorKind.TokenExchange, "Not logged in");
    }

    if (!isExpired(tokens)) {
      return tokens.accessToken;
    }

    if (!tokens.refreshToken) {
      forgetSession();
      setError({ key: "spotify.error.sessionExpired" });

      throw new AuthError(AuthErrorKind.TokenExchange, "No refresh token available");
    }

    // Reuse an in-flight refresh instead of starting a second one: Spotify
    // rotates the refresh token, so racing requests would invalidate it.
    refreshRef.current ??= refreshTokens(clientId, tokens.refreshToken).finally(() => {
      refreshRef.current = null;
    });

    try {
      const refreshed = await refreshRef.current;
      tokensRef.current = refreshed;

      return refreshed.accessToken;
    } catch (refreshFailure) {
      forgetSession();
      setError({ key: "spotify.error.sessionExpired" });

      throw refreshFailure;
    }
  }, [forgetSession]);

  /** Reports an API failure in the user's language and drops a dead session. */
  const reportSpotifyError = useCallback(
    (failure: unknown) => {
      if (failure instanceof SpotifyError) {
        if (failure.kind === SpotifyErrorKind.Unauthorized) {
          forgetSession();
          setError({ key: "spotify.error.sessionExpired" });

          return;
        }

        if (failure.kind === SpotifyErrorKind.RateLimited) {
          setError({ key: "spotify.error.rateLimited" });

          return;
        }

        setError({
          key: "spotify.error.request",
          params: { status: failure.status },
        });

        return;
      }

      if (failure instanceof AuthError) {
        setError({
          key: AUTH_ERROR_KEYS[failure.kind],
          params: { message: failure.message },
        });
      }
    },
    [forgetSession],
  );

  /**
   * Fetches the profile that turns a token into a logged-in session. Both call
   * sites already have the status at `connecting` — the initial state sees the
   * stored tokens or the redirect — so this only reports the outcome.
   */
  const loadProfile = useCallback(async () => {
    try {
      const profile = await fetchCurrentUser(getAccessToken);
      setUser(profile);
      setStatus(SpotifyStatus.LoggedIn);
    } catch (failure) {
      reportSpotifyError(failure);

      if (tokensRef.current === null) {
        return;
      }

      forgetSession();
    }
  }, [forgetSession, getAccessToken, reportSpotifyError]);

  // Pick the session up: either finish a redirect that just came back from
  // Spotify, or restore the tokens a previous visit stored.
  useEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }

    bootstrappedRef.current = true;

    const clientId = clientIdRef.current;

    if (!clientId) {
      return;
    }

    if (hasAuthResponse()) {
      completeLogin(clientId)
        .then(({ tokens, returnPath }) => {
          tokensRef.current = tokens;
          // Replacing the entry also strips `?code=…` out of the address bar.
          navigate(returnPath, { replace: true });

          return loadProfile();
        })
        .catch((failure: unknown) => {
          if (failure instanceof AuthError) {
            setError({
              key: AUTH_ERROR_KEYS[failure.kind],
              params: { message: failure.message },
            });
          }

          forgetSession();
          navigate("/", { replace: true });
        });

      return;
    }

    const stored = readTokens();

    if (stored) {
      tokensRef.current = stored;
      // Restoring a session is exactly the external-system synchronisation an
      // effect is for: the status is already `connecting`, and the profile
      // request resolves it either way.
      // oxlint-disable-next-line react/set-state-in-effect
      void loadProfile();
    }
  }, [forgetSession, loadProfile, navigate]);

  const login = useCallback((returnPath: string) => {
    // Sending the host to Spotify from an address it will not accept only
    // produces an error page there; say so here, where the fix is one click.
    if (!isRedirectHostAcceptable()) {
      setError({
        key: "spotify.badHost",
        params: { host: window.location.host },
      });

      return;
    }

    const clientId = resolveClientId();
    clientIdRef.current = clientId;

    if (!clientId) {
      setStatus(SpotifyStatus.Unconfigured);

      return;
    }

    setError(null);
    void beginLogin(clientId, returnPath);
  }, []);

  const refreshClientId = useCallback(() => {
    const clientId = resolveClientId();
    clientIdRef.current = clientId;

    setStatus((current) => {
      if (clientId === null) {
        return SpotifyStatus.Unconfigured;
      }

      // An existing session belongs to the old Client ID, so it is left alone;
      // only the "nothing configured" dead end is lifted.
      return current === SpotifyStatus.Unconfigured ? SpotifyStatus.LoggedOut : current;
    });
  }, []);

  const logout = useCallback(() => {
    playerRef.current?.disconnect();
    playerRef.current = null;
    deviceIdRef.current = null;
    connectRef.current = null;
    hasPlayedRef.current = false;
    setDeviceId(null);
    setPlayerStatus(PlayerStatus.Idle);
    setError(null);
    forgetSession();
  }, [forgetSession]);

  const connectPlayer = useCallback(async () => {
    if (deviceIdRef.current) {
      return;
    }

    connectRef.current ??= (async () => {
      setPlayerStatus(PlayerStatus.Connecting);

      try {
        await loadPlaybackSdk();
      } catch {
        setPlayerStatus(PlayerStatus.Error);
        setError({ key: "spotify.error.sdkLoad" });
        connectRef.current = null;

        throw new Error("SDK failed to load");
      }

      const player = new window.Spotify.Player({
        name: PLAYER_DEVICE_NAME,
        getOAuthToken: (callback) => {
          getAccessToken()
            .then(callback)
            .catch(() => {
              // getAccessToken has already surfaced the problem.
            });
        },
        volume: DEFAULT_PLAYER_VOLUME,
      });

      playerRef.current = player;

      const ready = new Promise<void>((resolve, reject) => {
        player.addListener("ready", ({ device_id: readyDeviceId }) => {
          deviceIdRef.current = readyDeviceId;
          setDeviceId(readyDeviceId);
          setPlayerStatus(PlayerStatus.Ready);
          resolve();
        });

        player.addListener("initialization_error", ({ message }) => {
          setPlayerStatus(PlayerStatus.Error);
          setError({
            key: "spotify.error.initialization",
            params: { message },
          });
          reject(new Error(message));
        });

        player.addListener("authentication_error", ({ message }) => {
          setPlayerStatus(PlayerStatus.Error);
          forgetSession();
          setError({ key: "spotify.error.sessionExpired" });
          reject(new Error(message));
        });

        // Spotify reports a missing Premium subscription here.
        player.addListener("account_error", ({ message }) => {
          setPlayerStatus(PlayerStatus.Error);
          setError({ key: "spotify.premiumRequired" });
          reject(new Error(message));
        });
      });

      player.addListener("not_ready", () => {
        deviceIdRef.current = null;
        setDeviceId(null);
        setPlayerStatus(PlayerStatus.Connecting);
      });

      player.addListener("playback_error", ({ message }) => {
        setError({ key: "spotify.error.playback", params: { message } });
      });

      const connected = await player.connect();

      if (!connected) {
        setPlayerStatus(PlayerStatus.Error);
        connectRef.current = null;

        throw new Error("The Spotify player refused to connect");
      }

      // Some browsers only allow audio after a gesture; this call happens
      // inside the click that starts the game, which is the gesture.
      await player.activateElement?.().catch(() => undefined);

      await ready;
    })();

    try {
      await connectRef.current;
    } catch (failure) {
      connectRef.current = null;

      throw failure;
    }
  }, [forgetSession, getAccessToken]);

  useEffect(
    () => () => {
      playerRef.current?.disconnect();
      playerRef.current = null;
    },
    [],
  );

  const playTrackAt = useCallback(
    async (trackUri: string, positionMs: number) => {
      const targetDeviceId = deviceIdRef.current;

      if (!targetDeviceId) {
        throw new Error("The browser player is not ready yet");
      }

      await startTrackPlayback(getAccessToken, targetDeviceId, trackUri, positionMs);
      hasPlayedRef.current = true;
    },
    [getAccessToken],
  );

  const pause = useCallback(async () => {
    if (!hasPlayedRef.current) {
      return;
    }

    await sdk.pause(playerRef.current);
  }, []);

  const resume = useCallback(async () => {
    if (!hasPlayedRef.current) {
      return;
    }

    await sdk.resume(playerRef.current);
  }, []);

  const seek = useCallback(async (positionMs: number) => {
    if (!hasPlayedRef.current) {
      return;
    }

    await sdk.seek(playerRef.current, positionMs);
  }, []);

  /** Costs no request: the SDK answers from the state it holds in this tab. */
  const readPlayback = useCallback(() => sdk.readPlayback(playerRef.current), []);

  // Both reads need to know who is logged in: since February 2026 only the
  // owner's (or a collaborator's) playlists give up their contents.
  const scanPlaylist = useCallback(
    async (playlistId: string, onProgress?: (progress: ScanProgress) => void) => {
      // The walk drives our own device, so the player has to be up first.
      await connectPlayer();

      const targetDeviceId = deviceIdRef.current;

      if (!targetDeviceId) {
        throw new Error("The browser player is not ready yet");
      }

      // The walk is about to put a playlist on the device, so the cleanup that
      // follows it is allowed to stop the player.
      hasPlayedRef.current = true;

      return runScan(
        {
          getAccessToken,
          deviceId: targetDeviceId,
          mute: async () => {
            await playerRef.current?.setVolume(0);
          },
          // Back to the level the player was created at, not to full blast.
          restoreVolume: async () => {
            await playerRef.current?.setVolume(DEFAULT_PLAYER_VOLUME);
          },
          pause,
        },
        playlistId,
        onProgress,
      );
    },
    [connectPlayer, getAccessToken, pause],
  );

  const fetchPlaylists = useCallback(
    () => fetchMyPlaylists(getAccessToken, user?.id ?? ""),
    [getAccessToken, user],
  );

  const fetchPlaylistById = useCallback(
    (playlistId: string) => fetchPlaylist(getAccessToken, playlistId, user?.id ?? ""),
    [getAccessToken, user],
  );

  const fetchTracks = useCallback(
    (playlistId: string) => fetchPlaylistTracks(getAccessToken, playlistId, user?.country ?? null),
    [getAccessToken, user],
  );

  const value = useMemo<SpotifyContextValue>(
    () => ({
      status,
      user,
      // Spotify may no longer report `product`; a missing value must not be
      // read as "no Premium" — the SDK's `account_error` is the real check.
      needsPremium: user !== null && user.product !== null && user.product !== "premium",
      error,
      clearError: () => setError(null),
      login,
      logout,
      refreshClientId,
      playerStatus,
      deviceId,
      connectPlayer,
      playTrackAt,
      pause,
      resume,
      seek,
      readPlayback,
      fetchPlaylists,
      fetchPlaylistById,
      fetchTracks,
      scanPlaylist,
    }),
    [
      connectPlayer,
      deviceId,
      error,
      fetchPlaylistById,
      fetchPlaylists,
      fetchTracks,
      login,
      logout,
      pause,
      playTrackAt,
      playerStatus,
      readPlayback,
      refreshClientId,
      resume,
      scanPlaylist,
      seek,
      status,
      user,
    ],
  );

  return <SpotifyContext.Provider value={value}>{children}</SpotifyContext.Provider>;
}
