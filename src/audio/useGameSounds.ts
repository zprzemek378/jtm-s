// Turning what the game does into what the table hears.
//
// Kept apart from the game's own logic: the rules decide what happens, this
// decides what it sounds like, and neither needs to know much about the other.

import { useEffect, useRef } from "react";

import { SoundEvent } from "@/constants/soundChoices";
import { GamePhase, Verdict } from "@/game/types";
import type { GameSession } from "@/game/useGameSession";

import { playSound, stopCutShortSounds, stopSound } from "./player";

/**
 * The cue a phase announces itself with, where it has one.
 *
 * Buzzing is missing on purpose: `Buzzed` only arrives once the window for
 * simultaneous presses has closed, so a cue hung on it would land after the
 * press rather than on it. The session sounds that one from the press itself.
 */
function cueForPhase(phase: GamePhase, verdict: Verdict | null): SoundEvent | null {
  switch (phase) {
    case GamePhase.Listening:
      return SoundEvent.RoundStart;
    case GamePhase.Tied:
      return SoundEvent.Tie;
    case GamePhase.TimedOut:
      return SoundEvent.TimeUp;
    case GamePhase.Finished:
      return SoundEvent.GameOver;
    case GamePhase.Judged:
      // A near miss costs the same money as a wrong answer, so it sounds the
      // same; only the penalty differs, and the screen says that.
      return verdict === Verdict.Correct ? SoundEvent.Correct : SoundEvent.Incorrect;
    default:
      return null;
  }
}

export function useGameSounds(session: GameSession): void {
  const { state, preRollActive } = session;
  const previousPhaseRef = useRef<GamePhase | null>(null);
  const startedRef = useRef(false);

  // The game beginning is not a phase — it is arriving here at all, which
  // happens once, just after the playlists are confirmed.
  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;
    playSound(SoundEvent.GameStart);
  }, []);

  useEffect(() => {
    if (previousPhaseRef.current === state.phase) {
      return;
    }

    const leaving = previousPhaseRef.current;
    previousPhaseRef.current = state.phase;

    // The music is starting, so the count-in has served its purpose.
    if (state.phase === GamePhase.Listening) {
      stopSound(SoundEvent.Countdown);
    }

    // Leaving the results, either for a rematch or back to the settings.
    if (leaving === GamePhase.Finished) {
      stopSound(SoundEvent.GameOver);
    }

    const cue = cueForPhase(state.phase, state.lastVerdict?.verdict ?? null);

    if (cue) {
      playSound(cue);
    }
  }, [state.lastVerdict, state.phase]);

  // One sound for the whole count-in rather than one per tick: the sounds for
  // this moment are a few seconds of ticking, not a single beep.
  useEffect(() => {
    if (preRollActive) {
      playSound(SoundEvent.Countdown);
    }
  }, [preRollActive]);

  // Closing the game screen takes its lingering cues with it.
  useEffect(() => stopCutShortSounds, []);
}
