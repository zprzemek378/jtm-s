// The extras a table can switch on before a game.
//
// None of them are on by default: a modifier changes what a round is, and that
// is a decision the room makes together rather than something it should find
// out about mid-song.

export const ModifierFrequency = {
  Rare: "rare",
  Medium: "medium",
  Often: "often",
} as const;

export type ModifierFrequency = (typeof ModifierFrequency)[keyof typeof ModifierFrequency];

export const MODIFIER_FREQUENCIES: readonly ModifierFrequency[] = [
  ModifierFrequency.Rare,
  ModifierFrequency.Medium,
  ModifierFrequency.Often,
];

/**
 * How often a round is drawn for the modifier, as a share of all rounds.
 *
 * "Often" stops well short of half: the surprise is the point, and a modifier
 * that turns up every other round stops being one.
 */
export const FREQUENCY_CHANCE: Record<ModifierFrequency, number> = {
  [ModifierFrequency.Rare]: 0.1,
  [ModifierFrequency.Medium]: 0.25,
  [ModifierFrequency.Often]: 0.4,
};

/** What the host switched on, with null meaning "not this game". */
export type GameModifiers = {
  /**
   * Now and then a round plays no music at all: the words appear a line at a
   * time instead, and the table has to name the song from them.
   */
  lyricsOnly: ModifierFrequency | null;
  /**
   * Extra time: the first of the lifelines, and the reason they are named for
   * what they do rather than called lifelines in the code. Every player gets
   * one for the game; spending it plays the music on for a few more seconds,
   * and for those seconds the round is theirs alone.
   */
  extraTime: boolean;
  /**
   * The second lifeline: six titles, one of them right. Picking one answers
   * the round there and then — nobody judges it, the choice does.
   */
  titles: boolean;
};

export const NO_MODIFIERS: GameModifiers = {
  lyricsOnly: null,
  extraTime: false,
  titles: false,
};

export function isModifierFrequency(value: unknown): value is ModifierFrequency {
  return MODIFIER_FREQUENCIES.includes(value as ModifierFrequency);
}

/** Every field checked, so a setup stored by an older version still starts. */
export function normaliseModifiers(stored: unknown): GameModifiers {
  const modifiers = stored as Partial<GameModifiers> | null;

  return {
    lyricsOnly: isModifierFrequency(modifiers?.lyricsOnly) ? modifiers.lyricsOnly : null,
    extraTime: modifiers?.extraTime === true,
    titles: modifiers?.titles === true,
  };
}
