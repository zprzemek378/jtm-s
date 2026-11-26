// Six titles, the second lifeline: the right one is always among them, the
// wrong ones come from the same playlists while there are enough, and picking
// one answers the round outright.
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { createGameState, gameReducer } from "@/game/gameState";
import { pickTitleOptions } from "@/game/titleChoice";
import { GamePhase, Verdict } from "@/game/types";

import { ALA, BO, RULES, SONG, listening, track } from "./support/game";

const correct = track("c", ["party"]);
const neighbours = Array.from({ length: 9 }, (_, i) => track(`n${i}`, ["party"]));
const strangers = Array.from({ length: 9 }, (_, i) => track(`s${i}`, ["chill"]));
const everything = [correct, ...neighbours, ...strangers];

describe("drawing the six", () => {
  test("offers six, the answer among them, each one only once", () => {
    const options = pickTitleOptions(correct, everything);

    assert.equal(options.length, 6);
    assert.equal(options.filter((option) => option.trackId === correct.id).length, 1);
    assert.equal(new Set(options.map((option) => option.trackId)).size, 6);
    assert.equal(new Set(options.map((option) => option.name)).size, 6);
  });

  test("stays on the playlists the answer came from while it can", () => {
    for (let run = 0; run < 50; run += 1) {
      const wrong = pickTitleOptions(correct, everything).filter(
        (option) => option.trackId !== correct.id,
      );

      assert.ok(
        wrong.every((option) => option.trackId.startsWith("n")),
        `run ${run} reached outside the playlist with neighbours to spare`,
      );
    }
  });

  test("reaches elsewhere only once those run out", () => {
    const options = pickTitleOptions(correct, [correct, ...neighbours.slice(0, 2), ...strangers]);
    const wrong = options.filter((option) => option.trackId !== correct.id);

    assert.equal(options.length, 6);
    assert.equal(wrong.filter((option) => option.trackId.startsWith("n")).length, 2);
    assert.equal(wrong.filter((option) => option.trackId.startsWith("s")).length, 3);
  });

  test("gives what it has when the pool is smaller than six", () => {
    const options = pickTitleOptions(correct, [correct, ...neighbours.slice(0, 2)]);

    assert.equal(options.length, 3);
    assert.ok(options.some((option) => option.trackId === correct.id));
  });

  test("never offers a title that reads like the answer, however it is spelled", () => {
    const twins = [
      { ...track("x", ["party"]), name: correct.name },
      { ...track("y", ["party"]), name: `  ${correct.name.toUpperCase()} ` },
    ];
    const options = pickTitleOptions(correct, [correct, ...twins, ...neighbours]);
    const alike = options.filter(
      (option) => option.name.trim().toLowerCase() === correct.name.toLowerCase(),
    );

    assert.equal(alike.length, 1);
  });

  test("does not let the answer settle in one place", () => {
    const places = new Set<number>();

    for (let run = 0; run < 200; run += 1) {
      const options = pickTitleOptions(correct, everything);
      places.add(options.findIndex((option) => option.trackId === correct.id));
    }

    assert.equal(places.size, 6, `the answer only ever landed in ${places.size} of six places`);
  });

  test("still fills six when every draw takes the first candidate", () => {
    assert.equal(pickTitleOptions(correct, [correct, ...neighbours], () => 0).length, 6);
  });
});

describe("spending the lifeline", () => {
  const withTitles = { titles: true };

  function offered() {
    const state = gameReducer(listening(withTitles), {
      type: "buzz",
      playerId: ALA.id,
      amount: 100,
      lyricsShown: null,
    });

    return gameReducer(state, {
      type: "use-titles",
      options: pickTitleOptions(SONG, [SONG, ...neighbours]),
    });
  }

  test("puts the six on screen and costs only the player who pressed", () => {
    const state = offered();

    assert.equal(state.phase, GamePhase.Titles);
    assert.equal(state.titleOptions.length, 6);
    assert.deepEqual([...state.titlesLeft], [BO.id]);
  });

  test("picking the right one answers the round without anybody judging it", () => {
    const state = gameReducer(offered(), { type: "judge", verdict: Verdict.Correct });

    assert.equal(state.phase, GamePhase.Judged);
    assert.equal(state.accounts[ALA.id], 100);
    assert.equal(state.pendingSuspension, null);
  });

  test("picking a wrong one costs the round and the next one", () => {
    const state = gameReducer(offered(), { type: "judge", verdict: Verdict.Incorrect });

    assert.equal(state.accounts[ALA.id] ?? 0, 0);
    assert.deepEqual([...(state.pendingSuspension?.playerIds ?? [])], [ALA.id]);
  });

  test("is refused outside the moment it belongs to", () => {
    const state = listening(withTitles);

    assert.equal(gameReducer(state, { type: "use-titles", options: [] }), state);
  });
});

describe("holding both lifelines", () => {
  test("extra time hands the round back, so the six can still be asked for", () => {
    const state = createGameState([ALA, BO], { ...RULES, extraTime: true, titles: true }, [SONG]);
    const started = gameReducer(state, {
      type: "start-round",
      track: SONG,
      startPositionMs: 0,
      pool: [],
      direction: null,
      lyricsOnly: false,
      lyricsFrom: 0,
    });
    const buzzedIn = gameReducer(started, {
      type: "buzz",
      playerId: ALA.id,
      amount: 100,
      lyricsShown: null,
    });
    const after = gameReducer(gameReducer(buzzedIn, { type: "use-extra-time" }), {
      type: "extra-time-elapsed",
      lyricsShown: null,
    });
    const titles = gameReducer(after, {
      type: "use-titles",
      options: pickTitleOptions(SONG, [SONG, ...neighbours]),
    });

    assert.equal(titles.phase, GamePhase.Titles);
    assert.deepEqual([...titles.extraTimeLeft], [BO.id]);
    assert.deepEqual([...titles.titlesLeft], [BO.id]);
  });
});
