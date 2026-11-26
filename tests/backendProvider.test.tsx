// @vitest-environment happy-dom
//
// The provider, rendered.
//
// Everything else here is checked without React, because the rules of the game
// are pure and the sync is a function. This one is not: it is effects, and the
// way effects go wrong is by setting the state they are watching — which reads
// as perfectly sensible code and costs hundreds of requests a second. That
// cannot be found by reading, so it is found here.
import assert from "node:assert/strict";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, test, vi } from "vitest";

import { json, stubFetch, type Call, type FetchStub } from "./support/fetch";
import { stubStorage, type FakeStorage } from "./support/storage";

/** A connected Spotify, which is all the provider wants of it. */
vi.mock("@/spotify/useSpotify", () => ({
  useSpotify: () => ({
    status: "logged-in",
    getAccessToken: () => Promise.resolve("spotify-token"),
  }),
}));

const account = { id: "spotify-user", displayName: "Host" };

/** The backend's answers: a session, then the same account for ever. */
const backend = (): ((call: Call) => Response) => {
  return (call: Call) => {
    const path = new URL(call.url).pathname;

    if (path === "/session") {
      return json({ token: "session-1", expiresAt: Date.now() + 86_400_000, account })();
    }

    if (path === "/me") {
      // A fresh object every time, as a real backend sends: the provider has to
      // notice that it says the same thing.
      return json({ account: { ...account }, universes: [] })();
    }

    return json({ ok: true })();
  };
};

let storage: FakeStorage | null = null;
let fetched: FetchStub | null = null;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_API_URL", "https://api.example");
  storage = stubStorage();
});

afterEach(() => {
  fetched?.restore();
  storage?.restore();
  fetched = null;
  storage = null;
  vi.unstubAllEnvs();
});

/** Renders the provider and gives back how many times each path was called. */
async function mounted() {
  const { BackendProvider } = await import("@/backend/BackendProvider");

  render(<BackendProvider>{null}</BackendProvider>);

  const count = (path: string) =>
    (fetched?.calls ?? []).filter((call) => new URL(call.url).pathname === path).length;

  return { count };
}

describe("signing in and reading the account", () => {
  test("happens once, and stays once", async () => {
    fetched = stubFetch([backend()]);

    const { count } = await mounted();

    await waitFor(() => assert.equal(count("/me"), 1));

    // The shape of the bug this exists for: the account is read, which replaces
    // the session, which is what the reading hangs off — so it reads again.
    // A second of that would be hundreds of calls.
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert.equal(count("/session"), 1, "signed in once");
    assert.equal(count("/me"), 1, "read the account once");
  });

  test("with a session already stored, it does not sign in again", async () => {
    storage?.entries.set(
      "jtm-s.backend-session",
      JSON.stringify({ token: "stored-1", expiresAt: Date.now() + 86_400_000, account }),
    );
    fetched = stubFetch([backend()]);

    const { count } = await mounted();

    await waitFor(() => assert.equal(count("/me"), 1));
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert.equal(count("/session"), 0, "the stored session is the session");
    assert.equal(count("/me"), 1);
  });

  test("a backend that refuses is asked once, not until it gives in", async () => {
    fetched = stubFetch([() => json({ error: "nope" }, 500)()]);

    await mounted();
    await new Promise((resolve) => setTimeout(resolve, 400));

    assert.equal(
      (fetched?.calls ?? []).length,
      1,
      "one attempt per sign-in; the button is how to ask again",
    );
  });

  test("and with no backend configured, nothing is asked at all", async () => {
    vi.stubEnv("VITE_API_URL", "");
    fetched = stubFetch([backend()]);

    await mounted();
    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.deepEqual(fetched?.calls, []);
  });
});
