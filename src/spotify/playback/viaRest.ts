// Playback commands that have to travel as ordinary Web API requests.
//
// The browser player can only control whatever is already on it — it has no
// "play this track" of its own — so putting something on the device, and the
// settings that govern how it plays through, are addressed to its device id
// over HTTP. See `viaSdk.ts` for the commands the player itself owns; above
// this folder the difference should not matter.

import { Priority } from "../transport/queue";
import { request, type AccessTokenProvider } from "../transport/request";
import { SpotifyError, SpotifyErrorKind } from "../types";

/**
 * Stops whatever the account is playing, wherever it is playing it.
 *
 * The browser player can only silence itself, which is no use when somebody
 * has started something on their own phone and the room can hear it. This
 * addresses the account's active device instead, whichever that is.
 *
 * Nothing to pause is not a failure: an account with no active device answers
 * 404, and one that is already paused can answer 403, and in both cases the
 * room is silent, which is all this was for.
 */
export async function pauseActiveDevice(getAccessToken: AccessTokenProvider): Promise<void> {
  try {
    await request(
      getAccessToken,
      "/me/player/pause",
      { method: "PUT" },
      { retryRateLimit: false, priority: Priority.Urgent },
    );
  } catch (failure) {
    const quiet =
      failure instanceof SpotifyError &&
      (failure.kind === SpotifyErrorKind.NotFound || failure.kind === SpotifyErrorKind.Forbidden);

    if (!quiet) {
      throw failure;
    }
  }
}

/** Starts a whole playlist on our device, at a given index inside it. */
export async function startContextPlayback(
  getAccessToken: AccessTokenProvider,
  deviceId: string,
  contextUri: string,
  position: number,
): Promise<void> {
  await request(
    getAccessToken,
    `/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ context_uri: contextUri, offset: { position } }),
    },
    { retryRateLimit: false, priority: Priority.Playback },
  );
}

export type QueueSnapshot = {
  /** The track playing right now, plus the ones lined up behind it. */
  entries: readonly unknown[];
};

/**
 * The current item and roughly the next twenty. This is the only route to the
 * contents of a playlist the API will not list.
 */
export async function fetchQueue(getAccessToken: AccessTokenProvider): Promise<QueueSnapshot> {
  const payload = (await request(getAccessToken, "/me/player/queue", undefined, {
    retryRateLimit: false,
    priority: Priority.Playback,
  })) as {
    currently_playing?: unknown;
    queue?: unknown[];
  };

  return {
    entries: [payload.currently_playing, ...(payload.queue ?? [])].filter(Boolean),
  };
}

export async function setShuffle(
  getAccessToken: AccessTokenProvider,
  deviceId: string,
  state: boolean,
): Promise<void> {
  await request(
    getAccessToken,
    `/me/player/shuffle?state=${state}&device_id=${encodeURIComponent(deviceId)}`,
    { method: "PUT" },
    { retryRateLimit: false, priority: Priority.Playback },
  );
}

export const RepeatState = {
  Off: "off",
  Context: "context",
  Track: "track",
} as const;

export type RepeatState = (typeof RepeatState)[keyof typeof RepeatState];

/**
 * `context` matters for scanning: at the end of a playlist it wraps back to the
 * start, instead of letting autoplay pad the queue with similar tracks that are
 * not on the playlist at all.
 */
export async function setRepeat(
  getAccessToken: AccessTokenProvider,
  deviceId: string,
  state: RepeatState,
): Promise<void> {
  await request(
    getAccessToken,
    `/me/player/repeat?state=${state}&device_id=${encodeURIComponent(deviceId)}`,
    { method: "PUT" },
    { retryRateLimit: false, priority: Priority.Playback },
  );
}

/** Starts one track on our own browser device, at the given millisecond. */
export async function startTrackPlayback(
  getAccessToken: AccessTokenProvider,
  deviceId: string,
  trackUri: string,
  positionMs: number,
): Promise<void> {
  await request(
    getAccessToken,
    `/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ uris: [trackUri], position_ms: positionMs }),
    },
    { priority: Priority.Playback },
  );
}
