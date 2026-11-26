// Sending an evening to the backend.
//
// The one part of this with nothing between it and real data: it reads the
// store, talks to the network and writes back what arrived. So it is checked
// against a store that can refuse and a network that can fail, rather than
// against a mock of itself.
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test, vi } from "vitest";

import type { LoggedEvent } from "@/game/eventLog";
import type { GameLog } from "@/game/gameStore";

import { ALA, BO, RULES, track } from "./support/game";
import { json, stubFetch, type Call, type FetchStub, type Reply } from "./support/fetch";
import { stubStorage, type FakeStorage } from "./support/storage";

const catalogue = [track("t1"), track("t2")];
const origin = { players: [ALA, BO], rules: RULES, playedIds: [] as readonly string[] };

/** The modules, with the backend's address in place before they are read. */
async function modules() {
  vi.stubEnv("VITE_API_URL", "https://api.example");

  return {
    ...(await import("@/game/gameStore")),
    sync: await import("@/backend/sync"),
  };
}

type Store = Awaited<ReturnType<typeof modules>>;

/** A game with `events` rounds written down, stored and ready to send. */
function stored(store: Store, id: string, events: number, at = 1000): GameLog {
  let log = store.beginGame(store.EMPTY_LOG, {
    id,
    historyKey: "p1",
    universeId: "u1",
    origin,
    catalogue,
    at,
  });

  for (let index = 0; index < events; index += 1) {
    log = store.appendAction(
      log,
      id,
      index === 0
        ? {
            type: "start-round",
            track: catalogue[0]!,
            startPositionMs: 0,
            direction: null,
            lyricsOnly: false,
            lyricsFrom: 0,
            pool: catalogue.slice(1),
          }
        : { type: "reveal" },
      at + index + 1,
    );
  }

  return log;
}

/** Answers an events call with everything it was sent. */
const accept: Reply = (call: Call) => {
  const body = JSON.parse(String(call.init?.body)) as { events: readonly LoggedEvent[] };
  const last = body.events[body.events.length - 1]?.seq ?? 0;

  return json({ confirmedUpTo: last, serverNow: 5000 })();
};

/**
 * A backend that accepts everything, bar whatever a test says otherwise about
 * one path. Routed rather than ordered, because the calls a push makes depend
 * on what it finds.
 */
function backend(overrides: Record<string, Reply> = {}): Reply {
  return (call) => {
    const path = new URL(call.url).pathname;
    const override = overrides[path];

    return override
      ? override(call)
      : path.endsWith("/events")
        ? accept(call)
        : json({ ok: true })();
  };
}

/** Stores several games, oldest first, as a machine played offline would hold. */
function storeAll(store: Store, games: readonly { id: string; events: number; at: number }[]) {
  const logs = games.map((game) => stored(store, game.id, game.events, game.at));

  store.writeGameLog({
    ...logs[logs.length - 1]!,
    games: logs.flatMap((log) => [...log.games]),
  });
}

const bodyOf = (call: Call | undefined) =>
  JSON.parse(String(call?.init?.body)) as Record<string, unknown>;

let storage: FakeStorage | null = null;
let fetched: FetchStub | null = null;

beforeEach(() => {
  vi.resetModules();
  storage = stubStorage();
});

afterEach(() => {
  fetched?.restore();
  storage?.restore();
  fetched = null;
  storage = null;
  vi.unstubAllEnvs();
});

