// What is kept between visits, and what is given up when it will not all fit.
import assert from "node:assert/strict";
import { afterEach, describe, test } from "vitest";

import {
  EMPTY_LOG,
  MAX_STORED_CHARS,
  MAX_STORED_GAMES,
  adoptGame,
  appendAction,
  beginGame,
  closeGame,
  forgetGame,
  hasUnsentEvents,
  markClosedSent,
  markConfirmed,
  needsSync,
  pendingGames,
  prune,
  readGameLog,
  resumableGame,
  truncateEvents,
  writeGameLog,
  type GameLog,
} from "@/game/gameStore";
import { replay } from "@/game/eventLog";
import { createGameState } from "@/game/gameState";
import { Verdict } from "@/game/types";

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
    const told = markClosedSent(closeGame(sent, "g1", 2000), "g1");
    const log = opened(told, "g2", 5000);

    assert.deepEqual(
      log.games.map((game) => game.id),
      ["g2"],
    );
  });

  test("but not before the backend has been told that it ended", () => {
    // Ending a game is not an event: a game abandoned long after its last
    // round has nothing unsent, and forgetting it here would leave it
    // unfinished in the backend for ever.
    const sent = markConfirmed(withARound(EMPTY_LOG, "g1"), "g1", 1);
    const closed = closeGame(sent, "g1", 2000);

    assert.equal(hasUnsentEvents(closed.games[0]!), false);
    assert.ok(needsSync(closed.games[0]!));
    assert.deepEqual(
      pendingGames(closed).map((game) => game.id),
      ["g1"],
    );
    assert.ok(opened(closed, "g2", 5000).games.some((game) => game.id === "g1"));
  });

  test("closing a game twice does not make it look unsent again", () => {
    const told = markClosedSent(closeGame(withARound(EMPTY_LOG, "g1"), "g1", 2000), "g1");
    const again = closeGame(told, "g1", 7000);

    assert.equal(again.games[0]?.closedAt, 2000);
    assert.equal(again.games[0]?.closedSent, true);
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

  test("a game stored by an older version of the app is read, not crashed on", () => {
    // Fields this app writes today did not exist in every build that has ever
    // written here: `tracks`, `closedSent` and the universe were all added to
    // a store that already had games in it. Reading one as though they were
    // there is how a game in progress falls over.
    storage = stubStorage();
    localStorage.setItem(
      "jtm-s.games",
      JSON.stringify({
        version: 1,
        currentId: "old",
        games: [
          {
            id: "old",
            startedAt: 1000,
            updatedAt: 1001,
            historyKey: "p1",
            origin: { players: [ALA, BO], rules: RULES, playedIds: [] },
            catalogue: [...catalogue],
            events: [{ seq: 1, at: 1000, action: { type: "reveal" } }],
            confirmedUpTo: 0,
            closedAt: null,
          },
        ],
      }),
    );

    const game = readGameLog().games[0];

    assert.deepEqual(game?.tracks, []);
    assert.equal(game?.closedSent, false);
    assert.equal(game?.universeId, null);
    // And it is a game: it can be carried on, ended and sent like any other.
    assert.equal(resumableGame(readGameLog())?.id, "old");
    assert.deepEqual(closeGame(readGameLog(), "old", 2000).games[0]?.catalogue, []);
    assert.deepEqual(
      pendingGames(readGameLog()).map((stored) => stored.id),
      ["old"],
    );
  });

  test("a stored game with no line-up at all is dropped rather than half read", () => {
    storage = stubStorage();
    localStorage.setItem(
      "jtm-s.games",
      JSON.stringify({
        version: 1,
        currentId: "broken",
        games: [{ id: "broken", events: [] }, { startedAt: 1 }],
      }),
    );

    const log = readGameLog();

    assert.deepEqual(log.games, []);
    assert.equal(log.currentId, null, "nothing left to be the current game");
  });

  test("an acknowledgement for events that are no longer stored is not believed", () => {
    storage = stubStorage();
    localStorage.setItem(
      "jtm-s.games",
      JSON.stringify({
        version: 1,
        currentId: "g1",
        games: [
          {
            id: "g1",
            startedAt: 1,
            updatedAt: 1,
            historyKey: "p",
            universeId: null,
            origin: { players: [ALA], rules: RULES, playedIds: [] },
            catalogue: [],
            tracks: [],
            events: [{ seq: 1, at: 1, action: { type: "reveal" } }],
            confirmedUpTo: 9,
            closedAt: null,
            closedSent: false,
          },
        ],
      }),
    );

    assert.equal(readGameLog().games[0]?.confirmedUpTo, 1);
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

  test("a write from the game does not undo what the sync acknowledged", () => {
    // Two writers: the game being played holds its own copy of the log and
    // knows nothing about syncing, and the sync knows nothing about the round
    // in progress. Neither may undo the other's work.
    storage = stubStorage();

    const playing = withARound(EMPTY_LOG, "g1");

    writeGameLog(playing);
    // The sync, meanwhile: the events arrived and the game ended.
    writeGameLog(
      markClosedSent(markConfirmed(closeGame(readGameLog(), "g1", 2000), "g1", 1), "g1"),
    );
    // The game writes its own copy again, which still says nothing was sent.
    writeGameLog(playing);

    const stored = readGameLog().games[0];

    assert.equal(stored?.confirmedUpTo, 1);
    assert.equal(stored?.closedSent, true);
  });

  test("the budget is this app's own, not whatever the browser would allow", () => {
    // `localStorage` belongs to the origin, and on GitHub Pages that is shared
    // with every other project of the same owner — so a store that would
    // happily take ten megabytes still only gets two.
    storage = stubStorage();

    const heavy = (id: string, at: number) => {
      const log = withARound(EMPTY_LOG, id, at);
      const big = Array.from({ length: 12_000 }, (_, index) => track(`${id}-${index}`));

      return { ...log, games: [{ ...log.games[0]!, catalogue: big }] };
    };
    const first = heavy("g1", 1000);

    assert.ok(JSON.stringify(first).length > MAX_STORED_CHARS, "the fixture has to be too large");
    assert.equal(writeGameLog(first), true);
    assert.ok(storage.size() <= MAX_STORED_CHARS);
    // The game is kept and can still be sent; only carrying it on is lost.
    assert.equal(readGameLog().games.length, 1);
    assert.deepEqual(readGameLog().games[0]?.catalogue, []);
    assert.deepEqual(
      pendingGames(readGameLog()).map((game) => game.id),
      ["g1"],
    );
  });

  test("an evening played offline keeps its events when the lists have to go", () => {
    storage = stubStorage();

    let log = EMPTY_LOG;

    for (const id of ["g1", "g2", "g3"]) {
      const played = withARound(log, id, 1000);
      const big = Array.from({ length: 6000 }, (_, index) => track(`${id}-${index}`));

      log = {
        ...played,
        games: played.games.map((game) => (game.id === id ? { ...game, catalogue: big } : game)),
      };
    }

    assert.equal(writeGameLog(log), true);

    const stored = readGameLog();

    assert.deepEqual(
      [...stored.games.map((game) => game.id)].sort(),
      ["g1", "g2", "g3"],
      "nothing with unsent events was thrown away",
    );
    assert.ok(stored.games.every((game) => game.events.length === 1));
    assert.ok(storage.size() <= MAX_STORED_CHARS);
  });

  test("a store that refuses everything is not an error, only a game that cannot be resumed", () => {
    storage = stubStorage(0);

    assert.equal(writeGameLog(withARound(EMPTY_LOG, "g1")), false);
    assert.deepEqual(readGameLog(), EMPTY_LOG);
  });
});

describe("taking a move back", () => {
  /** A game with three events, all of them acknowledged by the backend. */
  const sent = () => {
    let log = withARound(EMPTY_LOG, "g1");

    log = appendAction(log, "g1", { type: "reveal" }, 2000);
    log = appendAction(log, "g1", { type: "judge", verdict: Verdict.Correct }, 2100);

    return markConfirmed(log, "g1", 3);
  };

  test("cuts the log short", () => {
    const log = truncateEvents(sent(), "g1", 1);

    assert.deepEqual(
      log.games[0]?.events.map((event) => event.seq),
      [1],
    );
  });

  test("and brings the acknowledgement back with it, so the replay is sent again", () => {
    // The backend stores events by (game, seq). The numbers from here on have
    // to go again and overwrite what it holds, or the two sides would disagree
    // about how the evening went.
    const log = truncateEvents(sent(), "g1", 1);

    assert.equal(log.games[0]?.confirmedUpTo, 1);
    assert.deepEqual(
      pendingGames(appendAction(log, "g1", { type: "reveal" }, 3000)).map((game) => game.id),
      ["g1"],
    );
  });

  test("an acknowledgement further along is left alone when nothing was cut", () => {
    assert.equal(truncateEvents(sent(), "g1", 3).games[0]?.confirmedUpTo, 3);
  });

  test("and a stale copy of the log cannot restore it", () => {
    storage = stubStorage();

    const confirmed = sent();

    writeGameLog(confirmed);
    // The host takes a move back; the write has to lower what was stored.
    writeGameLog(truncateEvents(confirmed, "g1", 1));

    assert.equal(readGameLog().games[0]?.confirmedUpTo, 1);
  });
});

describe("taking a game over from the backend", () => {
  test("it becomes the game this machine is playing, with its own id kept", () => {
    const pulled = {
      ...withARound(EMPTY_LOG, "g9", 9000).games[0]!,
      confirmedUpTo: 1,
    };
    const log = adoptGame(withARound(EMPTY_LOG, "g1"), pulled);

    assert.equal(log.currentId, "g9");
    assert.equal(resumableGame(log)?.id, "g9");
    assert.deepEqual(
      log.games.map((game) => game.id),
      ["g1", "g9"],
    );
  });

  test("taking the same game over again replaces it rather than keeping two", () => {
    const pulled = withARound(EMPTY_LOG, "g9", 9000).games[0]!;
    const log = adoptGame(adoptGame(EMPTY_LOG, pulled), { ...pulled, updatedAt: 9999 });

    assert.equal(log.games.length, 1);
    assert.equal(log.games[0]?.updatedAt, 9999);
  });

  test("what the backend had already is not sent back to it", () => {
    const pulled = { ...withARound(EMPTY_LOG, "g9", 9000).games[0]!, confirmedUpTo: 1 };

    assert.deepEqual(pendingGames(adoptGame(EMPTY_LOG, pulled)), []);
  });
});
