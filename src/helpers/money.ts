import type { GamePlayer, PlayerId } from "@/game/types";

/** What each player has banked. */
export type Accounts = Record<PlayerId, number>;

export function createAccounts(players: readonly GamePlayer[]): Accounts {
  return Object.fromEntries(players.map((player) => [player.id, 0]));
}

export function balanceOf(accounts: Accounts, playerId: PlayerId): number {
  return accounts[playerId] ?? 0;
}

/** Players ordered for the scoreboard: richest first, then by their slot order. */
export function rankPlayers(
  players: readonly GamePlayer[],
  accounts: Accounts,
): readonly GamePlayer[] {
  return [...players].sort((left, right) => {
    const difference = balanceOf(accounts, right.id) - balanceOf(accounts, left.id);

    return difference !== 0 ? difference : players.indexOf(left) - players.indexOf(right);
  });
}
