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
import { STORAGE_KEYS, readStoredJson, tryWriteStoredString } from "@/storage/localStorage";

import { compact, type GameOrigin, type LoggedEvent } from "./eventLog";
import { readCatalogue, readEvents, readOrigin } from "./gameRecord";
import type { GameAction } from "./gameState";

const STORE_VERSION = 1;

/** A song that was played, as little of it as the history needs. */
export type PlayedTrack = { id: string; name: string; artists: string };

/**
 * How many games are kept at once.
 *
 * Only ever exceeded by games with unsent events, which are never thrown away
 * for being old — an evening played offline must survive until it syncs.
 */
export const MAX_STORED_GAMES = 4;

/**
 * How much of the browser's store this is allowed to take, in characters.
 *
 * A limit of our own, well inside the browser's. `localStorage` belongs to the
 * origin, not to the page, and on GitHub Pages that means every project of the
 * same owner shares it — so filling it would quietly break the neighbours.
 * This gives things up at two megabytes rather than waiting to be refused at
 * five.
 */
export const MAX_STORED_CHARS = 2_000_000;

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
  /**
   * The songs that were played, by title.
   *
   * Kept when the game ends and the track list is given up: it is a round or
   * two of titles rather than a whole playlist, and without it the history of
   * a finished game could name no songs at all.
   */
  tracks: readonly PlayedTrack[];
  events: readonly LoggedEvent[];
  /** The highest sequence number the backend has acknowledged. */
  confirmedUpTo: number;
  /** When it was won or walked away from; null while it is still a game. */
  closedAt: number | null;
  /**
   * Whether the backend has been told that it ended.
   *
   * Separate from the events, because ending a game is not an event: a game
   * abandoned an hour after its last round has nothing unsent and would
   * otherwise stay unfinished in the backend for ever — offered back on every
   * other machine in the universe.
   */
  closedSent: boolean;
};

export type GameLog = {
  version: number;
  /** The game this machine is playing, or was playing last. */
  currentId: string | null;
  games: readonly StoredGame[];
};

export const EMPTY_LOG: GameLog = { version: STORE_VERSION, currentId: null, games: [] };

/** Whether any of this game's events still have to reach the backend. */
export function hasUnsentEvents(game: StoredGame): boolean {
  return game.events.length > game.confirmedUpTo;
}

/** Whether anything about this game still has to reach the backend at all. */
export function needsSync(game: StoredGame): boolean {
  return hasUnsentEvents(game) || (game.closedAt !== null && !game.closedSent);
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
        tracks: [],
        events: [],
        confirmedUpTo: 0,
        closedAt: null,
        closedSent: false,
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
  return prune(
    replace(log, id, (game) => ({
      ...game,
      // Closing a game twice is closing it once: a rematch closes the game it
      // follows, which the winning round has already closed, and moving the
      // time would make it look unsent again.
      closedAt: game.closedAt ?? at,
      // The titles are taken out of the list before the list goes, because
      // they are what the history reads.
      tracks: game.tracks.length > 0 ? game.tracks : playedTracks(game),
      catalogue: [],
    })),
  );
}

/** The songs this game actually played, in the order they were drawn. */
export function playedTracks(game: Pick<StoredGame, "catalogue" | "events">): PlayedTrack[] {
  const played: PlayedTrack[] = [];

  for (const event of game.events) {
    if (event.action.type !== "start-round") {
      continue;
    }

    const { trackId } = event.action;
    const track = game.catalogue.find((candidate) => candidate.id === trackId);

    if (track && !played.some((other) => other.id === trackId)) {
      played.push({ id: track.id, name: track.name, artists: track.artists });
    }
  }

  return played;
}

