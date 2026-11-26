// Extra time, the first lifeline: one each, spendable only from the chair that
// pressed, and only while the round is still waiting on that player.
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { createGameState, gameReducer } from "@/game/gameState";
import { GamePhase } from "@/game/types";

import { ALA, BO, RULES, SONG, buzzed, listening } from "./support/game";

const withLifelines = { extraTime: true };

/** Ala buzzed in and spent her extra time. */
function spent(lyricsShown: number | null = null) {
  const state = gameReducer(listening(withLifelines), {
    type: "buzz",
    playerId: ALA.id,
    amount: 100,
    lyricsShown,
  });

  return gameReducer(state, { type: "use-extra-time" });
}

describe("handing them out", () => {
  test("every player gets one when the game has them", () => {
    const state = createGameState([ALA, BO], { ...RULES, ...withLifelines }, [SONG]);

    assert.deepEqual([...state.extraTimeLeft], [ALA.id, BO.id]);
  });

  test("and none when it does not", () => {
    assert.deepEqual([...createGameState([ALA, BO], RULES, [SONG]).extraTimeLeft], []);
  });
});

describe("spending one", () => {
  test("takes the round out of the answer window and into extra time", () => {
    assert.equal(spent().phase, GamePhase.ExtraTime);
  });

  test("costs only the player who pressed", () => {
    assert.deepEqual([...spent().extraTimeLeft], [BO.id]);
  });

  test("cannot be done twice", () => {
    const after = gameReducer(spent(), { type: "extra-time-elapsed", lyricsShown: null });
    const again = gameReducer(after, { type: "use-extra-time" });

    assert.equal(again.phase, GamePhase.Buzzed);
    assert.deepEqual([...again.extraTimeLeft], [BO.id]);
  });

  test("is refused while the round is still being listened to", () => {
    const state = listening(withLifelines);

    assert.equal(gameReducer(state, { type: "use-extra-time" }), state);
  });

  test("is refused once the answer has been revealed", () => {
    const revealed = gameReducer(buzzed(100, withLifelines), { type: "reveal" });

    assert.equal(gameReducer(revealed, { type: "use-extra-time" }), revealed);
  });
});

describe("when the extra seconds run out", () => {
  const back = gameReducer(spent(4), { type: "extra-time-elapsed", lyricsShown: 7 });

  test("the round goes back to waiting on the same player", () => {
    assert.equal(back.phase, GamePhase.Buzzed);
    assert.equal(back.buzzedPlayerId, ALA.id);
  });

  test("the words carried on while it ran", () => {
    assert.equal(back.lyricsShown, 7);
  });

  test("and the host can reveal from there, as from any buzz", () => {
    assert.equal(gameReducer(back, { type: "reveal" }).phase, GamePhase.Revealed);
  });
});

describe("the next round", () => {
  test("neither returns a spent lifeline nor takes anybody else's", () => {
    const next = gameReducer(spent(), {
      type: "start-round",
      track: SONG,
      startPositionMs: 0,
      pool: [],
      direction: null,
      lyricsOnly: false,
      lyricsFrom: 0,
    });

    assert.deepEqual([...next.extraTimeLeft], [BO.id]);
  });
});
