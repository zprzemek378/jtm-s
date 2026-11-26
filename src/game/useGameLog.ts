// Keeps the running game written down, so a closed tab is not a lost evening.
//
// Every action the session dispatches is appended here before anything else
// happens to it. Storing is deferred by a tick and coalesced: a press pauses
// the music, and that path has no business waiting on `localStorage`.

import { useCallback, useEffect, useRef, useState } from "react";

import type { PooledTrack } from "@/helpers/trackUnion";

import type { GameOrigin } from "./eventLog";
import type { GameAction } from "./gameState";
import {
  appendAction,
  beginGame,
  closeGame,
  readGameLog,
  writeGameLog,
  type GameLog,
} from "./gameStore";

export type GameLogHandle = {
  /** Which game in the store this session is writing to. */
  gameId: string;
  /** Writes down what just happened. */
  record: (action: GameAction) => void;
  /** It is over — won, or walked away from. */
  close: () => void;
  /** A rematch: the game just played is closed and a new one opened. */
  rotate: (origin: GameOrigin) => void;
};

export function useGameLog(params: {
  /** The id of the game being picked up again, or null for a new one. */
  resumedId: string | null;
  historyKey: string;
  origin: GameOrigin;
  catalogue: readonly PooledTrack[];
}): GameLogHandle {
  const { resumedId, historyKey, origin, catalogue } = params;
  // Settled when the session mounts: later renders must not open a second game.
  const [gameId, setGameId] = useState(() => resumedId ?? crypto.randomUUID());
  /**
   * The same id, for the three commands to read.
   *
   * They have to stay the same functions for the life of the session: the
   * session wraps its dispatch around `record`, and every callback that
   * dispatches would otherwise be rebuilt — or, worse, hold an old one and
   * write a rematch into the game before it.
   */
  const idRef = useRef(gameId);
  const logRef = useRef<GameLog | null>(null);
  const flushRef = useRef<number | null>(null);
  /**
   * What the game was opened with, for a rematch to be opened the same way.
   * Held in a ref because none of it belongs to a render.
   */
  const openedWith = useRef({ historyKey, origin, catalogue });

  useEffect(() => {
    openedWith.current = { historyKey, origin, catalogue };
  }, [catalogue, historyKey, origin]);

  /**
   * The log with this game in it, opening the game if that has not happened.
   *
   * Reading the store is left until here rather than done while rendering, and
   * a resumed game is already in there — only a new one has to be added.
   */
  const open = useCallback((id: string): GameLog => {
    if (logRef.current) {
      return logRef.current;
    }

    const stored = readGameLog();
    const known = stored.games.some((game) => game.id === id);

    logRef.current = known
      ? { ...stored, currentId: id }
      : beginGame(stored, {
          id,
          historyKey: openedWith.current.historyKey,
          origin: openedWith.current.origin,
          catalogue: openedWith.current.catalogue,
          at: Date.now(),
        });

    return logRef.current;
  }, []);

  const persist = useCallback(() => {
    if (flushRef.current !== null) {
      clearTimeout(flushRef.current);
      flushRef.current = null;
    }

    if (logRef.current) {
      writeGameLog(logRef.current);
    }
  }, []);

  /** Stores on the next tick, so a burst of actions costs one write. */
  const later = useCallback(() => {
    if (flushRef.current === null) {
      flushRef.current = window.setTimeout(() => {
        flushRef.current = null;
        persist();
      }, 0);
    }
  }, [persist]);

  // The game exists from the moment it is set up, before a round is played —
  // and whatever is still waiting to be written goes down on the way out.
  useEffect(() => {
    open(gameId);
    persist();

    return persist;
  }, [gameId, open, persist]);

  const record = useCallback(
    (action: GameAction) => {
      const id = idRef.current;

      logRef.current = appendAction(open(id), id, action, Date.now());
      later();
    },
    [later, open],
  );

  const close = useCallback(() => {
    const id = idRef.current;

    logRef.current = closeGame(open(id), id, Date.now());
    persist();
  }, [open, persist]);

  const rotate = useCallback(
    (next: GameOrigin) => {
      const closed = closeGame(open(idRef.current), idRef.current, Date.now());
      const id = crypto.randomUUID();

      logRef.current = beginGame(closed, {
        id,
        historyKey: openedWith.current.historyKey,
        origin: next,
        // The same tracks: a rematch is played on the playlists already loaded.
        catalogue: openedWith.current.catalogue,
        at: Date.now(),
      });
      idRef.current = id;
      setGameId(id);
      persist();
    },
    [open, persist],
  );

  return { gameId, record, close, rotate };
}
