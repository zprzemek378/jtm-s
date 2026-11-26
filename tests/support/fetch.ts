// Standing in for Spotify.
//
// The transport is the only module that calls `fetch`, so a stub here is the
// whole seam: the suites hand it replies and read back what was asked for.

export type Call = { url: string; init: RequestInit | undefined };

export type FetchStub = {
  calls: Call[];
  /** Restores whatever `fetch` was before. */
  restore: () => void;
};

/** Answers every call with the next reply, repeating the last one for ever. */
export function stubFetch(replies: readonly (() => Response)[]): FetchStub {
  const original = globalThis.fetch;
  const calls: Call[] = [];

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });

    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];

    return Promise.resolve(reply!());
  }) as typeof fetch;

  return { calls, restore: () => void (globalThis.fetch = original) };
}

export const json =
  (payload: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });

export const noContent = () => () => new Response(null, { status: 204 });

export const text =
  (body: string, status = 200) =>
  () =>
    new Response(body, { status, headers: { "Content-Type": "text/plain" } });

/** A reply with a body but no `Content-Type` at all, as the player has sent. */
export const untyped =
  (body: string, status = 200) =>
  () =>
    new Response(body, { status });

export const token = () => Promise.resolve("token-1");
