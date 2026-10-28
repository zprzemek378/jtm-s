// The rules of a round, as a pure reducer.
//
// Anything random — which track plays, where the snippet starts — is decided by
// the caller and passed in with `StartRound`, so this module stays testable and
// free of side effects. Playback itself is driven by whoever reads the state.

import { balanceOf, createAccounts, type Accounts } from "@/helpers/money";
import type { PooledTrack } from "@/helpers/trackUnion";

import { drawDirection, type RewardDirection } from "./rewards";
import {
  GamePhase,
  SuspensionReason,
  Verdict,
  type GamePlayer,
  type GameRules,
  type PlayerId,
  type Suspension,
} from "./types";

export type GameState = {
  phase: GamePhase;
  round: number;
  players: readonly GamePlayer[];
  rules: GameRules;
  /** What each player has banked so far. */
  accounts: Accounts;
  /** Which way this round's stake moves; null when the mode has no direction. */
  direction: RewardDirection | null;
  /** The stake the buzzer stopped the counter at, or null if nobody has. */
  pendingAmount: number | null;
  /** Tracks not played yet; refilled by the caller when it empties. */
  pool: readonly PooledTrack[];
  /**
   * Every track heard so far, across this whole series of games. Carried
   * through a rematch and reloaded when the same playlists are picked again,
   * so a second game does not replay the first one's songs.
   */
  playedIds: readonly string[];
  track: PooledTrack | null;
  /** Players who still hold their extra time; empty when the modifier is off. */
  extraTimeLeft: readonly PlayerId[];
  /** This round shows the words instead of playing the music. */
  lyricsOnly: boolean;
  /** The line the words started from. */
  lyricsFrom: number;
  /**
   * How many lines stay on screen once the round stops revealing them — set
   * at the press, because the clock they were counted from restarts.
   */
  lyricsShown: number | null;
  /** Where the snippet started — the point playback resumes from. */
  startPositionMs: number;
  /** Who is sitting out the current round, and why. */
  suspension: Suspension | null;
  /** Who will sit out the next round, and why. */
  pendingSuspension: Suspension | null;
  /** Who pressed together, while the tie is on screen. */
  tiedPlayerIds: readonly PlayerId[];
  buzzedPlayerId: PlayerId | null;
  /** How the last answer was marked, for the screen that follows a verdict. */
  lastVerdict: { playerId: PlayerId; verdict: Verdict; amount: number } | null;
  winnerId: PlayerId | null;
};

export type GameAction =
  | {
      type: "start-round";
      track: PooledTrack;
      startPositionMs: number;
      pool: readonly PooledTrack[];
      /** Drawn by the caller, so the random mode stays out of the reducer. */
      direction: RewardDirection | null;
      /** True when this round shows the words instead of playing the music. */
      lyricsOnly: boolean;
      /** Which line of the file the round opens on. */
      lyricsFrom: number;
    }
  /** `amount` is the stake as it stood on screen at the moment of the press. */
  | {
      type: "buzz";
      playerId: PlayerId;
      amount: number;
      /** How many lines were on screen, on a round that was showing words. */
      lyricsShown: number | null;
    }
  /** Two or more were indistinguishable; the next round is theirs alone. */
  | { type: "tie"; playerIds: readonly PlayerId[] }
  | { type: "guess-window-elapsed" }
  /** The buzzed player spends their one lifeline. */
  | { type: "use-extra-time" }
  /** Their extra seconds are up; they answer now. */
  | {
      type: "extra-time-elapsed";
      /** Where the words got to, on a round that was showing them. */
      lyricsShown: number | null;
    }
  | { type: "reveal" }
  | { type: "judge"; verdict: Verdict }
  /** Edit mode: the host rewrites the standings and the line-up directly. */
  | {
      type: "apply-edit";
      accounts: Accounts;
      suspendedNext: readonly PlayerId[];
      /** The same players, with whatever names, colours and seating the host gave them. */
      players: readonly GamePlayer[];
    }
  | {
      type: "reset";
      players: readonly GamePlayer[];
      rules: GameRules;
      tracks: readonly PooledTrack[];
    };

export function createGameState(
  players: readonly GamePlayer[],
  rules: GameRules,
  tracks: readonly PooledTrack[],
  /** Tracks this group has already heard from the same playlists. */
  playedIds: readonly string[] = [],
): GameState {
  const unheard = tracks.filter((track) => !playedIds.includes(track.id));

  return {
    phase: GamePhase.Idle,
    round: 0,
    players,
    rules,
    accounts: createAccounts(players),
    // The opening round's direction, so the first count-in can announce it.
    direction: drawDirection(rules.mode, 1),
    pendingAmount: null,
    // A series that has already been through everything starts the cycle again
    // rather than refusing to play.
    pool: unheard.length > 0 ? unheard : tracks,
    playedIds: unheard.length > 0 ? playedIds : [],
    track: null,
    // One each, handed out at the start of the game and never replaced.
    extraTimeLeft: rules.extraTime ? players.map((player) => player.id) : [],
    lyricsOnly: false,
    lyricsFrom: 0,
    lyricsShown: null,
    startPositionMs: 0,
    suspension: null,
    pendingSuspension: null,
    tiedPlayerIds: [],
    buzzedPlayerId: null,
    lastVerdict: null,
    winnerId: null,
  };
}

