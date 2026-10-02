// The line-up and rules the host edits, kept in localStorage so the same group
// does not have to re-enter their names, keys and settings before every game.

import { useCallback, useEffect, useState } from 'react'

import { STORAGE_KEYS, writeStoredJson } from '@/storage/localStorage'

import { createPlayerDraft, readStoredSetup } from './rules'
import type { RewardMode } from './rewards'
import type { GameSetup, PlayerDraft } from './types'

export type GameSetupControls = {
  players: readonly PlayerDraft[]
  targetMoney: number
  roundSeconds: number
  answerSeconds: number
  mode: RewardMode
  setTargetMoney: (value: number) => void
  setRoundSeconds: (value: number) => void
  setAnswerSeconds: (value: number) => void
  setMode: (mode: RewardMode) => void
  rename: (id: string, name: string) => void
  assignKey: (id: string, keyCode: string) => void
  addPlayer: () => void
  removePlayer: (id: string) => void
  /** The whole stored setup, for turning into the rules a game runs with. */
  setup: GameSetup
}

export function useGameSetup(): GameSetupControls {
  const [setup, setSetup] = useState<GameSetup>(readStoredSetup)

  useEffect(() => {
    writeStoredJson(STORAGE_KEYS.gameSetup, setup)
  }, [setup])

  const rename = useCallback((id: string, name: string) => {
    setSetup((current) => ({
      ...current,
      players: current.players.map((player) => (player.id === id ? { ...player, name } : player)),
    }))
  }, [])

  const assignKey = useCallback((id: string, keyCode: string) => {
    setSetup((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.id === id ? { ...player, keyCode } : player,
      ),
    }))
  }, [])

  const addPlayer = useCallback(() => {
    setSetup((current) => ({ ...current, players: [...current.players, createPlayerDraft()] }))
  }, [])

  const removePlayer = useCallback((id: string) => {
    setSetup((current) => ({
      ...current,
      players: current.players.filter((player) => player.id !== id),
    }))
  }, [])

  const setTargetMoney = useCallback((targetMoney: number) => {
    setSetup((current) => ({ ...current, targetMoney }))
  }, [])

  const setRoundSeconds = useCallback((roundSeconds: number) => {
    setSetup((current) => ({ ...current, roundSeconds }))
  }, [])

  const setAnswerSeconds = useCallback((answerSeconds: number) => {
    setSetup((current) => ({ ...current, answerSeconds }))
  }, [])

  const setMode = useCallback((mode: RewardMode) => {
    setSetup((current) => ({ ...current, mode }))
  }, [])

  return {
    players: setup.players,
    targetMoney: setup.targetMoney,
    roundSeconds: setup.roundSeconds,
    answerSeconds: setup.answerSeconds,
    mode: setup.mode,
    setTargetMoney,
    setRoundSeconds,
    setAnswerSeconds,
    setMode,
    rename,
    assignKey,
    addPlayer,
    removePlayer,
    setup,
  }
}
