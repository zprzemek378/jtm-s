// Which sound plays at which moment — the one file to edit when adding sounds.
//
// HOW TO USE
// ----------
// 1. Drop your .mp3 files into `src/assets/sounds/`. Name them whatever you
//    like; nothing else needs to know about them.
// 2. List them below under the moment they belong to, with the chance of each
//    one being the one that plays.
//
// An entry of `SILENCE` is a chance that nothing plays at all, which is often
// what keeps a cue from wearing out its welcome over a long evening.
//
// The chances are relative, so they do not have to add up to exactly 1 — three
// entries of 0.3, 0.4 and 0.3 behave the same as 3, 4 and 3. Equal numbers mean
// an even draw, so a list of eight entries at 1 each is simply one in eight.
//
// A name that matches no file in the folder plays nothing, and the Settings
// screen lists it as missing, so a typo shows up rather than passing silently.
//
// Files beginning with `c-` are the stand-ins generated with the project, kept
// only where no real sound has been chosen yet.

/** Use in place of a file name for "nothing plays this time". */
export const SILENCE = null;

/** One possible outcome for a moment, and how likely it is. */
export type SoundChoice = {
  /** Relative likelihood. Read them as percentages if they add up to 1. */
  chance: number;
  /** A file in `src/assets/sounds`, with its extension, or `SILENCE`. */
  file: string | typeof SILENCE;
  /**
   * Whether this sound is cut off when its moment passes, rather than ringing
   * out over whatever comes next.
   *
   * Sounds play to the end by default. Set this where the sound belongs to a
   * moment that ends on its own: a countdown stops when the music starts, and
   * the results fanfare stops when the table leaves the results screen.
   */
  cutShort?: boolean;
  /**
   * Where in the file to start, in milliseconds. The default is the beginning.
   *
   * For a sound that takes a moment to get going — a breath before a word, a
   * rustle before the bell — so the part that matters lands on the action
   * instead of trailing it. `startAtMs: 300` drops the first 300 milliseconds
   * and begins there; everything before it is never heard.
   *
   * Past the end of the file, nothing plays at all.
   */
  startAtMs?: number;
};

/** Every moment in a game that can have a sound. */
export const SoundEvent = {
  /** The game begins — once, just after the playlists are confirmed. */
  GameStart: "game-start",
  RoundStart: "round-start",
  /** The whole 3–2–1 count-in, not each tick. */
  Countdown: "countdown",
  Buzz: "buzz",
  Tie: "tie",
  Correct: "correct",
  Incorrect: "incorrect",
  TimeUp: "time-up",
  GameOver: "game-over",
} as const;

export type SoundEvent = (typeof SoundEvent)[keyof typeof SoundEvent];

export const SOUND_EVENTS: readonly SoundEvent[] = Object.values(SoundEvent);

/** What can play at each moment. Equal chances mean an even draw. */
export const SOUND_CHOICES: Record<SoundEvent, readonly SoundChoice[]> = {
  [SoundEvent.GameStart]: [{ chance: 1, file: "among-us.mp3" }],

  // No sound chosen for this one yet — the stand-in is holding the place.
  [SoundEvent.RoundStart]: [{ chance: 1, file: "c-round-start.mp3" }],

  // One sound for the whole count-in, cut off the moment the music starts.
  [SoundEvent.Countdown]: [
    { chance: 1, file: "clock-ticking.mp3", cutShort: true },
    { chance: 1, file: "gta-sa-race.mp3", startAtMs: 80 },
    { chance: 1, file: "timer.mp3", cutShort: true },
  ],

  [SoundEvent.Buzz]: [{ chance: 1, file: "taco-bell.mp3", startAtMs: 200 }],

  // No sound chosen for this one yet either.
  [SoundEvent.Tie]: [{ chance: 1, file: "c-tie.mp3" }],

  [SoundEvent.Correct]: [
    { chance: 1, file: "anime-wow.mp3" },
    { chance: 1, file: "bell.mp3" },
    { chance: 1, file: "cash.mp3" },
    { chance: 1, file: "cash-register.mp3" },
    { chance: 1, file: "coin.mp3" },
    { chance: 1, file: "correct.mp3" },
    { chance: 1, file: "ding.mp3" },
    { chance: 1, file: "experience.mp3" },
    { chance: 1, file: "mario-coin.mp3" },
    { chance: 1, file: "party-horn.mp3" },
  ],

  [SoundEvent.Incorrect]: [
    { chance: 1, file: "demage.mp3" },
    { chance: 1, file: "gta-v-wasted.mp3" },
    { chance: 1, file: "incorrect.mp3" },
    { chance: 1, file: "nope.mp3" },
    { chance: 1, file: "ough.mp3" },
    { chance: 1, file: "sad-trombone.mp3" },
    { chance: 1, file: "windows-error.mp3" },
    { chance: 1, file: "wrong.mp3" },
  ],

  [SoundEvent.TimeUp]: [{ chance: 1, file: "dj-airhorn.mp3" }],

  // Ten seconds long, so it is cut when the table leaves the results.
  [SoundEvent.GameOver]: [{ chance: 1, file: "directed-by.mp3", cutShort: true }],
};
