// Presentation data for the player slots. A colour is suggested for each new
// slot and can be changed to anything from there — the buzzer keys are always
// chosen by the players themselves, so nothing is pre-filled for them.

/**
 * The suggested colours, spread around the colour wheel, one per slot.
 *
 * Every surface mixes a player's colour into the theme's own surface rather
 * than painting with it directly, which is what keeps a card readable in both
 * themes whatever colour ends up chosen.
 */
export const PLAYER_COLOURS: readonly string[] = [
  "#22c365",
  "#2273c3",
  "#c36322",
  "#8e22c3",
  "#c32222",
  "#22a8c3",
  "#c3a822",
  "#c3228e",
  "#58c322",
  "#2222c3",
  "#c3223d",
  "#22c39b",
];

const HEX_COLOUR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc` and `#aabbcc` are the same colour; the long form is what is stored. */
function expand(hex: string): string {
  const value = hex.slice(1);

  return value.length === 3
    ? `#${value
        .split("")
        .map((digit) => digit + digit)
        .join("")}`.toLowerCase()
    : `#${value.toLowerCase()}`;
}

/**
 * Whatever is in a stored line-up, as a colour this app can paint with.
 *
 * Colours used to be a hue in degrees, so a number is read as one and turned
 * into the colour it always drew. Anything else gives null, and the caller
 * falls back to the suggestion for that slot.
 */
export function normaliseColour(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return hueToColour(value);
  }

  if (typeof value !== "string" || !HEX_COLOUR.test(value.trim())) {
    return null;
  }

  return expand(value.trim());
}

/** The colour an old stored hue drew: `hsl(h 70% 45%)`. */
function hueToColour(degrees: number): string {
  const hue = ((Math.round(degrees) % 360) + 360) % 360;
  const chroma = 0.7 * (1 - Math.abs(2 * 0.45 - 1));
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = 0.45 - chroma / 2;
  const sector = Math.floor(hue / 60) % 6;
  const [red, green, blue] = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ][sector];

  const channel = (value: number) =>
    Math.round((value + match) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

/**
 * How far each colour past the suggestions is spun around the wheel.
 *
 * The golden angle: turning by it repeatedly never lands twice in the same
 * place and never settles into a pattern, so any number of colours comes out
 * spread rather than clustered.
 */
const GOLDEN_ANGLE = 137.508;

export function playerColour(index: number): string {
  return PLAYER_COLOURS[index] ?? hueToColour(index * GOLDEN_ANGLE);
}

/**
 * A colour for a new player: the first one nobody has taken, so a table of any
 * size ends up with distinct colours without anyone choosing them.
 */
export function nextFreeColour(taken: readonly string[]): string {
  // Bounded by how many have been handed out, plus the suggestions, plus one:
  // past that there is certainly one free, since each index gives its own.
  for (let index = 0; index <= taken.length + PLAYER_COLOURS.length; index += 1) {
    const colour = playerColour(index);

    if (!taken.includes(colour)) {
      return colour;
    }
  }

  return playerColour(taken.length);
}
