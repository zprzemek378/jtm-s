// Wires the pure round rules to real playback: draws a track, starts it at a
// random point, and pauses or resumes Spotify as the phase changes.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { playSound } from "@/audio/player";
import { SoundEvent } from "@/constants/soundChoices";
import {
  BUZZ_COLLECTION_MAX_MS,
  BUZZ_COLLECTION_MS,
  EXTRA_TIME_MS,
  PRE_ROLL_MS,
} from "@/constants/gameRules";
import { useBuzzerKeys } from "@/hooks/useBuzzerKeys";
import { useCountdown } from "@/hooks/useCountdown";
import { drawFromPool } from "@/helpers/trackPool";
import { pickSnippetStartMs } from "@/helpers/snippet";
import type { Accounts } from "@/helpers/money";
import type { PooledTrack } from "@/helpers/trackUnion";
import type { LyricsReadout } from "@/lyrics/types";
import { useLyrics } from "@/lyrics/useLyrics";
import { useSpotify } from "@/spotify/useSpotify";

import { createGameState, gameReducer, type GameState } from "./gameState";
import { readPlayedTracks, writePlayedTracks } from "./playHistory";
import { lyricLinesFor, openingLine, visibleLineCount } from "./lyricsRound";
import { FREQUENCY_CHANCE } from "./modifiers";
import { drawDirection, moneyAt, type RewardDirection } from "./rewards";
import { canBuzz } from "./gameState";
import { resolveBuzz, type BuzzEntry } from "./tie";
import { GamePhase, type GamePlayer, type GameRules, type PlayerId, type Verdict } from "./types";

export type GameSession = {
  state: GameState;
  /**
   * The words for the track in play, asked for as the count-in starts so a
   * round that means to show them has them in hand before it opens.
   */
  lyrics: LyricsReadout;
  /** Milliseconds left in the guessing window; full while not listening. */
  guessRemainingMs: number;
  /** True while a track is being started on the Spotify device. */
  loadingTrack: boolean;
  /** Set when starting a track failed, so the host can retry instead of waiting. */
  startFailed: boolean;
  /** True from the moment the host starts a round until the music is playing. */
  preRollActive: boolean;
  /** Milliseconds left of the "get ready" countdown. */
  preRollRemainingMs: number;
  /** The stake as it stands right now — what a buzz would capture. */
  currentMoney: number;
  buzz: (playerId: PlayerId, at: number) => void;
  reveal: () => void;
  judge: (verdict: Verdict) => void;
  /** Milliseconds left of the extra time a lifeline bought. */
  extraTimeRemainingMs: number;
  /** Whether the player who buzzed can still spend a lifeline. */
  canUseExtraTime: boolean;
  /** Spends it: the music plays on, and nobody else may press. */
  useExtraTime: () => void;
  /** Counts the table in, then plays the next track. */
  nextRound: () => void;
  /** Starts over with the same players, target and playlist. */
  restart: () => void;
  /** Edit mode: rewrites the standings and the line-up between rounds. */
  applyEdit: (
    accounts: Accounts,
    suspendedNext: readonly PlayerId[],
    players: readonly GamePlayer[],
  ) => void;
};

