// Presentation data for the player slots. The avatar colour is the only thing
// assigned automatically — the buzzer keys are always chosen by the players
// themselves, so nothing is pre-filled for them.

/**
 * One hue per slot, spread around the colour wheel. The avatar renders it
 * through `color-mix()` so it stays readable in both themes.
 */
export const PLAYER_HUES: readonly number[] = [145, 210, 24, 280, 0, 190, 50, 320]

export function playerHue(index: number): number {
  return PLAYER_HUES[index % PLAYER_HUES.length] ?? 0
}
