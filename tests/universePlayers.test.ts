// A universe player's identity inside a game.
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { universePlayerId } from "@/game/universePlayers";

describe("a universe player in a game", () => {
  test("is known by their number, which is theirs for ever", () => {
    assert.equal(universePlayerId({ number: 7 }), "u7");
  });

  test("so a rename changes nothing about who played", () => {
    assert.equal(universePlayerId({ number: 3 }), universePlayerId({ number: 3 }));
  });

  test("and two of them are never confused for each other", () => {
    assert.notEqual(universePlayerId({ number: 1 }), universePlayerId({ number: 11 }));
  });
});
