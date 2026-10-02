// Playback commands that have to travel as ordinary Web API requests.
//
// The browser player can only control whatever is already on it — it has no
// "play this track" of its own — so putting something on the device, and the
// settings that govern how it plays through, are addressed to its device id
// over HTTP. See `viaSdk.ts` for the commands the player itself owns; above
// this folder the difference should not matter.

import { Priority } from "../transport/queue";
import { request, type AccessTokenProvider } from "../transport/request";

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
