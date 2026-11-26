// The game must never need the backend.
//
// "Ważne żeby na każdym etapie gry dało się go pominąć" — so this is not a
// preference about architecture, it is the requirement itself: an evening at
// somebody's house carries on when the Worker is down, not configured, or
// never set up at all. These checks hold the two halves apart, because the one
// thing that would break the promise quietly is a game screen that starts
// awaiting a request.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, test, vi } from "vitest";

/** Every source file under these directories, with its contents. */
function sources(...roots: readonly string[]): readonly { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;

      if (entry.isDirectory()) {
        walk(path);
      } else if (/\.tsx?$/.test(path)) {
        found.push({ path, text: readFileSync(path, "utf8") });
      }
    }
  };

  for (const root of roots) {
    walk(root);
  }

  return found;
}

/** What a file imports, as written. */
const importsOf = (text: string): readonly string[] =>
  [...text.matchAll(/from "([^"]+)"/g)].map((match) => match[1] ?? "");

describe("the rules of the game", () => {
  test("know nothing about the backend", () => {
    // The dependency runs one way only: the sync reads the game's log, and the
    // game has never heard of the sync. A round cannot wait for a request it
    // cannot make.
    const offenders = sources("src/game")
      .filter(({ text }) =>
        importsOf(text).some((from) => from.startsWith("@/backend") || from.includes("/backend/")),
      )
      .map(({ path }) => path);

    assert.deepEqual(offenders, []);
  });

  test("and nothing about the network at all", () => {
    const offenders = sources("src/game")
      .filter(({ text }) => /\bfetch\s*\(/.test(text))
      .map(({ path }) => path);

    assert.deepEqual(offenders, []);
  });
});

describe("the screens the game is played on", () => {
  test("never wait for the backend", () => {
    // `await` on a backend call inside a game screen is the one shape that
    // would make a round hang on a dead Worker. The Universe screen may wait —
    // that is all it is for — and so may the panel that offers a game to carry
    // on, before any round has started.
    const offenders = sources("src/components/game", "src/pages")
      .filter(({ path }) => !path.includes("ResumePanel") && !path.includes("UniversePage"))
      .filter(({ text }) => /await (?:request|call)\b/.test(text))
      .map(({ path }) => path);

    assert.deepEqual(offenders, []);
  });
});

describe("with no backend configured at all", () => {
  test("the store, the log and the replay work exactly as they do with one", async () => {
    vi.stubEnv("VITE_API_URL", "");
    vi.resetModules();

    const { hasBackend } = await import("@/backend/config");
    const store = await import("@/game/gameStore");
    const { replay } = await import("@/game/eventLog");
    const { createGameState } = await import("@/game/gameState");
    const { stubStorage } = await import("./support/storage");
    const { ALA, BO, RULES, track } = await import("./support/game");

    assert.equal(hasBackend, false);

    const storage = stubStorage();
    const catalogue = [track("t1")];
    const origin = { players: [ALA, BO], rules: RULES, playedIds: [] as readonly string[] };

    try {
      const log = store.beginGame(store.EMPTY_LOG, {
        id: "g1",
        historyKey: "p1",
        origin,
        catalogue,
        at: 1000,
      });

      assert.equal(store.writeGameLog(log), true);

      const kept = store.readGameLog().games[0];

      assert.ok(kept);
      assert.deepEqual(
        replay(kept.origin, kept.catalogue, kept.events),
        createGameState([ALA, BO], RULES, catalogue),
      );
      // And nothing is waiting to be sent anywhere, because there is nowhere.
      assert.equal(kept.universeId, null);
    } finally {
      storage.restore();
      vi.unstubAllEnvs();
    }
  });
});
