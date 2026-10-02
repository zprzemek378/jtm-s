// Pure rules for the setup screen: what a valid line-up looks like and what is
// still missing from one.

import { MAX_PLAYERS, MIN_PLAYERS } from '@/constants/gameRules'
import { isReservedKeyCode } from '@/helpers/keys'
import type { GamePlayer, PlayerDraft } from '@/game/types'

export const SetupProblem = {
  TooFewPlayers: 'too-few-players',
  MissingKeys: 'missing-keys',
  DuplicateNames: 'duplicate-names',
  /** A key that the interface has claimed since it was assigned. */
  ReservedKeys: 'reserved-keys',
} as const

export type SetupProblem = (typeof SetupProblem)[keyof typeof SetupProblem]

export function canAddPlayer(players: readonly PlayerDraft[]): boolean {
  return players.length < MAX_PLAYERS
}

export function canRemovePlayer(players: readonly PlayerDraft[]): boolean {
  return players.length > MIN_PLAYERS
}

/** The player already using `keyCode`, ignoring the slot being edited. */
export function findKeyOwner(
  players: readonly PlayerDraft[],
  keyCode: string,
  exceptId?: string,
): PlayerDraft | null {
  return players.find((player) => player.keyCode === keyCode && player.id !== exceptId) ?? null
}

export function isAssignableKeyCode(keyCode: string): boolean {
  return !isReservedKeyCode(keyCode)
}

function displayName(player: PlayerDraft, index: number, fallback: (index: number) => string) {
  const trimmed = player.name.trim()

  return trimmed.length > 0 ? trimmed : fallback(index)
}

/** Everything that stops this line-up from starting a game. */
export function findSetupProblems(
  players: readonly PlayerDraft[],
  fallbackName: (index: number) => string,
): readonly SetupProblem[] {
  const problems: SetupProblem[] = []

  if (players.length < MIN_PLAYERS) {
    problems.push(SetupProblem.TooFewPlayers)
  }

  if (players.some((player) => player.keyCode === null)) {
    problems.push(SetupProblem.MissingKeys)
  }

  // A line-up saved earlier can hold a key that is reserved now; it has to be
  // picked again rather than quietly firing the host's controls mid-round.
  if (players.some((player) => player.keyCode !== null && !isAssignableKeyCode(player.keyCode))) {
    problems.push(SetupProblem.ReservedKeys)
  }

  const names = players.map((player, index) => displayName(player, index, fallbackName))

  if (new Set(names).size !== names.length) {
    problems.push(SetupProblem.DuplicateNames)
  }

  return problems
}

/**
 * Turns drafts into the players a game runs with — every one named and holding
 * a key. Returns null when the line-up is not ready, so the caller cannot
 * start a game from an invalid setup.
 */
export function toGamePlayers(
  players: readonly PlayerDraft[],
  fallbackName: (index: number) => string,
): readonly GamePlayer[] | null {
  if (findSetupProblems(players, fallbackName).length > 0) {
    return null
  }

  return players.map((player, index) => ({
    id: player.id,
    name: displayName(player, index, fallbackName),
    keyCode: player.keyCode as string,
    hueIndex: index,
  }))
}
