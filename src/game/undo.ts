// Taking a move back.
//
// The log makes this possible at all: cut it short, replay it, and the game is
// where it was. What a "move" is, though, is not one event. Undoing a verdict
// should leave the answer on screen waiting to be judged again — but undoing
// from there has to carry on past the press and the round's start to the end of
// the round before, because none of those are states a game can sit in: a
// countdown would restart over music that is not playing, and before the first
// round the game would count the table in behind the dialog the host is
// standing in.
//
// So a move is "as far back as it takes to reach somewhere the game can wait".

import { UNDO_STEPS } from "@/constants/gameRules";
import type { PooledTrack } from "@/helpers/trackUnion";

import { replay, type GameOrigin, type LoggedEvent } from "./eventLog";
import type { GameState } from "./gameState";
import { GamePhase } from "./types";

/** A game kept well enough to be replayed. */
export type ReplayableGame = {
  origin: GameOrigin;
  catalogue: readonly PooledTrack[];
  events: readonly LoggedEvent[];
};

/** Where the log would be cut, and the state that leaves. */
export type UndoTarget = {
  /** The last event kept; zero when the whole log goes. */
  seq: number;
  state: GameState;
};

/**
 * Phases the game can simply sit in: no clock running, nothing in flight,
 * waiting on the host or on the player who buzzed.
 */
export function canSitIn(phase: GamePhase): boolean {
  return (
    phase === GamePhase.Revealed ||
    phase === GamePhase.Titles ||
    phase === GamePhase.TimedOut ||
    phase === GamePhase.Judged ||
    phase === GamePhase.Tied ||
    phase === GamePhase.Finished
  );
}

/**
 * The move before this one, or null when there is nothing to go back to.
 *
 * Always at least one event shorter than what it was given, so repeated undos
 * walk backwards rather than settling on the state they started from.
 *
 * @param taken How many moves have already been taken back. Five is as far as
 *   this goes: deep enough to undo a verdict given to the wrong player and the
 *   round it was given in, shallow enough that nobody can quietly rewind the
 *   evening.
 */
export function previousMove(game: ReplayableGame | null, taken = 0): UndoTarget | null {
  if (!game || taken >= UNDO_STEPS) {
    return null;
  }

  for (let kept = game.events.length - 1; kept >= 0; kept -= 1) {
    const before = game.events.slice(0, kept);
    const state = replay(game.origin, game.catalogue, before);

    if (state && canSitIn(state.phase)) {
      return { seq: before[before.length - 1]?.seq ?? 0, state };
    }
  }

  return null;
}