export function useGameSession(
  players: readonly GamePlayer[],
  rules: GameRules,
  tracks: readonly PooledTrack[],
  /**
   * Identifies the playlist selection, so a series of games played on the same
   * playlists keeps its history — and a different selection starts afresh.
   */
  historyKey: string,
): GameSession {
  const { playTrackAt, pause, resume, silence } = useSpotify();
  const [state, dispatch] = useReducer(
    gameReducer,
    undefined,
    // Seeded from storage, so returning to the setup screen and starting again
    // does not bring the already-heard songs back.
    () => createGameState(players, rules, tracks, readPlayedTracks(historyKey)),
  );

  useEffect(() => {
    writePlayedTracks(historyKey, state.playedIds);
  }, [historyKey, state.playedIds]);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  /**
   * Identifies the current "get ready" countdown, or null when none is running.
   * A fresh number each time, so a new count-in always starts from the top.
   */
  const [preRollKey, setPreRollKey] = useState<number | null>(null);
  const preRollCounterRef = useRef(0);
  /** Stops the auto-advance effect from starting two rounds at once. */
  const startingRef = useRef(false);
  /**
   * The track for the round about to start, drawn when the count-in begins.
   *
   * Drawn that early for one reason: the words have to be fetched and read
   * before the round opens, because whether there are any decides what kind of
   * round it is. Three seconds of counting in is the time that buys.
   */
  const [pending, setPending] = useState<{
    track: PooledTrack;
    startPositionMs: number;
    direction: RewardDirection | null;
    pool: readonly PooledTrack[];
  } | null>(null);

  const lyrics = useLyrics(pending?.track ?? state.track, true);
  /**
   * The same readout, for the moment the count-in runs out.
   *
   * Starting a round must not be rebuilt every time the lookup moves a step,
   * or the count-in would be left holding a stale one.
   */
  const lyricsRef = useRef(lyrics);

  useEffect(() => {
    lyricsRef.current = lyrics;
  }, [lyrics]);

  const startRound = useCallback(async () => {
    if (startingRef.current) {
      return;
    }

    startingRef.current = true;
    setLoadingTrack(true);
    setStartFailed(false);

    try {
      const draw = pending;

      // Nothing at all to play. Reported as a failed start so the screen waits
      // for the host: the count-in that led here fires whenever the game is
      // idle, so returning quietly would loop it for ever.
      if (!draw) {
        setStartFailed(true);

        return;
      }

      // The words stand in for the music only when there are enough of them.
      // A track the database has nothing for simply plays, rather than being
      // passed over for one that happens to be written down somewhere.
      const lines = lyricLinesFor(lyricsRef.current);
      const lyricsOnly =
        rules.lyricsOnly !== null &&
        lines !== null &&
        Math.random() < FREQUENCY_CHANCE[rules.lyricsOnly];

      if (lyricsOnly) {
        // A round of words has to begin in silence, and the count-in's pause
        // was three seconds ago: somebody may have put something on from their
        // own phone since, which only the account-wide stop can reach.
        await silence();
      } else {
        // Playback starts first, so the countdown on screen matches the music.
        await playTrackAt(draw.track.uri, draw.startPositionMs);
      }

      dispatch({
        type: "start-round",
        track: draw.track,
        startPositionMs: draw.startPositionMs,
        pool: draw.pool,
        direction: draw.direction,
        lyricsOnly,
        // Anywhere in the song, as long as what follows lasts the round.
        lyricsFrom: lyricsOnly && lines ? openingLine(lines.length) : 0,
      });
      setPending(null);
    } catch {
      // Spotify can refuse to play — the account started listening elsewhere,
      // or the device dropped out. Let the host retry rather than sit on a
      // spinner that will never resolve.
      setStartFailed(true);
    } finally {
      setLoadingTrack(false);
      setPreRollKey(null);
      startingRef.current = false;
    }
  }, [pending, playTrackAt, rules.lyricsOnly, silence]);

  const preRollRemainingMs = useCountdown({
    durationMs: PRE_ROLL_MS,
    active: preRollKey !== null,
    runKey: preRollKey ?? -1,
    onElapsed: useCallback(() => {
      void startRound();
    }, [startRound]),
  });

  const nextRound = useCallback(() => {
    // A timed-out round leaves its track playing, so it has to be silenced
    // before the count-in — otherwise the old song runs under "3, 2, 1".
    void pause();

    // Drawn now rather than when the count-in ends: looking the words up takes
    // a moment, and the round cannot decide what it is until that is answered.
    const draw = drawFromPool(state.pool, tracks);

    setPending(
      draw
        ? {
            track: draw.item,
            startPositionMs: pickSnippetStartMs(draw.item.durationMs),
            // Drawn out here, so the random mode never reaches the reducer.
            direction: drawDirection(rules.mode, state.round + 1),
            pool: draw.remaining,
          }
        : null,
    );

    // This only counts the table in; the round begins when it runs out.
    preRollCounterRef.current += 1;
    setPreRollKey(preRollCounterRef.current);
  }, [pause, rules.mode, state.pool, state.round, tracks]);

  // `idle` means a game that has been set up but has not played a round yet —
  // the opening round and a rematch. Both are counted in, exactly like every
  // later round, so nobody is caught out by the first song of the evening.
  // Every other round is started by the host, from the timed-out or the verdict
  // screen; a failed attempt waits for the host too, so this cannot spin.
  useEffect(() => {
    if (state.phase === GamePhase.Idle && !startFailed && preRollKey === null) {
      // oxlint-disable-next-line react/set-state-in-effect
      nextRound();
    }
  }, [nextRound, preRollKey, startFailed, state.phase]);

  /**
   * Starts the song a round played on words alone never played.
   *
   * However that round ended — answered, timed out or tied — the screen that
   * follows names the track and plays it, like every other end of a round.
   * Answers false when there was nothing to make up for.
   */
  const playAfterSilentRound = useCallback(() => {
    if (!state.lyricsOnly || !state.track) {
      return false;
    }

    void playTrackAt(state.track.uri, state.startPositionMs);

    return true;
  }, [playTrackAt, state.lyricsOnly, state.startPositionMs, state.track]);

  const guessRemainingMs = useCountdown({
    durationMs: rules.roundDurationMs,
    active: state.phase === GamePhase.Listening,
    runKey: state.round,
    onElapsed: useCallback(() => {
      dispatch({ type: "guess-window-elapsed" });
      playAfterSilentRound();
    }, [playAfterSilentRound]),
  });

  /**
   * How many lines are on screen right now, on a round that is showing words.
   *
   * Counted from the same clock the stake is, so what a player captures and
   * what they had to go on are the same moment.
   */
  const shownLines = state.lyricsOnly
    ? visibleLineCount(rules.roundDurationMs - guessRemainingMs)
    : null;

  // Derived from the very value the screen is showing, so a player captures
  // exactly the figure they were looking at when they hit their key.
  const currentMoney = moneyAt(
    state.direction,
    rules.roundDurationMs - guessRemainingMs,
    rules.roundDurationMs,
  );

  /**
   * Presses in flight, waiting to be judged against the tie threshold. Held in
   * a ref because they arrive between renders and must not trigger any.
   */
  const burstRef = useRef<{
    entries: BuzzEntry[];
    amount: number;
    timer: number;
    openedAt: number;
    resolve: () => void;
  } | null>(null);

  useEffect(
    () => () => {
      if (burstRef.current) {
        clearTimeout(burstRef.current.timer);
        burstRef.current = null;
      }
    },
    [],
  );

  /**
   * How long to gather presses for. One keyboard poll is enough for genuinely
   * simultaneous presses; a larger threshold needs a correspondingly larger
   * window, or the rule would be cut short by the mechanism rather than by the
   * number the host chose.
   */
  const collectionMs = Math.min(
    BUZZ_COLLECTION_MAX_MS,
    Math.max(BUZZ_COLLECTION_MS, (rules.tieThresholdMs ?? 0) + BUZZ_COLLECTION_MS),
  );

  const buzz = useCallback(
    (playerId: PlayerId, at: number) => {
      // Ties switched off: the first press wins outright, as it always did.
      if (rules.tieThresholdMs === null) {
        playSound(SoundEvent.Buzz);
        dispatch({ type: "buzz", playerId, amount: currentMoney, lyricsShown: shownLines });

        return;
      }

      // A player sitting the round out must not be able to drag anyone into a
      // tie: the reducer refuses their buzz, so their press cannot count here
      // either.
      if (!canBuzz(state, playerId)) {
        return;
      }

      const burst = burstRef.current;

      if (burst) {
        burst.entries.push({ playerId, at });

        // Each further press restarts the window, so a chain of presses can
        // keep growing — the same rule the tie itself follows. The cap stops
        // somebody hammering a key from holding the round open for ever.
        if (performance.now() - burst.openedAt < BUZZ_COLLECTION_MAX_MS) {
          clearTimeout(burst.timer);
          burst.timer = window.setTimeout(burst.resolve, collectionMs);
        }

        return;
      }

      // Sounded from the press itself rather than from the phase it eventually
      // produces. The phase waits for the collection window to close — which is
      // the point of that window — and the room should hear the buzz the moment
      // somebody hits their key, not once the tie has been worked out.
      playSound(SoundEvent.Buzz);

      // The threshold is a fraction of a millisecond, so it cannot be waited
      // out. Instead the presses are gathered for one keyboard poll and then
      // compared by their own timestamps.
      const entries: BuzzEntry[] = [{ playerId, at }];
      const amount = currentMoney;
      const shown = shownLines;
      const resolve = () => {
        burstRef.current = null;

        // Resolved from the array this closure owns rather than from the ref:
        // if anything ever clears or replaces the ref mid-window, the presses
        // already collected still count.
        const outcome = resolveBuzz(entries, rules.tieThresholdMs);

        if (outcome?.kind === "tie") {
          dispatch({ type: "tie", playerIds: outcome.playerIds });
          playAfterSilentRound();
        } else if (outcome?.kind === "single") {
          dispatch({ type: "buzz", playerId: outcome.playerId, amount, lyricsShown: shown });
        }
      };

      // The stake is frozen at the first press, not at the end of the window.
      burstRef.current = {
        entries,
        amount,
        timer: window.setTimeout(resolve, collectionMs),
        openedAt: performance.now(),
        resolve,
      };
    },
    [collectionMs, currentMoney, playAfterSilentRound, rules.tieThresholdMs, shownLines, state],
  );

  // Only a buzz stops the music. When the window simply runs out the track
  // keeps playing under the revealed title, so the table hears the song they
  // failed to name — it stops on its own when the next round starts.
  useEffect(() => {
    if (state.phase === GamePhase.Buzzed) {
      void pause();
    }
  }, [pause, state.phase]);

  useEffect(() => {
    if (state.phase === GamePhase.Finished) {
      void pause();
    }
  }, [pause, state.phase]);

  /**
   * How many lines the words have reached, counting the seconds a lifeline
   * added on a round that is showing them.
   */
  const linesWithExtraTime = useCallback(
    (elapsedMs: number) =>
      state.lyricsShown === null ? null : state.lyricsShown + visibleLineCount(elapsedMs) - 1,
    [state.lyricsShown],
  );

  const extraTimeRemainingMs = useCountdown({
    durationMs: EXTRA_TIME_MS,
    active: state.phase === GamePhase.ExtraTime,
    runKey: `${state.round}-extra-time`,
    onElapsed: useCallback(() => {
      // Silence again, and the answer window starts over: they have had their
      // extra listen and now owe the table an answer.
      void pause();
      dispatch({ type: "extra-time-elapsed", lyricsShown: linesWithExtraTime(EXTRA_TIME_MS) });
    }, [linesWithExtraTime, pause]),
  });

  const canUseExtraTime =
    state.phase === GamePhase.Buzzed &&
    state.buzzedPlayerId !== null &&
    state.extraTimeLeft.includes(state.buzzedPlayerId);

  const useExtraTime = useCallback(() => {
    if (!canUseExtraTime) {
      return;
    }

    dispatch({ type: "use-extra-time" });

    // A round played on words alone has no music to turn back on; its extra
    // seconds are extra lines instead, which the screen counts out on its own.
    if (!state.lyricsOnly) {
      void resume();
    }
  }, [canUseExtraTime, resume, state.lyricsOnly]);

  const reveal = useCallback(() => {
    dispatch({ type: "reveal" });

    if (!playAfterSilentRound()) {
      // Picks the snippet up where it was paused.
      void resume();
    }
  }, [playAfterSilentRound, resume]);

  const judge = useCallback((verdict: Verdict) => {
    // The track plays on under the verdict, as it does when nobody guessed;
    // `nextRound` is what silences it.
    dispatch({ type: "judge", verdict });
  }, []);

  const restart = useCallback(() => {
    // A rematch keeps whatever edit mode made of the line-up — the names,
    // colours and seating are the table's, not the game's.
    dispatch({ type: "reset", players: state.players, rules, tracks });
  }, [rules, state.players, tracks]);

  const applyEdit = useCallback(
    (accounts: Accounts, suspendedNext: readonly PlayerId[], players: readonly GamePlayer[]) => {
      dispatch({ type: "apply-edit", accounts, suspendedNext, players });
    },
    [],
  );

  useBuzzerKeys(state.players, state.phase === GamePhase.Listening, buzz);

  return {
    state,
    lyrics,
    guessRemainingMs,
    extraTimeRemainingMs,
    canUseExtraTime,
    useExtraTime,
    loadingTrack,
    startFailed,
    preRollActive: preRollKey !== null,
    preRollRemainingMs,
    currentMoney,
    buzz,
    reveal,
    judge,
    nextRound,
    restart,
    applyEdit,
  };
}