/** Records that the backend has been told this game ended. */
export function markClosedSent(log: GameLog, id: string): GameLog {
  return prune(replace(log, id, (game) => ({ ...game, closedSent: true })));
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
 * reducer can simply be replayed over is the whole point of keeping one.
 *
 * The acknowledgement comes back with it. The backend may already hold the
 * events that have just gone, and it stores them by (game, seq) — so what has
 * to happen is that the numbers from here on are sent again and overwrite
 * them. Leaving the acknowledgement where it was would mean the replayed moves
 * counted as already stored, and the two sides would quietly disagree about
 * how the evening went.
 */
export function truncateEvents(log: GameLog, id: string, seq: number): GameLog {
  return replace(log, id, (game) => ({
    ...game,
    events: game.events.filter((event) => event.seq <= seq),
    confirmedUpTo: Math.min(game.confirmedUpTo, seq),
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

/**
 * Takes a game from the backend into this machine's store, as the current one.
 *
 * What makes an evening continuable on another computer: the game keeps its id,
 * so whatever is played from here on carries on numbering the same log and the
 * backend stores it by the same (game, seq) as everything before it.
 */
export function adoptGame(log: GameLog, game: StoredGame): GameLog {
  return prune({
    ...log,
    currentId: game.id,
    games: [...log.games.filter((stored) => stored.id !== game.id), game],
  });
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
    (game) => game.id === log.currentId || game.closedAt === null || needsSync(game),
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

          return !old || game.id === log.currentId || needsSync(game);
        });

  return { ...log, games: dropped };
}

/**
 * Whether this game could be carried on where it stands.
 *
 * Nothing to carry on with before a track has been played, nothing to carry on
 * at all once it has ended, and nothing to play without the list it was drawn
 * from — a game that gave its list up to fit in the store can still be sent,
 * just not resumed here.
 */
function resumable(game: StoredGame): boolean {
  return game.closedAt === null && game.events.length > 0 && game.catalogue.length > 0;
}

/**
 * Every game this machine could carry on with, the one it was playing first
 * and the rest newest first.
 *
 * All of them rather than only the last: an evening interrupted two days ago
 * is as worth finishing as the one interrupted this afternoon, and the host is
 * the one who knows which.
 */
export function resumableGames(log: GameLog): readonly StoredGame[] {
  const current = log.games.find((game) => game.id === log.currentId && resumable(game));
  const rest = log.games
    .filter((game) => game.id !== current?.id && resumable(game))
    .sort((first, second) => second.updatedAt - first.updatedAt);

  return current ? [current, ...rest] : rest;
}

/** The game this machine was playing, if it can be carried on. */
export function resumableGame(log: GameLog): StoredGame | null {
  return resumableGames(log)[0] ?? null;
}

/** Every game with something the backend has not seen, oldest first. */
export function pendingGames(log: GameLog): readonly StoredGame[] {
  return log.games.filter(needsSync).sort((first, second) => first.startedAt - second.startedAt);
}

const whole = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** The titles of what was played, as little of them as the history needs. */
function readPlayed(value: unknown): readonly PlayedTrack[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry: unknown) => {
    if (entry === null || typeof entry !== "object") {
      return [];
    }

    const { id, name, artists } = entry as Record<string, unknown>;

    return typeof id === "string" && id !== ""
      ? [
          {
            id,
            name: typeof name === "string" ? name : id,
            artists: typeof artists === "string" ? artists : "",
          },
        ]
      : [];
  });
}

/**
 * One stored game, read as carefully as anything from outside.
 *
 * What is in the browser's store was written by *some* version of this app,
 * not necessarily this one: a field that did not exist then is missing now,
 * and reading it as though it were there is how a game in progress crashes.
 * So every field is read rather than trusted, and a game that cannot be
 * replayed at all — no line-up, no id — is dropped instead of kept as a
 * half-thing.
 */
function readGame(value: unknown): StoredGame | null {
  if (value === null || typeof value !== "object") {
    return null;
  }

  const fields = value as Record<string, unknown>;
  const id = typeof fields.id === "string" ? fields.id : "";
  const origin = readOrigin(fields.origin);

  if (id === "" || !origin) {
    return null;
  }

  const events = readEvents(fields.events);
  const startedAt = whole(fields.startedAt, 0);

  return {
    id,
    startedAt,
    updatedAt: whole(fields.updatedAt, startedAt),
    historyKey: typeof fields.historyKey === "string" ? fields.historyKey : "",
    universeId: typeof fields.universeId === "string" ? fields.universeId : null,
    origin,
    catalogue: readCatalogue(fields.catalogue),
    tracks: readPlayed(fields.tracks),
    events,
    // Never beyond what is actually here: an acknowledgement for events this
    // store no longer holds would stop them from ever being sent again.
    confirmedUpTo: Math.min(
      Math.max(0, whole(fields.confirmedUpTo, 0)),
      events[events.length - 1]?.seq ?? 0,
    ),
    closedAt: typeof fields.closedAt === "number" ? fields.closedAt : null,
    closedSent: fields.closedSent === true,
  };
}

export function readGameLog(): GameLog {
  const stored = readStoredJson<Record<string, unknown>>(STORAGE_KEYS.games);

  if (!stored || stored.version !== STORE_VERSION || !Array.isArray(stored.games)) {
    return EMPTY_LOG;
  }

  const games = stored.games.flatMap((game: unknown) => {
    const read = readGame(game);

    return read ? [read] : [];
  });
  const currentId = typeof stored.currentId === "string" ? stored.currentId : null;

  return {
    version: STORE_VERSION,
    // Pointing at a game that did not survive the read is the same as pointing
    // at nothing.
    currentId: games.some((game) => game.id === currentId) ? currentId : null,
    games,
  };
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

  // Then the list of the game being played, which costs resuming it and
  // nothing else: the round in progress is in memory and plays on.
  yield { ...log, games: log.games.map((game) => ({ ...game, catalogue: [] })) };

  // Only with nothing left to give up is a game itself dropped, and with it
  // whatever it had not sent — the last resort before storing nothing at all.
  yield {
    ...log,
    games: log.games
      .filter((game) => game.id === log.currentId)
      .map((game) => ({ ...game, catalogue: [] })),
  };
}

/**
 * Takes the acknowledgements from the stored copy.
 *
 * Two things write here: the game being played, which holds the log in memory
 * and knows nothing about syncing, and the sync, which knows nothing about the
 * round in progress. Each would otherwise undo the other's work, so a write
 * keeps whichever acknowledgement is further along.
 *
 * Which games exist, on the other hand, is decided by whoever is writing —
 * otherwise forgetting one would be impossible. That is why the sync always
 * starts from a fresh read, and why only the game being played is allowed to
 * hold a copy for any length of time: one board at a time, which is also all
 * one Spotify device can play.
 */
function withStoredConfirmations(log: GameLog): GameLog {
  const stored = readGameLog();

  return {
    ...log,
    games: log.games.map((game) => {
      const known = stored.games.find((other) => other.id === game.id);

      if (!known) {
        return game;
      }

      return {
        ...game,
        // The further-along acknowledgement wins, but never beyond the events
        // the writer actually holds: that is what tells a stale copy (which
        // must not undo an acknowledgement) from a log that has just been cut
        // short on purpose (which must).
        confirmedUpTo: Math.min(
          Math.max(game.confirmedUpTo, known.confirmedUpTo),
          game.events[game.events.length - 1]?.seq ?? 0,
        ),
        closedSent: game.closedSent || known.closedSent,
      };
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

/**
 * Stores the log, giving things up until it fits — in this app's own budget as
 * well as in the browser's.
 *
 * Storage can also be denied outright — a private window, blocked site data —
 * and that is not an error: the game carries on in memory, and only resuming
 * is lost. The answer says whether anything was stored at all.
 */
export function writeGameLog(log: GameLog): boolean {
  for (const candidate of shrinking(prune(withStoredConfirmations(log)))) {
    const json = JSON.stringify(candidate);

    // Measured before it is offered, because the browser would accept far more
    // than this app has any business taking from the pages beside it.
    if (json.length > MAX_STORED_CHARS) {
      continue;
    }

    if (tryWriteStoredString(STORAGE_KEYS.games, json)) {
      for (const watcher of watchers) {
        watcher();
      }

      return true;
    }
  }

  return false;
}
