// Reading a game back: turning what was stored into words, and surviving a
// store that holds something other than what this version expects.
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { compact, replaySteps, type LoggedEvent } from "@/game/eventLog";
import { readEvents, readOrigin, readTracks } from "@/game/gameRecord";
import { createGameState, gameReducer, type GameAction } from "@/game/gameState";
import { describeStep } from "@/game/historyLines";
import { Verdict } from "@/game/types";

import { ALA, BO, RULES, track } from "./support/game";

const catalogue = [track("t1"), track("t2")];
const origin = { players: [ALA, BO], rules: RULES, playedIds: [] as readonly string[] };

const round = (id: string, lyricsOnly = false): GameAction => ({
  type: "start-round",
  track: catalogue.find((candidate) => candidate.id === id)!,
  startPositionMs: 0,
  direction: null,
  lyricsOnly,
  lyricsFrom: 0,
  pool: catalogue.filter((candidate) => candidate.id !== id),
});

/** The line each of these actions produces, in order. */
function lines(actions: readonly GameAction[]) {
  const events: LoggedEvent[] = actions.map((action, index) => ({
    seq: index + 1,
    at: index,
    action: compact(action),
  }));
  const steps = replaySteps(origin, catalogue, events);

  assert.ok(steps, "the game could not be replayed");

  return events.map((event, index) => describeStep(event.action, steps[index]!, steps[index + 1]!));
}

describe("a game in words", () => {
  test("a round names its number and its song", () => {
    assert.deepEqual(lines([round("t2")]), [
      { key: "history.round", params: { number: 1, track: "Song t2" } },
    ]);
  });

  test("a round played on the words says so", () => {
    assert.equal(lines([round("t1", true)])[0]?.key, "history.roundLyrics");
  });

  test("a press names who pressed and what was on the counter", () => {
    const [, line] = lines([
      round("t1"),
      { type: "buzz", playerId: BO.id, amount: 450, lyricsShown: null },
    ]);

    assert.equal(line?.key, "history.buzz");
    assert.equal(line?.params?.name, "Bo");
    assert.match(String(line?.params?.amount), /450/);
  });

  test("a verdict reports what was actually won, not what was played for", () => {
    const [, , , line] = lines([
      round("t1"),
      { type: "buzz", playerId: ALA.id, amount: 400, lyricsShown: null },
      { type: "reveal" },
      { type: "judge", verdict: Verdict.Half },
    ]);

    assert.equal(line?.key, "history.half");
    assert.equal(line?.params?.name, "Ala");
    assert.match(String(line?.params?.amount), /200/);
  });

  test("a wrong answer says who sits the next round out", () => {
    const [, , , line] = lines([
      round("t1"),
      { type: "buzz", playerId: ALA.id, amount: 400, lyricsShown: null },
      { type: "reveal" },
      { type: "judge", verdict: Verdict.Incorrect },
    ]);

    assert.equal(line?.key, "history.incorrect");
    assert.equal(line?.params?.name, "Ala");
  });

  test("the lifelines name the player who spent them", () => {
    const [, , extra, , titles] = lines([
      round("t1"),
      { type: "buzz", playerId: BO.id, amount: 100, lyricsShown: null },
      { type: "use-extra-time" },
      { type: "extra-time-elapsed", lyricsShown: null },
      { type: "use-titles", options: [{ trackId: "t1", name: "Song t1" }] },
    ]);

    assert.deepEqual(extra, { key: "history.extraTime", params: { name: "Bo" } });
    assert.equal(titles?.key, "history.titles");
    assert.equal(titles?.params?.name, "Bo");
  });

  test("the rest of what can happen has a line of its own", () => {
    assert.deepEqual(
      lines([
        round("t1"),
        { type: "guess-window-elapsed" },
        round("t2"),
        { type: "tie", playerIds: [ALA.id, BO.id] },
        { type: "reset", players: [ALA, BO], rules: RULES, tracks: catalogue },
      ]).map((line) => line.key),
      ["history.round", "history.timeout", "history.round", "history.tie", "history.rematch"],
    );
  });

  test("a tie names everybody in it", () => {
    const [, line] = lines([round("t1"), { type: "tie", playerIds: [ALA.id, BO.id] }]);

    assert.equal(line?.params?.names, "Ala, Bo");
  });

  test("an edit from the hidden screen is recorded as one", () => {
    const [, , line] = lines([
      round("t1"),
      { type: "guess-window-elapsed" },
      { type: "apply-edit", accounts: { [ALA.id]: 50 }, suspendedNext: [], players: [ALA, BO] },
    ]);

    assert.equal(line?.key, "history.edit");
  });

  test("a step this version has never heard of is still a step", () => {
    const state = createGameState([ALA], RULES, catalogue);

    assert.deepEqual(describeStep({ type: "from-the-future" } as never, state, state), {
      key: "history.unknown",
    });
  });

  test("after a rename, the lines that follow use the new name", () => {
    const [, , , , pressed] = lines([
      round("t1"),
      { type: "guess-window-elapsed" },
      {
        type: "apply-edit",
        accounts: {},
        suspendedNext: [],
        players: [{ ...ALA, name: "Alicja" }, BO],
      },
      round("t2"),
      { type: "buzz", playerId: ALA.id, amount: 100, lyricsShown: null },
    ]);

    assert.equal(pressed?.key, "history.buzz");
    assert.equal(pressed?.params?.name, "Alicja");
  });
});

