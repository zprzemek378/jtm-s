import type { RewardMode } from './rewards'

export type PlayerId = string

/** A player slot while it is still being edited on the setup screen. */
export type PlayerDraft = {
  id: PlayerId
  name: string
  /** `KeyboardEvent.code`, or null while the player has not picked a key. */
  keyCode: string | null
}

/** A player a game actually runs with: named, and holding a key. */
export type GamePlayer = {
  id: PlayerId
  name: string
  keyCode: string
  /** Slot index, used to pick the avatar colour. */
  hueIndex: number
}

/** The settings a game runs under, fixed once it starts. */
export type GameRules = {
  /** How long a snippet plays before the round times out. */
  roundDurationMs: number
  /** The informational clock a buzzing player gets. */
  answerDurationMs: number
  /** The bank balance that wins the game. */
  targetMoney: number
  mode: RewardMode
  /**
   * How close two presses must be to count as simultaneous, in milliseconds.
   * Null switches ties off, and the first press simply wins.
   */
  tieThresholdMs: number | null
}

/** What the setup screen stores between games. */
export type GameSetup = {
  players: PlayerDraft[]
  targetMoney: number
  roundSeconds: number
  answerSeconds: number
  mode: RewardMode
}

/**
 * Where a round is:
 * - `idle` — the game is set up but no round has started yet.
 * - `listening` — the snippet is playing and the guessing window is running.
 * - `buzzed` — somebody pressed their key; music is paused, answer clock runs.
 * - `revealed` — the answer is on screen, music resumed, waiting to be judged.
 * - `timedOut` — nobody buzzed; the title is on screen, waiting for the host.
 * - `judged` — the answer has been marked; the title is on screen, the track
 *   plays on, and the host decides when to move the game along.
 * - `tied` — two or more pressed together; nobody answers, and the round to
 *   come is a run-off between them.
 * - `finished` — somebody reached the target score.
 */
export const GamePhase = {
  Idle: 'idle',
  Listening: 'listening',
  Buzzed: 'buzzed',
  Revealed: 'revealed',
  TimedOut: 'timed-out',
  Judged: 'judged',
  Tied: 'tied',
  Finished: 'finished',
} as const

export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase]

/**
 * How the table marked an answer.
 *
 * `Close` exists for the answer that was nearly right — one word off in the
 * title, say. It earns nothing, but the table waives the round's ban, which is
 * otherwise automatic for a wrong answer.
 */
export const Verdict = {
  Correct: 'correct',
  Incorrect: 'incorrect',
  Close: 'close',
} as const

export type Verdict = (typeof Verdict)[keyof typeof Verdict]

/** Why somebody is sitting a round out — the screen says which. */
export const SuspensionReason = {
  WrongAnswer: 'wrong-answer',
  /** The round is a run-off between the players who tied, so the rest wait. */
  TieRunOff: 'tie-run-off',
  /** Set by hand in edit mode. */
  Manual: 'manual',
} as const

export type SuspensionReason = (typeof SuspensionReason)[keyof typeof SuspensionReason]

/** Who is sitting out, and why. */
export type Suspension = {
  playerIds: readonly PlayerId[]
  reason: SuspensionReason
}
