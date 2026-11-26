// What each verdict is worth, and who sits the next round out.
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { gameReducer } from "@/game/gameState";
import { GamePhase, Verdict } from "@/game/types";

import { ALA, buzzed } from "./support/game";

/** A round answered by Ala for `amount`, then marked `verdict`. */
function judged(verdict: Verdict, amount = 101) {
  return gameReducer(gameReducer(buzzed(amount), { type: "reveal" }), { type: "judge", verdict });
}

describe("judging an answer", () => {
  test("a correct one pays the whole stake and bans nobody", () => {
    const state = judged(Verdict.Correct);

    assert.equal(state.accounts[ALA.id], 101);
    assert.equal(state.pendingSuspension, null);
    assert.equal(state.lastVerdict?.amount, 101);
  });

  test("half pays half, rounded rather than truncated", () => {
    assert.equal(judged(Verdict.Half).accounts[ALA.id], 51);
  });

  test("half is not a wrong answer, so it bans nobody", () => {
    assert.equal(judged(Verdict.Half).pendingSuspension, null);
  });

  test("half reports what was won, not what was played for", () => {
    const state = judged(Verdict.Half);

    assert.equal(state.lastVerdict?.amount, 51);
    assert.equal(state.lastVerdict?.verdict, Verdict.Half);
  });

  test("a near miss pays nothing and still bans nobody", () => {
    const state = judged(Verdict.Close);

    assert.equal(state.accounts[ALA.id] ?? 0, 0);
    assert.equal(state.pendingSuspension, null);
  });

  test("a wrong one pays nothing and sits them out", () => {
    const state = judged(Verdict.Incorrect);

    assert.equal(state.accounts[ALA.id] ?? 0, 0);
    assert.deepEqual([...(state.pendingSuspension?.playerIds ?? [])], [ALA.id]);
  });

  test("half wins the game when half is enough", () => {
    const state = judged(Verdict.Half, 2000);

    assert.equal(state.accounts[ALA.id], 1000);
    assert.equal(state.phase, GamePhase.Finished);
    assert.equal(state.winnerId, ALA.id);
  });

  test("half of nothing is nothing, which must not read as a win", () => {
    const state = judged(Verdict.Half, 0);

    assert.equal(state.accounts[ALA.id] ?? 0, 0);
    assert.equal(state.phase, GamePhase.Judged);
    assert.equal(state.winnerId, null);
  });
});
