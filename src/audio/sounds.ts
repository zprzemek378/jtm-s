// Choosing which sound plays, and finding the file for it.
//
// The weighting lives in `SOUND_CHOICES`, which is meant to be edited by hand;
// everything here is the machinery that reads it.

import { SOUND_CHOICES, type SoundChoice, type SoundEvent } from "@/constants/soundChoices";

import { fileUrl } from "./soundFiles";

/**
 * Draws one outcome from a weighted list.
 *
 * The chances are treated as relative weights and normalised, so a list that
 * adds up to 0.9 or to 7 behaves sensibly — nobody editing a config by hand
 * should have to make the numbers come out exactly right. A negative weight
 * counts as zero.
 *
 * Returns null when there is nothing to choose from, which is silence.
 */
export function pickChoice(
  choices: readonly SoundChoice[],
  random: () => number = Math.random,
): SoundChoice | null {
  const total = choices.reduce((sum, choice) => sum + Math.max(0, choice.chance), 0);

  if (total <= 0) {
    return null;
  }

  let roll = random() * total;

  for (const choice of choices) {
    roll -= Math.max(0, choice.chance);

    if (roll < 0) {
      return choice;
    }
  }

  // Only reachable through floating-point drift at the very top of the range.
  return choices[choices.length - 1] ?? null;
}

/**
 * The file to play for a moment, or null for silence.
 *
 * Silence is the honest answer in three different cases — the draw landed on a
 * `SILENCE` entry, the moment has no sounds configured, or the chosen name
 * matches no file. The last of those is a typo, and the Settings screen lists
 * it as missing rather than letting it pass unnoticed.
 */
export function pickSoundUrl(event: SoundEvent, random: () => number = Math.random): string | null {
  const choice = pickChoice(SOUND_CHOICES[event] ?? [], random);

  return choice?.file ? fileUrl(choice.file) : null;
}
