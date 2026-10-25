// Playback commands the browser player owns.
//
// These never pass through our own fetch: the Web Playback SDK is a script
// served by Spotify that reaches them its own way, which we can neither see nor
// count. What we can do is queue how often we ask, which is why each one goes
// through the same queue as everything else — see `viaRest.ts` for the commands
// that do travel as ordinary requests. Above this folder the difference should
// not matter.

import {
  PAUSE_VERIFY_ATTEMPTS,
  PAUSE_VERIFY_DELAY_MS,
  PLAYBACK_START_GRACE_MS,
  PLAYBACK_START_POLL_MS,
  PLAYBACK_START_TIMEOUT_MS,
} from "@/constants/spotify";

import { Priority, schedule } from "../transport/queue";
import type { PlaybackPosition } from "../types";

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

/** The player, or null before it has been created. */
export type Player = Spotify.Player | null;

function sendPause(player: Player): Promise<void> {
  return schedule(
    async () => {
      await player?.pause();
    },
    { priority: Priority.Urgent },
  );
}

/**
 * Stops the music, and makes sure it stayed stopped.
 *
 * The most urgent thing the game ever asks for: a player buzzes and the room
 * expects silence at once, so this goes to the front of the queue. It is also
 * the one command that must not be allowed to go missing, and it can: a pause
 * that reaches the device in the moment between the play command and the first
 * sound has nothing to act on, and the track then starts with nobody left to
 * stop it. So the player is asked again until it reports itself paused.
 *
 * @param stillWanted Answers false once something else has asked for the music
 *   back — the host revealing the answer, or the next round starting. Without
 *   it a late retry could pause a track that is meant to be playing.
 */
export async function pause(
  player: Player,
  stillWanted: () => boolean = () => true,
): Promise<void> {
  await sendPause(player);

  for (let attempt = 1; attempt < PAUSE_VERIFY_ATTEMPTS; attempt += 1) {
    await sleep(PAUSE_VERIFY_DELAY_MS);

    if (!stillWanted()) {
      return;
    }

    const state = await player?.getCurrentState();

    if (state?.paused) {
      return;
    }

    // No state at all is the very situation this guards against: a device with
    // a track on its way reports nothing until it arrives. Pausing that is
    // pausing thin air, so the answer is to keep watching, not to give up.
    if (state) {
      await sendPause(player);
    }
  }
}

/**
 * Waits until the device is playing the track that was asked for.
 *
 * Answers false if it never got there, which is not treated as a failure: the
 * play command was accepted, and a round that refused to start over a check of
 * our own would be worse than one that starts a moment early.
 */
export async function waitUntilPlaying(player: Player, trackUri: string): Promise<boolean> {
  const startedAt = performance.now();
  const deadline = startedAt + PLAYBACK_START_TIMEOUT_MS;

  while (performance.now() < deadline) {
    const state = await player?.getCurrentState();

    if (state && !state.paused) {
      const playing = state.track_window.current_track;

      if (
        playing?.uri === trackUri ||
        playing?.linked_from?.uri === trackUri ||
        performance.now() - startedAt > PLAYBACK_START_GRACE_MS
      ) {
        return true;
      }
    }

    await sleep(PLAYBACK_START_POLL_MS);
  }

  return false;
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
