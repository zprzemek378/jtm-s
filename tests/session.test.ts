// The backend's own sessions: what a token says, and what it refuses to say.
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { bearer, mintSession, readSession } from "@server/auth";
import { listSetting, mayCreateUniverse } from "@server/settings";
import { clockSkewMs, correctedAt } from "@jtm-s/shared";

const SECRET = "a-test-secret";
const NOW = 1_764_000_000_000;
const account = { id: "spotify-user", displayName: "Ala" };

describe("a session token", () => {
  test("names the account that signed in", async () => {
    const { token } = await mintSession(SECRET, account, NOW);

    assert.deepEqual(await readSession(SECRET, token, NOW + 1000), account);
  });

  test("runs out, rather than lasting for ever", async () => {
    const { token, expiresAt } = await mintSession(SECRET, account, NOW);

    assert.ok(expiresAt > NOW);
    assert.notEqual(await readSession(SECRET, token, expiresAt - 1), null);
    assert.equal(await readSession(SECRET, token, expiresAt), null);
  });

  test("is refused when it was signed with another key", async () => {
    const { token } = await mintSession(SECRET, account, NOW);

    assert.equal(await readSession("a-different-secret", token, NOW), null);
  });

  test("is refused when its claims have been rewritten", async () => {
    const { token } = await mintSession(SECRET, account, NOW);
    const [version, , signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "somebody-else", exp: NOW + 1e9 })).toString(
      "base64url",
    );

    assert.equal(await readSession(SECRET, `${version}.${forged}.${signature}`, NOW), null);
  });

  test("is refused when it is nonsense, missing, or of a format we no longer issue", async () => {
    for (const token of [null, "", "nonsense", "v1.only-two", "v0.a.b"]) {
      assert.equal(await readSession(SECRET, token, NOW), null, String(token));
    }
  });

  test("carries the display name, so the client need not ask again", async () => {
    const { token } = await mintSession(SECRET, { id: "x", displayName: "Zażółć" }, NOW);

    assert.equal((await readSession(SECRET, token, NOW))?.displayName, "Zażółć");
  });
});

describe("the header a session arrives in", () => {
  test("is read, and only in the form it is sent", () => {
    assert.equal(bearer("Bearer abc.def.ghi"), "abc.def.ghi");
    assert.equal(bearer(null), null);
    assert.equal(bearer("abc"), null);
    assert.equal(bearer("Basic abc"), null);
  });
});

describe("who may start a universe", () => {
  test("only the accounts named in the setting", () => {
    const env = { UNIVERSE_CREATORS: "ala, bo " } as { UNIVERSE_CREATORS?: string };

    assert.equal(mayCreateUniverse(env as never, "ala"), true);
    assert.equal(mayCreateUniverse(env as never, "bo"), true);
    assert.equal(mayCreateUniverse(env as never, "cy"), false);
  });

  test("and nobody at all when it is unset, which is how it starts", () => {
    assert.equal(mayCreateUniverse({} as never, "ala"), false);
    assert.deepEqual([...listSetting(undefined)], []);
    assert.deepEqual([...listSetting(" , ")], []);
  });
});

describe("putting a machine's clock right", () => {
  test("a clock that agrees changes nothing", () => {
    assert.equal(clockSkewMs(NOW, NOW), 0);
    assert.equal(correctedAt(NOW, 0), NOW);
  });

  test("a clock a week behind moves the whole evening into place", () => {
    const week = 7 * 24 * 60 * 60 * 1000;
    const skew = clockSkewMs(NOW - week, NOW);

    assert.equal(skew, week);
    // The gaps inside the batch are kept: it was one clock, just a wrong one.
    assert.equal(correctedAt(NOW - week, skew), NOW);
    assert.equal(correctedAt(NOW - week + 5000, skew) - correctedAt(NOW - week, skew), 5000);
  });

  test("a clock ahead is pulled back the same way", () => {
    assert.equal(correctedAt(NOW + 60_000, clockSkewMs(NOW + 60_000, NOW)), NOW);
  });

  test("a clock that answers with nonsense is left alone rather than trusted", () => {
    assert.equal(clockSkewMs(Number.NaN, NOW), 0);
    assert.equal(correctedAt(NOW, clockSkewMs(Number.NaN, NOW)), NOW);
  });
});
