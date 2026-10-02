/** Whole seconds left, never negative — what a countdown should display. */
export function msToWholeSeconds(milliseconds: number): number {
  return Math.max(0, Math.ceil(milliseconds / 1000));
}

/** `m:ss`, for track lengths and playback positions. */
export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Joins artist names the way Spotify shows them. */
export function formatArtists(names: readonly string[]): string {
  return names.join(", ");
}

/**
 * The share of the pool a single track takes, as a percentage with at most two
 * decimals and no trailing zeros — 200 tracks reads as `0.5`, not `0.50`.
 */
export function formatSharePercent(poolSize: number): string {
  if (poolSize <= 0) {
    return "0";
  }

  return (100 / poolSize)
    .toFixed(2)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}
