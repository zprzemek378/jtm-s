// A game as the list of things that happened in it.
//
// The rules are already a pure reducer over serialisable actions, so keeping
// the actions is enough to have the game itself: replay them and the state
// comes back. That one mechanism is what gives a closed tab its game back, a
// history that can be stepped through, and undo inside edit mode.
//
// What is stored is not quite the action, though. `start-round` carries the
// whole remaining pool, which on a long playlist is hundreds of tracks — thirty
// rounds of that would be megabytes, and `localStorage` is measured in a few.
// So an event keeps only what cannot be worked out again, and the track list it
// was played against supplies the rest. The two conversions are each other's
// inverse and tested as such.

import type { PooledTrack } from "@/helpers/trackUnion";

import { createGameState, gameReducer, type GameAction, type GameState } from "./gameState";
import type { RewardDirection } from "./rewards";
import type { TitleOption } from "./titleChoice";
import type { GamePlayer, GameRules } from "./types";

/** A game action as it is stored, with what can be looked up again left out. */
export type LoggedAction =
  | {
      type: "start-round";
      trackId: string;
      startPositionMs: number;
      direction: RewardDirection | null;
      lyricsOnly: boolean;
      lyricsFrom: number;
    }
  /** The six, in the order they were shown; their titles come from the list. */
  | { type: "use-titles"; trackIds: readonly string[] }
  /** A rematch, which is played against the same track list. */
  | { type: "reset"; players: readonly GamePlayer[]; rules: GameRules }
  | Exclude<GameAction, { type: "start-round" } | { type: "use-titles" } | { type: "reset" }>;

export type LoggedEvent = {
  /**
   * Numbered by the client, from one.
   *
   * The client numbering rather than the server is what makes syncing safe to
   * retry: the server stores by (game, seq), so sending the same event twice
   * is the same as sending it once.
   */
  seq: number;
  /**
   * The client's own clock when it happened.
   *
   * Kept as the machine that was playing saw it, wrong clock and all; the
   * correction belongs to the sync, which can measure the skew.
   */
  at: number;
  action: LoggedAction;
};

/** What a game needs before its first event to exist at all. */
export type GameOrigin = {
  players: readonly GamePlayer[];
  rules: GameRules;
  /** Tracks this group had already heard when the game began. */
  playedIds: readonly string[];
};

/** Strips an action down to what has to be stored. */
export function compact(action: GameAction): LoggedAction {
  switch (action.type) {
    case "start-round":
      return {
        type: "start-round",
        trackId: action.track.id,
        startPositionMs: action.startPositionMs,
        direction: action.direction,
        lyricsOnly: action.lyricsOnly,
        lyricsFrom: action.lyricsFrom,
      };

    case "use-titles":
      return { type: "use-titles", trackIds: action.options.map((option) => option.trackId) };

    case "reset":
      return { type: "reset", players: action.players, rules: action.rules };

    default:
      return action;
  }
}

/**
 * Puts back what `compact` left out.
 *
 * Needs the state the action is about to be applied to, because the pool it
 * leaves behind depends on the pool it found — including the moment a pool runs
 * dry and the whole list comes round again.
 *
 * Answers null when the track list no longer holds a track the game was played
 * with, which is the one way a log can turn out not to be replayable.
 */
export function inflate(
  logged: LoggedAction,
  state: GameState,
  catalogue: readonly PooledTrack[],
): GameAction | null {
  const find = (id: string) => catalogue.find((track) => track.id === id) ?? null;

  switch (logged.type) {
    case "start-round": {
      const track = find(logged.trackId);

      if (!track) {
        return null;
      }

      // The draw this stands for took the track out of the pool it found, or
      // out of the whole list once that pool had emptied.
      const source = state.pool.length > 0 ? state.pool : catalogue;

      return {
        type: "start-round",
        track,
        startPositionMs: logged.startPositionMs,
        direction: logged.direction,
        lyricsOnly: logged.lyricsOnly,
        lyricsFrom: logged.lyricsFrom,
        pool: source.filter((candidate) => candidate.id !== track.id),
      };
    }

    case "use-titles": {
      const options: TitleOption[] = [];

      for (const trackId of logged.trackIds) {
        const track = find(trackId);

        if (!track) {
          return null;
        }

        options.push({ trackId: track.id, name: track.name });
      }

      return { type: "use-titles", options };
    }

    case "reset":
      return { type: "reset", players: logged.players, rules: logged.rules, tracks: catalogue };

    default:
      return logged;
  }
}

/**
 * The state a log leaves behind.
 *
 * Answers null when an event cannot be put back together, rather than a game
 * that is quietly missing a round.
 */
export function replay(
  origin: GameOrigin,
  catalogue: readonly PooledTrack[],
  events: readonly LoggedEvent[],
): GameState | null {
  let state = createGameState(origin.players, origin.rules, catalogue, origin.playedIds);

  for (const event of events) {
    const action = inflate(event.action, state, catalogue);

    if (!action) {
      return null;
    }

    state = gameReducer(state, action);
  }

  return state;
}
