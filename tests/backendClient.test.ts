// Talking to our own backend: what a failure is taken to mean.
//
// This is the decision the whole offline-first side rests on — whether to keep
// an evening and send it later, or to stop trying — so it is checked here
// rather than left to a status code at each call site.
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test, vi } from "vitest";

import { json, stubFetch, text, type Call, type FetchStub } from "./support/fetch";

const headersOf = (call: Call | undefined) => (call?.init?.headers ?? {}) as Record<string, string>;

/**
 * The client reads the backend's address when it is imported, so each test
 * imports it afresh with the address in place.
 */
async function client() {
  vi.stubEnv("VITE_API_URL", "https://api.example/");

  return import("@/backend/client");
}

let stub: FetchStub | null = null;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  stub?.restore();
  stub = null;
  vi.unstubAllEnvs();
});

async function failureOf(run: () => Promise<unknown>) {
  const { BackendError } = await client();

  try {
    await run();
  } catch (thrown) {
    assert.ok(thrown instanceof BackendError, `threw ${String(thrown)}`);

    return thrown;
  }

  throw new assert.AssertionError({ message: "the call was expected to fail" });
}

describe("a call that works", () => {
  test("reaches the configured address and brings the answer back", async () => {
    const { call } = await client();

    stub = stubFetch([json({ ok: true })]);

    assert.deepEqual(await call("/me", { token: "session-1" }), { ok: true });
    assert.equal(stub.calls[0]?.url, "https://api.example/me");
    assert.equal(headersOf(stub.calls[0]).Authorization, "Bearer session-1");
  });

  test("sends a body as JSON, and says so only when there is one", async () => {
    const { call } = await client();

    stub = stubFetch([json({ ok: true })]);

    await call("/games/g1", { method: "PUT", body: { startedAt: 1 } });
    await call("/me");

    assert.equal(headersOf(stub.calls[0])["Content-Type"], "application/json");
    assert.equal(stub.calls[0]?.init?.body, '{"startedAt":1}');
    assert.equal(headersOf(stub.calls[1])["Content-Type"], undefined);
  });

  test("an empty answer is nothing, not a parse error", async () => {
    const { call } = await client();

    stub = stubFetch([() => new Response(null, { status: 204 })]);

    assert.equal(await call("/games/g1"), null);
  });
});

describe("a call that fails", () => {
  test("nothing answering is worth trying again — the evening is kept", async () => {
    const { BackendFailure } = await client();
    const original = globalThis.fetch;

    globalThis.fetch = (() => Promise.reject(new TypeError("Failed to fetch"))) as typeof fetch;

    try {
      const error = await failureOf(async () => (await client()).call("/me"));

      assert.equal(error.failure, BackendFailure.Unreachable);
      assert.equal(error.worthRetrying, true);
    } finally {
      globalThis.fetch = original;
    }
  });

  test("a fault at the backend is treated the same way", async () => {
    const { BackendFailure, call } = await client();

    stub = stubFetch([json({ error: "something went wrong here" }, 500)]);

    const error = await failureOf(() => call("/me"));

    assert.equal(error.failure, BackendFailure.Unreachable);
    assert.equal(error.worthRetrying, true);
  });

  test("a session it will not accept has to be signed in again, not retried", async () => {
    const { BackendFailure, call } = await client();

    stub = stubFetch([json({ error: "sign in again" }, 401)]);

    const error = await failureOf(() => call("/me", { token: "stale" }));

    assert.equal(error.failure, BackendFailure.Unauthorized);
    assert.equal(error.worthRetrying, false);
  });

  test("a refusal on purpose is final, and keeps the reason it was given", async () => {
    const { BackendFailure, call } = await client();

    stub = stubFetch([json({ error: "this account cannot create universes" }, 403)]);

    const error = await failureOf(() => call("/universes", { method: "POST" }));

    assert.equal(error.failure, BackendFailure.Refused);
    assert.equal(error.worthRetrying, false);
    assert.equal(error.message, "this account cannot create universes");
    assert.equal(error.status, 403);
  });

  test("a refusal with nothing to say falls back to the status line", async () => {
    const { call } = await client();

    stub = stubFetch([text("<html>", 404)]);

    assert.ok((await failureOf(() => call("/universes/u1"))).message.length > 0);
  });
});

describe("with no backend configured", () => {
  test("every call says so at once, without reaching for the network", async () => {
    vi.stubEnv("VITE_API_URL", "");

    const { BackendError, BackendFailure, call, hasBackend } =
      await import("@/backend/client").then(async (module) => ({
        ...module,
        ...(await import("@/backend/config")),
      }));
    const original = globalThis.fetch;
    let called = false;

    globalThis.fetch = (() => {
      called = true;

      return Promise.resolve(new Response("{}"));
    }) as typeof fetch;

    try {
      await call("/me");
      assert.fail("the call should have been refused");
    } catch (thrown) {
      assert.ok(thrown instanceof BackendError);
      assert.equal(thrown.failure, BackendFailure.Absent);
      assert.equal(called, false);
      assert.equal(hasBackend, false);
    } finally {
      globalThis.fetch = original;
    }
  });
});
