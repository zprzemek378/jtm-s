// The log is the game: whatever happened, replaying what was written down has
// to give back exactly the state that was on screen.
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { compact, inflate, replay, type LoggedEvent } from "@/game/eventLog";
import { createGameState, gameReducer, type GameAction, type GameState } from "@/game/gameState";
import { pickTitleOptions } from "@/game/titleChoice";
import { GamePhase, Verdict } from "@/game/types";

import { ALA, BO, RULES, track } from "./support/game";

const catalogue = ["t1", "t2", "t3"].map((id) => track(id));
const origin = { players: [ALA, BO], rules: RULES, playedIds: [] as readonly string[] };

/**
 * Plays the actions for real while writing them down, then replays what was
 * written. Answers both states, which must be the same one.
 */
function played(
  actions: readonly GameAction[],
  opening = origin,
  list: readonly PoolLike[] = catalogue,
): { live: GameState; resumed: GameState | null } {
  let live = createGameState(opening.players, opening.rules, list, opening.playedIds);
  const events: LoggedEvent[] = [];

  for (const action of actions) {
    live = gameReducer(live, action);
    events.push({ seq: events.length + 1, at: 1000 + events.length, action: compact(action) });
  }

  return { live, resumed: replay(opening, list, events) };
}

type PoolLike = (typeof catalogue)[number];

/** Starting the round the way the session does: the drawn track leaves the pool. */
function startRound(state: GameState, id: string, lyricsOnly = false): GameAction {
  const drawn = catalogue.find((candidate) => candidate.id === id);

  assert.ok(drawn, `no ${id} in the list`);

  const source = state.pool.length > 0 ? state.pool : catalogue;

  return {
    type: "start-round",
    track: drawn,
    startPositionMs: 42_000,
    direction: null,
    lyricsOnly,
    lyricsFrom: lyricsOnly ? 3 : 0,
    pool: source.filter((candidate) => candidate.id !== id),
  };
}

describe("storing an action", () => {
  test("keeps the round's track by name only — the list has the rest", () => {
    const action = startRound(createGameState([ALA], RULES, catalogue), "t2");

    assert.deepEqual(compact(action), {
      type: "start-round",
      trackId: "t2",
      startPositionMs: 42_000,
      direction: null,
      lyricsOnly: false,
      lyricsFrom: 0,
    });
  });

  test("and keeps nothing of the pool, which is the whole point", () => {
    const stored = JSON.stringify(
      compact(startRound(createGameState([ALA], RULES, catalogue), "t1")),
    );

    assert.ok(!stored.includes("spotify:track"), stored);
    assert.ok(stored.length < 150, `an event of ${stored.length} bytes is too much to keep`);
  });

  test("keeps the six by id, in the order they were on screen", () => {
    const options = pickTitleOptions(catalogue[0]!, catalogue);

    assert.deepEqual(compact({ type: "use-titles", options }), {
      type: "use-titles",
      trackIds: options.map((option) => option.trackId),
    });
  });

  test("leaves the small actions exactly as they were", () => {
    const buzz: GameAction = { type: "buzz", playerId: ALA.id, amount: 300, lyricsShown: 2 };

    assert.deepEqual(compact(buzz), buzz);
    assert.deepEqual(compact({ type: "judge", verdict: Verdict.Half }), {
      type: "judge",
      verdict: Verdict.Half,
    });
  });
});

describe("reading one back", () => {
  test("puts the round's track and the pool it left behind back", () => {
    const state = createGameState([ALA], RULES, catalogue);
    const action = startRound(state, "t2");

    assert.deepEqual(inflate(compact(action), state, catalogue), action);
  });

  test("puts the six titles back, with their names", () => {
    const state = createGameState([ALA], RULES, catalogue);
    const options = pickTitleOptions(catalogue[0]!, catalogue);

    assert.deepEqual(
      inflate({ type: "use-titles", trackIds: options.map((o) => o.trackId) }, state, catalogue),
      {
        type: "use-titles",
        options: options.map((option) => ({
          trackId: option.trackId,
          name: catalogue.find((candidate) => candidate.id === option.trackId)?.name,
        })),
      },
    );
  });

  test("a rematch is played against the same list", () => {
    const state = createGameState([ALA], RULES, catalogue);
    const back = inflate({ type: "reset", players: [ALA], rules: RULES }, state, catalogue);

    assert.deepEqual(back, { type: "reset", players: [ALA], rules: RULES, tracks: catalogue });
  });

  test("refuses when the list no longer holds the track that was played", () => {
    const state = createGameState([ALA], RULES, catalogue);

    assert.equal(
      inflate(
        {
          type: "start-round",
          trackId: "gone",
          startPositionMs: 0,
          direction: null,
          lyricsOnly: false,
          lyricsFrom: 0,
        },
        state,
        catalogue,
      ),
      null,
    );
    assert.equal(inflate({ type: "use-titles", trackIds: ["t1", "gone"] }, state, catalogue), null);
  });
});

