// The settings a game runs under: their defaults, how a stored setup is made
// safe again, and how the setup screen's units become the game's.
//
// Kept apart from the setup hook so it stays free of React and can be checked
// on its own — it is the only thing standing between a stored file from an
// older version and a game that cannot start.

import {
  DEFAULT_ANSWER_SECONDS,
  DEFAULT_ROUND_SECONDS,
  DEFAULT_TARGET_MONEY,
  MAX_ANSWER_SECONDS,
  MAX_ROUND_SECONDS,
  MAX_TARGET_MONEY,
  MIN_ANSWER_SECONDS,
  MIN_PLAYERS,
  MIN_ROUND_SECONDS,
  MIN_TARGET_MONEY,
} from '@/constants/gameRules'
import { STORAGE_KEYS, readStoredJson } from '@/storage/localStorage'

import { DEFAULT_REWARD_MODE, isRewardMode } from './rewards'
import type { GameRules, GameSetup, PlayerDraft } from './types'

export function createPlayerDraft(): PlayerDraft {
  return { id: crypto.randomUUID(), name: '', keyCode: null }
}

export function createDefaultSetup(): GameSetup {
  return {
    players: Array.from({ length: MIN_PLAYERS }, createPlayerDraft),
    targetMoney: DEFAULT_TARGET_MONEY,
    roundSeconds: DEFAULT_ROUND_SECONDS,
    answerSeconds: DEFAULT_ANSWER_SECONDS,
    mode: DEFAULT_REWARD_MODE,
  }
}

function isPlayerDraft(value: unknown): value is PlayerDraft {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const draft = value as Partial<PlayerDraft>

  return (
    typeof draft.id === 'string' &&
    typeof draft.name === 'string' &&
    (draft.keyCode === null || typeof draft.keyCode === 'string')
  )
}

/** Keeps a stored number usable, whatever an older version wrote there. */
export function clampSetting(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback
}

/** Every field of a stored setup is checked; anything odd falls back. */
export function normaliseSetup(stored: unknown): GameSetup {
  const setup = stored as Partial<GameSetup> | null

  if (
    !setup ||
    !Array.isArray(setup.players) ||
    setup.players.length < MIN_PLAYERS ||
    !setup.players.every(isPlayerDraft)
  ) {
    return createDefaultSetup()
  }

  return {
    players: setup.players,
    targetMoney: clampSetting(
      setup.targetMoney,
      MIN_TARGET_MONEY,
      MAX_TARGET_MONEY,
      DEFAULT_TARGET_MONEY,
    ),
    roundSeconds: clampSetting(
      setup.roundSeconds,
      MIN_ROUND_SECONDS,
      MAX_ROUND_SECONDS,
      DEFAULT_ROUND_SECONDS,
    ),
    answerSeconds: clampSetting(
      setup.answerSeconds,
      MIN_ANSWER_SECONDS,
      MAX_ANSWER_SECONDS,
      DEFAULT_ANSWER_SECONDS,
    ),
    mode: isRewardMode(setup.mode) ? setup.mode : DEFAULT_REWARD_MODE,
  }
}

export function readStoredSetup(): GameSetup {
  return normaliseSetup(readStoredJson<unknown>(STORAGE_KEYS.gameSetup))
}

/**
 * The settings a game actually runs with, in the units the game uses.
 *
 * The tie threshold is passed in rather than read from the setup screen: it
 * lives in Settings, next to the keyboard probe that tells a host what their
 * hardware can resolve. Null switches ties off.
 */
export function toGameRules(setup: GameSetup, tieThresholdMs: number | null): GameRules {
  return {
    roundDurationMs: setup.roundSeconds * 1000,
    answerDurationMs: setup.answerSeconds * 1000,
    targetMoney: setup.targetMoney,
    mode: setup.mode,
    tieThresholdMs,
  }
}
