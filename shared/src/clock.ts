// Putting a machine's own clock right.
//
// An evening can be played on a laptop whose clock is days out and only sync
// afterwards. The timestamps it wrote are consistent with each other — they
// came from one clock — so the fix is one offset for the batch rather than a
// guess per event: the difference between that clock and the server's, measured
// at the moment the batch arrives.

/** The gap between the server's clock and the client's, in milliseconds. */
export function clockSkewMs(clientNow: number, serverNow: number): number {
  return Number.isFinite(clientNow) ? serverNow - clientNow : 0;
}

/**
 * When an event really happened, as far as the server can tell.
 *
 * A clock that is right gives a skew of a few milliseconds and changes
 * nothing; a clock that is a week behind moves the whole evening into place,
 * in the right order and with the right gaps.
 */
export function correctedAt(at: number, skewMs: number): number {
  return Math.round(at + skewMs);
}
