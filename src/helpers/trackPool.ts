// Drawing tracks without repeats: the pool holds what has not been played yet
// and refills itself from the full list once it runs dry.

export type Draw<T> = {
  item: T;
  /** What is left after this draw — already refilled if the pool was empty. */
  remaining: T[];
};

export function createPool<T>(all: readonly T[]): T[] {
  return [...all];
}

/**
 * Takes one random item out of `pool`. When the pool is empty it starts over
 * from `all`, so a short playlist keeps working for a long game.
 *
 * Returns null only when there is nothing to draw at all.
 */
export function drawFromPool<T>(
  pool: readonly T[],
  all: readonly T[],
  random: () => number = Math.random,
): Draw<T> | null {
  const source = pool.length > 0 ? pool : all;

  if (source.length === 0) {
    return null;
  }

  const index = Math.min(source.length - 1, Math.floor(random() * source.length));
  const item = source[index] as T;
  const remaining = [...source.slice(0, index), ...source.slice(index + 1)];

  return { item, remaining };
}
