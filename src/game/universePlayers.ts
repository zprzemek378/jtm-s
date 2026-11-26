// Turning a universe's people into a game's players, and back.
//
// A universe player keeps their number for ever, so the number is their
// identity in a game too: the same person is the same person across every
// evening, whatever they have been renamed to since and wherever they were
// sitting.

import type { UniversePlayer } from "@jtm-s/shared";

/** A universe player's id inside a game, which is stable because the number is. */
export function universePlayerId(player: Pick<UniversePlayer, "number">): string {
  return `u${player.number}`;
}

/**
 * Which universe player this game player is, or null for somebody who was
 * simply typed in on the setup screen.
 */
export function universeNumberOf(playerId: string): number | null {
  const match = /^u(\d+)$/.exec(playerId);

  return match?.[1] === undefined ? null : Number(match[1]);
}