describe("sending a game", () => {
  test("stores the game itself, then what happened in it", async () => {
    const store = await modules();

    store.writeGameLog(stored(store, "g1", 2));
    fetched = stubFetch([backend()]);

    const outcome = await store.sync.pushPending("session-1");

    assert.equal(outcome.sent, 1);
    assert.equal(outcome.pending, 0);
    assert.equal(outcome.failure, null);
    assert.deepEqual(
      fetched.calls.map((call) => `${call.init?.method} ${new URL(call.url).pathname}`),
      ["PUT /games/g1", "POST /games/g1/events"],
    );
  });

  test("the acknowledgement is written back, so nothing is sent twice", async () => {
    const store = await modules();

    store.writeGameLog(stored(store, "g1", 2));
    fetched = stubFetch([backend()]);

    await store.sync.pushPending("session-1");

    assert.equal(store.readGameLog().games[0]?.confirmedUpTo, 2);
    assert.deepEqual(store.pendingGames(store.readGameLog()), []);

    // A second attempt has nothing to do and says so without asking.
    const again = await store.sync.pushPending("session-1");

    assert.equal(again.sent, 0);
    assert.equal(fetched.calls.length, 2);
  });

  test("only what the backend has not seen goes out", async () => {
    const store = await modules();

    store.writeGameLog(store.markConfirmed(stored(store, "g1", 5), "g1", 3));
    fetched = stubFetch([backend()]);

    await store.sync.pushPending("session-1");

    assert.deepEqual(
      (bodyOf(fetched.calls[1]).events as readonly LoggedEvent[]).map((event) => event.seq),
      [4, 5],
    );
  });

  test("a long evening goes in batches, and each one is acknowledged before the next", async () => {
    const store = await modules();

    store.writeGameLog(stored(store, "g1", 250));
    fetched = stubFetch([backend()]);

    await store.sync.pushPending("session-1");

    const batches = fetched.calls
      .filter((call) => call.url.endsWith("/events"))
      .map((call) => (bodyOf(call).events as readonly LoggedEvent[]).length);

    assert.deepEqual(batches, [200, 50]);
    assert.equal(store.readGameLog().games[0]?.confirmedUpTo, 250);
  });

  test("the client's own clock rides along, for the correction at the other end", async () => {
    const store = await modules();

    store.writeGameLog(stored(store, "g1", 1));
    fetched = stubFetch([backend()]);

    await store.sync.pushPending("session-1");

    assert.equal(typeof bodyOf(fetched.calls[1]).clientNow, "number");
  });

  test("the game carries what this client holds, so a taken-back move is taken back there", async () => {
    const store = await modules();

    store.writeGameLog(store.truncateEvents(stored(store, "g1", 4), "g1", 2));
    fetched = stubFetch([backend()]);

    await store.sync.pushPending("session-1");

    assert.equal(bodyOf(fetched.calls[0]).upTo, 2);
  });
});

describe("the track list", () => {
  test("goes with a game that is still being played, so it can be picked up elsewhere", async () => {
    const store = await modules();

    store.writeGameLog(stored(store, "g1", 1));
    fetched = stubFetch([backend()]);

    await store.sync.pushPending("session-1");

    assert.equal((bodyOf(fetched.calls[0]).catalogue as readonly unknown[]).length, 2);
  });

  test("is left behind when it is too large to be worth storing", async () => {
    const store = await modules();
    const log = stored(store, "g1", 1);
    const huge = Array.from({ length: 3000 }, (_, index) => track(`big-${index}`));

    store.writeGameLog({
      ...log,
      games: log.games.map((game) => ({ ...game, catalogue: huge })),
    });
    fetched = stubFetch([backend()]);

    await store.sync.pushPending("session-1");

    // Not sent at all, rather than sent as nothing: the backend keeps the copy
    // it already has, which is what lets the game be picked up elsewhere.
    assert.equal("catalogue" in bodyOf(fetched.calls[0]), false);
    // The titles that were played still go: they are what a history reads.
    assert.ok(Array.isArray(bodyOf(fetched.calls[0]).tracks));
  });

  test("and a game that has ended sends its titles instead", async () => {
    const store = await modules();

    store.writeGameLog(store.closeGame(stored(store, "g1", 1), "g1", 9000));
    fetched = stubFetch([backend()]);

    await store.sync.pushPending("session-1");

    const body = bodyOf(fetched.calls[0]);

    assert.equal("catalogue" in body, false);
    assert.deepEqual(body.tracks, [{ id: "t1", name: "Song t1", artists: "Someone" }]);
    assert.equal(body.closedAt, 9000);
  });
});

