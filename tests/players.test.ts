// Players: their colours, and what becomes of a line-up stored by an older
// version of the game.
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { MAX_PLAYERS } from "@/constants/gameRules";
import { PLAYER_COLOURS, nextFreeColour, normaliseColour } from "@/constants/players";
import { createPlayerDraft, normaliseSetup } from "@/game/rules";
import { moveItem } from "@/helpers/list";
import { toGamePlayers } from "@/helpers/playerSetup";

const name = (index: number) => `Player ${index + 1}`;

describe("normaliseColour", () => {
  test("stores a colour in one spelling", () => {
    assert.equal(normaliseColour("#1A2B3C"), "#1a2b3c");
    assert.equal(normaliseColour(" #abc "), "#aabbcc");
  });

  test("refuses what this app cannot paint with", () => {
    for (const value of ["red", "#12345", undefined, Number.NaN]) {
      assert.equal(normaliseColour(value), null, String(value));
    }
  });

  test("reads a stored hue from the version that kept them in degrees", () => {
    assert.equal(normaliseColour(145), PLAYER_COLOURS[0]);
    assert.equal(normaliseColour(210), PLAYER_COLOURS[1]);
    assert.equal(normaliseColour(-150), PLAYER_COLOURS[1], "degrees come round the wheel");
  });
});

describe("nextFreeColour", () => {
  test("hands out the suggestions first", () => {
    assert.equal(nextFreeColour([]), PLAYER_COLOURS[0]);
    assert.equal(nextFreeColour([PLAYER_COLOURS[0], PLAYER_COLOURS[1]]), PLAYER_COLOURS[2]);
  });

  test("gives a full table a colour each, suggestions or not", () => {
    const taken: string[] = [];

    for (let seat = 0; seat < MAX_PLAYERS; seat += 1) {
      const colour = nextFreeColour(taken);

      assert.match(colour, /^#[0-9a-f]{6}$/, `seat ${seat + 1} got ${colour}`);
      assert.ok(!taken.includes(colour), `seat ${seat + 1} repeated a colour`);
      taken.push(colour);
    }

    assert.equal(new Set(taken).size, MAX_PLAYERS);
    assert.deepEqual(taken.slice(0, PLAYER_COLOURS.length), [...PLAYER_COLOURS]);
  });

  test("a new draft arrives with one", () => {
    assert.match(createPlayerDraft([]).colour, /^#[0-9a-f]{6}$/);
  });
});

describe("a line-up stored by an older version", () => {
  const setup = normaliseSetup({
    players: [
      { id: "1", name: "Ala", keyCode: "KeyA" },
      { id: "2", name: "Bo", keyCode: "KeyB" },
      { id: "3", name: "Cy", keyCode: "KeyC", hue: 210 },
    ],
    targetMoney: 1000,
    roundSeconds: 30,
    answerSeconds: 10,
    mode: "rising",
  });

  test("keeps the colour its position used to give it", () => {
    assert.equal(setup.players[0].colour, PLAYER_COLOURS[0]);
    assert.equal(setup.players[1].colour, PLAYER_COLOURS[1]);
  });

  test("keeps the colour a stored hue drew", () => {
    assert.equal(setup.players[2].colour, PLAYER_COLOURS[1]);
  });

  test("leaves the keys alone", () => {
    assert.equal(setup.players[0].keyCode, "KeyA");
  });
});

describe("taking a line-up into a game", () => {
  const drafts = [
    { id: "1", name: "Ala", keyCode: "KeyA", colour: "#123456" },
    { id: "2", name: "", keyCode: "KeyB", colour: "#abcdef" },
  ];

  test("names fall back to the seat, colours do not", () => {
    const players = toGamePlayers(drafts, name);

    assert.deepEqual(
      players?.map((player) => [player.name, player.colour]),
      [
        ["Ala", "#123456"],
        ["Player 2", "#abcdef"],
      ],
    );
  });

  test("moving a slot moves the player, and a named one keeps their name", () => {
    const reseated = toGamePlayers(moveItem(drafts, 1, 0), name);

    assert.deepEqual(
      reseated?.map((player) => player.id),
      ["2", "1"],
    );
    assert.equal(reseated?.[1].name, "Ala");
  });
});