/** Whether this player's key should do anything right now. */
export function canBuzz(state: GameState, playerId: PlayerId): boolean {
  return (
    state.phase === GamePhase.Listening &&
    state.buzzedPlayerId === null &&
    !(state.suspension?.playerIds.includes(playerId) ?? false)
  );
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "start-round": {
      if (state.phase === GamePhase.Finished) {
        return state;
      }

      // An empty pool means this draw came from a refill — everything has been
      // heard, so the history starts over with the track just drawn.
      const exhausted = state.pool.length === 0;

      return {
        ...state,
        playedIds: exhausted ? [action.track.id] : [...state.playedIds, action.track.id],
        phase: GamePhase.Listening,
        round: state.round + 1,
        track: action.track,
        lyricsOnly: action.lyricsOnly,
        lyricsFrom: action.lyricsFrom,
        lyricsShown: null,
        startPositionMs: action.startPositionMs,
        pool: action.pool,
        direction: action.direction,
        pendingAmount: null,
        buzzedPlayerId: null,
        lastVerdict: null,
        tiedPlayerIds: [],
        // Whatever was booked last round — a penalty, or a tie run-off that
        // shuts everyone else out — comes into force now.
        suspension: state.pendingSuspension,
        pendingSuspension: null,
      };
    }

    case "buzz": {
      if (!canBuzz(state, action.playerId)) {
        return state;
      }

      return {
        ...state,
        phase: GamePhase.Buzzed,
        buzzedPlayerId: action.playerId,
        // Frozen here: the player gets what the counter showed, not what it
        // would have shown a tick later. The words freeze with it — whatever
        // the room had to go on at the moment somebody pressed.
        pendingAmount: action.amount,
        lyricsShown: action.lyricsShown,
      };
    }

    case "tie": {
      if (state.phase !== GamePhase.Listening || state.buzzedPlayerId !== null) {
        return state;
      }

      // Nobody answers a tie. The round that follows is a run-off, so everyone
      // who did not press together sits it out.
      const others = state.players
        .map((player) => player.id)
        .filter((playerId) => !action.playerIds.includes(playerId));

      return {
        ...state,
        phase: GamePhase.Tied,
        tiedPlayerIds: action.playerIds,
        pendingSuspension:
          others.length > 0 ? { playerIds: others, reason: SuspensionReason.TieRunOff } : null,
      };
    }

    case "guess-window-elapsed": {
      if (state.phase !== GamePhase.Listening) {
        return state;
      }

      return { ...state, phase: GamePhase.TimedOut };
    }

    case "use-extra-time": {
      const playerId = state.buzzedPlayerId;

      // Only from the chair they pressed in, only once, and only while the
      // round is still waiting on them.
      if (
        state.phase !== GamePhase.Buzzed ||
        playerId === null ||
        !state.extraTimeLeft.includes(playerId)
      ) {
        return state;
      }

      return {
        ...state,
        phase: GamePhase.ExtraTime,
        extraTimeLeft: state.extraTimeLeft.filter((id) => id !== playerId),
      };
    }

    case "extra-time-elapsed":
      return state.phase === GamePhase.ExtraTime
        ? { ...state, phase: GamePhase.Buzzed, lyricsShown: action.lyricsShown }
        : state;

    case "reveal": {
      if (state.phase !== GamePhase.Buzzed) {
        return state;
      }

      return { ...state, phase: GamePhase.Revealed };
    }

    case "judge": {
      const playerId = state.buzzedPlayerId;
      const amount = state.pendingAmount ?? 0;

      if (state.phase !== GamePhase.Revealed || playerId === null) {
        return state;
      }

      // A verdict does not start the next round: it puts the answer on screen,
      // leaves the track playing and waits for the host, exactly like a round
      // nobody guessed.
      // Anything but a correct answer forfeits the stake; the money simply
      // never arrives. The ban is what separates a wrong answer from a near
      // miss the table decided to let go.
      if (action.verdict !== Verdict.Correct) {
        return {
          ...state,
          phase: GamePhase.Judged,
          buzzedPlayerId: null,
          lastVerdict: { playerId, verdict: action.verdict, amount },
          pendingSuspension:
            action.verdict === Verdict.Incorrect
              ? { playerIds: [playerId], reason: SuspensionReason.WrongAnswer }
              : null,
        };
      }

      const accounts = {
        ...state.accounts,
        [playerId]: balanceOf(state.accounts, playerId) + amount,
      };
      const hasWon = (accounts[playerId] ?? 0) >= state.rules.targetMoney;

      return {
        ...state,
        phase: hasWon ? GamePhase.Finished : GamePhase.Judged,
        accounts,
        buzzedPlayerId: null,
        lastVerdict: { playerId, verdict: Verdict.Correct, amount },
        pendingSuspension: null,
        winnerId: hasWon ? playerId : null,
      };
    }

    case "apply-edit": {
      // Only between rounds, where the hidden code is listened for anyway —
      // rewriting the standings mid-round would race the countdown.
      if (
        state.phase !== GamePhase.TimedOut &&
        state.phase !== GamePhase.Judged &&
        state.phase !== GamePhase.Tied
      ) {
        return state;
      }

      // Reaching the target ends the game however the money got there, so the
      // scoreboard can never show somebody past a target they have not won at.
      const winner =
        action.players.find(
          (player) => balanceOf(action.accounts, player.id) >= state.rules.targetMoney,
        ) ?? null;

      return {
        ...state,
        players: [...action.players],
        accounts: { ...action.accounts },
        pendingSuspension:
          action.suspendedNext.length > 0
            ? {
                playerIds: [...action.suspendedNext],
                reason: SuspensionReason.Manual,
              }
            : null,
        phase: winner ? GamePhase.Finished : state.phase,
        winnerId: winner ? winner.id : state.winnerId,
      };
    }

    case "reset":
      // A rematch keeps the history: the whole point is that a second game does
      // not replay the first one's songs.
      return createGameState(action.players, action.rules, action.tracks, state.playedIds);

    default:
      return state;
  }
}
