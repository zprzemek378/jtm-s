// Where the event logs are kept while they are still needed.
//
// One entry in `localStorage` holds every game that matters: the one being
// played, and any whose events the backend has not accepted yet. The rest are
// forgotten here, because the backend is where a finished game belongs.
//
// The operations are pure functions over the stored object, with the reading
// and writing at the bottom — so the rules about what is kept can be checked
// without a browser.

import type { PooledTrack } from "@/helpers/trackUnion";
import { STORAGE_KEYS, readStoredJson, tryWriteStoredJson } from "@/storage/localStorage";

import { compact, type GameOrigin, type LoggedEvent } from "./eventLog";
import type { GameAction } from "./gameState";

const STORE_VERSION = 1;

/**
 * How many games are kept at once.
 *
 * Only ever exceeded by games with unsent events, which are never thrown away
 * for being old — an evening played offline must survive until it syncs.
 */
export const MAX_STORED_GAMES = 4;

export type StoredGame = {
  id: string;
  startedAt: number;
  /** When the last event was appended, which is what ordering goes by. */
  updatedAt: number;
  /** The playlist selection it is played against. */
  historyKey: string;
  /** The universe it belongs to, or null for a game played outside any. */
  universeId: string | null;
  origin: GameOrigin;
  /**
   * Every track the game can draw, so it can be picked up on a machine that
   * has not loaded the playlists — and dropped the moment it ends, because it
   * is far and away the largest thing here.
   */
  catalogue: readonly PooledTrack[];
  events: readonly LoggedEvent[];
  /** The highest sequence number the backend has acknowledged. */
  confirmedUpTo: number;
  /** When it was won or walked away from; null while it is still a game. */
  closedAt: number | null;
};

export type GameLog = {
  version: number;
  /** The game this machine is playing, or was playing last. */
  currentId: string | null;
  games: readonly StoredGame[];
};

export const EMPTY_LOG: GameLog = { version: STORE_VERSION, currentId: null, games: [] };

/** Whether anything in this game still has to reach the backend. */
export function hasUnsentEvents(game: StoredGame): boolean {
  return game.events.length > game.confirmedUpTo;
}

const replace = (log: GameLog, id: string, change: (game: StoredGame) => StoredGame): GameLog => ({
  ...log,
  games: log.games.map((game) => (game.id === id ? change(game) : game)),
});

/** Opens a game. It becomes the current one; whatever was is left as it is. */
export function beginGame(
  log: GameLog,
  game: {
    id: string;
    historyKey: string;
    universeId?: string | null;
    origin: GameOrigin;
    catalogue: readonly PooledTrack[];
    at: number;
  },
): GameLog {
  return prune({
    ...log,
    currentId: game.id,
    games: [
      ...log.games.filter((stored) => stored.id !== game.id),
      {
        id: game.id,
        startedAt: game.at,
        updatedAt: game.at,
        historyKey: game.historyKey,
        universeId: game.universeId ?? null,
        origin: game.origin,
        catalogue: game.catalogue,
        events: [],
        confirmedUpTo: 0,
        closedAt: null,
      },
    ],
  });
}

/** Writes down what just happened, numbering it after the event before. */
export function appendAction(log: GameLog, id: string, action: GameAction, at: number): GameLog {
  return replace(log, id, (game) => ({
    ...game,
    updatedAt: at,
    events: [
      ...game.events,
      { seq: (game.events[game.events.length - 1]?.seq ?? 0) + 1, at, action: compact(action) },
    ],
  }));
}

/**
 * Ends a game: won, or walked away from.
 *
 * The track list goes at once — it is the only large thing stored, and nothing
 * is going to be drawn from it again. The events stay until they are sent.
 */
export function closeGame(log: GameLog, id: string, at: number): GameLog {
  return prune(replace(log, id, (game) => ({ ...game, closedAt: at, catalogue: [] })));
}

/** Records how far the backend has accepted this game's events. */
export function markConfirmed(log: GameLog, id: string, seq: number): GameLog {
  return prune(
    replace(log, id, (game) => ({
      ...game,
      confirmedUpTo: Math.max(game.confirmedUpTo, seq),
    })),
  );
}

/** The game with this id, or null when the store has never heard of it. */
export function findGame(log: GameLog, id: string): StoredGame | null {
  return log.games.find((game) => game.id === id) ?? null;
}

/**
 * Drops everything after `seq`, which is how a move is taken back.
 *
 * Events are cut from the end rather than contradicted, because a log the
 * reducer can simply be replayed over is the whole point of keeping one. Once
 * there is a backend to sync with, a cut that reaches events it has already
 * accepted will have to travel as an event of its own — it cannot be undone by
 * saying less than before.
 */
