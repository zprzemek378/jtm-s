// Measuring the gaps between key presses, as precisely as a browser allows.
//
// Three things cap that precision, and it is worth naming them because the
// numbers on screen are only as good as the worst of them:
//
//  1. `KeyboardEvent.timeStamp` is a DOMHighResTimeStamp taken when the browser
//     created the event, not when our handler ran. It is the best source we
//     have — reading `performance.now()` inside the handler would also measure
//     however long the main thread was busy.
//  2. Browsers deliberately coarsen high-resolution time against timing
//     attacks, typically to 100 µs, or 1 ms where the page is not
//     cross-origin isolated. `measureClockResolution` reports what this page
//     actually gets rather than guessing.
//  3. The keyboard itself. A USB keyboard is usually polled at 125 Hz, so its
//     own reports land on an 8 ms grid whatever the browser can resolve.

export type KeyPress = {
  /** Monotonic id, so the list has stable keys even with identical presses. */
  id: number
  /** Milliseconds since the page's time origin. */
  at: number
  /** The physical key, e.g. `KeyQ`. */
  code: string
  /** What the layout produced, e.g. `q`. */
  key: string
  /** Gap from the previous press; null for the first one. */
  deltaMs: number | null
  /** False when the event carried no usable timestamp and the clock was read. */
  fromEvent: boolean
}

export type IntervalStats = {
  count: number
  minMs: number
  maxMs: number
  meanMs: number
  /**
   * Pairs of presses the clock could not tell apart — their timestamps came
   * out identical. Not a measurement of zero: it means the two landed inside
   * one tick of a clock the browser has deliberately coarsened.
   */
  sameTick: number
}

/**
 * The timestamp to trust for an event.
 *
 * A trusted `timeStamp` shares its origin with `performance.now()`, so the two
 * are interchangeable — but some environments report 0, and a zero here would
 * turn into an enormous fake gap.
 */
export function pressTime(
  eventTimeStamp: number,
  now: number,
): { at: number; fromEvent: boolean } {
  return Number.isFinite(eventTimeStamp) && eventTimeStamp > 0
    ? { at: eventTimeStamp, fromEvent: true }
    : { at: now, fromEvent: false }
}

/** Gaps between consecutive presses, ignoring the first one's empty delta. */
export function intervalStats(presses: readonly KeyPress[]): IntervalStats | null {
  const deltas = presses
    .map((press) => press.deltaMs)
    .filter((delta): delta is number => delta !== null)

  if (deltas.length === 0) {
    return null
  }

  const total = deltas.reduce((sum, delta) => sum + delta, 0)

  return {
    count: deltas.length,
    minMs: Math.min(...deltas),
    maxMs: Math.max(...deltas),
    meanMs: total / deltas.length,
    sameTick: deltas.filter((delta) => delta === 0).length,
  }
}

/**
 * The precision every interval in this app is shown and judged at: microseconds.
 *
 * It is one number on purpose. A gap displayed as `0.200 ms` must also count as
 * 0.200 ms when it is compared against a threshold the host typed, or the rule
 * contradicts the screen — which is exactly what happened when the display
 * rounded and the comparison did not.
 */
export const INTERVAL_DECIMALS = 3

/** An interval at the precision the interface works in. */
export function roundInterval(milliseconds: number): number {
  const factor = 10 ** INTERVAL_DECIMALS

  return Math.round(milliseconds * factor) / factor
}

/**
 * Seconds, milliseconds or microseconds, whichever keeps the figure readable.
 *
 * The microsecond case is not a flourish: two players hitting their keys at the
 * same instant is exactly what this measures, and such a gap would otherwise
 * round away to a flat `0.000 ms`.
 */
export function formatInterval(milliseconds: number): string {
  if (milliseconds >= 1000) {
    return `${(milliseconds / 1000).toFixed(3)} s`
  }

  if (milliseconds > 0 && milliseconds < 0.001) {
    return `${(milliseconds * 1000).toFixed(1)} µs`
  }

  return `${milliseconds.toFixed(INTERVAL_DECIMALS)} ms`
}

/**
 * The smallest step this page's clock actually reports.
 *
 * Read by spinning until the value changes, which is the only way to find the
 * browser's clamping — it is not exposed anywhere. `samples` runs are taken and
 * the smallest non-zero step wins.
 */
export function measureClockResolution(
  now: () => number = () => performance.now(),
  samples = 5,
): number {
  let smallest = Number.POSITIVE_INFINITY

  for (let sample = 0; sample < samples; sample += 1) {
    const start = now()
    let next = start
    // Spinning is the point: we are looking for the first value that differs.
    while (next === start) {
      next = now()
    }

    smallest = Math.min(smallest, next - start)
  }

  return Number.isFinite(smallest) ? smallest : 0
}
