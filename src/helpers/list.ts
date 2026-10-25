/**
 * Moves one item of a list to another position, leaving the rest in order.
 *
 * Out-of-range positions give the list back untouched, so a drop that landed
 * nowhere — or a stale index from a list that changed mid-drag — cannot shuffle
 * anything by accident.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): readonly T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);

  return next;
}

/**
 * Where a dragged item ends up once it has been taken out of the list.
 *
 * `gap` counts the spaces between items, 0 above the first and the list's
 * length below the last — which is what a pointer is really aiming at. Removing
 * the item first shifts everything below it up by one, so an item travelling
 * down the list lands one place earlier than the gap it was aimed at.
 */
export function landingIndex(from: number, gap: number): number {
  return from < gap ? gap - 1 : gap;
}