describe("a game that has ended", () => {
  test("is acknowledged as ended, even with nothing left to send", async () => {
    const store = await modules();
    const sent = store.markConfirmed(stored(store, "g1", 2), "g1", 2);

    store.writeGameLog(store.closeGame(sent, "g1", 9000));
    assert.deepEqual(
      store.pendingGames(store.readGameLog()).map((game) => game.id),
      ["g1"],
      "the end of a game is something to send in itself",
    );

    fetched = stubFetch([backend()]);

    await store.sync.pushPending("session-1");

    assert.equal(store.readGameLog().games[0]?.closedSent, true);
    assert.deepEqual(store.pendingGames(store.readGameLog()), []);
    // Nothing but the game itself: there were no events left to send.
    assert.deepEqual(
      fetched.calls.map((call) => call.init?.method),
      ["PUT"],
    );
  });
});

describe("when it cannot be sent", () => {
  test("nothing answering leaves the evening exactly where it was", async () => {
    const store = await modules();
    const before = store.writeGameLog(stored(store, "g1", 2)) && store.readGameLog();

    fetched = stubFetch([backend({ "/games/g1": () => json({ error: "nope" }, 500)() })]);

    const outcome = await store.sync.pushPending("session-1");

    assert.equal(outcome.sent, 0);
    assert.equal(outcome.pending, 1);
    assert.equal(outcome.failure?.worthRetrying, true);
    assert.deepEqual(store.readGameLog(), before);
  });

  test("it stops at the first game, rather than asking a dead backend twice", async () => {
    const store = await modules();
    storeAll(store, [
      { id: "g1", events: 1, at: 1000 },
      { id: "g2", events: 1, at: 2000 },
    ]);
    assert.equal(store.pendingGames(store.readGameLog()).length, 2);

    fetched = stubFetch([() => json({ error: "nope" }, 503)()]);

    const outcome = await store.sync.pushPending("session-1");

    assert.equal(outcome.pending, 2);
    assert.equal(fetched.calls.length, 1, "one attempt, not one per game");
  });

  test("a refusal is about that game alone, so the next one is still tried", async () => {
    const store = await modules();
    storeAll(store, [
      { id: "g1", events: 1, at: 1000 },
      { id: "g2", events: 1, at: 2000 },
    ]);

    fetched = stubFetch([
      backend({ "/games/g1": () => json({ error: "no such universe" }, 404)() }),
    ]);

    const outcome = await store.sync.pushPending("session-1");

    assert.equal(outcome.sent, 1, "the second one went");
    assert.equal(outcome.pending, 1, "the refused one is still waiting");
    assert.equal(outcome.failure?.worthRetrying, false);
  });

  test("a partly sent evening keeps what arrived and no more", async () => {
    const store = await modules();

    store.writeGameLog(stored(store, "g1", 250));
    // The first batch lands; the second finds nothing at the other end.
    let batches = 0;

    fetched = stubFetch([
      backend({
        "/games/g1/events": (call) => {
          batches += 1;

          return batches === 1 ? accept(call) : json({ error: "gone" }, 500)();
        },
      }),
    ]);

    const outcome = await store.sync.pushPending("session-1");

    assert.equal(outcome.failure?.worthRetrying, true);
    assert.equal(store.readGameLog().games[0]?.confirmedUpTo, 200);
    assert.deepEqual(
      store.pendingGames(store.readGameLog()).map((game) => game.id),
      ["g1"],
    );
  });

  test("a backend that accepts a batch and still reports nothing is not asked again", async () => {
    const store = await modules();

    store.writeGameLog(stored(store, "g1", 3));
    fetched = stubFetch([
      backend({ "/games/g1/events": () => json({ confirmedUpTo: 0, serverNow: 1 })() }),
    ]);

    await store.sync.pushPending("session-1");

    assert.equal(
      fetched.calls.filter((call) => call.url.endsWith("/events")).length,
      1,
      "sending the same batch for ever would be worse than giving up",
    );
  });
});