describe("what came back from the backend", () => {
  test("a line-up and its rules are read back", () => {
    const read = readOrigin({ players: [ALA, BO], rules: RULES, playedIds: ["t9"] });

    assert.deepEqual(read?.players, [ALA, BO]);
    assert.equal(read?.rules.targetMoney, RULES.targetMoney);
    assert.deepEqual([...(read?.playedIds ?? [])], ["t9"]);
  });

  test("missing rules are filled in rather than refused", () => {
    const read = readOrigin({ players: [{ id: "a" }] });

    assert.equal(read?.players[0]?.name, "#1");
    assert.equal(read?.rules.roundDurationMs, 30_000);
    assert.deepEqual([...(read?.playedIds ?? [])], []);
  });

  test("a game with nobody in it is not a game", () => {
    for (const value of [null, {}, "nonsense", { players: [] }, { players: [{}] }]) {
      assert.equal(readOrigin(value), null, JSON.stringify(value));
    }
  });

  test("the songs that were played are preferred to a track list", () => {
    const tracks = readTracks([{ id: "t1", name: "Played", artists: "Them" }], catalogue);

    assert.equal(tracks.length, 1);
    assert.equal(tracks[0]?.name, "Played");
    assert.equal(tracks[0]?.durationMs, 0, "a history names songs, it does not play them");
  });

  test("and the track list stands in when no titles were kept", () => {
    assert.equal(readTracks(null, catalogue).length, catalogue.length);
    assert.equal(readTracks([], catalogue).length, catalogue.length);
    assert.deepEqual(readTracks(null, null), []);
  });

  test("events come back in order, and nonsense is left out", () => {
    const read = readEvents([
      { seq: 2, at: 2, action: { type: "reveal" } },
      { seq: 1, at: 1, action: { type: "buzz" } },
      { seq: 3, at: 3, action: null },
      { seq: 4, at: 4, action: "words" },
    ]);

    assert.deepEqual(
      read.map((event) => event.seq),
      [1, 2],
    );
  });

  test("a replay of what came back is still the game", () => {
    const actions = [
      round("t1"),
      { type: "buzz", playerId: ALA.id, amount: 300, lyricsShown: null },
      { type: "reveal" },
      { type: "judge", verdict: Verdict.Correct },
    ] satisfies GameAction[];
    const live = actions.reduce(gameReducer, createGameState([ALA, BO], RULES, catalogue));
    // What the backend would hand back: the titles that were played, and the
    // events as JSON.
    const steps = replaySteps(
      readOrigin({ players: [ALA, BO], rules: RULES, playedIds: [] })!,
      readTracks([{ id: "t1", name: "Song t1", artists: "Someone" }], null),
      readEvents(
        actions.map((action, index) => ({ seq: index + 1, at: index, action: compact(action) })),
      ),
    );

    assert.equal(steps?.at(-1)?.accounts[ALA.id], live.accounts[ALA.id]);
    assert.equal(steps?.at(-1)?.phase, live.phase);
  });
});
