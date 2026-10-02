// Deciding whether two players hit their keys at the same moment.
//
// The threshold the host sets is measured in fractions of a millisecond, far
// below anything a timer can wait for. So nothing is timed: the presses that
// arrive are collected for a brief moment and then compared by the timestamps
// the browser put on the events themselves, which is the only record precise
// enough to answer the question.

import { roundInterval } from "@/helpers/keyboardLog";

import type { PlayerId } from "./types";

export type BuzzEntry = {
  playerId: PlayerId;
  /** The event's own timestamp, in milliseconds since the page's time origin. */
  at: number;
};

export type BuzzOutcome =
  /** One player was first by a clear margin. */
  | { kind: "single"; playerId: PlayerId }
  /** Two or more were indistinguishable; nobody may answer. */
  | { kind: "tie"; playerIds: readonly PlayerId[] };

/** The earliest press per player, in the order they arrived. */
function earliestPerPlayer(entries: readonly BuzzEntry[]): [PlayerId, number][] {
  const earliest = new Map<PlayerId, number>();

  for (const entry of entries) {
    const known = earliest.get(entry.playerId);

    if (known === undefined || entry.at < known) {
      earliest.set(entry.playerId, entry.at);
    }
  }

  return [...earliest.entries()].sort(([, left], [, right]) => left - right);
}

/**
 * Resolves a burst of presses.
 *
 * Presses are walked in order and each is compared to the one before it: while
 * the gap stays within `thresholdMs`, the chain grows. Three presses 0.2 ms
 * apart all tie at a threshold of 0.2 ms, even though the first and the last
 * are 0.4 ms apart — every press resets the reference. The chain ends at the
 * first gap that is too wide, and everybody after that is out, since they are
 * later still.
 *
 * The bound is inclusive — a gap of exactly the threshold ties — because that
 * is the number the host typed. Both sides are rounded to the precision the
 * interface displays before they are compared, so a gap the screen shows as
 * `0.200 ms` cannot lose to a threshold of 0.2 because it is really 0.2004
 * underneath.
 *
 * A null threshold means ties are switched off, so the first press simply wins
 * however close the others were.
 *
 * A player who somehow registers twice counts once — the earliest of their
 * presses is the one that matters.
 */
export function resolveBuzz(
  entries: readonly BuzzEntry[],
  thresholdMs: number | null,
): BuzzOutcome | null {
  if (entries.length === 0) {
    return null;
  }

  const ordered = earliestPerPlayer(entries);
  const [firstId] = ordered[0] as [PlayerId, number];

  if (thresholdMs === null) {
    return { kind: "single", playerId: firstId };
  }

  const limit = roundInterval(thresholdMs);
  const tied: PlayerId[] = [firstId];

  for (let index = 1; index < ordered.length; index += 1) {
    const gap =
      (ordered[index] as [PlayerId, number])[1] - (ordered[index - 1] as [PlayerId, number])[1];

    if (roundInterval(gap) > limit) {
      break;
    }

    tied.push((ordered[index] as [PlayerId, number])[0]);
  }

  return tied.length > 1 ? { kind: "tie", playerIds: tied } : { kind: "single", playerId: firstId };
}
