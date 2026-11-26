// Sending what was played to the backend.
//
// Offline first, and not as a feature: the game is played at somebody's house,
// often on a laptop with no connection worth relying on, and a round must never
// wait on a request. So everything is written down locally as it happens and
// this pushes it afterwards — whenever that turns out to be.
//
// Nothing here is destructive. The events are numbered by the client and stored
// by (game, seq), so sending the same batch twice is sending it once, and a
// push that fails halfway simply leaves the rest for the next attempt.

import { API, type SyncEventsResponse } from "@jtm-s/shared";

import {
  markConfirmed,
  pendingGames,
  playedTracks,
  readGameLog,
  writeGameLog,
  type StoredGame,
} from "@/game/gameStore";

import { BackendError, BackendFailure, call } from "./client";

/**
 * How many events go in one call. The backend refuses more, and a long evening
 * played offline is a handful of these rather than one enormous request.
 */
const BATCH = 200;

/**
 * How large a track list is worth storing, as JSON characters.
 *
 * It is stored so that a game can be picked up on another machine, which is
 * worth a few hundred kilobytes — but a selection of twenty playlists is not,
 * and a game whose list is left behind can still be synced, just not continued
 * elsewhere.
 */
const CATALOGUE_LIMIT = 400_000;

/** What came of one attempt, for a screen to report. */
export type SyncOutcome = {
  /** Games whose events are now entirely stored. */
  sent: number;
  /** Games still waiting, whether they failed or were never reached. */
  pending: number;
  /** Why it stopped, when something went wrong. */
  failure: BackendError | null;
};

function catalogueFor(game: StoredGame): unknown {
  if (game.closedAt !== null || game.catalogue.length === 0) {
    return undefined;
  }

  const json = JSON.stringify(game.catalogue);

  return json.length > CATALOGUE_LIMIT ? undefined : game.catalogue;
}

/** Stores the game itself, which is what the events then hang off. */
async function putGame(token: string, game: StoredGame): Promise<void> {
  await call(API.game(game.id), {
    method: "PUT",
    token,
    body: {
      universeId: game.universeId,
      historyKey: game.historyKey,
      startedAt: game.startedAt,
      closedAt: game.closedAt,
      origin: game.origin,
      catalogue: catalogueFor(game),
      // Always, and whatever is known: the titles are what a finished game's
      // history reads, and they weigh a round or two rather than a playlist.
      tracks: game.tracks.length > 0 ? game.tracks : playedTracks(game),
    },
  });
}

/**
 * Sends everything this game has that the backend has not acknowledged.
 *
 * Each batch's reply says how far the backend now goes, and that is written
 * down before the next one is sent: a push interrupted anywhere leaves the
 * local log agreeing with the backend about exactly what arrived.
 */
async function pushGame(token: string, game: StoredGame): Promise<void> {
  await putGame(token, game);

  let from = game.confirmedUpTo;

  for (;;) {
    const events = game.events.filter((event) => event.seq > from).slice(0, BATCH);

    if (events.length === 0) {
      return;
    }

    const { confirmedUpTo } = await call<SyncEventsResponse>(API.gameEvents(game.id), {
      method: "POST",
      token,
      body: { clientNow: Date.now(), events },
    });

    // Read back rather than written through: the game being played holds its
    // own copy of the log, and this is only ever allowed to move the
    // acknowledgement along.
    writeGameLog(markConfirmed(readGameLog(), game.id, confirmedUpTo));

    if (confirmedUpTo <= from) {
      // The backend accepted the batch and still says it holds nothing new.
      // Sending it again would be an endless loop over the same events.
      return;
    }

    from = confirmedUpTo;
  }
}

/**
 * One attempt at catching the backend up.
 *
 * Stops at the first failure worth retrying — if the Worker is unreachable for
 * one game it is unreachable for the next — and carries on past a refusal,
 * which is about that game and nobody else.
 */
export async function pushPending(token: string): Promise<SyncOutcome> {
  const waiting = pendingGames(readGameLog());
  let sent = 0;
  let failure: BackendError | null = null;

  for (const game of waiting) {
    try {
      await pushGame(token, game);
      sent += 1;
    } catch (thrown) {
      const error =
        thrown instanceof BackendError
          ? thrown
          : new BackendError(
              BackendFailure.Unreachable,
              thrown instanceof Error ? thrown.message : "the push failed",
            );

      failure = error;

      if (error.worthRetrying) {
        break;
      }
    }
  }

  return { sent, pending: pendingGames(readGameLog()).length, failure };
}
