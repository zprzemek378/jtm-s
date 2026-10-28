// The line-up and rules the host edits, kept in localStorage so the same group
// does not have to re-enter their names, keys and settings before every game.

import { useCallback, useEffect, useState } from "react";

import { moveItem } from "@/helpers/list";
import { STORAGE_KEYS, writeStoredJson } from "@/storage/localStorage";

import { createPlayerDraft, readStoredSetup } from "./rules";
import type { RewardMode } from "./rewards";
import type { GameModifiers } from "./modifiers";
import type { GamePlayer, GameSetup, PlayerDraft } from "./types";

export type GameSetupControls = {
  players: readonly PlayerDraft[];
  targetMoney: number;
  roundSeconds: number;
  answerSeconds: number;
  mode: RewardMode;
  modifiers: GameModifiers;
  setTargetMoney: (value: number) => void;
  setRoundSeconds: (value: number) => void;
  setAnswerSeconds: (value: number) => void;
  setMode: (mode: RewardMode) => void;
  setModifiers: (modifiers: GameModifiers) => void;
  rename: (id: string, name: string) => void;
  assignKey: (id: string, keyCode: string) => void;
  setColour: (id: string, colour: string) => void;
  /** Moves a player to another place in the line-up, which is the seating. */
  movePlayer: (from: number, to: number) => void;
  /** Takes the names, colours and order a running game's edit mode settled on. */
  applyLineUp: (players: readonly GamePlayer[]) => void;
  addPlayer: () => void;
  removePlayer: (id: string) => void;
  /** The whole stored setup, for turning into the rules a game runs with. */
  setup: GameSetup;
};

export function useGameSetup(): GameSetupControls {
  const [setup, setSetup] = useState<GameSetup>(readStoredSetup);

  useEffect(() => {
    writeStoredJson(STORAGE_KEYS.gameSetup, setup);
  }, [setup]);

  const rename = useCallback((id: string, name: string) => {
    setSetup((current) => ({
      ...current,
      players: current.players.map((player) => (player.id === id ? { ...player, name } : player)),
    }));
  }, []);

  const assignKey = useCallback((id: string, keyCode: string) => {
    setSetup((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.id === id ? { ...player, keyCode } : player,
      ),
    }));
  }, []);

  const setColour = useCallback((id: string, colour: string) => {
    setSetup((current) => ({
      ...current,
      players: current.players.map((player) => (player.id === id ? { ...player, colour } : player)),
    }));
  }, []);

  const movePlayer = useCallback((from: number, to: number) => {
    setSetup((current) => ({
      ...current,
      players: [...moveItem(current.players, from, to)],
    }));
  }, []);

  const applyLineUp = useCallback((players: readonly GamePlayer[]) => {
    setSetup((current) => {
      const drafts = players.map((player) => {
        const draft = current.players.find((candidate) => candidate.id === player.id);

        // The key stays with the draft: edit mode never touches it, and a
        // line-up that does not line up with this one is not this one's.
        return draft ? { ...draft, name: player.name, colour: player.colour } : null;
      });

      if (drafts.length !== current.players.length || drafts.some((draft) => draft === null)) {
        return current;
      }

      return { ...current, players: drafts as PlayerDraft[] };
    });
  }, []);

  const addPlayer = useCallback(() => {
    setSetup((current) => ({
      ...current,
      players: [
        ...current.players,
        createPlayerDraft(current.players.map((player) => player.colour)),
      ],
    }));
  }, []);

  const removePlayer = useCallback((id: string) => {
    setSetup((current) => ({
      ...current,
      players: current.players.filter((player) => player.id !== id),
    }));
  }, []);

  const setTargetMoney = useCallback((targetMoney: number) => {
    setSetup((current) => ({ ...current, targetMoney }));
  }, []);

  const setRoundSeconds = useCallback((roundSeconds: number) => {
    setSetup((current) => ({ ...current, roundSeconds }));
  }, []);

  const setAnswerSeconds = useCallback((answerSeconds: number) => {
    setSetup((current) => ({ ...current, answerSeconds }));
  }, []);

  const setMode = useCallback((mode: RewardMode) => {
    setSetup((current) => ({ ...current, mode }));
  }, []);

  const setModifiers = useCallback((modifiers: GameModifiers) => {
    setSetup((current) => ({ ...current, modifiers }));
  }, []);

  return {
    players: setup.players,
    targetMoney: setup.targetMoney,
    roundSeconds: setup.roundSeconds,
    answerSeconds: setup.answerSeconds,
    mode: setup.mode,
    modifiers: setup.modifiers,
    setTargetMoney,
    setRoundSeconds,
    setAnswerSeconds,
    setMode,
    setModifiers,
    rename,
    assignKey,
    setColour,
    movePlayer,
    applyLineUp,
    addPlayer,
    removePlayer,
    setup,
  };
}
