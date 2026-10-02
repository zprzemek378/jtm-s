// Every tunable rule of the game in one place. These are the "hardcoded data"
// the app would otherwise fetch from a backend it does not have.

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 8

/** The sum a game is played to. Stepped in hundreds, like the stakes. */
export const MIN_TARGET_MONEY = 100
export const MAX_TARGET_MONEY = 10_000
export const DEFAULT_TARGET_MONEY = 1000
export const TARGET_MONEY_STEP = 100

/** How long a snippet plays. The default is what the game used to hardcode. */
export const MIN_ROUND_SECONDS = 3
export const MAX_ROUND_SECONDS = 60
export const DEFAULT_ROUND_SECONDS = 15

/** The informational clock a buzzing player gets. */
export const MIN_ANSWER_SECONDS = 5
export const MAX_ANSWER_SECONDS = 120
export const DEFAULT_ANSWER_SECONDS = 25

/**
 * The "get ready" countdown the host starts a round with. Long enough for the
 * table to stop talking and put fingers on keys, short enough not to drag.
 */
export const PRE_ROLL_MS = 3000

/** The snippet never starts inside the intro… */
export const SNIPPET_SKIP_START_MS = 20_000

/** …nor inside the outro. */
export const SNIPPET_SKIP_END_MS = 30_000

/**
 * A track has to be long enough to hold the excluded intro, the excluded outro
 * and the whole guessing window in between.
 */
export const MIN_TRACK_DURATION_MS =
  SNIPPET_SKIP_START_MS + SNIPPET_SKIP_END_MS + DEFAULT_ROUND_SECONDS * 1000

/**
 * How long presses are gathered before deciding who buzzed.
 *
 * The tie threshold itself is a fraction of a millisecond, which no timer can
 * wait for — so this is not the threshold. It is only long enough for a second
 * genuinely simultaneous press to arrive: an ordinary USB keyboard reports on
 * an 8 ms grid, so a window just past that catches the pair. The cost is that a
 * buzz stops the music this many milliseconds later, which nobody can hear.
 *
 * Every further press restarts the window, because a tie chains from one press
 * to the next — so the window has to stay open as long as the chain might grow.
 */
export const BUZZ_COLLECTION_MS = 12

/**
 * The longest a burst may stay open however many presses keep arriving.
 *
 * Without it, somebody leaning on a key could hold the round open indefinitely,
 * since each press extends the window.
 */
export const BUZZ_COLLECTION_MAX_MS = 1500

/** Bounds for the tie threshold the host types in, in milliseconds. */
export const MIN_TIE_THRESHOLD_MS = 0
export const MAX_TIE_THRESHOLD_MS = 500
export const DEFAULT_TIE_THRESHOLD_MS = 0.2
