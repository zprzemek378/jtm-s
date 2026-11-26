// A universe player's identity inside a game.
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { universeNumberOf, universePlayerId } from "@/game/universePlayers";

describe("a universe player in a game", () => {
  test("is known by their number, which is theirs for ever", () => {
    assert.equal(universePlayerId({ number: 7 }), "u7");
    assert.equal(universeNumberOf("u7"), 7);
  });

  test("so a rename changes nothing about who played", () => {
    const before = universePlayerId({ number: 3 });

    assert.equal(before, universePlayerId({ number: 3 }));
  });

  test("somebody simply typed in on the setup screen is nobody from a universe", () => {
    for (const id of [crypto.randomUUID(), "u", "ux", "7", "u7x", ""]) {
      assert.equal(universeNumberOf(id), null, id);
    }
  });
});
