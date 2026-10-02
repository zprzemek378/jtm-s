// The one queue through which everything bound for Spotify passes.
//
// Spotify counts requests per application over a rolling window, so a burst
// from one person costs everyone sharing the Client ID; a limit tripped that
// way has been measured at over twenty hours. A single queue is what makes the
// rate a fact rather than a hope: separate queues, however careful each one is,
// can always burst side by side.
//
// Because it is one queue, it has to tell urgent work from patient work itself.
// A request says what it needs through a policy rather than by picking a queue,
// so the decision sits next to the call it describes.

import { PRIORITY_AGING_MS, REQUEST_GAP_MS } from "@/constants/spotify";

/**
 * How badly a request wants to go first, from 0 to 10.
 *
 * Named rather than written out at the call sites, so the levels stay
 * comparable and a reader can see what competes with what.
 */
export const Priority = {
  /** Anything nobody is waiting for. */
  Background: 0,
  /** Reading playlists and profiles: a person is watching a spinner. */
  Catalogue: 3,
  /** Starting, seeking, shuffling — the room notices the delay. */
  Playback: 7,
  /** Pausing because somebody buzzed. Must feel instant. */
  Urgent: 10,
} as const;

export const MAX_PRIORITY = 10;

export type RequestPolicy = {
  /** From `Priority`, or a number from 0 to 10. Defaults to `Background`. */
  priority?: number;

  /**
   * Makes a newer request replace one with the same key that has not started.
   *
   * For a command that merely sets a value — seeking is the example — every
   * position but the last is already stale by the time it could be sent.
   * Spacing them out would send them all, just more slowly; replacing sends one
   * request for the position actually chosen. Every caller still gets the same
   * answer, because they share the one outcome.
   *
   * Wrong for anything that is an event rather than a value: pausing and
   * resuming are not two versions of the same thing, and merging them would
   * lose one.
   */
  coalesceKey?: string;

  /**
   * Whether a 429 is waited out and retried. True by default, and false where
   * pressing on is the greater risk — a rate limit during the playlist scan
   * means the walk is already at the edge of the quota.
   */
  retryRateLimit?: boolean;
};

type Entry = {
  run: () => Promise<unknown>;
  priority: number;
  coalesceKey: string | undefined;
  enqueuedAt: number;
  promise: Promise<unknown>;
  settle: (outcome: () => Promise<unknown>) => void;
};

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const waiting: Entry[] = [];
let draining = false;
let lastStartedAt = 0;

/** Priority as it stands now, including whatever waiting has earned. */
function standing(entry: Entry, now: number): number {
  const earned = Math.floor((now - entry.enqueuedAt) / PRIORITY_AGING_MS);

  return Math.min(MAX_PRIORITY, entry.priority + earned);
}

/**
 * Takes the request with the most standing, oldest first among equals.
 *
 * Chosen after the gap has been waited out rather than before, so a request
 * that arrives during the wait is still considered.
 */
function takeNext(): Entry | undefined {
  if (waiting.length === 0) {
    return undefined;
  }

  const now = Date.now();
  let best = 0;

  for (let index = 1; index < waiting.length; index += 1) {
    if (standing(waiting[index]!, now) > standing(waiting[best]!, now)) {
      best = index;
    }
  }

  return waiting.splice(best, 1)[0];
}

async function drain(): Promise<void> {
  if (draining) {
    return;
  }

  draining = true;

  try {
    while (waiting.length > 0) {
      const sinceLast = Date.now() - lastStartedAt;

      if (sinceLast < REQUEST_GAP_MS) {
        await sleep(REQUEST_GAP_MS - sinceLast);
      }

      const entry = takeNext();

      if (!entry) {
        break;
      }

      lastStartedAt = Date.now();
      entry.settle(entry.run);
    }
  } finally {
    draining = false;
  }
}

/**
 * Puts a request in the queue and returns what it produces.
 *
 * A request that is already due runs with no delay at all, so an occasional
 * call is as quick as it ever was; only a burst is spaced out.
 */
export function schedule<T>(task: () => Promise<T>, policy: RequestPolicy = {}): Promise<T> {
  const { priority = Priority.Background, coalesceKey } = policy;

  if (coalesceKey !== undefined) {
    const queued = waiting.find((entry) => entry.coalesceKey === coalesceKey);

    // Keeps its place in the queue and its promise; only the work changes, so
    // everyone waiting on it gets the newest answer rather than a stale one.
    if (queued) {
      queued.run = task;

      return queued.promise as Promise<T>;
    }
  }

  let settle!: Entry["settle"];
  const promise = new Promise<T>((resolve, reject) => {
    settle = (outcome) => {
      // The queue moves on to the next request without waiting for this one to
      // finish travelling; the gap governs when requests start, not how long
      // they take.
      outcome().then(resolve as (value: unknown) => void, reject);
    };
  });

  waiting.push({
    run: task,
    priority,
    coalesceKey,
    enqueuedAt: Date.now(),
    promise,
    settle,
  });

  void drain();

  return promise;
}

/** How many requests are waiting. Used by the tests, and useful in a console. */
export function queueDepth(): number {
  return waiting.length;
}
