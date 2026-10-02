// Playback commands the browser player owns.
//
// These never pass through our own fetch: the Web Playback SDK is a script
// served by Spotify that reaches them its own way, which we can neither see nor
// count. What we can do is queue how often we ask, which is why each one goes
// through the same queue as everything else — see `viaRest.ts` for the commands
// that do travel as ordinary requests. Above this folder the difference should
// not matter.

import { Priority, schedule } from "../transport/queue";
import type { PlaybackPosition } from "../types";

/** The player, or null before it has been created. */
export type Player = Spotify.Player | null;

/**
 * Stops the music.
 *
 * The most urgent thing the game ever asks for: a player buzzes and the room
 * expects silence at once, so this goes to the front of the queue.
 */
export async function pause(player: Player): Promise<void> {
  await schedule(
    async () => {
      await player?.pause();
    },
    { priority: Priority.Urgent },
  );
}

/** Picks the snippet up where it was paused. */
export async function resume(player: Player): Promise<void> {
  await schedule(
    async () => {
      await player?.resume();
    },
    { priority: Priority.Urgent },
  );
}

/**
 * Jumps to a position in the track.
 *
 * Coalesced, because a position is a value rather than an event: when several
 * arrive in a row — dragging the scrubber, or holding an arrow key — every one
 * but the last is already stale, so the queue keeps only the newest.
 */
export async function seek(player: Player, positionMs: number): Promise<void> {
  await schedule(
    async () => {
      await player?.seek(Math.max(0, Math.round(positionMs)));
    },
    { priority: Priority.Playback, coalesceKey: "seek" },
  );
}

/** Sets the player's volume, from 0 to 1. */
export async function setVolume(player: Player, volume: number): Promise<void> {
  await schedule(
    async () => {
      await player?.setVolume(volume);
    },
    { priority: Priority.Playback, coalesceKey: "volume" },
  );
}

/**
 * Where playback stands right now, or null when nothing is loaded.
 *
 * Not queued, and deliberately so: the SDK answers from state it already holds
 * in this tab, so this costs no request at all. That is what makes it safe for
 * the scrubber to ask once a second.
 */
export async function readPlayback(player: Player): Promise<PlaybackPosition | null> {
  const state = await player?.getCurrentState();

  if (!state) {
    return null;
  }

  return {
    positionMs: state.position,
    durationMs: state.duration,
    paused: state.paused,
  };
}
