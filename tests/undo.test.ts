// Taking a move back: how far back a move goes, and what it leaves on screen.
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { compact, replay, type LoggedEvent } from "@/game/eventLog";
import { gameReducer, type GameAction } from "@/game/gameState";
import { pickTitleOptions } from "@/game/titleChoice";
import { GamePhase, Verdict } from "@/game/types";
import { canSitIn, previousMove, type ReplayableGame } from "@/game/undo";

import { ALA, BO, RULES, track } from "./support/game";

const catalogue = ["t1", "t2", "t3"].map((id) => track(id));
const origin = { players: [ALA, BO], rules: RULES, playedIds: [] as readonly string[] };

const logOf = (actions: readonly GameAction[]): readonly LoggedEvent[] =>
  actions.map((action, index) => ({ seq: index + 1, at: 1000 + index, action: compact(action) }));

const game = (actions: readonly GameAction[], rules = RULES): ReplayableGame => ({
  origin: { ...origin, rules },
  catalogue,
  events: logOf(actions),
});

const round = (id: string): GameAction => ({
  type: "start-round",
  track: catalogue.find((candidate) => candidate.id === id)!,
  startPositionMs: 0,
  direction: null,
  lyricsOnly: false,
  lyricsFrom: 0,
  pool: catalogue.filter((candidate) => candidate.id !== id),
});

const answered = (verdict: Verdict, amount = 400): GameAction[] => [
  { type: "buzz", playerId: ALA.id, amount, lyricsShown: null },
  { type: "reveal" },
  { type: "judge", verdict },
];

describe("where a move can land", () => {
  test("only somewhere the game is waiting on somebody", () => {
    assert.deepEqual(Object.values(GamePhase).filter(canSitIn), [
      GamePhase.Titles,
      GamePhase.Revealed,
      GamePhase.TimedOut,
      GamePhase.Judged,
      GamePhase.Tied,
      GamePhase.Finished,
    ]);
  });

  test("never in the middle of a round, where a countdown would restart", () => {
    for (const phase of [GamePhase.Listening, GamePhase.Buzzed, GamePhase.ExtraTime]) {
      assert.equal(canSitIn(phase), false, phase);
    }
  });

  test("and never before the first round, which would count the table in", () => {
    assert.equal(canSitIn(GamePhase.Idle), false);
  });
});

describe("taking back a verdict", () => {
  const played = [round("t1"), ...answered(Verdict.Correct)];

  test("leaves the answer on screen, waiting to be judged again", () => {
    const back = previousMove(game(played));

    assert.equal(back?.state.phase, GamePhase.Revealed);
    assert.equal(back?.state.buzzedPlayerId, ALA.id);
  });

  test("takes the money back with it", () => {
    const back = previousMove(game(played));

    assert.equal(back?.state.accounts[ALA.id] ?? 0, 0);
    assert.equal(back?.state.pendingAmount, 400, "the stake is still the one that was pressed for");
  });

  test("and the round can then be judged differently", () => {
    const back = previousMove(game(played));

    assert.ok(back);

    const half = gameReducer(back.state, { type: "judge", verdict: Verdict.Half });

    assert.equal(half.accounts[ALA.id], 200);
  });

  test("cuts the log to exactly the events that stay", () => {
    const back = previousMove(game(played));

    assert.equal(back?.seq, 3, "everything up to the reveal");
  });

  test("the same, when the verdict was what won the game", () => {
    const won = [round("t1"), ...answered(Verdict.Correct, 1000)];
    const finished = replay(origin, catalogue, logOf(won));

    assert.equal(finished?.phase, GamePhase.Finished);
    assert.equal(previousMove(game(won))?.state.phase, GamePhase.Revealed);
  });
});

describe("taking back more than one", () => {
  test("the second goes past the press and the round's start, to the round before", () => {
    const played = [
      round("t1"),
      { type: "guess-window-elapsed" },
      round("t2"),
      ...answered(Verdict.Incorrect),
    ] satisfies GameAction[];
    const first = previousMove(game(played));

    assert.equal(first?.state.phase, GamePhase.Revealed);

    const second = previousMove({ ...game(played), events: logOf(played).slice(0, first?.seq) });

    assert.equal(second?.state.phase, GamePhase.TimedOut, "the end of the first round");
    assert.equal(second?.state.round, 1);
    assert.equal(second?.seq, 2);
  });

  test("a ban is lifted along with the answer that earned it", () => {
    const played = [round("t1"), ...answered(Verdict.Incorrect)];
    const judged = replay(origin, catalogue, logOf(played));

    assert.deepEqual([...(judged?.pendingSuspension?.playerIds ?? [])], [ALA.id]);
    assert.equal(previousMove(game(played))?.state.pendingSuspension, null);
  });
});

describe("taking back a pick among the six", () => {
  const rules = { ...RULES, titles: true };
  const options = pickTitleOptions(catalogue[0]!, catalogue);
  const played = [
    round("t1"),
    { type: "buzz", playerId: ALA.id, amount: 300, lyricsShown: null },
    { type: "use-titles", options },
    { type: "judge", verdict: Verdict.Incorrect },
  ] satisfies GameAction[];

  test("puts the six back on screen rather than losing the whole round", () => {
    const back = previousMove(game(played, rules));

    assert.equal(back?.state.phase, GamePhase.Titles);
    assert.deepEqual(back?.state.titleOptions, options);
  });

  test("and the lifeline stays spent, because it was", () => {
    assert.deepEqual([...(previousMove(game(played, rules))?.state.titlesLeft ?? [])], [BO.id]);
  });
});

describe("when there is nothing to take back", () => {
  test("a game whose first round is still being played", () => {
    assert.equal(previousMove(game([round("t1")])), null);
  });

  test("a game whose first round nobody guessed — there is no earlier round", () => {
    assert.equal(previousMove(game([round("t1"), { type: "guess-window-elapsed" }])), null);
  });

  test("a game that has not started", () => {
    assert.equal(previousMove(game([])), null);
  });

  test("no game at all", () => {
    assert.equal(previousMove(null), null);
  });
});

describe("putting a move back", () => {
  test("the dropped events replay to exactly the state they were taken from", () => {
    const played = [round("t1"), ...answered(Verdict.Half)];
    const events = logOf(played);
    const before = replay(origin, catalogue, events);
    const back = previousMove(game(played));

    assert.ok(back);

    const dropped = events.filter((event) => event.seq > back.seq);
    const kept = events.filter((event) => event.seq <= back.seq);

    assert.deepEqual(
      dropped.map((event) => event.action.type),
      ["judge"],
    );
    assert.deepEqual(replay(origin, catalogue, [...kept, ...dropped]), before);
  });
});
