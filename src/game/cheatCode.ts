// The hidden way into edit mode.
//
// Typed rather than clicked, so nothing on screen gives it away. It is only
// listened for while the game is waiting on the host — the timed-out and
// verdict screens — which is also why its letters need no protection from the
// players: their buzzers are dead in exactly those moments.

/** Typed on the "next round" screens. A nod to where the idea comes from. */
export const EDIT_MODE_CODE = 'AEZAKMI'

export type CheatProgress = {
  /** How many letters of the code have been matched so far. */
  matched: number
  /** True on the keystroke that completes it. */
  unlocked: boolean
}

/**
 * Advances the match by one keystroke, case-insensitively.
 *
 * A wrong letter resets the run — except when it is the code's own first
 * letter, which starts a fresh attempt, so `AAEZAKMI` still works. Anything
 * that is not a single character (Shift, Enter, arrows) leaves the run alone
 * rather than breaking it.
 */
export function advanceCheat(
  matched: number,
  key: string,
  code: string = EDIT_MODE_CODE,
): CheatProgress {
  if (key.length !== 1) {
    return { matched, unlocked: false }
  }

  const typed = key.toUpperCase()

  if (typed === code[matched]?.toUpperCase()) {
    const next = matched + 1

    return next >= code.length ? { matched: 0, unlocked: true } : { matched: next, unlocked: false }
  }

  return { matched: typed === code[0]?.toUpperCase() ? 1 : 0, unlocked: false }
}
