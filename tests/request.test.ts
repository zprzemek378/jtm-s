// The one place that speaks HTTP: what it sends, what it makes of a reply, and
// how a failure arrives upstairs.
import assert from "node:assert/strict";
import { afterEach, describe, test } from "vitest";

import { request } from "@/spotify/transport/request";
import { SpotifyError, SpotifyErrorKind } from "@/spotify/types";

import {
  json,
  noContent,
  stubFetch,
  text,
  token,
  untyped,
  type Call,
  type FetchStub,
} from "./support/fetch";

let stub: FetchStub | null = null;

afterEach(() => {
  stub?.restore();
  stub = null;
});

function answering(...replies: (() => Response)[]) {
  stub = stubFetch(replies);

  return stub;
}

const headersOf = (call: Call | undefined) => (call?.init?.headers ?? {}) as Record<string, string>;

/** The error a call threw, or a failure if it did not throw. */
async function errorFrom(call: Promise<unknown>): Promise<SpotifyError> {
  try {
    await call;
  } catch (error) {
    assert.ok(error instanceof SpotifyError, `threw ${String(error)}`);

    return error;
  }

  throw new assert.AssertionError({ message: "the call was expected to fail" });
}

describe("what goes out", () => {
  test("the token rides on every call, and the path hangs off the API root", async () => {
    const calls = answering(json({ ok: true })).calls;

    await request(token, "/me/player/devices");

    assert.equal(calls[0]?.url, "https://api.spotify.com/v1/me/player/devices");
    assert.deepEqual(headersOf(calls[0]), { Authorization: "Bearer token-1" });
  });

  test("a read carries no content type, which would cost a preflight on every one", async () => {
    const calls = answering(json({})).calls;

    await request(token, "/me");

    assert.equal(headersOf(calls[0])["Content-Type"], undefined);
  });

  test("a write that carries a body says what the body is", async () => {
    const calls = answering(noContent()).calls;

    await request(token, "/me/player/play", { method: "PUT", body: "{}" });

    assert.equal(headersOf(calls[0])["Content-Type"], "application/json");
  });
});

describe("what comes back", () => {
  test("a reply that says it is JSON is read as JSON", async () => {
    answering(json({ devices: [{ id: "d1" }] }));

    assert.deepEqual(await request(token, "/me/player/devices"), { devices: [{ id: "d1" }] });
  });

  test("the empty 204 the playback commands answer with is nothing", async () => {
    answering(noContent());

    assert.equal(await request(token, "/me/player/pause", { method: "PUT" }), null);
  });

  test("a reply that does not say it is JSON is nothing, not a parse error", async () => {
    answering(text("u3Ys00GhYB"));

    assert.equal(await request(token, "/me/player/play", { method: "PUT" }), null);
  });

  test("and neither is one that says nothing about itself", async () => {
    answering(untyped("u3Ys00GhYB"));

    assert.equal(await request(token, "/me/player/play", { method: "PUT" }), null);
  });

  test("an empty body is nothing even when it claims to be JSON", async () => {
    answering(
      () => new Response("", { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    assert.equal(await request(token, "/me/player/play", { method: "PUT" }), null);
  });
});

describe("when it fails", () => {
  test("each status becomes the kind the app acts on", async () => {
    const kinds = [
      [401, SpotifyErrorKind.Unauthorized],
      [403, SpotifyErrorKind.Forbidden],
      [404, SpotifyErrorKind.NotFound],
      [500, SpotifyErrorKind.Request],
    ] as const;

    for (const [status, kind] of kinds) {
      stub?.restore();
      answering(json({ error: { message: "nope" } }, status));

      const error = await errorFrom(request(token, "/me"));

      assert.equal(error.kind, kind, `status ${status}`);
      assert.equal(error.status, status);
    }
  });

  test("the message Spotify wrote is kept, behind the call that drew it", async () => {
    answering(json({ error: { message: "Device not found" } }, 404));

    const error = await errorFrom(request(token, "/me/player/play", { method: "PUT" }));

    assert.equal(error.message, "PUT /me/player/play — Device not found");
  });

  test("a failure with nothing to say falls back to the status line", async () => {
    answering(text("<html>502</html>", 502));

    assert.match((await errorFrom(request(token, "/me"))).message, /^GET \/me — /);
  });

  test("a rate limit is reported as such when waiting it out is not allowed", async () => {
    const stubbed = answering(json({ error: { message: "slow down" } }, 429));

    const error = await errorFrom(
      request(token, "/playlists/p1/items", {}, { retryRateLimit: false }),
    );

    assert.equal(error.kind, SpotifyErrorKind.RateLimited);
    assert.equal(stubbed.calls.length, 1, "it must not have been retried");
  });
});
