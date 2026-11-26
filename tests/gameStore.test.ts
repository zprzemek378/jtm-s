// What is kept between visits, and what is given up when it will not all fit.
import assert from "node:assert/strict";
import { afterEach, describe, test } from "vitest";

import {
  EMPTY_LOG,
  MAX_STORED_GAMES,
  appendAction,
  beginGame,
  closeGame,
  forgetGame,
  hasUnsentEvents,
  markConfirmed,
  pendingGames,
  prune,
  readGameLog,
  resumableGame,
  writeGameLog,
  type GameLog,
} from "@/game/gameStore";
import { replay } from "@/game/eventLog";
import { createGameState } from "@/game/gameState";

import { ALA, BO, RULES, track } from "./support/game";
import { stubStorage, type FakeStorage } from "./support/storage";

const catalogue = ["t1", "t2", "t3"].map((id) => track(id));
const origin = { players: [ALA, BO], rules: RULES, playedIds: [] as readonly string[] };

const opened = (log: GameLog, id: string, at: number) =>
  beginGame(log, { id, historyKey: "p1", origin, catalogue, at });

/** A game with one round played in it. */
function withARound(log: GameLog, id: string, at = 1000): GameLog {
  const started = opened(log, id, at);
  const state = createGameState(origin.players, RULES, catalogue);

  return appendAction(
    started,
    id,
    {
      type: "start-round",
      track: catalogue[0]!,
      startPositionMs: 0,
      direction: null,
      lyricsOnly: false,
      lyricsFrom: 0,
      pool: state.pool.slice(1),
    },
    at + 1,
  );
}

let storage: FakeStorage | null = null;

afterEach(() => {
  storage?.restore();
  storage = null;
});

describe("keeping a game", () => {
  test("a new one is the current one and starts with nothing written down", () => {
    const log = opened(EMPTY_LOG, "g1", 1000);

    assert.equal(log.currentId, "g1");
    assert.deepEqual(log.games[0]?.events, []);
    assert.equal(log.games[0]?.closedAt, null);
  });

  test("events are numbered from one, in the order they happened", () => {
    const log = appendAction(withARound(EMPTY_LOG, "g1"), "g1", { type: "reveal" }, 2000);

    assert.deepEqual(
      log.games[0]?.events.map((event) => [event.seq, event.action.type, event.at]),
      [
        [1, "start-round", 1001],
        [2, "reveal", 2000],
      ],
    );
  });

  test("what is written down is what the game replays from", () => {
    const log = appendAction(
      appendAction(
        withARound(EMPTY_LOG, "g1"),
        "g1",
        { type: "buzz", playerId: ALA.id, amount: 500, lyricsShown: null },
        2000,
      ),
      "g1",
      { type: "reveal" },
      2100,
    );
    const game = log.games[0]!;

    assert.equal(replay(game.origin, game.catalogue, game.events)?.pendingAmount, 500);
  });

  test("starting another game leaves the first one alone", () => {
    const log = opened(withARound(EMPTY_LOG, "g1"), "g2", 5000);

    assert.equal(log.currentId, "g2");
    assert.equal(log.games.length, 2);
    assert.equal(log.games.find((game) => game.id === "g1")?.events.length, 1);
  });
});

describe("carrying one on", () => {
  test("a game with a round played is there to be resumed", () => {
    assert.equal(resumableGame(withARound(EMPTY_LOG, "g1"))?.id, "g1");
  });

  test("one that never got going is not worth offering", () => {
    assert.equal(resumableGame(opened(EMPTY_LOG, "g1", 1000)), null);
  });

  test("nor is one that has been won, or walked away from", () => {
    assert.equal(resumableGame(closeGame(withARound(EMPTY_LOG, "g1"), "g1", 3000)), null);
  });

  test("nor an older one — only the game this machine was playing", () => {
    const log = withARound(withARound(EMPTY_LOG, "g1"), "g2", 5000);

    assert.equal(resumableGame(log)?.id, "g2");
  });

  test("nor one whose track list had to be given up", () => {
    const log = withARound(EMPTY_LOG, "g1");
    const without = { ...log, games: [{ ...log.games[0]!, catalogue: [] }] };

    assert.equal(resumableGame(without), null);
  });

  test("the host can drop it, and then there is nothing to come back to", () => {
    const log = forgetGame(withARound(EMPTY_LOG, "g1"), "g1");

    assert.deepEqual(log.games, []);
    assert.equal(log.currentId, null);
    assert.equal(resumableGame(log), null);
  });
});