describe("replaying a game", () => {
  test("a round answered right comes back as it stood", () => {
    const first = createGameState(origin.players, origin.rules, catalogue);
    const { live, resumed } = played([
      startRound(first, "t2"),
      { type: "buzz", playerId: BO.id, amount: 400, lyricsShown: null },
      { type: "reveal" },
      { type: "judge", verdict: Verdict.Half },
    ]);

    assert.equal(live.accounts[BO.id], 200);
    assert.deepEqual(resumed, live);
  });

  test("a ban carried into the next round survives it", () => {
    const first = createGameState(origin.players, origin.rules, catalogue);
    const judged = [
      startRound(first, "t1"),
      { type: "buzz", playerId: ALA.id, amount: 100, lyricsShown: null },
      { type: "reveal" },
      { type: "judge", verdict: Verdict.Incorrect },
    ] satisfies GameAction[];
    const after = judged.reduce(gameReducer, first);
    const { live, resumed } = played([...judged, startRound(after, "t2")]);

    assert.deepEqual([...(live.suspension?.playerIds ?? [])], [ALA.id]);
    assert.deepEqual(resumed, live);
  });

  test("a lifeline spent is a lifeline gone, after a reload too", () => {
    const rules = { ...RULES, extraTime: true, titles: true };
    const opening = { ...origin, rules };
    const first = createGameState(opening.players, rules, catalogue);
    const actions = [
      startRound(first, "t1"),
      { type: "buzz", playerId: ALA.id, amount: 100, lyricsShown: null },
      { type: "use-extra-time" },
      { type: "extra-time-elapsed", lyricsShown: null },
      { type: "use-titles", options: pickTitleOptions(catalogue[0]!, catalogue) },
      { type: "judge", verdict: Verdict.Correct },
    ] satisfies GameAction[];
    const { live, resumed } = played(actions, opening);

    assert.deepEqual([...live.extraTimeLeft], [BO.id]);
    assert.deepEqual([...live.titlesLeft], [BO.id]);
    assert.deepEqual(resumed, live);
  });

  test("a words-only round comes back a words-only round", () => {
    const first = createGameState(origin.players, origin.rules, catalogue);
    const { live, resumed } = played([startRound(first, "t3", true)]);

    assert.equal(live.lyricsOnly, true);
    assert.equal(live.lyricsFrom, 3);
    assert.deepEqual(resumed, live);
  });

  test("the list coming round again replays the same way", () => {
    // Every track heard, so the next draw starts the whole list over — and the
    // history with it. The replayed pool has to make the same turn.
    let state = createGameState(origin.players, origin.rules, catalogue);
    const actions: GameAction[] = [];

    for (const id of ["t1", "t2", "t3", "t2"]) {
      const action = startRound(state, id);

      actions.push(action);
      state = gameReducer(state, action);
    }

    const { live, resumed } = played(actions);

    assert.deepEqual([...live.playedIds], ["t2"], "the history started over");
    assert.equal(live.pool.length, 2);
    assert.deepEqual(resumed, live);
  });

  test("a game already carrying a history keeps it", () => {
    const opening = { ...origin, playedIds: ["t1"] };
    const first = createGameState(opening.players, opening.rules, catalogue, opening.playedIds);
    const { live, resumed } = played([startRound(first, "t2")], opening);

    assert.deepEqual([...live.playedIds], ["t1", "t2"]);
    assert.deepEqual(resumed, live);
  });

  test("an edit from the hidden screen replays with it", () => {
    const first = createGameState(origin.players, origin.rules, catalogue);
    const actions = [
      startRound(first, "t1"),
      { type: "guess-window-elapsed" },
      {
        type: "apply-edit",
        accounts: { [ALA.id]: 700 },
        suspendedNext: [BO.id],
        players: [{ ...ALA, name: "Alicja", colour: "#ff0000" }, BO],
      },
    ] satisfies GameAction[];
    const { live, resumed } = played(actions);

    assert.equal(live.players[0]?.name, "Alicja");
    assert.equal(live.accounts[ALA.id], 700);
    assert.deepEqual(resumed, live);
  });

  test("a rematch replays, history and all", () => {
    const first = createGameState(origin.players, origin.rules, catalogue);
    const actions = [
      startRound(first, "t1"),
      { type: "reset", players: origin.players, rules: RULES, tracks: catalogue },
    ] satisfies GameAction[];
    const { live, resumed } = played(actions);

    assert.equal(live.round, 0);
    assert.deepEqual([...live.playedIds], ["t1"]);
    assert.deepEqual(resumed, live);
  });

  test("a won game replays as won", () => {
    const first = createGameState(origin.players, origin.rules, catalogue);
    const { live, resumed } = played([
      startRound(first, "t1"),
      { type: "buzz", playerId: ALA.id, amount: 1000, lyricsShown: null },
      { type: "reveal" },
      { type: "judge", verdict: Verdict.Correct },
    ]);

    assert.equal(live.phase, GamePhase.Finished);
    assert.equal(resumed?.winnerId, ALA.id);
  });

  test("an empty log is simply the game before it started", () => {
    assert.deepEqual(replay(origin, catalogue, []), createGameState([ALA, BO], RULES, catalogue));
  });

  test("a log naming a track the playlists no longer have is refused outright", () => {
    const first = createGameState(origin.players, origin.rules, catalogue);
    const events = [
      { seq: 1, at: 1, action: compact(startRound(first, "t2")) },
    ] satisfies LoggedEvent[];

    assert.equal(replay(origin, [catalogue[0]!], events), null);
  });
});
