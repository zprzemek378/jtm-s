// What a song is worth, and how that changes while it plays.
//
// The stake is money rather than a point, and in most modes it moves during the
// round: the longer the table hesitates, the more — or the less — is on the
// table. Everything here is a pure function of the round's elapsed time, so
// what a player sees on screen is exactly what they capture by buzzing.

/** How the stake behaves over a game. */
export const RewardMode = {
  /** Every song is worth the same. */
  Flat: 'flat',
  /** The stake climbs while the song plays. */
  Rising: 'rising',
  /** The stake falls while the song plays. */
  Falling: 'falling',
  /** Rising and falling rounds take turns, and the next one is announced. */
  Alternating: 'alternating',
  /** Rising or falling at random, revealed only once the music starts. */
  Random: 'random',
} as const

export type RewardMode = (typeof RewardMode)[keyof typeof RewardMode]

export const REWARD_MODES: readonly RewardMode[] = [
  RewardMode.Flat,
  RewardMode.Rising,
  RewardMode.Falling,
  RewardMode.Alternating,
  RewardMode.Random,
]

/**
 * What a first-time host gets. Alternating is the liveliest of the five: the
 * stake moves, and the table is told which way before each round, so there is
 * something to plan around without having to understand the modes first.
 */
export const DEFAULT_REWARD_MODE: RewardMode = RewardMode.Alternating

export function isRewardMode(value: unknown): value is RewardMode {
  return REWARD_MODES.includes(value as RewardMode)
}

/** Which way a single round's stake moves. */
export const RewardDirection = {
  Rising: 'rising',
  Falling: 'falling',
} as const

export type RewardDirection = (typeof RewardDirection)[keyof typeof RewardDirection]

export const MONEY_MIN = 100
export const MONEY_MAX = 200
export const MONEY_STEP = 10

/** 100, 110, … 200 — eleven values, so eleven equal slices of the round. */
export const MONEY_STEPS = (MONEY_MAX - MONEY_MIN) / MONEY_STEP + 1

/**
 * The direction of an upcoming round, when it can be known before it starts.
 *
 * Rounds are numbered from 1. `Flat` has no direction at all, and `Random`
 * genuinely has none yet — it is drawn when the round begins.
 */
export function plannedDirection(mode: RewardMode, roundNumber: number): RewardDirection | null {
  switch (mode) {
    case RewardMode.Rising:
      return RewardDirection.Rising
    case RewardMode.Falling:
      return RewardDirection.Falling
    case RewardMode.Alternating:
      // Odd rounds rise, even rounds fall, so the first round climbs.
      return roundNumber % 2 === 1 ? RewardDirection.Rising : RewardDirection.Falling
    default:
      return null
  }
}

/** The direction a round actually runs in, drawing one where the mode is random. */
export function drawDirection(
  mode: RewardMode,
  roundNumber: number,
  random: () => number = Math.random,
): RewardDirection | null {
  if (mode !== RewardMode.Random) {
    return plannedDirection(mode, roundNumber)
  }

  return random() < 0.5 ? RewardDirection.Rising : RewardDirection.Falling
}

/**
 * What the table may announce about the round to come.
 *
 * Only the alternating mode has something worth saying: the constant modes are
 * obvious and the random one is deliberately a surprise.
 */
export function upcomingDirectionHint(
  mode: RewardMode,
  nextRoundNumber: number,
): RewardDirection | null {
  return mode === RewardMode.Alternating ? plannedDirection(mode, nextRoundNumber) : null
}

/**
 * The stake at a given point in the round.
 *
 * The round is cut into as many equal slices as there are values, so each value
 * is on the table for exactly the same length of time however long the round
 * is: eleven seconds gives a step a second, ten seconds gives each step
 * ten-elevenths of one.
 */
export function moneyAt(
  direction: RewardDirection | null,
  elapsedMs: number,
  roundDurationMs: number,
): number {
  if (direction === null) {
    return MONEY_MIN
  }

  if (!Number.isFinite(roundDurationMs) || roundDurationMs <= 0) {
    return direction === RewardDirection.Rising ? MONEY_MIN : MONEY_MAX
  }

  // Multiplied before dividing, so whole milliseconds — the only values the
  // game ever measures — land on the right side of a slice boundary even when
  // the boundary itself is an endless fraction, as 15 s / 11 is.
  const slice = Math.min(
    MONEY_STEPS - 1,
    Math.max(0, Math.floor((elapsedMs * MONEY_STEPS) / roundDurationMs)),
  )

  return direction === RewardDirection.Rising
    ? MONEY_MIN + slice * MONEY_STEP
    : MONEY_MAX - slice * MONEY_STEP
}

/** Dollars, grouped the way dollars are, whatever the interface language. */
export function formatMoney(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`
}
