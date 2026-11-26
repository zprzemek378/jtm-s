// Building a game to assert about.
//
// The reducer needs players, rules and a pool before it will do anything, and
// most suites care about one of those at a time — so the rest are made here
// once, in the shape the game actually uses.

import { createGameState, gameReducer, type GameState } from "@/game/gameState";
import { DEFAULT_REWARD_MODE } from "@/game/rewards";
import type { GamePlayer, GameRules } from "@/game/types";
import type { PooledTrack } from "@/helpers/trackUnion";

export const ALA: GamePlayer = { id: "a", name: "Ala", keyCode: "KeyA", colour: "#22c365" };
export const BO: GamePlayer = { id: "b", name: "Bo", keyCode: "KeyB", colour: "#2273c3" };

export const RULES: GameRules = {
  roundDurationMs: 30_000,
  answerDurationMs: 10_000,
  targetMoney: 1000,
  mode: DEFAULT_REWARD_MODE,
  tieThresholdMs: null,
  lyricsOnly: null,
  extraTime: false,
  titles: false,
};

export function track(id: string, playlistIds: readonly string[] = ["p1"]): PooledTrack {
  return {
    id,
    uri: `spotify:track:${id}`,
    name: `Song ${id}`,
    artists: "Someone",
    durationMs: 200_000,
    albumName: "Album",
    albumImageUrl: null,
    playlistNames: playlistIds.map((playlist) => `Playlist ${playlist}`),
    playlistIds: [...playlistIds],
  };
}

export const SONG = track("t1");

/** A game with the round already playing, which is where most of them start. */
export function listening(rules: Partial<GameRules> = {}, players: GamePlayer[] = [ALA, BO]) {
  const state = createGameState(players, { ...RULES, ...rules }, [SONG]);

  return gameReducer(state, {
    type: "start-round",
    track: SONG,
    startPositionMs: 0,
    pool: [],
    direction: null,
    lyricsOnly: false,
    lyricsFrom: 0,
  });
}

/** The same, with Ala buzzed in and the stake frozen at `amount`. */
export function buzzed(amount = 100, rules: Partial<GameRules> = {}): GameState {
  return gameReducer(listening(rules), {
    type: "buzz",
    playerId: ALA.id,
    amount,
    lyricsShown: null,
  });
}