export function truncateEvents(log: GameLog, id: string, seq: number): GameLog {
  return replace(log, id, (game) => ({
    ...game,
    events: game.events.filter((event) => event.seq <= seq),
  }));
}

/**
 * Puts taken-back events back, with the numbers they had.
 *
 * Keeping the numbers is what makes redoing free: the backend stores by
 * (game, seq), so an event that goes back where it was is the same event.
 */
export function restoreEvents(log: GameLog, id: string, events: readonly LoggedEvent[]): GameLog {
  return replace(log, id, (game) => ({
    ...game,
    events: [...game.events, ...events].sort((first, second) => first.seq - second.seq),
  }));
}

/** Forgets a game outright, sent or not — the host said to drop it. */
export function forgetGame(log: GameLog, id: string): GameLog {
  return {
    ...log,
    currentId: log.currentId === id ? null : log.currentId,
    games: log.games.filter((game) => game.id !== id),
  };
}

/**
 * Throws away what is no longer needed: games that have ended and been
 * accepted, and then the oldest of whatever is left over the limit.
 */
export function prune(log: GameLog): GameLog {
  const worth = log.games.filter(
    (game) => game.id === log.currentId || game.closedAt === null || hasUnsentEvents(game),
  );
  // Newest last, as they went in; the limit takes from the front, except that
  // nothing with unsent events is ever dropped for being old.
  const ordered = [...worth].sort((first, second) => first.updatedAt - second.updatedAt);
  const over = ordered.length - MAX_STORED_GAMES;
  const dropped =
    over <= 0
      ? ordered
      : ordered.filter((game, index) => {
          const old = index < over;

          return !old || game.id === log.currentId || hasUnsentEvents(game);
        });

  return { ...log, games: dropped };
}

/** The game this machine could carry on with, if there is one. */
export function resumableGame(log: GameLog): StoredGame | null {
  const current = log.games.find((game) => game.id === log.currentId);

  if (!current || current.closedAt !== null || current.events.length === 0) {
    return null;
  }

  // Nothing to carry on with before a track has been played, and nothing to
  // play without the list it was drawn from.
  return current.catalogue.length > 0 ? current : null;
}

/** Every game with something the backend has not seen, oldest first. */
export function pendingGames(log: GameLog): readonly StoredGame[] {
  return log.games
    .filter(hasUnsentEvents)
    .sort((first, second) => first.startedAt - second.startedAt);
}

export function readGameLog(): GameLog {
  const stored = readStoredJson<GameLog>(STORAGE_KEYS.games);

  if (!stored || stored.version !== STORE_VERSION || !Array.isArray(stored.games)) {
    return EMPTY_LOG;
  }

  return stored;
}

/** The same log with less in it, each step more drastic than the last. */
function* shrinking(log: GameLog): Generator<GameLog> {
  yield log;

  // The track lists are almost all of the bulk and the easiest thing to live
  // without: a game that loses its list can still be sent, just not resumed.
  yield {
    ...log,
    games: log.games.map((game) => (game.id === log.currentId ? game : { ...game, catalogue: [] })),
  };

  yield { ...log, games: log.games.filter((game) => game.id === log.currentId) };
}

/**
 * Stores the log, giving things up until it fits.
 *
 * Storage can be denied outright — a private window, blocked site data — and
 * that is not an error either: the game carries on in memory, and only
 * resuming is lost. The answer says which happened.
 */
/**
 * Takes the acknowledgements from the stored copy.
 *
 * Two things write here: the game being played, which holds the log in memory
 * and knows nothing about syncing, and the sync, which knows nothing about the
 * round in progress. Each would otherwise undo the other's work, so a write
 * keeps whichever acknowledgement is further along.
 */
function withStoredConfirmations(log: GameLog): GameLog {
  const stored = readGameLog();

  return {
    ...log,
    games: log.games.map((game) => {
      const known = stored.games.find((other) => other.id === game.id);

      return known && known.confirmedUpTo > game.confirmedUpTo
        ? { ...game, confirmedUpTo: known.confirmedUpTo }
        : game;
    }),
  };
}

const watchers = new Set<() => void>();

/**
 * Called whenever the stored games change, so the sync can look again.
 *
 * `localStorage` tells a tab nothing about its own writes, and polling would
 * mean parsing the whole store — track lists and all — on a timer.
 */
export function watchGameLog(watcher: () => void): () => void {
  watchers.add(watcher);

  return () => void watchers.delete(watcher);
}

export function writeGameLog(log: GameLog): boolean {
  for (const candidate of shrinking(prune(withStoredConfirmations(log)))) {
    if (tryWriteStoredJson(STORAGE_KEYS.games, candidate)) {
      for (const watcher of watchers) {
        watcher();
      }

      return true;
    }
  }

  return false;
}
