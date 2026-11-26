// @vitest-environment happy-dom
//
// The log hook, rendered: what a game is opened with has to be what ends up in
// the store, because everything downstream — the history, the shared pool,
// whether an evening can be carried on elsewhere — reads it from there.
import assert from "node:assert/strict";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, test, vi } from "vitest";

import { readGameLog } from "@/game/gameStore";
import { useGameLog, type GameLogHandle } from "@/game/useGameLog";
import type { GameAction } from "@/game/gameState";

import { ALA, BO, RULES, track } from "./support/game";
import { stubStorage, type FakeStorage } from "./support/storage";

const catalogue = [track("t1")];
const origin = { players: [ALA, BO], rules: RULES, playedIds: [] as readonly string[] };

const round: GameAction = {
  type: "start-round",
  track: catalogue[0]!,
  startPositionMs: 0,
  direction: null,
  lyricsOnly: false,
  lyricsFrom: 0,
  pool: [],
};

/**
 * Mounts the hook the way a game board does, plays one round, and lets the
 * deferred write happen — storing is put off by a tick on purpose, so that a
 * press that pauses the music never waits on the browser's store.
 */
async function play(universeId: string | null) {
  let handle: GameLogHandle | null = null;

  function Probe() {
    handle = useGameLog({ resumedId: null, historyKey: "p1", universeId, origin, catalogue });

    return null;
  }

  render(<Probe />);
  assert.ok(handle);
  (handle as GameLogHandle).record(round);
  await new Promise((resolve) => setTimeout(resolve, 0));

  return readGameLog();
}

let storage: FakeStorage | null = null;

beforeEach(() => {
  vi.resetModules();
  storage = stubStorage();
});

afterEach(() => {
  storage?.restore();
  storage = null;
});

describe("opening a game", () => {
  test("a universe game is written down as belonging to that universe", async () => {
    const log = await play("universe-1");

    assert.equal(log.games[0]?.universeId, "universe-1");
  });

  test("and a free-play game as belonging to none", async () => {
    assert.equal((await play(null)).games[0]?.universeId, null);
  });

  test("with the line-up, the rules and the playlist it was started on", async () => {
    const log = await play("universe-1");

    assert.deepEqual(log.games[0]?.origin.players, [ALA, BO]);
    assert.equal(log.games[0]?.historyKey, "p1");
    assert.equal(log.games[0]?.events.length, 1);
  });
});
