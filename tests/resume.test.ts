// Coming back to a game the tab was closed on.
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { compact, replay, type LoggedEvent } from "@/game/eventLog";
import { gameReducer, type GameAction, type GameState } from "@/game/gameState";
import { GamePhase, SuspensionReason, Verdict } from "@/game/types";

import { ALA, BO, RULES, SONG, buzzed, listening } from "./support/game";

const origin = { players: [ALA, BO], rules: RULES, playedIds: [] as readonly string[] };

/** The log of a game played up to `actions`, as the session would write it. */
function logOf(actions: readonly GameAction[]): readonly LoggedEvent[] {
  return actions.map((action, index) => ({
    seq: index + 1,
    at: 1000 + index,
    action: compact(action),
  }));
}

const firstRound: GameAction = {
  type: "start-round",
  track: SONG,
  startPositionMs: 0,
  pool: [],
  direction: null,
  lyricsOnly: false,
  lyricsFrom: 0,
};

describe("giving up on the round that was interrupted", () => {
  test("puts the game back where a round is started from", () => {
    const state = gameReducer(listening(), { type: "abandon-round" });

    assert.equal(state.phase, GamePhase.Idle);
    assert.equal(state.track, null);
  });

  test("the round never happened, so the next one takes its number", () => {
    const state = gameReducer(listening(), { type: "abandon-round" });

    assert.equal(state.round, 0);
    assert.equal(gameReducer(state, firstRound).round, 1);
  });

  test("nobody is paid and nobody is punished for it", () => {
    const state = gameReducer(buzzed(500), { type: "abandon-round" });

    assert.deepEqual(state.accounts, { [ALA.id]: 0, [BO.id]: 0 });
    assert.equal(state.buzzedPlayerId, null);
    assert.equal(state.pendingAmount, null);
    assert.equal(state.lastVerdict, null);
  });

  test("a ban being served in it is served in the round that replaces it", () => {
    // The ban the way the game makes one: a wrong answer, then the round after.
    const serving = (
      [
        { type: "buzz", playerId: BO.id, amount: 100, lyricsShown: null },
        { type: "reveal" },
        { type: "judge", verdict: Verdict.Incorrect },
        firstRound,
      ] satisfies GameAction[]
    ).reduce(gameReducer, listening());

    assert.deepEqual([...(serving.suspension?.playerIds ?? [])], [BO.id]);

    const state = gameReducer(serving, { type: "abandon-round" });

    assert.equal(state.suspension, null);
    assert.deepEqual([...(state.pendingSuspension?.playerIds ?? [])], [BO.id]);
    assert.equal(state.pendingSuspension?.reason, SuspensionReason.WrongAnswer);
  });

  test("a lifeline already spent in it stays spent", () => {
    const spent = gameReducer(buzzed(100, { extraTime: true }), { type: "use-extra-time" });
    const state = gameReducer(spent, { type: "abandon-round" });

    assert.deepEqual([...state.extraTimeLeft], [BO.id]);
  });

  test("between rounds there is nothing to give up on", () => {
    for (const settled of [
      gameReducer(listening(), { type: "guess-window-elapsed" }),
      gameReducer(gameReducer(buzzed(), { type: "reveal" }), {
        type: "judge",
        verdict: Verdict.Correct,
      }),
    ] satisfies GameState[]) {
      assert.equal(gameReducer(settled, { type: "abandon-round" }), settled);
    }
  });
});

describe("the state a resumed game comes back in", () => {
  const played = [
    firstRound,
    { type: "buzz", playerId: ALA.id, amount: 600, lyricsShown: null },
    { type: "reveal" },
    { type: "judge", verdict: Verdict.Half },
    { ...firstRound, startPositionMs: 90_000 },
    { type: "buzz", playerId: BO.id, amount: 200, lyricsShown: null },
  ] satisfies GameAction[];

  test("the standings are exactly what they were", () => {
    const state = replay(origin, [SONG], logOf(played));

    assert.equal(state?.accounts[ALA.id], 300);
    assert.equal(state?.phase, GamePhase.Buzzed);
  });

  test("a round that was only being listened to is the one that is given up", () => {
    // What the session does on arrival: the state it comes back in decides
    // whether the round can be carried on at all.
    const listening = replay(origin, [SONG], logOf([firstRound]));
    const buzzed = replay(origin, [SONG], logOf(played));

    assert.equal(listening?.phase, GamePhase.Listening, "nobody had answered yet");
    assert.equal(buzzed?.phase, GamePhase.Buzzed, "somebody had");

    assert.ok(listening);
    assert.equal(gameReducer(listening, { type: "abandon-round" }).phase, GamePhase.Idle);
    // And the other one is left alone, because the answer still counts: the
    // session only gives up a round the room was still listening to.
    assert.ok(buzzed);
    assert.equal(gameReducer(buzzed, { type: "reveal" }).phase, GamePhase.Revealed);
  });

  test("and the interrupted round is seen off as its own event", () => {
    // What the session does on arrival: replay, then give up on the round the
    // tab was closed in the middle of — so the log still says what the screen
    // shows.
    const resumed = replay(origin, [SONG], logOf(played));

    assert.ok(resumed);

    const carried = gameReducer(resumed, { type: "abandon-round" });
    const written = replay(origin, [SONG], logOf([...played, { type: "abandon-round" }]));

    assert.deepEqual(written, carried);
    assert.equal(written?.phase, GamePhase.Idle);
    assert.equal(written?.accounts[ALA.id], 300);
    assert.equal(written?.round, 1, "the round nobody finished does not count");
  });
});