describe("what the backend has not seen", () => {
  test("a game with events nobody has acknowledged is pending", () => {
    const log = withARound(EMPTY_LOG, "g1");

    assert.ok(hasUnsentEvents(log.games[0]!));
    assert.deepEqual(
      pendingGames(log).map((game) => game.id),
      ["g1"],
    );
  });

  test("acknowledging up to the last event settles it", () => {
    const log = markConfirmed(withARound(EMPTY_LOG, "g1"), "g1", 1);

    assert.equal(hasUnsentEvents(log.games[0]!), false);
    assert.deepEqual(pendingGames(log), []);
  });

  test("an acknowledgement never goes backwards, however they arrive", () => {
    const log = markConfirmed(markConfirmed(withARound(EMPTY_LOG, "g1"), "g1", 1), "g1", 0);

    assert.equal(log.games[0]?.confirmedUpTo, 1);
  });
});

describe("making room", () => {
  test("a game that has ended and been sent is forgotten", () => {
    const sent = markConfirmed(withARound(EMPTY_LOG, "g1"), "g1", 1);
    const log = opened(closeGame(sent, "g1", 2000), "g2", 5000);

    assert.deepEqual(
      log.games.map((game) => game.id),
      ["g2"],
    );
  });

  test("one that has ended but not been sent is kept until it is", () => {
    const log = opened(closeGame(withARound(EMPTY_LOG, "g1"), "g1", 2000), "g2", 5000);

    assert.deepEqual(
      log.games.map((game) => game.id),
      ["g1", "g2"],
    );
  });

  test("ending a game drops its track list, which is all the weight", () => {
    const log = closeGame(withARound(EMPTY_LOG, "g1"), "g1", 2000);

    assert.deepEqual(log.games[0]?.catalogue, []);
    assert.equal(log.games[0]?.events.length, 1, "what happened is still there to send");
  });

  test("beyond the limit the oldest go, as long as they have been sent", () => {
    let log = EMPTY_LOG;

    for (let index = 0; index < MAX_STORED_GAMES + 2; index += 1) {
      log = markConfirmed(withARound(log, `g${index}`, 1000 * (index + 1)), `g${index}`, 1);
    }

    assert.equal(log.games.length, MAX_STORED_GAMES);
    assert.equal(
      log.games.some((game) => game.id === "g0"),
      false,
    );
    assert.ok(log.games.some((game) => game.id === `g${MAX_STORED_GAMES + 1}`));
  });

  test("an evening played offline is never thrown out for being old", () => {
    let log = EMPTY_LOG;

    for (let index = 0; index < MAX_STORED_GAMES + 3; index += 1) {
      log = withARound(log, `g${index}`, 1000 * (index + 1));
    }

    assert.equal(log.games.length, MAX_STORED_GAMES + 3);
    assert.ok(log.games.some((game) => game.id === "g0"));
  });

  test("pruning does not touch a game that is simply unfinished", () => {
    const log = withARound(EMPTY_LOG, "g1");

    assert.deepEqual(prune(log), log);
  });
});

describe("storing it in the browser", () => {
  test("what is written comes back", () => {
    storage = stubStorage();
    const log = withARound(EMPTY_LOG, "g1");

    assert.equal(writeGameLog(log), true);
    assert.deepEqual(readGameLog(), log);
  });

  test("nothing stored is an empty log, not a crash", () => {
    storage = stubStorage();

    assert.deepEqual(readGameLog(), EMPTY_LOG);
  });

  test("rubbish in storage is an empty log too", () => {
    storage = stubStorage();
    localStorage.setItem("jtm-s.games", "{nonsense");

    assert.deepEqual(readGameLog(), EMPTY_LOG);
  });

  test("a log from a future version of the app is not guessed at", () => {
    storage = stubStorage();
    localStorage.setItem("jtm-s.games", JSON.stringify({ version: 99, games: [] }));

    assert.deepEqual(readGameLog(), EMPTY_LOG);
  });

  test("when it will not all fit, the old track lists go and the game stays", () => {
    const log = withARound(withARound(EMPTY_LOG, "g1"), "g2", 5000);
    const needed = JSON.stringify(log).length;

    storage = stubStorage(needed - 200);

    assert.equal(writeGameLog(log), true);

    const stored = readGameLog();

    assert.deepEqual(stored.games.find((game) => game.id === "g1")?.catalogue, []);
    assert.equal(stored.games.find((game) => game.id === "g2")?.catalogue.length, catalogue.length);
    assert.equal(resumableGame(stored)?.id, "g2");
  });

  test("when even that will not fit, only the game being played is kept", () => {
    const log = withARound(withARound(EMPTY_LOG, "g1"), "g2", 5000);

    storage = stubStorage(JSON.stringify({ ...log, games: [log.games[1]] }).length + 20);

    assert.equal(writeGameLog(log), true);
    assert.deepEqual(
      readGameLog().games.map((game) => game.id),
      ["g2"],
    );
  });

  test("a store that refuses everything is not an error, only a game that cannot be resumed", () => {
    storage = stubStorage(0);

    assert.equal(writeGameLog(withARound(EMPTY_LOG, "g1")), false);
    assert.deepEqual(readGameLog(), EMPTY_LOG);
  });
});
